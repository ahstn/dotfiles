# For non-interactive shells that don't read `~/.zshrc` 

export ZDOTDIR="$HOME/.config/zsh"

[[ -x /opt/homebrew/bin/brew ]] && eval "$(/opt/homebrew/bin/brew shellenv zsh)" && export PATH="/opt/homebrew/bin:$PATH"
[[ -x "$HOME/.local/bin/mise" ]] && eval "$("$HOME/.local/bin/mise" activate zsh)"
