# PATH setup (idempotent).

# User bins first.
fish_add_path -g "$HOME/.local/bin" "$HOME/bin"

# Language/tooling bins.
fish_add_path -g "$HOME/.cargo/bin" "$HOME/.npm-global/bin" "$HOME/.bun/bin"

# Common local installs.
fish_add_path -g "/usr/local/bin" "/usr/local/sbin" "/opt/homebrew/bin" "/opt/homebrew/sbin"

# Ensure mise-managed shims win over Homebrew binaries when both exist.
set -l mise_data_dir "$HOME/.local/share/mise"
if set -q MISE_DATA_DIR
  set mise_data_dir "$MISE_DATA_DIR"
end
fish_add_path -g --move "$mise_data_dir/shims"
