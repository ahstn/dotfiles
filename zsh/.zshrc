# Start configuration added by Zim install {{{

ZIM_HOME=${ZDOTDIR:-${HOME}}/.zim

# Download zimfw plugin manager if missing.
[[ -e ${ZIM_HOME}/zimfw.zsh ]] || {
  curl -fsSL --create-dirs -o ${ZIM_HOME}/zimfw.zsh \
      https://github.com/zimfw/zimfw/releases/latest/download/zimfw.zsh
}

# Install missing modules, and update ${ZIM_HOME}/init.zsh if missing or outdated.
if [[ ! ${ZIM_HOME}/init.zsh -nt ${ZDOTDIR:-${HOME}}/.zimrc ]]; then
  source ${ZIM_HOME}/zimfw.zsh init -q
fi

source ${ZIM_HOME}/init.zsh

zmodload -F zsh/terminfo +p:terminfo

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

eval "$(starship init zsh)"

# Aliases, Functions & Environment Variables
[ -f ~/.zsh-env ] && source ~/.zsh-env

# Private & Sensitive Values
[ -f ~/.zsh-private ] && source ~/.zsh-private

# FZF - Arch Linux uses /usr/share/fzf
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
