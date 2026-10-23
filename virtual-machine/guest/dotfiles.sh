#!/bin/bash
# The personal pass: clones DOTFILES_REPO into ~/DOTFILES_DIR and applies its mise config, which links
# ~/.config/mise and installs its packages and tools. The provision task runs it in the guest as the signed-in
# user after the base pass (mise.toml), which installed mise and git, on the first provision or with FORCE=1.
# Env: DOTFILES_REPO, DOTFILES_DIR (relative to home).
set -eux -o pipefail

export MISE_YES=1 MISE_TRUSTED_CONFIG_PATHS="$HOME/git:$HOME/.config/mise"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
DOTFILES_DIR="$HOME/$DOTFILES_DIR"

[ -d "$DOTFILES_DIR" ] || git clone "$DOTFILES_REPO" "$DOTFILES_DIR"
cd "$DOTFILES_DIR"
# A ~/.gitconfig that is not the dotfiles' symlink, such as the CI one in Cirrus Labs' images
# (git-credential-manager, LFS), blocks bootstrap; keep it aside.
[ ! -f ~/.gitconfig ] || [ -L ~/.gitconfig ] || mv ~/.gitconfig ~/.gitconfig.pre-dotfiles
# Bootstrap installs packages before it links dotfiles, from the config it loaded at the start, so the packages
# in ~/.config/mise/config.toml need that link first. `files` needs Tern secrets; `repos` uses an SSH clone URL.
# macos-defaults is left to the base pass that follows, whose Dock settings win over the host Macs' ones.
mise bootstrap --only dotfiles
mise bootstrap --skip files,repos,macos-defaults

touch "$HOME/.provisioned"
