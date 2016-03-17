function fish_prompt
    set_color purple
    echo -n '┌─╼ '
    set_color white
    echo -n (whoami)

    echo -n ' ['
    set_color blue
    echo -n (prompt_pwd)
    set_color white
    echo -n ']'

    set_color purple
    echo -e '\n└────╼ '
end
