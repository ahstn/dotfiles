# Uses zplug for plugins (https://github.com/zplug/zplug)
# curl -sL --proto-redir -all,https https://raw.githubusercontent.com/zplug/installer/master/installer.zsh | zsh

export ZSH=/home/adam/.oh-my-zsh
export GOPATH=/home/adam/git/go
export GOBIN=$GOPATH/bin
export PATH=$GOBIN:$PATH
export EDITOR=vim

SAVEHIST=1000
HISTFILE=~/.zsh_history

source ~/.zplug/init.zsh

zplug "zsh-users/zsh-autosuggestions"
zplug "zsh-users/zsh-syntax-highlighting", defer:2
zplug "hcgraf/zsh-sudo"
zplug "chrissicool/zsh-256color"
zplug "zsh-users/zsh-history-substring-search"
zplug "junegunn/fzf-bin", from:gh-r, as:command, rename-to:fzf
zplug "mafredri/zsh-async", from:github
zplug "sindresorhus/pure", from:github, use:pure.zsh, as:theme
zplug check || zplug install
zplug load

zstyle ':completion:*:*:docker:*' option-stacking yes
zstyle ':completion:*:*:docker-*:*' option-stacking yes

bindkey "${terminfo[khome]}" beginning-of-line
bindkey "${terminfo[kend]}" end-of-line
bindkey "${terminfo[kcuu1]}" history-substring-search-up
bindkey "${terminfo[kcud1]}" history-substring-search-down

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
