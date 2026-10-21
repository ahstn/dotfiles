# shellcheck shell=bash
# Reproducible macOS or Ubuntu VM on VMPal (Apple Silicon), for the vmpal:* tasks. See ../vmpal-macos/README.md,
# and ../README.md for both engines. Everything in the guest goes through VMPal Tools (`vmpal exec` / `vmpal cp`),
# so provisioning needs no SSH.
# shellcheck source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

: "${VM_OS:=macos}"                        # macos | ubuntu
# macOS matches Tart's images (admin/admin). Linux reserves "admin", so Ubuntu uses this Mac's user name and
# keeps the password VMPal makes.
case "$VM_OS" in
  macos)  : "${VM_NAME:=macos-dev}"  "${VM_SYSTEM:=download:macOS}"  "${VM_DISK_GB:=100}" "${VM_ROSETTA:=0}" \
              "${VM_USER:=admin}" "${VM_PASSWORD=admin}" ;;
  ubuntu) : "${VM_NAME:=ubuntu-dev}" "${VM_SYSTEM:=download:ubuntu}" "${VM_DISK_GB:=64}" "${VM_ROSETTA:=1}" \
              "${VM_USER:=$(id -un)}" "${VM_PASSWORD=}" ;;
  *) die "VM_OS must be macos or ubuntu" ;;
esac
# VM_USER: the guest account, set at create only. VM_PASSWORD: set by `all`; empty = keep VMPal's generated one.
# VM_NETWORK may also be host-only here.
: "${VM_BRIDGE:=auto}"                     # bridged only: a Mac interface such as en0, or auto for the main one
: "${VM_LOCAL_NETWORK:=default}"           # on | off | default: a 2nd NIC on 192.168.128.x with this Mac and its VMs

VMPAL_APP=/Applications/VMPal.app
VMPAL_BIN="$VMPAL_APP/Contents/Helpers/VMPalMachine.app/Contents/MacOS/VMPalMachine"

# The CLI finds VMPal through a link named vmpal, or takes --cli when run from the app bundle directly.
vmpal() {
  if [ -n "${VMPAL:-}" ]; then "$VMPAL" "$@"
  elif command -v vmpal >/dev/null; then command vmpal "$@"
  elif [ -x "$VMPAL_BIN" ]; then "$VMPAL_BIN" --cli "$@"
  else die "VMPal not installed (https://vmpal.com); then run: mise run vmpal:prereqs"; fi
}

# vm_field <python expression over v>: read the VM's `vmpal info --json`; prints "missing" when there is no VM.
vm_field() {
  local j; j="$(vmpal info "$VM_NAME" --json 2>/dev/null)" || { echo missing; return; }
  printf '%s' "$j" | python3 -c "import json, os, sys; v = json.load(sys.stdin); print($1)"
}
vm_state() { vm_field 'v["state"]'; }
running()  { [ "$(vm_state)" = running ]; }
need_running() { running || die "'$VM_NAME' is not running (mise run vmpal:start)"; }

# guest <exec options...> -- <script>: run a bash script in the guest as the signed-in user, streaming output.
guest() {
  local opts=()
  while [ "$1" != -- ]; do opts+=("$1"); shift; done; shift
  vmpal exec "$VM_NAME" ${opts[@]+"${opts[@]}"} -- /bin/bash -c "$1"
}

# The account password VMPal made and keeps in this Mac's keychain. macOS guests need it once for sudo.
account_password() { vmpal info "$VM_NAME" --show-password --json | python3 -c 'import json, sys; print(json.load(sys.stdin)["account"]["password"])'; }

# The guest's address on its main network, as VMPal reports it: 192.168.64.x when shared, a LAN address when
# bridged. VMPal learns it some seconds after the guest can run commands.
guest_ip() {
  local ip
  for _ in $(seq 30); do
    ip="$(vm_field 'v.get("internetAddress") or ""')"
    [ -z "$ip" ] || { echo "$ip"; return; }
    sleep 1
  done
  die "VMPal reports no address for '$VM_NAME'"
}

# The network mode the running VM is on. VMPal falls back to shared when a bridged network does not start
# (seen with Ubuntu on VMPal 0.66: "vmnet didn't start the interface (status 1001)"); a later start usually works.
network_in_use() { vm_field 'v["sessionHardware"]["networkMode"] if v["state"] == "running" else ""'; }

# Setup Assistant can create a different account from the name VMPal records.
guest_user() { guest -- 'id -un'; }

# --- tasks -------------------------------------------------------------

cmd_prereqs() {
  need_apple_silicon
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
  # The guest script provisions only its own OS; catch a mismatch before the unattended install, not after.
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

# Apply CPU, memory, disk, Rosetta, networks and the shared folder. Settings that need a restart are applied by one.
cmd_configure() {
  local args=(--cpus "$VM_CPU" --memory "$VM_MEMORY_GB" --network-mode "$VM_NETWORK" --local-network "$VM_LOCAL_NETWORK") cur
  [ "$VM_NETWORK" != bridged ] || args+=(--bridge "$VM_BRIDGE")
  cur="$(vm_field 'v["diskLimitGB"]')"
  [ "$VM_DISK_GB" -le "${cur%.*}" ] || args+=(--disk "$VM_DISK_GB")   # grow only
  [ "$VM_OS" = macos ] || { [ "$VM_ROSETTA" = 1 ] && args+=(--rosetta on) || args+=(--rosetta off); }
  warn_cpu
  # The earlier default shared ~/git as "git"; it is removed so repositories stay on the guest's own disk.
  if [ "$VM_SHARE_NAME" != git ] && [ "$(vm_field 'any(f["name"] == "git" for f in v["settings"]["sharedFolders"])')" = True ]; then
    log "removing the earlier default share 'git'"
    vmpal set "$VM_NAME" --unshare git >/dev/null
  fi
  if [ -n "$VM_SHARE_DIR" ]; then
    mkdir -p "$VM_SHARE_DIR"
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
  if [ "$VM_NETWORK" = bridged ] && running && [ "$(network_in_use)" != bridged ]; then
    warn "'$VM_NAME' is on $(network_in_use), not bridged: $(vm_field 'v.get("problem") or "no reason given"'); starting it again"
    cmd_restart
    [ "$(network_in_use)" = bridged ] || warn "'$VM_NAME' is still on $(network_in_use); try: mise run vmpal:restart"
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

# SSH into the guest, for the host Mac's MonoCode/Paseo (Remote SSH hosts) and vmpal:ssh. Key-only, with
# VM_SSH_PUBKEY authorised. The guest's NAT address (192.168.64.x) is reachable from this Mac only.
cmd_keys() {
  need_pubkey
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
      printf "%s\n" "# vm: key-only SSH" "PasswordAuthentication no" "KbdInteractiveAuthentication no" \
        | sudo tee /etc/ssh/sshd_config.d/10-vm-keys-only.conf >/dev/null
      sudo systemctl enable --now ssh >/dev/null 2>&1 && sudo systemctl reload ssh' ;;
    macos) guest -- '
      printf "%s\n" "# vm: key-only SSH" "PasswordAuthentication no" "KbdInteractiveAuthentication no" \
        | sudo tee /etc/ssh/sshd_config.d/010-vm-keys-only.conf >/dev/null
      sudo launchctl enable system/com.openssh.sshd
      sudo launchctl bootstrap system /System/Library/LaunchDaemons/ssh.plist 2>/dev/null || true' ;;
  esac
  log "ssh $(guest_user)@$(guest_ip)  (or: mise run vmpal:ssh)"
}

# Replace the password VMPal keeps with VM_PASSWORD, in the guest and in VMPal's keychain entry, so VMPal can
# still sign in. The passwords reach the guest as environment variables, on no host command line. In a macOS
# guest, dscl and security take them as arguments, visible to the guest's other processes while they run.
# macOS needs the old password: root's `dscl -passwd` without it fails (eDSAuthFailed) for a secure-token account.
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
      # Automatic login reads /etc/kcpassword (see kcpassword_b64).
      VM_OLD_PW="$(account_password)" VM_NEW_PW="$pw" VM_KCPASSWORD="$(printf '%s' "$pw" | kcpassword_b64)" \
        guest --env VM_OLD_PW --env VM_NEW_PW --env VM_KCPASSWORD -- '
        set -e
        dscl . -passwd "/Users/$USER" "$VM_OLD_PW" "$VM_NEW_PW" || { echo "the guest password is not the one VMPal keeps" >&2; exit 1; }
        security set-keychain-password -o "$VM_OLD_PW" -p "$VM_NEW_PW" ~/Library/Keychains/login.keychain-db \
          || echo "warn: login keychain password unchanged" >&2
        if [ "$(sudo defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null)" = "$USER" ]; then
          printf "%s" "$VM_KCPASSWORD" | base64 -D | sudo tee /etc/kcpassword >/dev/null
          sudo chmod 600 /etc/kcpassword
        fi' ;;
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
  # macOS runs the provisioning shared with tart-macos, which sources this engine's hooks from beside it.
  local script="$VM_ROOT/vmpal-macos/guest/ubuntu.sh"
  [ "$VM_OS" != macos ] || script="$VM_ROOT/guest/macos.sh"
  log "running ${script#"$VM_ROOT/"} as $(guest_user)"
  guest -- 'rm -rf ~/.cache/vm && mkdir -p ~/.cache/vm'
  vmpal cp "$script" "$VM_NAME:.cache/vm/provision.sh"
  [ "$VM_OS" != macos ] || vmpal cp "$VM_ROOT/vmpal-macos/guest/macos-engine.sh" "$VM_NAME:.cache/vm/macos-engine.sh"
  # The Tailscale auth key, when set, goes as an environment variable and lands in no file on this side.
  local env=(--env "FORCE=${FORCE:-0}" --env "SHARE_PATH=$share" --env "SHARE_NAME=${share:+$VM_SHARE_NAME}")
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
      for a in Ghostty Helium Paseo MonoCode tty7 Claude ChatGPT bb Slack Vorssaint; do ls -d /Applications/$a.app ~/Applications/$a.app 2>/dev/null | grep . || echo "missing $a.app"; done
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

  hosts="$(github_host_keys)"
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

# Ephemeral sshd for another device on the LAN, from the dotfiles' `mise run sshd` task and template: key-only,
# with its own authorized_keys (VM_SSHD_AUTHORIZED_KEYS) and AllowUsers <user>@VM_SSHD_ALLOW_FROM. Bridged
# networking keeps the client's source address, so the allowlist applies as written. The daemon is tracked
# through the template's PidFile (SSHD_PID_FN); stopping it ends open sessions, its children, first.

cmd_sshd() {
  local action="${1:-start}" minutes="${2:-180}" ip
  need_running
  case "$action" in
    start)
      [ -f "$VM_SSHD_AUTHORIZED_KEYS" ] || die "no client public key at $VM_SSHD_AUTHORIZED_KEYS (set VM_SSHD_AUTHORIZED_KEYS)"
      [ "$(network_in_use)" = bridged ] \
        || warn "'$VM_NAME' is not bridged, so only this Mac can reach the sshd (VM_NETWORK=bridged, then mise run vmpal:configure)"
      ip="$(guest_ip)"
      VM_KEYS="$(cat "$VM_SSHD_AUTHORIZED_KEYS")" guest --env VM_KEYS -- \
        'mkdir -p ~/.config/sshd && umask 077 && printf "%s\n" "$VM_KEYS" > ~/.config/sshd/authorized_keys'
      # setsid (Linux) or nohup alone (macOS) keeps the task running once `vmpal exec` returns.
      guest --env "SSHD_LISTEN=$ip:$VM_SSHD_PORT" --env "SSHD_ALLOW_FROM=$VM_SSHD_ALLOW_FROM" -- "$SSHD_PID_FN
        [ ! -x /opt/homebrew/bin/brew ] || eval \"\$(/opt/homebrew/bin/brew shellenv)\"
        export PATH=\$HOME/.local/bin:\$PATH MISE_YES=1 SSHD_USER=\$(id -un)
        [ -d /run/sshd ] || [ \"\$(uname -s)\" = Darwin ] || sudo -n mkdir -p /run/sshd
        cd ~/git/dotfiles && mise dot apply ~/.config/sshd/sshd_config --force
        if p=\$(sshd_pid); then sshd_stop \$p; sleep 1; fi
        # The task needs no tools; without this, mise first installs every tool in mise.toml.
        detach=\$(command -v setsid || true)
        MISE_TASK_RUN_AUTO_INSTALL=false \$detach nohup mise run sshd -m $minutes > ~/.config/sshd/sshd.log 2>&1 < /dev/null &
        for _ in \$(seq 60); do sshd_pid >/dev/null && break; sleep 1; done
        tail -20 ~/.config/sshd/sshd.log
        sshd_pid >/dev/null || { echo 'sshd did not start within 60s (log above)' >&2; exit 1; }"
      log "ephemeral sshd up for ${minutes}m: ssh -p $VM_SSHD_PORT $(guest_user)@$ip (from $VM_SSHD_ALLOW_FROM)" ;;
    stop)
      guest -- "$SSHD_PID_FN
        if p=\$(sshd_pid); then sshd_stop \$p && echo stopped; else echo 'not running'; fi" ;;
    status)
      guest -- "$SSHD_PID_FN
        if p=\$(sshd_pid); then echo \"running (pid \$p)\"; else echo stopped; fi" ;;
    *) die "usage: mise run vmpal:sshd [start|stop|status] [--minutes N]" ;;
  esac
}

cmd_ip()   { need_running; guest_ip; }
cmd_exec() { need_running; vmpal exec "$VM_NAME" -- "$@"; }

cmd_all() {
  need_pubkey
  cmd_prereqs; cmd_create; cmd_keys
  if [ -n "${VM_PASSWORD:-}" ]; then cmd_password
  else log "keeping the password VMPal made (vmpal info '$VM_NAME' --show-password)"
  fi
  cmd_provision; cmd_snapshot
  cmd_start
}
