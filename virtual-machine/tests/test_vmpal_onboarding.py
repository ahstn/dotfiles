"""Exercise lifecycle safety against a stateful CLI, without touching a real VM."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


VM_ROOT = Path(__file__).resolve().parents[1]
FAKE_CLI = r'''#!/usr/bin/env python3
import json
import os
from pathlib import Path
import sys

path = Path(os.environ["FAKE_VM_STATE"])
s = json.loads(path.read_text())
a = sys.argv[1:]
command = a[0]

def save():
    path.write_text(json.dumps(s))

def option(name):
    return a[a.index(name) + 1]

if command == "systems":
    print(json.dumps({"systems": s["systems"]}))
elif command == "info":
    if s["state"] == "missing":
        sys.exit(1)
    print(json.dumps({"state": s["state"], "guest": s["guest"],
                     "installed": True, "diskLimitGB": s["disk"],
                     "tools": {"connected": s["tools"]},
                     "account": {"userName": s["user"], "passwordStatus": "notKept"},
                     "settings": {"sharedFolders": []}, "pendingSettings": []}))
elif command == "create":
    assert s["state"] == "missing", "existing VM must not be recreated"
    system = next(v for v in s["systems"] if v["id"] == a[1])
    if system["account"] == "setUpInVM":
        assert "--user" not in a and "--wait" not in a, "manual guest cannot take unattended account options"
        s["user"] = None
        s["ready"] = False
    else:
        s["user"] = option("--user")
        s["ready"] = True
        s["tools"] = True
    s["state"] = "running"
    s["guest"] = system["guest"]
    s["disk"] = int(option("--disk"))
    s["memory"] = int(option("--memory"))
    save()
elif command == "start":
    s["state"] = "running"
    save()
elif command == "wait":
    assert s["state"] == "running"
    if option("--until") == "ready" and not s["ready"]:
        sys.exit(1)
elif command == "status":
    print(json.dumps({"executionAvailable": s["ready"], "available": True,
                     "enabled": True, "authorized": True, "state": s["state"]}))
elif command == "exec":
    if not s["ready"]:
        sys.exit(125)
    print(s["user"])
elif command == "set":
    if "--account-password-file" in a:
        password = Path(option("--account-password-file")).read_text()
        assert s["user"] == option("--user") and s["fields"][2] == password
        s["stored_password"] = password
    else:
        assert s["ready"], "configuration must not interrupt unfinished setup"
        if "--memory" in a:
            s["memory"] = int(option("--memory"))
    save()
elif command == "ui":
    action = a[2]
    if action == "observe":
        desktop = s["pane"] == "desktop"
        words = ["Finder", "File", "Edit", "View", "Go", "Window", "Help"] if desktop else s.get("screens", {}).get(s["pane"], ["Unrecognized Setup Step"])
        if s["pane"] == "account" and "fields" in s:
            words = [dict(text="Create a Computer Account", x=640, y=230, width=250, height=12)]
            for i, label in enumerate(["Full Name", "Account Name", "Password", "Verify"]):
                y = [340, 385, 430, 470][i]
                words.append(dict(text=label, x=420, y=y, width=100, height=12))
                if s["fields"][i]:
                    value = s["fields"][i] if i < 2 else "••••••"
                    words.append(dict(text=value, x=620, y=y, width=120, height=12))
            if s.get("review_reset"):
                words.append(dict(text="Allow my Apple Account to reset this password", x=620, y=510, width=300, height=12))
            words.append(dict(text="Continue", x=960, y=620, width=100, height=12))
        print(json.dumps({"frame": 1, "screen": {"width": 1280, "height": 754},
                          "text": [word if isinstance(word, dict) else
                                   {"text": word, "x": 60 + i * 50 if desktop else 640,
                                    "y": 12 if desktop else 220 + i * 40,
                                    "width": 35 if desktop else 180, "height": 10}
                                   for i, word in enumerate(words)]}))
    elif action == "screenshot":
        Path(option("-o")).write_bytes(b"fake screenshot")
    elif action == "click":
        if "--text" in a:
            label = option("--text")
            s.setdefault("clicked", []).append(label)
            if s["pane"] == "account" and label == "Continue" and "fields" in s:
                assert s["fields"][0] and s["fields"][1] and len(s["fields"][2]) >= 4
                assert s["fields"][2] == s["fields"][3]
                s["user"] = s["fields"][1]
            s["pane"] = s.get("transitions", {}).get(s["pane"], {}).get(label, s["pane"])
            if s["pane"] == "desktop" and s["tools"]:
                s["ready"] = True
        else:
            x, y = float(a[3]), float(a[4])
            assert 520 < x < 820 and s["pane"] == "account"
            s["focus"] = min(range(4), key=lambda i: abs([340, 385, 430, 470][i] - y))
        save()
        print(json.dumps({"ok": True}))
    elif action == "key":
        if a[3] == "Tab" and s["focus"] == 0:
            s["fields"][1] = s["fields"][0].lower()
        elif a[3] == "super+a":
            s["select_all"] = True
        else:
            raise AssertionError(a)
        save()
    elif action == "type":
        assert "VM_SETUP_PASSWORD" not in os.environ and "VM_PASSWORD" not in os.environ
        input_path = Path(option("--file"))
        assert input_path.stat().st_mode & 0o777 == 0o600
        value = input_path.read_text()
        focus = s["focus"]
        s["fields"][focus] = value if s.pop("select_all", False) else s["fields"][focus] + value
        save()
    else:
        raise AssertionError("Unexpected setup input: " + str(a))
else:
    raise AssertionError(a)
'''


class OnboardingLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="vmpal-onboarding-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "lib").symlink_to(VM_ROOT / "lib", target_is_directory=True)
        self.cli = self.root / "vmpal"
        self.cli.write_text(FAKE_CLI)
        self.cli.chmod(0o700)
        # The libs support macOS bash 3.2; fake host facts keep these tests portable.
        sysctl = self.root / "sysctl"
        sysctl.write_text("#!/bin/sh\nprintf '8\\n'\n")
        sysctl.chmod(0o700)
        self.state_file = self.root / "vm.json"
        self.state = dict(state="missing", user=None, ready=False, tools=False,
                          guest="macOS", disk=100, memory=16, pane="unknown",
                          systems=[dict(id="opaque-system-id", name="macOS Tahoe",
                                        guest="macOS", account="setUpInVM")])
        self.env = dict(os.environ, MISE_CONFIG_ROOT=str(self.root), VMPAL=str(self.cli),
                        FAKE_VM_STATE=str(self.state_file), VM_OS="macos", VM_NAME="isolated-test-vm",
                        VM_SYSTEM="opaque-system-id", VM_USER="admin", VM_PASSWORD="",
                        VM_CPU="4", VM_MEMORY_GB="8", VM_DISK_GB="100", VM_SHARE_DIR="",
                        VM_SETUP_TIMEOUT="1", PATH=str(self.root) + os.pathsep + os.environ["PATH"])

    def run_lifecycle(self, script):
        self.state_file.write_text(json.dumps(self.state))
        result = subprocess.run(["/bin/bash", "-c", '. "$MISE_CONFIG_ROOT/lib/vmpal.sh"; ' + script],
                                env=self.env, text=True, capture_output=True, timeout=20)
        self.state = json.loads(self.state_file.read_text())
        return result

    def test_manual_install_preserves_vm_at_unrecognized_setup(self):
        result = self.run_lifecycle("cmd_create")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.state["state"], "running")
        self.assertIsNone(self.state["user"])
        self.assertFalse(self.state["ready"])
        # Rerunning all must resume rather than recreate or reconfigure this VM.
        result = self.run_lifecycle("cmd_prereqs() { :; }; need_pubkey() { :; }; cmd_all")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.state["state"], "running")
        self.assertIsNone(self.state["user"])

    def test_native_account_creation_is_driven_by_metadata_not_id(self):
        self.state["systems"][0]["account"] = "made"
        result = self.run_lifecycle("cmd_create")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.state["user"], "admin")
        self.assertTrue(self.state["ready"])
        self.assertEqual(self.state["memory"], 8)

    def test_wrong_guest_is_rejected_before_vm_creation(self):
        self.state["systems"][0]["guest"] = "windows"
        result = self.run_lifecycle("cmd_create")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.state["state"], "missing")

    def test_unknown_system_id_does_not_create_vm(self):
        self.env["VM_SYSTEM"] = "not-an-available-system"
        result = self.run_lifecycle("cmd_create")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.state["state"], "missing")

    def test_ready_stopped_vm_is_started_without_replaying_setup(self):
        self.state.update(state="stopped", user="existing", ready=True, tools=True)
        result = self.run_lifecycle("cmd_ensure_ready; cmd_configure")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.state["state"], "running")
        self.assertEqual(self.state["user"], "existing")
        self.assertEqual(self.state["memory"], 8)

    def test_desktop_without_tools_does_not_enter_provisioning(self):
        self.state.update(state="running", user="existing", pane="desktop")
        result = self.run_lifecycle("cmd_ensure_ready; cmd_configure")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("VMPal Tools", result.stdout + result.stderr)
        self.assertEqual(self.state["memory"], 16)
        self.assertEqual(self.state["user"], "existing")

    def test_ubuntu_keeps_unattended_path(self):
        self.env.update(VM_OS="ubuntu", VM_SYSTEM="opaque-linux-id", VM_USER="developer")
        self.state["systems"] = [dict(id="opaque-linux-id", name="Ubuntu LTS", guest="linux", account="made")]
        result = self.run_lifecycle("cmd_create")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.state["user"], "developer")
        self.assertEqual(self.state["guest"], "linux")
        self.assertTrue(self.state["ready"])

    def run_setup(self, password=""):
        self.state_file.write_text(json.dumps(self.state))
        env = dict(self.env, VM_SETUP_PASSWORD=password, VM_SETUP_ACCEPT_LICENSE="0", VM_SETUP_SKIP_OPTIONAL="1")
        result = subprocess.run(["python3", str(VM_ROOT / "lib/vmpal_setup.py"),
                                 "--vm", "isolated-test-vm", "--user", "admin",
                                 "--output-dir", str(self.root / "diagnostics"), "--", str(self.cli)],
                                env=env, text=True, capture_output=True, timeout=20)
        self.state = json.loads(self.state_file.read_text())
        return result

    def test_resumes_at_screen_time_and_reaches_desktop(self):
        self.env["VM_SETUP_TIMEOUT"] = "10"
        self.state.update(state="running", pane="screen-time",
                          screens={"screen-time": ["Screen Time", "Set Up Later", "Continue"],
                                   "finish": ["Get Started"]},
                          transitions={"screen-time": {"Set Up Later": "finish"},
                                       "finish": {"Get Started": "desktop"}})
        result = self.run_setup()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.state["pane"], "desktop")
        self.assertIsNone(self.state["user"])

    def test_unchanged_screen_does_not_repeat_input(self):
        self.state.update(state="running", pane="screen-time",
                          screens={"screen-time": ["Screen Time", "Set Up Later", "Continue"]})
        result = self.run_setup()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.state["pane"], "screen-time")
        self.assertEqual(self.state.get("clicked"), ["Set Up Later"])

    def test_license_requires_explicit_consent(self):
        self.state.update(state="running", pane="license",
                          screens={"license": ["Terms and Conditions", "Software License Agreement", "Agree"]},
                          transitions={"license": {"Agree": "desktop"}})
        result = self.run_setup()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.state["pane"], "license")
        self.assertNotIn("Agree", self.state.get("clicked", []))

    def test_finder_text_without_menu_bar_is_not_desktop(self):
        self.state.update(state="running", pane="unrecognized",
                          screens={"unrecognized": ["Finder", "File", "Edit", "View", "Go", "Window"]})
        result = self.run_setup()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.state["pane"], "unrecognized")

    def test_rerun_after_manual_completion_does_not_replay_steps(self):
        self.state.update(state="running", pane="unrecognized")
        result = self.run_setup()
        self.assertNotEqual(result.returncode, 0)
        self.state["pane"] = "desktop"
        result = self.run_setup()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn("clicked", self.state)

    def test_partially_filled_account_is_not_overwritten_on_resume(self):
        def token(text, x, y, width=100):
            return dict(text=text, x=x, y=y, width=width, height=12)

        self.state.update(state="running", pane="account", screens={"account": [
            token("Create a Computer Account", 640, 230, 250),
            token("Full Name", 420, 340), token("existing", 620, 340),
            token("Account Name", 420, 385), token("existing", 620, 385),
            token("Password", 420, 430), token("Verify", 420, 470),
            token("Continue", 960, 620),
        ]})
        result = self.run_setup(password="secret-test-password")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.state["pane"], "account")
        self.assertNotIn("clicked", self.state)
        self.assertNotIn("secret-test-password", result.stdout + result.stderr)
        self.assertEqual(list((self.root / "diagnostics").glob("*.png")), [])
        for diagnostic in (self.root / "diagnostics").glob("*.json"):
            self.assertEqual(diagnostic.stat().st_mode & 0o777, 0o600)
            self.assertNotIn("secret-test-password", diagnostic.read_text())

    def empty_account(self, review_reset=False):
        self.env["VM_SETUP_TIMEOUT"] = "15"
        self.state.update(state="running", pane="account", fields=["", "", "", ""], review_reset=review_reset,
                          screens={"finish": ["Get Started"]},
                          transitions={"account": {"Continue": "finish"}, "finish": {"Get Started": "desktop"}})

    def test_account_is_created_once_and_password_registered_after_transition(self):
        self.empty_account()
        result = self.run_setup(password="secret-test-password")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.state["user"], "admin")
        self.assertEqual(self.state["stored_password"], "secret-test-password")
        self.assertEqual(self.state["pane"], "desktop")
        self.assertNotIn("secret-test-password", result.stdout + result.stderr)

    def test_reset_checkbox_handoff_does_not_retype_credentials_on_rerun(self):
        self.empty_account(review_reset=True)
        result = self.run_setup(password="secret-test-password")
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(self.state["user"])
        self.assertNotIn("stored_password", self.state)
        filled = list(self.state["fields"])
        self.assertEqual(filled[:2], ["admin", "admin"])
        result = self.run_setup(password="different-password")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.state["fields"], filled)
        self.assertNotIn("stored_password", self.state)

    def test_connected_tools_do_not_imply_setup_has_completed(self):
        self.env["VM_SETUP_TIMEOUT"] = "10"
        self.state.update(state="running", user="existing", tools=True, pane="screen-time",
                          screens={"screen-time": ["Screen Time", "Set Up Later", "Continue"],
                                   "finish": ["Get Started"]},
                          transitions={"screen-time": {"Set Up Later": "finish"},
                                       "finish": {"Get Started": "desktop"}})
        result = self.run_lifecycle("cmd_ensure_ready; cmd_configure")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.state["pane"], "desktop")
        self.assertEqual(self.state["user"], "existing")
        self.assertEqual(self.state["memory"], 8)


if __name__ == "__main__":
    unittest.main()
