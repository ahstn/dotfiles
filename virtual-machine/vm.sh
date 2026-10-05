#!/bin/bash
# Reproducible Ubuntu Desktop (arm64) VM on UTM. See README.md.
# Targets macOS's bash 3.2: no associative arrays, no mapfile.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD="$HERE/build"

# Precedence: environment > config.env > defaults below. Capture explicitly exported settings,
# load config.env, then restore them so `GRUB_AUTOINSTALL=1 ./vm.sh install` beats the file.
_env_overrides="$(export -p | grep -E '^declare -x (VM_|UBUNTU_|GRUB_|UTMCTL=)' || true)"
# shellcheck disable=SC1091
[ -f "$HERE/config.env" ] && . "$HERE/config.env"
eval "$_env_overrides"
unset _env_overrides

: "${VM_NAME:=ubuntu-dev}"
: "${VM_HOSTNAME:=$VM_NAME}"
: "${VM_USER:=$(id -un)}"
: "${VM_MEMORY_MIB:=8192}"
: "${VM_DISK_MIB:=65536}"
: "${VM_CPU_CORES:=0}"
: "${VM_SHARE_DIR:=$HOME/git}"
: "${VM_SSH_PUBKEY:=$HOME/.ssh/id_ed25519.pub}"
: "${VM_PASSWORDLESS_SUDO:=1}"
: "${VM_LOCALE:=en_US.UTF-8}"
: "${VM_KEYBOARD:=us}"
: "${VM_TIMEZONE:=Etc/UTC}"
: "${UBUNTU_ISO_URL:=https://cdimage.ubuntu.com/releases/26.04/release/ubuntu-26.04.1-desktop-arm64.iso}"
: "${VM_SSH_LOCAL_PORT:=2222}"      # 127.0.0.1:<port> -> guest :22 (admin/provisioning, loopback only)
: "${VM_SSHD_PORT:=48222}"           # <LAN addr>:<port> -> guest :<port> (ephemeral sshd)
: "${VM_SSHD_FWD_ADDR:=}"            # LAN address to bind; default: en0 IPv4. 0.0.0.0 = every interface
: "${VM_SSHD_ALLOW_FROM:=10.0.2.2}"  # QEMU user-mode NAT shows every client as 10.0.2.2
: "${VM_SSHD_AUTHORIZED_KEYS:=$VM_SSH_PUBKEY}"  # public key(s) of the LAN client allowed into the ephemeral sshd
: "${VM_GITHUB_AUTH_KEY=$HOME/.ssh/github}"                 # private key for git@github.com; empty = skip
: "${VM_GITHUB_SIGNING_KEY=$HOME/.ssh/github-signing-key}"  # private key for SSH commit signing; empty = skip
: "${GRUB_AUTOINSTALL:=0}"
: "${GRUB_LINUX_LINE_DOWNS:=1}"

UTMCTL="${UTMCTL:-/Applications/UTM.app/Contents/MacOS/utmctl}"
ISO_FILE="$BUILD/$(basename "$UBUNTU_ISO_URL")"
CIDATA_ISO="$BUILD/cidata.iso"
UTM_DOCS="$HOME/Library/Containers/com.utmapp.UTM/Data/Documents"
UTM_PREFS="$HOME/Library/Containers/com.utmapp.UTM/Data/Library/Preferences/com.utmapp.UTM"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarn:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

utm_status() { "$UTMCTL" status "$VM_NAME" 2>/dev/null | tr -d '[:space:]'; }

wait_for_status() { # wait_for_status <status> <timeout-seconds>
  local want="$1" timeout="$2" waited=0
  while [ "$(utm_status)" != "$want" ]; do
    [ "$waited" -ge "$timeout" ] && die "timed out waiting for VM to be '$want'"
    sleep 5; waited=$((waited + 5))
  done
}

# Ask the guest OS to shut down; force power-off only if it ignores the request.
stop_vm() {
  [ "$(utm_status)" = stopped ] && return
  "$UTMCTL" stop --request "$VM_NAME" || true
  local waited=0
  while [ "$(utm_status)" != stopped ] && [ "$waited" -lt 180 ]; do sleep 5; waited=$((waited + 5)); done
  if [ "$(utm_status)" != stopped ]; then
    warn "guest ignored the shutdown request for 3 minutes; forcing power off"
    "$UTMCTL" stop --force "$VM_NAME"
    wait_for_status stopped 60
  fi
}

SSH_OPTS=(-p "$VM_SSH_LOCAL_PORT" -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="$BUILD/known_hosts" -o ConnectTimeout=10)

# Emulated-VLAN guests sit behind QEMU's NAT, so the only way in is the loopback forward.
guest_ssh() { ssh "${SSH_OPTS[@]}" "$VM_USER@127.0.0.1" "$@"; }

wait_for_ssh() {
  local waited=0
  until ssh "${SSH_OPTS[@]}" -o BatchMode=yes "$VM_USER@127.0.0.1" true 2>/dev/null; do
    [ "$waited" -ge 600 ] && die "no SSH via 127.0.0.1:$VM_SSH_LOCAL_PORT after 10 minutes"
    sleep 5; waited=$((waited + 5))
  done
}

# Address the ephemeral sshd forward listens on (host side).
sshd_fwd_addr() {
  if [ -n "$VM_SSHD_FWD_ADDR" ]; then echo "$VM_SSHD_FWD_ADDR"
  else ipconfig getifaddr en0 2>/dev/null || die "no en0 address; set VM_SSHD_FWD_ADDR"; fi
}

# --- subcommands -------------------------------------------------------------

cmd_prereqs() {
  [ "$(uname -s)" = Darwin ] && [ "$(uname -m)" = arm64 ] || die "needs an Apple Silicon Mac"
  [ -d /Applications/UTM.app ] || die "UTM.app not found. Install v5.0.6+ (GitHub pre-release UTM.dmg)."
  [ -x "$UTMCTL" ] || die "utmctl not found at $UTMCTL"
  command -v hdiutil >/dev/null || die "hdiutil missing"
  mkdir -p "$BUILD"

  # QEMURendererBackend 3 = Apple Core OpenGL (OpenGL 4.1 for the guest). App-wide, so per Mac.
  if [ ! -d "$(dirname "$UTM_PREFS")" ]; then
    die "UTM container not found. Launch UTM once, quit it, then rerun."
  fi
  if pgrep -x UTM >/dev/null; then
    warn "UTM is running; it may overwrite the renderer preference. Quit UTM and rerun if the check below fails."
  fi
  defaults write "$UTM_PREFS" QEMURendererBackend -int 3
  [ "$(defaults read "$UTM_PREFS" QEMURendererBackend)" = 3 ] \
    || warn "renderer preference did not stick; set it in UTM > Settings > QEMU Graphics Acceleration"
  log "prereqs ok (renderer = Apple Core OpenGL)"
}

cmd_iso() {
  mkdir -p "$BUILD"
  local base want got
  base="$(dirname "$UBUNTU_ISO_URL")"
  curl -fsSL "$base/SHA256SUMS" -o "$BUILD/SHA256SUMS"
  want="$(grep -F "$(basename "$ISO_FILE")" "$BUILD/SHA256SUMS" | awk '{print $1}')"
  [ -n "$want" ] || die "no checksum for $(basename "$ISO_FILE") in SHA256SUMS"
  if [ -f "$ISO_FILE" ]; then
    got="$(shasum -a 256 "$ISO_FILE" | awk '{print $1}')"
  else
    got=""
  fi
  if [ "$got" != "$want" ]; then
    log "downloading $(basename "$ISO_FILE") (~3.9 GB)"
    curl -fL -C - --progress-bar -o "$ISO_FILE" "$UBUNTU_ISO_URL"
    got="$(shasum -a 256 "$ISO_FILE" | awk '{print $1}')"
  fi
  [ "$got" = "$want" ] || die "checksum mismatch for $ISO_FILE"
  log "ISO verified"
}

# Called inside $(...): only the hash may reach stdout. Prompts and newlines go to stderr.
password_hash() {
  local pw="${VM_PASSWORD:-}" ossl h
  if [ -z "$pw" ]; then
    [ -t 0 ] || die "set VM_PASSWORD or run interactively"
    read -r -s -p "Password for guest user '$VM_USER': " pw; echo >&2
    local again; read -r -s -p "Repeat: " again; echo >&2
    [ "$pw" = "$again" ] || die "passwords differ"
  fi
  [ "${#pw}" -ge 4 ] || die "guest password must be at least 4 characters"
  for ossl in openssl "$(brew --prefix openssl 2>/dev/null || true)/bin/openssl"; do
    if h="$(printf '%s' "$pw" | "$ossl" passwd -6 -stdin 2>/dev/null)" && [ -n "$h" ]; then
      printf '%s\n' "$h"; return
    fi
  done
  die "no openssl with 'passwd -6' support; run: brew install openssl"
}

cmd_cidata() {
  mkdir -p "$BUILD"
  local hash keys="" sudo_cmd="" seed="$BUILD/cidata"
  hash="$(password_hash)"
  [[ "$hash" =~ ^\$6\$[A-Za-z0-9./]+\$[A-Za-z0-9./]+$ ]] || die "unexpected password hash format (want a single-line \$6\$ crypt)"
  if [ -f "$VM_SSH_PUBKEY" ]; then
    keys="      - $(cat "$VM_SSH_PUBKEY")"
  else
    warn "no SSH public key at $VM_SSH_PUBKEY; 'provision' needs one (ssh-keygen -t ed25519)"
    keys="      []"
  fi
  [ "$VM_PASSWORDLESS_SUDO" = 1 ] && sudo_cmd="    - echo '$VM_USER ALL=(ALL) NOPASSWD:ALL' > /target/etc/sudoers.d/90-vm-provision && chmod 440 /target/etc/sudoers.d/90-vm-provision"

  rm -rf "$seed"; mkdir -p "$seed"
  # Values go through the environment so hashes and keys need no sed escaping.
  local uid gid; uid="$(id -u)"; gid="$(id -g)"
  export V_NAME="$VM_NAME" V_HOST="$VM_HOSTNAME" V_USER="$VM_USER" V_HASH="$hash" V_KEYS="$keys" \
         V_SUDO="$sudo_cmd" V_LOCALE="$VM_LOCALE" V_KB="$VM_KEYBOARD" V_TZ="$VM_TIMEZONE" \
         V_UID="$uid" V_GID="$gid"
  render() {
    perl -pe '
      s/\@VM_NAME\@/$ENV{V_NAME}/g;           s/\@VM_HOSTNAME\@/$ENV{V_HOST}/g;
      s/\@VM_USER\@/$ENV{V_USER}/g;           s/\@VM_PASSWORD_HASH\@/$ENV{V_HASH}/g;
      s/\@SSH_KEYS\@/$ENV{V_KEYS}/g;          s/\@SUDO_LATE_COMMAND\@/$ENV{V_SUDO}/g;
      s/\@VM_LOCALE\@/$ENV{V_LOCALE}/g;       s/\@VM_KEYBOARD\@/$ENV{V_KB}/g;
      s/\@VM_TIMEZONE\@/$ENV{V_TZ}/g;         s/\@HOST_UID\@/$ENV{V_UID}/g;
      s/\@\@HOST_GID\@/\@$ENV{V_GID}/g;
    ' "$1"
  }
  render "$HERE/autoinstall/user-data.tmpl" | grep -v '^$' > "$seed/user-data"
  render "$HERE/autoinstall/meta-data" > "$seed/meta-data"

  rm -f "$CIDATA_ISO"
  hdiutil makehybrid -quiet -iso -joliet -default-volume-name CIDATA -o "$CIDATA_ISO" "$seed"
  # Seed contains a password hash; keep it private.
  chmod 600 "$CIDATA_ISO" "$seed"/user-data
  log "built $CIDATA_ISO"
}

cmd_create() {
  [ -f "$ISO_FILE" ] || die "missing ISO; run: $0 iso"
  [ -f "$CIDATA_ISO" ] || die "missing cidata ISO; run: $0 cidata"
  if "$UTMCTL" status "$VM_NAME" >/dev/null 2>&1; then
    die "VM '$VM_NAME' already exists (delete it in UTM or use utmctl delete)"
  fi
  rm -f "$BUILD/known_hosts"
  local fwd_addr; fwd_addr="$(sshd_fwd_addr)"
  log "creating VM '$VM_NAME' (forwards: 127.0.0.1:$VM_SSH_LOCAL_PORT->22, $fwd_addr:$VM_SSHD_PORT->$VM_SSHD_PORT)"
  # Hypervisor, UEFI and the display are all off/absent by default for scripted VMs.
  # Port-forward protocol is the raw code for `network protocol` TCP: AppleScript terms are case-insensitive,
  # so a bare `TCP` resolves to the `serial interface` enumerator `tcp` and UTM rejects the record (-1700).
  osascript - "$VM_NAME" "$ISO_FILE" "$CIDATA_ISO" "$VM_MEMORY_MIB" "$VM_DISK_MIB" "$VM_CPU_CORES" "$VM_SSH_LOCAL_PORT" "$fwd_addr" "$VM_SSHD_PORT" <<'APPLESCRIPT'
on run argv
  set vmName to item 1 of argv
  set isoFile to POSIX file (item 2 of argv)
  set cidataFile to POSIX file (item 3 of argv)
  set memMiB to (item 4 of argv) as integer
  set diskMiB to (item 5 of argv) as integer
  set cores to (item 6 of argv) as integer
  set sshLocal to (item 7 of argv) as integer
  set fwdAddr to item 8 of argv
  set sshdPort to (item 9 of argv) as integer
  tell application "UTM"
    make new virtual machine with properties {backend:qemu, configuration:{name:vmName, architecture:"aarch64", hypervisor:true, uefi:true, memory:memMiB, cpu cores:cores, drives:{{removable:true, source:isoFile}, {removable:true, source:cidataFile}, {guest size:diskMiB}}, displays:{{hardware:"virtio-gpu-gl-pci", dynamic resolution:true, native resolution:false}}, directory share mode:VirtFS, network interfaces:{{mode:emulated, port forwards:{{protocol:«constant ****TcPp», host address:"127.0.0.1", host port:sshLocal, guest port:22}, {protocol:«constant ****TcPp», host address:fwdAddr, host port:sshdPort, guest port:sshdPort}}}}}}
  end tell
end run
APPLESCRIPT
  patch_plist
  set_share_dir
}

# The VirtFS folder lives in the VM registry, not the configuration (`update registry`, UTM.sdef).
SHARE_OK=0
set_share_dir() {
  [ -d "$VM_SHARE_DIR" ] || { warn "share dir $VM_SHARE_DIR does not exist"; return; }
  if osascript - "$VM_NAME" "$VM_SHARE_DIR" <<'APPLESCRIPT'
on run argv
  tell application "UTM"
    update registry (virtual machine named (item 1 of argv)) with {POSIX file (item 2 of argv)}
  end tell
end run
APPLESCRIPT
  then
    SHARE_OK=1; log "VirtFS share: $VM_SHARE_DIR"
  else
    warn "could not set the share; do it by hand: UTM > $VM_NAME > Edit > Sharing > VirtFS > Browse... > $VM_SHARE_DIR"
  fi
}

# ClipboardSharing and the balloon device are not exposed to AppleScript, so edit config.plist.
# Key paths are inferred from UTM's config classes; compare with a wizard-created VM if this warns.
patch_plist() {
  local plist="$UTM_DOCS/$VM_NAME.utm/config.plist" pb=/usr/libexec/PlistBuddy
  [ -f "$plist" ] || { warn "config.plist not found at $plist; enable clipboard sharing and balloon device in the UI"; return; }
  [ "$(utm_status)" = stopped ] || die "VM must be stopped before editing config.plist"
  set_bool() { # set_bool <:Key:Path> <true|false>
    "$pb" -c "Set $1 $2" "$plist" 2>/dev/null || "$pb" -c "Add $1 bool $2" "$plist" 2>/dev/null \
      || warn "could not set $1 in config.plist"
  }
  set_bool :Sharing:ClipboardSharing true
  set_bool :QEMU:BalloonDevice true   # key names from UTM's Configuration/UTMQemuConfiguration*.swift
  log "patched config.plist (clipboard sharing, balloon)"
  # `reload configuration` (UTM 5.0.4+) takes the VM as its direct parameter.
  osascript -e "tell application \"UTM\" to reload configuration (virtual machine named \"$VM_NAME\")" 2>/dev/null \
    || warn "reload configuration failed; quit and reopen UTM so it re-reads config.plist"
}

# Optional and unverified: Ubuntu Desktop may prompt to confirm autoinstall unless the
# `autoinstall` kernel argument is present. Drives GRUB's editor with scripted keys.
grub_autoinstall() {
  log "sending 'autoinstall' kernel arg at GRUB"
  sleep 15
  osascript - "$VM_NAME" "$GRUB_LINUX_LINE_DOWNS" <<'APPLESCRIPT'
on run argv
  set vmName to item 1 of argv
  set downs to (item 2 of argv) as integer
  tell application "UTM"
    set vm to virtual machine named vmName
    tell vm
      input keystroke "e"
      delay 1
      repeat downs times
        input scan code {224, 80, 224, 208} -- Down (set-1 extended)
        delay 0.3
      end repeat
      input scan code {224, 79, 224, 207} -- End
      input keystroke " autoinstall"
      delay 0.5
      input scan code {68, 196} -- F10 boots
    end tell
  end tell
end run
APPLESCRIPT
}

cmd_install() {
  [ "$(utm_status)" = stopped ] || die "VM '$VM_NAME' is not stopped (status: $(utm_status))"
  log "starting unattended install (autoinstall powers the VM off when finished)"
  "$UTMCTL" start "$VM_NAME"
  [ "$GRUB_AUTOINSTALL" = 1 ] && grub_autoinstall
  log "waiting for the installer to power off (up to 90 min)..."
  sleep 60
  wait_for_status stopped 5400
  eject_media || die "install media still attached. Remove both CD/DVD drives in UTM's Edit dialog, then: utmctl start $VM_NAME && $0 provision"
  log "first boot"
  "$UTMCTL" start "$VM_NAME"
}

# Booting with the installer still attached would rerun autoinstall over the disk, so callers must
# stop on failure. Keeps only the fixed disk (drives are matched by id) and returns how many
# removable drives remain afterwards. Unverified against a real UTM.
eject_media() {
  log "ejecting install media"
  local left
  left="$(osascript - "$VM_NAME" <<'APPLESCRIPT'
on run argv
  tell application "UTM"
    set vm to virtual machine named (item 1 of argv)
    set cfg to configuration of vm
    set kept to {}
    repeat with d in (drives of cfg)
      if not (removable of d) then set end of kept to {id:(id of d)}
    end repeat
    set drives of cfg to kept
    update configuration of vm with cfg
    set n to 0
    repeat with d in (drives of (configuration of vm))
      if removable of d then set n to n + 1
    end repeat
    return n
  end tell
end run
APPLESCRIPT
)" || return 1
  [ "$left" = 0 ] || { warn "$left removable drive(s) still attached"; return 1; }
}

cmd_provision() {
  [ -f "$VM_SSH_PUBKEY" ] || die "no SSH key; provisioning goes over SSH"
  log "waiting for SSH on 127.0.0.1:$VM_SSH_LOCAL_PORT"
  wait_for_ssh
  # The script is uploaded first so stdin is free and a TTY can be allocated for sudo prompts.
  local tty=-T
  [ -t 0 ] && tty=-t
  [ "$VM_PASSWORDLESS_SUDO" = 1 ] || [ "$tty" = -t ] \
    || die "VM_PASSWORDLESS_SUDO=0 needs an interactive terminal so sudo can prompt"
  cmd_github_keys
  log "running guest/provision.sh as $VM_USER"
  guest_ssh 'cat > /tmp/vm-provision.sh' < "$HERE/guest/provision.sh"
  ssh "$tty" "${SSH_OPTS[@]}" "$VM_USER@127.0.0.1" "FORCE=${FORCE:-0} bash /tmp/vm-provision.sh"
  log "log out and back in once so the zsh login shell applies"
}

cmd_check() {
  log "acceptance checks (guest)"
  guest_ssh 'set -x; uname -a; mise ls 2>&1 | head -20; echo "shell=$SHELL"; mount | grep -E "utm" || echo "VirtFS not mounted"; touch ~/utm/.vm-write-test && rm ~/utm/.vm-write-test && echo "share writable"; systemctl is-active qemu-guest-agent'
  log "glxinfo (needs a graphical session; expect virgl and OpenGL 4.1)"
  # GNOME is Wayland-only; reach its Xwayland via mutter's auth file. Needs a logged-in desktop session.
  guest_ssh 'export DISPLAY=:0 XAUTHORITY="$(ls /run/user/$(id -u)/.mutter-Xwaylandauth.* 2>/dev/null | head -1)"; glxinfo -B 2>&1 | grep -E "renderer|OpenGL version" || echo "no Xwayland display; log in to the guest desktop first"' || true
  log "clipboard agent (system daemon, virtio port, per-session agent)"
  guest_ssh 'systemctl is-active spice-vdagentd; ls -l /dev/virtio-ports/ 2>&1 | grep -i spice || echo "no com.redhat.spice.0 port: clipboard sharing is off in UTM"; pgrep -a -u "$(id -u)" -x spice-vdagent || echo "session spice-vdagent not running"' || true
  "$UTMCTL" ip-address "$VM_NAME" || true   # emulated VLAN: expect 10.0.2.x, not reachable from the host
  "$UTMCTL" exec "$VM_NAME" --cmd uname -a || warn "utmctl exec syntax unverified; check: utmctl exec --help"
  echo "Manual: GTK4 apps render, clipboard both ways, window resize resizes desktop."
}

cmd_snapshot() {
  local tag="${1:-provisioned}"
  log "stopping VM and snapshotting as '$tag'"
  stop_vm
  "$UTMCTL" snapshot create "$VM_NAME" --name "$tag"
}

# Re-point the LAN forward at the current en0 address (DHCP lease changed). VM must be stopped.
cmd_forward() {
  [ "$(utm_status)" = stopped ] || die "stop the VM first"
  local fwd_addr; fwd_addr="$(sshd_fwd_addr)"
  log "forwards: 127.0.0.1:$VM_SSH_LOCAL_PORT->22, $fwd_addr:$VM_SSHD_PORT->$VM_SSHD_PORT"
  osascript - "$VM_NAME" "$VM_SSH_LOCAL_PORT" "$fwd_addr" "$VM_SSHD_PORT" <<'APPLESCRIPT'
on run argv
  set sshLocal to (item 2 of argv) as integer
  set fwdAddr to item 3 of argv
  set sshdPort to (item 4 of argv) as integer
  tell application "UTM"
    set vm to virtual machine named (item 1 of argv)
    set cfg to configuration of vm
    set i to index of item 1 of network interfaces of cfg
    set item 1 of network interfaces of cfg to {index:i, mode:emulated, port forwards:{{protocol:«constant ****TcPp», host address:"127.0.0.1", host port:sshLocal, guest port:22}, {protocol:«constant ****TcPp», host address:fwdAddr, host port:sshdPort, guest port:sshdPort}}}
    update configuration of vm with cfg
  end tell
end run
APPLESCRIPT
}

# Ephemeral LAN sshd in the guest, using the dotfiles' `mise run sshd` task + template.
# The guest only ever sees clients as 10.0.2.2 (QEMU NAT), so per-client IP filtering happens
# nowhere: authentication is key-only via a dedicated authorized_keys, nothing else.
# The daemon is tracked through the template's PidFile; matching command lines with pkill -f
# would also match the remote shell running these commands.
SSHD_PID_FN='pidf=$HOME/.config/sshd/sshd.pid
sshd_pid() { p=$(cat "$pidf" 2>/dev/null) && [ "$(ps -p "$p" -o comm= 2>/dev/null)" = sshd ] && echo "$p"; }'

cmd_sshd() {
  local action="${1:-start}" minutes="${2:-180}"
  case "$action" in
    start)
      [ -f "$VM_SSHD_AUTHORIZED_KEYS" ] || die "no client public key at $VM_SSHD_AUTHORIZED_KEYS (set VM_SSHD_AUTHORIZED_KEYS)"
      wait_for_ssh
      guest_ssh 'mkdir -p ~/.config/sshd && umask 077 && cat > ~/.config/sshd/authorized_keys' < "$VM_SSHD_AUTHORIZED_KEYS"
      guest_ssh "$SSHD_PID_FN
        export PATH=\$HOME/.local/bin:\$PATH MISE_YES=1 SSHD_USER='$VM_USER' SSHD_LISTEN='0.0.0.0:$VM_SSHD_PORT' SSHD_ALLOW_FROM='$VM_SSHD_ALLOW_FROM'
        [ -d /run/sshd ] || sudo -n mkdir -p /run/sshd || echo 'warn: /run/sshd missing and sudo needs a password' >&2
        cd ~/git/dotfiles && mise dot apply ~/.config/sshd/sshd_config --force
        if p=\$(sshd_pid); then kill \$p; sleep 1; fi
        setsid nohup mise run sshd -m $minutes > ~/.config/sshd/sshd.log 2>&1 < /dev/null &
        sleep 3; cat ~/.config/sshd/sshd.log
        sshd_pid >/dev/null || { echo 'sshd did not start' >&2; exit 1; }"
      log "ephemeral sshd up for ${minutes}m: ssh -p $VM_SSHD_PORT $VM_USER@$(sshd_fwd_addr)" ;;
    stop)
      # Killing sshd ends the `mise run sshd` task, whose trap stops its timer. A stale pid file
      # is harmless: sshd_pid checks the process is actually sshd.
      guest_ssh "$SSHD_PID_FN
        if p=\$(sshd_pid); then kill \$p && echo stopped; else echo 'not running'; fi" ;;
    status)
      guest_ssh "$SSHD_PID_FN
        if p=\$(sshd_pid); then echo \"running (pid \$p)\"; else echo stopped; fi"
      nc -z -w 3 "$(sshd_fwd_addr)" "$VM_SSHD_PORT" && echo "forward reachable" || echo "forward not reachable" ;;
    *) die "usage: $0 sshd [start [minutes]|stop|status]" ;;
  esac
}

# Copy the Mac's GitHub auth and signing keys into the guest's ~/.ssh, pin github.com's host keys
# (from the TLS-served api.github.com/meta) and add a managed Host block. Separate from
# VM_SSH_PUBKEY, which only authorises SSH *into* the guest. Files stream straight into place
# over SSH, so no copy of a private key is staged on the host.
cmd_github_keys() {
  local key b pub hosts n=0
  wait_for_ssh
  guest_ssh 'umask 077 && mkdir -p ~/.ssh'
  for key in "$VM_GITHUB_AUTH_KEY" "$VM_GITHUB_SIGNING_KEY"; do
    [ -n "$key" ] || continue
    [ -f "$key" ] || { warn "GitHub key $key not found; skipping"; continue; }
    b="$(basename "$key")"
    guest_ssh "umask 077 && cat > ~/.ssh/$b" < "$key"
    if [ -f "$key.pub" ]; then pub="$(cat "$key.pub")"
    else pub="$(ssh-keygen -y -f "$key" 2>/dev/null)" || { pub=""; warn "could not derive $b.pub (passphrase-protected?)"; }
    fi
    [ -z "$pub" ] || printf '%s\n' "$pub" | guest_ssh "cat > ~/.ssh/$b.pub && chmod 644 ~/.ssh/$b.pub"
    log "copied $b"
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
  IdentityFile ~/.ssh/$(basename "$VM_GITHUB_AUTH_KEY")
  IdentitiesOnly yes
# <<< vm.sh github <<<
EOF
    # GitHub answers a successful auth with exit status 1, so only the message matters.
    guest_ssh 'ssh -T -o BatchMode=yes git@github.com 2>&1 | head -n1' || true
  fi
}

cmd_all() {
  cmd_prereqs; cmd_iso; cmd_cidata; cmd_create
  if [ "$SHARE_OK" != 1 ]; then
    if [ -t 0 ]; then
      read -r -p "Set the VirtFS share in UTM now (VM is stopped), then press Enter to install... " _
    else
      warn "continuing without a VirtFS share; ~/utm stays empty until it is set"
    fi
  fi
  cmd_install; cmd_provision; cmd_snapshot
}

usage() {
  cat <<EOF
Usage: $0 <command>
  prereqs     check host, set renderer to Apple Core OpenGL
  iso         download and verify the Ubuntu ISO
  cidata      render autoinstall seed and build build/cidata.iso
  create      create the VM through UTM's AppleScript interface
  install     start, wait for autoinstall to finish, eject media, first boot
  provision   run the dotfiles bootstrap in the guest over SSH
  check       print acceptance-check results
  forward     re-point the LAN sshd forward at the current en0 address (VM stopped)
  github-keys copy GitHub auth/signing keys into the guest (also run by provision)
  sshd        sshd start [minutes] | stop | status  (ephemeral LAN sshd in the guest)
  snapshot    stop VM and create a snapshot (default tag: provisioned)
  all         prereqs -> iso -> cidata -> create -> install -> provision -> snapshot
Config: env vars or config.env (see config.env.example).
EOF
}

case "${1:-}" in
  prereqs|iso|cidata|create|install|provision|check|snapshot|forward|sshd|all) c="$1"; shift; "cmd_$c" "$@" ;;
  github-keys) shift; cmd_github_keys "$@" ;;
  *) usage; exit 1 ;;
esac
