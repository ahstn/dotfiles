# Aliases and abbreviations.

if not status is-interactive
  exit
end

if command -sq eza
  alias ll='eza --long --icons always --git --header'
  alias la='eza --all --long --icons always --git --header'
  alias ls='eza --icons always'
else
  alias ll='ls -lh'
  alias la='ls -lah'
end

if command -sq bat
  alias cat='bat'
end

if command -sq rg
  alias grep='rg'
end
