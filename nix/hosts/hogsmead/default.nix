{ pkgs, ... }:
(import ../common/cli-packages.nix { inherit pkgs; }) ++ [
  pkgs.neovim
  pkgs.tmux
  pkgs.zsh
  pkgs.yazi
  pkgs.prek
  pkgs.docker
]
