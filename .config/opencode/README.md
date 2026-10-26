# OpenCode V2 configuration

`opencode.jsonc` is the personal global configuration source. `cli.json` and
`tui.json` preserve CLI and TUI preferences. `mise.toml` links each entry from
this directory into `~/.config/opencode/`, excluding `node_modules` and `bun.lock`.
Credentials, databases, provider connections, and machine-local gateways remain
machine-local. Warming stays disabled and the existing disabled Prettier
preference is preserved.

Web search explicitly selects `exa`. Use the existing OpenCode connection, or
connect Exa through `/connect` / `EXA_API_KEY` on each machine. No search credential
belongs in this repository. Search queries leave the machine; do not include
private source, credentials, or sensitive incident details.

Skills explicitly include `~/git/dotfiles/skills`. This source takes precedence
over automatically discovered `~/.agents/skills` and `~/.claude/skills` copies
with the same skill ID, so edits to the source are used directly.

## References

- `axum`: upstream Axum source; compare with the consuming project's lockfile.
- `tanstack-router`: upstream Router/Start source; compare installed versions.
- `opencode`: `anomalyco/opencode`, following the default branch (`dev`), which
  contains the current V2 source. The branch named `2.0` is an old V1 snapshot.
- `dotfiles`: the local `~/git/dotfiles` checkout of `ahstn/dotfiles`, including
  current uncommitted work; consult its `AGENTS.md` before editing.

Git references refresh asynchronously and cached checkouts may be reset. Treat
them as read-only. See the [V2 reference contract](https://opencode.ai/v2/docs/references/).

## Permission policy

The first rule allows all actions, including `.env` reads. Native V2
`external_directory` rules then ask before external access except within
`~/git/dotfiles/*` and `~/.cache/github/*`. The underlying read/edit permissions
still apply; the GitHub cache should be treated as reference material.
File edits under `~/.cache/github/*` are explicitly denied while reads stay
allowed. This is not a shell sandbox: external commands remain subject to the
separate shell rules and best-effort path inference.
Other exceptions are adaptations of the Oceans packs in
`crates/gateway-guardrails/src/packs/`, not a port of their evaluator.

| Pack | Local policy |
| --- | --- |
| `core.filesystem` | Ask for removal, truncation, imaging, and find deletion; block shredding, device overwrite, and filesystem/disk erasure. |
| `core.git` | Ask for discarding work, deleting references, force pushes, and pruning recovery history. Ambiguous checkout forms ask; explicit `checkout -b` and ordinary `switch` remain allowed. Normal status/diff/add/commit/push remain allowed. |
| `kubernetes.kubectl` / `kubernetes.helm` | Ask for deletion, disruption, pruning, forced replacement, rollback, and failure cleanup. |
| `secrets.aws_secrets` / `secrets.onepassword` | Ask for secret mutations and access revocation. |
| `database.snowflake` | Ask for every SQL invocation, destructive object operations, and remote code execution. |
| `saas.github` | Ask for impactful CLI writes and every `gh api` call; block repository deletion. GitHub MCP actions ask by default, with named read-only inventory exceptions; new/unknown tools require approval. |
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

## Reproducible linting

The checks package pins Oxlint and its type-aware backend. From this directory:

```sh
mise exec -- bun install --frozen-lockfile
mise exec -- bun run typecheck
mise exec -- bun run lint
```

Lint uses the unmodified `../oxlint/.oxlint.jsonc` against the config tests and
both plugins, including smoke fixtures. Each TS project includes its own files;
no type-aware rules are dropped. The config test imports JSONC through Bun's
older-supported module loader rather than requiring `Bun.JSONC.parse`.

## LiteLLM and Oceans discovery

`plugins/litellm.ts` is a single, self-contained Effect plugin for LiteLLM-compatible gateways. Copy and paste its contents into `~/.config/opencode/plugins/litellm.ts`; no local helper files, package manifest, or separate Oceans plugin are needed, because OpenCode supplies `effect` and `@opencode/plugin` to plugins at runtime. It uses the same rich metadata contract as [OMP's LiteLLM discovery](https://github.com/can1357/oh-my-pi/blob/main/packages/catalog/src/provider-models/openai-compat.ts), not the old Oceans proxy hints. Refresh fibres belong to the plugin scope, so unloading the plugin stops them.

### Gateway configuration

The plugin reads gateways from `$XDG_CONFIG_HOME/opencode` (default `~/.config/opencode`). It uses the first file that exists:

1. `gateways.local.yml`: machine-local, outside this repository. It replaces the tracked file entirely, so work and personal gateways never merge.
2. `gateways.yml`: the tracked personal file, mapped by `mise.toml`. It does not list `litellm`.

With neither file, the plugin registers nothing. The files use the `providers:` shape of OMP's `models.yml`, so an OMP gateway block can be pasted as it is. Only entries with `discovery: { type: litellm }` are gateways; other entries are skipped. Static providers and context-window overrides for catalog providers belong in the native `providers` object of `opencode.jsonc` ([provider config](https://opencode.ai/v2/docs/providers/#custom)). An entry that fails validation is skipped with a warning, and the other gateways still load. Restart OpenCode or its service after editing a gateway file.

```yaml
providers:
  oceans:
    name: Oceans                  # display name; defaults to the ID
    baseUrl: https://oceans.example.com/v1
    apiKey: OCEANS_LLM_API_KEY    # environment variable name, or a list in precedence order
    api: openai-completions       # fallback when metadata has no routing evidence
    discovery:
      type: litellm
    modelOverrides:
      claude-opus-5.5:
        api: anthropic-messages
        thinking: { mode: anthropic-adaptive, efforts: [low, medium, high, xhigh, max] }
      gpt-6.1-sol:
        api: openai-responses
        thinking: { mode: effort, efforts: [low, medium, high, xhigh, max], defaultLevel: medium }
```

`api` is one of `openai-completions`, `openai-responses`, or `anthropic-messages`. In `thinking`, `efforts` replaces the variant list, `defaultLevel` sets the default effort, and `mode: anthropic-adaptive` without `defaultLevel` turns on adaptive thinking. The plugin ignores other OMP keys such as `supportsDisplay`, `requiresEffort`, and `contextWindow`. `baseUrl` may end in `/v1` or not: inference uses `<root>/v1`, while metadata lives at the gateway root.

### Discovery

Discovery tries `/model_group/info`, `/v2/model/info`, `/model/info`, and `/v1/model/info` in that order. Later endpoints fill missing fields. A complete vision and price record stops further probes. If no rich endpoint yields models, the plugin uses `/v1/models`. A 404 or other client error means the gateway does not offer that endpoint. Authentication failures, 408, 429, 5xx, timeouts, transport errors, invalid JSON, and an empty result fail the whole refresh instead. Refreshes run every minute; a failed refresh keeps the last successful inventory, so one slow endpoint cannot shrink the model list.

The mapper reads top-level or nested `model_info` limits, tool and vision flags, reasoning support, supported OpenAI parameters, and per-token prices. It converts prices to OpenCode's per-million units and uses catalog defaults for missing metadata. Catalog defaults come from first-party vendor catalogs (`anthropic`, `openai`, `google`, and so on) before resellers such as GitHub Copilot, and never from another configured gateway. An explicit `providers: ["openai"]` selects Responses; mixed or other provider lists keep Chat Completions. A GPT-like name without other evidence selects Responses; otherwise the gateway's `api` applies. Anthropic Messages requires an explicit override, as it does in OMP. LiteLLM metadata does not report an effort ladder; the plugin takes effort names from catalog variants unless the gateway denies reasoning. An explicit override's efforts always win.

Each gateway registers an OpenCode integration with the same ID as its provider, and the provider points at it through `integrationID`. The integration offers an environment method with the `apiKey` names, in order, and a manual key method, so `opencode auth` or `/connect` can also store a key. A saved credential takes precedence over the environment. Discovery and model requests both resolve the active connection; the key never appears in provider settings, which the server API returns as they are. Keep credentials in the environment or the OpenCode credential store, never in a gateway file.

This works with OpenCode **2.0.26**. That version represents reasoning controls as `Model.Info.variants`; the newer V2 docs' `capabilities.reasoning` field is not part of its schema. See [V2 plugins](https://opencode.ai/v2/docs/build/plugins/) and [runtime packages](https://opencode.ai/v2/docs/providers/#packages).

For a dotfiles checkout, leave existing global plugins in place and link only this file and the tracked gateway file. Check that each destination is absent before running these commands:

```sh
ln -s "$HOME/git/dotfiles/.config/opencode/plugins/litellm.ts" "$HOME/.config/opencode/plugins/litellm.ts"
ln -s "$HOME/git/dotfiles/.config/opencode/gateways.yml" "$HOME/.config/opencode/gateways.yml"
```

A work machine keeps its gateways in an unlinked `~/.config/opencode/gateways.local.yml`. Never copy work gateways into the tracked `gateways.yml`.

When upgrading from the split version, remove the old `plugins/oceans.ts` entry and the old discovery-only `lib` link so the provider is registered only once. Do not delete other files in a shared `lib` directory.

Do not replace the whole plugin directory to enable this plugin on 2.0.26: the agent coordination plugin below needs 2.0.29. Use `--standalone` for a test that inherits the current shell's credentials; a background service needs the same environment. A standalone live test is:

```sh
opencode run --standalone --model 'oceans/claude-opus-5.5#low' 'Reply with exactly OPENCODE_CLAUDE_OK.'
opencode run --standalone --model 'oceans/gpt-6.1-sol#low' 'Reply with exactly OPENCODE_GPT_OK.'
```

Both passed on 2.0.26 against a live Oceans gateway. The single-file revision also passed both live tests with only a copied `litellm.ts` in an isolated config directory, without local helper files or a package manifest. A temporary HTTP hook on the earlier split version verified `/v1/messages` with adaptive thinking and `output_config.effort: low`, and `/v1/responses` with `reasoning.effort: low`. The Effect and integration revision was checked on 2.0.26 against a local fake gateway: provider settings held only `baseURL`, both integrations used their environment connection, discovery sent the bearer key, and `/v1/messages`, `/v1/responses`, and `/v1/chat/completions` received the integration key with the expected effort settings. The gateway-file revision was checked on 2.0.26 against live LiteLLM and Oceans gateways listed in a `gateways.local.yml`: both providers registered with their configured base URLs, the model overrides resolved to the same packages, settings, and variants as the earlier hard-coded ones, and live runs passed on the Messages, Responses, and Chat Completions routes.

LiteLLM metadata can report Claude models as plain chat models of their upstream provider, such as `vertex_ai`, so the plugin sends them through Chat Completions. If a gateway's Chat Completions route fails for Claude but its `/v1/messages` route works, add a `modelOverrides` entry with `api: anthropic-messages` and `thinking.mode: anthropic-adaptive` for each affected model ID.

Regression tests in `litellm.test.ts` cover routing precedence, explicit overrides, OMP thinking mapping, the gateway fallback API, gateway file validation and local-file precedence, metadata precedence, price conversion, effort support, enrichment, inventory fallback, vendor-first catalog fallbacks, and transient endpoint failures.

## Skill URL plugin

`plugins/skill-urls/` is an immediate plugin package in the already mise-managed
global `~/.config/opencode/plugins/` directory, so OpenCode discovers it without
an additional `plugins` config entry. See its [README](plugins/skill-urls/README.md)
for supported aliases, read-only behavior, permission checks, and verification.

## Agent coordination plugin

`plugins/agent-urls/` adds model-selected child sessions and `agent://` output
handles with two-way messaging. It needs **OpenCode 2.0.29** for native permission
assertions; it is not activated safely on 2.0.26. The [plugin README](plugins/agent-urls/README.md)
documents tool inputs, frozen system prompts, authority boundaries, costs, and
the isolated local-provider smoke test. Neither plugin is deployed by merely
committing this repository change.
