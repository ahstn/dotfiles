# Load ZI if it exists, if not then install it. 
# https://github.com/z-shell/zi/
[[ -r "${XDG_CONFIG_HOME:-$HOME/.config}/zi/init.zsh" ]] && {
  source "${XDG_CONFIG_HOME:-$HOME/.config}/zi/init.zsh" && zzinit
} || {
  sh -c "$(curl -fsSL https://git.io/get-zi)" -- -a annex
}

zi light-mode for z-shell/z-a-meta-plugins @annexes

zi wait lucid light-mode for \
  atinit"zicompinit; zicdreplay" \
    z-shell/F-Sy-H \
  atload"_zsh_autosuggest_start" \
    zsh-users/zsh-autosuggestions \
  blockf atpull'zi creinstall -q .' \
    zsh-users/zsh-completions

# GitHub Release Plugin Loading
zi as'null' wait'2' from'gh-r' for \
  sbin'fzf' junegunn/fzf \
  sbin'**/fd' @sharkdp/fd \
  sbin'**/bat' @sharkdp/bat \
  sbin'**/exa -> exa' ogham/exa \
  atload'eval "$(starship init zsh)"' starship/starship

# Generic GitHub Plugin Loading
zi for as'program' \
  pick'bin/git-dsf' z-shell/zsh-diff-so-fancy \
  wfxr/forgit

# Plugin Configuration
ZSH_AUTOSUGGEST_MANUAL_REBIND=1
ZSH_HIGHLIGHT_HIGHLIGHTERS=(main brackets)

# Shell Configuration
SAVEHIST=10000
HISTFILE=~/.zsh_history
WORDCHARS=${WORDCHARS//[\/]}  # Remove path separator from WORDCHARS
setopt auto_cd                # If a dir is typed without cd, go there
setopt share_history          # Share history to multiple sessions
setopt extended_history       # Save timestamp of command and duration
setopt hist_ignore_all_dups   # Dont write duplicate entries to history
setopt hist_no_store          # Dont write the history command to history
setopt complete_in_word       # Allow completion from within a word
setopt always_to_end          # Move to the end of a word when completing
setopt glob_dots              # no special treatment for file names with a leading dot
setopt no_auto_menu           # require an extra TAB press to open the completion menu
setopt CORRECT                # Prompt for spelling correction of commands.
bindkey -e                    # Set editor default keymap to emacs (`-e`) or vi (`-v`)

# Aliases, Functions & Environment Variables
[ -f ~/.zsh-env ] && source ~/.zsh-env

# Private & Sensitive Values
[ -f ~/.zsh-private ] && source ~/.zsh-private

# FZF - Arch Linux uses /usr/share/fzf
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
