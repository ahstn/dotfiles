# Nix (macOS + Ubuntu)

This directory is a flake that manages:

- `personal-mbp` (macOS via nix-darwin)
- `work-mbp` (macOS via nix-darwin)
- `hogsmead` (Ubuntu via `nix profile`)

Host config lives in:

- `hosts/personal-mbp/default.nix`
- `hosts/work-mbp/default.nix`
- `hosts/hogsmead/default.nix`

Usernames:

- `personal-mbp`: `ahstn`
- `work-mbp`: `adam.houston`
- `hogsmead`: `ahstn`

## macOS (personal-mbp)

Install Nix (if needed):

```sh
curl -L https://install.determinate.systems/nix | sh -s -- install
```

Bootstrap + apply nix-darwin (first time; will prompt for admin password):

```sh
nix --extra-experimental-features "nix-command flakes" \
  run github:nix-darwin/nix-darwin/nix-darwin-25.05 -- \
  switch --flake .#personal-mbp
```

Apply later changes:

```sh
darwin-rebuild switch --flake .#personal-mbp
```

## macOS (work-mbp / AHOUSTO-123)

Bootstrap + apply nix-darwin (first time; will prompt for admin password):

```sh
nix --extra-experimental-features "nix-command flakes" \
  run github:nix-darwin/nix-darwin/nix-darwin-25.05 -- \
  switch --flake .#work-mbp
```

Apply later changes:

```sh
darwin-rebuild switch --flake .#work-mbp
```

## Ubuntu Server (hogsmead)

Install Nix (daemon; will prompt for sudo):

```sh
curl -L https://install.determinate.systems/nix | sh -s -- install
```

Apply the host package set (installs Neovim + tmux into your user profile):

```sh
nix --extra-experimental-features "nix-command flakes" profile install .#hogsmead
```

Update after pulling changes to this repo:

```sh
nix profile remove hogsmead
nix --extra-experimental-features "nix-command flakes" profile install .#hogsmead
```
