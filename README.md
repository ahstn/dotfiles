<img src="http://i.imgur.com/9PHYl04.png" align="left" width="128px" height="128px"/>

### **dotfiles**
> *my dotfiles for development on Linux*

[![Distro](https://img.shields.io/badge/Distro-Fedora-blue.svg)](https://getfedora.org/)
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
- [`Aex Dark`] - plasma desktop theme
- [`La Capitaine`] - icon theme (dock and general)
- [`Latte Dock`] - dock used rather than a third party program

## Screenshot
Plasma (KDE) desktop as of the 8th of April 2018 - [`4d078ed`]
![screenshot](images/screenshots/08-04-18-desktop.png)

[N]Vim
![screenshot](images/screenshots/08-04-18-vim.png)


### Acknowledgements
- [`meain`] - for layout inspo and vim config
- [`posquit0`] - for layout inspo

[`vim.md`]: vim.md
[`vim-plug`]: https://github.com/junegunn/vim-plug
[`zplug`]: https://github.com/zplug/zplug
[`ripgrep`]: https://github.com/BurntSushi/ripgrep
[`Aex Dark`]: https://store.kde.org/p/1207344
[`Ciliora-Teria`]: https://github.com/zagortenay333/ciliora-tertia-shell
[`La Capitaine`]: https://github.com/keeferrourke/la-capitaine-icon-theme
[`Latte Dock`]: https://github.com/psifidotos/Latte-Dock
[`4d078ed`]: https://github.com/ahstn/dotfiles/commit/4d078ededc7f3b803a18ddb80b26cddd85c529f5
