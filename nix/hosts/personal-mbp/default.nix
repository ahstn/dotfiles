{ pkgs, self, ... }:
{
  # List packages installed in system profile.
  environment.systemPackages = [
    pkgs.neovim
    pkgs.tmux
    pkgs.zsh
    pkgs.yazi
  ];

  environment.variables.DOTFILES_USERNAME = "ahstn";

  programs.zsh.enable = true;

  # Necessary for using flakes on this system.
  nix.settings.experimental-features = [ "nix-command" "flakes" ];

  system.configurationRevision = self.rev or self.dirtyRev or null;

  # Used for backwards compatibility, please read the changelog before changing.
  # $ darwin-rebuild changelog
  system.stateVersion = 6;

  nixpkgs.hostPlatform = "aarch64-darwin";
}
