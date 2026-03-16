# Generated dynamically from forgit install to avoid stale vendored files.

set -l _forgit_share_dirs
if set -q HOMEBREW_PREFIX
  set _forgit_share_dirs "$HOMEBREW_PREFIX/share/forgit"
end
set -a _forgit_share_dirs "/opt/homebrew/share/forgit" "/usr/local/share/forgit"

for _forgit_dir in $_forgit_share_dirs
  if test -f "$_forgit_dir/completions/git-forgit.fish"
    source "$_forgit_dir/completions/git-forgit.fish"
    break
  end
end
