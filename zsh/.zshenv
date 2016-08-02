function _set_pkg_aliases() {
  if [[ -x $(which apt) ]]; then
    alias _search='apt-cache search'
    alias _install='sudo apt-get install'
    alias _update='sudo apt-get update && sudo apt-get autoremove'
    alias _remove='sudo apt-get remove'
    alias _purge='sudo apt-get remove --purge'
  fi
  if [[ -x $(which pacman) ]]; then
    alias _search='pacman -Ss'
    alias _install='sudo pacman -S'
    alias _update='sudo pacman -Syy'
    alias _upgrade='sudo pacman -Syyu'
    alias _remove='sudo pacman -R'
    alias _purge='sudo pacman -Rns'
  fi
}

function _set_ls_aliases() {
  alias ll='ls -l'
  alias lla='ls -la'
}

function _set_cd_aliases() {
  alias ..='cd ..'
  alias ...='cd ../..'
  alias ....='cd ../../..'
  alias mkcd='take'
}

_set_pkg_aliases
_set_ls_aliases
_set_cd_aliases
