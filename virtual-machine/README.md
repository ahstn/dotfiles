# Dev VMs on VMPal (Apple Silicon)

Builds an Ubuntu (default) or macOS VM with [VMPal](https://vmpal.com), then applies
[ahstn/dotfiles](https://github.com/ahstn/dotfiles) and the usual apps inside it. VMPal installs the OS
unattended and runs commands in the guest through its own tools (`vmpal exec` / `vmpal cp`), so provisioning
needs no SSH, no autoinstall ISO and no image password.

## Engines

| Engine | Use it for | Notes |
|---|---|---|
| **VMPal** (this dir) | Default: Ubuntu and macOS desktops | Apple's Virtualization.framework, plus its own GPU acceleration for Linux (OpenGL 4.1). Unattended OS installs and guest tools (`exec`/`cp`), so provisioning needs no SSH |
| **Tart** ([`_tart_macos`](_tart_macos/README.md)) | Headless or CI VMs, mainly macOS | Same framework. Runs macOS and Linux, in a window or `--no-graphics`, with Rosetta for Linux and prebuilt OCI images. Linux guests get no 3D acceleration |
| **UTM** ([`_utm_ubuntu`](_utm_ubuntu/README.md)) | Fallback | QEMU (or Apple's framework). Widest guest support, including x86 emulation. QEMU's virgl GPU works but is less stable (Vulkan crashed), and setup is the most manual |

VMPal and Tart use the same Apple hypervisor, so CPU, memory and disk performance are about equal. VMPal
wins for Linux desktops (GPU) and hands-off setup; Tart is lighter for scripted, headless runs.

## Usage

```bash
cd virtual-machine
cp config.env.example config.env   # optional
./vm.sh all                        # Ubuntu
VM_OS=macos ./vm.sh all            # macOS
```

`all` runs `prereqs`, `create`, `keys`, `password` (only if `VM_PASSWORD` is set), `provision`, `snapshot`,
then `start`. Settings come from exported env vars, then `config.env`, then defaults.

Defaults:

| | Ubuntu | macOS |
|---|---|---|
| VM name | `ubuntu-dev` | `macos-dev` |
| System | `download:ubuntu` (26.04 LTS, arm64) | `download:macOS` (~27 GB download) |
| Disk | 64 GB | 100 GB |
| Rosetta | on | n/a |

Both get half the host's cores, 8 GB RAM, and `~/git` shared live into the guest.

Other commands: `configure`, `start`, `stop`, `restart`, `sudo`, `check`, `github-keys`, `ssh [cmd]`, `exec cmd...`, `ip`.
Plain `vmpal` works too (`vmpal ui <name> screenshot -o shot.png`, `vmpal info <name>`, ...); see
[the CLI docs](https://vmpal.com/docs/command-line).

## Per-Mac prerequisites

1. Install VMPal and open it once. `./vm.sh prereqs` links its CLI to `~/.local/bin/vmpal`. It must be a link,
   not a copy, because the CLI finds the app through it.
2. Have an SSH key (`ssh-keygen -t ed25519`). `VM_SSH_PUBKEY` authorises SSH into the guest.
3. Apple's licence allows two macOS VMs running at once per Mac.

## The guest account

VMPal creates an account named after your Mac user, with a generated password that it keeps in this Mac's
keychain (`vmpal info <name> --show-password`). The guest signs in automatically.

- `sudo` gives the account passwordless sudo (`/etc/sudoers.d/90-vm-nopasswd`), which provisioning and
  `mise bootstrap` need unattended. On Ubuntu this goes through `vmpal exec --admin` (root); on macOS through
  `sudo -S` with VMPal's password, passed as an environment variable.
- `keys` authorises `VM_SSH_PUBKEY` and makes SSH key-only. Ubuntu gets `openssh-server`; macOS turns on
  Remote Login.
- `password` (or `VM_PASSWORD` with `all`) replaces the generated password in the guest and in VMPal's keychain
  entry, so VMPal can still sign in. Passwords travel as environment variables, never on a command line.

## How it works

| Step | Mechanism |
|---|---|
| Create | `vmpal create <system> --name --cpus --memory --disk --wait` (unattended install) |
| Hardware | `vmpal set --cpus --memory --disk --rosetta --share`; `vmpal restart --apply-settings` when a setting needs it |
| Shared folder | `vmpal set --share ~/git:git`, live via virtiofs at `/media/VMPal/git` (Ubuntu) or `/Volumes/My Shared Files/git` (macOS), linked as `~/host-git` |
| GitHub keys | `VM_GITHUB_AUTH_KEY` / `VM_GITHUB_SIGNING_KEY` passed with `vmpal exec --env` into the guest's `~/.ssh`. github.com host keys are pinned from `api.github.com/meta`, and a managed `Host github.com` block is written. Setting either variable empty removes that key (and the auth key's Host block) from the guest |
| Provision | `guest/<os>.sh` copied with `vmpal cp` and run with `vmpal exec`: apps, Dock pins, daemons, then (first run or `FORCE=1`) dotfiles clone, `mise bootstrap --only dotfiles` (so the next run sees `~/.config/mise/config.toml`'s packages), and `mise bootstrap --skip files,repos` |
| Snapshot | `vmpal stop`, then `vmpal snapshot <name> provisioned`. Restore with `vmpal revert <name> provisioned`. A Linux VM with GPU acceleration snapshots only when shut down |

Re-running `./vm.sh provision` is idempotent. Apps update to their latest release; the dotfiles bootstrap runs
again only with `FORCE=1`.

## Ubuntu: apps and Rosetta

| App | Source |
|---|---|
| Ghostty | Ubuntu archive (`ghostty`) |
| Helium | its apt repo, signing key pinned by fingerprint |
| Tailscale | its apt repo, signing key pinned by fingerprint |
| tty7 | x86_64 Linux tarball via Rosetta, checked against `checksums.txt`, in `~/.local/opt/tty7/<ver>` |
| MonoCode | amd64 `.deb` via Rosetta (desktop), checked against the GitHub release digest; the arm64 `monocode host` runs as a systemd user service |
| Paseo | amd64 `.deb` via Rosetta (desktop), checked against the GitHub release digest; `paseo daemon` runs as a systemd user service (`paseo.service`, web UI on `127.0.0.1:6767`) |

None of tty7, MonoCode or Paseo publish arm64 Linux desktop builds. With `VM_ROSETTA=1` (the default), VMPal
mounts Apple's Rosetta at `/media/rosetta` and registers it with binfmt, and the script adds the `amd64` dpkg
architecture with the libraries these apps need. Paseo's Electron window does not appear under Wayland, so its
launcher sets `ELECTRON_OZONE_PLATFORM_HINT=x11` (XWayland). With Rosetta off, only the Paseo CLI is installed
(`npm i -g @getpaseo/cli`).

Ghostty, Helium and tty7 are pinned to the Dock.

Ghostty needs OpenGL 4.3, but VMPal's virgl GPU offers 4.1 (the macOS host's limit). Its launcher and D-Bus
service are overridden under `~/.local/share` to set `LIBGL_ALWAYS_SOFTWARE=1`, so it renders with Mesa's
llvmpipe. The screen lock is off, since the guest signs in automatically and only VMPal knows the password.

## macOS

`guest/macos.sh` installs Homebrew if missing, then the same apps as the Tart VM (Mac builds, so no Rosetta),
the Paseo daemon as a LaunchAgent, and the dotfiles bootstrap. The guest's `~/.config/mise/miserc.toml` selects
the `vm` config environment, which adds `~/.config/mise/config.toml`'s VM-only packages (`brew:tailscale`); `tailscaled` is set up after it, on every
provision.

## Networking

VMPal puts the guest behind NAT on `192.168.64.x`, reachable from this Mac only. `./vm.sh ssh` and Remote SSH
hosts in the Mac's MonoCode or Paseo use that address. `vmpal set --forward` binds ports to the Mac's loopback
only, so they do not expose the guest to the LAN either.

To reach the guest from other machines, use Tailscale. Export an auth key for the one provision run; it is
passed with `vmpal exec --env` and written to no file on either side:

```bash
VM_TAILSCALE_AUTHKEY=tskey-... ./vm.sh provision
```

Without a key, run `sudo tailscale up` in the guest.

## Known issues

- `vmpal restart`, or rebooting inside the guest, hangs once the guest has shut down (VMPal 0.60, Ubuntu
  26.04). Recover with `vmpal stop <name> --force`, then start it. `./vm.sh restart` stops and starts instead,
  which works, as does `vmpal restart --apply-settings`.
- The guest clock stops while the Mac sleeps. chrony is set to step the clock whenever it is more than a second
  off (`/etc/chrony/conf.d/vm-step.conf`), otherwise apt rejects repos as "not valid yet" for hours.
- Ubuntu 26.04's sudo-rs ignores `sudo -E`; pass variables explicitly (`sudo VAR=value cmd`).

## Status

Tested end to end on VMPal 0.60 with Ubuntu 26.04.1: a clean `./vm.sh all`, `check`, an idempotent
re-provision, a restart, and Ghostty, tty7 and the Paseo desktop app opening. The macOS path follows the same
steps but has not been run on VMPal yet.
