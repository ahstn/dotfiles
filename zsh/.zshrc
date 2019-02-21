# Uses zplugin for plugins (https://github.com/zdharma/zplugin)

# Install zplugin if missing
[[ -d ~/.zplugin ]] || {
  url='https://raw.githubusercontent.com/zdharma/zplugin/master/doc/install.sh'
  curl -fsSL $url | sh
  source ~/.zplugin/bin/zplugin.zsh
}

autoload -Uz _zplugin
source ~/.zplugin/bin/zplugin.zsh
(( ${+_comps} )) && _comps[zplugin]=_zplugin

zplugin snippet OMZ::lib/key-bindings.zsh
zplugin snippet OMZ::plugins/git/git.plugin.zsh
zplugin snippet OMZ::plugins/tmux/tmux.plugin.zsh

zplugin light zsh-users/zsh-autosuggestions
zplugin light zdharma/fast-syntax-highlighting
zplugin light chrissicool/zsh-256color
zplugin light wfxr/forgit
zplugin light zdharma/zsh-diff-so-fancy

zplugin ice pick"async.zsh" src"pure.zsh"; zplugin light sindresorhus/pure
zplugin ice from"gh-r" as"program"; zplugin load junegunn/fzf-bin
zplugin ice wait"2" lucid as"program" pick"bin/git-dsf"
zplugin light zdharma/zsh-diff-so-fancy

zplugin ice blockf
zplugin light zsh-users/zsh-completions

SAVEHIST=10000
HISTFILE=~/.zsh_history
setopt auto_cd                # If a dir is typed without cd, go there
setopt share_history          # Share history to multiple sessions
setopt extended_history       # Save timestamp of command and duration
setopt hist_ignore_all_dups   # Dont write duplicate entries to history
setopt hist_no_store          # Dont write the history command to history
setopt complete_in_word       # Allow completion from within a word
setopt always_to_end          # Move to the end of a word when completing

export JAVA_HOME='/usr/lib/jvm/jre-9'
export GOROOT="/usr/local/go"
export GOPATH="$HOME/go"
export GOBIN="$GOPATH/bin"
export BREWPATH="/home/linuxbrew/.linuxbrew/bin"
export PATH="$GOBIN:$GOROOT/bin:$BREWPATH:/home/ahstn/.jx/bin:/home/ahstn/bin:$PATH"
export EDITOR='nvim'

export ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE='fg=15'
export FZF_DEFAULT_COMMAND='rg --files --hidden --glob "!.git/*"'
export FZF_CTRL_T_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_ALT_C_COMMAND="$FZF_DEFAULT_COMMAND"
export FZF_DEFAULT_OPTS='
  --height 30% --reverse
  --color pointer:1,fg+:2,marker:2,bg+:8,prompt:4,info:3
'

function mvp { mvn "$@" | mvnp -t -e -n; }
function dsh { docker exec -it "$@" /bin/bash; }
function dps { docker ps "$@" --format "{{.ID}}\t{{.Status}}\t{{.Image}}\t"; }
function drm { docker rm $(docker ps -aqf status=exited); }

[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
