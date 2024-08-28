#!/usr/bin/env bash

print_usage() {
  echo -e "Personal development setup helper"
  echo -e "Options:"
  echo -e "\t-d\tInstall Docker (default: false)"
}

install_docker=false
while getopts 'vh' flag; do
  case "${flag}" in
    d) install_docker='true' ;;
    h) print_usage
       exit 1 ;;
    *) print_usage
       exit 1 ;;
  esac
done

case "$(uname -sr)" in
    Darwin*)
        echo 'Installing macOS Packages'
        brew install rg fzf zsh gpg2 git tmux neovim stow eza
        brew install kitty
        brew install --cask font-hack-nerd-font font-jetbrains-mono
        brew install --cask raycast
        ;;
    Linux*)
        echo 'Installing Linux Packages'
        sudo apt install neovim zsh git gcc stow make perl fzf libfuse-dev 
        ;;
    *)
        echo 'Unsupported OS' 
        ;;
esac

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

curl -fsSL --create-dirs -o ${ZIM_HOME}/zimfw.zsh \
        https://github.com/zimfw/zimfw/releases/latest/download/zimfw.zsh

curl -fsSL https://starship.rs/install.sh | sh

install_docker && curl -fsSL https://get.docker.com | sh

[ -f ~/.ssh/id_ed25519 ] && chmod 600 ~/.ssh/id_ed25519 && ssh-add ~/.ssh/id_ed25519
[ -f ~/github.gpg ] && gpg --import ~/github.gpg && gpg --list-secret-keys --keyid-format=long
