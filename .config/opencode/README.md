# OpenCode V2 configuration

`opencode.jsonc` is the personal global configuration source. `mise.toml` maps
only that file into `~/.config/opencode/`; credentials, databases, provider
connections, and terminal settings remain machine-local. Warming stays disabled
and the existing disabled Prettier preference is preserved.

Web search explicitly selects `exa`. Use the existing OpenCode connection, or
connect Exa through `/connect` / `EXA_API_KEY` on each machine. No search credential
belongs in this repository. Search queries leave the machine; do not include
private source, credentials, or sensitive incident details.

## References

- `axum`: upstream Axum source; compare with the consuming project's lockfile.
- `tanstack-router`: upstream Router/Start source; compare installed versions.
- `opencode`: `anomalyco/opencode`, explicitly on the `2.0` branch rather than
  the repository's default V1 `dev` branch.
- `dotfiles`: the local `~/git/dotfiles` checkout of `ahstn/dotfiles`, including
  current uncommitted work; consult its `AGENTS.md` before editing.

Git references refresh asynchronously and cached checkouts may be reset. Treat
them as read-only. See the [V2 reference contract](https://opencode.ai/v2/docs/references/).

## Permission policy

The first rule allows all actions, including external reads and `.env` reads.
Later exceptions are adaptations of the Oceans packs in
`crates/gateway-guardrails/src/packs/`, not a port of their evaluator.

| Pack | Local policy |
| --- | --- |
| `core.filesystem` | Ask for removal, truncation, imaging, and find deletion; block shredding, device overwrite, and filesystem/disk erasure. |
| `core.git` | Ask for discarding work, deleting references, force pushes, and pruning recovery history. Normal status/diff/add/commit/push remain allowed. |
| `kubernetes.kubectl` / `kubernetes.helm` | Ask for deletion, disruption, pruning, forced replacement, rollback, and failure cleanup. |
| `secrets.aws_secrets` / `secrets.onepassword` | Ask for secret mutations and access revocation. |
| `database.snowflake` | Ask for every SQL invocation, destructive object operations, and remote code execution. |
| `saas.github` | Ask for impactful CLI/MCP writes and every `gh api` call; block repository deletion. Grouped MCP write tools ask regardless of method. |
| `core.shell` | Block host power changes, formatting, and selected init/broadcast signals. |
| `secret_disclosure` | Block secret-value output, export, and credential-generating commands; prefer process-only injection through `op run`, `infisical run`, or `doppler run`. |

### Limits

- OpenCode matches case-sensitive command-text wildcards, not executable/argument
  semantics. Leading wildcards cover common wrappers and global options but can
  also match quoted data, paths, or resource names. Some safe variants therefore
  ask or block: all `rm`, `truncate`, `dd`, Snowflake SQL, secret CLI help/list
  operations, and destructive-operation dry runs intentionally stay conservative.
- The rules are **not a sandbox or a complete security boundary**. Aliases,
  shell expansions, scripts, interpreter execution, nested commands, output
  redirection, and unlisted spellings can escape textual matching. Shell scanners
  are best-effort; saved approvals and later project/agent rules can also affect
  approval behavior. Global ordinary permissions are not organization policies.
- MCP permissions use tool names and `*`, not arguments. GitHub patterns require
  a server/tool action containing lowercase `github`. Other MCP servers, including
  SQL/shell wrappers, are not semantically inspected by these rules.
- Process-only secret injection does not prevent the consuming process from
  printing a secret. Default-allow file reads/searches can also disclose secrets.
- No automatic allow override is added for `--help` or `--dry-run`: a broad
  wildcard cannot safely distinguish real options from argument text.

Run `mise exec -- bun test ./.config/opencode/config.test.ts` to validate the JSONC,
deployment mapping, and representative permission resources **without executing
any of the listed commands**. These tests implement the documented wildcard
contract; they do not claim to test OpenCode's shell scanner.

Do not run a blanket `mise dotfiles apply` to deploy one change. Inspect the
specific mapping and preserve an existing global config before replacing it.
See [V2 permissions](https://opencode.ai/v2/docs/permissions/) for rule order.
