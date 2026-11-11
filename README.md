<img src="http://i.imgur.com/9PHYl04.png" align="left" width="128px" height="128px"/>

### **dotfiles**


[![Shell](https://img.shields.io/badge/harness-pi-red.svg)](#)
[![Quality](https://img.shields.io/badge/quality-404%20not%20found-green)](#)
[![Monster](https://img.shields.io/badge/monster%20energy%20drunk-814%20L-31C)](#)

</br></br>

- [Usage](#rocket-usage)
- [Pi](#pi)
  - ["Custom" Extensions](#custom-extensions)
  - [Packages](#packages)
  - [Acknowledgements](#acknowledgements)
- [Oh-my-pi](#oh-my-pi)
- [Agent Skills](#agent-skills)
- [Setup & Application Specifics](#sparkles-setup--application-specifics)
  - [ZSH](#zsh)
- [Fonts](#fonts)

## :rocket: Usage

Setup and based on [mise](https://mise.jdx.dev/) with it's dotfile and bootstrap management.

1. Install mise, see [Installing Mise | Mise](https://mise.jdx.dev/installing-mise.html) - `curl https://mise.run/zsh | sh`
2. Apply dotfiles - `mise dotfiles apply --dry-run` (remove `--dry-run` to apply)
  1. Optionally, apply for specific tools, e.g. `mise dotfiles apply '~/.config/herdr'`
3. Install system packages - `mise bootstrap packages apply`
4. Install tools - `mise install`

Dotfile management is handled by [`mise.toml`] currently, while bootstrap and system wide configuration is handled by [`.config/mise/config.toml`]. 

## Pi 

### Personal Extensions
  - [`.pi/agent/extensions/exa-websearch/`] - single Exa web/search contents tool with highlights-first results, deep search modes, summaries, and URL content retrieval.
      - Alternative, with no API Key required and [kepano/defuddle] sanitization: [thinkscape/agent-smart-fetch]
  - [`.pi/agent/extensions/skill-autocomplete.ts`] - press `$` in the editor to open an autocomplete menu of loaded skills.

### Packages

- [ayagmar/pi-extmgr] - UI for managing extensions.
- [nicobailon/pi-subagents] - Powerful sub-agent system with recursion and pipelining support
    - Alternatives: [tintinweb/pi-subagents] and [pasky/pi-side-agents]
- [pi-token-burden] - Claude-like context command with granular token counts per tool, mcp, etc
    - Alternatives: [pi-context]
- [juicesharp/rpiv-ask-user-question] - Multi-question answer flow with recommendations and manual additional choice entry.
    - Alternatives: [devkade/pi-ask-tool] (previously used) and [nicobailon/pi-interview]

### Acknowledgements

#### Feynman

The `research-*` agents and [agent/prompts/deepresearch.md] prompt are copied from [getcompanion-ai/feynman].

## Oh-my-pi

OMP's `.omp/agent/` directory is deployed with `symlink-each` using `mise dotfiles apply '~/.omp/agent'`. Each managed file is linked to the repo, so edits through either path affect the same file. The mapping excludes sessions, terminal sessions, prediction data, caches, blobs, SQLite databases and sidecars, locks, work model copies, the changelog marker, and local MCP configuration. Target-only files and extensions remain untouched. Removing or excluding a source file removes its managed link on the next apply. To replace existing regular copies with links, first compare their contents, then apply with `--force`.

[`.omp/agent/extensions/git-ai.ts`](.omp/agent/extensions/git-ai.ts) ports the Pi Git AI integration to OMP's TypeScript extension API. Restart OMP (or `/reload`) after applying extension changes.

The `/action-pr-comments` and `/rebase-main-branch` commands in `.omp/agent/commands/` are copies of the matching Pi prompts in `.pi/agent/prompts/`. Keep both copies aligned when editing them. Restart OMP after applying to load the commands.

### Auth gateway daemons

The root `mise.toml` runs OMP's credential broker and model gateway with [mise daemons](https://mise.jdx.dev/daemons.html). Start them from this repository on the host that holds your OMP credentials:

```sh
mise daemons start omp-auth
```

The gateway waits for the broker. Both bind to loopback: broker `127.0.0.1:8765`, gateway `127.0.0.1:4000`. They use the invoking user's OMP profile and credential store. The gateway connects to the local broker, not an inherited `OMP_AUTH_BROKER_TOKEN`. Each process gets up to three retries after failure. They stay running when you leave the directory, but do not start on shell entry or at login. Plain `mise daemons start` starts only this local pair.

To expose the gateway to your tailnet:

```sh
mise daemons start omp-auth-remote
```

This also starts the local pair, then runs Tailscale Serve in the foreground under pitchfork. It requires a running, authenticated Tailscale client with HTTPS enabled. The endpoint is `https://<host>.<tailnet>.ts.net:8443`; port 443 is left alone for other services. Stopping the Serve daemon removes its route. It does not use Funnel or expose the broker.

Restrict tailnet access to gateway TCP port 8443 with Tailscale grants. Network access is not permission to use models: gateway bearer authentication remains enabled.

#### Client access

The first gateway start creates `~/.config/omp/auth-gateway-clients.json` with mode `0600` and contents `{}`. Existing files are preserved. This file is local state, not managed by dotfiles. Add scoped clients there using OMP's [client-token format](https://github.com/can1357/oh-my-pi/blob/main/docs/auth-broker-gateway.md#client-tokens): a SHA-256 token digest, explicit model grants, and optional OAuth account bindings. The gateway reloads it every ten seconds; replace it atomically when updating it.

An empty client list admits no scoped clients. The unrestricted operator token still exists in the active OMP profile's `auth-gateway.token`; keep it on the host. Remote workers should receive only their own scoped token, never the operator token, broker token, or provider credentials.

For a remote OMP client, put the gateway endpoint and token reference in that client's `~/.omp/agent/models.yml`, repeating the provider entry for each granted provider:

```yaml
providers:
  anthropic:
    transport: pi-native
    baseUrl: https://<host>.<tailnet>.ts.net:8443
    apiKey: OMP_GATEWAY_TOKEN
```

Set `OMP_GATEWAY_TOKEN` through the client's secret mechanism. Do not set `OMP_AUTH_BROKER_URL` on a remote worker: direct broker clients receive usable provider credentials. Other OpenAI-compatible clients use the gateway URL with `/v1` appended.

#### Operations

```sh
mise daemons status
mise daemons logs omp-auth-gateway
mise daemons restart omp-auth-gateway
mise daemons stop omp-auth-tailscale  # remove tailnet exposure, keep the local pair
mise daemons stop                    # stop all three
```

After rotating the broker token, restart the broker and gateway; after rotating the operator gateway token, restart the gateway. Scoped client token changes need only the file reload.

Health checks (`/v1/healthz` on the broker, `/healthz` on the gateway) prove that the listeners are ready, not that a provider account works. Check `/v1/models` with a scoped token, then make a model request when testing provider access. `omp auth-gateway check` probes credentials directly rather than the deployed HTTPS route.

## Agent Skills

This repo uses [mise] dotfiles to link each skill into both shared and Claude-specific global skill directories:

```sh
mise dotfiles apply
```

Alternatively, install skills with the [Skills CLI]:

```sh
npx skills add ahstn/dotfiles
npx skills add ahstn/dotfiles --skill code-review-and-quality
```

## :sparkles: Setup & Application Specifics

### ZSH

Rather than a single `~/.zshrc` file, `~/.config/zsh/` is used to organize configuration into multiple files.

API keys come from 1Password through [fnox](https://fnox.jdx.dev), not a sourced file. [`.config/fnox/config.toml`](.config/fnox/config.toml) holds only 1Password references, and `.zshrc` loads the ones marked `env = true` into every shell. The fnox daemon keeps resolved values in memory, so new shells don't each prompt for 1Password. Project keys belong in that project's `fnox.toml`. The age key for fnox's local sync cache, `~/.config/fnox/age.txt`, stays untracked.

With this [`~/.zshenv`] file is used to source the `~/.config/zsh/` directory via `ZDOTDIR`. See [Zsh Startup Files | Zsh](https://zsh.sourceforge.io/Doc/Release/Files.html) for more information.

### Fonts

JetBrains Mono [Nerd Font] is used as the monospace font, and [Geist] for UI text. The Nerd Font variant adds common programming and web icons.

See [Programming Fonts] for help choosing a font, with some noteworthy, favourite alternatives being `Inconsolata`, `JuliaMono` and `BerkleyMono`.

For macOS, both fonts are declared in `.config/mise/config.toml` and installed with `mise bootstrap packages apply`.


<!-- Reference Links -->

[`.pi/agent/extensions/handoff.ts`]: ./.pi/agent/extensions/handoff.ts
[`.pi/agent/extensions/notify.ts`]: ./.pi/agent/extensions/notify.ts
[`.pi/agent/extensions/summarize.ts`]: ./.pi/agent/extensions/summarize.ts
[`.pi/agent/pi-permissions.jsonc`]: ./.pi/agent/pi-permissions.jsonc
[`.pi/agent/extensions/exa-websearch/`]: ./.pi/agent/extensions/exa-websearch/
[`.pi/agent/extensions/skill-autocomplete.ts`]: ./.pi/agent/extensions/skill-autocomplete.ts
[`.pi/agent/prompts/deepresearch.md`]: ./.pi/agent/prompts/deepresearch.md

[`mise.toml`]: ./mise.toml
[`.config/mise/config.toml`]: ./.config/mise/config.toml
[`~/.zshenv`]: ./.config/.zshenv
[mise]: https://mise.jdx.dev/
[jetbrains mono]: https://www.jetbrains.com/lp/mono/
[nerd font]: https://www.nerdfonts.com/
[geist]: https://vercel.com/font
[programming fonts]: https://www.programmingfonts.org/

[wbthomason/packer.nvim]: https://github.com/wbthomason/packer.nvim
[tmux-plugins/tpm]: https://github.com/tmux-plugins/tpm
[folke/which-key.nvim]: https://github.com/folke/which-key.nvim
[nvim-telescope/telescope.nvim]: https://github.com/nvim-telescope/telescope.nvim
[phaazon/hop.nvim]: https://github.com/phaazon/hop.nvim
[tpope/vim-surround]: https://github.com/tpope/vim-surround
[startup files | zsh]: https://zsh.sourceforge.io/Doc/Release/Files.html#Startup_002fShutdown-Files
[badlogic/pi-mono]: https://github.com/badlogic/pi-mono
[mitsuhiko/agent-stuff]: https://github.com/mitsuhiko/agent-stuff
[MasuRii/pi-permission-system]: https://github.com/MasuRii/pi-permission-system
[ayagmar/pi-extmgr]: https://github.com/ayagmar/pi-extmgr
[nicobailon/pi-subagents]: https://github.com/nicobailon/pi-subagents
[pi-context]: https://github.com/ttttmr/pi-context
[pi-token-burden]: https://github.com/Whamp/pi-token-burden
[agent skills]: https://skills.sh/
[Skills CLI]: https://skills.sh/
[mise]: https://mise.jdx.dev/
[getcompanion-ai/feynman]: https://github.com/getcompanion-ai/feynman
[kepano/defuddle]: https://github.com/kepano/defuddle
[thinkscape/agent-smart-fetch]: https://github.com/Thinkscape/agent-smart-fetch


[tintinweb/pi-subagents]: https://x.com/nicht_tintin/status/2031119030224920979
[pasky/pi-side-agents]: https://x.com/xpasky/status/2028273594782855267
[devkade/pi-ask-tool]: https://github.com/devkade/pi-ask-tool
[nicobailon/pi-interview]: https://github.com/nicobailon/pi-interview-tool
