# shellcheck shell=bash
# Shared by both engines' libs (tart.sh, vmpal.sh), which the tart:* and vmpal:* file tasks in ../mise-tasks
# source. Settings are VM_* environment variables: mise sets them from mise.local.toml's [env], and the
# defaults below fill the rest. Targets macOS's bash 3.2: no associative arrays, no mapfile.
set -euo pipefail

VM_ROOT="${MISE_CONFIG_ROOT:?run this through mise, e.g. mise run tart:start}"
BUILD="$VM_ROOT/build"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarn:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# vCPUs run as high-priority host threads: they fill the performance cores first, then spill onto efficiency cores.
HOST_CORES="$(sysctl -n hw.ncpu)" HOST_PCORES="$(sysctl -n hw.perflevel0.physicalcpu 2>/dev/null || sysctl -n hw.ncpu)"
: "${VM_CPU:=$(( HOST_CORES / 2 < HOST_PCORES ? HOST_CORES / 2 : HOST_PCORES ))}"   # half the cores, at most the P cores
: "${VM_MEMORY_GB:=8}"
: "${VM_SHARE_DIR=$HOME/shared}"           # shared live into the guest; empty = none. Not for repositories
: "${VM_SHARE_NAME:=shared}"
: "${VM_NETWORK:=shared}"                  # shared (NAT, this Mac only) | bridged (own LAN address)
: "${VM_SSH_PUBKEY:=$HOME/.ssh/id_ed25519.pub}"
: "${VM_SSHD_PORT:=48222}"
: "${VM_SSHD_ALLOW_FROM:=192.168.1.168}"   # LAN clients allowed into the ephemeral sshd (bridged only)
: "${VM_SSHD_AUTHORIZED_KEYS:=$VM_SSH_PUBKEY}"
: "${VM_GITHUB_AUTH_KEY=$HOME/.ssh/github}"                 # private key for git@github.com; empty = skip
: "${VM_GITHUB_SIGNING_KEY=$HOME/.ssh/github-signing-key}"  # private key for SSH commit signing; empty = skip

need_apple_silicon() { [ "$(uname -s)" = Darwin ] && [ "$(uname -m)" = arm64 ] || die "needs an Apple Silicon Mac"; }
need_pubkey() { [ -f "$VM_SSH_PUBKEY" ] || die "no SSH public key at $VM_SSH_PUBKEY (ssh-keygen -t ed25519)"; }
warn_cpu() { [ "$VM_CPU" -le "$HOST_PCORES" ] || warn "VM_CPU=$VM_CPU is more than this Mac's $HOST_PCORES performance cores"; }

# Auto-login reads /etc/kcpassword: the password XORed with a fixed, published key, NUL-padded to 12-byte blocks.
# `sysadminctl -autologin set` fails in VMs (SACSetAutoLoginPassword error 22) yet exits 0, so the file is
# written directly. Encoded on this Mac, base64 for transport, since a fresh guest's python3 may be only the
# Command Line Tools installer stub.
kcpassword_b64() {
  python3 -c "import base64, sys
k = [0x7D, 0x89, 0x52, 0x23, 0xD2, 0xBC, 0xDD, 0xEA, 0xA3, 0xB9, 0x1F]
p = sys.stdin.buffer.read(); p += bytes(12 - len(p) % 12)
print(base64.b64encode(bytes(b ^ k[i % len(k)] for i, b in enumerate(p))).decode())"
}

# github.com's SSH host keys as known_hosts lines, from the TLS-served api.github.com/meta; nothing on failure.
github_host_keys() {
  curl -fsSL https://api.github.com/meta \
    | grep -oE '"(ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa) [A-Za-z0-9+/=]+"' | tr -d '"' | sed 's/^/github.com /' || true
}

# The ephemeral LAN sshd, from the dotfiles' `mise run sshd` task and template, is tracked through the template's
# PidFile (macOS shows the listener as "sshd: /usr/sbin/sshd -D ..."). Open sessions are its children and end first.
# shellcheck disable=SC2034 # used by the engine libs
SSHD_PID_FN='pidf=$HOME/.config/sshd/sshd.pid
sshd_pid() { p=$(cat "$pidf" 2>/dev/null) && ps -p "$p" -o command= 2>/dev/null | grep -q "sshd.* -D" && echo "$p"; }
sshd_stop() { pkill -TERM -P "$1" 2>/dev/null; kill "$1"; }'

mkdir -p "$BUILD"
