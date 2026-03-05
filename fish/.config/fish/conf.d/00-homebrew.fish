# Ensure Homebrew env is available in fish.

if test -x /opt/homebrew/bin/brew
  /opt/homebrew/bin/brew shellenv | source
end
