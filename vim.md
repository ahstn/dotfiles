## Keybindings
### Standard Vim (For beginneers and my forgetful mind)
| Key        | Action                                    |
|------------|-------------------------------------------|
| /          | Search forwards                           |
| ?          | Search backwards                          |
| \[\[       | Move to next function                     |
| \]\]       | Move to previous function                 |
| %          | Move to matching brace                    |
| Ctrl+t     | Go back                                   |
| gg=GG      | Reformat the entire file                  |
| :retab     | Convert tabs -> spaces (or vice-versa)    |

### Custom
| Key        | Action                                    |
|------------|-------------------------------------------|
| , (comma)  | Leader key                                |
| jj         | Enter normal mode from insert mode        |
| Ctrl+h     | Jump to split right                       |
| Ctrl+j     | Jump to above split                       |
| Ctrl+k     | Jump to below left                        |
| Ctrl+l     | Jump to split left                        |
| Ctrl+Left  | Jump one buffer to the left               |
| Ctrl+Right | Jump one buffer to the right              |
| Ctrl+t     | Create a new empty buffer                 |
| ,v         | Create a new vertical split               |
| ,h         | Create a new horizontal split             |
| ,c         | Clear search highlights                   |

### Plugins
| Key        | Action                                    | Plugin         |
|------------|-------------------------------------------|----------------|
| Ctrl+\     | Open NERDTree (file tree)                 | NERDTree       |
| Ctrl+p     | Open ctrlp (fuzzy finder)                 | ctrlp          |
| Shift+j    | Move line(s) down                         | vim-move       |
| Shift+k    | Move line(s) up                           | vim-move       |
| ysiw)      | Surround (inner) word with parentheses    | vim-surround   |
| ds)        | Remove surrounding parentheses            | vim-surround   |
| cs)}       | Change surrounding parentheses to braces  | vim-surround   |
| ,w         | Trigger easymotion                        | vim-easymotion |
| ,gd        | Go to Go definition                       | vim-go         |
| ,gdv       | Open Go definition in a vertical split    | vim-go         |
| ,gdh       | Open Go definition in a horizontal split  | vim-go         |
| F8         | Run GoMetaLinter                          | vim-go         |

## Plugins
### General / Interface
- [onedark.vim (colorscheme)](github.com/joshdick/onedark)
- [nerdtree](github.com/scrooloose/nerdtree)
- [fzf](github.com/junegunn/fzf)
- [vim-airline](github.com/bling/vim-airline)
- [vim-gitgutter](github.com/airblade/vim-gitgutter)
- [vim-surround](github.com/tpope/vim-surround)
- [vim-commentary](github.com/tpope/vim-commentary)
- [indentLine](github.com/Yggdroot/indentLine)
- [vim-easymotion](github.com/easymotion/vim-easymotion)
- [vim-move](github.com/matze/vim-move)
- [syntastic](github.com/scrooloose/syntastic)
- [editorconfig](github.com/editorconfig/editorconfig-vim)

### Autocompletion
- [neocomplete](github.com/Shougo/neocomplete)
- [supertab](github.com/ervandew/supertab)
- [SyntaxComplete](github.com/vimscripts/SyntaxComplete)

### Language Specific
- [vim-javascript](github.com/pangloss/vim-javascript)
- [vim-chef](github.com/dougireton/vim-chef)
- [vim-go](github.com/fatih/vim-go)

