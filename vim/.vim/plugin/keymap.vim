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

                        " neosnippet keys
imap <C-k>     <Plug>(neosnippet_expand_or_jump)
smap <C-k>     <Plug>(neosnippet_expand_or_jump)
xmap <C-k>     <Plug>(neosnippet_expand_target)

                        " Fix common typos
cnoreabbrev W w
cnoreabbrev Q q
cnoreabbrev Q! q!
cnoreabbrev Wq wq
