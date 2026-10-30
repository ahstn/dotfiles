# For non-interactive shells that don't read `~/.zshrc`
#
# NB: writes to both ~/.config/zsh/.zshenv and ~/.zshenv to handle SSH sessions where ZDOTDIR is inherited

# XDG_CONFIG_HOME
export ZDOTDIR="$HOME/.config/zsh"

# Drop duplicate entries, including those inherited from a parent shell's exported PATH/FPATH.
# NB: only array assignments dedupe, so `path=($path)` at the end cleans up brew/mise's `export PATH=`.
typeset -U path fpath

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

# Respect an editor set by the caller (e.g. `code --wait`).
export EDITOR="${EDITOR:-nvim}"
export VISUAL="${VISUAL:-$EDITOR}"

# Shared Cargo build caches
export CARGO_TARGET_DIR="$HOME/.cache/cargo/target/"
export CARGO_BUILD_BUILD_DIR="$HOME/.cache/cargo/build/"

if [[ -x /opt/homebrew/bin/brew ]]; then
    export HOMEBREW_CASK_OPTS="--appdir=${HOME}/Applications"
    eval "$(/opt/homebrew/bin/brew shellenv zsh)"
elif [[ -d /opt/homebrew/bin ]]; then
    # Formulae that mise bootstrap installed without Homebrew itself (e.g. VM guests), which get no mise shims.
    export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
fi

# Added before mise so mise's shims take precedence for bun and opencode themselves.
# - ~/.bun/bin: global `bun add -g` binaries.
# - ~/.opencode/bin: Ghostex CLI wrappers (gx, ghostex). Having it on PATH also stops opencode's installer appending it to .zshrc.
export BUN_INSTALL="$HOME/.bun"
path=({"$BUN_INSTALL","$HOME/.opencode"}/bin(N-/) $path)

for mise_bin in "$HOME/.local/bin/mise" /opt/homebrew/bin/mise; do
    if [[ -x "$mise_bin" ]]; then
        eval "$("$mise_bin" activate zsh --shims)"
        break
    fi
done
unset mise_bin

path=($path)
# Snapshot for .zprofile to restore after macOS path_helper reorders PATH in login shells.
_zshenv_path=($path)
