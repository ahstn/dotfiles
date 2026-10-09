#!/bin/bash
# Runs inside the guest as the login user (piped over SSH by vm.sh provision).
set -eux -o pipefail

# Local VM behind the host login: the only password rule is >= 4 characters. libpwquality cannot go
# below 6, so it only warns (enforcing = 0) and pam_unix enforces the length. Runs on every provision.
sudo mkdir -p /etc/security/pwquality.conf.d
printf '%s\n' '# vm.sh: warn only; pam_unix minlen=4 in common-password enforces length.' 'enforcing = 0' \
  | sudo tee /etc/security/pwquality.conf.d/90-vm.conf >/dev/null
sudo sed -i -E '/pam_unix\.so/{/minlen=/!s/pam_unix\.so obscure/pam_unix.so obscure minlen=4/}' /etc/pam.d/common-password

# Apps, also before the provisioned check so `./vm.sh provision` adds them to existing VMs. Each step is a no-op once done.
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ghostty

# Helium browser: native arm64 from its apt repo, so `apt upgrade` keeps it current. The key is pinned by fingerprint.
if ! dpkg -s helium-bin >/dev/null 2>&1; then
  helium_fpr=BE677C1989D35EAB2C5F26C9351601AD01D6378E
  tmp="$(mktemp)"
  curl -fsSL https://raw.githubusercontent.com/imputnet/helium-linux/main/pubkey.asc -o "$tmp"
  gpg --show-keys --with-colons "$tmp" | grep -q "^fpr:*$helium_fpr:" || { echo "Helium key fingerprint mismatch" >&2; exit 1; }
  sudo gpg --batch --yes --dearmor -o /usr/share/keyrings/helium.gpg "$tmp" && rm -f "$tmp"
  printf '%s\n' 'Types: deb' 'URIs: https://pkg.helium.computer/deb' 'Suites: stable' 'Components: main' \
    'Architectures: arm64' 'Signed-By: /usr/share/keyrings/helium.gpg' | sudo tee /etc/apt/sources.list.d/helium.sources >/dev/null
  sudo apt-get update
  # helium-bin declares no Depends; these are the Chromium runtime libs it needs (Qt shims are optional, KDE only).
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y helium-bin libnss3 libasound2t64 libatk-bridge2.0-0t64 \
    libcups2t64 libxdamage1 libpango-1.0-0 libcairo2 fonts-liberation libvulkan1 xdg-utils
fi

# Tailscale from its apt repo (key pinned by fingerprint). The repo serves a binary keyring, so no dearmor.
if ! dpkg -s tailscale >/dev/null 2>&1; then
  ts_fpr=2596A99EAAB33821893C0A79458CA832957F5868
  tmp="$(mktemp)"
  curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/resolute.noarmor.gpg -o "$tmp"
  gpg --show-keys --with-colons "$tmp" | grep -q "^fpr:*$ts_fpr:" || { echo "Tailscale key fingerprint mismatch" >&2; exit 1; }
  sudo install -m 644 "$tmp" /usr/share/keyrings/tailscale-archive-keyring.gpg && rm -f "$tmp"
  printf '%s\n' 'Types: deb' 'URIs: https://pkgs.tailscale.com/stable/ubuntu' 'Suites: resolute' 'Components: main' \
    'Signed-By: /usr/share/keyrings/tailscale-archive-keyring.gpg' | sudo tee /etc/apt/sources.list.d/tailscale.sources >/dev/null
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y tailscale
fi
# Log in only with an auth key that vm.sh streamed into ~/.tailscale-authkey; otherwise leave it to the user.
# tailscaled reads the key from the file, so it never appears in a command line. --operator lets $USER run
# `tailscale` without sudo.
if [ -f ~/.tailscale-authkey ]; then
  tailscale status >/dev/null 2>&1 \
    || sudo tailscale up --operator="$USER" --auth-key="file:$HOME/.tailscale-authkey" \
    || { rm -f ~/.tailscale-authkey; exit 1; }
  rm -f ~/.tailscale-authkey
elif ! tailscale status >/dev/null 2>&1; then
  echo "Tailscale is installed but not logged in. In the guest, run: sudo tailscale up --operator=\$USER"
fi

# FEX-Emu runs x86_64 Linux binaries on this arm64 guest (binfmt, so they run directly). The package is chosen by
# CPU feature level, as FEX's InstallFEX.py does. Its newest x86 RootFS is Ubuntu 24.04, which is fine on 26.04.
if ! command -v FEX >/dev/null || ! dpkg -s fex-emu-binfmt64 >/dev/null 2>&1; then
  sudo add-apt-repository -y ppa:fex-emu/fex
  feats=" $(grep -m1 '^Features' /proc/cpuinfo | cut -d: -f2) "
  fex=fex-emu-armv8.0
  has() { for f; do [[ "$feats" == *" $f "* ]] || return 1; done; }
  has atomics asimdrdm crc32 dcpop && fex=fex-emu-armv8.2
  has atomics asimdrdm crc32 dcpop fcma jscvt lrcpc paca pacg asimddp flagm ilrcpc uscat && fex=fex-emu-armv8.4
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "$fex" fex-emu-binfmt64
fi
fexroot="$HOME/.local/share/fex-emu/RootFS"
if [ ! -d "$fexroot/Ubuntu_24_04" ]; then
  FEXRootFSFetcher -y -x --distro-name=ubuntu --distro-version=24.04 --force-ui=tty
  rm -f "$fexroot/Ubuntu_24_04.sqsh"   # extracted copy is what FEX uses
fi
# The fetcher does not persist its "default RootFS" choice, so set it here, keeping any other settings.
mkdir -p ~/.config/fex-emu
python3 - ~/.config/fex-emu/Config.json <<'PY'
import json, os, sys
path = sys.argv[1]
cfg = json.load(open(path)) if os.path.exists(path) else {}
if cfg.get("Config", {}).get("RootFS") != "Ubuntu_24_04":
    cfg.setdefault("Config", {})["RootFS"] = "Ubuntu_24_04"
    with open(path + ".tmp", "w") as f:
        json.dump(cfg, f, indent=2)
    os.replace(path + ".tmp", path)
PY

# install_x86_release <owner/repo> <name>: newest stable vX.Y.Z GitHub release's <name>-<ver>-linux-x86_64.tar.gz,
# checked against its checksums.txt, into ~/.local/opt/<name>/<ver>; executables are linked into ~/.local/bin.
install_x86_release() {
  local repo="$1" name="$2" tag ver dir tmp stage
  tag="$(curl -fsSL "https://api.github.com/repos/$repo/releases?per_page=30" | python3 -c '
import json, re, sys
print(next(r["tag_name"] for r in json.load(sys.stdin)
           if not r["prerelease"] and not r["draft"] and re.fullmatch(r"v\d+(\.\d+)*", r["tag_name"])))')"
  ver="${tag#v}" dir="$HOME/.local/opt/$name/$ver"
  if [ ! -d "$dir" ]; then
    tmp="$(mktemp -d)"
    curl -fsSL -o "$tmp/$name.tar.gz" "https://github.com/$repo/releases/download/$tag/$name-$ver-linux-x86_64.tar.gz"
    curl -fsSL -o "$tmp/checksums.txt" "https://github.com/$repo/releases/download/$tag/checksums.txt"
    (cd "$tmp" && echo "$(awk -v f="$name-$ver-linux-x86_64.tar.gz" '$2 == f || $2 == "*" f {print $1}' checksums.txt)  $name.tar.gz" | sha256sum -c -)
    # Extract beside the target and rename, so an interrupted run never leaves a half-filled version dir.
    rm -rf "$dir".partial.* && mkdir -p "$(dirname "$dir")" && stage="$(mktemp -d "$dir.partial.XXXXXX")"
    tar -xzf "$tmp/$name.tar.gz" -C "$stage" --strip-components=1 && chmod 755 "$stage" && mv "$stage" "$dir"
    rm -rf "$tmp"
  fi
  mkdir -p ~/.local/bin
  find "$dir" -maxdepth 1 -type f -perm -u+x -exec ln -sfn {} ~/.local/bin/ \;
}

install_x86_release l0ng-ai/tty7 tty7
# The GUI aborts right after choosing the virtio-gpu Venus Vulkan device under FEX, so the launcher pins
# the RootFS's software Vulkan driver (llvmpipe). The CLI (tty7) needs no GPU.
mkdir -p ~/.local/share/applications
cat > ~/.local/share/applications/tty7.desktop <<EOF
[Desktop Entry]
Type=Application
Name=tty7
Comment=Terminal (x86_64, via FEX-Emu)
Exec=env VK_ICD_FILENAMES=/usr/share/vulkan/icd.d/lvp_icd.json $HOME/.local/bin/tty7-app
Icon=utilities-terminal
Terminal=false
Categories=System;TerminalEmulator;
EOF

# MonoCode host (native arm64; bundles its own Node): the Mac's MonoCode desktop drives agents here through
# Settings → Connections → Add machine (SSH), and reuses this running host. Its desktop app has no arm64 Linux build.
# `service install` writes a systemd user unit pointing at this version and enables lingering.
mono_tag="$(curl -fsSL https://api.github.com/repos/hardbeat920/monocode/releases/latest | python3 -c 'import json, sys; print(json.load(sys.stdin)["tag_name"])')"
mono_dir="$HOME/.local/opt/monocode-host/${mono_tag#v}"
if [ ! -d "$mono_dir" ]; then
  tmp="$(mktemp -d)" asset=monocode-host-linux-arm64.tar.gz
  curl -fsSL -o "$tmp/$asset" "https://github.com/hardbeat920/monocode/releases/download/$mono_tag/$asset"
  curl -fsSL -o "$tmp/$asset.sha256" "https://github.com/hardbeat920/monocode/releases/download/$mono_tag/$asset.sha256"
  (cd "$tmp" && sha256sum -c "$asset.sha256")
  rm -rf "$mono_dir".partial.* && mkdir -p "$(dirname "$mono_dir")" && stage="$(mktemp -d "$mono_dir.partial.XXXXXX")"
  tar -xzf "$tmp/$asset" -C "$stage" && chmod 755 "$stage" && mv "$stage" "$mono_dir"
  rm -rf "$tmp"
  mono_new=1
fi
# The launcher resolves its runtime from its own path, so ~/.local/bin gets a wrapper rather than a symlink.
mkdir -p ~/.local/bin
printf '#!/bin/sh\nexec %s/monocode-host "$@"\n' "$mono_dir" > ~/.local/bin/monocode-host
chmod 755 ~/.local/bin/monocode-host
if [ -n "${mono_new:-}" ] || ! systemctl --user is-active --quiet monocode-host.service; then
  ~/.local/bin/monocode-host service install
  # install keeps an already-running (older) host; restart so the unit's new version takes over.
  [ -z "${mono_new:-}" ] || systemctl --user restart monocode-host.service
fi

# Pin to the Ubuntu dock (GNOME favorites), appending to existing pins. Over SSH, use the logged-in session's bus
# so the dock updates live; otherwise a throwaway bus writes dconf and it applies at next login.
pin_to_dock() {
  local cur new
  cur="$(gsettings get org.gnome.shell favorite-apps)"
  new="$(python3 -c '
import ast, sys
cur = ast.literal_eval(sys.argv[1].removeprefix("@as "))
print(str(cur + [a for a in sys.argv[2:] if a not in cur]))' "$cur" "$@")"
  [ "$new" = "$cur" ] || gsettings set org.gnome.shell favorite-apps "$new"
}
bus="/run/user/$(id -u)/bus"
if [ -S "$bus" ]; then
  DBUS_SESSION_BUS_ADDRESS="unix:path=$bus" pin_to_dock helium.desktop tty7.desktop
else
  export -f pin_to_dock && dbus-run-session -- bash -c 'pin_to_dock helium.desktop tty7.desktop'
fi

if [ -f "$HOME/.provisioned" ] && [ "${FORCE:-0}" != 1 ]; then
  echo "already provisioned (FORCE=1 to rerun)"; exit 0
fi

# Safety net: autoinstall should have installed these already.
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  spice-vdagent qemu-guest-agent bindfs openssh-server mesa-utils git curl ca-certificates

export PATH="$HOME/.local/bin:$PATH"
export MISE_YES=1
export MISE_TRUSTED_CONFIG_PATHS="$HOME/git:$HOME/.config/mise"

command -v mise >/dev/null || curl -fsSL https://mise.run | sh
[ -d "$HOME/git/dotfiles" ] || git clone https://github.com/ahstn/dotfiles.git "$HOME/git/dotfiles"

cd "$HOME/git/dotfiles"
# Bootstrap installs apt packages before it links dotfiles, from the config it loaded at the start, so the
# packages in ~/.config/mise/config.toml need that link first. `files` needs Tern secrets; `repos` uses an SSH
# clone URL. See ../README.md for other known blockers.
mise bootstrap --only dotfiles
mise bootstrap --skip files,repos

# Paseo daemon with its bundled web UI on http://127.0.0.1:6767 (relay stays off), native through npm on the
# mise Node; its desktop app has no arm64 Linux build. The Mac's Paseo desktop can add it as a Remote SSH host.
# bzip2 unpacks its local speech models.
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y bzip2
[ -x ~/.local/bin/paseo ] || mise x node@lts -- npm install -g --prefix ~/.local @getpaseo/cli
mise x node@lts -- paseo daemon config set features.webUi.enabled true >/dev/null
mkdir -p ~/.config/systemd/user
printf '%s\n' '[Unit]' 'Description=Paseo agent daemon (http://127.0.0.1:6767)' '[Service]' 'WorkingDirectory=%h' \
  'ExecStart=%h/.local/bin/mise x node@lts -- %h/.local/bin/paseo daemon run' 'Restart=on-failure' \
  '[Install]' 'WantedBy=default.target' > ~/.config/systemd/user/paseo.service
systemctl --user daemon-reload
systemctl --user enable --now paseo.service

# Bootstrap installs zsh (apt:zsh) but leaves the login shell as bash in the guest; plain chsh would prompt for
# the password, so set it through sudo. Takes effect on the next login.
zsh_path="$(command -v zsh)" || { echo "zsh not installed by mise bootstrap" >&2; exit 1; }
[ "$(getent passwd "$USER" | cut -d: -f7)" = "$zsh_path" ] || sudo chsh -s "$zsh_path" "$USER"

touch "$HOME/.provisioned"
