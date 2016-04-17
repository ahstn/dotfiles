"
"   .vimrc
"       - Arch Linux (Terminator)
"       - using Vim-Plug
"

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Basics / Visuals
syntax on
set background=dark
colorscheme mod8            " Color Scheme
set showmode 			          " Show Current Mode
set showcmd			            " Show Cmds You're Typing
set showmatch               " Show Matching [{}]
set ruler			              " Show Current Line and Col
set title			              " Show File Title in Terminal Tab
set number                  " Show Line Numbers
set cursorline			        " Highlight Current Line
set splitbelow              " hoz split goes down
set splitright              " vert split goes right
set wildignore+=*/node_modules/*
au InsertEnter * :set number
au InsertLeave * :set relativenumber " Use relative line numbers in normal

if exists("+colorcolumn")
	set colorcolumn=81	      " Limit line length to 80
endif

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Tabs
filetype plugin indent on
set expandtab               " 2 spaces please
set shiftwidth=2
set tabstop=2
set softtabstop=2
set shiftround
set nowrap 			            " No Line Wrapping

"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Vim-Plug

call plug#begin('~/.vim/plugged')
                            " Interface
Plug 'scrooloose/nerdtree'
Plug 'kien/ctrlp.vim'
Plug 'bling/vim-airline'
Plug 'vim-airline/vim-airline-themes'
Plug 'phazyy/vim-mod8-airline'
Plug 'tpope/vim-fugitive'
Plug 'Yggdroot/indentLine'
                            " Text Editing
Plug 'easymotion/vim-easymotion'
Plug 'tpope/vim-surround'
Plug 'matze/vim-move'
Plug 'terryma/vim-multiple-cursors'
                            " Completion
Plug 'mattn/emmet-vim'
Plug 'Shougo/neocomplete'
Plug 'Shougo/neosnippet'
Plug 'Shougo/neosnippet-snippets'
Plug 'ervandew/supertab'
Plug 'vim-scripts/SyntaxComplete'
                            " Web Development
Plug 'scrooloose/syntastic'
Plug 'pangloss/vim-javascript'
Plug 'mxw/vim-jsx'
Plug 'othree/jspc.vim'
Plug 'othree/es.next.syntax.vim'
Plug '1995eaton/vim-better-javascript-completion'
Plug 'lilydjwg/colorizer'
                            " Note Taking
Plug 'xolox/vim-misc'
Plug 'xolox/vim-notes'

call plug#end()

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Plugin Config
                            " nerdtree
nnoremap <C-\> :NERDTreeToggle<CR>
                            " ctrlp
let g:ctrlp_working_path_mode = 'ra'
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
                            " jsx
let g:syntastic_javascript_checkers = ['eslint']
let g:jsx_ext_required = 0
                            " neocomplete and neosnippet
let g:neocomplete#enable_at_startup = 1
let g:neosnippet#enable_snipmate_compatibility = 1
let g:neosnippet#snippets_directory='~/.vim/plugin/snippets'
let g:neosnippet#disable_runtime_snippets = {
  \   '_' : 1,
  \  }
smap <expr><TAB> neosnippet#expandable_or_jumpable() ?
      \ "\<Plug>(neosnippet_expand_or_jump)" : "\<TAB>"
