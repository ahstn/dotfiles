# Login shells only, read after .zshenv.
#
# macOS /etc/zprofile runs path_helper, which moves the system directories ahead of everything
# .zshenv added. Put mise and Homebrew back in front; `typeset -U path` in .zshenv drops the old copies.
path=({"$HOME/.local/share/mise/shims","$HOME/.local/bin",/opt/homebrew/bin,/opt/homebrew/sbin}(N-/) $path)
