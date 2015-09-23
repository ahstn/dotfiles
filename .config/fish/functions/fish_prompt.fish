function fish_prompt
    set_color red
    echo -n '┌─╼'
    set_color white
    echo -n '[' (whoami) (pwd) ']'
    set_color red
    echo -e '\n└────╼ '
end
