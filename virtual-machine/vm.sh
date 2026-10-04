#!/bin/bash
# Reproducible Ubuntu Desktop (arm64) VM on UTM. See README.md.
# Targets macOS's bash 3.2: no associative arrays, no mapfile.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD="$HERE/build"

# Defaults, overridable via env or config.env.
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
: "${GRUB_AUTOINSTALL:=0}"
: "${GRUB_LINUX_LINE_DOWNS:=1}"

# config.env is sourced after the defaults above, so it wins.
# shellcheck disable=SC1091
[ -f "$HERE/config.env" ] && . "$HERE/config.env"

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
  local base sums want got
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

password_hash() {
  local pw="${VM_PASSWORD:-}" ossl
  if [ -z "$pw" ]; then
    [ -t 0 ] || die "set VM_PASSWORD or run interactively"
    read -r -s -p "Password for guest user '$VM_USER': " pw; echo
    local again; read -r -s -p "Repeat: " again; echo
    [ "$pw" = "$again" ] || die "passwords differ"
  fi
  for ossl in openssl "$(brew --prefix openssl 2>/dev/null || true)/bin/openssl"; do
    if h="$(printf '%s' "$pw" | "$ossl" passwd -6 -stdin 2>/dev/null)" && [ -n "$h" ]; then
      echo "$h"; return
    fi
  done
  die "no openssl with 'passwd -6' support; run: brew install openssl"
}

cmd_cidata() {
  mkdir -p "$BUILD"
  local hash keys="" sudo_cmd="" seed="$BUILD/cidata"
  hash="$(password_hash)"
  if [ -f "$VM_SSH_PUBKEY" ]; then
    keys="      - $(cat "$VM_SSH_PUBKEY")"
  else
    warn "no SSH public key at $VM_SSH_PUBKEY; 'provision' needs one (ssh-keygen -t ed25519)"
    keys="      []"
  fi
  [ "$VM_PASSWORDLESS_SUDO" = 1 ] && sudo_cmd="    - echo '$VM_USER ALL=(ALL) NOPASSWD:ALL' > /target/etc/sudoers.d/90-vm-provision && chmod 440 /target/etc/sudoers.d/90-vm-provision"

  rm -rf "$seed"; mkdir -p "$seed"
  # Values go through the environment so hashes and keys need no sed escaping.
  export V_NAME="$VM_NAME" V_HOST="$VM_HOSTNAME" V_USER="$VM_USER" V_HASH="$hash" V_KEYS="$keys" \
         V_SUDO="$sudo_cmd" V_LOCALE="$VM_LOCALE" V_KB="$VM_KEYBOARD" V_TZ="$VM_TIMEZONE" \
         V_UID="$(id -u)" V_GID="$(id -g)"
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
    make new virtual machine with properties {backend:qemu, configuration:{name:vmName, architecture:"aarch64", hypervisor:true, uefi:true, memory:memMiB, cpu cores:cores, drives:{{removable:true, source:isoFile}, {removable:true, source:cidataFile}, {guest size:diskMiB}}, displays:{{hardware:"virtio-gpu-gl-pci", dynamic resolution:true, native resolution:false}}, directory share mode:VirtFS, network interfaces:{{mode:emulated, port forwards:{{protocol:TCP, host address:"127.0.0.1", host port:sshLocal, guest port:22}, {protocol:TCP, host address:fwdAddr, host port:sshdPort, guest port:sshdPort}}}}}}
  end tell
end run
APPLESCRIPT
  patch_plist
  cat <<EOF

One manual step (the VirtFS folder is a sandbox bookmark and cannot be scripted):
  UTM > $VM_NAME > Edit > Sharing > Directory Share Mode: VirtFS > Browse... > $VM_SHARE_DIR
EOF
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
  set_bool :QEMU:Balloon true
  log "patched config.plist (clipboard sharing, balloon)"
  # `reload configuration` exists since UTM 5.0.4; exact AppleScript form is unverified.
  osascript -e "tell application \"UTM\" to reload configuration of virtual machine named \"$VM_NAME\"" 2>/dev/null \
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
  eject_media
  log "first boot"
  "$UTMCTL" start "$VM_NAME"
}

# Clearing the removable drives avoids the reboot-into-installer hang. Unverified AppleScript form.
eject_media() {
  log "ejecting install media"
  osascript - "$VM_NAME" <<'APPLESCRIPT' || warn "eject failed; remove both CD/DVD images in UTM's Edit dialog, then start the VM"
on run argv
  tell application "UTM"
    set vm to virtual machine named (item 1 of argv)
    set cfg to configuration of vm
    repeat with d in (drives of cfg)
      if removable of d then set source of d to missing value
    end repeat
    update configuration of vm with cfg
  end tell
end run
APPLESCRIPT
}

cmd_provision() {
  [ -f "$VM_SSH_PUBKEY" ] || die "no SSH key; provisioning goes over SSH"
  log "waiting for SSH on 127.0.0.1:$VM_SSH_LOCAL_PORT"
  wait_for_ssh
  log "running guest/provision.sh as $VM_USER"
  guest_ssh "FORCE=${FORCE:-0} bash -s" < "$HERE/guest/provision.sh"
  log "log out and back in once so the zsh login shell applies"
}

cmd_check() {
  log "acceptance checks (guest)"
  guest_ssh 'set -x; uname -a; mise ls 2>&1 | head -20; echo "shell=$SHELL"; mount | grep -E "utm" || echo "VirtFS not mounted"; touch ~/utm/.vm-write-test && rm ~/utm/.vm-write-test && echo "share writable"; systemctl is-active qemu-guest-agent'
  log "glxinfo (needs a graphical session; expect virgl and OpenGL 4.1)"
  guest_ssh 'DISPLAY=:0 glxinfo -B 2>&1 | grep -E "renderer|OpenGL version" || echo "no X display via ssh; run glxinfo -B in the guest desktop"' || true
  "$UTMCTL" ip-address "$VM_NAME" || true   # emulated VLAN: expect 10.0.2.x, not reachable from the host
  "$UTMCTL" exec "$VM_NAME" --cmd uname -a || warn "utmctl exec syntax unverified; check: utmctl exec --help"
  echo "Manual: GTK4 apps render, clipboard both ways, window resize resizes desktop."
}

cmd_snapshot() {
  local tag="${1:-provisioned}"
  log "stopping VM and snapshotting as '$tag'"
  "$UTMCTL" stop "$VM_NAME" || true
  wait_for_status stopped 300
  "$UTMCTL" snapshot create "$VM_NAME" --name "$tag" \
    || warn "snapshot syntax unverified; check: utmctl snapshot --help"
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
    set i to id of item 1 of network interfaces of cfg
    set item 1 of network interfaces of cfg to {id:i, mode:emulated, port forwards:{{protocol:TCP, host address:"127.0.0.1", host port:sshLocal, guest port:22}, {protocol:TCP, host address:fwdAddr, host port:sshdPort, guest port:sshdPort}}}
    update configuration of vm with cfg
  end tell
end run
APPLESCRIPT
}

# Ephemeral LAN sshd in the guest, using the dotfiles' `mise run sshd` task + template.
# The guest only ever sees clients as 10.0.2.2 (QEMU NAT), so per-client IP filtering happens
# nowhere: authentication is key-only via a dedicated authorized_keys, nothing else.
cmd_sshd() {
  local action="${1:-start}" minutes="${2:-180}"
  case "$action" in
    start)
      [ -f "$VM_SSHD_AUTHORIZED_KEYS" ] || die "no client public key at $VM_SSHD_AUTHORIZED_KEYS (set VM_SSHD_AUTHORIZED_KEYS)"
      wait_for_ssh
      guest_ssh 'mkdir -p ~/.config/sshd && umask 077 && cat > ~/.config/sshd/authorized_keys && sudo mkdir -p /run/sshd' < "$VM_SSHD_AUTHORIZED_KEYS"
      guest_ssh "export PATH=\$HOME/.local/bin:\$PATH MISE_YES=1 SSHD_USER='$VM_USER' SSHD_LISTEN='0.0.0.0:$VM_SSHD_PORT' SSHD_ALLOW_FROM='$VM_SSHD_ALLOW_FROM'
        cd ~/git/dotfiles && mise dot apply ~/.config/sshd/sshd_config --force
        pkill -f 'sshd -D -e -f .*/.config/sshd/sshd_config' || true
        setsid nohup mise run sshd -m $minutes > ~/.config/sshd/sshd.log 2>&1 < /dev/null &
        sleep 3; cat ~/.config/sshd/sshd.log"
      log "ephemeral sshd up for ${minutes}m: ssh -p $VM_SSHD_PORT $VM_USER@$(sshd_fwd_addr)" ;;
    stop)
      guest_ssh "pkill -f 'mise run sshd' ; pkill -f 'sshd -D -e -f .*/.config/sshd/sshd_config' ; true" ;;
    status)
      guest_ssh "pgrep -af 'sshd -D -e -f .*/.config/sshd/sshd_config' || echo stopped"
      nc -z -w 3 "$(sshd_fwd_addr)" "$VM_SSHD_PORT" && echo "forward reachable" || echo "forward not reachable" ;;
    *) die "usage: $0 sshd [start [minutes]|stop|status]" ;;
  esac
}

cmd_all() {
  cmd_prereqs; cmd_iso; cmd_cidata; cmd_create; cmd_install; cmd_provision; cmd_snapshot
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
  sshd        sshd start [minutes] | stop | status  (ephemeral LAN sshd in the guest)
  snapshot    stop VM and create a snapshot (default tag: provisioned)
  all         prereqs -> iso -> cidata -> create -> install -> provision -> snapshot
Config: env vars or config.env (see config.env.example).
EOF
}

case "${1:-}" in
  prereqs|iso|cidata|create|install|provision|check|snapshot|forward|sshd|all) c="$1"; shift; "cmd_$c" "$@" ;;
  *) usage; exit 1 ;;
esac
