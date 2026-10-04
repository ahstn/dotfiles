#!/bin/bash
# Runs inside the guest as the login user (piped over SSH by vm.sh provision).
set -eux -o pipefail

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
# `files` needs Tern secrets; `repos` uses an SSH clone URL. See ../README.md for other known blockers.
mise bootstrap --skip files,repos

touch "$HOME/.provisioned"
