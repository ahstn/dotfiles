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
                            " Interface
NeoBundle 'scrooloose/nerdtree'
NeoBundle 'kien/ctrlp.vim'
NeoBundle 'bling/vim-airline'
NeoBundle 'vim-airline/vim-airline-themes'
NeoBundle 'tpope/vim-fugitive'
NeoBundle 'Yggdroot/indentLine'
                            " Text Editing
NeoBundle 'easymotion/vim-easymotion'
NeoBundle 'tpope/vim-surround'
NeoBundle 'matze/vim-move'
NeoBundle 'terryma/vim-multiple-cursors'
                            " Completion
NeoBundle 'mattn/emmet-vim'
NeoBundle 'Shougo/neocomplete.vim'
NeoBundle 'ervandew/supertab'
NeoBundle 'vim-scripts/SyntaxComplete'
NeoBundle 'vim-scripts/AutoComplPop'
                            " Web Development
NeoBundle 'scrooloose/syntastic'
NeoBundle 'walm/jshint.vim'
NeoBundle 'othree/yajs.vim'
NeoBundle 'mxw/vim-jsx'
NeoBundle 'moll/vim-node'
NeoBundle 'lilydjwg/colorizer'
                            " Note Taking
NeoBundle 'xolox/vim-misc'
NeoBundle 'xolox/vim-notes'

call neobundle#end()
NeoBundleCheck              " Prompt for uninstalled bundles

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Visuals
syntax on
set background=dark
colorscheme mod8            " Color Scheme
set t_Co=256
set showmode 			    " Show Current Mode
set showcmd			        " Show Cmds You're Typing
set showmatch               " Show Matching [{}]
set ruler			        " Show Current Line and Col
set title			        " Show File Title in Terminal Tab
set number                  " Show Line Numbers
set cursorline			    " Highlight Current Line
au InsertEnter * :set number
au InsertLeave * :set relativenumber " Use relative line numbers in normal

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
" ~> Navigating Splits
nnoremap <C-J> <C-W><C-J>
nnoremap <C-K> <C-W><C-K>
nnoremap <C-L> <C-W><C-L>
nnoremap <C-H> <C-W><C-H>

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Filetype Config
autocmd FileType html setlocal shiftwidth=2 tabstop=2
au FileType notes setlocal wrap textwidth=80 

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Plugin Config
nnoremap <C-\> :NERDTreeToggle<CR>
                            " vim-airline 
let g:airline_theme='mod8'
let g:airline_left_sep=''
let g:airline_right_sep=''
let g:airline_left_alt_sep='|'
let g:airline_right_alt_sep = '|'
let g:airline#extensions#whitespace#enabled = 0
let g:airline#extensions#tabline#enabled = 1
let g:airline#extensions#tabline#fnamemod = ':t'
set laststatus=2
                            " vim-move
let g:move_key_modifier = 'C'
                            " vim-notes
let g:notes_directories = ['~/Documents/Notes']
let g:notes_suffix = '.txt'

let g:jsx_ext_required = 0
""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" Show syntax highlighting groups for word under cursor

nmap <F9> :call <SID>SynStack()<CR>
function! <SID>SynStack()
    if !exists("*synstack")
        return
    endif
    echo map(synstack(line('.'), col('.')), 'synIDattr(v:val, "name")')
endfunc
