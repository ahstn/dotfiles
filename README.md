<img src="http://i.imgur.com/9PHYl04.png" align="left" width="128px" height="128px"/>

### **dotfiles**
> *my dotfiles for development on Linux*

[![Editor](https://img.shields.io/badge/Editor-neovim-brightgreen.svg)](https://github.com/neovim/neovim)
[![Shell](https://img.shields.io/badge/Shell-zsh-yellow.svg)](https://github.com/zplug/zplug)
[![Terminal](https://img.shields.io/badge/Terminal-Terminator-orange.svg)](https://gnometerminator.blogspot.co.uk/p/introduction.html)
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

## Appearance
- [`Arc`] - gtk theme
- [`Ciliora-Teria`] - gnome shell theme
- [`La Capitaine`] - icon theme (dock and general)
- [`Dash to Dock`] - dock used rather than a third party program

## Screenshot
Gnome desktop as of 5th of Feburary 2017 - [`64892d6`]
![screenshot](Pictures/screenshots/2017-02-05.png)

[`vim.md`]: vim.md
[`vim-plug`]: https://github.com/junegunn/vim-plug
[`zplug`]: https://github.com/zplug/zplug
[`ripgrep`]: https://github.com/BurntSushi/ripgrep
[`Arc`]: https://github.com/horst3180/arc-theme
[`Ciliora-Teria`]: https://github.com/zagortenay333/ciliora-tertia-shell
[`La Capitaine`]: https://github.com/keeferrourke/la-capitaine-icon-theme
[`Dash to Dock`]: https://extensions.gnome.org/extension/307/dash-to-dock/
[`64892d6`]: https://github.com/ahstn/dotfiles/commit/64892d5f27a65403d196bd03da9130cd197808fa
