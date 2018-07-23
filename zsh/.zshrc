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
zplug "zdharma/fast-syntax-highlighting"
zplug "chrissicool/zsh-256color"
zplug "mafredri/zsh-async", from:github
zplug "sindresorhus/pure", use:pure.zsh, from:github, as:theme
#zplug "denysdovhan/spaceship-prompt", use:spaceship.zsh, from:github, as:theme

zplug "junegunn/fzf-bin", from:gh-r, as:command, rename-to:fzf
zplug "supercrabtree/k", from:github, defer:2
zplug "wfxr/forgit", from:github, defer:1
zplug "so-fancy/diff-so-fancy", as:command, use:diff-so-fancy, rename-to:dsf
zplug check || zplug install
zplug load

SAVEHIST=1000
HISTFILE=~/.zsh_history
setopt auto_cd                # If a dir is typed without cd, go there
setopt append_history         # Allow multiple sessions to append to history
setopt extended_history       # Save timestamp of command and duration
setopt inc_append_history     # Dont wait for shell exit to add commands
setopt hist_ignore_all_dups   # Dont write duplicate entries to history
setopt hist_no_store          # Dont write the history command to history
setopt complete_in_word       # Allow completion from within a word
setopt always_to_end          # Move to the end of a word when completing

export JAVA_HOME='/usr/lib/jvm/jre-9'
export GOROOT="/usr/local/go"
export GOPATH="$HOME/go"
export GOBIN="$GOPATH/bin"
export BREWPATH="/home/linuxbrew/.linuxbrew/bin"
export PATH="$GOBIN:$GOROOT/bin:$BREWPATH:$PATH"
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
