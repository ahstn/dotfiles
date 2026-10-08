# Ubuntu Desktop VM on UTM (Apple Silicon)

Builds a GUI Ubuntu 26.04.1 LTS (arm64) VM on UTM 5.0.6+ with the QEMU backend, hardware-virtualised
and GPU-accelerated, then applies [ahstn/dotfiles](https://github.com/ahstn/dotfiles) inside it.

Superseded by the macOS guest on Tart in [`..`](../README.md), which is faster and runs the Mac apps natively.
Kept for when a Linux desktop is needed.

**Status: untested on a Mac with UTM installed.** `cidata` rendering and YAML were checked; everything
that talks to UTM (AppleScript property names, `utmctl` snapshot/exec syntax, plist keys, GRUB keystrokes)
follows UTM's scripting reference (`Scripting/UTM.sdef`) and `utmctl` source but has not been run. Steps whose
failure is recoverable warn; ejecting the install media fails hard, because booting the installer again would
rerun autoinstall over the disk.

## Usage

```bash
cd virtual-machine/_ubuntu
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
2. `./vm.sh prereqs` writes `QEMURendererBackend=2` (ANGLE Metal) into UTM's sandbox container
   preferences. This is app-wide, not part of the VM bundle. Writing to the container plist (not plain
   `defaults write com.utmapp.UTM`) is what the sandboxed app actually reads, but verify in
   UTM > Settings > QEMU Graphics Acceleration.
3. Have an SSH key (`ssh-keygen -t ed25519`); its public key (`VM_SSH_PUBKEY`) authorises SSH *into* the guest,
   and `vm.sh` passes its private half (same path without `.pub`) to `ssh -i`.
4. The guest user defaults to your macOS short name. If that is reserved on Ubuntu (`admin`, `staff`, ...) or not
   a valid Linux name, set `VM_USER`; `cidata` and `all` refuse it up front.

## Updating an existing VM

The VM keeps running except for the renderer switch, which needs UTM itself quit.

```bash
git pull                     # on feat/utm-ubuntu-vm
# Shut the guest down and quit UTM (Cmd-Q), then:
./vm.sh prereqs              # renderer -> ANGLE Metal; refuses while UTM is open
/Applications/UTM.app/Contents/MacOS/utmctl start ubuntu-dev   # or start it from UTM
./vm.sh provision            # waits for SSH; apps, dock pins, password policy; earlier steps are skipped
./vm.sh check
```

`provision` re-runs the parts that are safe to repeat (password policy, ghostty, Helium, Tailscale, FEX-Emu, tty7, MonoCode host, dock pins)
even on a VM that is already provisioned. `FORCE=1` also re-runs the apt packages, `mise bootstrap` and Paseo after them.
Log out of the guest and back in afterwards, so `~/.local/bin` is on `PATH` and the new dock pins show up.

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
| Provision | `guest/provision.sh` uploaded and run over SSH to `127.0.0.1:2222`: password policy, apps (ghostty, Helium, Tailscale, FEX-Emu, tty7, MonoCode host), apt packages, mise, clone dotfiles to `~/git/dotfiles`, `mise bootstrap --skip files,repos`, Paseo, login shell set to zsh |
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

- `VM_GITHUB_AUTH_KEY` (default `~/.ssh/github`) and its `.pub` go to the guest's `~/.ssh/github`, whatever the
  file is called on the Mac. A managed
  `Host github.com` block (`IdentitiesOnly yes`) is written to `~/.ssh/config`. The script then runs
  `ssh -T git@github.com` to check the key works.
- `VM_GITHUB_SIGNING_KEY` (default `~/.ssh/github-signing-key`) and its `.pub` go to `~/.ssh/github-signing-key`.
- Set either to empty to skip it. Private keys stream over SSH straight into place, so they are never staged on the host.
- Passphrase-protected keys need an `ssh-agent` in the guest.
- `.config/git/.gitconfig` sets `signingkey = ~/.ssh/github-signing-key.pub`. Git expands `~` per machine, so
  the copied signing key works for signed commits in the guest once the dotfiles are applied.

## Apps and x86_64 binaries

`provision` installs these on every run, before the already-provisioned check, so `./vm.sh provision` adds them
to existing VMs. Steps that are already done are skipped.

- `ghostty` from the Ubuntu archive. This tends to trail upstream by a point release (1.3.0 against 1.3.1 in
  October 2026); the community `.deb` or the snap are newer if that matters.
- [Tailscale](https://tailscale.com) from its apt repo, with the signing key pinned by fingerprint
  (`2596A99E…957F5868`, no expiry). Provisioning does not log in by default; afterwards run
  `sudo tailscale up --operator=$USER` in the guest and open the URL it prints. To log in unattended, export
  `VM_TAILSCALE_AUTHKEY` for `./vm.sh provision`. The key goes over SSH stdin into a private file, which
  `tailscale up --auth-key=file:...` reads and provisioning then deletes. Do not put it in `config.env`.
  The guest reaches the tailnet outbound through QEMU's NAT, so tailnet peers can reach it even when the
  Mac's firewall blocks the LAN forward. If no direct path gets through both NATs, traffic is relayed (DERP),
  which is slower.
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
  The desktop entry sets `VK_ICD_FILENAMES` to the RootFS's llvmpipe driver, because `tty7-app` aborts under FEX
  right after choosing the virtio-gpu Venus Vulkan device. Rendering is therefore on the CPU.
- [MonoCode](https://www.usemono.dev) host (`monocode-host-linux-arm64.tar.gz` from the latest release, checked
  against its `.sha256`, bundling its own Node) in `~/.local/opt/monocode-host/<ver>`, with a `monocode-host` wrapper in
  `~/.local/bin`. `monocode-host service install` runs it as the `monocode-host.service` systemd user unit on
  `127.0.0.1:3774` and enables lingering; a new version restarts it. On the Mac, add the VM in MonoCode under
  Settings → Connections → Add machine (an SSH alias for `127.0.0.1:2222`); it reuses this host and pairs itself.
  MonoCode's desktop app has no arm64 Linux build, and the x86_64 one needs WebKitGTK 4.1, which FEX's RootFS lacks.

[Paseo](https://paseo.sh) needs the mise Node, so it is installed after `mise bootstrap` (first provision, or
`FORCE=1`): `npm install -g --prefix ~/.local @getpaseo/cli`, with the bundled web UI enabled and the relay left off.
The `paseo.service` systemd user unit runs `paseo daemon run` on `127.0.0.1:6767`, so open that in Helium in the guest,
or add the VM in the Mac's Paseo desktop as a Remote SSH host (`ssh://<user>@127.0.0.1:2222`). `bzip2` is installed
for its local speech models. Paseo's Linux desktop app is x86_64 only.

Helium and tty7 are pinned to the Ubuntu dock (`org.gnome.shell favorite-apps`), after any existing pins and
without duplicates. When you are logged in to the desktop, the dock updates immediately; otherwise it applies at next login.

Tested in the VM: `tty7-app` runs under FEX with llvmpipe; the Paseo daemon, its web UI and the MonoCode host run
natively as user services.

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
the remote shell running the command. `sshd stop`, and the task's timer, end established sessions as well as
the listener, because OpenSSH session processes otherwise outlive it.

Differences from the Mac sshd in `.config/sshd/sshd_config.tera`:
- **The allowlist includes `10.0.2.2`.** QEMU's user-mode NAT keeps a LAN client's real source IP on forwarded
  connections, so `AllowUsers user@192.168.1.168` works as on the Mac. Connections from the host itself arrive as
  `10.0.2.2`. Set `VM_SSHD_ALLOW_FROM` to your client IPs/CIDRs (default `10.0.2.2,192.168.1.168`).
- The Mac must be reachable on its LAN address: allow incoming connections to UTM/QEMU in the macOS firewall.
- The forward binds the address at create time. If that DHCP lease changes, QEMU may fail to start or the
  forward goes stale; run `./vm.sh forward`, or set `VM_SSHD_FWD_ADDR=0.0.0.0` (all interfaces).
- UTM's GUI docs say an empty host address means loopback, while the scripting reference says any interface.
  That is why the address is always set explicitly.

## Acceptance checks

`./vm.sh check` covers most. Then `./vm.sh sshd start` and connect from a LAN client on port 48222. Also by hand: `glxinfo -B` in the guest desktop reports `virgl` and
OpenGL 2.1 with ANGLE Metal (4.1 means Apple Core OpenGL is still active; `llvmpipe` means no acceleration); GNOME
Files and Settings render without missing text, black regions or window trails; clipboard works both ways; resizing the window resizes the desktop.

## Known blockers in the dotfiles repo (not changed here)

1. `mise.toml` links `.omp/agent/extensions/openrouter-routing.ts`, which is missing from the repo, so
   `mise dotfiles apply` fails on a fresh clone until it is committed or the entry removed.
2. The `files` phase needs `TERN_TAILSCALE_EMAIL` / `TERN_SSH_FINGERPRINT`; skipped.
3. `brew:` entries in `[bootstrap.packages]` are attempted on Linux; outcome on ARM Ubuntu unknown.
4. `[tasks.bootstrap]` installs a crontab in the VM too.
5. `[bootstrap.repos]` uses an SSH URL; skipped.
6. Provisioning sets the login shell to zsh (`sudo chsh` after bootstrap); log out and back in.

Provisioning surfaces these failures rather than hiding them. Rerun with `FORCE=1 ./vm.sh provision`.

## Fallbacks

- Graphics broken: change the display card to `virtio-gpu-pci` (software rendering).
- Auto-resize stuck: delete `~/.config/monitors.xml` in the guest and log out.
- Wayland: keep the default GNOME session for clipboard support.
