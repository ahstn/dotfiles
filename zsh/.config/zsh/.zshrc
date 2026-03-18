ZSH_HOME="${HOME}/.config/zsh"

# Plugins
[[ -r "${ZSH_HOME}/.zsh-plugins" ]] && source "${ZSH_HOME}/.zsh-plugins"

# Aliases, Functions & Environment Variables
[[ -r "${ZSH_HOME}/.zsh-env" ]] && source "${ZSH_HOME}/.zsh-env"

# Private & Sensitive Values
[[ -r "${ZSH_HOME}/.zsh-private" ]] && source "${ZSH_HOME}/.zsh-private"

# Tool/runtime environment first (before completion init)
if (( $+commands[mise] )); then
  eval "$(mise activate zsh)"
  [[ -r "$HOME/.local/bin/env" ]] && source "$HOME/.local/bin/env"
fi

(( $+commands[brew] )) && eval "$(brew shellenv zsh)"
(( $+commands[zoxide] )) && eval "$(zoxide init zsh)"
(( $+commands[wt] )) && eval "$(wt config shell init zsh)"
[[ -r ~/.fzf.zsh ]] && source ~/.fzf.zsh
[[ -r ~/.cargo/env ]] && source ~/.cargo/env
[[ -d ~/.opencode ]] && export PATH="$HOME/.opencode/bin:$PATH"
[[ -s "$HOME/.bun/_bun" ]] && source "$HOME/.bun/_bun" && export PATH="$BUN_INSTALL/bin:$PATH"

# Completion search paths
[[ -d /opt/homebrew/share/zsh/site-functions ]] && fpath=(/opt/homebrew/share/zsh/site-functions $fpath)
[[ -d /usr/local/share/zsh/site-functions ]] && fpath=(/usr/local/share/zsh/site-functions $fpath)
[[ -d "$HOME/.local/share/zsh/site-functions" ]] && fpath=("$HOME/.local/share/zsh/site-functions" $fpath)


# Enable the completion system after PATH/fpath setup
autoload -Uz compinit && compinit
if (( $+functions[zcompile-many] )) && [[ ! ~/.zcompdump.zwc -nt ~/.zcompdump ]]; then
  zcompile-many ~/.zcompdump
fi
(( $+functions[zcompile-many] )) && unfunction zcompile-many

# Tool-specific completions
(( $+commands[kubectl] )) && source <(kubectl completion zsh 2>/dev/null)
(( $+commands[docker] )) && source <(docker completion zsh 2>/dev/null)
(( $+commands[gh] )) && source <(gh completion -s zsh 2>/dev/null)
(( $+commands[mise] )) && source <(mise completion zsh 2>/dev/null)
(( $+commands[uv] )) && source <(uv generate-shell-completion zsh 2>/dev/null)

# Bind ^[[A/^[[B manually so up/down works both before and after zle-line-init
# NB: run `cat` then press keys to see shortcodes :)
for key ('^[[A' '^P' ${terminfo[kcuu1]}) bindkey ${key} history-substring-search-up
for key ('^[[B' '^N' ${terminfo[kcud1]}) bindkey ${key} history-substring-search-down
for key ('k') bindkey -M vicmd ${key} history-substring-search-up
for key ('j') bindkey -M vicmd ${key} history-substring-search-down
for key ('[C' "\e[1;3D" "^[b") bindkey  ${key} backward-word    # ⌥←
for key ('[D' "\e[1;3C" "^[f") bindkey  ${key} forward-word     # ⌥→
bindkey "^[[1;9D" beginning-of-line # cmd+←
bindkey "^[[1;9C" end-of-line       # cmd+→
unset key

# Shell Configuration
SAVEHIST=10000
HISTFILE=~/.zsh_history
WORDCHARS=${WORDCHARS//[\/]}

# History
setopt append_history          # Append history to file instead of overwriting on shell exit
setopt share_history           # Share history across running shell sessions
setopt extended_history        # Save timestamp and command duration in history
setopt hist_ignore_all_dups    # Remove older duplicate commands from history
setopt hist_no_store           # Do not store the `history` command itself
setopt hist_ignore_space       # Do not record commands prefixed with a space
setopt hist_reduce_blanks      # Trim superfluous blanks from each history entry
setopt hist_verify             # Show history-expanded command before execution
setopt hist_expire_dups_first  # Expire duplicate history entries before unique ones
setopt hist_find_no_dups       # Skip duplicates while searching history

# Navigation
setopt auto_cd                 # Change to a directory by typing its path directly
setopt auto_pushd              # Push previous directory onto stack on every `cd`
setopt pushd_ignore_dups       # Do not store duplicate directories in the stack
setopt pushd_silent            # Suppress pushd/popd directory stack output
setopt auto_list               # Automatically list choices after an ambiguous completion

# Completion/Globbing/Editing behavior
setopt complete_in_word        # Allow completion from the cursor position within a word
setopt always_to_end           # Move cursor to end of completed word
setopt glob_dots               # Include dotfiles in pathname expansion (globbing)
setopt no_auto_menu            # Require an extra TAB to open completion menu
setopt CORRECT                 # Prompt to correct mistyped commands
