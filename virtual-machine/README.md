# Dev VMs (Apple Silicon)

Builds a macOS dev VM, then applies [ahstn/dotfiles](https://github.com/ahstn/dotfiles) and the usual apps
inside it. There are two engines; pick one per VM. Both use Apple's Virtualization.framework, so CPU, memory and
disk performance are about equal, and both apply the same guest config (`guest/mise.toml`), so the VMs end up
the same.

| Engine | Directory | In short |
|---|---|---|
| [VMPal](https://vmpal.com) | [`vmpal-macos/`](vmpal-macos/README.md) | The default on macOS 27 hosts: unattended macOS install, guest tools and UI control for agents, Ubuntu desktops with GPU |
| [Tart](https://tart.run) | [`tart-macos/`](tart-macos/README.md) | Any recent host: a prebuilt, already set-up image, headless runs, everything over SSH |

Both are driven by [mise](https://mise.jdx.dev) tasks from this folder:

```bash
cd virtual-machine
cp mise.local.toml.example mise.local.toml   # optional
mise trust
mise run vmpal:all                           # or tart:all
```

`mise tasks` lists every task, and `mise run <task> --help` shows a task's arguments.

> [!WARNING]
> Keep repositories, build output and `node_modules` on the guest's own disk (the guest's `~/git`), not in the
> shared folder. The host's `~/shared` appears in the guest as `~/shared`: use it only to pass files across.
> Under heavy I/O the share can report existing files as missing
> ([openai/tart#567](https://github.com/openai/tart/issues/567)), and one user's `fio` run measured it at about a
> tenth of the guest disk's throughput ([openai/tart#762](https://github.com/openai/tart/issues/762)).

> [!CAUTION]
> FIDO USB security keys (YubiKeys and the like) don't work in Tart VMs. macOS 27 added USB passthrough to
> Apple's Virtualization framework (`VZUSBPassthroughDevice`), but Tart has not adopted it: the request,
> [openai/tart#139](https://github.com/openai/tart/issues/139), is still open, waiting on Apple's USB entitlement
> for Tart's maintainers. VMPal passes USB devices through on macOS 27 hosts, from the menu bar's Virtual Machine
> Accessories menu ([USB Devices](https://vmpal.com/docs/usb-devices)); FIDO keys there are untested, so check
> with `ykman info` or `fido2-token -L` in the guest.

## Choosing an engine

| | VMPal | Tart |
|---|---|---|
| Host macOS | macOS 27 for an unattended macOS guest. A Mac can't run a newer macOS in a VM than its own, and VMPal sets up only macOS 27 and later unattended, so older hosts need [manual Setup Assistant](vmpal-macos/MACOS-MANUAL-SETUP.md) | Any host that runs the image's macOS (`macos-tahoe-base`: macOS 26 or later). Setup Assistant was done when the image was built |
| macOS source | Apple's installer, downloaded by VMPal and kept as a Base OS file for later VMs | Cirrus Labs' OCI image from `ghcr.io` (~27 GB pull), with Homebrew, mise, passwordless sudo and auto-login preset |
| Guests here | macOS (default) and Ubuntu 26.04 | macOS |
| Headless / CI | Runs through the VMPal app, which must be installed and opened once | `VM_HEADLESS=1` (`--no-graphics`); a single CLI binary, built for CI |
| GPU | Paravirtualised on macOS; OpenGL 4.1 (virgl) on Linux | Paravirtualised on macOS; none on Linux |
| Talking to the guest | VMPal Tools: `vmpal exec` / `vmpal cp`, no SSH or password needed to provision | SSH, after `keys` uses the image password once |
| Agent tooling | `vmpal ui` observes, screenshots and clicks the guest's screen (used to accept dialogs such as the default browser's); `vmpal exec` runs commands | SSH only |
| Networking | `VM_NETWORK`: `shared` (NAT), `bridged` or `host-only`, plus an optional local network | `VM_NETWORK`: `shared` (NAT) or `bridged` |
| Snapshots | `vmpal snapshot` / `vmpal revert` | `tart clone` to `<name>-<tag>` (APFS copy) |
| Reusable base | `vmpal clone`, or `vmpal compress` / `vmpal import` (`.vmpalvm`) | push or clone OCI images |

Choose **VMPal** on a macOS 27 host, for an Ubuntu desktop, or when an agent should drive the guest's screen.
Choose **Tart** on a macOS 26 host, for headless or scripted runs, or when nothing should be set up by hand.

## Layout

```text
virtual-machine/
├── README.md               # this file: what both engines share
├── mise.toml               # the tasks' config: Tart for the tart:* tasks, the lint task
├── mise.local.toml.example # your settings, as mise.local.toml (git-ignored)
├── .miserc.toml            # keeps the dotfiles repo's own mise config out of this folder
├── mise-tasks/tart/*, mise-tasks/vmpal/*   # one file task per command: tart:start, vmpal:provision, ...
├── lib/common.sh, lib/tart.sh, lib/vmpal.sh  # the tasks' bash
├── guest/                  # every macOS guest, both engines
│   ├── mise.toml           # the base: apps, Dock, defaults, agents and hooks, as mise bootstrap config
│   ├── mise.local.toml     # optional, git-ignored: your changes to the base
│   ├── monocode-host.sh    # run by the base's hooks
│   ├── distrust-emudhra-roots.sh  # run by the base's hooks
│   └── dotfiles.sh         # the dotfiles pass
├── tart-macos/README.md
└── vmpal-macos/
    ├── README.md, MACOS-MANUAL-SETUP.md
    └── guest/ubuntu.sh     # the Ubuntu guest script
```

### Provisioning a macOS guest

Each engine's `provision` task does the same, over SSH:

1. Copies the GitHub keys into the guest.
2. **Base pass:** `mise bootstrap remote` sends `guest/` into the guest and applies `guest/mise.toml` there.
   mise stages its own version in the guest and keeps it at `~/.local/bin/mise`, so the host and the guest run
   the same mise. Remote runs pass no environment, so the task writes the share name into the copy it sends, as
   `mise.vm.local.toml`.
3. **Dotfiles pass**, on the first run or with `FORCE=1`, unless `VM_DOTFILES_REPO` is empty: `guest/dotfiles.sh`
   clones `VM_DOTFILES_REPO` into `~/VM_DOTFILES_DIR` (`~/git/dotfiles`) and applies its mise config:
   `mise bootstrap --only dotfiles`, then `mise bootstrap --skip files,repos,macos-defaults`. A second base pass,
   `--only macos-defaults`, then applies the dotfiles' macOS defaults with the base's on top.
   - `VM_DOTFILES_REPO` can be any Git URL or path the guest can clone, such as your own fork or alternative,
     as long as its `mise.toml` declares `[dotfiles]`. A public HTTPS URL needs nothing else. The GitHub keys are
     copied in before this pass, so a `git@github.com:` URL can use `VM_GITHUB_AUTH_KEY`.
   - Set `VM_DOTFILES_REPO` empty to provision only the base. `tart:sshd` and `vmpal:sshd` need the dotfiles'
     `sshd` task and template, so they need a repository that has them.
   - An existing `~/VM_DOTFILES_DIR` that is a clone of another repository stops the pass, rather than
     applying the old one. Move it aside or choose another `VM_DOTFILES_DIR`.
4. Logs in to Tailscale when `VM_TAILSCALE_AUTHKEY` is set.

`mise run tart:provision --dry-run` (or `vmpal:provision --dry-run`) runs the base pass with `--dry-run`: it
connects and inspects the guest, prints what would change, and changes nothing.

Once the dotfiles are linked, the guest's global mise config (`~/.config/mise/config.toml`) loads in every base
pass too, so its packages and defaults are kept up to date. Where it and the base set the same thing, the base
wins: the dotfiles' Dock settings are for the host Macs. To add to or change the base:

| Where | Loaded | Use for |
|---|---|---|
| `.config/mise/config.vm.toml` in the dotfiles | in the guest, with the `vm` config environment that the base selects | your additions for every VM: packages, tools, defaults, hooks. It cannot change what the base sets |
| `guest/mise.local.toml` (git-ignored) | sent along with `guest/` | anything, including the base's own values, for the VMs this checkout provisions |

`[bootstrap.packages]` replaces an entry with the same key, `[bootstrap.macos.*]` a value with the same domain
and key, and hooks from every file all run.

Engine-specific steps (creating the VM, the account, its password, sudo, SSH keys, networking) stay in each
engine's `lib/<engine>.sh`. Each task file sources it and calls one function.

### Settings

Settings are `VM_*` environment variables. mise sets them from `[env]` in `mise.local.toml`, and the libs fill
in defaults for the rest. `mise.local.toml.example` lists them all. Written as `VM_CPU = { default = "6" }`, a
value still gives way to one exported in your shell, so `VM_CPU=4 mise run tart:configure` works for one run.
Secrets (`VM_TAILSCALE_AUTHKEY`, a real `VM_PASSWORD`) are exported for the one run and never go in the file.

The `.miserc.toml` here leaves out the repo's root `mise.toml` and `.config/mise/`, so a task doesn't first
install every tool the dotfiles declare. Tart comes from the mise registry (`aqua:openai/tart`), pinned in
`mise.toml` and installed for the `tart:*` tasks only. `mise run lint` runs shellcheck over the tasks, the libs
and the guest scripts.

Moving from `vm.sh`: copy the settings from an old `config.env` into `mise.local.toml`. Tart's `VM_NET`
(`nat`/`bridged`), `VM_BRIDGE_IF` and `VM_MEMORY_MIB` are now `VM_NETWORK` (`shared`/`bridged`), `VM_BRIDGE`
and `VM_MEMORY_GB`, the same names as VMPal. Tart's `build/` moved from `tart-macos/build` to `build/tart`, so
the first SSH connection records the guest's host key again.

## Shared prerequisites

1. An Apple Silicon Mac.
2. An SSH key (`ssh-keygen -t ed25519`). `VM_SSH_PUBKEY` authorises SSH into the guest.
3. Optionally, GitHub keys for the guest: `VM_GITHUB_AUTH_KEY` (`~/.ssh/github`) and `VM_GITHUB_SIGNING_KEY`
   (`~/.ssh/github-signing-key`). Set either empty to skip it.
4. Apple's licence allows two macOS VMs running at once per Mac, across both engines.
5. Optionally, a Tailscale auth key, exported as `VM_TAILSCALE_AUTHKEY` for one `provision` run. Never put it
   in `mise.local.toml`.
6. [mise](https://mise.jdx.dev/getting-started.html) 2026.10.17 or later, which runs the tasks and installs
   Tart. Earlier versions still trust the compromised eMudhra intermediate CAs.

## What every macOS VM gets

| | |
|---|---|
| Account | `admin` / `admin`, with passwordless sudo and automatic login. `VM_PASSWORD` replaces the password; set one before bridging onto the LAN |
| SSH | `keys` authorises `VM_SSH_PUBKEY` and makes SSH key-only |
| GitHub | the GitHub keys in the guest's `~/.ssh`, github.com host keys pinned from `api.github.com/meta`, and a managed `Host github.com` block |
| Shared folder | the host's `~/shared`, created if missing, shared live into the guest at `/Volumes/My Shared Files/shared` and linked as `~/shared` (`VM_SHARE_DIR`, `VM_SHARE_NAME`). For passing files only; see the warning above |
| Housekeeping | Spotlight indexing off; macOS updates not downloaded or installed automatically (checking, security responses and XProtect data stay on); Reduce Motion and Reduce Transparency on, and the Dark appearance, from the next login. Reapplied on every provision |
| CA roots | `emSign ECC Root CA - G3` and `AAA Certificate Services` removed from `/etc/ssl/cert.pem`, before any package download. These roots sign the [compromised eMudhra intermediates](https://support.apple.com/en-us/149555), which macOS's `curl`, `git` and `python3` still accept. Apple's version stays at `/etc/ssl/cert.pem.orig`. The `local.vm.distrust-emudhra-roots` launchd daemon removes them again at boot and whenever a macOS update restores the file. Sites that chain only to `AAA Certificate Services` fail in those tools |
| Dotfiles | the dotfiles pass (above): `VM_DOTFILES_REPO` (default `https://github.com/ahstn/dotfiles.git`; empty = none) cloned into `~/VM_DOTFILES_DIR` (`~/git/dotfiles`) and applied once |
| mise | the host's version at `~/.local/bin/mise`. `~/.config/mise/miserc.toml` selects the `vm` config environment for every mise run in the guest, which loads the dotfiles' `config.vm.toml` |
| Dock | exactly Ghostty, Helium, tty7, Paseo, MonoCode, Claude, ChatGPT, bb, Slack, Vorssaint and System Settings (after Finder), on the right and always shown |
| Checks | the `check` task prints the macOS version, mise tools, shell, disk, shared folder, apps, Tailscale, the Paseo agent and GitHub SSH auth |

### Apps

The base pass installs these on every run, so it also adds them to existing VMs; mise skips what is already
installed. mise installs Homebrew formulae and casks itself, without Homebrew, and takes over
(`[bootstrap.brew] adopt`) apps that are already there when they match the download.

- **Ghostty, Helium, Paseo (desktop), Claude, ChatGPT, bb, Slack, Vorssaint:** casks `ghostty`,
  `helium-browser`, `paseo`, `claude`, `chatgpt`, `bb` ([get-bb/bb](https://github.com/get-bb/bb)), `slack` and
  `vorssaint` ([vorssaint/vorssaint-utils](https://github.com/vorssaint/vorssaint-utils), also in the shared mise
  config). The cask `helium` is an unrelated, disabled app. The dotfiles make Helium the default browser.
  ChatGPT stands in for Codex Desktop, whose `codex-app` cask Homebrew deprecated as discontinued upstream. Claude,
  ChatGPT and bb go to `~/Applications`, where the first VMs had them, and the rest to `/Applications`.
- **tty7 and MonoCode (desktop):** no casks. `macos-app` entries pinned to a release and its sha256 (tty7: the
  release's `checksums.txt`; MonoCode: the digest GitHub publishes for the DMG), installed into `/Applications`.
  Bump `version` and `sha256` together to update.
- **MonoCode host:** `monocode-host-darwin-arm64.tar.gz`, checked against its `.sha256`, into
  `~/.local/opt/monocode-host/<ver>` with a wrapper in `~/.local/bin`, and registered as the `com.monocode.host`
  launchd agent, by the base's `guest/monocode-host.sh` hook. From the host Mac's MonoCode, add the VM under Settings → Connections → Add machine, as
  `admin@<mise run tart:ip>`.
- **Paseo daemon:** the `dev.mise.paseo-daemon` launchd agent (`[bootstrap.macos.launchd.agents]`) runs the
  cask's `paseo daemon run` on `127.0.0.1:6767`, with the web UI on and the relay off, logging to
  `~/Library/Logs/paseo-daemon.log`. The cask's CLI runs on the app's bundled runtime, so it needs no Node. The
  host Mac's Paseo can add `ssh://admin@<mise run tart:ip>` as a Remote SSH host.
- **Tailscale:** `brew:tailscale`, run as a root launchd daemon (`tailscaled install-system-daemon`) by a hook. The Tailscale app is not used: its network extension
  needs approval in the GUI. Without `VM_TAILSCALE_AUTHKEY`, run `sudo tailscale up` in the guest afterwards.

### Updating an existing VM

```bash
git pull
mise run tart:start       # or vmpal:start
mise run tart:provision   # apps, Dock, daemons; the dotfiles pass is skipped unless FORCE=1
mise run tart:check
```

VMs provisioned before the base moved to mise:

- The Paseo daemon moves from `sh.paseo.daemon` to `dev.mise.paseo-daemon`. A hook removes the old agent, so the
  daemon restarts once.
- mise takes over tty7 and MonoCode only when the installed build is the pinned one. Remove an older bundle
  (`/Applications/MonoCode.app` before 0.16.0) first; the base pass then installs the pinned release.
- The dotfiles link `~/.config/mise/config.vm.toml` on their next apply: `git pull` in the guest's
  `~/git/dotfiles`, then `mise dot apply`, or provision with `FORCE=1`.

Existing VMs move from the old `~/git` share to `~/shared`: `provision` replaces the guest's `~/host-git` link
with `~/shared`, Tart mounts the new folder on the next `tart:start`, and `vmpal:configure` removes the old `git`
share. A `VM_SHARE_DIR` that still points at `~/git` keeps the old share.

### Performance

- **CPUs:** `VM_CPU` defaults to half the host's cores, at most its performance cores, and `configure` warns
  above that. Each vCPU runs as a high-priority host thread, filling the performance cores before spilling onto
  efficiency cores ([Eclectic Light](https://eclecticlight.co/2022/10/27/making-the-most-of-apple-silicon-power-7-virtualisation-and-core-use/)).
- **Disk caching (Tart only):** `VM_ROOT_DISK_OPTS` defaults to `caching=cached`. In
  [Tart's benchmarks](https://github.com/openai/tart/blob/main/benchmark/README.md) it ran XcodeBenchmark about
  10% faster on an M2 Pro (3m59s to 3m35s) and single-process 4 KiB random writes about 35% faster on an M1 Pro. It was slower
  in some other tests on that Mac, and much slower on an EBS-backed EC2 Mac. Set it empty if a workload
  regresses. `sync=none` is faster still but can lose data if the host crashes, so it is not used.
- **Disk headroom:** keep the guest disk well short of full; the `check` task prints its usage and `VM_DISK_GB`
  grows it. On the host, `tart prune --older-than=30` clears Tart's cached OCI and IPSW images that have not been
  used for 30 days. VMs and snapshots are separate copies, so it does not touch them.

### Container builds

A macOS guest has no hardware virtualization (`sysctl kern.hv_support` is 0), so Colima in a VM falls back to
QEMU's software emulation (`accel=tcg`), and a `--platform linux/amd64` build is emulated twice. Build on the
host instead: the `builder` [Colima profile](../.colima/builder/colima.yaml) runs on Apple's Virtualization
framework with Rosetta, so arm64 builds run natively and amd64 ones through Rosetta. A guest's buildx talks to
its BuildKit over TCP with mutual TLS; nothing in the guest gets SSH or a docker socket on the host.

On the Mac that hosts the VM, with the VM running:

```bash
mise run builder:start    # copies the profile to ~/.colima/builder, starts it, then BuildKit; prints its platforms
mise run tart:builder     # or vmpal:builder: makes it the guest's current buildx builder
```

Then in the guest, `docker build --platform linux/amd64 --load -t app .` builds on the host and loads the image
into the guest's docker. `--push` sends it to a registry instead.

- BuildKit listens on one host address, the one the VM reaches: the vmnet gateway (`bridge100`, which exists only
  while a NAT VM runs) or, with `VM_NETWORK=bridged`, the bridged interface's LAN address, where other LAN devices
  can connect too but need the client certificate. `VM_BUILDER_ADDRESS` overrides it.
- `build/builder/certs` holds a private CA, the server certificate for that address and the client certificate.
  The CA and client certificate are kept, so rerunning `builder:start` (after a reboot, or when the address
  changes) leaves the guest's builder working; delete the folder to start over, then rerun `tart:builder`.
- The profile mounts only `~/shared`, read-only: Colima would otherwise mount your home directory writable, and
  BuildKit runs privileged. Its build cache is the `vm-buildkit-state` volume in the profile.
- `builder:status` shows the profile and BuildKit's platforms; `builder:stop` stops the profile. If macOS asks
  whether `limactl` or `ssh` may accept incoming connections, allow it, or the VM cannot connect.

### SSH from another device

Both engines can bridge the guest onto the LAN and run the dotfiles' sshd template and task in it
(`mise run tart:sshd start --minutes 180`, `status`, `stop`; or `vmpal:sshd`). It listens on port
`VM_SSHD_PORT` (`48222`), with keys only (`VM_SSHD_AUTHORIZED_KEYS`) and `AllowUsers <user>@<VM_SSHD_ALLOW_FROM>`.
See each engine's README for its network settings.

## Known blockers in the dotfiles repo

Not changed here; provisioning works around them:

1. The bootstrap's `files` phase needs `TERN_TAILSCALE_EMAIL` / `TERN_SSH_FINGERPRINT`, so it is skipped.
2. `[bootstrap.repos]` uses an SSH URL, so it is skipped in both passes; `~/git/dotfiles` is cloned over HTTPS.
3. A `~/.gitconfig` that is not the dotfiles' symlink, such as the CI one in Tart's base image, blocks the
   bootstrap, so it is moved to `~/.gitconfig.pre-dotfiles`.
4. `[tasks.bootstrap]` installs the crontab in the VM too.

Rerun with `FORCE=1 mise run tart:provision` (or `vmpal:provision`).
