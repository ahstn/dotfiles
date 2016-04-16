set fish_greeting

# Colored Man Pages
set -xU LESS_TERMCAP_mb (printf "\e[01;31m")      # begin blinking
set -xU LESS_TERMCAP_md (printf "\e[01;31m")      # begin bold
set -xU LESS_TERMCAP_me (printf "\e[0m")          # end mode
set -xU LESS_TERMCAP_se (printf "\e[0m")          # end standout-mode
set -xU LESS_TERMCAP_so (printf "\e[01;44;33m")   # begin standout-mode - info box
set -xU LESS_TERMCAP_ue (printf "\e[0m")          # end underline
set -xU LESS_TERMCAP_us (printf "\e[01;32m")      # begin underline

set -x TERM xterm-256color
set -x EDITOR vim
set -x LANG en_GB.UTF-8
set -x LC_CTYPE "en_GB.UTF-8"
set -x LC_MESSAGES "en_GB.UTF-8"
set -x LC_COLLATE C
#export LC_ALL=en_GB.utf8

# Aliases
function ..    ; cd .. ; end
function ...   ; cd ../.. ; end
    # Pipe with curl to format json in term
function jsonify ; python -mjson.tool ; end
    # Quick yaourt cmds for updating and listing installed aur packages
function update-aur ; yaourt -Syua --noconfirm ; end
function list-aur   ; yaourt -Qma ; end
