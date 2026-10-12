# shellcheck shell=bash
# Tart hooks for the shared ../../guest/macos.sh, which sources this file in the guest. Cirrus Labs' base images
# give the admin user Homebrew and passwordless sudo.

engine_prepare() {
  # The base image's CI ~/.gitconfig (git-credential-manager, LFS) blocks the dotfiles' symlink; keep it aside.
  [ ! -f ~/.gitconfig ] || [ -L ~/.gitconfig ] || mv ~/.gitconfig ~/.gitconfig.base-image
}

# vm.sh provision streams VM_TAILSCALE_AUTHKEY over SSH's stdin into this private file, so the key is in neither
# side's process list.
engine_tailscale_authkey_file() { [ ! -f "$HOME/.tailscale-authkey" ] || echo "$HOME/.tailscale-authkey"; }
