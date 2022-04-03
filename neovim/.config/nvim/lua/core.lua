vim.g.mapleader = ' '     -- <space bar> as leader

vim.opt.updatetime = 500  -- faster updates
vim.opt.timeoutlen = 250  -- lower keypress timeout for 'which-key'

vim.opt.termguicolors = true  -- Truecolor when possible
vim.g.t_Co = 256
vim.g.syntax_on = true

vim.opt.relativenumber = true
vim.wo.scrolloff = 10
vim.wo.sidescrolloff = 30
vim.wo.cursorline = true -- Enable highlighting of the current line
vim.wo.signcolumn = 'yes' -- Always show the signcolumn, otherwise it would shift the text each time

-- 2 spaces with auto-indenting
vim.opt.autoindent = true
vim.g.smartintend = true
vim.opt.tabstop = 2
vim.opt.shiftwidth = 2
vim.o.expandtab = true

-- whitespace characters
vim.wo.list = true
vim.opt.listchars = 'tab:→ ,trail:•,extends:»,precedes:«'

-- Set completeopt to have a better completion experience
-- :help completeopt
-- menuone: popup even when there's only one match
-- noinsert: Do not insert text until a selection is made
-- noselect: Do not select, force user to select one from the menu
vim.o.completeopt = 'menuone,noinsert,noselect'
vim.opt.completeopt = "menu,menuone,noselect"
vim.opt.omnifunc = "syntaxcomplete#Complete",

require('onedark').setup({
  hide_inactive_statusline = true,
  comment_style = "italic",
  highlight_linenumber = true
})
require('lualine').setup {
  options = {
    theme = 'onedark-nvim',
    section_separators = '',
    component_separators = ''
  },
  sections = {
    lualine_x = {'filetype'},
  },
}
local luasnip = require("luasnip")

luasnip.config.set_config {
  history = false,
  updateevents = "TextChanged,TextChangedI",
}

