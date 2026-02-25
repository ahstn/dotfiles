{
  description = "Example nix-darwin system flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-25.05-darwin";
    nix-darwin.url = "github:nix-darwin/nix-darwin/nix-darwin-25.05";
    nix-darwin.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs = inputs@{ self, nix-darwin, nixpkgs }:
  let
    personalMbp = nix-darwin.lib.darwinSystem {
      modules = [ ./hosts/personal-mbp ];
      specialArgs = { inherit self; };
    };

    workMbp = nix-darwin.lib.darwinSystem {
      modules = [ ./hosts/work-mbp ];
      specialArgs = { inherit self; };
    };

    mkHogsmeadProfile = system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      pkgs.symlinkJoin {
        name = "hogsmead";
        paths = import ./hosts/hogsmead { inherit pkgs; };
      };
  in
  {
    darwinConfigurations = {
      # Laptop (folder alias)
      "personal-mbp" = personalMbp;       # folder alias
      "Adams-MacBook-Pro" = personalMbp;  # hostname alias

      # Work laptop
      "work-mbp" = workMbp;     # folder alias
      "AHOUSTO-123" = workMbp;  # hostname alias
    };

    packages = {
      "x86_64-linux".hogsmead = mkHogsmeadProfile "x86_64-linux";
      "aarch64-linux".hogsmead = mkHogsmeadProfile "aarch64-linux";
    };
  };
}
