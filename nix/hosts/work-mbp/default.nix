{ pkgs, self, ... }:
{
  networking.hostName = "AHOUSTO-123";

  environment.systemPackages = [
    pkgs.neovim
    pkgs.tmux
    pkgs.zsh
  ];

  environment.variables.DOTFILES_USERNAME = "adam.houston";

  programs.zsh.enable = true;

  nix.settings.experimental-features = [ "nix-command" "flakes" ];

  system.configurationRevision = self.rev or self.dirtyRev or null;
  system.stateVersion = 6;

  # Change to "x86_64-darwin" if this Mac is Intel.
  nixpkgs.hostPlatform = "aarch64-darwin";
}
