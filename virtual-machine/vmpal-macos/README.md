# Dev VMs on VMPal (Apple Silicon)

Builds a macOS (default) or Ubuntu VM with [VMPal](https://vmpal.com), then applies
[ahstn/dotfiles](https://github.com/ahstn/dotfiles) and the usual apps inside it. VMPal installs the OS
unattended (macOS guests from macOS 27; see below) and runs commands in the guest through its own tools
(`vmpal exec` / `vmpal cp`), so provisioning needs no SSH, no autoinstall ISO and no image password.

For how this compares with Tart, and what every macOS VM gets, see [the overview](../README.md).

## Usage

```bash
cd virtual-machine
cp mise.local.toml.example mise.local.toml   # optional
mise run vmpal:all                           # macOS (macOS 27 hosts)
VM_OS=ubuntu mise run vmpal:all              # Ubuntu
```

> [!WARNING]
> **macOS before 27 needs manual setup on VMPal.** VMPal sets up only macOS 27 and later unattended, and a
> Mac can't run a newer macOS in a VM than its own. On a macOS 26 or earlier host, `vmpal systems` lists every
> macOS as `set up in the VM`: Setup Assistant (language, account, Apple Account, Siri, location and so on) is
> done by hand, and `vmpal:create` and `vmpal:all` don't apply. Follow
> [MACOS-MANUAL-SETUP.md](MACOS-MANUAL-SETUP.md) instead; it then reuses the `vmpal:*` tasks for keys,
> provisioning and checks.
> Or use [Tart](../tart-macos/README.md), whose prebuilt macOS 26 image needs no Setup Assistant.

`vmpal:all` runs `prereqs`, `create`, `keys`, `password` (unless `VM_PASSWORD` is empty), `provision`,
`snapshot`, then `start`. If `VM_NAME` already exists, `all` reuses it instead of `create`: it applies the
settings with `configure`, starts the VM if it is stopped, and continues. Settings come from `mise.local.toml` and the environment, then defaults
([Settings](../README.md#settings)).

macOS is the default: its VMs run more smoothly than Ubuntu's, and most developer tools ship Mac builds before
arm64 Linux ones.

Defaults:

| | macOS | Ubuntu |
|---|---|---|
| VM name | `macos-dev` | `ubuntu-dev` |
| System | `download:macOS` (the latest macOS, ~27 GB download) | `download:ubuntu` (26.04 LTS, arm64) |
| Disk | 100 GB | 64 GB |
| Rosetta | n/a | on |

Both get half the host's cores (at most its performance cores), 8 GB RAM, `~/shared` shared live into the guest, and shared (NAT) networking.
macOS gets the account `admin` / `admin`, as Tart's images. Linux reserves `admin`, so Ubuntu gets your Mac
user name and VMPal's generated password.

VMPal keeps each installer it downloads as a Base OS file (`vmpal library`), and `vmpal systems` then shows the
system as `kept`. A new VM from it skips the download, so a macOS VM installs in a few minutes.

Other commands: `configure`, `start`, `stop`, `restart`, `sudo`, `check`, `github-keys`, `sshd`, `ssh [cmd]`,
`exec cmd...`, `ip`.
Plain `vmpal` works too (`vmpal ui <name> screenshot -o shot.png`, `vmpal info <name>`, ...); see
[the CLI docs](https://vmpal.com/docs/command-line).

## Per-Mac prerequisites

Beyond [the shared ones](../README.md#shared-prerequisites): install VMPal and open it once.
`mise run vmpal:prereqs` links its CLI to `~/.local/bin/vmpal`. It must be a link, not a copy, because the CLI
finds the app through it.

## The guest account

VMPal creates an account named `VM_USER` (macOS: `admin`; Ubuntu: your Mac user),
with a generated password that it keeps in this Mac's keychain (`vmpal info <name> --show-password`). `all` then
sets the password to `VM_PASSWORD` (macOS: `admin`; Ubuntu: empty, so the generated one stays). The guest signs
in automatically. For macOS before 27, create the account and password in Setup Assistant instead, then register
the password with VMPal ([MACOS-MANUAL-SETUP.md](MACOS-MANUAL-SETUP.md)). The tasks read the guest account
with `id -un`, because VMPal's recorded username can remain the host's after Setup Assistant creates a different one.

- `sudo` gives the account passwordless sudo (`/etc/sudoers.d/90-vm-nopasswd`), which provisioning and
  `mise bootstrap` need unattended. On Ubuntu this goes through `vmpal exec --admin` (root); on macOS through
  `sudo -S` with VMPal's password, passed as an environment variable.
- `keys` authorises `VM_SSH_PUBKEY` and makes SSH key-only. Ubuntu gets `openssh-server`; macOS turns on
  Remote Login.
- macOS `provision` registers the non-empty `VM_PASSWORD` with VMPal before sudo setup.
  It must match the existing guest password; registration does not change it. For a manually created account,
  connect VMPal Tools first so VMPal discovers the username (see [manual setup](MACOS-MANUAL-SETUP.md#3-connect-guest-tools-and-register-the-password)).
  The password is written to `build/vmpal/account-password` with mode `600` and passed through
  `--account-password-file`. The existing `build/` gitignore rule excludes this file. `password` uses the same
  file when updating VMPal after changing the guest password. `provision --dry-run` skips registration.
- `password` sets the password to `VM_PASSWORD` (empty: it asks) in the guest and in VMPal's keychain entry, so
  VMPal can still sign in. Passwords travel as environment variables, never on a host command line.
  - macOS: `dscl . -passwd` with the old password (root cannot change a secure-token account's password
    without it), the login keychain, and automatic login's `/etc/kcpassword`.
  - Ubuntu: `chpasswd` as root.
- To keep VMPal's generated macOS password, set `VM_PASSWORD=` (empty). With `VM_NETWORK=bridged`, set your own
  password: SSH is key-only, but `admin` / `admin` is a well-known pair for anything else that listens on the LAN.

## How it works

| Step | Mechanism |
|---|---|
| Create | `vmpal create <system> --name --cpus --memory --disk --wait` (unattended install) |
| Hardware | `vmpal set --cpus --memory --disk --rosetta --network-mode --bridge --local-network --share`; `vmpal restart --apply-settings` when a setting needs it |
| Shared folder | `vmpal set --share ~/shared:shared`, live via virtiofs at `/media/VMPal/shared` (Ubuntu) or `/Volumes/My Shared Files/shared` (macOS), linked as `~/shared`. `configure` removes the earlier default `git` share |
| GitHub keys | `VM_GITHUB_AUTH_KEY` / `VM_GITHUB_SIGNING_KEY` passed with `vmpal exec --env` into the guest's `~/.ssh`. github.com host keys are pinned from `api.github.com/meta`, and a managed `Host github.com` block is written. Setting either variable empty removes that key (and the auth key's Host block) from the guest |
| Provision | macOS: `keys`, the GitHub keys, then over SSH `guest/mise.toml` with `mise bootstrap remote` and, on the first run or with `FORCE=1`, `guest/dotfiles.sh` ([Provisioning a macOS guest](../README.md#provisioning-a-macos-guest)). Ubuntu: `guest/ubuntu.sh` copied with `vmpal cp` and run with `vmpal exec`: apps, daemons, then (first run or `FORCE=1`, unless `VM_DOTFILES_REPO` is empty) a clone of `VM_DOTFILES_REPO` into `~/VM_DOTFILES_DIR`, `mise bootstrap --only dotfiles` and `mise bootstrap --skip files,repos` |
| Snapshot | `vmpal stop`, then `vmpal snapshot <name> provisioned`. Restore with `vmpal revert <name> provisioned`. A Linux VM with GPU acceleration snapshots only when shut down |

Re-running `mise run vmpal:provision` is idempotent. The dotfiles pass runs again only with `FORCE=1`.

## Ubuntu: apps and Rosetta

| App | Source |
|---|---|
| Ghostty | Ubuntu archive (`ghostty`) |
| Helium | its apt repo, signing key pinned by fingerprint; set as the default browser (`xdg-settings`) |
| Tailscale | its apt repo, signing key pinned by fingerprint |
| tty7 | x86_64 Linux tarball via Rosetta, checked against `checksums.txt`, in `~/.local/opt/tty7/<ver>` |
| MonoCode | amd64 `.deb` via Rosetta (desktop), checked against the GitHub release digest; the arm64 `monocode host` runs as a systemd user service |
| Paseo | amd64 `.deb` via Rosetta (desktop), checked against the GitHub release digest; `paseo daemon` runs as a systemd user service (`paseo.service`, web UI on `127.0.0.1:6767`) |

None of tty7, MonoCode or Paseo publish arm64 Linux desktop builds. With `VM_ROSETTA=1` (the default), VMPal
mounts Apple's Rosetta at `/media/rosetta` and registers it with binfmt, and the script adds the `amd64` dpkg
architecture with the libraries these apps need. Paseo's Electron window does not appear under Wayland, so its
launcher sets `ELECTRON_OZONE_PLATFORM_HINT=x11` (XWayland). With Rosetta off, only the Paseo CLI is installed
(`npm i -g @getpaseo/cli`).

The dock holds exactly Files, Ghostty, Helium, tty7, Paseo, MonoCode, Settings and Resources (the system monitor),
those installed, on the right and always shown. Anything else pinned is removed on the next provision.

Ghostty needs OpenGL 4.3, but VMPal's virgl GPU offers 4.1 (the macOS host's limit). Its launcher and D-Bus
service are overridden under `~/.local/share` to set `LIBGL_ALWAYS_SOFTWARE=1`, so it renders with Mesa's
llvmpipe. The screen lock is off, since the guest signs in automatically and only VMPal knows the password.

## macOS

For macOS before 27, follow the [manual setup runbook](MACOS-MANUAL-SETUP.md): creation, each Setup
Assistant screen, guest-tools recovery, provisioning, browser confirmation, snapshot and verification.
Those images reject `--user` during creation, so create them manually first. `all` can then reuse the existing VM.

`provision` applies the shared [`../guest/mise.toml`](../guest/mise.toml) (apps, daemons, Dock; see
[the overview](../README.md#what-every-macos-vm-gets)) and the dotfiles pass over SSH, so it runs `keys` first.
A fresh VMPal install has no Homebrew, and needs none: mise installs the casks and formulae itself, using the
passwordless sudo from `vmpal:sudo`. The dotfiles make Helium the default browser, which macOS confirms in a dialog: `vmpal:provision` accepts it through
VMPal's UI control (`vmpal ui ... click`), only while another browser is still the default.

## Networking

`VM_NETWORK` picks the guest's main network. `mise run vmpal:configure` applies it, with a restart when the
mode changes. If a bridged VM comes up on shared instead (VMPal says why in `vmpal info`), `configure` stops and starts
it once more, then warns.

Before authorising SSH keys, `keys` configures Tahoe (macOS 26) guests on shared/NAT networking to use
`1.1.1.1` and `1.0.0.1` on the default route's network service. This avoids hangs resolving GitHub through
the NAT DNS proxy (`192.168.64.1`). The change persists in the guest only, replaces any existing DNS override
on that service, and may prevent private/VPN-only names from resolving. Matching settings are left alone;
otherwise the DNS cache is flushed after the change. `all` and macOS `provision` both run `keys`, so they get
the fix before either SSH-key step. Ubuntu, newer macOS, bridged and host-only guests are unchanged, as is
`provision --dry-run`. To restore DHCP DNS on the default Ethernet service, run
`vmpal exec <VM> -- sudo networksetup -setdnsservers Ethernet Empty`; the next `keys` run reapplies the override.

| `VM_NETWORK` | Guest address | Who can reach it |
|---|---|---|
| `shared` (default) | `192.168.64.x`, behind NAT | this Mac only (`mise run vmpal:ssh`, Remote SSH hosts in the Mac's MonoCode or Paseo) |
| `bridged` | its own DHCP address from the LAN's router, on `VM_BRIDGE` (`auto` = the Mac's main interface) | the LAN |
| `host-only` | a network only this Mac and its host-only VMs share | this Mac, no internet |

`VM_LOCAL_NETWORK=on` adds a second network card on `192.168.128.x`, shared by this Mac and its VMs, beside the
main one. `default` follows VMPal Settings › Virtual Machines (on in a fresh install). `mise run vmpal:ip` prints
the main address, as `vmpal info` reports it; `vmpal info <name>` shows both. `vmpal set --forward` works only in shared
mode, and binds ports to the Mac's loopback.

### SSH from another device

```bash
VM_NETWORK=bridged mise run vmpal:configure   # the guest gets a LAN address
mise run vmpal:sshd start -m 180              # renders ~/.config/sshd/sshd_config in the guest, runs `mise run sshd -m 180`
mise run vmpal:sshd status
mise run vmpal:sshd stop
ssh -p 48222 admin@<mise run vmpal:ip>        # from the LAN client
```

`sshd start` uses the dotfiles' template and task, as on the Mac:

- It copies `VM_SSHD_AUTHORIZED_KEYS` (the LAN client's public key; default: this Mac's) into the guest's
  dedicated `~/.config/sshd/authorized_keys`.
- It listens on the guest's main address, port `VM_SSHD_PORT` (`48222`), with keys only and
  `AllowUsers <user>@<VM_SSHD_ALLOW_FROM>` (default `192.168.1.168`).
- Bridging keeps the client's source address, so the allowlist applies as written. Under shared networking only
  this Mac can reach the guest, so `sshd start` warns.
- `stop` ends open sessions as well as the listener; the task also stops itself after the given minutes.

The guest's own Remote Login (port 22, from `keys`) is key-only, and is on the LAN too while bridged.

### Tailscale

To reach the guest from outside the LAN, use Tailscale. Export an auth key for the one provision run. It is
passed with `vmpal exec --env`, so it lands in no file on this Mac. In the guest, the script writes it to a
private temporary file for `tailscale up --auth-key=file:...`, with the shell trace off, and deletes it:

```bash
VM_TAILSCALE_AUTHKEY=tskey-... mise run vmpal:provision
```

Without a key, run `sudo tailscale up` in the guest.

## Known issues

- `vmpal restart`, or rebooting inside the guest, hung once an Ubuntu 26.04 guest had shut down (VMPal 0.60).
  Recover with `vmpal stop <name> --force`, then start it. `mise run vmpal:restart` stops and starts instead, which
  works, as does `vmpal restart --apply-settings`. On VMPal 0.66, `vmpal restart --wait` works for macOS guests.
- Ubuntu on VMPal 0.66: the first start on a bridged network sometimes falls back to shared ("vmnet didn't start
  the interface (status 1001)"), and `vmpal restart --apply-settings` sometimes reports the guest "didn't shut
  down" and leaves the settings waiting. Another stop and start (`mise run vmpal:restart`) fixed both.
- The guest clock stops while the Mac sleeps. chrony is set to step the clock whenever it is more than a second
  off (`/etc/chrony/conf.d/vm-step.conf`), otherwise apt rejects repos as "not valid yet" for hours.
- Ubuntu 26.04's sudo-rs ignores `sudo -E`; pass variables explicitly (`sudo VAR=value cmd`).
- On the first macOS 26.6.2 boot with VMPal 0.69, the display stayed black until the newly installed VM
  was reset. Reset only before guest work exists; it discards unsaved work.
- `vmpal reinstall-tools` did not connect tools after Setup Assistant in the tested macOS VM. Launching
  the shared `Install VMPal Tools.app` connected version 0.38.
- If Helium remains unset after provisioning, repeat the default-browser request or select Helium in
  System Settings → Desktop & Dock, then verify HTTP and HTTPS open with Helium.
- zsh plugin compilation uses basenames from each source directory: `zcompile` failed with absolute
  paths containing fast-syntax-highlighting's `→chroma` directory on both Apple's zsh 5.9 and Homebrew 5.9.2.

## Status

These runs used `vm.sh`, before its commands moved to the `vmpal:*` tasks unchanged.

Tested end to end on VMPal 0.60 with Ubuntu 26.04.1: a clean `all`, `check`, an idempotent
re-provision, a restart, and Ghostty, tty7 and the Paseo desktop app opening.

Tested on VMPal 0.66 with macOS 27.0.1 from the kept installer: `all` through `create`, `keys`,
`password` (`admin` / `admin`, with automatic login after a restart) and `provision` up to
`mise bootstrap`; `restart`; a bridged `configure`; and `sshd start`, a connection from the Mac's
LAN address, a refused connection from outside `VM_SSHD_ALLOW_FROM`, `status` and `stop`.

Also on VMPal 0.66 with Ubuntu 26.04.1: `create`, `keys`, `password`, `ssh`, bridged `configure`, and `sshd`
start, connect, `status` and `stop`. `provision` was not run again.

On VMPal 0.69, macOS 26.6.2 (25G83) was created through the manual Setup Assistant path above and provisioned
with the guest script that preceded `guest/mise.toml`. Verified admin SSH/passwordless sudo, GitHub SSH authentication, installed apps and
mise tools, Paseo HTTP 200, the running MonoCode host, signed-out Tailscale, Helium's HTTP/HTTPS defaults,
hidden widgets, the right-hand Dock, and an interactive Ghostty shell running Node and `omp`. The Unicode
plugin-cache fix was also exercised against a fresh plugin clone.
A `provisioned` snapshot was taken with the VM stopped; after starting again, admin SSH, both host daemons,
Paseo HTTP 200, signed-out Tailscale and Helium's HTTP/HTTPS defaults were verified again.

On VMPal 0.90 with macOS 27.0.1 (`download:macOS`): `vmpal:all` created the VM unattended, then, run again on it,
reused it and finished with the base pass, the dotfiles pass, the `provisioned` snapshot and a start. Verified
with `vmpal:check` (apps, Paseo HTTP 200, GitHub SSH, signed-out Tailscale), both eMudhra roots absent from
`/etc/ssl/cert.pem`, `/usr/bin/curl` rejecting the incident's test hosts, and the root-removal daemon's boot run
exiting 0.
