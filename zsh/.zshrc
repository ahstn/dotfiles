# Install Zinit if missing - https://github.com/zdharma-continuum/zinit
[[ -d "$HOME/.local/share/zinit/zinit.git"  ]] || {
    curl -fsSL https://git.io/zinit-install | sh
}

source "$HOME/.local/share/zinit/zinit.git/zinit.zsh"
autoload -Uz _zinit
(( ${+_comps} )) && _comps[zinit]=_zinit

# Load a few important annexes, without Turbo
zinit light-mode for \
    zdharma-continuum/zinit-annex-as-monitor \
    zdharma-continuum/zinit-annex-bin-gem-node \
    zdharma-continuum/zinit-annex-patch-dl \
    zdharma-continuum/zinit-annex-rust

# Plugins
zinit for \
    light-mode  zsh-users/zsh-autosuggestions \
    light-mode  wfxr/forgit \
    light-mode  zdharma-continuum/zsh-diff-so-fancy \
    light-mode  zdharma-continuum/fast-syntax-highlighting

zplugin snippet OMZ::lib/key-bindings.zsh
zinit ice from"gh-r" as"program"; zinit load junegunn/fzf-bin
zinit ice as"command" from"gh-r" bpick"*aarch64-apple*" atload'!eval $(starship init zsh)'
zinit light starship/starship

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

# Aliases, Functions & Environment Variables
[ -f ~/.zsh-env ] && source ~/.zsh-env

# Private & Sensitive Values
[ -f ~/.zsh-private ] && source ~/.zsh-private

# FZF - Arch Linux uses /usr/share/fzf
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
[ -d /usr/share/fzf/ ] && source /usr/share/fzf/{key-bindings,completion}.zsh
