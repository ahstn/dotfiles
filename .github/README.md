<img src="http://i.imgur.com/9PHYl04.png" align="left" width="128px" height="128px"/>

### **dotfiles**
> *my dotfiles for development on macOS*

[![Distro](https://img.shields.io/badge/Distro-macOS-blue.svg)](https://apple.com/)
[![Editor](https://img.shields.io/badge/Editor-neovim-brightgreen.svg)](https://github.com/neovim/neovim)
[![Shell](https://img.shields.io/badge/Shell-zsh-yellow.svg)](https://github.com/zplug/zplug)
[![Terminal](https://img.shields.io/badge/Terminal-Kitty-orange.svg)](https://sw.kovidgoyal.net/kitty/)
[![Font](https://img.shields.io/badge/Font-Hack-lightgrey.svg)](https://sourcefoundry.org/hack/)

## :rocket: Usage
Structured to work with `GNU Stow`
```
$ git clone https://github.com/ahstn/dotfiles.git
$ cd dotfiles/
$ stow vim
```
etc, etc..

## :sparkles: Setup & Application Specifics

<details>
<summary><strong>Dependencies & Install Commands</strong></summary>

  General tools:
  ```bash
  brew install rg fzf zsh gpg2 git tmux neovim stow
  brew install kitty
  brew install --cask font-hack-nerd-font font-jetbrains-mono
  brew install --cask raycast
  ```

  Specific development tools:
  ```bash
  brew install golang nodejs rust yarn coreutils kubectl kubectx helm
  brew install --cask visual-studio-code
  ```
</details>

<details>
<summary><strong>NeoVim TLDR</strong></summary>

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
    - <C-x>	: open file as a horizontal split
    - <C-v>	: open file as a vertical split
    - ? : show mappings
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

## :raised_hands: Acknowledgements
- [`meain`] - for layout inspo and vim config
- [`posquit0`] - for layout inspo
- [`kutsan`] - for cool vim stuff
- [`augustocdias`] - neovim setup
- [`thanhvule0310`] - neovim setup


[wbthomason/packer.nvim]: https://github.com/wbthomason/packer.nvim
[tmux-plugins/tpm]: https://github.com/tmux-plugins/tpm
[folke/which-key.nvim]: https://github.com/folke/which-key.nvim
[nvim-telescope/telescope.nvim]: https://github.com/nvim-telescope/telescope.nvim
[phaazon/hop.nvim]: https://github.com/phaazon/hop.nvim
[tpope/vim-surround]: https://github.com/tpope/vim-surround

[`meain`]: https://github.com/meain/dotfiles
[`posquit0`]: https://github.com/posquit0/dotfiles
[`kutsan`]: https://github.com/kutsan/dotfiles
[`augustocdias`]: https://github.com/augustocdias/dotfiles/
[`thanhvule0310`]: https://github.com/thanhvule0310/dotfiles
