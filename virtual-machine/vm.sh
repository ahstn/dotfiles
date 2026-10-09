#!/bin/bash
# Reproducible Ubuntu or macOS VM on VMPal (Apple Silicon). See README.md. Earlier engines: _tart_macos/, _utm_ubuntu/.
# Everything in the guest goes through VMPal Tools (`vmpal exec` / `vmpal cp`), so provisioning needs no SSH.
# Targets macOS's bash 3.2: no associative arrays, no mapfile.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Precedence: environment > config.env > defaults below.
_env_overrides="$(export -p | grep -E '^declare -x (VM_|VMPAL=)' || true)"
# shellcheck disable=SC1091
[ -f "$HERE/config.env" ] && . "$HERE/config.env"
eval "$_env_overrides"
unset _env_overrides

: "${VM_OS:=ubuntu}"                       # ubuntu | macos
case "$VM_OS" in
  ubuntu) : "${VM_NAME:=ubuntu-dev}" "${VM_SYSTEM:=download:ubuntu}" "${VM_DISK_GB:=64}" "${VM_ROSETTA:=1}" ;;
  macos)  : "${VM_NAME:=macos-dev}"  "${VM_SYSTEM:=download:macOS}"  "${VM_DISK_GB:=100}" "${VM_ROSETTA:=0}" ;;
  *) echo "VM_OS must be ubuntu or macos" >&2; exit 1 ;;
esac
: "${VM_CPU:=$(( $(sysctl -n hw.ncpu) / 2 ))}"
: "${VM_MEMORY_GB:=8}"
: "${VM_SHARE_DIR=$HOME/git}"              # shared live into the guest; empty = none
: "${VM_SHARE_NAME:=git}"
: "${VM_USER:=$(id -un)}"                 # guest account, set at create only (VMPal's default is this Mac's user)
: "${VM_SSH_PUBKEY:=$HOME/.ssh/id_ed25519.pub}"
: "${VM_GITHUB_AUTH_KEY=$HOME/.ssh/github}"                 # private key for git@github.com; empty = skip
: "${VM_GITHUB_SIGNING_KEY=$HOME/.ssh/github-signing-key}"  # private key for SSH commit signing; empty = skip

VMPAL_APP=/Applications/VMPal.app
VMPAL_BIN="$VMPAL_APP/Contents/Helpers/VMPalMachine.app/Contents/MacOS/VMPalMachine"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarn:\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# The CLI finds VMPal through a link named vmpal, or takes --cli when run from the app bundle directly.
vmpal() {
  if [ -n "${VMPAL:-}" ]; then "$VMPAL" "$@"
  elif command -v vmpal >/dev/null; then command vmpal "$@"
  elif [ -x "$VMPAL_BIN" ]; then "$VMPAL_BIN" --cli "$@"
  else die "VMPal not installed (https://vmpal.com); then run: $0 prereqs"; fi
}

# vm_field <python expression over v>: read the VM's `vmpal info --json`; prints "missing" when there is no VM.
vm_field() {
  local j; j="$(vmpal info "$VM_NAME" --json 2>/dev/null)" || { echo missing; return; }
  printf '%s' "$j" | python3 -c "import json, os, sys; v = json.load(sys.stdin); print($1)"
}
vm_state() { vm_field 'v["state"]'; }
running()  { [ "$(vm_state)" = running ]; }
need_running() { running || die "'$VM_NAME' is not running ($0 start)"; }

# guest <exec options...> -- <script>: run a bash script in the guest as the signed-in user, streaming output.
guest() {
  local opts=()
  while [ "$1" != -- ]; do opts+=("$1"); shift; done; shift
  vmpal exec "$VM_NAME" ${opts[@]+"${opts[@]}"} -- /bin/bash -c "$1"
}

# The account password VMPal made and keeps in this Mac's keychain. macOS guests need it once for sudo.
account_password() { vmpal info "$VM_NAME" --show-password --json | python3 -c 'import json, sys; print(json.load(sys.stdin)["account"]["password"])'; }

guest_ip() {
  case "$VM_OS" in
    ubuntu) guest -- 'ip -4 -o route get 1.1.1.1 | sed -E "s/.* src ([0-9.]+).*/\1/"' ;;
    macos)  guest -- 'ipconfig getifaddr en0' ;;
  esac
}

guest_user() { vm_field 'v["account"]["userName"]'; }

# --- subcommands -------------------------------------------------------------

cmd_prereqs() {
  [ "$(uname -s)" = Darwin ] && [ "$(uname -m)" = arm64 ] || die "needs an Apple Silicon Mac"
  [ -x "$VMPAL_BIN" ] || die "VMPal not installed: get it from https://vmpal.com and open it once"
  if ! command -v vmpal >/dev/null && [ -z "${VMPAL:-}" ]; then
    # A link, not a copy: the CLI finds VMPal through it. ~/.local/bin avoids sudo for /usr/local/bin.
    mkdir -p ~/.local/bin && ln -sfn "$VMPAL_BIN" ~/.local/bin/vmpal
    log "linked ~/.local/bin/vmpal (add ~/.local/bin to PATH to use it directly)"
  fi
  log "VMPal $(defaults read "$VMPAL_APP/Contents/Info" CFBundleShortVersionString)"
  vmpal library | sed -n '1,/^Downloads/p'
}

cmd_create() {
  [ "$(vm_state)" = missing ] || die "VM '$VM_NAME' already exists (delete with: vmpal delete '$VM_NAME' --force)"
  # guest/$VM_OS.sh provisions only its own OS; catch a mismatch before the unattended install, not after.
  case "$(printf '%s' "$VM_SYSTEM" | tr '[:upper:]' '[:lower:]')" in
    *"$VM_OS"*) ;;
    *) die "VM_SYSTEM '$VM_SYSTEM' is not a $VM_OS system (VM_OS=$VM_OS); see: vmpal systems" ;;
  esac
  log "creating '$VM_NAME' from $VM_SYSTEM as $VM_USER: $VM_CPU CPUs, $VM_MEMORY_GB GB, $VM_DISK_GB GB disk (installs unattended)"
  vmpal create "$VM_SYSTEM" --name "$VM_NAME" --cpus "$VM_CPU" --memory "$VM_MEMORY_GB" --disk "$VM_DISK_GB" \
    --user "$VM_USER" --wait --timeout 2h -q >/dev/null
  log "'$VM_NAME' installed as $(guest_user); VMPal keeps its password (vmpal info '$VM_NAME' --show-password)"
  cmd_configure
}

# Apply CPU, memory, disk, Rosetta and the shared folder. Settings that need a restart are applied by one.
cmd_configure() {
  local args=(--cpus "$VM_CPU" --memory "$VM_MEMORY_GB") cur
  cur="$(vm_field 'v["diskLimitGB"]')"
  [ "$VM_DISK_GB" -le "${cur%.*}" ] || args+=(--disk "$VM_DISK_GB")   # grow only
  [ "$VM_OS" = macos ] || { [ "$VM_ROSETTA" = 1 ] && args+=(--rosetta on) || args+=(--rosetta off); }
  if [ -n "$VM_SHARE_DIR" ]; then
    [ -d "$VM_SHARE_DIR" ] || die "share dir $VM_SHARE_DIR missing (set VM_SHARE_DIR, or empty for none)"
    # A share by that name from another folder is replaced, before the other settings.
    case "$(VM_SHARE_DIR="$VM_SHARE_DIR" VM_SHARE_NAME="$VM_SHARE_NAME" vm_field 'next((
        "same" if os.path.realpath(f["path"]) == os.path.realpath(os.environ["VM_SHARE_DIR"]) else "other"
        for f in v["settings"]["sharedFolders"] if f["name"] == os.environ["VM_SHARE_NAME"]), "none")')" in
      same) ;;
      other) log "replacing share '$VM_SHARE_NAME' with $VM_SHARE_DIR"
             vmpal set "$VM_NAME" --unshare "$VM_SHARE_NAME" >/dev/null
             args+=(--share "$VM_SHARE_DIR:$VM_SHARE_NAME") ;;
      *) args+=(--share "$VM_SHARE_DIR:$VM_SHARE_NAME") ;;
    esac
  fi
  log "configuring '$VM_NAME': ${args[*]}"
  vmpal set "$VM_NAME" "${args[@]}" >/dev/null
  if [ "$(vm_field 'len(v["pendingSettings"])')" != 0 ] && running; then
    log "restarting to apply $(vm_field '", ".join(v["pendingSettings"])')"
    vmpal restart "$VM_NAME" --apply-settings --wait
  fi
}

cmd_start() {
  log "starting '$VM_NAME'"
  vmpal start "$VM_NAME" --wait
}

# Stop, then start. `vmpal restart` (a reboot inside the guest) hangs after the guest's shutdown on VMPal 0.60;
# recover with `vmpal stop --force`. `restart --apply-settings`, a full stop and start, is fine.
cmd_restart() { cmd_stop; cmd_start; }

cmd_stop() {
  running || { log "'$VM_NAME' is not running"; return; }
  log "stopping '$VM_NAME'"
  vmpal stop "$VM_NAME"
}

# Passwordless sudo for the account, which provisioning and mise bootstrap need unattended. Linux guests get it
# through `exec --admin` (root); macOS guests through sudo with the password VMPal keeps, passed as an
# environment variable so it is on no command line.
cmd_sudo() {
  need_running
  local rule='printf "%s ALL=(ALL) NOPASSWD: ALL\n" "$(id -un)" > /tmp/vm-sudoers'
  rule="$rule"' && visudo -cf /tmp/vm-sudoers >/dev/null'
  guest -- 'sudo -n true 2>/dev/null' && { log "passwordless sudo already set"; return; }
  log "giving $(guest_user) passwordless sudo"
  case "$VM_OS" in
    ubuntu)
      guest -- "$rule" && guest --admin -- 'install -m 440 -o root -g root /tmp/vm-sudoers /etc/sudoers.d/90-vm-nopasswd && rm -f /tmp/vm-sudoers' ;;
    macos)
      VM_ACCOUNT_PW="$(account_password)" guest --env VM_ACCOUNT_PW -- "$rule"'
        printf "%s\n" "$VM_ACCOUNT_PW" | sudo -S -p "" install -m 440 -o root -g wheel /tmp/vm-sudoers /etc/sudoers.d/90-vm-nopasswd
        rm -f /tmp/vm-sudoers' ;;
  esac
  guest -- 'sudo -n true' || die "passwordless sudo did not take effect"
}

# SSH into the guest, for the host Mac's MonoCode/Paseo (Remote SSH hosts) and `vm.sh ssh`. Key-only, with
# VM_SSH_PUBKEY authorised. The guest's NAT address (192.168.64.x) is reachable from this Mac only.
cmd_keys() {
  [ -f "$VM_SSH_PUBKEY" ] || die "no SSH public key at $VM_SSH_PUBKEY (ssh-keygen -t ed25519)"
  cmd_sudo
  log "authorising $VM_SSH_PUBKEY and making SSH key-only"
  VM_PUBKEY="$(cat "$VM_SSH_PUBKEY")" guest --env VM_PUBKEY -- '
    umask 077 && mkdir -p ~/.ssh && touch ~/.ssh/authorized_keys
    grep -qxF "$VM_PUBKEY" ~/.ssh/authorized_keys || printf "%s\n" "$VM_PUBKEY" >> ~/.ssh/authorized_keys'
  case "$VM_OS" in
    ubuntu) guest -- '
      set -e
      sudo apt-get update -qq   # a fresh install has stale lists
      sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq openssh-server >/dev/null
      printf "%s\n" "# vm.sh: key-only SSH" "PasswordAuthentication no" "KbdInteractiveAuthentication no" \
        | sudo tee /etc/ssh/sshd_config.d/10-vm-keys-only.conf >/dev/null
      sudo systemctl enable --now ssh >/dev/null 2>&1 && sudo systemctl reload ssh' ;;
    macos) guest -- '
      printf "%s\n" "# vm.sh: key-only SSH" "PasswordAuthentication no" "KbdInteractiveAuthentication no" \
        | sudo tee /etc/ssh/sshd_config.d/010-vm-keys-only.conf >/dev/null
      sudo launchctl enable system/com.openssh.sshd
      sudo launchctl bootstrap system /System/Library/LaunchDaemons/ssh.plist 2>/dev/null || true' ;;
  esac
  log "ssh $(guest_user)@$(guest_ip)  (or: $0 ssh)"
}

# Replace the password VMPal made with VM_PASSWORD, in the guest and in VMPal's keychain entry, so VMPal can
# still sign in. The passwords reach the guest as environment variables, on no host command line. In a macOS
# guest, dscl and security take them as arguments, visible to the guest's other processes while they run.
cmd_password() {
  local pw="${VM_PASSWORD:-}" again
  if [ -z "$pw" ]; then
    [ -t 0 ] || die "set VM_PASSWORD or run interactively"
    read -r -s -p "New password for guest user '$(guest_user)': " pw; echo >&2
    read -r -s -p "Repeat: " again; echo >&2
    [ "$pw" = "$again" ] || die "passwords differ"
  fi
  [ "${#pw}" -ge 4 ] || die "guest password must be at least 4 characters"
  need_running
  case "$VM_OS" in
    ubuntu)
      # chpasswd as root skips pwquality, so short passwords are fine on this local VM. The GNOME login keyring
      # keeps the old password; it is unused with automatic login.
      VM_NEW_PW="$pw" guest --admin --env VM_NEW_PW --env VM_GUEST_USER="$(guest_user)" -- \
        'printf "%s:%s\n" "$VM_GUEST_USER" "$VM_NEW_PW" | chpasswd' ;;
    macos)
      cmd_sudo
      VM_OLD_PW="$(account_password)" VM_NEW_PW="$pw" guest --env VM_OLD_PW --env VM_NEW_PW -- '
        sudo dscl . -passwd "/Users/$USER" "$VM_NEW_PW"
        security set-keychain-password -o "$VM_OLD_PW" -p "$VM_NEW_PW" ~/Library/Keychains/login.keychain-db \
          || echo "warn: login keychain password unchanged" >&2' ;;
  esac
  printf '%s' "$pw" | vmpal set "$VM_NAME" --account-password-file - >/dev/null
  log "password changed for $(guest_user), and VMPal keeps the new one"
}

cmd_provision() {
  need_running
  cmd_sudo
  cmd_github_keys
  local share=""
  [ -z "$VM_SHARE_DIR" ] || case "$VM_OS" in
    ubuntu) share="/media/VMPal/$VM_SHARE_NAME" ;;
    macos)  share="/Volumes/My Shared Files/$VM_SHARE_NAME" ;;
  esac
  log "running guest/$VM_OS.sh as $(guest_user)"
  guest -- 'mkdir -p ~/.cache/vm'
  vmpal cp "$HERE/guest/$VM_OS.sh" "$VM_NAME:.cache/vm/provision.sh"
  # The Tailscale auth key, when set, goes as an environment variable and lands in no file on this side.
  local env=(--env "FORCE=${FORCE:-0}" --env "SHARE_PATH=$share" --env "SHARE_NAME=$VM_SHARE_NAME")
  [ -z "${VM_TAILSCALE_AUTHKEY:-}" ] || env+=(--env VM_TAILSCALE_AUTHKEY)
  guest "${env[@]}" -- 'bash ~/.cache/vm/provision.sh'
  [ "$VM_OS" != macos ] || confirm_default_browser
}

# The dotfiles' mise hook makes Helium the default browser, which macOS confirms in a dialog. Click its
# "Use “Helium”" button through VMPal's UI control, only while the guest's default is still another browser.
confirm_default_browser() {
  local js='ObjC.import("AppKit"); const a = $.NSWorkspace.sharedWorkspace.URLForApplicationToOpenURL($.NSURL.URLWithString("https://example.com")); a.isNil() ? "" : a.path.js'
  local cur btn='Use “Helium”'
  cur="$(VM_JS="$js" guest --env VM_JS -- 'osascript -l JavaScript -e "$VM_JS"' 2>/dev/null || true)"
  case "$cur" in
    */Helium.app) return 0 ;;
    "") warn "could not read the guest's default browser; if macOS asks, click $btn in the VM" ; return 0 ;;
  esac
  if vmpal ui "$VM_NAME" wait --text "$btn" --timeout 20s >/dev/null 2>&1 \
    && vmpal ui "$VM_NAME" click --text "$btn" --mask "Confirming Helium as the default browser" >/dev/null; then
    log "confirmed Helium as the guest's default browser"
  else
    warn "no default-browser dialog to confirm (default is $cur); open the VM and set Helium in System Settings"
  fi
}

cmd_check() {
  need_running
  log "acceptance checks (guest)"
  case "$VM_OS" in
    ubuntu) guest -- 'set -x; export PATH=$HOME/.local/bin:$PATH
      . /etc/os-release; echo "$PRETTY_NAME"; uname -m; mise ls 2>&1 | head -20; getent passwd "$USER" | cut -d: -f7
      df -h / | tail -1; ls /media/VMPal/
      command -v ghostty helium monocode tty7 tty7-app; ls /opt/Paseo/Paseo
      cat /proc/sys/fs/binfmt_misc/rosetta | head -1
      tailscale status | head -3 || true
      systemctl --user is-active paseo.service monocode-host.service
      curl -fsS --retry 15 --retry-connrefused --retry-delay 2 -o /dev/null -w "paseo web ui: %{http_code}\n" http://127.0.0.1:6767/ || true
      systemctl is-active ssh
      ssh -T -o BatchMode=yes git@github.com 2>&1 | head -n1' ;;
    macos) guest -- 'set -x; eval "$(/opt/homebrew/bin/brew shellenv)"; export PATH=$HOME/.local/bin:$PATH
      sw_vers; uname -m; mise ls 2>&1 | head -20; dscl . -read ~ UserShell; df -h / | tail -1
      ls "/Volumes/My Shared Files" || echo "no shared folder"
      ls -d /Applications/{Ghostty,Helium,Paseo,MonoCode,tty7}.app
      sudo -n tailscale status | head -3 || true
      launchctl print gui/$(id -u)/sh.paseo.daemon 2>/dev/null | grep -E "state|pid" | head -2
      curl -fsS --retry 15 --retry-connrefused --retry-delay 2 -o /dev/null -w "paseo web ui: %{http_code}\n" http://127.0.0.1:6767/ || true
      ssh -T -o BatchMode=yes git@github.com 2>&1 | head -n1' ;;
  esac
}

# VMPal snapshots, kept in the VM. A Linux VM with GPU acceleration snapshots only when shut down.
cmd_snapshot() {
  local tag="${1:-provisioned}"
  cmd_stop
  vmpal delete-snapshot "$VM_NAME" "$tag" >/dev/null 2>&1 || true
  vmpal snapshot "$VM_NAME" "$tag" >/dev/null
  log "snapshot '$tag' of '$VM_NAME' (restore: vmpal revert '$VM_NAME' '$tag')"
}

# Copy the Mac's GitHub auth and signing keys into the guest's ~/.ssh, pin github.com's host keys
# (from the TLS-served api.github.com/meta) and add a managed Host block. Separate from VM_SSH_PUBKEY,
# which only authorises SSH *into* the guest. Each key goes as an environment variable straight into place.
# An empty setting removes an earlier copy (and, for the auth key, the Host block); a missing file keeps it.
cmd_github_keys() {
  local pair key b pub hosts n=0
  need_running
  for pair in "$VM_GITHUB_AUTH_KEY|github" "$VM_GITHUB_SIGNING_KEY|github-signing-key"; do
    key="${pair%|*}" b="${pair##*|}"
    if [ -z "$key" ]; then
      guest --env "VM_B=$b" -- '[ ! -e ~/.ssh/$VM_B ] && [ ! -e ~/.ssh/$VM_B.pub ] ||
        { rm -f ~/.ssh/$VM_B ~/.ssh/$VM_B.pub && echo "removed ~/.ssh/$VM_B from the guest"; }'
      continue
    fi
    [ -f "$key" ] || { warn "GitHub key $key not found; skipping (an earlier copy in the guest stays)"; continue; }
    if [ -f "$key.pub" ]; then pub="$(cat "$key.pub")"
    else pub="$(ssh-keygen -y -f "$key" 2>/dev/null)" || { pub=""; warn "could not derive $b.pub (passphrase-protected?)"; }
    fi
    VM_KEY="$(cat "$key")" VM_PUB="$pub" guest --env VM_KEY --env VM_PUB --env "VM_B=$b" -- '
      umask 077 && mkdir -p ~/.ssh && printf "%s\n" "$VM_KEY" > ~/.ssh/$VM_B && chmod 600 ~/.ssh/$VM_B
      [ -z "$VM_PUB" ] || { printf "%s\n" "$VM_PUB" > ~/.ssh/$VM_B.pub && chmod 644 ~/.ssh/$VM_B.pub; }'
    log "copied $key to ~/.ssh/$b"
    n=$((n + 1))
  done
  [ -n "$VM_GITHUB_AUTH_KEY" ] || guest -- '[ ! -f ~/.ssh/config ] || ! grep -qx "# >>> vm.sh github >>>" ~/.ssh/config ||
    { cd ~/.ssh && sed "/^# >>> vm.sh github >>>\$/,/^# <<< vm.sh github <<<\$/d" config > config.tmp &&
      mv config.tmp config && chmod 600 config && echo "removed the github.com Host block from the guest"; }'
  [ "$n" -gt 0 ] || { warn "no GitHub keys copied"; return 0; }

  hosts="$(curl -fsSL https://api.github.com/meta \
    | grep -oE '"(ssh-ed25519|ecdsa-sha2-nistp256|ssh-rsa) [A-Za-z0-9+/=]+"' | tr -d '"' | sed 's/^/github.com /')" || hosts=""
  if [ -n "$hosts" ]; then
    VM_HOSTS="$hosts" guest --env VM_HOSTS -- 'cd ~/.ssh && touch known_hosts &&
      { grep -v "^github\.com " known_hosts || true; printf "%s\n" "$VM_HOSTS"; } > known_hosts.tmp &&
      mv known_hosts.tmp known_hosts && chmod 600 known_hosts'
  else
    warn "could not fetch GitHub host keys; first connection will prompt"
  fi

  if [ -n "$VM_GITHUB_AUTH_KEY" ] && [ -f "$VM_GITHUB_AUTH_KEY" ]; then
    guest -- 'cd ~/.ssh && touch config &&
      { sed "/^# >>> vm.sh github >>>\$/,/^# <<< vm.sh github <<<\$/d" config
        printf "%s\n" "# >>> vm.sh github >>>" "Host github.com" "  HostName github.com" "  User git" \
          "  IdentityFile ~/.ssh/github" "  IdentitiesOnly yes" "# <<< vm.sh github <<<"; } > config.tmp &&
      mv config.tmp config && chmod 600 config
      ssh -T -o BatchMode=yes git@github.com 2>&1 | head -n1' || true   # GitHub answers success with status 1
  fi
}

cmd_ssh() {
  need_running
  local opts=(-o StrictHostKeyChecking=accept-new)
  [ -f "${VM_SSH_PUBKEY%.pub}" ] && opts+=(-i "${VM_SSH_PUBKEY%.pub}" -o IdentitiesOnly=yes)
  exec ssh "${opts[@]}" "$(guest_user)@$(guest_ip)" "$@"
}
cmd_ip()   { need_running; guest_ip; }
cmd_exec() { need_running; vmpal exec "$VM_NAME" -- "$@"; }

cmd_all() {
  [ -f "$VM_SSH_PUBKEY" ] || die "no SSH public key at $VM_SSH_PUBKEY (ssh-keygen -t ed25519)"
  cmd_prereqs; cmd_create; cmd_keys
  if [ -n "${VM_PASSWORD:-}" ]; then cmd_password
  else log "keeping the password VMPal made (vmpal info '$VM_NAME' --show-password); change it with: $0 password"
  fi
  cmd_provision; cmd_snapshot
  cmd_start
}

usage() {
  cat <<EOF
Usage: $0 <command>            (VM_OS=$VM_OS, VM_NAME=$VM_NAME)
  prereqs     check the host and VMPal; link the vmpal CLI into ~/.local/bin
  create      create VM_NAME from VM_SYSTEM (unattended install), then configure
  configure   apply CPUs/memory/disk/Rosetta/shared folder, restarting when needed
  start       start the VM and wait until it runs commands
  stop        shut the VM down
  restart     stop, then start (not \`vmpal restart\`, which hangs)
  sudo        give the guest account passwordless sudo (also run by keys/provision)
  keys        authorise VM_SSH_PUBKEY and turn on key-only SSH in the guest
  password    change the guest password (VM_PASSWORD or prompt); VMPal keeps the new one
  provision   GitHub keys + guest/$VM_OS.sh (apps, daemons, mise bootstrap)
  check       print acceptance-check results
  github-keys copy GitHub auth/signing keys into the guest (also run by provision)
  snapshot    stop and take a VMPal snapshot (default name: provisioned)
  ssh [cmd]   ssh into the guest
  exec cmd... run a command in the guest through VMPal Tools
  ip          print the guest's IP
  all         prereqs -> create -> keys -> [password] -> provision -> snapshot -> start
Config: env vars or config.env (see config.env.example).
EOF
}

case "${1:-}" in
  prereqs|create|configure|start|stop|restart|sudo|keys|password|provision|check|snapshot|ssh|exec|ip|all) c="$1"; shift; "cmd_$c" "$@" ;;
  github-keys) shift; cmd_github_keys "$@" ;;
  *) usage; exit 1 ;;
esac
