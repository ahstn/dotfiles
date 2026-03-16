# Interactive tooling initialization.

if not status is-interactive
  exit
end

if command -sq zoxide
  zoxide init fish | source
end

# forgit (Homebrew install): load fish plugin functions/aliases.
set -l _forgit_share_dirs
if set -q HOMEBREW_PREFIX
  set _forgit_share_dirs "$HOMEBREW_PREFIX/share/forgit"
end
set -a _forgit_share_dirs "/opt/homebrew/share/forgit" "/usr/local/share/forgit"
for _forgit_dir in $_forgit_share_dirs
  if test -f "$_forgit_dir/forgit.plugin.fish"
    source "$_forgit_dir/forgit.plugin.fish"
    break
  end
end

if command -sq mise
  mise activate fish | source
end

if command -sq pitchfork
  pitchfork activate fish | source
end

if command -sq starship
  starship init fish | source
end

if command -sq tv
  tv init fish | source
end
