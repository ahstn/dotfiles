#!/bin/bash
# Runs inside the guest as the login user (piped over SSH by vm.sh provision).
set -eux -o pipefail

# Local VM behind the host login: the only password rule is >= 4 characters. libpwquality cannot go
# below 6, so it only warns (enforcing = 0) and pam_unix enforces the length. Runs on every provision.
sudo mkdir -p /etc/security/pwquality.conf.d
printf '%s\n' '# vm.sh: warn only; pam_unix minlen=4 in common-password enforces length.' 'enforcing = 0' \
  | sudo tee /etc/security/pwquality.conf.d/90-vm.conf >/dev/null
sudo sed -i -E '/pam_unix\.so/{/minlen=/!s/pam_unix\.so obscure/pam_unix.so obscure minlen=4/}' /etc/pam.d/common-password

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
