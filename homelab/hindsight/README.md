# Hindsight memory on Hogwarts

This deploys Hindsight on a single-node k3s cluster on `hogwarts`, with OpenAI Codex for memory processing and the host's existing Tailscale daemon for private HTTPS. OMP uses its native Hindsight backend. There is no MCP server to configure.

| Component | Configuration |
| --- | --- |
| Hindsight | Official Helm chart and images `1.2.0`, one API with its internal worker |
| Memory LLM | OpenAI Codex `gpt-6.1-terra`, `high` reasoning, four concurrent requests |
| Embeddings / reranking | Local models bundled in the full API image, with `HF_HUB_OFFLINE=1` |
| Database | PostgreSQL 17 with pgvector 0.8.2, image pinned by digest, 20 GiB local-path PVC |
| API | <https://hogwarts.tail58b1f6.ts.net:8443>, bearer token required |
| UI | <https://hogwarts.tail58b1f6.ts.net:8444>, separate login key |

```text
OMP on a Tailscale device
  -> HTTPS hogwarts.tail58b1f6.ts.net:8443
  -> Tailscale Serve -> 127.0.0.1:30888 -> Hindsight API
                                             |-> PostgreSQL + pgvector + PVC
                                             |-> local embeddings and reranker
                                             `-> OpenAI Codex (memory LLM)

Browser -> HTTPS :8444 -> Tailscale Serve -> 127.0.0.1:30999 -> Hindsight UI
```

## Install

First bootstrap the [shared k3s cluster](../k3s/README.md) using `./homelab/k3s/setup.sh`. Then create a dedicated Codex login on Hogwarts as `ahstn`:

```sh
mkdir -p -m 700 "$HOME/.config/hindsight/codex"
CODEX_HOME="$HOME/.config/hindsight/codex" codex -c 'cli_auth_credentials_store="file"' login --device-auth
```

Approve the device code in your browser. Do not copy `~/.codex/auth.json`: refresh tokens rotate, so sharing a login with another runtime can break authentication. The API mounts only this dedicated writable directory at `/var/lib/hindsight/codex`, with UID 1000 matching the host user and container user. The directory stays outside Git; it must exist before deployment. This host-path mount is specific to Hogwarts.

Run application setup from a normal terminal as `ahstn`. The script needs `sudo` and prompts for its password. Do not run the whole script as root.

```sh
cd ~/git/dotfiles
./homelab/hindsight/setup.sh
```

Requirements: the shared k3s cluster running, Python 3.9+, iproute2, Tailscale logged in with Serve/operator access, Helm 3.8+ or 4, OMP, and the Codex CLI. Hogwarts already has Tailscale HTTPS enabled. Installing this does not change host Tailscale preferences or the existing Serve services on 443 and 9119.

The script checks the dedicated Codex login, Tailscale port conflicts and cluster readiness, including DNS and local-path storage. It then creates credentials, deploys PostgreSQL and Hindsight, and adds the Serve handlers. It does not install, restart or reconfigure k3s. It verifies HTTPS, rejects anonymous API/UI access, checks that NodePorts cannot be reached through the host's non-loopback addresses, rebuilds the dotfiles mental models, and runs a small retain/recall test using Codex. The test uses synthetic text in a unique temporary bank and deletes that bank afterward. Both summary refreshes and the test consume ChatGPT subscription quota. OMP memory is enabled only after those checks pass.

Retention, consolidation, reflection, and mental-model refresh all inherit `HINDSIGHT_API_LLM_PROVIDER=openai-codex`, `HINDSIGHT_API_LLM_MODEL=gpt-6.1-terra`, and `HINDSIGHT_API_LLM_REASONING_EFFORT=high`. There are no per-operation model overrides. OMP's `modelRoles.memory` does not control these server-side calls.

The first full image pull is large, approximately 9 GB on x86_64. Allow up to
30 minutes for deployment and keep disk space available for image unpacking.
The requested pod memory totals about 2.75 GiB; limits total 7 GiB. k3s uses
additional host memory. A PVC's requested size does not impose a filesystem
quota with the local-path provisioner.

Subsequent deployments preserve existing Hindsight credentials, especially the
PostgreSQL password. The namespace, database and application Helm release are
managed independently of the shared cluster. Cluster configuration and lifecycle
belong to [`../k3s/`](../k3s/README.md).

### If setup waits or fails

Setup prints its current stage. Cluster checks and the PostgreSQL rollout each have a five-minute timeout; the Helm deployment allows 30 minutes. A Ready node alone is not enough: DNS and the local-path provisioner must also be available.

```sh
sudo k3s kubectl -n kube-system get pods
sudo k3s kubectl -n hindsight get pods,pvc
sudo k3s kubectl get events -A --sort-by=.lastTimestamp
```

A Pending PostgreSQL PVC with `ExternalProvisioning` events points to the storage provisioner. On Hogwarts, Docker Hub timeouts prevented the pause image from loading, which blocked the provisioner. The [shared cluster setup](../k3s/README.md#registry-access-and-recovery) configures a registry mirror. Fix cluster image pulls first, then rerun application setup. Preserve the existing PVC and credentials.

For user-level `kubectl`, use the private admin kubeconfig described in the [cluster guide](../k3s/README.md#user-kubectl-access). `homelab/k3s/config.yaml` is not a kubeconfig.

If the API exits with `Model/connection initialization did not complete within 300s`, inspect its previous container logs:

```sh
sudo k3s kubectl -n hindsight logs deployment/hindsight-api --previous --tail=100
```

The full `1.2.0` API image includes the embedding and reranker models. `HF_HUB_OFFLINE=1` keeps startup on those bundled snapshots. Without it, the reranker can refresh its Hub snapshot and stall on repository asset downloads even though the model weights are already present. A longer Helm timeout does not change the app's model-init timeout. If you choose a different local model, provide its cached files in the image or review the offline setting before deployment.

Helm can report an old progress deadline just after applying a recovery update. Check current availability before rerunning setup; do not delete the release or database to clear that error:

```sh
sudo k3s kubectl -n hindsight wait --for=condition=Available \
  deployment/hindsight-api --timeout=300s
```

## OMP configuration

After the service passes verification, setup uses `omp config set` to apply:

```yaml
memory:
  backend: hindsight
hindsight:
  apiUrl: https://hogwarts.tail58b1f6.ts.net:8443
  bankIdPrefix: ahstn
  scoping: per-project
  autoRecall: true
  autoRetain: true
```

The bearer token stays in `~/.config/hindsight/omp.env`, mode `0600`, outside
the repository. The zsh configuration loads this file when it exists. To use
it immediately in the shell that ran setup:

```sh
source ~/.config/hindsight/omp.env
omp config get memory.backend
omp config get hindsight.apiUrl
omp
```

Inside OMP, use `/memory diagnose`, `/memory stats`, and `/memory mm list`.
Ask it to remember a project convention, start a new session in that project,
then ask it to recall the convention. `/memory enqueue` forces session
retention. `/memory clear` clears OMP's local recall state; it does not erase
the remote bank. Review and delete server memories through the Hindsight UI.

`per-project` keeps separate banks for repositories, and linked worktrees
share the primary checkout's project name. Projects with the same repository
name can therefore share a bank across machines. The `ahstn` prefix
separates these banks from a different client profile. Bank naming and scoping
are retrieval boundaries; the shared API token grants access to every bank in
this deployment. Use a separate instance or tenant credentials for an actual
work/personal security boundary. This setup does not read or change the
protected work model copies.

Automatic retention sends user/assistant conversation text to Hogwarts, then to OpenAI through Codex for extraction and synthesis. OMP excludes tool results and thinking blocks from that transcript. To use prompt-driven retention, set `hindsight.autoRetain` to `false`. A project can disable memory with `memory.backend: off` in its `.omp/config.yml`.

### Optional config-only improvements

These settings are supported by OMP 18.18.0. They are recommendations, not settings applied by this deployment:

```yaml
hindsight:
  recallTypes: [world, experience, observation]
  mentalModelAutoSeed: false
  mentalModelsEnabled: true
```

Including `observation` makes consolidated memories eligible for direct recall. Keep the existing recall token budget initially; raw facts and observations can duplicate one another. Disabling auto-seeding prevents OMP from creating its generic summaries in new banks. It does not delete existing models or stop loading the summaries managed below. Other projects will need their own managed summaries if auto-seeding is disabled globally.

An optional `hindsight.bankMission` can guide reflection towards source-supported decisions and make uncertainty explicit. It replaces the bank's reflect mission when OMP next ensures the bank exists. Leave `hindsight.retainMission` unset unless intentionally replacing the server's extraction mission.

For more control over capture, `hindsight.autoRetain: false` disables automatic transcript writes while keeping explicit native retain calls available. `hindsight.mentalModelsEnabled: false` disables automatic summary injection, not server-side summaries or reflection. Neither prompt guidance nor a smaller context limit fixes active-branch capture, transcript redaction, delivery durability, or asynchronous completion tracking. Those need OMP code changes. `hindsight.mentalModelRefreshIntervalMs` is not a supported setting in this version.

### Managed dotfiles mental models

[`mental-models.json`](mental-models.json) owns the prompts and refresh controls for `user-preferences`, `project-conventions`, and `project-decisions` in `ahstn-omp-dotfiles`. Setup applies this policy after the API becomes available. Other banks and models are not changed, and source memories are not deleted.

The summaries use retrieved facts, observations, and source chunks, not sibling mental models. Prompts keep each summary on topic and distinguish missing evidence from evidence of absence. Source text storage and mental-model history are explicit in `values.yaml`; Hindsight keeps up to 50 previous summary versions.

Each deployment requests a one-time full rebuild and waits for each background operation to complete, with a five-minute limit per model. A failed, cancelled, missing, or timed-out operation fails the command. Automatic refreshes still use delta mode after consolidation. There is no added nightly job or refresh delay. Completion does not prove every generated claim is correct; inspect important claims against their sources.

To apply only the summary policy without redeploying:

```sh
source ~/.config/hindsight/omp.env
python3 ~/git/dotfiles/homelab/hindsight/manage.py memory-models
```

An existing OMP session keeps its cached summary snapshot. Run `/memory mm reload` or start a new session after the refresh completes.

### Add another Tailscale client

Use the same dotfiles shell hook and OMP version with Hindsight support. Obtain
the API token from the server's private `omp.env` through your existing secret
manager or a private SSH session. Keep it out of chat, Git, and shell history.
Then enroll the client using a hidden prompt:

```sh
# bash: use `read -rs -p 'Hindsight API token: ' HINDSIGHT_API_TOKEN` instead.
read -rs 'HINDSIGHT_API_TOKEN?Hindsight API token: '
export HINDSIGHT_API_TOKEN
python3 ~/git/dotfiles/homelab/hindsight/manage.py client https://hogwarts.tail58b1f6.ts.net:8443
unset HINDSIGHT_API_TOKEN
source ~/.config/hindsight/omp.env
```

Client enrollment needs no Kubernetes access when `HINDSIGHT_API_TOKEN` is set.
Tailscale ACLs/grants must allow that device to reach Hogwarts on TCP 8443
(and 8444 if it needs the UI). Existing tailnet policy is not changed here.

## Operations

```sh
# API/UI authentication and network isolation
python3 homelab/hindsight/manage.py check

# Extraction, embeddings, storage and recall; consumes Codex subscription quota
python3 homelab/hindsight/manage.py smoke

# Show the UI login key in your terminal
python3 homelab/hindsight/manage.py ui-key

# Cluster state and logs
sudo k3s kubectl -n hindsight get pods,pvc,services
sudo k3s kubectl -n hindsight logs deployment/hindsight-api --tail=100
sudo k3s kubectl -n hindsight logs hindsight-postgresql-0 --tail=100

# Private database backup; choose an existing directory outside this repository
python3 homelab/hindsight/manage.py backup "$HOME/hindsight-$(date +%F).dump"
```

The [shared cluster configuration](../k3s/README.md) restricts application
NodePorts to IPv4 loopback. Hindsight uses that policy for its two Tailscale
Serve backends. Neither the database nor application ingress is published to
the LAN. Tailnet traffic terminates TLS in Tailscale Serve and reaches the
local backends over HTTP. No Funnel configuration is created.

The chart's bundled PostgreSQL interpolates its password directly into Helm
values and pod environment fields. `postgresql.yaml` instead owns the database
and reads its password through `secretKeyRef`. The official Hindsight chart
uses `existingSecret`; no key or password is passed through Helm values or
command arguments. The chart injects that shared secret into its API and UI
pods, so both should be treated as trusted components.

The PVC survives StatefulSet deletion and Helm uninstall. It is still one
disk on one machine; deleting the namespace/PVC or losing Hogwarts loses
memory without backups. Copy database dumps to separate storage. A PostgreSQL
dump restores memories, but also preserve the Kubernetes secret and k3s
datastore/token/encryption material separately if you need to recover the
whole installation. No recurring backup is scheduled by this setup.

To change the memory model or reasoning level, edit `api.env.HINDSIGHT_API_LLM_MODEL` or `api.env.HINDSIGHT_API_LLM_REASONING_EFFORT` in `values.yaml`, then rerun setup. Use the unprefixed model ID: the provider is configured separately.

Hindsight refreshes its dedicated OAuth tokens in place. Keep the auth directory writable; a read-only Secret or single-file mount cannot support token replacement. If the login expires or is revoked, repeat the dedicated sign-in above, then restart `deployment/hindsight-api`. A healthy API does not prove LLM authentication works; verify retention and reflection too.

Existing Kubernetes credentials, especially `postgres-password`, remain unchanged. A legacy OpenRouter key in an existing Secret is unused by the Codex provider. New installations do not need an OpenRouter key.

To disable client memory, run `omp config set memory.backend off`. To remove
only the two Hindsight Serve listeners:

```sh
tailscale serve --https=8443 off
tailscale serve --https=8444 off
```

Do not use `tailscale serve reset`, which would remove unrelated host services.
There is deliberately no automated namespace/PVC deletion command.

## Sources and verification

Research checked on 6–7 November 2026:

- [Hindsight installation](https://hindsight.vectorize.io/developer/installation)
  and [published chart values](https://github.com/vectorize-io/hindsight/blob/main/helm/hindsight/values.yaml).
  Published chart `1.2.0` was pulled with digest
  `sha256:9c6081902317a1f9ac86f79c56319373bc1e358caa67b5e7df37e119317660aa`.
- [Server configuration](https://hindsight.vectorize.io/developer/configuration)
  documents API authentication and the UI's API bearer/access keys.
- [Codex provider and isolated service login](https://hindsight.vectorize.io/developer/models#isolating-codex-auth-for-long-running-services) documents OAuth credentials, token rotation, and the dedicated auth home.
- [OMP memory](https://omp.sh/docs/memory) and
  [environment overrides](https://omp.sh/docs/env) define the client settings.
  The [integration article](https://hindsight.vectorize.io/blog/2026/06/08/oh-my-pi-hindsight-memory)
  explains retention, bank scoping, and mental models. Current OMP docs take
  precedence over older examples in the article.
- [k3s quick start](https://docs.k3s.io/quick-start),
  [server options](https://docs.k3s.io/cli/server), and
  [kube-proxy flags](https://kubernetes.io/docs/reference/command-line-tools-reference/kube-proxy/)
  cover cluster installation and localhost NodePorts.
- [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve)
  provides tailnet-only HTTPS and obeys the existing tailnet access policy.

Validation before installation covers chart lint/rendering, Kubernetes resource
schemas, shell/Python syntax, OMP's settings keys in an isolated temporary agent
directory, and Codex login/Tailscale preflight. The runtime checks above
still need an installed, running cluster; static validation does not establish
that deployment or memory processing succeeded.

Live verification on 7 November 2026 passed after the registry and offline-model fixes: PostgreSQL storage was Bound, all three Hindsight pods were Ready, Helm reported `deployed`, HTTPS API/UI authentication and NodePort isolation passed, and a temporary bank retained and recalled its verification code. The check deleted that bank afterward.

The Codex cutover later that day deployed Helm revision 4. Runtime inspection confirmed `gpt-6.1-terra` with `high` reasoning for all four LLM operations, and the startup connection probe verified the Codex model. Native OMP retain, recall, and reflect calls stored and returned the deployment change. All three pods were Ready and PostgreSQL storage remained Bound. The eight deployment regression tests and shell syntax check passed.

The memory-policy update deployed Helm revision 5 later on 7 November. All three managed models completed full refreshes, with zero sibling mental models in their reported provenance. The inspected summaries correctly used Oh My Pi and treated missing convention records as unknown, rather than claiming that the repository had no conventions. Native OMP reflection returned the same distinction. API readiness and anonymous API/UI rejection passed; all three pods were Ready and the existing PVC remained Bound. Eleven management regression tests and the shell syntax check passed. Proposed OMP settings were exercised in a temporary agent directory without changing the active client configuration.

The personal bank prefix was later shortened from `ahstn-personal` to `ahstn`. The original `dotfiles` and `fable-hft` banks were moved with the installed `hindsight-admin rename-bank` command, not replaced by clones. Record IDs, source documents, retrieval graph, summary settings, and history were preserved. Private database backups were taken outside Git, and the enrollment defaults and managed-model target were updated. Other clients must use the new prefix before reconnecting, or they can recreate empty banks under the old prefix.

For a future prefix change, stop clients, drain active operations, take a private backup, and use the administrative rename with an unused target bank ID. Restart the API afterward to clear cached bank routing, then verify native OMP access. Merely changing `hindsight.bankIdPrefix` does not move existing banks. The Hindsight 1.2.0 clone API is not a lossless substitute: it omits observation history and rebuilds the entity/link graph.
