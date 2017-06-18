export ZSH=/home/adam/.oh-my-zsh
export GOPATH=/home/adam/git/go
export GOBIN=$GOPATH/bin
export PATH=$GOPATH:$PATH
export EDITOR=vim

ZSH_THEME="robbyrussell"
ENABLE_CORRECTION="true"
COMPLETION_WAITING_DOTS="true"

plugins=(git zsh)

source $ZSH/oh-my-zsh.sh
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
