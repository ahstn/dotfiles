{ pkgs, self, ... }:
let
  username = "ahstn";
in
{
  imports = [ ./system.nix ];

  nixpkgs.config.allowUnfree = true;

  # List packages installed in system profile.
  environment.systemPackages = (import ../common/cli-packages.nix { inherit pkgs; }) ++ [
    pkgs.neovim
    pkgs.tmux
    pkgs.zsh
    pkgs.yazi
    pkgs.zed-editor
    pkgs.ghostty
    pkgs.obsidian
    pkgs.prek
  ];

  environment.variables.DOTFILES_USERNAME = username;

  system.primaryUser = username;

  programs.zsh.enable = true;

  # Necessary for using flakes on this system.
  nix.settings.experimental-features = [ "nix-command" "flakes" ];

  system.configurationRevision = self.rev or self.dirtyRev or null;

  # Used for backwards compatibility, please read the changelog before changing.
  # $ darwin-rebuild changelog
  system.stateVersion = 6;

  nixpkgs.hostPlatform = "aarch64-darwin";
}
