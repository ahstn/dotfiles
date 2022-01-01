<img src="http://i.imgur.com/9PHYl04.png" align="left" width="128px" height="128px"/>

### **dotfiles**
> *my dotfiles for development on macOS*

[![Distro](https://img.shields.io/badge/Distro-macOS-blue.svg)](https://apple.com/)
[![Editor](https://img.shields.io/badge/Editor-neovim-brightgreen.svg)](https://github.com/neovim/neovim)
[![Shell](https://img.shields.io/badge/Shell-zsh-yellow.svg)](https://github.com/zplug/zplug)
[![Terminal](https://img.shields.io/badge/Terminal-iTerm2-orange.svg)](https://iterm2.com/)
[![Font](https://img.shields.io/badge/Font-Hack-lightgrey.svg)](https://sourcefoundry.org/hack/)

For Vim help take a look at my [`vim.md`] which lists general, personal
and plugin keybinds. As well as every plugin I use.

## Usage
Structured to work with `GNU Stow`
```
$ git clone https://github.com/ahstn/dotfiles.git
$ cd dotfiles/
$ stow vim
```
etc, etc..

## Optional Dependencies
- [`vim-plug`] - vim plugin manager, used in my `.vimrc`
- [`zplug`] - zsh plguin manger, used in my `.zshrc`
- [`ripgrep`] - lightning fast grep, used in my `.vimrc` and `.zshrc`


Brew command for general tools:
```bash
brew install rg fzf zsh gpg2 git tmux
brew install --cask raycast
```

Brew command for specific development tools:
```bash
brew install golang jq nodejs yarn coreutils kubectl kubectx helm 
brew install --cask visual-studio-code
```

### Acknowledgements
- [`meain`] - for layout inspo and vim config
- [`posquit0`] - for layout inspo
- [`kutsan`] - for cool vim stuff

[`vim.md`]: vim.md
[`vim-plug`]: https://github.com/junegunn/vim-plug
[`zplug`]: https://github.com/zplug/zplug
[`ripgrep`]: https://github.com/BurntSushi/ripgrep
[`meain`]: https://github.com/meain/dotfiles
[`posquit0`]: https://github.com/posquit0/dotfiles
[`kutsan`]: https://github.com/kutsan/dotfiles
