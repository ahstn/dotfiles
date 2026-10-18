# Dev VMs (Apple Silicon)

Builds a macOS dev VM, then applies [ahstn/dotfiles](https://github.com/ahstn/dotfiles) and the usual apps
inside it. There are two engines; pick one per VM. Both use Apple's Virtualization.framework, so CPU, memory and
disk performance are about equal, and both run the same guest script, so the VMs end up the same.

| Engine | Directory | In short |
|---|---|---|
| [VMPal](https://vmpal.com) | [`vmpal-macos/`](vmpal-macos/README.md) | The default on macOS 27 hosts: unattended macOS install, guest tools and UI control for agents, Ubuntu desktops with GPU |
| [Tart](https://tart.run) | [`tart-macos/`](tart-macos/README.md) | Any recent host: a prebuilt, already set-up image, headless runs, everything over SSH |

```bash
cd virtual-machine/vmpal-macos   # or tart-macos
cp config.env.example config.env # optional
./vm.sh all
```

> [!WARNING]
> Keep repositories, build output and `node_modules` on the guest's own disk (the guest's `~/git`), not in the
> shared folder. The host's `~/shared` appears in the guest as `~/shared`: use it only to pass files across.
> Under heavy I/O the share can report existing files as missing
> ([openai/tart#567](https://github.com/openai/tart/issues/567)), and one user's `fio` run measured it at about a
> tenth of the guest disk's throughput ([openai/tart#762](https://github.com/openai/tart/issues/762)).

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
| Networking | `VM_NETWORK`: `shared` (NAT), `bridged` or `host-only`, plus an optional local network | `VM_NET`: `nat` or `bridged` |
| Snapshots | `vmpal snapshot` / `vmpal revert` | `tart clone` to `<name>-<tag>` (APFS copy) |
| Reusable base | `vmpal clone`, or `vmpal compress` / `vmpal import` (`.vmpalvm`) | push or clone OCI images |

Choose **VMPal** on a macOS 27 host, for an Ubuntu desktop, or when an agent should drive the guest's screen.
Choose **Tart** on a macOS 26 host, for headless or scripted runs, or when nothing should be set up by hand.

## Layout

```text
virtual-machine/
├── README.md               # this file: what both engines share
├── guest/macos.sh          # the macOS guest script, shared by both engines
├── tart-macos/
│   ├── vm.sh, config.env.example, README.md
│   └── guest/macos-engine.sh
└── vmpal-macos/
    ├── vm.sh, config.env.example, README.md, MACOS-MANUAL-SETUP.md
    └── guest/macos-engine.sh, guest/ubuntu.sh
```

Each engine's `vm.sh provision` copies `guest/macos.sh` into the guest beside that engine's
`guest/macos-engine.sh`, which defines two hooks the shared script calls:

- `engine_prepare`, run first: Tart moves the base image's CI `~/.gitconfig` aside; VMPal has nothing to do.
- `engine_tailscale_authkey_file`, which prints the path of a private file holding a Tailscale auth key, or
  nothing. The shared script logs in with it and deletes it.

Engine-specific steps (creating the VM, the account, its password, sudo, SSH keys, networking) stay in each
`vm.sh`. Both read settings from exported env vars, then the git-ignored `config.env` beside them, then defaults.

## Shared prerequisites

1. An Apple Silicon Mac.
2. An SSH key (`ssh-keygen -t ed25519`). `VM_SSH_PUBKEY` authorises SSH into the guest.
3. Optionally, GitHub keys for the guest: `VM_GITHUB_AUTH_KEY` (`~/.ssh/github`) and `VM_GITHUB_SIGNING_KEY`
   (`~/.ssh/github-signing-key`). Set either empty to skip it.
4. Apple's licence allows two macOS VMs running at once per Mac, across both engines.
5. Optionally, a Tailscale auth key, exported as `VM_TAILSCALE_AUTHKEY` for one `./vm.sh provision` run. Never
   put it in `config.env`.

## What every macOS VM gets

| | |
|---|---|
| Account | `admin` / `admin`, with passwordless sudo and automatic login. `VM_PASSWORD` replaces the password; set one before bridging onto the LAN |
| SSH | `keys` authorises `VM_SSH_PUBKEY` and makes SSH key-only |
| GitHub | the GitHub keys in the guest's `~/.ssh`, github.com host keys pinned from `api.github.com/meta`, and a managed `Host github.com` block |
| Shared folder | the host's `~/shared`, created if missing, shared live into the guest at `/Volumes/My Shared Files/shared` and linked as `~/shared` (`VM_SHARE_DIR`, `VM_SHARE_NAME`). For passing files only; see the warning above |
| Housekeeping | Spotlight indexing off; macOS updates not downloaded or installed automatically (checking, security responses and XProtect data stay on); Reduce Motion and Reduce Transparency on, from the next login. Reapplied on every provision |
| Dotfiles | on the first run (or `FORCE=1`): `~/git/dotfiles` cloned over HTTPS, `mise bootstrap --only dotfiles`, then `mise bootstrap --skip files,repos` |
| mise | `~/.config/mise/miserc.toml` selects the `vm` config environment for every mise run in the guest, which adds `~/.config/mise/config.toml`'s VM-only packages (`brew:tailscale`) |
| Dock | exactly Ghostty, Helium, tty7, Paseo, MonoCode, Claude, ChatGPT, bb, Slack, Vorssaint and System Settings (after Finder), on the right and always shown. The shared mise config's Dock settings are for the host Macs |
| Checks | `./vm.sh check` prints the macOS version, mise tools, shell, disk, shared folder, apps, Tailscale, the Paseo agent and GitHub SSH auth |

### Apps

`provision` installs these on every run, before the already-provisioned check, so it also adds them to existing
VMs. Steps that are already done are skipped. Homebrew is installed first if missing.

- **Ghostty, Helium, Paseo (desktop), Claude, ChatGPT, bb, Slack, Vorssaint:** Homebrew casks `ghostty`,
  `helium-browser`, `paseo`, `claude`, `chatgpt`, `bb` ([get-bb/bb](https://github.com/get-bb/bb)), `slack` and
  `vorssaint` ([vorssaint/vorssaint-utils](https://github.com/vorssaint/vorssaint-utils), also in the shared mise
  config). The cask `helium` is an unrelated, disabled app. The dotfiles make Helium the default browser.
  ChatGPT stands in for Codex Desktop, whose `codex-app` cask Homebrew deprecated as discontinued upstream. Casks
  go to `~/Applications` once the dotfiles set `HOMEBREW_CASK_OPTS`; the Dock and `check` look in both.
- **tty7:** no cask. The newest stable `vX.Y.Z` release's `tty7-<ver>-macos-arm64.zip`, checked against the
  release's `checksums.txt`.
- **MonoCode (desktop):** no cask. `MonoCode_<ver>_aarch64.dmg` from the latest release, checked against the
  sha256 digest GitHub publishes for the asset (the DMG has no checksum file).
- tty7 and MonoCode must pass `codesign --verify --deep --strict` and Gatekeeper. They are copied into
  `/Applications` and replaced only when the version changes.
- **MonoCode host:** `monocode-host-darwin-arm64.tar.gz`, checked against its `.sha256`, into
  `~/.local/opt/monocode-host/<ver>` with a wrapper in `~/.local/bin`, and registered as the `com.monocode.host`
  launchd agent. From the host Mac's MonoCode, add the VM under Settings → Connections → Add machine, as
  `admin@<./vm.sh ip>`.
- **Paseo daemon:** the `sh.paseo.daemon` launchd agent runs the cask's `paseo daemon run` on `127.0.0.1:6767`,
  with the web UI on and the relay off, logging to `~/Library/Logs/paseo-daemon.log`. The cask's CLI runs on the
  app's bundled runtime, so it needs no Node. The agent reloads only when its plist changes. The host Mac's Paseo
  can add `ssh://admin@<./vm.sh ip>` as a Remote SSH host.
- **Tailscale:** `brew:tailscale` from the bootstrap, run as a root launchd daemon
  (`tailscaled install-system-daemon`) on every provision. The Tailscale app is not used: its network extension
  needs approval in the GUI. Without `VM_TAILSCALE_AUTHKEY`, run `sudo tailscale up` in the guest afterwards.

### Updating an existing VM

```bash
git pull
./vm.sh start
./vm.sh provision     # apps, Dock, daemons; the dotfiles steps are skipped unless FORCE=1
./vm.sh check
```

Existing VMs move from the old `~/git` share to `~/shared`: `provision` replaces the guest's `~/host-git` link
with `~/shared`, Tart mounts the new folder on the next `./vm.sh start`, and VMPal's `./vm.sh configure` removes
the old `git` share. A `config.env` that still sets `VM_SHARE_DIR=$HOME/git` keeps the old share.

### Performance

- **CPUs:** `VM_CPU` defaults to half the host's cores, at most its performance cores, and `configure` warns
  above that. Each vCPU runs as a high-priority host thread, filling the performance cores before spilling onto
  efficiency cores ([Eclectic Light](https://eclecticlight.co/2022/10/27/making-the-most-of-apple-silicon-power-7-virtualisation-and-core-use/)).
- **Disk caching (Tart only):** `VM_ROOT_DISK_OPTS` defaults to `caching=cached`. In
  [Tart's benchmarks](https://github.com/openai/tart/blob/main/benchmark/README.md) it ran XcodeBenchmark about
  10% faster on an M2 Pro (3m59s to 3m35s) and single-process 4 KiB random writes about 35% faster on an M1 Pro. It was slower
  in some other tests on that Mac, and much slower on an EBS-backed EC2 Mac. Set it empty if a workload
  regresses. `sync=none` is faster still but can lose data if the host crashes, so it is not used.
- **Disk headroom:** keep the guest disk well short of full; `./vm.sh check` prints its usage and `VM_DISK_GB`
  grows it. On the host, `tart prune --older-than=30` clears Tart's cached OCI and IPSW images that have not been
  used for 30 days. VMs and snapshots are separate copies, so it does not touch them.

### SSH from another device

Both engines can bridge the guest onto the LAN and run the dotfiles' sshd template and task in it
(`./vm.sh sshd start [minutes]`, `status`, `stop`). It listens on port `VM_SSHD_PORT` (`48222`), with keys only
(`VM_SSHD_AUTHORIZED_KEYS`) and `AllowUsers <user>@<VM_SSHD_ALLOW_FROM>`. See each engine's README for its
network settings.

## Known blockers in the dotfiles repo

Not changed here; provisioning works around them:

1. The bootstrap's `files` phase needs `TERN_TAILSCALE_EMAIL` / `TERN_SSH_FINGERPRINT`, so it is skipped.
2. `[bootstrap.repos]` uses an SSH URL, so it is skipped; `~/git/dotfiles` is cloned over HTTPS.
3. A `~/.gitconfig` that is not the dotfiles' symlink blocks the bootstrap, so it is moved to
   `~/.gitconfig.pre-dotfiles` (Tart's base image: `~/.gitconfig.base-image`).
4. `[tasks.bootstrap]` installs the crontab in the VM too.

Rerun with `FORCE=1 ./vm.sh provision`.
