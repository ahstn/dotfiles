# shellcheck shell=bash
# VMPal hooks for the shared ../../guest/macos.sh, which sources this file in the guest. vmpal:sudo gives the
# account passwordless sudo first; the shared script installs Homebrew, which a fresh VMPal install lacks.

engine_prepare() { :; }

# vmpal:provision passes VM_TAILSCALE_AUTHKEY with `vmpal exec --env`. Write it to a private file without tracing,
# since the shared script runs under set -x.
engine_tailscale_authkey_file() {
  { set +x; } 2>/dev/null
  if [ -n "${VM_TAILSCALE_AUTHKEY:-}" ]; then
    local f
    f="$(mktemp)" && printf '%s' "$VM_TAILSCALE_AUTHKEY" > "$f" && echo "$f"
  fi
}
