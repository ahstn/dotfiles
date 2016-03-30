" mod8 vim-airline companion theme
" author: github.com/phazyy
" mod8: https://github.com/easysid/mod8.vim

" Normal Mode
let s:N1 = [ '#ffffff' , '#bf616a' , 231 , 01 ]
let s:N2 = [ '#ffffff' , '#65737e' , 231 , 08 ]
let s:N3 = [ '#ffffff' , '#2b303b' , 231 , 00 ]

" Insert Mode
let s:I1 = [ '#ffffff' , '#a3be8c' , 231 , 02 ]
let s:I2 = [ '#ffffff' , '#65737e' , 231 , 08 ]
let s:I3 = [ '#ffffff' , '#2b303b' , 231 , 00 ]

" Visual Mode
let s:V1 = [ '#ffffff' , '#ebcb8b' , 231 , 03 ]
let s:V2 = [ '#ffffff' , '#65737e' , 231 , 08 ]
let s:V3 = [ '#ffffff' , '#2b303b' , 231 , 00 ]

" Inactive Mode
let s:IA = [ '#4e4e4e' , '#2b303b' , 59  , 00, '' ]

" Assign color values
let g:airline#themes#mod8#palette = {}
let g:airline#themes#mod8#palette.normal = airline#themes#generate_color_map(s:N1, s:N2, s:N3)
let g:airline#themes#mod8#palette.insert = airline#themes#generate_color_map(s:I1, s:I2, s:I3)
let g:airline#themes#mod8#palette.visual = airline#themes#generate_color_map(s:V1, s:V2, s:V3)
let g:airline#themes#mod8#palette.replace = copy(g:airline#themes#mod8#palette.insert)
let g:airline#themes#mod8#palette.inactive = airline#themes#generate_color_map(s:IA, s:IA, s:IA)

" Tabline
let g:airline#themes#mod8#palette.tabline = {
      \ 'airline_tab':      ['#ffffff' , '#ebcb8b' ,  231 , 03 , ''],
      \ 'airline_tabsel':   ['#ffffff' , '#ab7967' ,  231 , 14 , ''],
      \ 'airline_tabtype':  ['#ffffff' , '#ab7967' ,  231 , 14 , ''],
      \ 'airline_tabfill':  ['#ffffff' , '#2b303b' ,  231 , 00 , ''],
      \ 'airline_tabmod':   ['#ffffff' , '#2b303b' ,  231 , 00 , ''],
      \ }

" Ctrl P
if !get(g:, 'loaded_ctrlp', 0)
  finish
endif
let g:airline#themes#mod8#palette.ctrlp = airline#extensions#ctrlp#generate_color_map(
      \ [ '#ffffff' , '#2b303b' , 231 , 08 , '' ],
      \ [ '#ffffff' , '#8fa1b3' , 231 , 04 , '' ],
      \ [ '#ffffff' , '#bf616a' , 231 , 01 , '' ] )
