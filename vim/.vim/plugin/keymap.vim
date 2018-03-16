" ~> Keymaps

                        " remap jj to esc in insert mode
inoremap jj <esc>

                        " leader c to clear search highlighting
map <leader>c :nohlsearch<cr>

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
nnoremap <C-Left>   :bufferprevious!<CR>
nnoremap <C-Right>  :buffernext!<CR>
nnoremap <C-t>      :enew!<CR>
inoremap <C-Left>   <Esc>:bufferprevious!<CR>i
inoremap <C-Right>  <Esc>:buffernext!<CR>i
inoremap <C-t>      <Esc>:enew!<CR>

                        " neosnippet keys
imap <C-k>     <Plug>(neosnippet_expand_or_jump)
smap <C-k>     <Plug>(neosnippet_expand_or_jump)
xmap <C-k>     <Plug>(neosnippet_expand_target)
