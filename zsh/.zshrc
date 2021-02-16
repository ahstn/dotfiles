# Install Zinit if missing
# https://github.com/zdharma/zinit
[[ -d ~/.zinit ]] || {
    curl -fsSL https://raw.githubusercontent.com/zdharma/zinit/master/doc/install.sh | sh
}
source "$HOME/.zinit/bin/zinit.zsh"
autoload -Uz _zinit
(( ${+_comps} )) && _comps[zinit]=_zinit

# Plugins
zinit for \
    light-mode  zsh-users/zsh-autosuggestions \
    light-mode  wfxr/forgit \
    light-mode  zdharma/zsh-diff-so-fancy \
    light-mode  zdharma/fast-syntax-highlighting 

zplugin snippet OMZ::lib/key-bindings.zsh
zinit ice from"gh-r" as"program"; zinit load junegunn/fzf-bin
zplugin ice from"gh-r" as"program" atload'!eval $(starship init zsh)' pick'**/starship'
zplugin load starship/starship

# Shell Configuration
SAVEHIST=10000
HISTFILE=~/.zsh_history
setopt auto_cd                # If a dir is typed without cd, go there
setopt share_history          # Share history to multiple sessions
setopt extended_history       # Save timestamp of command and duration
setopt hist_ignore_all_dups   # Dont write duplicate entries to history
setopt hist_no_store          # Dont write the history command to history
setopt complete_in_word       # Allow completion from within a word
setopt always_to_end          # Move to the end of a word when completing
setopt glob_dots              # no special treatment for file names with a leading dot
setopt no_auto_menu           # require an extra TAB press to open the completion menu

# Environment Variables
export EDITOR="vim"
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_ALT_C_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_DEFAULT_OPTS='
  --height 30% --reverse
  --color pointer:1,fg+:2,marker:2,bg+:8,prompt:4,info:3
'
export GOROOT="${$(readlink /usr/bin/go)%/bin/go}"
export MAVEN_OPTS="-XX:+TieredCompilation -XX:TieredStopAtLevel=1 -XX:+UseParallelGC"

# Aliases
alias ll='ls -l'

# FZF - Arch Linux uses /usr/share/fzf
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
[ -d /usr/share/fzf/ ] && source /usr/share/fzf/{key-bindings,completion}.zsh

