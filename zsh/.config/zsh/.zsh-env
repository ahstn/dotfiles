# Intended for interative environments unlike ~/.zshenv

alias avim="NVIM_APPNAME=astronvim nvim"
export EDITOR="nvim"
export FZF_DEFAULT_OPTS='
  --height 40% 
  --tmux center,80%,40% 
  --layout reverse 
  --border 
  --highlight-line
  --style full 
  --input-label " Input "
  --color pointer:1,fg+:2,marker:2,bg+:8,prompt:4,info:3
'
export BUN_INSTALL="$HOME/.bun"

alias ll='eza --long --icons always --git --header --total-size'
alias tf='terraform'

function dc {
  if [ $# -lt 1 ]; then
    echo 'Usage: $FUNCNAME ARG [ARG ...]'
    return 1
  fi

  if [[ $1 == "krm" ]]; then
    docker-compose rm -sfv $2
  elif [[ $1 == "sh" ]]; then
    docker-compose exec $2 ${3:-bash}
  else
    echo '[dc]: no args matched, forwarding to docker-compose'
    docker-compose $@
  fi
}

function awz() {
  FZF_DEFAULT_OPTS="--border --height=20% --reverse --disabled --margin 0,50,0,0 --exit-0"
  items=("cas-qa" "cas-prod")
  profile=$(printf "%s\n" "${items[@]}" | fzf --prompt=" AWS Account:  " --border --exit-0)
  if [[ -z $profile ]]; then
    echo "Nothing selected"
    return 0
  fi

  echo "Refreshing SSO session if necessary"
  set +x
  aws sts get-caller-identity --profile aws-bv || aws sso login --profile aws-bv
  export {AWS_PROFILE,AWS_DEFAULT_PROFILE}=$profile
  set -x
}
