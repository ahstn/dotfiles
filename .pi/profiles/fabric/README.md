# Fabric trial profile

Start with `pi-fabric` after mise refreshes shell aliases, or launch directly:

```sh
PI_CODING_AGENT_DIR="$HOME/.pi/profiles/fabric" PI_FABRIC_AGENT_DIR="$HOME/.pi/profiles/fabric" PI_CODING_AGENT_SESSION_DIR="$HOME/.pi/profiles/fabric/sessions" pi
```

The profile pins Fabric 0.82.8, which meets the configured three-day package age policy, and reuses daily Sol/medium, compaction, and theme settings. Plain `pi` remains the daily pi-subagents + pi-mcp-adapter setup. No MCP adapter or second supervisor is installed here.

`mise.toml` already links the complete `.pi` directory into the home directory. The tracked relative `models.json -> ../../agent/models.json` link shares one model definition file on every machine without an overlapping mise dotfile entry. The theme is referenced by relative path. Runtime files are ignored by Git.

The local ignored `auth.json` link reuses daily credentials. On a new machine, either log in separately in the Fabric profile or create that link after the daily account is configured. Do not commit credentials. Settings and sessions remain separate.

Defaults: four concurrent children per runtime, 16 children per `fabric_exec`, nesting depth two, 30-minute default child timeout, one million cumulative tokens per child, and a best-effort $10 recursion-tree cost ledger. Token accounting is cumulative across requests, not context-window size. Cost limits depend on reported prices and may be ineffective for subscription providers. These are trial defaults, not official Codex/Astra defaults or hard session-wide ceilings. QuickJS remains the execution kernel. Normal code calls default to two minutes and can request up to 15 minutes; agent orchestration has a separate timeout floor.

Worker model aliases mirror the daily role choices, except scout uses the existing Luna fallback: Fabric 0.82.8 rejects the nested OpenRouter model identifier in its alias validator. Thinking levels are recorded in AGENTS.md because Fabric aliases do not encode per-role reasoning settings. They are guidance, not a model allowlist. Children inherit Main's model when no override is given.

Trajectory handoff preserves context for sequential delegation. Ordinary parallel spawns cannot fork the parent transcript; AGENTS.md requires explicit context briefs for those runs. Prewalk is configured for trajectory mode but is not automatically armed.

Trusted project `.pi/settings.json` and `.pi/fabric.json` can override this profile. Shared `~/.agents/skills` and project instructions still load. Profile directories do not isolate workspace edits or project mesh state; use separate worktrees for concurrent mutation trials.

References: [Fabric configuration](https://github.com/monotykamary/pi-fabric/blob/main/docs/configuration.md), [agent context and handoff](https://github.com/monotykamary/pi-fabric/blob/main/docs/agents.md), [mise dotfiles](https://mise.jdx.dev/dotfiles.html).
