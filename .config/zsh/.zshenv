# For non-interactive shells that don't read `~/.zshrc` 
#
# NB: writes to both ~/.config/zsh/.zshenv and ~/.zshenv to handle SSH sessions where ZDOTDIR is inherited

# XDG_CONFIG_HOME
export ZDOTDIR="$HOME/.config/zsh"

# Shared Cargo build caches
export CARGO_TARGET_DIR="$HOME/.cache/cargo/target/"
export CARGO_BUILD_BUILD_DIR="$HOME/.cache/cargo/build/"

[[ -x /opt/homebrew/bin/brew ]] && eval "$(/opt/homebrew/bin/brew shellenv zsh)" && export PATH="/opt/homebrew/bin:$PATH"
[[ -x "$HOME/.local/bin/mise" ]] && eval "$("$HOME/.local/bin/mise" activate zsh --shims)"
