"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Vim-Plug (https://github.com/junegunn/vim-plug)
call plug#begin('~/.vim/plugged')
                            " Interface and Typing
Plug 'tyrannicaltoucan/vim-deep-space'
Plug 'scrooloose/nerdtree',     { 'on': 'NERDTreeToggle' }
Plug 'junegunn/fzf',            { 'dir': '~/.fzf', 'do': './install --all' }
Plug 'bling/vim-airline'
Plug 'tpope/vim-fugitive'
Plug 'tpope/vim-surround'
Plug 'tpope/vim-commentary'
Plug 'Yggdroot/indentLine'
Plug 'easymotion/vim-easymotion'
Plug 'matze/vim-move'
Plug 'terryma/vim-multiple-cursors'
Plug 'scrooloose/syntastic'
                            " Completion
Plug 'Shougo/neocomplete'
Plug 'Shougo/neosnippet'
Plug 'Shougo/neosnippet-snippets'
Plug 'ervandew/supertab'
Plug 'vim-scripts/SyntaxComplete'
                            " Development
Plug 'pangloss/vim-javascript', { 'for': 'javascript' }
Plug 'dougireton/vim-chef',     { 'for': 'ruby' }
Plug 'fatih/vim-go',            { 'for': 'go', 'do': ':GoInstallBinaries' }
                            " Note Taking
Plug 'xolox/vim-misc',          { 'for': 'text' }
Plug 'xolox/vim-notes',         { 'for': 'text' }

call plug#end()

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Basics / Visuals
syntax on
set background=dark
set termguicolors
colorscheme deep-space      " Color Scheme
set showmode 			          " Show Current Mode
set showcmd			            " Show Cmds You're Typing
set showmatch               " Show Matching [{}]
set ruler			              " Show Current Line and Col
set title			              " Show File Title in Terminal Tab
set number                  " Show Line Numbers
set cursorline			        " Highlight Current Line
set splitbelow              " hoz split goes down
set splitright              " vert split goes right
set scrolloff=3             " number of screen lines to show around the cursor
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


""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Plugin Config
                            " nerdtree
nnoremap <C-\> :NERDTreeToggle<CR>
                            " fzf
nnoremap <c-p> :FZF<cr>
                            " vim-airline
let g:airline_theme='deep_space'
let g:airline_left_sep=''
let g:airline_right_sep=''
let g:airline_left_alt_sep='|'
let g:airline_right_alt_sep = '|'
let g:airline#extensions#whitespace#enabled = 0
let g:airline#extensions#tabline#enabled = 1
let g:airline#extensions#tabline#fnamemod = ':t'
set laststatus=2
                            " vim-move
let g:move_key_modifier = 'S'
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
