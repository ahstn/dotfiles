# PATH setup (idempotent).

# User bins first.
fish_add_path -g "$HOME/.local/bin" "$HOME/bin"

# Language/tooling bins.
fish_add_path -g "$HOME/.cargo/bin" "$HOME/.npm-global/bin"

# Common local installs.
fish_add_path -g "/usr/local/bin" "/usr/local/sbin" "/opt/homebrew/bin" "/opt/homebrew/sbin"
