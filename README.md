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
- [Agent Skills](#agent-skills)
- [Setup & Application Specifics](#sparkles-setup--application-specifics)
  - [ZSH](#zsh)

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

### Acknowledgements

#### Feynman

The `research-*` agents and [agent/prompts/deepresearch.md] prompt are copied from [getcompanion-ai/feynman].

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

Rather than a single `~/.zshrc` file, `~/.config/zsh/` is used to organize configuration into multiple files and support a gitignored `~/.config/zsh/zsh-private` for sensitive and local configuration. 

With this [`~/.zshenv`] file is used to source the `~/.config/zsh/` directory via `ZDOTDIR`. See [Zsh Startup Files | Zsh](https://zsh.sourceforge.io/Doc/Release/Files.html) for more information.

<details>
<summary><strong>Legacy NeoVim TLDR</strong></summary>

  Requires [wbthomason/packer.nvim] for plugin management, and will install on start-up.

  Most keybinds are detailed with [folke/which-key.nvim] in [./neovim/lua/mappings.lua](./neovim/lua/mappings.lua).

  Helpful keybinds for my forgetful mind:
  - <kbd>space</kbd> : leader key (also opens [folke/which-key.nvim] menu)
  - <kbd>space + l</kbd> : lsp actions
  - <kbd>space + s</kbd> : search with [nvim-telescope/telescope.nvim]
  - <kbd>'</kbd> : marks
  - <kbd>shift + h</kbd> : lsp symbol hover
  - <kbd>ctrl + w</kbd> : split navigation and management (also opens [folke/which-key.nvim] menu)
  - <kbd>[</kbd> & <kbd>]</kbd> : movement actions (also opens [folke/which-key.nvim] menu)
  - [phaazon/hop.nvim]
    - <kbd>s</kbd> : search down
    - <kbd>S</kbd> : search up
  - [tpope/vim-surround]
    - <kbd>ysiw)</kbd> : surround (inner) word with parentheses
    - <kbd>ds)</kbd> : remove surrounding parentheses
    - <kbd>cs)}</kbd> : change surrounding parentheses to braces
  - [nvim-telescope/telescope.nvim]
    - <kbd><C-x></kbd> : open file as a horizontal split
    - <kbd><C-v></kbd> : open file as a vertical split
    - <kbd>?</kbd> : show mappings
    - `K`: Displays hover information about the symbol under the cursor in a floating window. See [:help vim.lsp.buf.hover()](https://neovim.io/doc/user/lsp.html#vim.lsp.buf.hover()).
    - `gd`: Jumps to the definition of the symbol under the cursor. See [:help vim.lsp.buf.definition()](https://neovim.io/doc/user/lsp.html#vim.lsp.buf.definition()).
    - `gD`: Jumps to the declaration of the symbol under the cursor. Some servers don't implement this feature. See [:help vim.lsp.buf.declaration()](https://neovim.io/doc/user/lsp.html#vim.lsp.buf.declaration()).
    - `gi`: Lists all the implementations for the symbol under the cursor in the quickfix window. See [:help vim.lsp.buf.implementation()](https://neovim.io/doc/user/lsp.html#vim.lsp.buf.implementation()).
    - `go`: Jumps to the definition of the type of the symbol under the cursor. See [:help vim.lsp.buf.type_definition()](https://neovim.io/doc/user/lsp.html#vim.lsp.buf.type_definition()).
    - `gr`: Lists all the references to the symbol under the cursor in the quickfix window. See [:help vim.lsp.buf.references()](https://neovim.io/doc/user/lsp.html#vim.lsp.buf.references()).
    - `gs`: Displays signature information about the symbol under the cursor in a floating window. See [:help vim.lsp.buf.signature_help()](https://neovim.io/doc/user/lsp.html#vim.lsp.buf.signature_help()). If a mapping already exists for this key this function is not bound.
    - `<F2>`: Renames all references to the symbol under the cursor. See [:help vim.lsp.buf.rename()](https://neovim.io/doc/user/lsp.html#vim.lsp.buf.rename()).
    - `<F3>`: Format code in current buffer. See [:help vim.lsp.buf.format()](https://neovim.io/doc/user/lsp.html#vim.lsp.buf.format()).
    - `<F4>`: Selects a code action available at the current cursor position. See [:help vim.lsp.buf.code_action()](https://neovim.io/doc/user/lsp.html#vim.lsp.buf.code_action()).
    - `gl`: Show diagnostics in a floating window. See [:help vim.diagnostic.open_float()](https://neovim.io/doc/user/diagnostic.html#vim.diagnostic.open_float()).
    - `[d`: Move to the previous diagnostic in the current buffer. See [:help vim.diagnostic.goto_prev()](https://neovim.io/doc/user/diagnostic.html#vim.diagnostic.goto_prev()).
    - `]d`: Move to the next diagnostic. See [:help vim.diagnostic.goto_next()](https://neovim.io/doc/user/diagnostic.html#vim.diagnostic.goto_next()).
</details>

<details>
<summary><strong>Tmux TLDR</strong></summary>

  Requires [tmux-plugins/tpm] for plugin management, and will install on start-up.

  Helpful keybinds for my forgetful mind:
  - ctrl+space : leader
  - <leader> $ : rename session
  - <leader> s : open sessions pane
  - <leader> c : create tab
  - <leader> , : rename tab
  - <leader> % : vertical split
  - <leader> " : horizontal split
  - <leader> ctrl+s : save sessions (tmux-ressurect)
  - <leader> ctrl+r : restore sessions (tmux-ressurect)
</details>

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
