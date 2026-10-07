# Ubuntu Desktop VM on UTM (Apple Silicon)

Builds a GUI Ubuntu 26.04.1 LTS (arm64) VM on UTM 5.0.6+ with the QEMU backend, hardware-virtualised
and GPU-accelerated, then applies [ahstn/dotfiles](https://github.com/ahstn/dotfiles) inside it.

**Status: untested on a Mac with UTM installed.** `cidata` rendering and YAML were checked; everything
that talks to UTM (AppleScript property names, `utmctl` snapshot/exec syntax, plist keys, GRUB keystrokes)
follows UTM's scripting reference (`Scripting/UTM.sdef`) and `utmctl` source but has not been run. Steps whose
failure is recoverable warn; ejecting the install media fails hard, because booting the installer again would
rerun autoinstall over the disk.

## Usage

```bash
cd virtual-machine
cp config.env.example config.env   # optional
export VM_PASSWORD=...             # or enter it when prompted
./vm.sh all
```

Or step by step: `prereqs`, `iso`, `cidata`, `create`, `install`, `provision`, `check`, `snapshot`.
Settings come from exported env vars, then `config.env`, then defaults, so `GRUB_AUTOINSTALL=1 ./vm.sh install`
overrides the file.

Defaults: 8 GiB RAM, 64 GiB disk, CPU cores 0 (host performance-core count), guest user = your macOS
username, `~/git` shared to `~/utm` in the guest. Override via env or `config.env`.

## Per-Mac prerequisites

1. Install UTM 5.0.6 (GitHub pre-release `UTM.dmg`), launch it once, quit it.
2. `./vm.sh prereqs` writes `QEMURendererBackend=3` (Apple Core OpenGL) into UTM's sandbox container
   preferences. This is app-wide, not part of the VM bundle. Writing to the container plist (not plain
   `defaults write com.utmapp.UTM`) is what the sandboxed app actually reads, but verify in
   UTM > Settings > QEMU Graphics Acceleration.
3. Have an SSH key (`ssh-keygen -t ed25519`); its public key (`VM_SSH_PUBKEY`) authorises SSH *into* the guest.

## Manual steps

- **Shared folder (fallback only):** `create` sets `$VM_SHARE_DIR` with AppleScript `update registry`. If that
  fails, set Edit > Sharing > VirtFS > Browse by hand; `./vm.sh all` pauses for this before installing.
- **Autoinstall confirmation:** if the installer waits for confirmation, rerun with `GRUB_AUTOINSTALL=1`
  (sends the `autoinstall` kernel arg through GRUB's editor; tune `GRUB_LINUX_LINE_DOWNS`), or confirm by hand.

## How it works

| Step | Mechanism |
|---|---|
| ISO | downloaded and checked against `SHA256SUMS` into `build/` |
| Seed | `autoinstall/user-data.tmpl` rendered (password hashed with `openssl passwd -6`), packed with `hdiutil` as a `CIDATA` ISO |
| VM | AppleScript `make new virtual machine`: aarch64, hypervisor, UEFI, `virtio-gpu-gl-pci`, dynamic resolution, VirtFS, emulated-VLAN network with two port forwards |
| Clipboard, balloon | PlistBuddy edits to `config.plist` (not scriptable), then `reload configuration` |
| Install | autoinstall powers the VM off; the script then ejects both ISOs and boots the installed system |
| GitHub keys | `VM_GITHUB_AUTH_KEY` / `VM_GITHUB_SIGNING_KEY` streamed into the guest's `~/.ssh`, github.com host keys pinned from `api.github.com/meta`, managed `Host github.com` block |
| Provision | `guest/provision.sh` uploaded and run over SSH to `127.0.0.1:2222`: password policy, apps (ghostty, Helium, FEX-Emu, tty7), apt packages, mise, clone dotfiles to `~/git/dotfiles`, `mise bootstrap --skip files,repos` |
| Snapshot | guest shutdown requested (`utmctl stop --request`), forced only after 3 minutes, then `utmctl snapshot create` |

Passwordless sudo is enabled in the guest because bootstrap needs unattended sudo. With
`VM_PASSWORDLESS_SUDO=0`, `provision` must run from an interactive terminal so sudo can prompt. The seed ISO and `build/` are gitignored; the seed holds a password hash.

Guest passwords only need 4+ characters, since the VM already sits behind the Mac's login. libpwquality
cannot go below 6, so `provision` sets it to warn only (`/etc/security/pwquality.conf.d/90-vm.conf`) and adds
`minlen=4` to `pam_unix` in `/etc/pam.d/common-password`. `passwd` still prints a "BAD PASSWORD" warning, but
accepts the password. `pam-auth-update` then leaves `common-password` alone as locally modified. To apply this to an
existing VM, run `./vm.sh provision`: these lines run before the already-provisioned check.

## GitHub SSH keys

`provision` (or `./vm.sh github-keys` on its own) copies the Mac's GitHub keys into the guest, so `git` over SSH
and SSH commit signing work there. This is separate from `VM_SSH_PUBKEY`, which is only for SSH into the guest.

- `VM_GITHUB_AUTH_KEY` (default `~/.ssh/github`) and its `.pub` go to `~/.ssh/` with the same name. A managed
  `Host github.com` block (`IdentitiesOnly yes`) is written to `~/.ssh/config`. The script then runs
  `ssh -T git@github.com` to check the key works.
- `VM_GITHUB_SIGNING_KEY` (default `~/.ssh/github-signing-key`) and its `.pub` are copied alongside.
- Set either to empty to skip it. Private keys stream over SSH straight into place, so they are never staged on the host.
- Passphrase-protected keys need an `ssh-agent` in the guest.
- `.config/git/.gitconfig` sets `signingkey = ~/.ssh/github-signing-key.pub`. Git expands `~` per machine, so
  the copied signing key works for signed commits in the guest once the dotfiles are applied.

## Apps and x86_64 binaries

`provision` installs these on every run, before the already-provisioned check, so `./vm.sh provision` adds them
to existing VMs. Steps that are already done are skipped.

- `ghostty` from the Ubuntu archive.
- [Helium](https://helium.computer) (`helium-bin`, native arm64) from its apt repo, so `apt upgrade` updates it.
  Its signing key is checked against a pinned fingerprint (`BE677C19…01D6378E`, expires 2028-10-10). The package
  declares no dependencies, so the Chromium runtime libraries (`libnss3`, `libcups2t64`, ...) are installed with it.
- [FEX-Emu](https://fex-emu.com) from `ppa:fex-emu/fex`, for apps that only ship x86_64 Linux builds. The package
  variant (`armv8.0/8.2/8.4`) is chosen from `/proc/cpuinfo`, as FEX's `InstallFEX.py` does. `fex-emu-binfmt64`
  lets x86_64 binaries run directly, without a `FEXBash` prefix. The x86 libraries come from FEX's Ubuntu 24.04 RootFS
  (about 1.9 GB, in `~/.local/share/fex-emu/RootFS`; the newest FEX offers). It is set in
  `~/.config/fex-emu/Config.json`, because the fetcher does not save its own default.
- [tty7](https://github.com/l0ng-ai/tty7) via `install_x86_release l0ng-ai/tty7 tty7`. This installs the newest
  stable `vX.Y.Z` release tarball, checked against its `checksums.txt`, into `~/.local/opt/tty7/<ver>`. It links the
  executables into `~/.local/bin` and adds a desktop entry. Other x86-only apps that publish
  `<name>-<ver>-linux-x86_64.tar.gz` plus `checksums.txt` can use the same function.

Helium and tty7 are pinned to the Ubuntu dock (`org.gnome.shell favorite-apps`), after any existing pins and
without duplicates. When you are logged in to the desktop, the dock updates immediately; otherwise it applies at next login.

Tested in an arm64 Ubuntu 26.04 container: `tty7 --version` runs under FEX, and `tty7-app` loads and starts its
daemon. The GUI window and binfmt registration need the VM's desktop and systemd, which a container lacks.

## Networking and the LAN sshd

The VM uses UTM's **Emulated VLAN** mode (the only mode with port forwarding), not Shared. The guest sits
behind QEMU's NAT at `10.0.2.x`, so `utmctl ip-address` is not reachable from the host. Two forwards:

| Host side | Guest | Purpose |
|---|---|---|
| `127.0.0.1:2222` | `:22` | provisioning and admin (system sshd; loopback only) |
| `<en0 IPv4>:48222` | `:48222` | ephemeral LAN sshd |

```bash
./vm.sh sshd start 180     # renders ~/.config/sshd/sshd_config in the guest, runs `mise run sshd -m 180`
./vm.sh sshd status
./vm.sh sshd stop
ssh -p 48222 <user>@<mac-lan-ip>   # from the LAN client
./vm.sh forward            # VM stopped: re-point the forward after your Mac's DHCP address changes
```

`sshd start` copies `VM_SSHD_AUTHORIZED_KEYS` (the **LAN client's** public key; defaults to the Mac's own key)
into the guest's dedicated `~/.config/sshd/authorized_keys`, then reuses the dotfiles' sshd template and task.
The daemon is tracked through the template's `PidFile`. `pkill -f` is not used, because on Linux it would also match
the remote shell running the command.

Differences from the Mac sshd in `.config/sshd/sshd_config.tera`:
- **No per-client IP allowlist.** QEMU's user-mode NAT makes every connection look like `10.0.2.2` to the guest,
  so `AllowUsers user@192.168.1.168` cannot work; the guest allows `10.0.2.2`. Key-only auth, no forwarding,
  and the time window remain. If you need source filtering, add a pf rule on the Mac for the forwarded port.
- The Mac must be reachable on its LAN address: allow incoming connections to UTM/QEMU in the macOS firewall.
- The forward binds the address at create time. If that DHCP lease changes, QEMU may fail to start or the
  forward goes stale; run `./vm.sh forward`, or set `VM_SSHD_FWD_ADDR=0.0.0.0` (all interfaces).
- UTM's GUI docs say an empty host address means loopback, while the scripting reference says any interface.
  That is why the address is always set explicitly.

## Acceptance checks

`./vm.sh check` covers most. Then `./vm.sh sshd start` and connect from a LAN client on port 48222. Also by hand: `glxinfo -B` in the guest desktop reports `virgl` and
OpenGL 4.1 (2.1 means the renderer pref is not active; `llvmpipe` means no acceleration); GNOME Files and
Settings render without black regions; clipboard works both ways; resizing the window resizes the desktop.

## Known blockers in the dotfiles repo (not changed here)

1. `mise.toml` links `.omp/agent/extensions/openrouter-routing.ts`, which is missing from the repo, so
   `mise dotfiles apply` fails on a fresh clone until it is committed or the entry removed.
2. The `files` phase needs `TERN_TAILSCALE_EMAIL` / `TERN_SSH_FINGERPRINT`; skipped.
3. `brew:` entries in `[bootstrap.packages]` are attempted on Linux; outcome on ARM Ubuntu unknown.
4. `[tasks.bootstrap]` installs a crontab in the VM too.
5. `[bootstrap.repos]` uses an SSH URL; skipped.
6. Bootstrap sets the login shell to zsh; log out and back in.

Provisioning surfaces these failures rather than hiding them. Rerun with `FORCE=1 ./vm.sh provision`.

## Fallbacks

- Graphics broken: change the display card to `virtio-gpu-pci` (software rendering).
- Auto-resize stuck: delete `~/.config/monitors.xml` in the guest and log out.
- Wayland: keep the default GNOME session for clipboard support.
