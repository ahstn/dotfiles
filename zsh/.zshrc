# Uses antibody for plugins (https://github.com/getantibody/antibody)
# curl -sL https://git.io/antibody | bash -s

export ZSH=/home/adam/.oh-my-zsh
export GOPATH=/home/adam/git/go
export GOBIN=$GOPATH/bin
export PATH=$GOBIN:$PATH
export EDITOR=vim

SAVEHIST=1000
HISTFILE=~/.zsh_history

source <(antibody init)

antibody bundle mafredri/zsh-async
antibody bundle sindresorhus/pure
antibody bundle zsh-users/zsh-autosuggestions
antibody bundle zsh-users/zsh-syntax-highlighting
antibody bundle hcgraf/zsh-sudo
antibody bundle chrissicool/zsh-256color

zstyle ':completion:*:*:docker:*' option-stacking yes
zstyle ':completion:*:*:docker-*:*' option-stacking yes

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
