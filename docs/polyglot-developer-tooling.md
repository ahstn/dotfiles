# Polyglot developer tooling

A short list of repo checks worth adding to most projects, whatever the language mix. They all ship as single binaries, install through mise's aqua backend, and run the same way locally, in pre-commit hooks and in CI. They sit alongside actionlint, gitleaks and pinact rather than replacing them.

Oceans LLM PR [oceans-llm - PR #567 | GitHub](https://github.com/ahstn/oceans-llm/pull/567)

## Any repo

| Tool | What it checks | Notes |
|---|---|---|
| [typos](https://github.com/crate-ci/typos) | Spelling in code, docs and config | Flags known misspellings only, so false positives are rare. Expect a short allowlist for deliberate test typos and domain words. |
| [lychee](https://github.com/lycheeverse/lychee) | Markdown links and heading anchors | Run `--offline` in CI: it's fast and deterministic. Check external links on a schedule, because vendor docs move anchors and rate-limit. |
| [tombi](https://tombi-toml.github.io/tombi/) | TOML formatting and schema validation | Put a `#:schema` directive on line 1 of every TOML file so editors and CI validate the same thing. Turn off schema-driven key and array reordering unless you want the churn. |
| [zizmor](https://docs.zizmor.sh) | GitHub Actions security: template injection, broad permissions, `pull_request_target` misuse, Dependabot cooldowns | Catches what actionlint and pinact don't. A read-only `GITHUB_TOKEN` enables its online audits. |

## Dependencies

| Tool | What it checks | Notes |
|---|---|---|
| [osv-scanner](https://google.github.io/osv-scanner/) | Known vulnerabilities in every lockfile (Cargo, npm, text `bun.lock`, and more) | Use Google's reusable PR workflow, which compares base and head and fails only on new advisories. Ignores can carry a reason and an expiry date. |
| [cargo-deny](https://embarkstudios.github.io/cargo-deny/) | RustSec advisories, unmaintained and yanked crates, licences, and registry and git sources | Rust only, but it covers licence and source policy that osv-scanner doesn't. |

## When the stack calls for it

| Tool | What it checks | Notes |
|---|---|---|
| [squawk](https://squawkhq.com) | Postgres migrations that take long locks or break clients | Lint only migrations a change adds or edits, since existing ones can't be fixed. Tell it whether your runner wraps migrations in transactions. |
| [kubeconform](https://github.com/yannh/kubeconform) | Rendered Kubernetes manifests against their schemas | Render every example values file, not just the defaults. CRDs need a schema source such as [datreeio/CRDs-catalog](https://github.com/datreeio/CRDs-catalog). |

## Things I tripped over

- **Gate on new findings, not the backlog.** The first run of a scanner usually finds a pile of existing issues. Baseline them with reasons (`deny.toml` ignores, osv-scanner's base/head diff, squawk on changed files only) so CI can go green now and catch anything new.
- **Check the lockfile actually pins the binary.** If a tool publishes no checksum file, mise can lock just the URL for platforms you didn't install on. taplo's Linux entries came out like that. Add the sha256 yourself.
- **Check which TOML version a schema asks for.** SchemaStore's Cargo schema declares TOML 1.1, so tombi rewrites long dependency tables as multi-line inline tables. Tools that only read TOML 1.0, possibly including Dependabot, can choke on those. Pin `toml-version = "v1.0.0"` for that schema in `tombi.toml` until your tooling catches up.
- **Not every config has a schema.** cargo-deny, cargo-dist, rust-analyzer and squawk don't publish one. A first-line comment linking the config reference keeps those files self-documenting.
- **zizmor only warns on files it can't parse.** Pass `--strict-collection` so an unreadable workflow fails the audit instead of disappearing from it.
- **Ignore generated workflows narrowly.** For files you can't edit, such as cargo-dist's `release.yml`, ignore by `file:line:column` so a regenerated workflow gets audited again.
- **osv-scanner's recursive scan finds nothing in a linked git worktree.** List lockfiles with `git ls-files` and pass each one with `--lockfile`.
- **`color.ui = always` breaks gitleaks.** It parses `git log -p`, and coloured output makes it scan zero commits without complaining. Set `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=color.ui GIT_CONFIG_VALUE_0=never` in the task.
- **Scan git content for secrets, not the working tree.** `gitleaks dir` also reads gitignored files such as `mise.local.toml`, which hold real local credentials by design. Scan commits since the base and staged changes instead.
- **Pipes hide failures.** mise's task shell has no `pipefail`, so `helm template | kubeconform` passes when the render fails. Write the render to a file first.
- **Pin kubeconform's Kubernetes version.** Without `-kubernetes-version` it validates against `master`. Match `helm template --kube-version` to it, and pin the CRD catalogue to a commit.
- **Run pre-commit hooks on staged files.** Full-repo scans belong in CI.

## Considered and left out

| Option | Why not |
|---|---|
| [taplo](https://taplo.tamasfe.dev) | Its last release (May 2025) predates TOML 1.1, `taplo lint` validates nothing unless you map each file to a schema, and its default schema catalogue no longer parses. |
| [Trivy](https://trivy.dev) | The broadest single tool (lockfiles, images, Dockerfiles, Helm), but it was compromised in March 2026 ([GHSA-69fq-xp46-6x23](https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23)). If you need image or IaC scanning, pin the binary through aqua and skip `trivy-action`. |
| [Grype](https://github.com/anchore/grype) and Syft | Strongest for container images, but ignores can't expire. osv-scanner covers lockfiles better. |
| [Snyk](https://snyk.io) | Needs an account and likely billing beyond the free tier, and its docs don't mention text `bun.lock` support. |
| [Socket](https://socket.dev) | Needs an API token, and the CLI has no SARIF output. |
| [Semgrep Supply Chain](https://semgrep.dev/products/semgrep-supply-chain) | Needs a login, reachability analysis is paid, and it doesn't read `bun.lock`. |
| [dependency-review-action](https://github.com/actions/dependency-review-action) | Free on public repos, but GitHub's dependency graph doesn't cover Bun. |
| `npm audit`, `bun audit`, cargo-audit | Each covers one ecosystem with limited ignore handling. cargo-deny already includes cargo-audit's advisory check. |
