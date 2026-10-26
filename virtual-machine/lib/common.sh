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
: "${VM_DOTFILES_REPO=https://github.com/ahstn/dotfiles.git}" # cloned and applied by the dotfiles pass; empty = skip
: "${VM_DOTFILES_DIR:=git/dotfiles}"       # where, relative to the guest's home

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

# guest_base <user@host> <known_hosts> [mise bootstrap flags...]: apply ../guest/mise.toml in the guest with
# `mise bootstrap remote`, over SSH with VM_SSH_PUBKEY's key. The guest gets this mise's version and keeps it at
# ~/.local/bin/mise. Remote runs pass no environment, so the share name goes in a generated mise.vm.local.toml.
# repos is skipped, unless the flags pick parts with --only (which mise refuses alongside --skip): the dotfiles'
# [bootstrap.repos] uses an SSH clone URL.
guest_base() {
  local dest="$1" known_hosts="$2" src="$BUILD/guest" a skip=(--skip repos); shift 2
  for a in "$@"; do case "$a" in --only|--only=*) skip=() ;; esac; done
  rm -rf "$src" && mkdir -p "$src" && cp -R "$VM_ROOT/guest/." "$src/"
  printf '# Written by the provision task.\n[vars]\nshare_name = "%s"\n' "${VM_SHARE_DIR:+$VM_SHARE_NAME}" \
    > "$src/mise.vm.local.toml"
  local opts=(--host "$dest" --source "$src" --remote-env vm --install-mise --yes ${skip[@]+"${skip[@]}"}
    --ssh-option StrictHostKeyChecking=accept-new --ssh-option "UserKnownHostsFile=$known_hosts")
  [ ! -f "${VM_SSH_PUBKEY%.pub}" ] || opts+=(-i "${VM_SSH_PUBKEY%.pub}" --ssh-option IdentitiesOnly=yes)
  log "applying guest/mise.toml to $dest ${*:-}"
  mise bootstrap remote "${opts[@]}" "$@"
}

# Guest-side Tailscale login: ts_login <file> logs in with the auth key in <file>, unless already logged in, and
# deletes the file, so the key is in no command line. Returns non-zero when tailscaled does not answer or the
# login fails. No python3: a fresh guest has only the installer stub.
# shellcheck disable=SC2034 # used by the engine libs
TS_LOGIN_FN='ts_login() {
  ts=/opt/homebrew/opt/tailscale/bin/tailscale rc=1
  for _ in $(seq 30); do sudo "$ts" status --json >/dev/null 2>&1 && { rc=0; break; }; sleep 1; done
  if [ "$rc" != 0 ]; then echo "tailscaled did not respond within 30s" >&2
  elif sudo "$ts" status --json | grep -q "\"BackendState\": *\"Running\""; then echo "Tailscale is already logged in"
  else sudo "$ts" up --auth-key="file:$1" || rc=$?
  fi
  rm -f "$1"; return "$rc"
}'

# Guest side of the builder (lib/builder.sh): registers the BuildKit at BUILDER_ENDPOINT as the guest's current
# buildx builder in every docker context (--global), with the client certificates the engine task copied to
# ~/.docker/certs/vm-builder. buildx comes from the base pass (guest/mise.toml).
# shellcheck disable=SC2034 # used by the engine libs
BUILDER_CONNECT='set -eu
export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:/opt/homebrew/bin:$PATH"
docker buildx version >/dev/null 2>&1 \
  || { echo "no docker buildx in the guest: run the provision task first (mise run tart:provision or vmpal:provision)" >&2; exit 1; }
d="$HOME/.docker/certs/vm-builder"
chmod 700 "$d" && chmod 600 "$d/key.pem"
docker buildx rm vm-builder >/dev/null 2>&1 || true
docker buildx create --name vm-builder --driver remote --bootstrap \
  --driver-opt "cacert=$d/ca.pem,cert=$d/cert.pem,key=$d/key.pem" "tcp://$BUILDER_ENDPOINT"
docker buildx use --global vm-builder
docker buildx inspect vm-builder | grep -i platforms'

# builder_endpoint: host:port that builder:start wrote, or exit telling you to run it.
builder_endpoint() {
  cat "$VM_ROOT/build/builder/endpoint" 2>/dev/null \
    || die "no builder on this Mac yet: run mise run builder:start here first (on the Mac that hosts the VM)"
}

mkdir -p "$BUILD"
