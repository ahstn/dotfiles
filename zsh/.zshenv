# For non-interactive shells that don't read `~/.zshrc` 

export ZDOTDIR="$HOME/.config/zsh"

export PATH="/opt/homebrew/sbin:$PATH"
export PATH="/opt/homebrew/bin:$PATH"
[ -x "$HOME/.local/bin/mise" ] && eval "$("$HOME/.local/bin/mise" activate zsh)"
