#!/usr/bin/env python3
"""Assist a running macOS VM from its current screen; never replay a saved setup script."""
import argparse
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time


def normalized(text):
    return " ".join(text.replace("’", "'").replace("&", "and").split()).casefold()


class Handoff(Exception):
    """Preserve the VM and ask the user to complete an unsafe or unrecognized step."""


class Screen:
    def __init__(self, document):
        self.width = document["screen"]["width"]
        self.height = document["screen"]["height"]
        self.tokens = document.get("text", [])
        self.locked = document.get("locked", False)
        self.text = normalized(" ".join(t["text"] for t in self.tokens))
        # Menu clocks, animations and OCR coordinates are not evidence of a transition.
        self.signature = tuple(sorted(normalized(t["text"]) for t in self.tokens
                                      if t["y"] > 28 and t["text"].strip()))

    def has(self, *phrases):
        return any(normalized(phrase) in self.text for phrase in phrases)

    def find(self, *labels):
        for label in labels:
            matches = [t for t in self.tokens if normalized(t["text"]) == normalized(label)]
            if len(matches) > 1:
                raise Handoff(f"More than one '{label}' control is visible; choose it in the VM window.")
            if matches:
                return matches[0]
        return None

    def values(self, label):
        right = label["x"] + label["width"] / 2
        return [t for t in self.tokens if t is not label and t["x"] > right + 8
                and abs(t["y"] - label["y"]) <= max(6, label["height"] / 2)]

    def desktop(self):
        menu = {normalized(t["text"]) for t in self.tokens if 0 <= t["y"] <= 28}
        return "finder" in menu and len(menu & {"file", "edit", "view", "go", "window"}) >= 4

    def sensitive(self):
        return self.locked or self.has("password", "passcode", "apple account", "apple id", "sign in", "verification") or "@" in self.text


def pane(screen):
    """Specific English setup headings, ordered ahead of broader optional-pane text."""
    if screen.has("creating account", "creating your account"):
        return "creating-account"
    if screen.has("create a computer account", "create your computer account"):
        return "account"
    if screen.has("terms and conditions", "software license agreement"):
        return "license"
    if screen.has("apple account", "apple id") and screen.has("sign in", "sign-in", "skip"):
        return "apple-account"
    if screen.has("age range", "select your age", "your age") and screen.find("Adult", "18 or older"):
        return "age"
    headings = (
        ("time-zone", ("time zone", "closest city")),
        ("location", ("location services",)),
        ("screen-time", ("screen time",)),
        ("analytics", ("share mac analytics", "share with app developers", "analytics")),
        ("filevault", ("filevault",)),
        ("updates", ("keep your mac up to date", "only download automatically")),
        ("transfer", ("transfer your data", "transfer information to this mac", "migration assistant")),
        ("country", ("select your country or region", "country or region")),
        ("spoken-languages", ("written and spoken languages",)),
        ("language", ("choose your language", "select your language")),
        ("accessibility", ("accessibility",)),
        ("siri", ("enable ask siri", "set up siri",)),
        ("privacy", ("data and privacy",)),
        ("appearance", ("choose your look", "appearance",)),
        ("finish", ("get started", "you're all set",)),
        ("welcome", ("welcome to your new mac", "welcome to your mac", "hello",)),
    )
    for name, titles in headings:
        if screen.has(*titles):
            return name
    if screen.locked:
        return "sign-in"
    return "blank" if not screen.tokens else "unknown"


class Setup:
    def __init__(self, args, command):
        self.vm, self.user, self.command = args.vm, args.user, command
        self.output = Path(args.output_dir)
        self.password = os.environ.get("VM_SETUP_PASSWORD", "")
        self.settings = {name: os.environ.get("VM_SETUP_" + name.upper(), "")
                         for name in ("language", "country", "timezone", "age")}
        self.accept_license = self.flag("VM_SETUP_ACCEPT_LICENSE", False)
        self.skip_optional = self.flag("VM_SETUP_SKIP_OPTIONAL", True)
        timeout = float(os.environ.get("VM_SETUP_TIMEOUT", "600"))
        if not math.isfinite(timeout) or timeout <= 0:
            raise ValueError("VM_SETUP_TIMEOUT must be a positive number of seconds")
        if any("\n" in value or "\r" in value for value in [self.user, self.password, *self.settings.values()]):
            raise ValueError("Setup input must not contain newlines (VMPal types them as Return)")
        self.deadline = time.monotonic() + timeout
        self.seen = set()
        self.screen, self.current_pane = None, "not observed"
        self.log = []
        self.environment = dict(os.environ)
        self.environment.pop("VM_SETUP_PASSWORD", None)
        self.environment.pop("VM_PASSWORD", None)

    @staticmethod
    def flag(name, default):
        value = os.environ.get(name, "1" if default else "0").casefold()
        if value not in ("0", "1", "off", "on", "false", "true"):
            raise ValueError(f"{name} must be 0 or 1")
        return value in ("1", "on", "true")

    def redact(self, text):
        return text.replace(self.password, "[redacted]") if self.password else text

    def note(self, message):
        message = self.redact(message)
        print(f"[vmpal-setup] {message}", flush=True)
        self.log.append(message)

    def call(self, *arguments, document=False):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise Handoff("Setup observation deadline reached. Complete the current screen in the VM window.")
        try:
            result = subprocess.run([*self.command, *arguments], env=self.environment,
                                    capture_output=True, text=True, timeout=min(45, remaining))
        except (OSError, subprocess.TimeoutExpired) as error:
            raise Handoff(f"VMPal could not complete {arguments[0]}; inspect the VM window before resuming.") from error
        if result.returncode:
            # Never print CLI output: an observation or failed input could include credentials.
            raise Handoff(f"VMPal {arguments[0]} failed (exit {result.returncode}); inspect the VM before resuming.")
        if document:
            value = json.loads(result.stdout)
            if not isinstance(value, dict) or value.get("isError") or value.get("error"):
                raise Handoff("VMPal returned an unusable screen/status response.")
            return value
        return None

    def observe(self):
        self.screen = Screen(self.call("ui", self.vm, "observe", "--text", "--json", document=True))
        self.current_pane = pane(self.screen)
        return self.screen

    def once(self, intent):
        identity = (self.current_pane, intent)
        if identity in self.seen:
            raise Handoff("The same setup action did not advance the screen; complete it manually rather than repeat input.")
        self.seen.add(identity)

    def click(self, *labels, intent=None):
        target = self.screen.find(*labels)
        if target is None:
            raise Handoff(f"No readable '{labels[0]}' control; complete this screen in the VM window.")
        self.once(intent or normalized(target["text"]))
        self.call("ui", self.vm, "click", "--text", target["text"], "--near",
                  f'{target["x"]},{target["y"]}', "--lock-screen", "--timeout", "30s")

    def key(self, key, intent):
        self.once(intent)
        self.call("ui", self.vm, "key", key, "--lock-screen", "--timeout", "30s")

    def type_file(self, text):
        # Names, city choices and passwords all use files: no sensitive input in process arguments.
        with tempfile.TemporaryDirectory(prefix="vmpal-setup-input-") as directory:
            path = Path(directory) / "input"
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w") as handle:
                handle.write(text)
            self.call("ui", self.vm, "type", "--file", str(path), "--lock-screen", "--timeout", "30s")

    def wait_change(self, before, seconds=45, require_account_done=False):
        until = min(self.deadline, time.monotonic() + seconds)
        self.note(f"Waiting for macOS to finish {self.current_pane}; no repeated clicks or resets.")
        while time.monotonic() < until:
            screen = self.observe()
            changed = screen.signature != before.signature or screen.desktop()
            if changed and (not require_account_done or self.current_pane not in ("account", "creating-account", "blank", "unknown")):
                return
            time.sleep(min(1, max(0, until - time.monotonic())))
        raise Handoff("macOS has not advanced yet. Wait or complete the step in the VM window; the VM has been preserved.")

    def choice(self, name):
        value = self.settings[name]
        if not value:
            raise Handoff(f"Choose {name} in the VM window, or set VM_SETUP_{name.upper()} to its visible English label.")
        original_pane = self.current_pane
        identity = (original_pane, "choice-" + name)
        if identity not in self.seen:
            self.click(value, intent="choice-" + name)
            # Selection highlighting isn't exposed by OCR. Re-observe before advancing.
            self.observe()
            if self.current_pane != original_pane:
                return
        if name == "language" and not self.screen.find("Continue"):
            self.key("Return", "accept-language")
        else:
            self.click("Continue", intent="accept-" + name)

    def optional(self):
        if not self.skip_optional:
            raise Handoff("VM_SETUP_SKIP_OPTIONAL=0: choose this optional setting in the VM window.")

    def account_fields(self):
        screen = self.screen
        labels = [screen.find(name) for name in ("Full Name", "Account Name", "Password", "Verify")]
        if any(label is None for label in labels):
            raise Handoff("Account fields are not fully readable, or the form is already partly filled. Complete it manually.")
        xs, ys = [t["x"] for t in labels], [t["y"] for t in labels]
        if (screen.width < 800 or ys != sorted(ys) or len(set(ys)) != 4
                or max(xs) - min(xs) > screen.width * 0.1
                or not all(screen.width * 0.2 < x < screen.width * 0.5 for x in xs)):
            raise Handoff("Unrecognized account-field layout. Complete the account form manually.")
        return labels

    def fill_field(self, index, value):
        self.observe()
        if self.current_pane != "account":
            raise Handoff("The account screen changed while filling fields. Inspect it before resuming.")
        label = self.account_fields()[index]
        x = label["x"] + label["width"] / 2 + self.screen.width * 0.06
        if x >= self.screen.width * 0.8:
            raise Handoff("Could not safely locate the account input field.")
        self.once("field-" + str(index))
        self.call("ui", self.vm, "click", str(round(x)), str(round(label["y"])), "--lock-screen", "--timeout", "30s")
        self.key("super+a", "select-field-" + str(index))
        self.type_file(value)
        self.observe()
        if self.current_pane != "account":
            raise Handoff("The account screen changed unexpectedly. Inspect it before resuming.")

    def account(self):
        fields = self.account_fields()
        if any(self.screen.values(label) for label in fields):
            raise Handoff("The account form already contains values; it will not be overwritten on resume. Complete it manually.")
        if not self.password:
            raise Handoff("VM_PASSWORD is empty. Create the account and password manually in the VM window.")
        if len(self.password) < 4:
            raise Handoff("The setup password needs at least four characters; set VM_PASSWORD or create the account manually.")
        self.fill_field(0, self.user)
        self.key("Tab", "finish-full-name")
        self.observe()
        fields = self.account_fields()
        name = self.screen.values(fields[0])
        if not any(normalized(t["text"]) == normalized(self.user) for t in name):
            raise Handoff("Could not verify the entered Full Name; inspect the account form manually.")
        account = self.screen.values(fields[1])
        if account and not all(normalized(t["text"]) == normalized(self.user) for t in account):
            raise Handoff("macOS generated a different Account Name; review it manually.")
        if not account:
            self.fill_field(1, self.user)
        self.fill_field(2, self.password)
        self.fill_field(3, self.password)
        # OCR exposes text, not checkbox state. Never toggle an unknown reset option.
        if self.screen.has("reset", "apple account", "apple id"):
            raise Handoff("Account fields filled. Review the Apple Account password-reset checkbox and click Continue manually.")
        before = self.screen
        self.click("Continue", intent="create-account")
        self.wait_change(before, seconds=90, require_account_done=True)
        # Register only the account created in this invocation, after its transition is proven.
        with tempfile.TemporaryDirectory(prefix="vmpal-setup-password-") as directory:
            path = Path(directory) / "password"
            descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "w") as handle:
                handle.write(self.password)
            self.call("set", self.vm, "--user", self.user, "--account-password-file", str(path))
        self.note("Created account and registered its password with VMPal.")

    def timezone(self):
        city = self.settings["timezone"]
        if not city or "/" in city:
            raise Handoff("Choose a time zone manually, or set VM_SETUP_TIMEZONE to the Closest City label, e.g. London (not Europe/London).")
        field = self.screen.find("Closest City", "Closest City:")
        if field is None:
            raise Handoff("Closest City input is not readable. Set the time zone manually.")
        values = self.screen.values(field)
        if not any(normalized(city) in normalized(t["text"]) for t in values):
            # Text-only OCR cannot prove whether automatic time-zone selection disabled the field.
            raise Handoff(f"Select '{city}' in Closest City manually; automatic-selection checkbox state is not exposed by OCR.")
        self.click("Continue")

    def step(self):
        name, before = self.current_pane, self.screen
        if name in ("unknown", "sign-in"):
            raise Handoff("Unrecognized setup or sign-in screen. Complete/sign in in the VM window; earlier setup steps will not be replayed.")
        if name in ("blank", "creating-account"):
            self.wait_change(before, seconds=90 if name == "creating-account" else 60)
            return
        if name == "account":
            self.account()
            return
        if name == "license":
            if not self.accept_license:
                raise Handoff("Accept the license in the VM window, or explicitly opt in with VM_SETUP_ACCEPT_LICENSE=1.")
            intent = "confirm-license" if self.screen.has("i have read and agree", "do you agree") else "accept-license"
            self.click("Agree", intent=intent)
        elif name in ("country", "language", "age"):
            self.choice(name)
        elif name == "time-zone":
            self.timezone()
        elif name == "transfer":
            identity = (name, "no-migration")
            if identity not in self.seen:
                self.click("Set up as new", "Don't transfer any information now", "Not Now", intent="no-migration")
                self.observe()
            if self.current_pane == name:
                self.click("Continue")
        elif name in ("privacy", "spoken-languages", "appearance"):
            self.click("Continue")
        elif name in ("welcome", "finish"):
            self.click("Get Started", "Continue", "Start Using Your Mac")
        else:
            self.optional()
            if name == "apple-account":
                self.click("Sign In Later in Settings", "Skip", "Set Up Later", "Other Sign-In Options")
            elif name == "screen-time":
                self.click("Set Up Later", "Skip")
            elif name in ("accessibility", "siri"):
                self.click("Not Now", "Set Up Later", "Skip")
            elif name == "location":
                self.click("Don't Use", "Do Not Use", "Not Now")
            elif name == "analytics":
                self.click("Don't Share", "Not Now")
            elif name == "filevault":
                if self.screen.find("Not Now"):
                    self.click("Not Now")
                elif (name, "not now") in self.seen and self.screen.has("are you sure", "without filevault", "turn off"):
                    self.click("Continue", intent="confirm-no-filevault")
                else:
                    raise Handoff("Review FileVault in the VM window; its checkbox state cannot be read safely.")
            elif name == "updates":
                self.click("Only Download Automatically")
        self.wait_change(before)

    def run(self):
        status = self.call("status", self.vm, "--json", document=True)
        if status.get("state") != "running":
            raise Handoff("Start the VM before resuming Setup Assistant.")
        if status.get("executionAvailable") is True:
            self.note("Guest command execution is already available; no setup actions needed.")
            return 0
        if any(status.get(field) is False for field in ("available", "authorized", "enabled")):
            raise Handoff("VMPal screen control is unavailable or disabled; check the VM's Agent Control setting.")
        previous = None
        while True:
            self.observe()
            if self.screen.desktop():
                self.note("Desktop verified from the Finder menu bar. Setup assistance complete.")
                return 0
            if self.current_pane != previous:
                self.note("Current screen: " + self.current_pane)
                previous = self.current_pane
            self.step()

    def report(self, error):
        self.note(str(error))
        self.note("Complete this step in the VM window, then rerun mise run vmpal:all (or vmpal:setup). No reset or deletion was performed.")
        self.output.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.output.chmod(0o700)
        # Metadata only: unknown screens can contain credentials even without a Password label.
        document = dict(vm=self.vm, pane=self.current_pane, reason=self.redact(str(error)), actions=self.log)
        if self.screen:
            document["screen"] = dict(width=self.screen.width, height=self.screen.height, text_items=len(self.screen.tokens))
            if self.current_pane != "unknown" and not self.screen.sensitive():
                document["text"] = [self.redact(t["text"]) for t in self.screen.tokens]
        descriptor, path = tempfile.mkstemp(prefix="setup-", suffix=".json", dir=self.output)
        with os.fdopen(descriptor, "w") as handle:
            json.dump(document, handle, indent=2)
        self.note("Private diagnostic metadata: " + path)
        return 3


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vm", required=True)
    parser.add_argument("--user", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args(argv)
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("pass the VMPal command after --")
    setup = None
    try:
        setup = Setup(args, command)
        return setup.run()
    except Handoff as error:
        try:
            return setup.report(error)
        except OSError:
            print("Could not save private diagnostics; complete the current VM screen and rerun vmpal:all.", file=sys.stderr)
            return 3
    except (ValueError, KeyError, TypeError) as error:
        print(f"Invalid setup settings or VMPal response: {error}. Inspect the VM and rerun vmpal:all.", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        print("Setup interrupted; the VM was preserved. Resume with mise run vmpal:all.", file=sys.stderr)
        return 130


def interrupted(_signal, _frame):
    raise KeyboardInterrupt()


if __name__ == "__main__":
    # Signal interruption unwinds private input-file context managers too.
    for interrupt in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(interrupt, interrupted)
    sys.exit(main())
