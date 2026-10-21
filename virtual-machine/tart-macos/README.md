# macOS VM on Tart (Apple Silicon)

Builds a macOS Tahoe VM with [Tart](https://tart.run) from Cirrus Labs' `macos-tahoe-base` image, then applies
[ahstn/dotfiles](https://github.com/ahstn/dotfiles) and the usual apps inside it. The image comes already set up
(account, Setup Assistant, Homebrew, auto-login), so the whole run is unattended on any host that can run
macOS 26, and `vm.sh` drives the guest over SSH.

For how this compares with VMPal, and what every macOS VM gets, see [the overview](../README.md).

## Usage

```bash
cd virtual-machine/tart-macos
cp config.env.example config.env   # optional
export VM_PASSWORD=...             # optional: replaces the image's admin/admin
./vm.sh all
```

`all` runs `prereqs`, `create`, `start`, `keys`, `password` (only if `VM_PASSWORD` is set), `provision`,
`snapshot`, then `start` again. The first run pulls about 27 GB. Settings come from exported env vars, then
`config.env`, then defaults.

Defaults:

- VM name `macos-dev`;
- half the host's cores (at most its performance cores), 8 GiB RAM, a 100 GB disk and a 1920x1200 display;
- the root disk with `caching=cached` (`VM_ROOT_DISK_OPTS`; see [Performance](../README.md#performance));
- `~/shared` shared into the guest, for passing files (not repositories);
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
2. The [shared prerequisites](../README.md#shared-prerequisites). The private half of `VM_SSH_PUBKEY` is
   passed to `ssh -i` with `IdentitiesOnly=yes`, so an agent with many keys cannot exhaust `MaxAuthTries` first.

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
| Run | `tart run` detached with `nohup`, plus `--root-disk-opts caching=cached` (`VM_ROOT_DISK_OPTS`), `--dir shared:~/shared` and optionally `--net-bridged en0` and `--no-graphics`. The log goes to `build/run.log` |
| Address | `tart ip --wait` (DHCP leases under NAT, the ARP table when bridged) |
| SSH | known hosts in `build/known_hosts`; key installed with an `SSH_ASKPASS` helper, then password SSH turned off |
| GitHub keys | `VM_GITHUB_AUTH_KEY` / `VM_GITHUB_SIGNING_KEY` streamed into the guest's `~/.ssh`. github.com host keys are pinned from `api.github.com/meta`, and a managed `Host github.com` block is written |
| Provision | `../guest/macos.sh` and `guest/macos-engine.sh` uploaded and run over SSH: apps, Dock pins, Paseo daemon, then (first run or `FORCE=1`) dotfiles clone, `mise bootstrap --only dotfiles`, then `mise bootstrap --skip files,repos` |
| Snapshot | `tart stop`, then `tart clone <name> <name>-<tag>` (cheap APFS copy). To restore: `tart delete <name> && tart clone <name>-<tag> <name>` |

The shared folder appears in the guest at `/Volumes/My Shared Files/shared`, linked as `~/shared`.

## Provisioning

`provision` runs the shared [`../guest/macos.sh`](../guest/macos.sh): apps, daemons, the dotfiles bootstrap and
the Dock, as listed in [the overview](../README.md#what-every-macos-vm-gets). This engine's
`guest/macos-engine.sh` first moves the base image's CI `~/.gitconfig` (git-credential-manager, LFS), which blocks
the dotfiles' symlink, to `~/.gitconfig.base-image`.

To log in to Tailscale unattended, export `VM_TAILSCALE_AUTHKEY` for `./vm.sh provision`. The key goes over SSH's
stdin into a private `~/.tailscale-authkey`, which `tailscale up --auth-key=file:...` reads and provisioning
deletes.

Unlike VMPal, nothing here clicks through macOS dialogs. If the default-browser confirmation appears, click
`Use “Helium”` in the VM window.

Tested in a VM (macOS 26.6.2 guest on a macOS 27 host), with the Tart-only guest script that preceded the
shared one:

- all five apps installed and accepted by Gatekeeper;
- the Paseo daemon (web UI returns 200) and the MonoCode host running as launchd agents, including after a reboot;
- `tailscaled` up and awaiting login;
- auto-login working after a password change.

The Tailscale auth-key login was not exercised, and the shared script has not been run on Tart yet.

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
- the desktop apps;
- Tailscale state;
- the Paseo agent and its web UI;
- GitHub SSH auth.

By hand: open the apps in the VM window, and check that clipboard sharing works both ways (it needs the
guest agent, which the image runs).

## Known blockers

See [the overview](../README.md#known-blockers-in-the-dotfiles-repo) for the dotfiles' blockers that provisioning
works around. Rerun with `FORCE=1 ./vm.sh provision`.
