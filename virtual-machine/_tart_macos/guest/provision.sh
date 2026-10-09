#!/bin/bash
# Runs inside the macOS guest as the login user (piped over SSH by vm.sh provision). Needs passwordless sudo,
# which the Cirrus Labs base images give the admin user.
set -eux -o pipefail

eval "$(/opt/homebrew/bin/brew shellenv)"
export PATH="$HOME/.local/bin:$PATH" HOMEBREW_NO_ENV_HINTS=1

# The host folder shared with `tart run --dir`, under a stable path.
[ -z "${SHARE_NAME:-}" ] || ln -sfn "/Volumes/My Shared Files/$SHARE_NAME" "$HOME/host-$SHARE_NAME"

# Apps, before the provisioned check so `./vm.sh provision` adds them to existing VMs. Each step is a no-op once done.
brew install --cask ghostty helium-browser paseo

# app_version <bundle>: installed CFBundleShortVersionString, or empty.
app_version() { defaults read "$1/Contents/Info" CFBundleShortVersionString 2>/dev/null || true; }

# install_app <archive> <bundle-name>: copy <bundle-name>.app out of a .zip or .dmg into /Applications,
# replacing an older copy, after checking its signature and Gatekeeper notarization.
install_app() {
  local archive="$1" name="$2" src mnt="" x
  x="$(mktemp -d)"
  case "$archive" in
    *.zip) ditto -x -k "$archive" "$x" && src="$x/$name.app" ;;
    *.dmg) mnt="$x/mnt" && mkdir "$mnt" && hdiutil attach -quiet -nobrowse -readonly -mountpoint "$mnt" "$archive" && src="$mnt/$name.app" ;;
  esac
  codesign --verify --deep --strict "$src"
  spctl -a -t exec "$src" || echo "warn: Gatekeeper did not accept $name.app" >&2
  sudo rm -rf "/Applications/$name.app.partial" && sudo ditto "$src" "/Applications/$name.app.partial"
  sudo rm -rf "/Applications/$name.app" && sudo mv "/Applications/$name.app.partial" "/Applications/$name.app"
  sudo chown -R "$USER:admin" "/Applications/$name.app"
  [ -z "$mnt" ] || hdiutil detach -quiet "$mnt"
  rm -rf "$x"
}

# gh_release <owner/repo> [stable]: tag of the latest release, or of the newest stable vX.Y.Z (skips nightlies
# and other non-version tags).
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

# check_sha256 <file> <hex>
check_sha256() { echo "$2  $1" | shasum -a 256 -c -; }

# tty7: no Homebrew cask; the release ships an arm64 app, checked against the release's checksums.txt.
tty7_tag="$(gh_release l0ng-ai/tty7)" tty7_ver="${tty7_tag#v}"
if [ "$(app_version /Applications/tty7.app)" != "$tty7_ver" ]; then
  tmp="$(mktemp -d)" asset="tty7-$tty7_ver-macos-arm64.zip"
  curl -fsSL -o "$tmp/$asset" "https://github.com/l0ng-ai/tty7/releases/download/$tty7_tag/$asset"
  curl -fsSL -o "$tmp/checksums.txt" "https://github.com/l0ng-ai/tty7/releases/download/$tty7_tag/checksums.txt"
  check_sha256 "$tmp/$asset" "$(awk -v f="$asset" '$2 == f || $2 == "*" f {print $1}' "$tmp/checksums.txt")"
  install_app "$tmp/$asset" tty7
  rm -rf "$tmp"
fi

# MonoCode desktop: no cask and no checksum file for the DMG, so it is checked against GitHub's asset digest.
mono_tag="$(curl -fsSL https://api.github.com/repos/hardbeat920/monocode/releases/latest | python3 -c 'import json, sys; print(json.load(sys.stdin)["tag_name"])')"
mono_ver="${mono_tag#v}"
if [ "$(app_version /Applications/MonoCode.app)" != "$mono_ver" ]; then
  tmp="$(mktemp -d)" asset="MonoCode_${mono_ver}_aarch64.dmg"
  curl -fsSL -o "$tmp/$asset" "https://github.com/hardbeat920/monocode/releases/download/$mono_tag/$asset"
  check_sha256 "$tmp/$asset" "$(gh_digest hardbeat920/monocode "$mono_tag" "$asset")"
  install_app "$tmp/$asset" MonoCode
  rm -rf "$tmp"
fi

# MonoCode host, so the host Mac's MonoCode can drive agents here over SSH (Settings → Connections → Add machine).
# `service install` registers a per-user launchd agent pointing at this version.
mono_dir="$HOME/.local/opt/monocode-host/$mono_ver"
if [ ! -d "$mono_dir" ]; then
  tmp="$(mktemp -d)" asset=monocode-host-darwin-arm64.tar.gz
  curl -fsSL -o "$tmp/$asset" "https://github.com/hardbeat920/monocode/releases/download/$mono_tag/$asset"
  curl -fsSL -o "$tmp/$asset.sha256" "https://github.com/hardbeat920/monocode/releases/download/$mono_tag/$asset.sha256"
  (cd "$tmp" && shasum -a 256 -c "$asset.sha256")
  rm -rf "$mono_dir".partial.* && mkdir -p "$(dirname "$mono_dir")" && stage="$(mktemp -d "$mono_dir.partial.XXXXXX")"
  tar -xzf "$tmp/$asset" -C "$stage" && chmod 755 "$stage" && mv "$stage" "$mono_dir"
  rm -rf "$tmp"
  mono_new=1
fi
# The launcher resolves its runtime from its own path, so ~/.local/bin gets a wrapper rather than a symlink.
mkdir -p ~/.local/bin
printf '#!/bin/sh\nexec %s/monocode-host "$@"\n' "$mono_dir" > ~/.local/bin/monocode-host
chmod 755 ~/.local/bin/monocode-host
[ -z "${mono_new:-}" ] || ~/.local/bin/monocode-host service install

# Paseo daemon with its bundled web UI on http://127.0.0.1:6767 (relay stays off), as a launchd agent so it runs
# without the desktop app open. The cask's `paseo` CLI runs on the app's own runtime, so it needs no Node and
# stays on the app's version. The host Mac's Paseo can add the VM as a Remote SSH host.
paseo=/opt/homebrew/bin/paseo
"$paseo" daemon config set features.webUi.enabled true >/dev/null
plist="$HOME/Library/LaunchAgents/sh.paseo.daemon.plist"
mkdir -p "$(dirname "$plist")" ~/Library/Logs
cat > "$plist.new" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>sh.paseo.daemon</string>
  <key>ProgramArguments</key>
  <array><string>$paseo</string><string>daemon</string><string>run</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$HOME/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>WorkingDirectory</key><string>$HOME</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/paseo-daemon.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/paseo-daemon.log</string>
</dict>
</plist>
EOF
# Reload only when the agent changed or is not loaded, so reruns leave a running daemon alone.
if ! cmp -s "$plist.new" "$plist" || ! launchctl print "gui/$(id -u)/sh.paseo.daemon" >/dev/null 2>&1; then
  mv "$plist.new" "$plist"
  # bootout returns before the agent is gone, and bootstrapping over it fails with EIO.
  launchctl bootout "gui/$(id -u)/sh.paseo.daemon" 2>/dev/null || true
  for _ in $(seq 20); do launchctl print "gui/$(id -u)/sh.paseo.daemon" >/dev/null 2>&1 || break; sleep 0.5; done
  launchctl bootstrap "gui/$(id -u)" "$plist"
else
  rm -f "$plist.new"
fi

# Tailscale: the open-source tailscaled as a root launchd daemon. The App Store/standalone app needs its
# system extension approved in the GUI, so it cannot be set up unattended.
brew install tailscale
if ! sudo launchctl print system/com.tailscale.tailscaled >/dev/null 2>&1; then
  sudo "$(brew --prefix)/bin/tailscaled" install-system-daemon
fi
# `status --json` answers once tailscaled is up, logged in or not.
for _ in $(seq 30); do sudo tailscale status --json >/dev/null 2>&1 && break; sleep 1; done
ts_up() { sudo tailscale status --json | python3 -c 'import json, sys; sys.exit(json.load(sys.stdin)["BackendState"] != "Running")'; }
# Log in only with an auth key that vm.sh streamed into ~/.tailscale-authkey; tailscaled reads it from the file.
if [ -f ~/.tailscale-authkey ]; then
  ts_up || sudo tailscale up --auth-key="file:$HOME/.tailscale-authkey" || { rm -f ~/.tailscale-authkey; exit 1; }
  rm -f ~/.tailscale-authkey
elif ! ts_up; then
  echo "Tailscale is installed but not logged in. In the guest, run: sudo tailscale up"
fi

# Pin to the Dock, appending to existing pins.
pin_to_dock() {
  local app changed=""
  for app; do
    [ -d "$app" ] || continue
    defaults read com.apple.dock persistent-apps 2>/dev/null | grep -q "file://$app/" && continue
    defaults write com.apple.dock persistent-apps -array-add "<dict><key>tile-data</key><dict><key>file-data</key><dict>
      <key>_CFURLString</key><string>file://$app/</string><key>_CFURLStringType</key><integer>15</integer></dict></dict></dict>"
    changed=1
  done
  [ -z "$changed" ] || killall Dock || true
}
pin_to_dock /Applications/Ghostty.app /Applications/Helium.app /Applications/tty7.app

if [ -f "$HOME/.provisioned" ] && [ "${FORCE:-0}" != 1 ]; then
  echo "already provisioned (FORCE=1 to rerun)"; exit 0
fi

export MISE_YES=1
export MISE_TRUSTED_CONFIG_PATHS="$HOME/git:$HOME/.config/mise"

command -v mise >/dev/null || curl -fsSL https://mise.run | sh
[ -d "$HOME/git/dotfiles" ] || git clone https://github.com/ahstn/dotfiles.git "$HOME/git/dotfiles"

cd "$HOME/git/dotfiles"
# The base image's CI ~/.gitconfig (git-credential-manager, LFS) blocks the dotfiles' symlink; keep it aside.
[ ! -f ~/.gitconfig ] || [ -L ~/.gitconfig ] || mv ~/.gitconfig ~/.gitconfig.base-image
# Bootstrap installs brew packages before it links dotfiles, from the config it loaded at the start, so the
# packages in ~/.config/mise/config.toml need that link first. `files` needs Tern secrets; `repos` uses an SSH
# clone URL. See ../README.md for other known blockers.
mise bootstrap --only dotfiles
mise bootstrap --skip files,repos

# macOS defaults to /bin/zsh; set it if the image's account differs. Takes effect on the next login.
[ "$(dscl . -read "$HOME" UserShell | awk '{print $2}')" = /bin/zsh ] || sudo chsh -s /bin/zsh "$USER"

touch "$HOME/.provisioned"
