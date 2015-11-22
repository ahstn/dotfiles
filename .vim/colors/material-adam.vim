set background=dark
highlight clear
if exists("syntax on")
	syntax reset
endif

let g:colors_name="material-adam"

" Color List - Add to your terminal
" Red:      01 #FF5370    02 #F77669
" Green:    02 #C3E88D
" Yellow:   03 #FFCB6B    11 #F1E655
" Blue:     04 #82B1FF
" Magenta:  05 #C792EA
" Cyan:     06 #80CBC4


hi Normal       guifg=#cdd3de guibg=#263238
hi Comment      guifg=#546e7a guibg=NONE ctermfg=14 ctermbg=NONE
hi LineNr       guifg=#546e7a guibg=NONE ctermfg=00 ctermbg=NONE
hi Constant     guifg=#f77469 guibg=NONE ctermfg=01 ctermbg=NONE
hi String       guifg=#c4e88d guibg=NONE ctermfg=02
hi htmlTagName  guifg=#ff5370 guibg=NONE ctermfg=01
hi Identifier   guifg=#482354 guibg=NONE ctermfg=05
hi Statement    guifg=#aa4444 guibg=NONE ctermfg=09
hi PreProc      guifg=#ff80ff guibg=NONE ctermfg=13
hi Type         guifg=#ffcb6b guibg=NONE ctermfg=03
hi Function     guifg=#82b2ff guibg=NONE ctermfg=04
hi Repeat       guifg=#000000 guibg=NONE ctermfg=08
hi Operator     guifg=#39adb5 guibg=NONE ctermfg=14
hi Error        guibg=#ff0000 guifg=#ffffff ctermfg=01
hi TODO         guibg=#0011ff guifg=#ffffff ctermfg=05
hi CursorLine   guibg=#212D32 guifg=#ffffff ctermbg=08 cterm=NONE
hi CursorLineNr guibg=#212D32 guifg=#ffffff ctermbg=08


hi htmlTag     guifg=#fff guibg=NONE ctermfg=06
hi htmlEndTag  guifg=#fff guibg=NONE ctermfg=06
hi htmlArg     guifg=#fff guibg=NONE ctermfg=11

hi javaScriptWebAPI       guifg=#fff guibg=NONE ctermfg=03
hi javaScriptFuncExp      guifg=#fff guibg=NONE ctermfg=04
hi javaScriptIdentifer    guifg=#fff guibg=NONE ctermfg=05 cterm=NONE
hi javaScriptFuncDef      guifg=#fff guibg=NONE ctermfg=05
hi javaScriptConditional  guifg=#fff guibg=NONE ctermfg=05
hi javaScriptFuncKeyword  guifg=#fff guibg=NONE ctermfg=05
hi javaScriptOpSymbols    guifg=#fff guibg=NONE ctermfg=06
hi javascriptOperator     guifg=#fff guibg=NONE ctermfg=06
hi javaScriptBraces       guifg=#fff guibg=NONE ctermfg=07
hi javaScriptParens       guifg=#fff guibg=NONE ctermfg=07
hi javaScriptNumber       guifg=#fff guibg=NONE ctermfg=09

hi link character		constant
hi link number			constant
hi link boolean			constant
hi link Float			Number
hi link Conditional		Repeat
hi link Label			Statement
hi link Keyword			Statement
hi link Exception		Statement
hi link Include			PreProc
hi link Define			PreProc
hi link Macro			PreProc
hi link PreCondit		PreProc
hi link StorageClass	Type
hi link Structure		Type
hi link Typedef			Type
hi link htmlTag			Special
hi link Tag				Special
hi link SpecialChar		Special
hi link Delimiter		Special
hi link SpecialComment  Special
hi link Debug			Special
