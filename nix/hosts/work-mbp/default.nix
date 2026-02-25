{ pkgs, self, ... }:
let
  username = "adam.houston";
in
{
  imports = [ ./system.nix ];

  nixpkgs.config.allowUnfree = true;

  networking.hostName = "AHOUSTO-123";

  environment.systemPackages = (import ../common/cli-packages.nix { inherit pkgs; }) ++ [
    pkgs.neovim
    pkgs.tmux
    pkgs.zsh
    pkgs.zed-editor
    pkgs.ghostty
    pkgs.obsidian
    pkgs.prek
  ];

  environment.variables.DOTFILES_USERNAME = username;

  system.primaryUser = username;

  programs.zsh.enable = true;

  nix.settings.experimental-features = [ "nix-command" "flakes" ];

  system.configurationRevision = self.rev or self.dirtyRev or null;
  system.stateVersion = 6;

  # Change to "x86_64-darwin" if this Mac is Intel.
  nixpkgs.hostPlatform = "aarch64-darwin";
}
