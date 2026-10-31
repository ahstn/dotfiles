# Login shells only, read after .zshenv.
#
# macOS /etc/zprofile runs path_helper, which moves the system directories ahead of everything
# .zshenv added. Restore .zshenv's order; `typeset -U path` keeps path_helper's extra entries after it.
path=($_zshenv_path $path)
unset _zshenv_path
