# Uses zplug for plugins (https://github.com/zplug/zplug)
# Will install zplug if missing
[[ -d ~/.zplug ]] || {
  url='https://raw.githubusercontent.com/zplug/installer/master/installer.zsh'
  curl -sL --proto-redir -all,https $url | zsh
  source ~/.zplug/init.zsh && zplug update
}

source ~/.zplug/init.zsh
zplug "lib/termsupport", from:oh-my-zsh, defer:0
zplug "lib/key-bindings", from:oh-my-zsh, defer:0
zplug "plugins/tmux", from:oh-my-zsh
zplug "zsh-users/zsh-autosuggestions", defer:2
zplug "zsh-users/zsh-history-substring-search", defer:2
zplug "zsh-users/zsh-syntax-highlighting", defer:2
zplug "chrissicool/zsh-256color"
zplug "junegunn/fzf-bin", from:gh-r, as:command, rename-to:fzf
zplug "mafredri/zsh-async", from:github
zplug "sindresorhus/pure", from:github, use:pure.zsh, as:theme

zplug check || zplug install
zplug load

SAVEHIST=1000
HISTFILE=~/.zsh_history
setopt auto_cd                # If a dir is typed without cd, go there
setopt append_history         # Allow multiple sessions to append to history
setopt extended_history       # Save timestamp of command and duration
setopt inc_append_history     # Don't wait for shell exit to add commands
setopt hist_ignore_all_dups   # Don't write duplicate entries to history
setopt hist_no_store          # Don't write the history command to history
setopt complete_in_word       # Allow completion from within a word
setopt always_to_end          # Move to the end of a word when completing

export ZSH="$HOME/.oh-my-zsh"
export GOPATH="$HOME/go"
export GOBIN="$GOPATH/bin"
export PATH="$GOBIN:$PATH"
export EDITOR='vim'

export ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE='fg=15'
export FZF_DEFAULT_COMMAND='rg --files --hidden --glob "!.git/*"'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_ALT_C_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_DEFAULT_OPTS='
  --height 30% --reverse 
  --color pointer:1,fg+:2,marker:2,bg+:8,prompt:4,info:3
'

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
