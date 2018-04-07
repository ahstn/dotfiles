""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Vim-Plug (https://github.com/junegunn/vim-plug)

if empty(glob('~/.vim/autoload/plug.vim'))
  !curl -fLo ~/.vim/autoload/plug.vim --create-dirs https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim
  autocmd VimEnter * PlugInstall | source $MYVIMRC
endif

call plug#begin('~/.vim/plugged')

" Interface and Typing
Plug 'joshdick/onedark.vim'
Plug 'rakr/vim-one'
Plug 'scrooloose/nerdtree',     { 'on': 'NERDTreeToggle' }
Plug 'Xuyuanp/nerdtree-git-plugin', { 'on': 'NERDTreeToggle' }
Plug 'junegunn/fzf',            { 'dir': '~/.fzf', 'do': './install --all' }
Plug 'bling/vim-airline'
Plug 'mhinz/vim-signify'
Plug 'tpope/vim-surround'
Plug 'tpope/vim-commentary'
Plug 'Yggdroot/indentLine'
Plug 'easymotion/vim-easymotion'
Plug 'matze/vim-move'
Plug 'w0rp/ale'
Plug 'editorconfig/editorconfig-vim'

" Completion
Plug 'ervandew/supertab'
if has('nvim')
  Plug 'Shougo/deoplete.nvim', { 'do': ':UpdateRemotePlugins' }
else
  Plug 'Shougo/neocomplete.vim'
endif

" Development
Plug 'pangloss/vim-javascript', { 'for': 'javascript' }
Plug 'dougireton/vim-chef',     { 'for': 'ruby' }
Plug 'fatih/vim-go',            { 'for': 'go', 'do': ':GoInstallBinaries' }
Plug 'posva/vim-vue',           { 'for': 'vue' }

call plug#end()

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Basics / Visuals / Tabs

let mapleader = ','         " remap leader to comma
syntax on                   " enable syntax highlighting
set termguicolors           " use truecolor when possible
colorscheme one             " use onedark colorscheme
set background=dark         " use onedark's dark colors
set showmatch               " show matching [{}]
set number                  " show line numbers
set cursorline              " highlight current line
set splitbelow              " vertical split goes below current window
set splitright              " horizontal split goes right of current window
set incsearch               " move to match search as you type
set scrolloff=3             " number of screen lines to show around the cursor
set colorcolumn=81          " limit line length to 80
set ffs=unix                " always use unix line endings
set encoding=UTF-8          " always use UTF8
set autoread                " read the file again if changed outside vim
set mouse=nv                " enable mouse in normal and visual modes
set pumheight=5             " max number of items to show in completion window
set noswapfile              " no .swp - git covers backups anyway
set shiftwidth=2 tabstop=2  " 2 spaces please
set expandtab               " auto-indent when typing
set shiftround ai si        " only indent to multiples of 2
set nowrap                  " no line wrapping
set fillchars+=vert:│       " full split line
command SW w !sudo tee % > /dev/null
let &t_8f = "\<Esc>[38;2;%lu;%lu;%lum" " needed for truecolor
let &t_8b = "\<Esc>[48;2;%lu;%lu;%lum"
hi! EndOfBuffer ctermbg=bg ctermfg=bg guibg=bg guifg=bg

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Plugin Config

" nerdtree
nnoremap <C-\> :NERDTreeToggle<CR>
let NERDTreeWinPos = 'right'
let NERDTreeMinimalUI = v:true
let NERDTreeWinSize = '25'
let g:NERDTreeDirArrowExpandable = '' " ' ' U+200B - invisible for devicons
let g:NERDTreeDirArrowCollapsible = ''
autocmd vimenter * NERDTree
autocmd VimEnter * wincmd p
autocmd bufenter * if (winnr("$") == 1 && exists("b:NERDTree") && b:NERDTree.isTabTree()) | q | endif

" vim-signify
let g:signify_vcs_list = ['git']
let g:signify_sign_show_count = v:false
let g:signify_sign_add = '│' " U+2502
let g:signify_sign_delete = '│' " U+2502
let g:signify_sign_delete_first_line = '│' " U+2502
let g:signify_sign_change = '│' " U+2502
let g:signify_sign_changedelete = '│' " U+2502

" fzf - uses ripgrep (https://github.com/BurntSushi/ripgrep) [optional]
nnoremap <c-p> :FZF --reverse<cr>
let g:fzf_layout = { 'down': '~20%' }
let $FZF_DEFAULT_COMMAND = 'rg --files --hidden --glob "!.git/*"'

" ale
let g:ale_sign_error = '⤫'
let g:ale_sign_warning = '⚠'

" vim-airline
let g:airline_theme = 'one'
let g:airline_section_y = ''
let g:airline_section_z = '%l:%c'
let g:airline#extensions#ale#enabled = v:true
let g:airline#extensions#tabline#enabled = v:true
let g:airline#extensions#tabline#formatter = 'unique_tail'
let g:airline#extensions#whitespace#enabled = v:true

" vim-move
let g:move_key_modifier = 'S'

" deoplete
let g:deoplete#enable_at_startup = 1

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
let g:go_metalinter_enabled = [ 'deadcode', 'golint', 'ineffassign', 'vet' ]

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Keymaps

" remap jj to esc in insert mode
inoremap jj <esc>

" leader c to clear search highlighting
map <leader>c :nohlsearch<cr>

" leader p to change paste mode
map <leader>p :set invpaste<cr>

" center on the line the search result is
nnoremap n nzzzv
nnoremap N Nzzzv

" Switch panes with Ctrl + hjkl
map <C-h> <C-w>h
map <C-j> <C-w>j
map <C-k> <C-w>k
map <C-l> <C-w>l
nnoremap <C-J> <C-W><C-J>
nnoremap <C-K> <C-W><C-K>
nnoremap <C-L> <C-W><C-L>
nnoremap <C-H> <C-W><C-H>

" Creating splits
nnoremap <leader>v :vsplit<cr>
nnoremap <leader>h :split<cr>

" Tab navigation like Firefox.
nnoremap <C-Left>   :bprevious!<CR>
nnoremap <C-Right>  :bnext!<CR>
nnoremap <C-t>      :enew!<CR>
nnoremap <C-q>      :bclose<CR>
inoremap <C-Left>   <Esc>:bprevious!<CR>i
inoremap <C-Right>  <Esc>:bnext!<CR>i
inoremap <C-t>      <Esc>:enew!<CR>i
inoremap <C-q>      <Esc>:bclose<CR>

" Fix common typos
cnoreabbrev W w
cnoreabbrev Q q
cnoreabbrev Q! q!
cnoreabbrev Wq wq
cnoreabbrev WQ wq

