# macOS VM on Tart (Apple Silicon)

Builds a macOS Tahoe VM with [Tart](https://tart.run) from Cirrus Labs' `macos-tahoe-base` image, then applies
[ahstn/dotfiles](https://github.com/ahstn/dotfiles) and the same apps as the Ubuntu VM inside it. A macOS guest
runs on Apple's Virtualization.framework with paravirtualised graphics, so it is faster than the Ubuntu/UTM
VM. It also runs the Mac builds of tty7, MonoCode and Paseo, with no FEX-Emu or llvmpipe workarounds.

The Ubuntu Desktop VM on UTM lives in [`_ubuntu/`](_ubuntu/README.md).

## Usage

```bash
cd virtual-machine
cp config.env.example config.env   # optional
export VM_PASSWORD=...             # optional: replaces the image's admin/admin
./vm.sh all
```

`all` runs `prereqs`, `create`, `start`, `keys`, `password` (only if `VM_PASSWORD` is set), `provision`,
`snapshot`, then `start` again. The first run pulls about 27 GB. Settings come from exported env vars, then
`config.env`, then defaults.

Defaults:

- VM name `macos-dev`;
- half the host's cores, 8 GiB RAM, a 100 GB disk and a 1920x1200 display;
- `~/git` shared into the guest;
- NAT networking;
- a window for the VM. Set `VM_HEADLESS=1` for none.

Other commands: `configure`, `stop`, `check`, `github-keys`, `sshd`, `ssh [cmd]`, `ip`.

## Per-Mac prerequisites

1. `./vm.sh prereqs` installs Tart:
   - with Homebrew first (`brew install cirruslabs/cli/tart`). That tap currently fails on Homebrew 7
     (`depends_on :macos` is disabled).
   - otherwise from the GitHub release `tart.tar.gz` (pinned `TART_VERSION`). It is checked against the release's
     checksum list, its code signature (team `9M2P8L4D89`, Cirrus Labs) and Gatekeeper. It is installed into
     `~/.local/opt/tart/<ver>`, with a `~/.local/bin/tart` wrapper.
2. Have an SSH key (`ssh-keygen -t ed25519`). `VM_SSH_PUBKEY` authorises SSH into the guest. Its private half
   is passed to `ssh -i` with `IdentitiesOnly=yes`, so an agent with many keys cannot exhaust `MaxAuthTries` first.
3. Apple's licence allows two macOS VMs running at once per Mac.

## The guest account

The base image has one account, `admin` / `admin`:

- passwordless sudo;
- automatic login;
- Remote Login (SSH) and Screen Sharing on;
- Homebrew and mise preinstalled;
- the Tart guest agent running.

`vm.sh` keeps that account (`VM_USER=admin`).

- `keys` logs in once with the image password (`VM_IMAGE_PASSWORD`) to install `VM_SSH_PUBKEY`. It then
  writes `/etc/ssh/sshd_config.d/100-vm-keys-only.conf`, so SSH accepts keys only.
- `password` (or `VM_PASSWORD` with `all`) replaces the password. It updates the account with `dscl`, the login
  keychain with `security set-keychain-password`, and auto-login's `/etc/kcpassword`.
  - `/etc/kcpassword` is written directly, because `sysadminctl -autologin set` fails in the guest
    (`SACSetAutoLoginPassword error:22`) yet still exits 0. The script also makes the file mode 600; the image
    leaves it 644.
  - `VM_IMAGE_PASSWORD` must be the current password, so set it to the old one to change the password again.
  - The passwords are briefly visible in the guest's process list.
- Keeping `admin` / `admin` is fine behind NAT, where only this Mac reaches the guest. With `VM_NET=bridged`,
  Screen Sharing is on the LAN, so set a password.

## How it works

| Step | Mechanism |
|---|---|
| Image | `tart clone ghcr.io/cirruslabs/macos-tahoe-base:latest <name>`, an APFS copy of the cached OCI image |
| Hardware | `tart set --cpu --memory --display --disk-size`. The guest daemon grows APFS into the larger disk at boot |
| Run | `tart run` detached with `nohup`, plus `--dir git:~/git` and optionally `--net-bridged en0` and `--no-graphics`. The log goes to `build/run.log` |
| Address | `tart ip --wait` (DHCP leases under NAT, the ARP table when bridged) |
| SSH | known hosts in `build/known_hosts`; key installed with an `SSH_ASKPASS` helper, then password SSH turned off |
| GitHub keys | `VM_GITHUB_AUTH_KEY` / `VM_GITHUB_SIGNING_KEY` streamed into the guest's `~/.ssh`. github.com host keys are pinned from `api.github.com/meta`, and a managed `Host github.com` block is written |
| Provision | `guest/provision.sh` uploaded and run over SSH: apps, Dock pins, Paseo daemon, then (first run or `FORCE=1`) dotfiles clone and `mise bootstrap --skip files,repos` |
| Snapshot | `tart stop`, then `tart clone <name> <name>-<tag>` (cheap APFS copy). To restore: `tart delete <name> && tart clone <name>-<tag> <name>` |

The shared folder appears in the guest at `/Volumes/My Shared Files/git`, linked as `~/host-git`.

## Updating an existing VM

```bash
git pull
./vm.sh start
./vm.sh provision     # apps, Dock pins, daemons; the dotfiles steps are skipped unless FORCE=1
./vm.sh check
```

## Apps

`provision` installs these on every run, before the already-provisioned check. Steps that are already done
are skipped.

- **Ghostty, Helium, Paseo (desktop):** Homebrew casks `ghostty`, `helium-browser` and `paseo`. Note that the
  cask `helium` is an unrelated, disabled app.
- **tty7:** no cask. The newest stable `vX.Y.Z` release's `tty7-<ver>-macos-arm64.zip`, checked against the
  release's `checksums.txt`.
- **MonoCode (desktop):** no cask. `MonoCode_<ver>_aarch64.dmg` from the latest release. The DMG has no checksum
  file, so it is checked against the sha256 digest GitHub publishes for the release asset.
- The tty7 and MonoCode apps must pass `codesign --verify --deep --strict`, and Gatekeeper is asked about them.
  All five apps report "Notarized Developer ID". They are copied into `/Applications` and replaced only when
  the version changes.
- **MonoCode host:**
  - `monocode-host-darwin-arm64.tar.gz`, checked against its `.sha256`, into `~/.local/opt/monocode-host/<ver>`,
    with a wrapper in `~/.local/bin`.
  - `monocode-host service install` registers it as the `com.monocode.host` launchd agent.
  - From the host Mac's MonoCode, add the VM under Settings → Connections → Add machine, as `admin@<./vm.sh ip>`.
- **Paseo daemon:**
  - The `sh.paseo.daemon` launchd agent runs the cask's `paseo daemon run` on `127.0.0.1:6767`, with the web UI
    enabled and the relay off. It is up without the desktop app open, and the log is
    `~/Library/Logs/paseo-daemon.log`.
  - The cask's CLI runs on the app's bundled runtime, so it needs no Node and upgrades with the app.
  - The agent is reloaded only when its plist changes.
  - The host Mac's Paseo can add `ssh://admin@<./vm.sh ip>` as a Remote SSH host.
- **Tailscale:**
  - Homebrew formula `tailscale`, run as a root launchd daemon (`tailscaled install-system-daemon`).
  - The Tailscale app is not used: its network system extension has to be approved in the GUI, so it cannot be
    installed unattended.
  - Provisioning does not log in by default. Run `sudo tailscale up` in the guest afterwards.
  - To log in unattended, export `VM_TAILSCALE_AUTHKEY` for `./vm.sh provision`. The key goes over SSH stdin
    into a private file that `tailscale up --auth-key=file:...` reads and provisioning deletes. Do not put it in
    `config.env`.
- **Dock:** Ghostty, Helium and tty7 are pinned, after existing pins and without duplicates.

Tested in a VM (macOS 26.6.2 guest on a macOS 27 host):

- all five apps installed and accepted by Gatekeeper;
- the Paseo daemon (web UI returns 200) and the MonoCode host running as launchd agents, including after a reboot;
- `tailscaled` up and awaiting login;
- auto-login working after a password change.

The Tailscale auth-key login was not exercised.

## Networking and the LAN sshd

| `VM_NET` | Guest address | Who can reach it |
|---|---|---|
| `nat` (default) | `192.168.64.x` on Apple's vmnet | this Mac only (SSH, the host Mac's MonoCode/Paseo) |
| `bridged` | its own DHCP address on `VM_BRIDGE_IF` (`en0`) | the LAN |

Both modes reach the internet and the tailnet outbound.

```bash
VM_NET=bridged ./vm.sh start
./vm.sh sshd start 180     # renders ~/.config/sshd/sshd_config in the guest, runs `mise run sshd -m 180`
./vm.sh sshd status
./vm.sh sshd stop
ssh -p 48222 admin@<guest LAN ip>   # from the LAN client
```

`sshd start`:

- copies `VM_SSHD_AUTHORIZED_KEYS` (the LAN client's public key; defaults to this Mac's) into the guest's
  dedicated `~/.config/sshd/authorized_keys`;
- runs the dotfiles' template and task unchanged, as on the Mac. It listens on the guest's `en0`, with
  `AllowUsers admin@<VM_SSHD_ALLOW_FROM>` (default `192.168.1.168`) and keys only.

Bridging keeps client source IPs, so the allowlist applies as written. The daemon is tracked through the
template's `PidFile`, and `stop` ends open sessions as well as the listener. Under NAT the guest is not on the
LAN, so `sshd start` warns.

Tested bridged on Wi-Fi: start, connect from the host's LAN address, status, stop, port closed.

## Acceptance checks

`./vm.sh check` prints:

- the macOS version and mise tools;
- the login shell and disk size;
- the shared folder;
- the five apps;
- Tailscale state;
- the Paseo agent and its web UI;
- GitHub SSH auth.

By hand: open the apps in the VM window, and check that clipboard sharing works both ways (it needs the
guest agent, which the image runs).

## Known blockers in the dotfiles repo (not changed here)

1. The `files` phase needs `TERN_TAILSCALE_EMAIL` / `TERN_SSH_FINGERPRINT`, so it is skipped.
2. `[bootstrap.repos]` uses an SSH URL, so it is skipped; `~/git/dotfiles` is cloned over HTTPS.
3. The base image ships a CI `~/.gitconfig` (git-credential-manager, LFS) that blocks the dotfiles' symlink.
   Provisioning moves it to `~/.gitconfig.base-image`.
4. `[tasks.bootstrap]` installs the crontab in the VM too.

Rerun with `FORCE=1 ./vm.sh provision`.
