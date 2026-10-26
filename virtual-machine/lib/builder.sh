# shellcheck shell=bash
# The dev VMs' container builder, for the builder:* tasks: BuildKit in the host's `builder` Colima profile
# (../../.colima/builder/colima.yaml), where vz and Rosetta run arm64 natively and linux/amd64 through Rosetta. A
# macOS guest has no hardware virtualization, so Colima inside it can only emulate. BuildKit listens with mutual
# TLS on the one host address the VMs reach; tart:builder or vmpal:builder registers it in a guest as a buildx
# builder. Run these on the Mac that hosts the VMs.
# shellcheck source=lib/common.sh
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

: "${VM_BUILDER_ADDRESS:=}"                # host address BuildKit listens on; default: the one the VMs reach
: "${VM_BUILDER_PORT:=1234}"
BUILDER_PROFILE=builder
BUILDER_CONTAINER=vm-buildkitd
BUILDER_IMAGE=moby/buildkit:v0.34.1
BUILDER_DIR="$BUILD/builder"               # certs and the endpoint the guest tasks read
BUILDER_CONFIG="$VM_ROOT/../.colima/builder/colima.yaml"
COLIMA_HOME="${COLIMA_HOME:-$HOME/.colima}"

bdocker() { docker --context "colima-$BUILDER_PROFILE" "$@"; }
builder_running() { colima status "$BUILDER_PROFILE" >/dev/null 2>&1; }

# The host address the VMs reach: the LAN address of the bridged interface for VM_NETWORK=bridged, else vmnet's
# NAT gateway: the first bridge interface with an IPv4 address, which exists only while a NAT VM runs. It is not
# always bridge100: a bridged VM's bridge (no address) can take that name first. Never 0.0.0.0: BuildKit is root
# in its VM.
builder_address() {
  local ip="$VM_BUILDER_ADDRESS" ifc
  if [ -z "$ip" ] && [ "$VM_NETWORK" = bridged ]; then
    ifc="${VM_BRIDGE:-auto}"
    [ "$ifc" != auto ] || ifc="$(route -n get default 2>/dev/null | awk '/interface:/ {print $2}')"
    ip="$(ipconfig getifaddr "$ifc" 2>/dev/null || true)"
    [ -n "$ip" ] || die "no IPv4 address on $ifc for a bridged VM to reach; set VM_BUILDER_ADDRESS"
  elif [ -z "$ip" ]; then
    for ifc in $(ifconfig -l); do
      case "$ifc" in bridge*) ip="$(ifconfig "$ifc" | awk '/inet / {print $2; exit}')" ;; esac
      [ -z "$ip" ] || break
    done
    [ -n "$ip" ] || die "no vmnet gateway (a bridge interface with an address): start the VM first, or set VM_BUILDER_ADDRESS"
  fi
  echo "$ip"
}

# A private CA, a server certificate for <ip> and a client certificate, under build/builder/certs. The CA and
# client stay across runs, so a guest's builder keeps working; the server certificate is reissued when <ip> changes.
builder_certs() {
  local ip="$1" d="$BUILDER_DIR/certs"
  mkdir -p "$d/server" "$d/client" && chmod 700 "$d"
  if [ ! -f "$d/ca.pem" ]; then
    log "creating the builder's certificate authority"
    openssl req -x509 -new -nodes -newkey rsa:4096 -days 3650 -subj /CN=vm-builder-ca \
      -keyout "$d/ca-key.pem" -out "$d/ca.pem" 2>/dev/null
    rm -f "$d/server/ip" "$d/client/cert.pem"
  fi
  # sign <dir> <cn> <extensions>
  sign() {
    printf '%s\n' "$3" > "$1/ext.cnf"
    openssl req -new -nodes -newkey rsa:2048 -subj "/CN=$2" -keyout "$1/key.pem" -out "$1/csr.pem" 2>/dev/null
    openssl x509 -req -days 825 -in "$1/csr.pem" -CA "$d/ca.pem" -CAkey "$d/ca-key.pem" -CAcreateserial \
      -extfile "$1/ext.cnf" -out "$1/cert.pem" 2>/dev/null
    rm -f "$1/csr.pem" "$1/ext.cnf" && cp "$d/ca.pem" "$1/ca.pem" && chmod 600 "$1/key.pem"
  }
  if [ "$(cat "$d/server/ip" 2>/dev/null)" != "$ip" ]; then
    sign "$d/server" vm-buildkitd "subjectAltName=IP:$ip
extendedKeyUsage=serverAuth"
    echo "$ip" > "$d/server/ip"
  fi
  [ -f "$d/client/cert.pem" ] || sign "$d/client" vm-builder-client "extendedKeyUsage=clientAuth"
}

# --- tasks -------------------------------------------------------------------

cmd_start() {
  need_apple_silicon
  /usr/bin/pgrep -q oahd || warn "Rosetta does not look installed (softwareupdate --install-rosetta); amd64 builds will use QEMU"
  [ -f "$BUILDER_CONFIG" ] || die "no Colima profile at $BUILDER_CONFIG"
  local ip; ip="$(builder_address)"
  mkdir -p "$BUILDER_DIR"

  # The profile is restarted when its config changed since the last start, or when it started without <ip>
  # (Colima replicates only the host addresses present at start).
  local sum dest="$COLIMA_HOME/$BUILDER_PROFILE/colima.yaml"
  sum="$(shasum -a 256 "$BUILDER_CONFIG" | awk '{print $1}')"
  if builder_running; then
    if [ "$(cat "$BUILDER_DIR/colima.sha256" 2>/dev/null)" != "$sum" ]; then
      log "the builder profile changed: restarting it"; colima stop "$BUILDER_PROFILE"
    elif ! colima ssh -p "$BUILDER_PROFILE" -- ip -4 -o addr show dev lo | grep -q " $ip/"; then
      log "the builder profile started without $ip: restarting it"; colima stop "$BUILDER_PROFILE"
    fi
  fi
  if ! builder_running; then
    mkdir -p "$(dirname "$dest")" && cp "$BUILDER_CONFIG" "$dest"
    log "starting Colima profile '$BUILDER_PROFILE'"
    colima start "$BUILDER_PROFILE"
    echo "$sum" > "$BUILDER_DIR/colima.sha256"
  fi

  builder_certs "$ip"
  # The certificates are copied into the container: the VM mounts nothing from the host.
  # amd64 through Rosetta, not QEMU: BuildKit's platform check runs its probe in a chroot without /proc, where
  # Rosetta fails, so it would run amd64 steps under the image's own buildkit-qemu-x86_64. That emulator is
  # removed in the container, which leaves amd64 to the VM's Rosetta binfmt, and amd64 is declared by hand.
  log "starting BuildKit ($BUILDER_IMAGE) on $ip:$VM_BUILDER_PORT, mutual TLS"
  bdocker rm -f "$BUILDER_CONTAINER" >/dev/null 2>&1 || true
  bdocker create --name "$BUILDER_CONTAINER" --restart unless-stopped --privileged \
    -p "$ip:$VM_BUILDER_PORT:1234" -v vm-buildkit-state:/var/lib/buildkit \
    --entrypoint /bin/sh "$BUILDER_IMAGE" \
    -c 'rm -f /usr/bin/buildkit-qemu-x86_64 && exec /usr/bin/buildkitd-entrypoint "$@"' buildkitd \
    --oci-worker-platform linux/arm64 --oci-worker-platform linux/amd64 \
    --addr tcp://0.0.0.0:1234 --addr unix:///run/buildkit/buildkitd.sock \
    --tlscacert /etc/buildkit-certs/ca.pem --tlscert /etc/buildkit-certs/cert.pem --tlskey /etc/buildkit-certs/key.pem \
    >/dev/null
  bdocker cp "$BUILDER_DIR/certs/server" "$BUILDER_CONTAINER:/etc/buildkit-certs"
  bdocker start "$BUILDER_CONTAINER" >/dev/null
  echo "$ip:$VM_BUILDER_PORT" > "$BUILDER_DIR/endpoint"

  local waited=0
  until bdocker exec "$BUILDER_CONTAINER" buildctl debug workers >/dev/null 2>&1; do
    [ "$waited" -ge 30 ] && { bdocker logs --tail 20 "$BUILDER_CONTAINER" >&2; die "BuildKit did not start"; }
    sleep 1; waited=$((waited + 1))
  done
  bdocker exec "$BUILDER_CONTAINER" buildctl debug workers -v | grep -i '^platforms' || true
  nc -z -G 5 "$ip" "$VM_BUILDER_PORT" || die "nothing answers on $ip:$VM_BUILDER_PORT from this Mac"
  log "BuildKit is up at tcp://$ip:$VM_BUILDER_PORT. Register it in a VM: mise run tart:builder (or vmpal:builder)"
}

cmd_stop() {
  builder_running || { log "Colima profile '$BUILDER_PROFILE' is not running"; return; }
  colima stop "$BUILDER_PROFILE"
}

cmd_status() {
  colima status "$BUILDER_PROFILE" || return 0
  bdocker ps --filter "name=^$BUILDER_CONTAINER\$" --format '{{.Names}}: {{.Status}} {{.Ports}}'
  bdocker exec "$BUILDER_CONTAINER" buildctl debug workers -v 2>/dev/null | grep -i '^platforms' || true
}
