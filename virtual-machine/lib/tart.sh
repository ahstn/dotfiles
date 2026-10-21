# shellcheck shell=bash
# Reproducible macOS VM on Tart (Apple Silicon), for the tart:* tasks. See ../tart-macos/README.md, and
# ../README.md for both engines. Tart itself comes from the tasks' `tart` template in ../mise.toml.
# shellcheck source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

: "${VM_NAME:=macos-dev}"
: "${VM_IMAGE:=ghcr.io/cirruslabs/macos-tahoe-base:latest}"
: "${VM_USER:=admin}"                      # the base image's account
: "${VM_IMAGE_PASSWORD:=admin}"            # its published password, used once to install the SSH key
: "${VM_DISK_GB:=100}"                     # grow only; the base image ships 50 GB
: "${VM_DISPLAY:=1920x1200}"
: "${VM_HEADLESS:=0}"                      # 1 = no window (--no-graphics); Screen Sharing still works
: "${VM_ROOT_DISK_OPTS=caching=cached}"    # tart run --root-disk-opts; empty = Tart's default
: "${VM_BRIDGE:=auto}"                     # bridged only: en0, en1, ... or auto (see cmd_start)
# VM_ADDRESS: reach the guest at this host name or IP instead of asking Tart, e.g. its Tailscale name for a VM
# on another Mac. The SSH tasks (keys, provision, check, github-keys, sshd, ssh) then work from anywhere.

TART_TEAM_ID=9M2P8L4D89   # Cirrus Labs, Inc. Developer ID, which still signs the openai/tart releases
BUILD="$BUILD/tart"
mkdir -p "$BUILD"

vm_exists() { tart get "$VM_NAME" >/dev/null 2>&1; }
vm_state()  { tart list --format json | python3 -c 'import json, sys
print(next((v["State"] for v in json.load(sys.stdin)
            if v.get("Name") == sys.argv[1] and v.get("Source") == "local"), "missing"))' "$VM_NAME"; }
running()   { [ "$(vm_state)" = running ]; }

# Bridged guests are not in the host's vmnet DHCP leases, so ask the ARP table instead.
vm_ip() {
  local resolver=dhcp; [ "$VM_NETWORK" = bridged ] && resolver=arp
  tart ip --wait "${1:-120}" --resolver "$resolver" "$VM_NAME"
}

SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$BUILD/known_hosts" -o ConnectTimeout=10)
[ -f "${VM_SSH_PUBKEY%.pub}" ] && SSH_OPTS+=(-i "${VM_SSH_PUBKEY%.pub}" -o IdentitiesOnly=yes)

GUEST_IP="${VM_ADDRESS:-}"
guest_addr() { [ -n "$GUEST_IP" ] || GUEST_IP="$(vm_ip)" || die "no IP for '$VM_NAME'; is it running? (mise run tart:start)"; echo "$VM_USER@$GUEST_IP"; }
guest_ssh()  { local a; a="$(guest_addr)"; ssh "${SSH_OPTS[@]}" -o BatchMode=yes "$a" "$@"; }

wait_for_ssh() {
  # Resolve once here, outside a subshell, so later guest_addr calls reuse it.
  [ -n "$GUEST_IP" ] || GUEST_IP="$(vm_ip)" || die "no IP for '$VM_NAME'; is it running? (mise run tart:start)"
  local waited=0 a; a="$(guest_addr)"
  until ssh "${SSH_OPTS[@]}" -o BatchMode=yes "$a" true 2>/dev/null; do
    [ "$waited" -ge 300 ] && die "no key-based SSH to $a after 5 minutes (run: mise run tart:keys)"
    sleep 5; waited=$((waited + 5))
  done
}

# --- tasks -------------------------------------------------------------------

# mise installs tart before any tart:* task runs; this checks the host and the binary it installed.
cmd_prereqs() {
  need_apple_silicon
  local app; app="$(cd "$(dirname "$(command -v tart)")/../.." && pwd)"
  codesign --verify --deep --strict "$app" || die "$app: signature invalid"
  codesign -dv "$app" 2>&1 | grep -qx "TeamIdentifier=$TART_TEAM_ID" || die "$app: not signed by Cirrus Labs ($TART_TEAM_ID)"
  spctl -a -t exec "$app" 2>/dev/null || warn "Gatekeeper did not accept $app (spctl)"
  log "tart $(tart --version) at $app"
}

cmd_create() {
  vm_exists && die "VM '$VM_NAME' already exists (delete with: tart delete $VM_NAME)"
  log "cloning $VM_IMAGE to '$VM_NAME' (first pull is ~27 GB)"
  tart clone "$VM_IMAGE" "$VM_NAME"
  rm -f "$BUILD/known_hosts"
  cmd_configure
}

cmd_configure() {
  running && die "stop the VM first (mise run tart:stop)"
  warn_cpu
  log "configuring: $VM_CPU CPUs, $VM_MEMORY_GB GB, ${VM_DISK_GB} GB disk, $VM_DISPLAY display"
  tart set "$VM_NAME" --cpu "$VM_CPU" --memory "$(( VM_MEMORY_GB * 1024 ))" --display "$VM_DISPLAY"
  local cur; cur="$(tart get "$VM_NAME" --format json | python3 -c 'import json, sys; print(json.load(sys.stdin)["Disk"])')"
  if [ "$VM_DISK_GB" -gt "$cur" ]; then
    tart set "$VM_NAME" --disk-size "$VM_DISK_GB"   # the guest daemon grows APFS into it at boot
  fi
}

cmd_start() {
  running && { log "'$VM_NAME' already running at $(vm_ip 5 || echo '?')"; return; }
  local args=() bridge="$VM_BRIDGE"
  [ "$VM_HEADLESS" = 1 ] && args+=(--no-graphics)
  [ -z "$VM_ROOT_DISK_OPTS" ] || args+=(--root-disk-opts "$VM_ROOT_DISK_OPTS")
  if [ -n "$VM_SHARE_DIR" ]; then
    mkdir -p "$VM_SHARE_DIR"
    args+=(--dir "$VM_SHARE_NAME:$VM_SHARE_DIR")
  fi
  case "$VM_NETWORK" in
    shared|nat) ;;
    bridged)
      # auto: the default route's interface, unless that is a VPN tunnel (utun*), which cannot be bridged.
      if [ "$bridge" = auto ]; then
        bridge="$(route -n get default 2>/dev/null | awk '/interface:/ {print $2}')"
        case "$bridge" in en*) ;; *) bridge=en0 ;; esac
      fi
      args+=(--net-bridged "$bridge") ;;
    *) die "VM_NETWORK must be shared or bridged on Tart" ;;
  esac
  log "starting '$VM_NAME' ${args[*]:-}"
  # Detached from this shell so the VM outlives the task; closing the window (or tart:stop) shuts it down.
  nohup tart run "$VM_NAME" "${args[@]}" > "$BUILD/run.log" 2>&1 < /dev/null &
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
# the account keeps admin/admin for the console, but SSH is key-only, which matters with VM_NETWORK=bridged.
cmd_keys() {
  need_pubkey
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
    printf "%s\n" "# vm: key-only SSH" "PasswordAuthentication no" "KbdInteractiveAuthentication no" | sudo tee "$f" >/dev/null'
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
  { printf '%s\n%s\n' "$VM_IMAGE_PASSWORD" "$pw"; printf '%s' "$pw" | kcpassword_b64; } | guest_ssh '
    IFS= read -r old; IFS= read -r new; IFS= read -r kc
    dscl . -passwd "/Users/$USER" "$old" "$new" || { echo "current password is not VM_IMAGE_PASSWORD" >&2; exit 1; }
    security set-keychain-password -o "$old" -p "$new" ~/Library/Keychains/login.keychain-db \
      || echo "warn: login keychain password unchanged" >&2
    if [ "$(sudo -n defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null)" = "$USER" ]; then
      printf "%s" "$kc" | base64 -D | sudo -n tee /etc/kcpassword >/dev/null
      sudo -n chmod 600 /etc/kcpassword
    fi'
  log "password changed for $VM_USER"
}

# GitHub keys; the base pass (guest/mise.toml); on the first run or with FORCE=1, the dotfiles pass
# (guest/dotfiles.sh) and the base's macOS defaults again, over the host Macs' ones; then the Tailscale login.
# --dry-run shows what the base pass would change, and changes nothing.
cmd_provision() {
  wait_for_ssh
  if [ "${1:-}" = --dry-run ]; then guest_base "$(guest_addr)" "$BUILD/known_hosts" --dry-run; return; fi
  cmd_github_keys
  guest_base "$(guest_addr)" "$BUILD/known_hosts"
  if [ -n "$VM_DOTFILES_REPO" ] && { [ "${FORCE:-0}" = 1 ] || ! guest_ssh 'test -f ~/.provisioned'; }; then
    log "dotfiles pass: $VM_DOTFILES_REPO"
    guest_ssh "DOTFILES_REPO='$VM_DOTFILES_REPO' DOTFILES_DIR='$VM_DOTFILES_DIR' bash -s" < "$VM_ROOT/guest/dotfiles.sh"
    guest_base "$(guest_addr)" "$BUILD/known_hosts" --only macos-defaults
  fi
  if [ -n "${VM_TAILSCALE_AUTHKEY:-}" ]; then
    # Over stdin into a private file, so the key is not in either side's process list.
    printf '%s' "$VM_TAILSCALE_AUTHKEY" | guest_ssh "$TS_LOGIN_FN"'
      f="$(mktemp)" && cat > "$f" && ts_login "$f"'
  elif ! guest_ssh 'sudo -n /opt/homebrew/opt/tailscale/bin/tailscale status >/dev/null 2>&1'; then
    log "Tailscale is installed but not logged in. In the guest, run: sudo tailscale up"
  fi
}

cmd_check() {
  log "acceptance checks (guest)"
  guest_ssh 'set -x; sw_vers; uname -m; export PATH=$HOME/.local/bin:/opt/homebrew/bin:$PATH
    mise ls 2>&1 | head -20; dscl . -read ~ UserShell; df -h / | tail -1
    ls "/Volumes/My Shared Files" || echo "no shared folder"
    for a in Ghostty Helium Paseo MonoCode tty7 Claude ChatGPT bb Slack Vorssaint; do ls -d /Applications/$a.app ~/Applications/$a.app 2>/dev/null | grep . || echo "missing $a.app"; done
    sudo -n tailscale status | head -3 || true
    launchctl print gui/$(id -u)/dev.mise.paseo-daemon 2>/dev/null | grep -E "state|pid" | head -2
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
# the LAN with VM_NETWORK=bridged; under NAT just the host can reach the guest.
cmd_sshd() {
  local action="${1:-start}" minutes="${2:-180}"
  case "$action" in
    start)
      [ -f "$VM_SSHD_AUTHORIZED_KEYS" ] || die "no client public key at $VM_SSHD_AUTHORIZED_KEYS (set VM_SSHD_AUTHORIZED_KEYS)"
      [ "$VM_NETWORK" = bridged ] || warn "VM_NETWORK=$VM_NETWORK: the guest is not on the LAN, so only this Mac can reach the sshd"
      wait_for_ssh
      guest_ssh 'mkdir -p ~/.config/sshd && umask 077 && cat > ~/.config/sshd/authorized_keys' < "$VM_SSHD_AUTHORIZED_KEYS"
      # The template's default listen address is the guest's en0, which is its LAN address when bridged.
      guest_ssh "$SSHD_PID_FN
        export PATH=\$HOME/.local/bin:/opt/homebrew/bin:\$PATH MISE_YES=1 SSHD_USER='$VM_USER' SSHD_LISTEN=\"\$(ipconfig getifaddr en0):$VM_SSHD_PORT\" SSHD_ALLOW_FROM='$VM_SSHD_ALLOW_FROM'
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
    *) die "usage: mise run tart:sshd [start|stop|status] [--minutes N]" ;;
  esac
}

# Copy the Mac's GitHub auth and signing keys into the guest's ~/.ssh, pin github.com's host keys and add a
# managed Host block. Separate from VM_SSH_PUBKEY, which only authorises SSH *into* the guest. Files stream
# straight into place.
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

  hosts="$(github_host_keys)"
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
  need_pubkey
  cmd_prereqs; cmd_create; cmd_start; cmd_keys
  if [ -n "${VM_PASSWORD:-}" ]; then cmd_password
  else warn "'$VM_USER' keeps the image password '$VM_IMAGE_PASSWORD' (console and Screen Sharing); change it with: mise run tart:password"
  fi
  cmd_provision; cmd_snapshot
  cmd_start
}
