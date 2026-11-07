# Shared k3s cluster

This directory owns the single-node k3s installation on Hogwarts. Application
deployments are separate siblings under `homelab/`.

```sh
# From the dotfiles repository root, as your ordinary user:
./homelab/k3s/setup.sh
```

The installer needs Linux with systemd, sudo, curl and iproute2. It prompts for sudo authentication, installs k3s `v1.37.2+k3s1`, and waits for the node, cluster DNS and local-path storage. It installs no applications and requires no application API keys.

`config.yaml` is installed as `/etc/rancher/k3s/config.yaml`, mode `0600`:

- Kubernetes secrets are encrypted at rest.
- The administrator kubeconfig is root-only at `/etc/rancher/k3s/k3s.yaml`.
- Traefik and ServiceLB are disabled; applications own their ingress setup.
- All NodePorts are restricted to IPv4 loopback with iptables-mode kube-proxy.
- Flannel uses `host-gw` for this single-node cluster, avoiding a VXLAN listener.
- Host swap remains enabled; pods use the default NoSwap policy.

The Kubernetes API uses its standard host port, 6443. Its normal bind address
allows pods to reach the in-cluster Kubernetes service. Cluster administration
uses `sudo k3s kubectl`; Tailscale Serve does not publish the Kubernetes API.

```sh
sudo systemctl status k3s
sudo k3s kubectl get nodes
sudo k3s kubectl get pods --all-namespaces
sudo k3s secrets-encrypt status
```

### User kubectl access

`config.yaml` is server configuration, not a kubeconfig. Do not set `KUBECONFIG` to it. For ordinary-user administration, create a private copy of the generated admin kubeconfig:

```sh
mkdir -p ~/.kube
sudo install -m 0600 -o "$USER" -g "$(id -gn)" \
  /etc/rancher/k3s/k3s.yaml ~/.kube/k3s-admin.yaml
```

The parent `homelab/mise.toml` selects this file. It also sets `K3S_CONFIG_FILE=/dev/null` so the k3s-backed `kubectl` client does not try to read the root-only server config. This does not change the systemd service configuration. Reload the shell environment after setup, or run:

```sh
mise exec -- kubectl get nodes
mise exec -- kubectl -n hindsight get pods,pvc
```

This copy grants cluster-admin access. Keep it outside Git, do not paste it into chat, and refresh it from the generated file when its client certificate expires. Users who want root-only administration can keep using `sudo k3s kubectl` without creating a copy.

### Registry access and recovery

`registries.yaml` configures Google's public Docker Hub cache at `https://mirror.gcr.io`. Setup installs it at `/etc/rancher/k3s/registries.yaml`, mode `0600`. This avoids direct Docker Hub connection timeouts seen on Hogwarts. Upstream fallback remains enabled for cache misses; images not in the cache still need working Docker Hub access. Other registries, including GHCR, are unchanged.

Rerunning setup reuses an existing installation with matching configuration and starts the service if needed. Adding the registry file to an existing installation restarts k3s once so containerd loads the mirror. Setup refuses different existing server or registry configuration and does not automatically upgrade k3s. Review cluster configuration changes separately from application deployment: they affect every application hosted here.

Node readiness alone does not prove that system pods can pull images. If application storage stays Pending, inspect the provisioner and pod events before changing a PVC:

```sh
sudo k3s kubectl -n kube-system get pods
sudo k3s kubectl -n hindsight describe pvc data-hindsight-postgresql-0
sudo k3s kubectl get events -A --sort-by=.lastTimestamp
journalctl -u k3s -n 60 --no-pager
```

`FailedCreatePodSandBox` with a pause-image pull timeout blocks every affected pod, including cluster DNS and storage. The setup readiness checks use current deployment availability, not an old rollout progress deadline. Do not delete application PVCs or credentials to fix a registry connection failure.

The cluster includes the local-path storage provisioner. Its volumes reside on
this machine, and requested PVC sizes do not impose filesystem quotas. Preserve
the k3s datastore, server token and encryption material when backing up the
cluster, together with each application's own database backups. Expanding beyond
one node needs a separate review of networking, storage and availability.

References: [k3s quick start](https://docs.k3s.io/quick-start),
[server options](https://docs.k3s.io/cli/server), and
[kube-proxy flags](https://kubernetes.io/docs/reference/command-line-tools-reference/kube-proxy/).
Registry behaviour follows [k3s registry configuration](https://docs.k3s.io/installation/private-registry).
