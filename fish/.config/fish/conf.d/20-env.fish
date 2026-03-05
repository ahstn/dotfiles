# Common environment variables.

# XDG base dirs (keep defaults if already set).
set -q XDG_CONFIG_HOME; or set -gx XDG_CONFIG_HOME "$HOME/.config"
set -q XDG_CACHE_HOME;  or set -gx XDG_CACHE_HOME  "$HOME/.cache"
set -q XDG_DATA_HOME;   or set -gx XDG_DATA_HOME   "$HOME/.local/share"
set -q XDG_STATE_HOME;  or set -gx XDG_STATE_HOME  "$HOME/.local/state"

# Editors/pagers.
set -q EDITOR; or set -gx EDITOR nvim
set -q VISUAL; or set -gx VISUAL $EDITOR
set -q PAGER;  or set -gx PAGER less
set -q LESS;   or set -gx LESS "-FRSX"

# CLI defaults.
set -q HOMEBREW_NO_ANALYTICS; or set -gx HOMEBREW_NO_ANALYTICS 1

if status is-interactive
  if command -sq tty
    set -gx GPG_TTY (tty)
  end
end
