# Homelab

Shared infrastructure and application deployments for Hogwarts live here.
Bootstrap the cluster once, then deploy or update each application separately.

```text
homelab/
  k3s/         Shared cluster configuration and installer
  hindsight/   Memory service, database, Tailscale endpoints and OMP enrollment
```

From the repository root, run as your ordinary user:

```sh
./homelab/k3s/setup.sh
./homelab/hindsight/setup.sh
```

The [k3s installer](k3s/README.md) owns the host service and cluster configuration.
It needs no application credentials, OMP installation, or Tailscale setup.
Application setup scripts use the running cluster without installing,
restarting, or reconfiguring it. The [Hindsight deployment](hindsight/README.md)
owns its namespace, PostgreSQL volume, credentials and client configuration.

The shared cluster uses encrypted Kubernetes secrets and local-path storage.
Application NodePorts are restricted to IPv4 loopback, with Traefik and
ServiceLB disabled. Applications can publish private HTTPS through the host's
existing Tailscale Serve configuration. Assign distinct ports for each service:

| Application | Tailscale HTTPS port | Loopback NodePort |
| --- | --- | --- |
| Hindsight API | 8443 | 30888 |
| Hindsight UI | 8444 | 30999 |

Keep future applications in their own directories and namespaces. Application
updates should operate on their own resources and leave shared cluster
configuration and other applications' Tailscale listeners alone.
