"
"   .vimrc
"       - Arch Linux (Terminator)
"       - using NeoBundle
"

if has('vim_starting')
    if &compatible
        set nocompatible    " Be iMproved
    endif
    set runtimepath+=~/.vim/bundle/neobundle.vim/
endif

"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> NeoBundle

call neobundle#begin(expand('~/.vim/bundle/'))
NeoBundleFetch 'Shougo/neobundle.vim'
                            " General
NeoBundle 'scrooloose/nerdtree'
NeoBundle 'kien/ctrlp.vim'
NeoBundle 'bling/vim-airline'
NeoBundle 'easymotion/vim-easymotion'
NeoBundle 'Valloric/YouCompleteMe'
NeoBundle 'mattn/emmet-vim'
NeoBundle 'Shougo/neocomplete.vim'
                            " Web Development
NeoBundle 'jelera/vim-javascript-syntax'
NeoBundle 'walm/jshint.vim'
NeoBundle 'moll/vim-node'
NeoBundle 'lilydjwg/colorizer'

call neobundle#end()
NeoBundleCheck              " Prompt for uninstalled bundles

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Visuals
syntax on
set background=dark
colorscheme material-adam   " Color Scheme
set t_Co=256
set showmode 			    " Show Current Mode
set showcmd			        " Show Cmds You're Typing
set ruler			        " Show Current Line and Col
set title			        " Show File Title in Terminal Tab
set number                  " Show Line Numbers
set cursorline			    " Highlight Current Line

if exists("+colorcolumn")
	set colorcolumn=81	    " Limit line length to 80
endif

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Tabs
filetype plugin indent on
set expandtab               " 4 spaces please
set shiftwidth=4
set tabstop=4
set softtabstop=4
set shiftround
set nowrap 			        " No Line Wrapping

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Spliting
set splitbelow              " hoz split goes down
set splitright              " vert split goes right
                            " Switch panes with Ctrl + hjkl
map <C-h> <C-w>h
map <C-j> <C-w>j
map <C-k> <C-w>k
map <C-l> <C-w>l

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Moving Lines
                            " Move line(s) up with Alt + j
execute "set <M-j>=\ej"
nnoremap <A-j> :m+<CR>==
inoremap <A-j> <Esc>:m .+1<CR>==gi
vnoremap <A-j> :m '>+1<CR>gv=gv
                            " Move line(s) down with Alt + k
execute "set <M-k>=\ek"
nnoremap <A-k> :m .-2<CR>==
inoremap <A-k> <Esc>:m .-2<CR>==gi
vnoremap <A-k> :m '<-2<CR>gv=gv

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Navigating Splits
nnoremap <C-J> <C-W><C-J>
nnoremap <C-K> <C-W><C-K>
nnoremap <C-L> <C-W><C-L>
nnoremap <C-H> <C-W><C-H>

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Plugin Mappings
nnoremap <C-\> :NERDTreeToggle<CR>
set laststatus=2            " Force airline to display

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
