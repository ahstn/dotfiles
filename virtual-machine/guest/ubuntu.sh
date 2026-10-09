#!/bin/bash
# Runs inside the Ubuntu guest as the signed-in user (copied in and run by vm.sh provision through VMPal Tools).
# Needs passwordless sudo (vm.sh sudo). x86_64 apps run under Rosetta for Linux (VM_ROSETTA=1, the default).
set -eux -o pipefail

export DEBIAN_FRONTEND=noninteractive PATH="$HOME/.local/bin:$PATH"
apt_install() { sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$@" >/dev/null; }

# The host folder VMPal shares (under /media/VMPal), linked under a stable path.
[ -z "${SHARE_PATH:-}" ] || ln -sfn "$SHARE_PATH" "$HOME/host-$SHARE_NAME"

# The guest clock stops while the Mac sleeps, and chrony by default steps only in its first updates, then slews
# for days; apt rejects repos "not valid yet" meanwhile. Step whenever it is more than a second off.
if [ ! -f /etc/chrony/conf.d/vm-step.conf ]; then
  echo "makestep 1 -1" | sudo tee /etc/chrony/conf.d/vm-step.conf >/dev/null
  sudo systemctl restart chrony
fi
sudo chronyc -h 127.0.0.1 waitsync 15 1 >/dev/null || sudo chronyc makestep >/dev/null || true

sudo apt-get update -qq
apt_install git curl ca-certificates gpg python3 bzip2

# gh_release <owner/repo>: tag of the newest stable vX.Y.Z release (skips nightlies and other tags).
gh_release() {
  curl -fsSL "https://api.github.com/repos/$1/releases?per_page=30" | python3 -c '
import json, re, sys
print(next(r["tag_name"] for r in json.load(sys.stdin)
           if not r["prerelease"] and not r["draft"] and re.fullmatch(r"v\d+(\.\d+)*", r["tag_name"])))'
}

# gh_digest <owner/repo> <tag> <asset>: GitHub's sha256 of a release asset.
gh_digest() {
  curl -fsSL "https://api.github.com/repos/$1/releases/tags/$2" | python3 -c '
import json, sys
print(next(a["digest"] for a in json.load(sys.stdin)["assets"] if a["name"] == sys.argv[1]).removeprefix("sha256:"))' "$3"
}

# apt_repo <name> <key URL> <fingerprint> <dearmor 0|1> <deb822 lines...>: add a signed apt repo, with its key
# pinned by fingerprint.
apt_repo() {
  local name="$1" url="$2" fpr="$3" dearmor="$4" tmp; shift 4
  [ -f "/etc/apt/sources.list.d/$name.sources" ] && return
  tmp="$(mktemp)"
  curl -fsSL "$url" -o "$tmp"
  gpg --show-keys --with-colons "$tmp" | grep -q "^fpr:*$fpr:" || { echo "$name key fingerprint mismatch" >&2; exit 1; }
  if [ "$dearmor" = 1 ]; then sudo gpg --batch --yes --dearmor -o "/usr/share/keyrings/$name.gpg" "$tmp"
  else sudo install -m 644 "$tmp" "/usr/share/keyrings/$name.gpg"; fi
  rm -f "$tmp"
  printf '%s\n' "$@" "Signed-By: /usr/share/keyrings/$name.gpg" | sudo tee "/etc/apt/sources.list.d/$name.sources" >/dev/null
  sudo apt-get update -qq
}

# Apps, before the provisioned check so `./vm.sh provision` adds them to existing VMs. Each step is a no-op once done.
apt_install ghostty
# Ghostty needs OpenGL 4.3; VMPal's virgl GPU offers 4.1 (the macOS host's limit), so it renders with Mesa's
# llvmpipe instead. GNOME starts it through D-Bus, so override the D-Bus service as well as the launcher.
mkdir -p ~/.local/share/applications ~/.local/share/dbus-1/services
sed 's#^Exec=/usr/bin/ghostty#Exec=env LIBGL_ALWAYS_SOFTWARE=1 /usr/bin/ghostty#' \
  /usr/share/applications/com.mitchellh.ghostty.desktop > ~/.local/share/applications/com.mitchellh.ghostty.desktop
sed -e '/^SystemdService=/d' -e 's#^Exec=/usr/bin/ghostty#Exec=/usr/bin/env LIBGL_ALWAYS_SOFTWARE=1 /usr/bin/ghostty#' \
  /usr/share/dbus-1/services/com.mitchellh.ghostty.service > ~/.local/share/dbus-1/services/com.mitchellh.ghostty.service
# The running session bus caches service files until told to reload.
dbus-send --session --type=method_call --dest=org.freedesktop.DBus /org/freedesktop/DBus \
  org.freedesktop.DBus.ReloadConfig 2>/dev/null || true

# The guest signs in automatically and VMPal keeps its password, so a lock screen only gets in the way.
gsettings set org.gnome.desktop.screensaver lock-enabled false
gsettings set org.gnome.desktop.session idle-delay 0

# Helium browser: native arm64 from its apt repo, so `apt upgrade` keeps it current. helium-bin declares no Depends;
# these are the Chromium runtime libs it needs.
apt_repo helium https://raw.githubusercontent.com/imputnet/helium-linux/main/pubkey.asc \
  BE677C1989D35EAB2C5F26C9351601AD01D6378E 1 \
  'Types: deb' 'URIs: https://pkg.helium.computer/deb' 'Suites: stable' 'Components: main' 'Architectures: arm64'
apt_install helium-bin libnss3 libasound2t64 libatk-bridge2.0-0t64 libcups2t64 libxdamage1 libpango-1.0-0 libcairo2 \
  fonts-liberation libvulkan1 xdg-utils

# Tailscale from its apt repo. The repo serves a binary keyring, so no dearmor.
apt_repo tailscale https://pkgs.tailscale.com/stable/ubuntu/resolute.noarmor.gpg \
  2596A99EAAB33821893C0A79458CA832957F5868 0 \
  'Types: deb' 'URIs: https://pkgs.tailscale.com/stable/ubuntu' 'Suites: resolute' 'Components: main'
apt_install tailscale
# Log in only with an auth key vm.sh passed as VM_TAILSCALE_AUTHKEY; tailscaled reads it from a private file, so it is
# on no command line. --operator lets $USER run `tailscale` without sudo.
if [ -n "${VM_TAILSCALE_AUTHKEY:-}" ]; then
  if ! tailscale status >/dev/null 2>&1; then
    key="$(mktemp)" && printf '%s' "$VM_TAILSCALE_AUTHKEY" > "$key"
    sudo tailscale up --operator="$USER" --auth-key="file:$key" || { rm -f "$key"; exit 1; }
    rm -f "$key"
  fi
elif ! tailscale status >/dev/null 2>&1; then
  echo "Tailscale is installed but not logged in. In the guest, run: sudo tailscale up --operator=\$USER"
fi

# x86_64 apps under Rosetta for Linux: VMPal mounts it at /media/rosetta and registers it with binfmt_misc, so x86_64
# binaries run directly. They need x86_64 libraries, from the same archive (Ubuntu 26.04 serves both architectures).
if [ -e /proc/sys/fs/binfmt_misc/rosetta ]; then
  dpkg --print-foreign-architectures | grep -qx amd64 || { sudo dpkg --add-architecture amd64 && sudo apt-get update -qq; }
  # tty7's NEEDED libraries, those winit/wgpu load at run time, and Electron's (Paseo) that its package leaves out.
  apt_install libc6:amd64 libgcc-s1:amd64 libxcb1:amd64 libxkbcommon0:amd64 libxkbcommon-x11-0:amd64 \
    libgssapi-krb5-2:amd64 libvulkan1:amd64 mesa-vulkan-drivers:amd64 libwayland-client0:amd64 libwayland-egl1:amd64 \
    libwayland-cursor0:amd64 libx11-6:amd64 libx11-xcb1:amd64 libxcursor1:amd64 libxi6:amd64 libxrandr2:amd64 \
    libegl1:amd64 libgl1:amd64 libfontconfig1:amd64 libasound2t64:amd64 libgbm1:amd64 libdrm2:amd64

  # tty7: no arm64 Linux build. The newest stable release's x86_64 tarball, checked against its checksums.txt,
  # into ~/.local/opt/tty7/<ver>, with its executables linked into ~/.local/bin.
  tag="$(gh_release l0ng-ai/tty7)" ver="${tag#v}" dir="$HOME/.local/opt/tty7/$ver"
  if [ ! -d "$dir" ]; then
    tmp="$(mktemp -d)" asset="tty7-$ver-linux-x86_64.tar.gz"
    curl -fsSL -o "$tmp/$asset" "https://github.com/l0ng-ai/tty7/releases/download/$tag/$asset"
    curl -fsSL -o "$tmp/checksums.txt" "https://github.com/l0ng-ai/tty7/releases/download/$tag/checksums.txt"
    echo "$(awk -v f="$asset" '$2 == f || $2 == "*" f {print $1}' "$tmp/checksums.txt")  $tmp/$asset" | sha256sum -c -
    # Extract beside the target and rename, so an interrupted run never leaves a half-filled version dir.
    rm -rf "$dir".partial.* && mkdir -p "$(dirname "$dir")" && stage="$(mktemp -d "$dir.partial.XXXXXX")"
    tar -xzf "$tmp/$asset" -C "$stage" --strip-components=1 && chmod 755 "$stage" && mv "$stage" "$dir"
    rm -rf "$tmp"
  fi
  mkdir -p ~/.local/bin ~/.local/share/applications
  ln -sfn "$dir/tty7" "$dir/tty7-app" ~/.local/bin/
  printf '%s\n' '[Desktop Entry]' 'Type=Application' 'Name=tty7' 'Comment=Terminal (x86_64, under Rosetta)' \
    "Exec=$HOME/.local/bin/tty7-app" 'Icon=utilities-terminal' 'Terminal=false' 'Categories=System;TerminalEmulator;' \
    > ~/.local/share/applications/tty7.desktop

  # install_deb <owner/repo> <tag> <asset> <package>: an amd64 .deb release asset, checked against GitHub's digest,
  # installed only when the package's version differs.
  install_deb() {
    local repo="$1" tag="$2" asset="$3" pkg="$4" tmp
    [ "$(dpkg-query -W -f='${Version}' "$pkg" 2>/dev/null || true)" != "${tag#v}" ] || return 0
    tmp="$(mktemp -d)" && chmod 755 "$tmp"   # apt's _apt user reads the file
    curl -fsSL -o "$tmp/$asset" "https://github.com/$repo/releases/download/$tag/$asset"
    echo "$(gh_digest "$repo" "$tag" "$asset")  $tmp/$asset" | sha256sum -c -
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$tmp/$asset" >/dev/null
    rm -rf "$tmp"
  }

  # MonoCode desktop: no arm64 Linux build; the amd64 .deb (Tauri, WebKitGTK) runs under Rosetta.
  mono_tag="$(curl -fsSL https://api.github.com/repos/hardbeat920/monocode/releases/latest | python3 -c 'import json, sys; print(json.load(sys.stdin)["tag_name"])')"
  install_deb hardbeat920/monocode "$mono_tag" "MonoCode_${mono_tag#v}_amd64.deb" mono-code

  # Paseo desktop (Electron): no arm64 Linux build; the amd64 .deb runs under Rosetta. Under Rosetta its native
  # Wayland window never appears, so the user's launcher entry runs it through XWayland.
  paseo_tag="$(gh_release getpaseo/paseo)"
  install_deb getpaseo/paseo "$paseo_tag" "Paseo-${paseo_tag#v}-amd64.deb" paseo
  sed 's#^Exec=/opt/Paseo/Paseo#Exec=env ELECTRON_OZONE_PLATFORM_HINT=x11 /opt/Paseo/Paseo#' \
    /usr/share/applications/Paseo.desktop > ~/.local/share/applications/Paseo.desktop
  paseo=/opt/Paseo/resources/bin/paseo
else
  echo "warn: Rosetta for Linux is off (VM_ROSETTA=0): skipping tty7, MonoCode desktop and Paseo desktop" >&2
  paseo=""
fi

# MonoCode host (native arm64; bundles its own Node): the Mac's MonoCode desktop drives agents here through
# Settings → Connections → Add machine (SSH). `service install` writes a systemd user unit and enables lingering.
mono_tag="${mono_tag:-$(curl -fsSL https://api.github.com/repos/hardbeat920/monocode/releases/latest | python3 -c 'import json, sys; print(json.load(sys.stdin)["tag_name"])')}"
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

# Paseo daemon with its bundled web UI on http://127.0.0.1:6767 (relay stays off), as a systemd user service so it
# runs without the desktop app open. The .deb's `paseo` CLI runs on the app's own runtime, so it needs no Node and
# upgrades with the app. Without Rosetta, the native npm CLI on mise's Node instead (after bootstrap, below).
paseo_unit() {
  mkdir -p ~/.config/systemd/user
  printf '%s\n' '[Unit]' 'Description=Paseo agent daemon (http://127.0.0.1:6767)' '[Service]' 'WorkingDirectory=%h' \
    "ExecStart=$1 daemon run" 'Restart=on-failure' '[Install]' 'WantedBy=default.target' > ~/.config/systemd/user/paseo.service.new
  if ! cmp -s ~/.config/systemd/user/paseo.service.new ~/.config/systemd/user/paseo.service; then
    mv ~/.config/systemd/user/paseo.service.new ~/.config/systemd/user/paseo.service
    systemctl --user daemon-reload
    systemctl --user enable paseo.service
    systemctl --user restart paseo.service
  else
    rm ~/.config/systemd/user/paseo.service.new
    systemctl --user enable --now paseo.service
  fi
}
if [ -n "$paseo" ]; then
  "$paseo" daemon config set features.webUi.enabled true >/dev/null
  paseo_unit "$paseo"
fi

# Pin to the Ubuntu dock (GNOME favorites), appending to existing pins. VMPal Tools run in the desktop session, so
# its bus is there and the dock updates live.
pin_to_dock() {
  local cur new
  cur="$(gsettings get org.gnome.shell favorite-apps)"
  new="$(python3 -c '
import ast, os, sys
cur = ast.literal_eval(sys.argv[1].removeprefix("@as "))
dirs = [os.path.expanduser("~/.local/share/applications"), "/usr/share/applications"]
want = [a for a in sys.argv[2:] if any(os.path.exists(os.path.join(d, a)) for d in dirs)]
print(str(cur + [a for a in want if a not in cur]))' "$cur" "$@")"
  [ "$new" = "$cur" ] || gsettings set org.gnome.shell favorite-apps "$new"
}
pin_to_dock com.mitchellh.ghostty.desktop helium.desktop tty7.desktop

if [ -f "$HOME/.provisioned" ] && [ "${FORCE:-0}" != 1 ]; then
  echo "already provisioned (FORCE=1 to rerun)"; exit 0
fi

export MISE_YES=1
export MISE_TRUSTED_CONFIG_PATHS="$HOME/git:$HOME/.config/mise"

command -v mise >/dev/null || curl -fsSL https://mise.run | sh
[ -d "$HOME/git/dotfiles" ] || git clone https://github.com/ahstn/dotfiles.git "$HOME/git/dotfiles"

# Bootstrap's login_shell step runs plain chsh, which asks for the password through PAM. Set zsh first with sudo,
# so bootstrap finds it done. Takes effect on the next login.
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq zsh >/dev/null
[ "$(getent passwd "$USER" | cut -d: -f7)" = /bin/zsh ] || sudo chsh -s /bin/zsh "$USER"

cd "$HOME/git/dotfiles"
# pi's postinstall hook runs npm, but bootstrap installs tools in parallel, so Node may not be there yet. Install
# it first and put it on PATH, which this non-interactive shell does not get from mise activation.
mise install node@lts
node_bin="$(mise where node@lts)/bin"
export PATH="$node_bin:$HOME/.local/share/mise/shims:$PATH"
# `files` needs Tern secrets; `repos` uses an SSH clone URL.
mise bootstrap --skip files,repos

if [ -z "$paseo" ]; then
  [ -x ~/.local/bin/paseo ] || mise x node@lts -- npm install -g --prefix ~/.local @getpaseo/cli
  mise x node@lts -- paseo daemon config set features.webUi.enabled true >/dev/null
  paseo_unit "%h/.local/bin/mise x node@lts -- %h/.local/bin/paseo"
fi

touch "$HOME/.provisioned"
