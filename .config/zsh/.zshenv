# For non-interactive shells that don't read `~/.zshrc` 
#
# NB: writes to both ~/.config/zsh/.zshenv and ~/.zshenv to handle SSH sessions where ZDOTDIR is inherited

# XDG_CONFIG_HOME
export ZDOTDIR="$HOME/.config/zsh"

# Fall back to a private directory if TMPDIR cannot create temporary directories.
() {
    local probe
    if probe=$(mktemp -d "${TMPDIR:-/tmp}/.zsh-tmp-check.XXXXXXXXXX" 2>/dev/null); then
        rmdir "$probe"
        return
    fi

    if mkdir -p -m 700 "$HOME/tmp" 2>/dev/null &&
        probe=$(mktemp -d "$HOME/tmp/.zsh-tmp-check.XXXXXXXXXX" 2>/dev/null); then
        rmdir "$probe"
        export TMPDIR="$HOME/tmp"
    fi
}

# Shared Cargo build caches
export CARGO_TARGET_DIR="$HOME/.cache/cargo/target/"
export CARGO_BUILD_BUILD_DIR="$HOME/.cache/cargo/build/"

if [[ -x /opt/homebrew/bin/brew ]]; then
    export HOMEBREW_CASK_OPTS="--appdir=${HOME}/Applications"
    export PATH="/opt/homebrew/bin:$PATH"
    eval "$(/opt/homebrew/bin/brew shellenv zsh)" 
fi
[[ -x "$HOME/.local/bin/mise" ]] && eval "$("$HOME/.local/bin/mise" activate zsh --shims)"
