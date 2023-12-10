sudo apt install neovim zsh git gcc make perl libfuse-dev 

sudo usermod -aG vboxsf $USER

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

curl -fsSL https://get.docker.com | sh

curl -fsSL --create-dirs -o ${ZIM_HOME}/zimfw.zsh \
        https://github.com/zimfw/zimfw/releases/latest/download/zimfw.zsh

curl -fsSL https://starship.rs/install.sh | sh

[ -f ~/.ssh/id_ed25519 ] && chmod 600 ~/.ssh/id_ed25519 && ssh-add ~/.ssh/id_ed25519
[ -f ~/github.gpg ] && gpg --import ~/github.gpg && gpg --list-secret-keys --keyid-format=long
