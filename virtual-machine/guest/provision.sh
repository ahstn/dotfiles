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
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ghostty

# FEX-Emu runs x86_64 Linux binaries on this arm64 guest (binfmt, so they run directly). The package is chosen by
# CPU feature level, as FEX's InstallFEX.py does. Its newest x86 RootFS is Ubuntu 24.04, which is fine on 26.04.
if ! command -v FEXLoader >/dev/null; then
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
# The fetcher does not persist its "default RootFS" choice, so set it here.
mkdir -p ~/.config/fex-emu
[ -f ~/.config/fex-emu/Config.json ] || echo '{"Config":{"RootFS":"Ubuntu_24_04"}}' > ~/.config/fex-emu/Config.json

# install_x86_release <owner/repo> <name>: newest stable vX.Y.Z GitHub release's <name>-<ver>-linux-x86_64.tar.gz,
# checked against its checksums.txt, into ~/.local/opt/<name>/<ver>; executables are linked into ~/.local/bin.
install_x86_release() {
  local repo="$1" name="$2" tag ver dir tmp
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
    mkdir -p "$dir" && tar -xzf "$tmp/$name.tar.gz" -C "$dir" --strip-components=1 && rm -rf "$tmp"
  fi
  mkdir -p ~/.local/bin
  find "$dir" -maxdepth 1 -type f -perm -u+x -exec ln -sfn {} ~/.local/bin/ \;
}

install_x86_release l0ng-ai/tty7 tty7
mkdir -p ~/.local/share/applications
cat > ~/.local/share/applications/tty7.desktop <<EOF
[Desktop Entry]
Type=Application
Name=tty7
Comment=Terminal (x86_64, via FEX-Emu)
Exec=$HOME/.local/bin/tty7-app
Icon=utilities-terminal
Terminal=false
Categories=System;TerminalEmulator;
EOF

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
