# Select emacs keymap before anything binds keys: EDITOR=nvim (from .zshenv) makes zsh start in viins.
bindkey -e

# Plugins
[[ -r "${ZDOTDIR}/.zsh-plugins" ]] && source "${ZDOTDIR}/.zsh-plugins"

# Aliases, Functions & Environment Variables
[[ -r "${ZDOTDIR}/.zsh-interactive-env.sh" ]] && source "${ZDOTDIR}/.zsh-interactive-env.sh"

# Private & Sensitive Values: fnox resolves them from 1Password (~/.config/fnox/config.toml).
# If missing, load from ~/.config/zsh/.zsh-private until we migrate all hosts
if (( $+commands[op] )) && (( $+commands[fnox] )); then
  eval "$(fnox activate zsh)" && _fnox_hook
else
  [[ -r "${ZDOTDIR}/.zsh-private" ]] && source "${ZDOTDIR}/.zsh-private"
fi

(( $+commands[zoxide] )) && eval "$(zoxide init zsh)"
(( $+commands[starship] )) && eval "$(starship init zsh)"
(( $+commands[fzf] )) && source <(fzf --zsh)

# Completion search paths (Homebrew's site-functions is added by `brew shellenv` in .zshenv)
[[ -d /usr/local/share/zsh/site-functions ]] && fpath=(/usr/local/share/zsh/site-functions $fpath)
[[ -d "$HOME/.local/share/zsh/site-functions" ]] && fpath=("$HOME/.local/share/zsh/site-functions" $fpath)

# Enable the completion system after PATH/fpath setup
autoload -Uz compinit && compinit -d "${ZDOTDIR}/.zcompdump"
if (( $+functions[zcompile-many] )) && [[ ! "${ZDOTDIR}/.zcompdump.zwc" -nt "${ZDOTDIR}/.zcompdump" ]]; then
  zcompile-many "${ZDOTDIR}/.zcompdump"
fi
(( $+functions[zcompile-many] )) && unfunction zcompile-many

# Bun registers its completion with compinit; source it after compinit so it
# does not initialize the completion system a second time.
# NB: keep the literal `$HOME/.bun/_bun` here: `bun completions` (also run by `bun upgrade`)
# skips appending its own copy to this file only when it finds `/.bun/_bun`.
[[ -s "$HOME/.bun/_bun" ]] && source "$HOME/.bun/_bun"

# Tool-specific completions
(( $+commands[kubectl] )) && source <(kubectl completion zsh 2>/dev/null)
(( $+commands[docker] )) && source <(docker completion zsh 2>/dev/null)
(( $+commands[gh] )) && source <(gh completion -s zsh 2>/dev/null)
(( $+commands[mise] )) && source <(mise completion zsh 2>/dev/null)
(( $+commands[uv] )) && source <(uv generate-shell-completion zsh 2>/dev/null)

# Bind ^[[A/^[[B manually so up/down works both before and after zle-line-init
# NB: run `cat` then press keys to see shortcodes :)
for key ("\e[1;3D" "^[b") bindkey  ${key} backward-word    # ⌥←
for key ("\e[1;3C" "^[f") bindkey  ${key} forward-word     # ⌥→
bindkey "^[[1;9D" beginning-of-line # cmd+←
bindkey "^[[1;9C" end-of-line       # cmd+→
unset key

# Shell Configuration
HISTSIZE=10000                 # Keep as many entries in memory as on disk (macOS /etc/zshrc sets 2000)
SAVEHIST=10000
HISTFILE=~/.zsh_history
WORDCHARS=${WORDCHARS//[\/]}

# History
setopt share_history           # Share history across running shell sessions (implies appending)
setopt extended_history        # Save timestamp and command duration in history
setopt hist_ignore_all_dups    # Remove older duplicate commands from history
setopt hist_no_store           # Do not store the `history` command itself
setopt hist_ignore_space       # Do not record commands prefixed with a space
setopt hist_reduce_blanks      # Trim superfluous blanks from each history entry
setopt hist_verify             # Show history-expanded command before execution

# Navigation
setopt auto_cd                 # Change to a directory by typing its path directly
setopt auto_pushd              # Push previous directory onto stack on every `cd`
setopt pushd_ignore_dups       # Do not store duplicate directories in the stack
setopt pushd_silent            # Suppress pushd/popd directory stack output

# Completion/Globbing/Editing behavior
setopt complete_in_word        # Allow completion from the cursor position within a word
setopt always_to_end           # Move cursor to end of completed word
setopt glob_dots               # Include dotfiles in pathname expansion (globbing)
setopt no_auto_menu            # Require an extra TAB to open completion menu
setopt CORRECT                 # Prompt to correct mistyped commands
