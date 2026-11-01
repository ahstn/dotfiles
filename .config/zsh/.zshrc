# Fallback for when .zshrc is sourced without .zshenv having run; also used by .zsh-plugins.
: ${ZDOTDIR:=$HOME/.config/zsh}

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

# Completion search paths (Homebrew's site-functions is added by `brew shellenv` in .zshenv)
[[ -d /usr/local/share/zsh/site-functions ]] && fpath=(/usr/local/share/zsh/site-functions $fpath)
[[ -d "$HOME/.local/share/zsh/site-functions" ]] && fpath=("$HOME/.local/share/zsh/site-functions" $fpath)
_zsh_completions="${XDG_CACHE_HOME:-$HOME/.cache}/zsh/completions"
fpath=("$_zsh_completions" $fpath)

# Enable the completion system before mise: its hook-env runs a second `compinit -i` (with the default dump) if compdef is missing.
# NB: one dump per zsh version: /bin/zsh and Homebrew's zsh otherwise rebuild each other's dump on every switch.
_zcompdump="${ZDOTDIR}/.zcompdump-${ZSH_VERSION}"
autoload -Uz compinit && compinit -d "$_zcompdump"
if (( $+functions[zcompile-many] )) && [[ ! "$_zcompdump.zwc" -nt "$_zcompdump" ]]; then
  zcompile-many "$_zcompdump"
fi
(( $+functions[zcompile-many] )) && unfunction zcompile-many
unset _zcompdump

# Full mise activation (enter hooks, [env], shell aliases); .zshenv only adds shims for non-interactive shells.
(( $+commands[mise] )) && eval "$(mise activate zsh)"

(( $+commands[zoxide] )) && eval "$(zoxide init zsh)"
(( $+commands[starship] )) && eval "$(starship init zsh)"
(( $+commands[fzf] )) && source <(fzf --zsh)

# Generated completions, cached in $_zsh_completions and regenerated when the tool's binary changes (e.g. an upgrade).
# The cache key is the resolved path plus mtime, so in-place upgrades (standalone uv, system kubectl) also refresh.
# Runs after mise activation so binaries resolve to their install paths rather than mise's shims.
# NB: a regenerated file is read on first completion; a new one is only in the next shell's dump, so compdef it now.
() {
  local name bin key file
  zmodload -F zsh/stat b:zstat  # zstat only: the module's `stat` builtin would shadow /usr/bin/stat
  local -A gens=(
    kubectl 'kubectl completion zsh'
    docker  'docker completion zsh'
    gh      'gh completion -s zsh'
    mise    'mise completion zsh'
    uv      'uv generate-shell-completion zsh'
  )
  [[ -d $_zsh_completions ]] || mkdir -p "$_zsh_completions"
  for name in ${(k)gens}; do
    bin=${commands[$name]:A}
    file="$_zsh_completions/_$name"
    [[ -n $bin ]] && key="$bin $(zstat +mtime -- $bin 2>/dev/null)" || continue
    [[ -s $file && "$(<$file.src)" == $key ]] 2>/dev/null && continue
    if eval "${gens[$name]}" >| $file.tmp 2>/dev/null && [[ -s $file.tmp ]]; then
      mv -f $file.tmp $file && print -r -- $key >| $file.src
      (( $+_comps[$name] )) || { autoload -Uz _$name && compdef _$name $name; }
    else
      rm -f $file.tmp
    fi
  done
}
unset _zsh_completions

# Bun registers its completion with compinit; source it after compinit so it
# does not initialize the completion system a second time.
# NB: keep the literal `$HOME/.bun/_bun` here: `bun completions` (also run by `bun upgrade`)
# skips appending its own copy to this file only when it finds `/.bun/_bun`.
[[ -s "$HOME/.bun/_bun" ]] && source "$HOME/.bun/_bun"

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
setopt hist_find_no_dups       # Skip duplicates while searching history (share_history can import them)

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
