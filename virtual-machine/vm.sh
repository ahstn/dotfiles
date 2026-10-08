#!/bin/bash
# Reproducible macOS VM on Tart (Apple Silicon). See README.md; the Ubuntu/UTM variant is in _ubuntu/.
# Targets macOS's bash 3.2: no associative arrays, no mapfile.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD="$HERE/build"

# Precedence: environment > config.env > defaults below.
_env_overrides="$(export -p | grep -E '^declare -x (VM_|TART=)' || true)"
# shellcheck disable=SC1091
[ -f "$HERE/config.env" ] && . "$HERE/config.env"
eval "$_env_overrides"
unset _env_overrides

: "${VM_NAME:=macos-dev}"
: "${VM_IMAGE:=ghcr.io/cirruslabs/macos-tahoe-base:latest}"
: "${VM_USER:=admin}"                      # the base image's account
: "${VM_IMAGE_PASSWORD:=admin}"            # its published password, used once to install the SSH key
: "${VM_CPU:=$(( $(sysctl -n hw.ncpu) / 2 ))}"
: "${VM_MEMORY_MIB:=8192}"
: "${VM_DISK_GB:=100}"                     # grow only; the base image ships 50 GB
: "${VM_DISPLAY:=1920x1200}"
: "${VM_HEADLESS:=0}"                      # 1 = no window (--no-graphics); Screen Sharing still works
: "${VM_SHARE_DIR:=$HOME/git}"             # mounted in the guest at "/Volumes/My Shared Files/<name>"; empty = none
: "${VM_SHARE_NAME:=git}"
: "${VM_NET:=nat}"                         # nat (host-only reachable) | bridged (own LAN address)
: "${VM_BRIDGE_IF:=en0}"
: "${VM_SSH_PUBKEY:=$HOME/.ssh/id_ed25519.pub}"
: "${VM_SSHD_PORT:=48222}"
: "${VM_SSHD_ALLOW_FROM:=192.168.1.168}"   # LAN clients allowed into the ephemeral sshd (bridged only)
: "${VM_SSHD_AUTHORIZED_KEYS:=$VM_SSH_PUBKEY}"
: "${VM_GITHUB_AUTH_KEY=$HOME/.ssh/github}"                 # private key for git@github.com; empty = skip
: "${VM_GITHUB_SIGNING_KEY=$HOME/.ssh/github-signing-key}"  # private key for SSH commit signing; empty = skip

# Release used when Homebrew cannot install the tap (cirruslabs/cli/tart breaks on Homebrew 7's `depends_on`).
TART_VERSION=2.40.1
TART_TEAM_ID=9M2P8L4D89   # Cirrus Labs, Inc. Developer ID
TART_HOME="$HOME/.local/opt/tart"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarn:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

find_tart() {
  if [ -n "${TART:-}" ]; then return; fi
  if command -v tart >/dev/null; then TART="$(command -v tart)"
  elif [ -x "$TART_HOME/$TART_VERSION/tart.app/Contents/MacOS/tart" ]; then TART="$TART_HOME/$TART_VERSION/tart.app/Contents/MacOS/tart"
  else TART=""; fi
}
find_tart
tart() { [ -n "$TART" ] || die "tart not installed; run: $0 prereqs"; "$TART" "$@"; }

vm_exists() { tart get "$VM_NAME" >/dev/null 2>&1; }
vm_state()  { tart list --format json | python3 -c 'import json, sys
print(next((v["State"] for v in json.load(sys.stdin)
            if v.get("Name") == sys.argv[1] and v.get("Source") == "local"), "missing"))' "$VM_NAME"; }
running()   { [ "$(vm_state)" = running ]; }

# Bridged guests are not in the host's vmnet DHCP leases, so ask the ARP table instead.
vm_ip() {
  local resolver=dhcp; [ "$VM_NET" = bridged ] && resolver=arp
  tart ip --wait "${1:-120}" --resolver "$resolver" "$VM_NAME"
}

mkdir -p "$BUILD"
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$BUILD/known_hosts" -o ConnectTimeout=10)
[ -f "${VM_SSH_PUBKEY%.pub}" ] && SSH_OPTS+=(-i "${VM_SSH_PUBKEY%.pub}" -o IdentitiesOnly=yes)

GUEST_IP=""
guest_addr() { [ -n "$GUEST_IP" ] || GUEST_IP="$(vm_ip)" || die "no IP for '$VM_NAME'; is it running? ($0 start)"; echo "$VM_USER@$GUEST_IP"; }
guest_ssh()  { local a; a="$(guest_addr)"; ssh "${SSH_OPTS[@]}" -o BatchMode=yes "$a" "$@"; }

wait_for_ssh() {
  # Resolve once here, outside a subshell, so later guest_addr calls reuse it.
  [ -n "$GUEST_IP" ] || GUEST_IP="$(vm_ip)" || die "no IP for '$VM_NAME'; is it running? ($0 start)"
  local waited=0 a; a="$(guest_addr)"
  until ssh "${SSH_OPTS[@]}" -o BatchMode=yes "$a" true 2>/dev/null; do
    [ "$waited" -ge 300 ] && die "no key-based SSH to $a after 5 minutes (run: $0 keys)"
    sleep 5; waited=$((waited + 5))
  done
}

# --- subcommands -------------------------------------------------------------

cmd_prereqs() {
  [ "$(uname -s)" = Darwin ] && [ "$(uname -m)" = arm64 ] || die "needs an Apple Silicon Mac"
  find_tart
  if [ -z "$TART" ]; then
    log "installing tart"
    if command -v brew >/dev/null && brew install cirruslabs/cli/tart; then find_tart
    else
      warn "Homebrew install failed; using the notarized GitHub release v$TART_VERSION"
      install_tart_release; find_tart
    fi
  fi
  [ -n "$TART" ] || die "tart install failed"
  log "tart $("$TART" --version) at $TART"
}

# Release tarball, checked against the release's checksum list, its code signature and notarization.
install_tart_release() {
  local dir="$TART_HOME/$TART_VERSION" tmp base="https://github.com/cirruslabs/tart/releases/download/$TART_VERSION" want got
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/tart.tar.gz" "$base/tart.tar.gz"
  curl -fsSL -o "$tmp/sums.txt" "$base/tart_${TART_VERSION}_checksums.txt"
  want="$(awk '$2 == "tart.tar.gz" {print $1}' "$tmp/sums.txt")"
  got="$(shasum -a 256 "$tmp/tart.tar.gz" | awk '{print $1}')"
  [ -n "$want" ] && [ "$want" = "$got" ] || die "tart.tar.gz checksum mismatch"
  mkdir -p "$tmp/x" && tar -xzf "$tmp/tart.tar.gz" -C "$tmp/x"
  codesign --verify --deep --strict "$tmp/x/tart.app" || die "tart.app signature invalid"
  codesign -dv "$tmp/x/tart.app" 2>&1 | grep -qx "TeamIdentifier=$TART_TEAM_ID" || die "tart.app not signed by Cirrus Labs"
  spctl -a -t exec "$tmp/x/tart.app" 2>/dev/null || warn "Gatekeeper did not accept tart.app (spctl)"
  rm -rf "$dir" && mkdir -p "$(dirname "$dir")" && mv "$tmp/x" "$dir" && rm -rf "$tmp"
  mkdir -p ~/.local/bin
  printf '#!/bin/sh\nexec %s/tart.app/Contents/MacOS/tart "$@"\n' "$dir" > ~/.local/bin/tart
  chmod 755 ~/.local/bin/tart
  log "installed tart $TART_VERSION to $dir (wrapper: ~/.local/bin/tart)"
}

cmd_create() {
  vm_exists && die "VM '$VM_NAME' already exists (delete with: tart delete $VM_NAME)"
  log "cloning $VM_IMAGE to '$VM_NAME' (first pull is ~27 GB)"
  tart clone "$VM_IMAGE" "$VM_NAME"
  rm -f "$BUILD/known_hosts"
  cmd_configure
}

cmd_configure() {
  running && die "stop the VM first ($0 stop)"
  log "configuring: $VM_CPU CPUs, $VM_MEMORY_MIB MiB, ${VM_DISK_GB} GB disk, $VM_DISPLAY display"
  tart set "$VM_NAME" --cpu "$VM_CPU" --memory "$VM_MEMORY_MIB" --display "$VM_DISPLAY"
  local cur; cur="$(tart get "$VM_NAME" --format json | python3 -c 'import json, sys; print(json.load(sys.stdin)["Disk"])')"
  if [ "$VM_DISK_GB" -gt "$cur" ]; then
    tart set "$VM_NAME" --disk-size "$VM_DISK_GB"   # the guest daemon grows APFS into it at boot
  fi
}

cmd_start() {
  running && { log "'$VM_NAME' already running at $(vm_ip 5 || echo '?')"; return; }
  local args=()
  [ "$VM_HEADLESS" = 1 ] && args+=(--no-graphics)
  if [ -n "$VM_SHARE_DIR" ]; then
    [ -d "$VM_SHARE_DIR" ] && args+=(--dir "$VM_SHARE_NAME:$VM_SHARE_DIR") || warn "share dir $VM_SHARE_DIR missing; skipping"
  fi
  case "$VM_NET" in
    nat) ;;
    bridged) args+=(--net-bridged "$VM_BRIDGE_IF") ;;
    *) die "VM_NET must be nat or bridged" ;;
  esac
  log "starting '$VM_NAME' ${args[*]:-}"
  # Detached from this shell so the VM outlives it; closing the window (or `vm.sh stop`) shuts it down.
  nohup "$TART" run "$VM_NAME" "${args[@]}" > "$BUILD/run.log" 2>&1 < /dev/null &
  local waited=0
  until running; do
    [ "$waited" -ge 30 ] && { tail -20 "$BUILD/run.log" >&2; die "VM did not start"; }
    sleep 1; waited=$((waited + 1))
  done
  GUEST_IP="$(vm_ip 300)" || die "VM has no IP after 5 minutes"
  log "running at $GUEST_IP"
}

cmd_stop() {
  running || { log "'$VM_NAME' is not running"; return; }
  log "stopping '$VM_NAME'"
  tart stop "$VM_NAME" --timeout 120
}

# Install VM_SSH_PUBKEY with the image's published password (once), then turn password logins off for sshd:
# the account keeps admin/admin for the console, but SSH is key-only, which matters with VM_NET=bridged.
cmd_keys() {
  [ -f "$VM_SSH_PUBKEY" ] || die "no SSH public key at $VM_SSH_PUBKEY (ssh-keygen -t ed25519)"
  local a; a="$(guest_addr)"
  if ! ssh "${SSH_OPTS[@]}" -o BatchMode=yes "$a" true 2>/dev/null; then
    log "installing $VM_SSH_PUBKEY with the image password"
    local askpass="$BUILD/askpass.sh" waited=0
    printf '#!/bin/sh\nprintf "%%s\\n" "$VM_ASKPASS_PW"\n' > "$askpass" && chmod 700 "$askpass"
    until VM_ASKPASS_PW="$VM_IMAGE_PASSWORD" SSH_ASKPASS="$askpass" SSH_ASKPASS_REQUIRE=force \
        ssh "${SSH_OPTS[@]}" -o PreferredAuthentications=keyboard-interactive,password -o PubkeyAuthentication=no \
        -o NumberOfPasswordPrompts=1 "$a" \
        'umask 077 && mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys' < "$VM_SSH_PUBKEY"; do
      [ "$waited" -ge 300 ] && die "could not log in as $VM_USER with VM_IMAGE_PASSWORD"
      sleep 5; waited=$((waited + 5))
    done
    rm -f "$askpass"
  fi
  wait_for_ssh
  guest_ssh 'sudo -n true' || die "$VM_USER has no passwordless sudo; provisioning needs it"
  guest_ssh 'f=/etc/ssh/sshd_config.d/100-vm-keys-only.conf
    printf "%s\n" "# vm.sh: key-only SSH" "PasswordAuthentication no" "KbdInteractiveAuthentication no" | sudo tee "$f" >/dev/null'
  log "SSH is key-only: ssh $a"
}

# Replace the image's published password (console, Screen Sharing, sudo prompts) and keep the login keychain
# and auto-login in step with it. VM_IMAGE_PASSWORD must be the current password. The passwords travel over
# stdin, but the guest commands take them as arguments, so they are briefly visible in the guest's process list.
cmd_password() {
  local pw="${VM_PASSWORD:-}" again
  if [ -z "$pw" ]; then
    [ -t 0 ] || die "set VM_PASSWORD or run interactively"
    read -r -s -p "New password for guest user '$VM_USER': " pw; echo >&2
    read -r -s -p "Repeat: " again; echo >&2
    [ "$pw" = "$again" ] || die "passwords differ"
  fi
  [ "${#pw}" -ge 4 ] || die "guest password must be at least 4 characters"
  wait_for_ssh
  printf '%s\n%s\n' "$VM_IMAGE_PASSWORD" "$pw" | guest_ssh 'IFS= read -r old; IFS= read -r new
    dscl . -passwd "/Users/$USER" "$old" "$new" || { echo "current password is not VM_IMAGE_PASSWORD" >&2; exit 1; }
    security set-keychain-password -o "$old" -p "$new" ~/Library/Keychains/login.keychain-db \
      || echo "warn: login keychain password unchanged" >&2
    if [ "$(sudo -n defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null)" = "$USER" ]; then
      # sysadminctl -autologin set fails here (SACSetAutoLoginPassword error 22) yet exits 0, so write
      # /etc/kcpassword directly: the password XORed with a fixed, published key, NUL-padded to 12-byte blocks.
      printf "%s" "$new" | python3 -c "import sys
k = [0x7D, 0x89, 0x52, 0x23, 0xD2, 0xBC, 0xDD, 0xEA, 0xA3, 0xB9, 0x1F]
p = sys.stdin.buffer.read(); p += bytes(12 - len(p) % 12)
sys.stdout.buffer.write(bytes(b ^ k[i % len(k)] for i, b in enumerate(p)))" | sudo -n tee /etc/kcpassword >/dev/null
      sudo -n chmod 600 /etc/kcpassword
    fi'
  log "password changed for $VM_USER"
}

cmd_provision() {
  wait_for_ssh
  cmd_github_keys
  if [ -n "${VM_TAILSCALE_AUTHKEY:-}" ]; then
    # Over stdin into a private file, so the key is not in either side's process list; provision.sh deletes it.
    printf '%s' "$VM_TAILSCALE_AUTHKEY" | guest_ssh 'umask 077 && cat > ~/.tailscale-authkey'
  fi
  log "running guest/provision.sh as $VM_USER"
  guest_ssh 'cat > /tmp/vm-provision.sh' < "$HERE/guest/provision.sh"
  ssh -t "${SSH_OPTS[@]}" "$(guest_addr)" \
    "FORCE=${FORCE:-0} SHARE_NAME='$VM_SHARE_NAME' bash /tmp/vm-provision.sh"
}

cmd_check() {
  log "acceptance checks (guest)"
  guest_ssh 'set -x; sw_vers; uname -m; eval "$(/opt/homebrew/bin/brew shellenv)"; export PATH=$HOME/.local/bin:$PATH
    mise ls 2>&1 | head -20; dscl . -read ~ UserShell; df -h / | tail -1
    ls "/Volumes/My Shared Files" || echo "no shared folder"
    ls -d /Applications/{Ghostty,Helium,Paseo,MonoCode,tty7}.app
    sudo -n tailscale status | head -3 || true
    launchctl print gui/$(id -u)/sh.paseo.daemon 2>/dev/null | grep -E "state|pid" | head -2
    curl -fsS -o /dev/null -w "paseo web ui: %{http_code}\n" http://127.0.0.1:6767/ || true
    ssh -T -o BatchMode=yes git@github.com 2>&1 | head -n1'
}

# Snapshots are APFS clones of the stopped VM: cheap, and `tart clone <snapshot> <name>` restores one.
cmd_snapshot() {
  local tag="${1:-provisioned}"
  cmd_stop
  tart delete "$VM_NAME-$tag" 2>/dev/null || true
  tart clone "$VM_NAME" "$VM_NAME-$tag"
  log "snapshot '$VM_NAME-$tag' (restore: tart delete $VM_NAME && tart clone $VM_NAME-$tag $VM_NAME)"
}

# Ephemeral LAN sshd in the guest, using the dotfiles' `mise run sshd` task + template. Only reachable from
# the LAN with VM_NET=bridged; under NAT just the host can reach the guest. Tracked through the template's
# PidFile (macOS shows the listener as "sshd: /usr/sbin/sshd -D ..."); open sessions are its children and end first.
SSHD_PID_FN='pidf=$HOME/.config/sshd/sshd.pid
sshd_pid() { p=$(cat "$pidf" 2>/dev/null) && ps -p "$p" -o command= 2>/dev/null | grep -q "sshd -D" && echo "$p"; }
sshd_stop() { pkill -TERM -P "$1" 2>/dev/null; kill "$1"; }'

cmd_sshd() {
  local action="${1:-start}" minutes="${2:-180}"
  case "$action" in
    start)
      [ -f "$VM_SSHD_AUTHORIZED_KEYS" ] || die "no client public key at $VM_SSHD_AUTHORIZED_KEYS (set VM_SSHD_AUTHORIZED_KEYS)"
      [ "$VM_NET" = bridged ] || warn "VM_NET=$VM_NET: the guest is not on the LAN, so only this Mac can reach the sshd"
      wait_for_ssh
      guest_ssh 'mkdir -p ~/.config/sshd && umask 077 && cat > ~/.config/sshd/authorized_keys' < "$VM_SSHD_AUTHORIZED_KEYS"
      # The template's default listen address is the guest's en0, which is its LAN address when bridged.
      guest_ssh "$SSHD_PID_FN
        eval \"\$(/opt/homebrew/bin/brew shellenv)\"
        export PATH=\$HOME/.local/bin:\$PATH MISE_YES=1 SSHD_USER='$VM_USER' SSHD_LISTEN=\"\$(ipconfig getifaddr en0):$VM_SSHD_PORT\" SSHD_ALLOW_FROM='$VM_SSHD_ALLOW_FROM'
        cd ~/git/dotfiles && mise dot apply ~/.config/sshd/sshd_config --force
        if p=\$(sshd_pid); then sshd_stop \$p; sleep 1; fi
        # The task needs no tools; without this, mise first installs every tool in mise.toml.
        MISE_TASK_RUN_AUTO_INSTALL=false nohup mise run sshd -m $minutes > ~/.config/sshd/sshd.log 2>&1 < /dev/null &
        for _ in \$(seq 60); do sshd_pid >/dev/null && break; sleep 1; done
        tail -20 ~/.config/sshd/sshd.log
        sshd_pid >/dev/null || { echo 'sshd did not start within 60s (log above)' >&2; exit 1; }"
      log "ephemeral sshd up for ${minutes}m: ssh -p $VM_SSHD_PORT $VM_USER@${GUEST_IP}" ;;
    stop)
      guest_ssh "$SSHD_PID_FN
        if p=\$(sshd_pid); then sshd_stop \$p && echo stopped; else echo 'not running'; fi" ;;
    status)
      guest_ssh "$SSHD_PID_FN
        if p=\$(sshd_pid); then echo \"running (pid \$p)\"; else echo stopped; fi" ;;
    *) die "usage: $0 sshd [start [minutes]|stop|status]" ;;
  esac
}

# Copy the Mac's GitHub auth and signing keys into the guest's ~/.ssh, pin github.com's host keys
# (from the TLS-served api.github.com/meta) and add a managed Host block. Separate from
# VM_SSH_PUBKEY, which only authorises SSH *into* the guest. Files stream straight into place.
cmd_github_keys() {
  local pair key b pub hosts n=0
  wait_for_ssh
  guest_ssh 'umask 077 && mkdir -p ~/.ssh'
  for pair in "$VM_GITHUB_AUTH_KEY|github" "$VM_GITHUB_SIGNING_KEY|github-signing-key"; do
    key="${pair%|*}" b="${pair##*|}"
    [ -n "$key" ] || continue
    [ -f "$key" ] || { warn "GitHub key $key not found; skipping"; continue; }
    guest_ssh "umask 077 && cat > ~/.ssh/$b" < "$key"
    if [ -f "$key.pub" ]; then pub="$(cat "$key.pub")"
    else pub="$(ssh-keygen -y -f "$key" 2>/dev/null)" || { pub=""; warn "could not derive $b.pub (passphrase-protected?)"; }
    fi
    [ -z "$pub" ] || printf '%s\n' "$pub" | guest_ssh "cat > ~/.ssh/$b.pub && chmod 644 ~/.ssh/$b.pub"
    log "copied $key to ~/.ssh/$b"
    n=$((n + 1))
  done
  [ "$n" -gt 0 ] || { warn "no GitHub keys copied"; return 0; }

  hosts="$(curl -fsSL https://api.github.com/meta \
    | grep -oE '"(ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa) [A-Za-z0-9+/=]+"' | tr -d '"' | sed 's/^/github.com /')" || hosts=""
  if [ -n "$hosts" ]; then
    printf '%s\n' "$hosts" | guest_ssh 'cd ~/.ssh && touch known_hosts &&
      { grep -v "^github\.com " known_hosts || true; cat; } > known_hosts.tmp &&
      mv known_hosts.tmp known_hosts && chmod 600 known_hosts'
  else
    warn "could not fetch GitHub host keys; first connection will prompt"
  fi

  if [ -n "$VM_GITHUB_AUTH_KEY" ] && [ -f "$VM_GITHUB_AUTH_KEY" ]; then
    guest_ssh 'cd ~/.ssh && touch config &&
      { sed "/^# >>> vm.sh github >>>\$/,/^# <<< vm.sh github <<<\$/d" config; cat; } > config.tmp &&
      mv config.tmp config && chmod 600 config' <<EOF
# >>> vm.sh github >>>
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github
  IdentitiesOnly yes
# <<< vm.sh github <<<
EOF
    # GitHub answers a successful auth with exit status 1, so only the message matters.
    guest_ssh 'ssh -T -o BatchMode=yes git@github.com 2>&1 | head -n1' || true
  fi
}

cmd_ssh() { local a; a="$(guest_addr)"; exec ssh "${SSH_OPTS[@]}" "$a" "$@"; }
cmd_ip()  { running || die "'$VM_NAME' is not running"; vm_ip 5; }

cmd_all() {
  [ -f "$VM_SSH_PUBKEY" ] || die "no SSH public key at $VM_SSH_PUBKEY (ssh-keygen -t ed25519)"
  cmd_prereqs; cmd_create; cmd_start; cmd_keys
  if [ -n "${VM_PASSWORD:-}" ]; then cmd_password
  else warn "'$VM_USER' keeps the image password '$VM_IMAGE_PASSWORD' (console and Screen Sharing); change it with: $0 password"
  fi
  cmd_provision; cmd_snapshot
  cmd_start
}

usage() {
  cat <<EOF
Usage: $0 <command>
  prereqs     check host, install tart (Homebrew, else the verified GitHub release)
  create      clone VM_IMAGE to VM_NAME and apply CPU/memory/disk/display
  configure   re-apply CPU/memory/disk/display (VM stopped)
  start       run the VM in the background (window unless VM_HEADLESS=1) and wait for its IP
  stop        shut the VM down
  keys        install VM_SSH_PUBKEY with the image password, then make SSH key-only
  password    change the guest password (VM_PASSWORD or prompt); keychain and auto-login follow
  provision   GitHub keys + guest/provision.sh (apps, mise bootstrap) over SSH
  check       print acceptance-check results
  github-keys copy GitHub auth/signing keys into the guest (also run by provision)
  sshd        sshd start [minutes] | stop | status  (ephemeral LAN sshd; needs VM_NET=bridged)
  snapshot    stop and clone to VM_NAME-<tag> (default tag: provisioned)
  ssh [cmd]   ssh into the guest
  ip          print the guest's IP
  all         prereqs -> create -> start -> keys -> [password] -> provision -> snapshot -> start
Config: env vars or config.env (see config.env.example).
EOF
}

case "${1:-}" in
  prereqs|create|configure|start|stop|keys|password|provision|check|snapshot|sshd|ssh|ip|all) c="$1"; shift; "cmd_$c" "$@" ;;
  github-keys) shift; cmd_github_keys "$@" ;;
  *) usage; exit 1 ;;
esac
