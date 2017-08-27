# Uses zplug for plugins (https://github.com/zplug/zplug)
# curl -sL --proto-redir -all,https https://raw.githubusercontent.com/zplug/installer/master/installer.zsh | zsh

source ~/.zplug/init.zsh
zplug "lib/termsupport", from:oh-my-zsh, defer:0
zplug "lib/key-bindings", from:oh-my-zsh, defer:0
zplug "plugins/tmux", from:oh-my-zsh
zplug "plugins/colored-man-pages", from:oh-my-zsh
zplug "plugins/systemd", from:oh-my-zsh, if:"which systemctl"
zplug "Russell91/sshrc", from:github, as:command, use:"sshrc"
zplug "zsh-users/zsh-autosuggestions", defer:2
zplug "zsh-users/zsh-history-substring-search", defer:2
zplug "zsh-users/zsh-syntax-highlighting", defer:2
zplug "hcgraf/zsh-sudo"
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

export ZSH=/home/adam/.oh-my-zsh
export GOPATH=/home/adam/git/go
export GOBIN=$GOPATH/bin
export PATH=$GOBIN:$PATH
export EDITOR=vim
export ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE='fg=15'

zstyle ':completion:*:*:docker:*' option-stacking yes
zstyle ':completion:*:*:docker-*:*' option-stacking yes
zstyle ':completion:*:*:kill:*:processes' list-colors '=(#b) #([0-9]#) ([0-9a-z-]#)*=01;34=0=01'
zstyle ':completion:*:*:*:*:processes' command "ps -u $USER -o pid,user,comm -w -w"

bindkey  "^[[H"   beginning-of-line
bindkey  "^[[F"   end-of-line
bindkey "${terminfo[kcuu1]}" history-substring-search-up
bindkey "${terminfo[kcud1]}" history-substring-search-down

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
