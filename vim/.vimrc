""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Vim-Plug (https://github.com/junegunn/vim-plug)

if empty(glob('~/.vim/autoload/plug.vim'))
  !curl -fLo ~/.vim/autoload/plug.vim --create-dirs https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim
  autocmd VimEnter * PlugInstall | source $MYVIMRC
endif

call plug#begin('~/.vim/plugged')

" Interface and Typing
Plug 'joshdick/onedark.vim'
Plug 'preservim/nerdtree',          { 'on': 'NERDTreeToggle' }
Plug 'Xuyuanp/nerdtree-git-plugin', { 'on': 'NERDTreeToggle' }
Plug 'junegunn/fzf',                { 'dir': '~/.fzf', 'do': './install --all' }
Plug 'junegunn/fzf.vim'
Plug 'bling/vim-airline'
Plug 'mhinz/vim-signify'
Plug 'tpope/vim-fugitive'
Plug 'tpope/vim-surround'
Plug 'tpope/vim-vinegar'    " TODO: Look into Fern to replace NERDTree + Vinegar
Plug 'tpope/vim-commentary'
Plug 'Yggdroot/indentLine'
Plug 'easymotion/vim-easymotion'
Plug 'w0rp/ale'
Plug 'editorconfig/editorconfig-vim'
Plug 'mhinz/vim-startify'
Plug 'liuchengxu/vim-which-key'

" Language Support
Plug 'pangloss/vim-javascript', { 'for': 'javascript' }
Plug 'fatih/vim-go',            { 'for': 'go', 'do': ':GoUpdateBinaries' }
Plug 'posva/vim-vue',           { 'for': 'vue' }
Plug 'ekalinin/dockerfile.vim',
Plug 'towolf/vim-helm',         { 'for': 'yaml' }
"
" Completion
Plug 'neoclide/coc.nvim', {'branch': 'release'}

call plug#end()

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Basics / Visuals / Tabs

let mapleader = "\<Space>"  " remap leader to space
syntax on                   " enable syntax highlighting
set termguicolors           " use truecolor when possible
colorscheme onedark         " use onedark colorscheme
set background=dark         " use onedark's dark colors
set showmatch               " show matching [{}]
set number                  " show line numbers
set cursorline              " highlight current line
set splitbelow              " vertical split goes below current window
set splitright              " horizontal split goes right of current window
set incsearch               " move to match search as you type
set ignorecase              " case insensitive search
set scrolloff=5             " number of screen lines to show around the cursor
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
set wildignore+=*/node_modules/**
let &t_8f = "\<Esc>[38;2;%lu;%lu;%lum" " needed for truecolor
let &t_8b = "\<Esc>[48;2;%lu;%lu;%lum"
hi! EndOfBuffer ctermbg=bg ctermfg=bg guibg=bg guifg=bg
autocmd FileType java setlocal omnifunc=javacomplete#Complete

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Plugin Config

" nerdtree
nnoremap <leader>n :NERDTreeToggle<CR>
let NERDTreeIgnore =['node_modules[[dir]]', 'vendor[[dir]]', '.git[[dir]]']
let NERDTreeWinPos = 'right'
let NERDTreeWinSize = '25'
let NERDTreeMinimalUI = v:true
let NERDTreeShowHidden = v:true
let NERDTreeRespectWildIgnore = v:true
"autocmd vimenter * NERDTree
"autocmd VimEnter * wincmd p
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
nnoremap <leader>. :FZF --reverse<cr>
nnoremap <leader>/ :Rg<cr>
let g:fzf_layout = { 'down': '~20%' }
let $FZF_DEFAULT_COMMAND = 'rg --files --hidden --glob "!.git/*"'

" vim-which-key
nnoremap <silent> <leader> :<c-u>WhichKey '<Space>'<CR>
call which_key#register('<Space>', 'g:which_key_map')
let g:which_key_map = {
  \    'name': 'main',
  \    '.': 'Find Files',
  \    '/': 'Find in Files',
  \    'n': 'Toggle NERDTree',
  \    'j': 'EasyMotion Down',
  \    'k': 'EasyMotion Up',
  \    'p': 'Paste Mode',
  \    'f': 'Format Block (coc)',
  \    'rn': 'Rename Word (coc)',
  \    'b': {
  \      'name': 'Buffer',
  \      'c': 'Create',
  \      'd': 'Delete',
  \      'n': 'Next',
  \      'p': 'Previous',
  \    }
  \ }

" ale
let g:ale_sign_error = '⤫'
let g:ale_sign_warning = '⚠'

" vim-airline
let g:airline_theme='onedark'
let g:airline_left_sep=''
let g:airline_right_sep=''
let g:airline_left_alt_sep='|'
let g:airline_right_alt_sep = '|'
let g:airline_section_y = ''
let g:airline_section_z = '%l:%c'
let g:airline#extensions#ale#enabled = v:true
let g:airline#extensions#tabline#enabled = v:true
let g:airline#extensions#tabline#formatter = 'unique_tail'
let g:airline#extensions#branch#enabled = 1
let g:airline#extensions#branch#format = 2
let g:airline#extensions#whitespace#enabled = v:true
let g:airline#extensions#tabline#buffer_min_count = 2

" vim-easymotion
let g:EasyMotion_startofline = 0
map <Leader>j <Plug>(easymotion-j)
map <Leader>k <Plug>(easymotion-k)

" vim-startify
let g:startify_lists = [
      \ { 'type': 'files',    'header': [ 'Most Recently Used'] },
      \ { 'type': 'commands', 'header': [ 'Commands'          ] }
      \ ]

" coc.nvim
set hidden
set nobackup
set nowritebackup
set cmdheight=1
set updatetime=300
set shortmess+=c
set signcolumn=yes
" setup tab completion
inoremap <silent><expr> <TAB>
      \ pumvisible() ? "\<C-n>" :
      \ <SID>check_back_space() ? "\<TAB>" :
      \ coc#refresh()
inoremap <expr><S-TAB> pumvisible() ? "\<C-p>" : "\<C-h>"
nmap <silent> gd <Plug>(coc-definition)
nmap <silent> gy <Plug>(coc-type-definition)
nmap <silent> gi <Plug>(coc-implementation)
nmap <silent> gr <Plug>(coc-references)
vmap <leader>f  <Plug>(coc-format-selected)
nmap <leader>f  <Plug>(coc-format-selected)
nmap <leader>rn <Plug>(coc-rename)
nnoremap <silent> U :call <SID>show_documentation()<CR>

" vim-go
let g:go_def_mapping_enabled = 0    " handled by coc.nvim
au FileType go nmap <silent> gt <Plug>(go-test)
au FileType go nmap <silent> gT <Plug>(go-test-func)
au FileType go nmap <leader>D <Plug>(go-doc)
au FileType go nmap <leader>r <Plug>(go-run-split)
au FileType go nmap <leader>rv <Plug>(go-run-vertical)
au FileType go nmap <leader>rt <Plug>(go-run-tab)
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
let g:go_term_enabled = 1
let g:go_term_height = 30
let g:go_term_mode = "vsplit"
let g:go_metalinter_command = ""
let g:go_metalinter_deadline = "5s"
let g:go_metalinter_enabled = [ 'deadcode', 'golint', 'ineffassign', 'vet' ]

""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""""
" ~> Keymaps

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

" Buffer Navigation
nnoremap <leader>bp   :bprevious!<CR>
nnoremap <leader>bn   :bnext!<CR>
nnoremap <leader>bc   :enew!<CR>
nnoremap <leader>bd   :bdelete<CR>

" Fix common typos
cnoreabbrev W w
cnoreabbrev Q q
cnoreabbrev Q! q!
cnoreabbrev Wq wq
cnoreabbrev WQ wq

