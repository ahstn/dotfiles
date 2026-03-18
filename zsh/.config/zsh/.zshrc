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
(( $+commands[fnm] )) && eval "$(fnm env --use-on-cd)"
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
(( $+functions[zcompile-many] )) && [[ ~/.zcompdump.zwc -nt ~/.zcompdump ]] || (( $+functions[zcompile-many] )) && zcompile-many ~/.zcompdump
(( $+functions[zcompile-many] )) && unfunction zcompile-many

# Tool-specific completions
(( $+commands[kubectl] )) && source <(kubectl completion zsh 2>/dev/null)
(( $+commands[docker] )) && source <(docker completion zsh 2>/dev/null)
(( $+commands[gh] )) && source <(gh completion -s zsh 2>/dev/null)
(( $+commands[mise] )) && source <(mise completion zsh 2>/dev/null)
(( $+commands[uv] )) && source <(uv generate-shell-completion zsh 2>/dev/null)

# Cargo completion via rustup when available
if (( $+commands[rustup] )) && (( $+commands[cargo] )); then
  source <(rustup completions zsh cargo 2>/dev/null)
fi

# npm does not provide native zsh completion; use bash completion bridge
if (( $+commands[npm] )); then
  autoload -Uz +X bashcompinit && bashcompinit
  source <(npm completion 2>/dev/null)
fi

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

# Plugin Configuration
ZSH_AUTOSUGGEST_MANUAL_REBIND=1
ZSH_AUTOSUGGEST_ACCEPT_WIDGETS=()
ZSH_AUTOSUGGEST_PARTIAL_ACCEPT_WIDGETS+=( forward-char forward-word end-of-line )
ZSH_AUTOSUGGEST_STRATEGY=( history )
ZSH_AUTOSUGGEST_HISTORY_IGNORE=$'(*\n*|?(#c80,)|*\\#:hist:push-line:)'
ZSH_HIGHLIGHT_HIGHLIGHTERS=( main brackets )

# Shell Configuration
SAVEHIST=10000
HISTFILE=~/.zsh_history
WORDCHARS=${WORDCHARS//[\/]}
setopt auto_cd
setopt share_history
setopt extended_history
setopt hist_ignore_all_dups
setopt hist_no_store
setopt complete_in_word
setopt always_to_end
setopt glob_dots
setopt no_auto_menu
setopt CORRECT
