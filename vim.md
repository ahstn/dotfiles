## Keybindings
### Standard Vim (For beginneers and my forgetful mind)
| Key        | Action                                    |
|------------|-------------------------------------------|
| /          | Search forwards                           |
| ?          | Search backwards                          |
| \[\[       | Move to next function                     |
| \]\]       | Move to previous function                 |
| %          | Move to matching brace                    |
| _          | Move to first non-black char of the line  |
| g_          | Move to first non-black char of the line  |
| Ctrl+O     | Go back after jumping to a file or def    |
| gg=GG      | Reformat the entire file                  |
| :retab     | Convert tabs -> spaces (or vice-versa)    |

### Custom
| Key        | Action                                                |
|------------|-------------------------------------------------------|
| <Space>    | Leader key                                            |
| jj         | Enter normal mode from insert mode                    |
| Ctrl+h     | Jump to split right                                   |
| Ctrl+j     | Jump to above split                                   |
| Ctrl+k     | Jump to below left                                    |
| Ctrl+l     | Jump to split left                                    |
| Ctrl+Left  | Jump one buffer to the left                           |
| Ctrl+Right | Jump one buffer to the right                          |
| Ctrl+t     | Create a new empty buffer                             |
| Ctrl+q     | Close the buffer                                      |
| <Space>v   | Create a new vertical split                           |
| <Space>h   | Create a new horizontal split                         |
| <Space>c   | Clear search highlights                               |
| :SW        | Sudo write(:w) file, useful if you forgot to sudo vim |

### Plugins
| Key              | Action                                    | Plugin         |
|------------------|-------------------------------------------|----------------|
| <Space>b         | Open NERDTree (file tree)                 | NERDTree       |
| <Space>.         | Open FZF - find files                     | FZF            |
| <Space>/         | Find in files                             | FZF            |
| Shift+j          | Move line(s) down                         | vim-move       |
| Shift+k          | Move line(s) up                           | vim-move       |
| ysiw)            | Surround (inner) word with parentheses    | vim-surround   |
| ds)              | Remove surrounding parentheses            | vim-surround   |
| cs)}             | Change surrounding parentheses to braces  | vim-surround   |
| <Space><Space>w  | Trigger easymotion                        | vim-easymotion |
| <Space><Space>b  | Trigger easymotion backwards              | vim-easymotion |
| ,gd              | Go to Go definition                       | vim-go         |
| <Space>gdv       | Open Go definition in a vertical split    | vim-go         |
| <Space>gdh       | Open Go definition in a horizontal split  | vim-go         |
| <Space>gt        | Search Go project functions               | vim-go         |
| F8               | Run GoMetaLinter                          | vim-go         |

## Plugins
### General / Interface
- [onedark.vim (colorscheme)](github.com/joshdick/onedark)
- [nerdtree](github.com/scrooloose/nerdtree)
- [nerdtree-git-plugin](github.com/Xuyuanp/nerdtree-git-plugin)
- [fzf](github.com/junegunn/fzf)
- [vim-airline](github.com/bling/vim-airline)
- [vim-signify](github.com/mhinz/vim-signify)
- [vim-surround](github.com/tpope/vim-surround)
- [vim-commentary](github.com/tpope/vim-commentary)
- [indentLine](github.com/Yggdroot/indentLine)
- [vim-easymotion](github.com/easymotion/vim-easymotion)
- [vim-move](github.com/matze/vim-move)
- [ale](github.com/w0ro/ale)
- [editorconfig](github.com/editorconfig/editorconfig-vim)

### Autocompletion
- [supertab](github.com/ervandew/supertab)
- [deoplete](github.com/Shougo/deoplete)

### Language Specific
- [vim-javascript](github.com/pangloss/vim-javascript)
- [vim-chef](github.com/dougireton/vim-chef)
- [vim-go](github.com/fatih/vim-go)
- [vim-vue](github.com/posva/vim-vue)

