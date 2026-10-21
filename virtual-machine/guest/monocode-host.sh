#!/bin/bash
# MonoCode host, so the host Mac's MonoCode can drive agents in the guest over SSH (Settings → Connections → Add
# machine). Run by mise.toml's post-packages hook on every provision: installs the latest release once, checked
# against its .sha256, into ~/.local/opt/monocode-host/<ver>. `service install` registers a per-user launchd agent
# (com.monocode.host) pointing at that version.
set -euo pipefail

# No python3: a fresh macOS guest has only the Command Line Tools installer stub.
mono_tag="$(curl -fsSL https://api.github.com/repos/hardbeat920/monocode/releases/latest \
  | grep -o '"tag_name": *"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
[ -n "$mono_tag" ] || { echo "could not read MonoCode's latest release" >&2; exit 1; }
mono_ver="${mono_tag#v}"
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
mono_agent="gui/$(id -u)/com.monocode.host"
if [ -n "${mono_new:-}" ] || ! launchctl print "$mono_agent" >/dev/null 2>&1; then
  # install only kickstarts an agent that is already loaded, keeping the old version's paths, so an upgrade
  # removes it first. bootout returns before the agent is gone.
  if [ -n "${mono_new:-}" ] && launchctl print "$mono_agent" >/dev/null 2>&1; then
    ~/.local/bin/monocode-host service uninstall
    for _ in $(seq 20); do launchctl print "$mono_agent" >/dev/null 2>&1 || break; sleep 0.5; done
  fi
  ~/.local/bin/monocode-host service install
fi
