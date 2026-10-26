#!/bin/bash
# Removes the two roots behind the compromised eMudhra intermediate CAs (October 2026) from /etc/ssl/cert.pem.
# macOS's own curl, git, python3, ruby, perl and openssl verify against that file without Apple's block or
# revocation checks, so they still accept certificates from those intermediates
# (https://support.apple.com/en-us/149555):
# - emSign ECC Root CA - G3: the six intermediates eMudhra issued.
# - AAA Certificate Services: Sectigo's cross-signs of the same six. Sites that chain only to it fail in those
#   tools too; Homebrew's ca-certificates leaves it out as well.
# A macOS update can restore the file, so `install` also adds a root launchd daemon that runs `apply` at boot and
# whenever the file changes. Once a macOS update ships Apple's fix, `apply` finds nothing and changes nothing.
#
# Usage, as root: distrust-emudhra-roots.sh [apply|install]
#   apply    remove the roots if present (the default); the Apple version is kept as /etc/ssl/cert.pem.orig
#   install  apply, then install this script and the daemon
# CERT_PEM overrides the file, for tests.
set -euo pipefail

PEM="${CERT_PEM:-/etc/ssl/cert.pem}"
LABEL=local.vm.distrust-emudhra-roots
BIN=/usr/local/libexec/distrust-emudhra-roots
PLIST="/Library/LaunchDaemons/$LABEL.plist"
OPENSSL=/usr/bin/openssl
# The header lines Apple's file has above each root, as Apple's own commands match them.
EMSIGN='=== /C=IN/OU=emSign PKI/O=eMudhra Technologies Limited/CN=emSign ECC Root CA - G3'
AAA='=== /C=GB/ST=Greater Manchester/L=Salford/O=Comodo CA Limited/CN=AAA Certificate Services'
# Their SHA-256 fingerprints, which decide whether a file is clean whatever its headers say.
BLOCKED="86A1ECBA089C4A8D3BBE2734C612BA341D813E043CF9E8A862CD5C57A36BBE6B D7A7A0FB5D7E2731D771E9484EBCDEF71D5F0C3E0A2948782BC83EE0EA699EF4"

die() { echo "distrust-emudhra-roots: $*" >&2; exit 1; }

# blocked_in <pem>: the fingerprint of each blocked root in <pem>, one per line.
blocked_in() {
  local dir f fp
  dir="$(mktemp -d)"
  awk -v d="$dir" '/-----BEGIN CERTIFICATE-----/ { f = sprintf("%s/%05d.pem", d, ++n) }
    f { print > f } /-----END CERTIFICATE-----/ { close(f); f = "" }' "$1"
  for f in "$dir"/*.pem; do
    [ -e "$f" ] || continue
    fp="$("$OPENSSL" x509 -in "$f" -noout -fingerprint -sha256 2>/dev/null)" || continue
    fp="${fp#*=}" fp="${fp//:/}"
    case " $BLOCKED " in *" $fp "*) echo "$fp" ;; esac
  done
  rm -rf "$dir"
}

count() { grep -c -- '-----BEGIN CERTIFICATE-----' "$1" || true; }

apply() {
  local found removed tmp
  found="$(blocked_in "$PEM")"
  [ -n "$found" ] || return 0
  removed="$(printf '%s\n' "$found" | wc -l | tr -d ' ')"
  # Built beside the file, so the rename below replaces it in one step.
  tmp="$(mktemp "$PEM.XXXXXX")"
  trap 'rm -f "$tmp"' EXIT
  awk -v a="$EMSIGN" -v b="$AAA" '/^(===|###) / { skip = 0 } $0 == a || $0 == b { skip = 1 } !skip' "$PEM" > "$tmp"
  [ -z "$(blocked_in "$tmp")" ] || die "a blocked root has no header this script knows; $PEM is unchanged"
  [ "$(count "$tmp")" -eq "$(( $(count "$PEM") - removed ))" ] || die "the filtered copy lost other certificates; $PEM is unchanged"
  # The file still holds a blocked root, so it is Apple's version: keep it as the backup.
  cp -p "$PEM" "$PEM.orig"
  chmod 644 "$tmp" && chown "$(stat -f %u:%g "$PEM")" "$tmp" && mv -f "$tmp" "$PEM"
  trap - EXIT
  echo "distrust-emudhra-roots: removed $removed root(s) from $PEM (Apple's version: $PEM.orig)"
}

install_daemon() {
  local tmp
  mkdir -p "$(dirname "$BIN")"
  install -m 755 -o root -g wheel "${BASH_SOURCE[0]}" "$BIN"
  tmp="$(mktemp)"
  cat > "$tmp" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$BIN</string><string>apply</string></array>
  <key>RunAtLoad</key><true/>
  <key>WatchPaths</key><array><string>$PEM</string></array>
  <key>StandardOutPath</key><string>/var/log/distrust-emudhra-roots.log</string>
  <key>StandardErrorPath</key><string>/var/log/distrust-emudhra-roots.log</string>
</dict>
</plist>
EOF
  if ! cmp -s "$tmp" "$PLIST"; then
    install -m 644 -o root -g wheel "$tmp" "$PLIST"
    # bootout returns before the daemon is gone.
    if launchctl bootout "system/$LABEL" 2>/dev/null; then
      for _ in $(seq 20); do launchctl print "system/$LABEL" >/dev/null 2>&1 || break; sleep 0.5; done
    fi
  fi
  rm -f "$tmp"
  launchctl print "system/$LABEL" >/dev/null 2>&1 || launchctl bootstrap system "$PLIST"
}

case "${1:-apply}" in
  apply) apply ;;
  # apply first, so the daemon's first run finds the file already clean.
  install) apply && install_daemon ;;
  *) die "usage: $0 [apply|install]" ;;
esac
