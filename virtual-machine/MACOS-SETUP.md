# macOS 26 on VMPal: command runbook

Distilled from the 11 October 2026 run: VMPal 0.69, macOS 26.6.2 (25G83), VMPal Tools 0.38. This is the Setup Assistant path for macOS 26, not the automatic macOS 27 setup. The latter was not exercised in this session.

Run host commands in **Bash**, from `virtual-machine/`. Example target: `macos-dev`, account `admin`, UK English, United Kingdom, Europe/London, 5 CPUs, 8 GB RAM, 100 GB disk. Locale, timezone and key paths below are template choices, not host metadata. Creation and Setup Assistant are one-time steps; provisioning can be repeated.

## 1. Create and isolate the VM

Check the downloaded macOS entry first: this flow applies when its `account` is `setUpInVM`. `download:macOS` follows Apple's available release, so check the version rather than assuming it remains macOS 26. Do not recreate or delete an existing VM.

```bash
export VM_OS=macos VM_NAME=macos-dev VM_USER=admin
export VM_CPU=5 VM_MEMORY_GB=8 VM_DISK_GB=100
export VM_SHARE_DIR="$HOME/git" VM_SHARE_NAME=git
export VM_SSH_PUBKEY="$HOME/.ssh/id_ed25519.pub"
export VM_GITHUB_AUTH_KEY="$HOME/.ssh/github" VM_GITHUB_SIGNING_KEY=''

./vm.sh prereqs
vmpal systems --json
vmpal list --json
vmpal create download:macOS --name macos-dev --cpus 5 --memory 8 --disk 100
vmpal wait macos-dev --until installed --no-sign-in --timeout 2h

# Keep only the intended host share and NAT network.
vmpal set macos-dev --unshare Downloads --share "$HOME/git:git" \
  --local-network off --network-mode shared
```

Set `VM_GITHUB_AUTH_KEY` to your intended GitHub key, or empty to skip copying a private key. The `git` share is live and writable; change `VM_SHARE_DIR` before provisioning if that access is not wanted.

## 2. Complete Setup Assistant

Run **one screen at a time**, not as a blind script. After each action, inspect the returned screen text. Skip screens that are absent; stop if labels or layout differ. The pixel coordinates below came from VMPal's default **1280-pixel-wide** coordinate space, not the host window.

```bash
vmpal ui macos-dev observe --text
vmpal ui macos-dev screenshot -o /tmp/macos-dev-setup.png --png
```

| Screen / intent | Command |
|---|---|
| Welcome: enter setup, if shown | `vmpal ui macos-dev click 640 649 --observe text` |
| Language: select UK English | `vmpal ui macos-dev click --text 'English (UK)' --observe text` |
| Language: advance using the arrow | `vmpal ui macos-dev click 966 617 --observe text` |
| Country: select United Kingdom, then advance | `vmpal ui macos-dev click --text 'United Kingdom' --observe text`, then `vmpal ui macos-dev click --text Continue --observe text` |
| Transfer data: no migration or Time Machine restore | `vmpal ui macos-dev click --text 'Set up as new' --observe text`, then `vmpal ui macos-dev click --text Continue --observe text` |
| Written/spoken languages: accept UK defaults | `vmpal ui macos-dev click --text Continue --observe text` |
| Accessibility: skip optional setup | `vmpal ui macos-dev click --text 'Not Now' --observe text` |
| Data & Privacy: acknowledge information | `vmpal ui macos-dev click --text Continue --observe text` |

### Local account

Capture the account screen before using these field coordinates. VMPal can classify this screen as locked; `--lock-screen` permits input here.

```bash
# Read the chosen password without putting it in the document or shell history.
umask 077
pw_file=$(mktemp)
read -r -s -p 'Guest password: ' VM_PASSWORD; printf '\n'
printf '%s\n' "$VM_PASSWORD" > "$pw_file"
unset VM_PASSWORD
# If interrupted, remove this private temporary file before leaving the shell.

# Full name; the account name should become admin automatically. Verify both.
vmpal ui macos-dev click 580 340 --lock-screen --observe text
vmpal ui macos-dev type admin --lock-screen --observe text
vmpal ui macos-dev key Tab --lock-screen --observe text

# Password and confirmation.
vmpal ui macos-dev click 530 430 --lock-screen --observe text
vmpal ui macos-dev type --file "$pw_file" --lock-screen --observe text
vmpal ui macos-dev key Tab --lock-screen --observe text
vmpal ui macos-dev type --file "$pw_file" --lock-screen --observe text

# Uncheck Apple Account password reset, only if currently checked.
vmpal ui macos-dev click 447 485 --lock-screen --observe text
vmpal ui macos-dev click --text Continue --lock-screen --observe text
vmpal ui macos-dev wait --text 'Creating account' --gone --timeout 45s --observe text
```

| Remaining screen / intent | Command |
|---|---|
| Apple Account: local-only setup | `vmpal ui macos-dev click --text 'Other Sign-In Options' --observe text`, then `vmpal ui macos-dev click --text 'Sign In Later in Settings' --observe text` |
| Confirm skipped Apple Account | `vmpal ui macos-dev click --text Skip --observe text` |
| Terms: accept, then confirm in the dialog | `vmpal ui macos-dev click --text Agree --observe text`, then `vmpal ui macos-dev click --text Agree --near 692,444 --observe text` |
| Age range: adult account | `vmpal ui macos-dev click --text Adult --observe text` |
| Location Services: leave unchecked; confirm disabled | `vmpal ui macos-dev click --text Continue --observe text`, then `vmpal ui macos-dev click --text "Don't Use" --observe text` |
| Time zone: enter the example city London in Closest City | `vmpal ui macos-dev click 746 560 --observe text`, then `vmpal ui macos-dev key super+a`, `vmpal ui macos-dev type London`, `vmpal ui macos-dev key Return --observe text` |
| Time zone: verify London (the seasonal time label varies), then advance | `vmpal ui macos-dev click --text Continue --observe text` |
| Analytics: uncheck Share Mac Analytics, only if checked; leave app analytics off | `vmpal ui macos-dev click 447 360 --observe text`, then `vmpal ui macos-dev click --text Continue --observe text` |
| Screen Time: skip | `vmpal ui macos-dev click --text 'Set Up Later' --observe text` |
| FileVault: leave off, then confirm in the dialog | `vmpal ui macos-dev click --text 'Not Now' --observe text`, then `vmpal ui macos-dev click --text Continue --near 692,432 --observe text` |
| Appearance: accept the selected default | `vmpal ui macos-dev click --text Continue --observe text` |
| Updates: download, but do not install automatically | `vmpal ui macos-dev click --text 'Only Download Automatically' --observe text` |
| Finish: enter the desktop | `vmpal ui macos-dev click --text 'Get Started' --observe text` |

No Siri screen appeared in this run. If one appears, leave Siri disabled before advancing. Location Services remain off; no cloud account is added.

## 3. Connect guest tools and register the password

`exec` and `cp` cannot work until VMPal Tools connect. Try the normal installer route first:

```bash
vmpal reinstall-tools macos-dev
vmpal wait macos-dev --until ready --no-sign-in --timeout 3m
```

If that times out, the successful recovery was to run the shared installer executable **inside guest Terminal**. Observe the Terminal prompt before typing the command; the installer may remain open after reporting success.

```bash
vmpal ui macos-dev key super+space
vmpal ui macos-dev type Terminal
vmpal ui macos-dev key Return --observe text
vmpal ui macos-dev observe --text
vmpal ui macos-dev type $'"/Volumes/My Shared Files/VMPal Tools/Install VMPal Tools.app/Contents/MacOS/VMPal Tools"\n' --observe text
vmpal wait macos-dev --until ready --no-sign-in --timeout 3m
```

Once tools are ready, verify the account and register its password, regardless of which installer route worked:

```bash
vmpal exec macos-dev -- /usr/bin/id -un   # must report admin
vmpal set macos-dev --account-password-file "$pw_file"
rm -f "$pw_file"; unset pw_file
```

VMPal's recorded username may still be the host's. Do not edit VM metadata to fix SSH: the repository's `vm.sh` reads the actual guest user via `id -un`. Registering the password lets VMPal sign in after restarts.

## 4. Provision the development environment

Reuse the repository's sudo, SSH and private-key handling rather than duplicating it. `provision` copies `guest/macos.sh` with `vmpal cp` and runs it with `vmpal exec`, including the shared-folder environment.

```bash
./vm.sh configure
./vm.sh keys          # passwordless sudo, host public key, key-only guest SSH
./vm.sh provision     # configured GitHub key, Homebrew/apps, mise/dotfiles, host daemons
./vm.sh check
```

Leave Tailscale signed out by not setting `VM_TAILSCALE_AUTHKEY`. A provisioned guest skips the mise bootstrap on reruns unless `FORCE=1` is supplied. Ensure its dotfiles contain the session's `.zsh-plugins` Unicode-path compilation fix; if using this checkout before that fix reaches the remote:

```bash
vmpal cp ../.config/zsh/.zsh-plugins macos-dev:git/dotfiles/.config/zsh/.zsh-plugins
```

## 5. Confirm Helium and exercise the desktop

If provisioning leaves Safari as default, repeat the bootstrap's browser request. Accept `Use “Helium”` only if that dialog appears; this run's repeated request also worked without a dialog.

```bash
vmpal exec macos-dev -- /usr/bin/osascript -l JavaScript -e '
ObjC.import("AppKit"); ObjC.import("CoreServices");
const id = "net.imput.helium";
for (const s of ["http", "https"]) $.LSSetDefaultHandlerForURLScheme($(s), $(id));
$.LSSetDefaultRoleHandlerForContentType($("public.html"), $.kLSRolesViewer, $(id));'
vmpal ui macos-dev observe --text
# Only when the confirmation is visible:
vmpal ui macos-dev click --text 'Use “Helium”' --observe text

vmpal exec macos-dev -- /usr/bin/open -a Ghostty
# Only when Gatekeeper's verified-app confirmation is visible:
vmpal ui macos-dev click --text Open --observe text
# Once Ghostty's shell prompt is visible:
vmpal ui macos-dev type $'printf "VM shell: %s\\n" "$USER"; node --version; omp --version\n' --observe text
```

## 6. Snapshot, restart and verify

Stop before snapshotting. Use a new snapshot name if `provisioned` already exists and must be retained. The final `start --wait` tests VMPal's stored-password sign-in.

```bash
vmpal stop macos-dev
vmpal snapshot macos-dev provisioned
vmpal start macos-dev --wait
vmpal snapshots macos-dev --json
./vm.sh ssh 'id -un; sudo -n true; test -f ~/.provisioned'
./vm.sh check

# HTTP and HTTPS must both resolve to Helium.
vmpal exec macos-dev -- /usr/bin/osascript -l JavaScript -e '
ObjC.import("AppKit"); const w = $.NSWorkspace.sharedWorkspace;
["http://example.com", "https://example.com"].map(u =>
  w.URLForApplicationToOpenURL($.NSURL.URLWithString(u)).path.js).join("\n")'

# Both daemons should run; Paseo should return HTTP 200; Tailscale BackendState should be NeedsLogin.
vmpal exec macos-dev -- /bin/bash -c '
set -e
launchctl print "gui/$(id -u)/com.monocode.host" | grep "state = running"
launchctl print "gui/$(id -u)/sh.paseo.daemon" | grep "state = running"
curl -fsS -o /dev/null -w "Paseo HTTP %{http_code}\n" http://127.0.0.1:6767/
sudo -n /opt/homebrew/bin/tailscale status --json'
```

Leave the VM running. Restore the saved baseline with `vmpal revert macos-dev provisioned` only when discarding later guest changes is intended.

## First-boot recovery only

The first installed macOS 26 boot showed a black display. A reset recovered Setup Assistant:

```bash
vmpal restart macos-dev --reset --no-sign-in
vmpal ui macos-dev observe --text
```

Use this only on the newly installed VM, before unsaved guest work exists. A transient empty display immediately after reset is not proof of failure; let it boot, then inspect again. Do not reset an in-use VM as part of normal provisioning.
