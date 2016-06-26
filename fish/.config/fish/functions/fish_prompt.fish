function fish_prompt
    set_color purple
    printf '┌─╼ '
    set_color white
    printf '%s' (whoami)

    echo -n ' ['
    set_color blue
    printf '%s' (prompt_pwd)
    set_color white
    printf ']'

    set_color purple
    printf '\n└────╼ '
end
