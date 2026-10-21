# macOS VM on Tart (Apple Silicon)

Builds a macOS Tahoe VM with [Tart](https://tart.run) from Cirrus Labs' `macos-tahoe-base` image, then applies
[ahstn/dotfiles](https://github.com/ahstn/dotfiles) and the usual apps inside it. The image comes already set up
(account, Setup Assistant, Homebrew, auto-login), so the whole run is unattended on any host that can run
macOS 26, and the `tart:*` mise tasks drive the guest over SSH.

For how this compares with VMPal, and what every macOS VM gets, see [the overview](../README.md).

## Usage

```bash
cd virtual-machine
cp mise.local.toml.example mise.local.toml   # optional
export VM_PASSWORD=...                       # optional: replaces the image's admin/admin
mise run tart:all
```

`tart:all` runs `prereqs`, `create`, `start`, `keys`, `password` (only if `VM_PASSWORD` is set), `provision`,
`snapshot`, then `start` again. The first run pulls about 27 GB. Settings come from `mise.local.toml` and the
environment, then defaults ([Settings](../README.md#settings)).

Defaults:

- VM name `macos-dev`;
- half the host's cores (at most its performance cores), 8 GB RAM, a 100 GB disk and a 1920x1200 display;
- the root disk with `caching=cached` (`VM_ROOT_DISK_OPTS`; see [Performance](../README.md#performance));
- `~/shared` shared into the guest, for passing files (not repositories);
- NAT networking;
- a window for the VM. Set `VM_HEADLESS=1` for none.

Other tasks: `tart:configure`, `tart:stop`, `tart:check`, `tart:github-keys`, `tart:sshd`, `tart:ssh [cmd]`,
`tart:ip`, `tart:snapshot [tag]`.

## Per-Mac prerequisites

1. Tart, which mise installs before the first `tart:*` task: the version pinned in `../mise.toml`'s `tart`
   task template, from the mise registry (`aqua:openai/tart`, the GitHub release's `tart.tar.gz`), into
   `~/.local/share/mise/installs/tart/<ver>`. It is on `PATH` inside the tasks only, and any other Tart you have
   installed is left alone; VMs in `~/.tart` work with either. `tart:prereqs` checks the host, then the install's
   code signature (team `9M2P8L4D89`, Cirrus Labs, which still signs the `openai/tart` releases) and Gatekeeper.
   This replaces the Homebrew tap, which fails on Homebrew 7 (`depends_on :macos` is disabled).
2. The [shared prerequisites](../README.md#shared-prerequisites). The private half of `VM_SSH_PUBKEY` is
   passed to `ssh -i` with `IdentitiesOnly=yes`, so an agent with many keys cannot exhaust `MaxAuthTries` first.

## The guest account

The base image has one account, `admin` / `admin`:

- passwordless sudo;
- automatic login;
- Remote Login (SSH) and Screen Sharing on;
- Homebrew and mise preinstalled;
- the Tart guest agent running.

The tasks keep that account (`VM_USER=admin`).

- `keys` logs in once with the image password (`VM_IMAGE_PASSWORD`) to install `VM_SSH_PUBKEY`. It then
  writes `/etc/ssh/sshd_config.d/100-vm-keys-only.conf`, so SSH accepts keys only.
- `password` (or `VM_PASSWORD` with `all`) replaces the password. It updates the account with `dscl`, the login
  keychain with `security set-keychain-password`, and auto-login's `/etc/kcpassword`.
  - `/etc/kcpassword` is written directly, because `sysadminctl -autologin set` fails in the guest
    (`SACSetAutoLoginPassword error:22`) yet still exits 0. The script also makes the file mode 600; the image
    leaves it 644.
  - `VM_IMAGE_PASSWORD` must be the current password, so set it to the old one to change the password again.
  - The passwords are briefly visible in the guest's process list.
- Keeping `admin` / `admin` is fine behind NAT, where only this Mac reaches the guest. With `VM_NETWORK=bridged`,
  Screen Sharing is on the LAN, so set a password.

## How it works

| Step | Mechanism |
|---|---|
| Image | `tart clone ghcr.io/cirruslabs/macos-tahoe-base:latest <name>`, an APFS copy of the cached OCI image |
| Hardware | `tart set --cpu --memory --display --disk-size`. The guest daemon grows APFS into the larger disk at boot |
| Run | `tart run` detached with `nohup`, plus `--root-disk-opts caching=cached` (`VM_ROOT_DISK_OPTS`), `--dir shared:~/shared` and optionally `--net-bridged <if>` and `--no-graphics`. The log goes to `build/tart/run.log` |
| Address | `tart ip --wait` (DHCP leases under NAT, the ARP table when bridged) |
| SSH | known hosts in `build/tart/known_hosts`; key installed with an `SSH_ASKPASS` helper, then password SSH turned off |
| GitHub keys | `VM_GITHUB_AUTH_KEY` / `VM_GITHUB_SIGNING_KEY` streamed into the guest's `~/.ssh`. github.com host keys are pinned from `api.github.com/meta`, and a managed `Host github.com` block is written |
| Provision | the GitHub keys over SSH, then `guest/mise.toml` with `mise bootstrap remote` and, on the first run, `guest/dotfiles.sh` ([Provisioning a macOS guest](../README.md#provisioning-a-macos-guest)) |
| Snapshot | `tart stop`, then `tart clone <name> <name>-<tag>` (cheap APFS copy). To restore: `tart delete <name> && tart clone <name>-<tag> <name>` |

The shared folder appears in the guest at `/Volumes/My Shared Files/shared`, linked as `~/shared`.

## Provisioning

`tart:provision` applies the shared [`../guest/mise.toml`](../guest/mise.toml) and runs the dotfiles pass, as
described in [the overview](../README.md#provisioning-a-macos-guest). The image's own mise (Homebrew's, in
`/opt/homebrew/bin`) is left alone; the host's version at `~/.local/bin/mise` comes first on `PATH` once the
dotfiles are linked. The dotfiles pass moves the image's CI `~/.gitconfig` (git-credential-manager, LFS), which
blocks the dotfiles' symlink, to `~/.gitconfig.pre-dotfiles`.

To log in to Tailscale unattended, export `VM_TAILSCALE_AUTHKEY` for `mise run tart:provision`. The key goes over
SSH's stdin into a private temporary file, which `tailscale up --auth-key=file:...` reads and the task deletes.

Unlike VMPal, nothing here clicks through macOS dialogs. If the default-browser confirmation appears, click
`Use “Helium”` in the VM window.

Tested in a VM (macOS 26.6.2 guest on a macOS 27 host), with the Tart-only guest script that preceded
`guest/mise.toml`:

- all five apps installed and accepted by Gatekeeper;
- the Paseo daemon (web UI returns 200) and the MonoCode host running as launchd agents, including after a reboot;
- `tailscaled` up and awaiting login;
- auto-login working after a password change.

The Tailscale auth-key login was not exercised. `guest/mise.toml` has been dry-run against a provisioned Tart
guest (`tart:provision --dry-run`), not yet applied.

## Networking and the LAN sshd

| `VM_NETWORK` | Guest address | Who can reach it |
|---|---|---|
| `shared` (default; `nat` also works) | `192.168.64.x` on Apple's vmnet | this Mac only (SSH, the host Mac's MonoCode/Paseo) |
| `bridged` | its own DHCP address on `VM_BRIDGE` (`auto`: the default route's `en*` interface, else `en0`) | the LAN |

Both modes reach the internet and the tailnet outbound.

```bash
VM_NETWORK=bridged mise run tart:start
mise run tart:sshd start -m 180   # renders ~/.config/sshd/sshd_config in the guest, runs `mise run sshd -m 180`
mise run tart:sshd status
mise run tart:sshd stop
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

`mise run tart:check` prints:

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
works around. Rerun with `FORCE=1 mise run tart:provision`.
