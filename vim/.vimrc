"""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Vim-Plug (https://github.com/junegunn/vim-plug)
call plug#begin('~/.vim/plugged')
                            " Interface and Typing
Plug 'joshdick/onedark.vim'
Plug 'scrooloose/nerdtree',     { 'on': 'NERDTreeToggle' }
Plug 'junegunn/fzf',            { 'dir': '~/.fzf', 'do': './install --all' }
Plug 'bling/vim-airline'
Plug 'airblade/vim-gitgutter'
Plug 'tpope/vim-surround'
Plug 'tpope/vim-commentary'
Plug 'Yggdroot/indentLine'
Plug 'easymotion/vim-easymotion'
Plug 'matze/vim-move'
Plug 'w0rp/ale'
Plug 'editorconfig/editorconfig-vim'
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

call plug#end()

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Basics / Visuals
let mapleader = ','
syntax on                   " syntax and colors
set background=dark
set termguicolors
colorscheme onedark         
set showmatch               " show matching [{}]
set number                  " show line numbers
set cursorline              " highlight current line
set splitbelow              " vertical split goes below current window
set splitright              " horizontal split goes right of current window
set incsearch               " move to match search as you type
set scrolloff=3             " number of screen lines to show around the cursor
set colorcolumn=81          " limit line length to 80
set ffs=unix                " use unix line endings
set wildignore+=*/node_modules/*
au InsertEnter * :set number
au InsertLeave * :set relativenumber " use relative line numbers in normal
command SW w !sudo tee % > /dev/null  

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Tabs
filetype plugin indent on
set expandtab               " 2 spaces please
set shiftwidth=2 tabstop=2
set shiftround ai si
set nowrap                  " No Line Wrapping

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Plugin Config
                            " nerdtree
nnoremap <C-\> :NERDTreeToggle<CR>
                            " fzf
nnoremap <c-p> :FZF<cr>
                            " ale
let g:ale_sign_error = '⤫'
let g:ale_sign_warning = '⚠'
                            " vim-airline
let g:airline_theme = 'onedark'
let g:airline_section_z = '%l:%c %p%%'
let g:airline#extensions#whitespace#enabled = 1
let g:airline#extensions#tabline#enabled = 1
let g:airline#extensions#ale#enabled = 1
                            " vim-move
let g:move_key_modifier = 'S'
                            " neocomplete and neosnippet
let g:neocomplete#enable_at_startup = 1
let g:neosnippet#enable_snipmate_compatibility = 1
let g:neosnippet#snippets_directory='~/.vim/plugin/snippets'
let g:neosnippet#disable_runtime_snippets = {
  \   '_' : 1,
  \  }
smap <expr><TAB> neosnippet#expandable_or_jumpable() ?
      \ "\<Plug>(neosnippet_expand_or_jump)" : "\<TAB>"
                            " vim-go
au FileType go nmap <leader>gd <Plug>(go-def)
au FileType go nmap <leader>gdv <Plug>(go-def-vertical)
au FileType go nmap <leader>gdh <Plug>(go-def-split)
au FileType go nmap <leader>gD <Plug>(go-doc)
au FileType go nmap <leader>gt :GoDeclsDir<cr>
au FileType go nmap <F8> :GoMetaLinter<cr>

let g:go_fmt_command = "goimports"
let g:go_auto_type_info = 1
let g:go_auto_sameids = 1
let g:go_highlight_types = 1
let g:go_highlight_fields = 1
let g:go_highlight_functions = 1
let g:go_highlight_methods = 1
let g:go_highlight_structs = 1
let g:go_highlight_operators = 1
let g:go_highlight_build_constraints = 1
let g:go_highlight_extra_types = 1

let g:go_metalinter_command = ""
let g:go_metalinter_deadline = "5s"
let g:go_metalinter_enabled = [
    \ 'deadcode',
    \ 'gas',
    \ 'goconst',
    \ 'gocyclo',
    \ 'golint',
    \ 'gosimple',
    \ 'ineffassign',
    \ 'vet',
    \ 'vetshadow'
\]
