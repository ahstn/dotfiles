--
-- Core Settings
-- --

vim.g.mapleader = ' '    -- <space bar> as leader

vim.opt.updatetime = 500 -- faster updates
vim.opt.timeoutlen = 250 -- lower keypress timeout for 'which-key'
vim.opt.mouse = 'nv'

vim.opt.cmdheight=0   -- auto hide command bar
vim.opt.laststatus=3  -- span statusline across splits

vim.opt.termguicolors = true -- Truecolor when possible
vim.g.t_Co = 256
vim.g.syntax_on = true

vim.opt.relativenumber = true
vim.wo.scrolloff = 10
vim.wo.sidescrolloff = 30
vim.wo.cursorline = true  -- Enable highlighting of the current line
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
vim.opt.omnifunc = "syntaxcomplete#Complete"

-- --
-- Lazy nvim & Packages
-- --
local lazypath = vim.fn.stdpath('data') .. '/lazy/lazy.nvim'

-- Auto-install lazy.nvim if not present
if not vim.loop.fs_stat(lazypath) then
  print('Installing lazy.nvim....')
  vim.fn.system({
    'git', 'clone', '--filter=blob:none', 'https://github.com/folke/lazy.nvim.git', '--branch=stable', lazypath,
  })
  print('Done.')
end
vim.opt.rtp:prepend(lazypath)


require('lazy').setup({
  { 'folke/tokyonight.nvim' },
  { 'navarasu/onedark.nvim' },
  {
    'VonHeikemen/lsp-zero.nvim',
    branch = 'v2.x',
    dependencies = {
      -- LSP Support
      { 'neovim/nvim-lspconfig' },
      { 'williamboman/mason.nvim',          build = ':MasonUpdate' },
      { 'williamboman/mason-lspconfig.nvim' },
      -- Autocompletion
      { 'hrsh7th/nvim-cmp' },   -- Required
      { 'hrsh7th/cmp-nvim-lsp' }, -- Required
      { 'L3MON4D3/LuaSnip' },   -- Required
      { 'hrsh7th/cmp-path' },
      { 'hrsh7th/cmp-buffer' },
    }
  },
  { 'folke/which-key.nvim' },
  { 'folke/trouble.nvim' },
  {
    'nvim-treesitter/nvim-treesitter',
    build = ':TSUpdate',
    opts = {
      ensure_installed = {
        'typescript',
        'rust',
        'lua',
        'dockerfile',
        'terraform',
        'yaml'
      }
    }
  },
  {
    'numToStr/Comment.nvim',
    config = function()
      require('Comment').setup {}
    end
  },
  {
    'nvim-telescope/telescope.nvim',
    tag = '0.1.1',
    dependencies = {
      'nvim-lua/plenary.nvim',
      'nvim-treesitter/nvim-treesitter'
    }
  },
  {
    'nvim-tree/nvim-tree.lua',
    dependencies = {
      "nvim-tree/nvim-web-devicons",
    },
    config = function()
      require("nvim-tree").setup {}
    end
  },
  {
    'stevearc/dressing.nvim',
    opts = {},
  },
  {
    'nvim-lualine/lualine.nvim',
    config = function()
      require('lualine').setup {
        options = {
          theme = 'onedark',
          section_separators = '',
          component_separators = ''
        },
        sections = {
          lualine_x = { 'filetype' },
        },
      }
    end
  },
  { 'ggandor/lightspeed.nvim' } -- hop to different parts of the buffer with s + character
})

vim.cmd.colorscheme('onedark')

-- LSP Setup
local lsp = require('lsp-zero').preset({})
lsp.ensure_installed({
  "tsserver",
  "rust_analyzer",
  "dockerls",
  "terraformls",
})

lsp.on_attach(function(client, bufnr)
  lsp.default_keymaps({ buffer = bufnr })
end)

lsp.setup()

local cmp = require('cmp')
cmp.setup({
  sources = {
    { name = 'path' },
    { name = 'nvim_lsp' },
    { name = 'buffer',  keyword_length = 3 },
  },
  mapping = {
    -- `Enter` key to confirm completion
    ['<CR>'] = cmp.mapping.confirm({ select = false }),
  }
})


-- --
-- Which Key & Mappings
--
vim.keymap.set("n", "<C-k>", "<cmd>cnext<CR>zz")
vim.keymap.set("n", "<C-j>", "<cmd>cprev<CR>zz")
vim.keymap.set("n", "<leader>k", "<cmd>lnext<CR>zz")
vim.keymap.set("n", "<leader>j", "<cmd>lprev<CR>zz")

require("which-key").register({
  -- Top Level
  t = { '<cmd>NvimTreeToggle<cr>', 'Nvim Tree' },
  P = { '<cmd>lua require("telescope.builtin").find_files()<CR>', 'Files' },
  R = { '<cmd>lua require("telescope.builtin").oldfiles()<CR>', 'Prev Open Files' },
  h = { "<cmd>nohlsearch<CR>", "No Highlight" },

  -- Nested
  b = {
    name = "Buffers",
    j = { "<cmd>BufferLinePick<cr>", "Jump" },
    b = { "<cmd>BufferLineCyclePrev<cr>", "Previous" },
    b = { "<cmd>BufferLineCycleNext<cr>", "Next" },
    e = { "<cmd>BufferLinePickClose<cr>", "Pick which buffer to close" },
    h = { "<cmd>BufferLineCloseLeft<cr>", "Close all to the left" },
    l = { "<cmd>BufferLineCloseRight<cr>", "Close all to the right" },
  },
  l = {
    name = 'LSP',
    f = { name = 'Format' },
    r = { name = 'Rename Reference' },
    s = { name = 'Signature Help' },
    D = { name = 'Type Definition' },
    e = { name = 'Show Diagnostics' }
  },
  L = {
    name = 'Telescope LSP',
    r = { '<cmd>lua require("telescope.builtin").lsp_references()<CR>', 'References' },
    d = { '<cmd>lua require("telescope.builtin").lsp_definitions()<CR>', 'Definitions' },
    t = { '<cmd>lua require("telescope.builtin").lsp_type_definitions()<CR>', 'Type Definitions' },
    i = { '<cmd>lua require("telescope.builtin").lsp_implementations()<CR>', 'Implementations' },
    s = { '<cmd>lua require("telescope.builtin").lsp_document_symbols()<CR>', 'Document Symbols' },
    w = { '<cmd>lua require("telescope.builtin").lsp_workspace_symbols()<CR>', 'Workspace Symbols' },
    a = { '<cmd>lua require("telescope.builtin").lsp_code_actions()<CR>', 'Code Actions' },
    n = { '<cmd>lua require("telescope.builtin").lsp_range_code_actions()<CR>', 'Range Code Actions' },
    g = { '<cmd>lua require("telescope.builtin").lsp_document_diagnostics()<CR>', 'Document Diagnostics' },
    o = { '<cmd>lua require("telescope.builtin").lsp_workspace_diagnostics()<CR>', 'Workspace Diagnostics' },
    e = { '<cmd>lua require("telescope.builtin").treesitter()<CR>', 'Treesitter' },
    l = { '<cmd>lua vim.lsp.codelens.display()<CR>', 'Code Lens' },
  },
  s = {
    name = "Telescope Search",
    b = { '<cmd>lua require("telescope.builtin").buffers()<CR>', 'Buffers' },
    f = { '<cmd>lua require("telescope.builtin").find_files()<CR>', 'Files' },
    o = { '<cmd>lua require("telescope.builtin").oldfiles()<CR>', 'Prev Open Files' },
    g = { '<cmd>lua require("telescope.builtin").live_grep()<CR>', 'Live Grep' },
    l = { '<cmd>lua require("telescope.builtin").loclist()<CR>', 'Location List' },
    r = { '<cmd>lua require("telescope.builtin").registers()<CR>', 'Registers' },
    j = { '<cmd>lua require("telescope.builtin").jumplist()<CR>', 'Jump List' },
    O = { '<cmd>lua require("telescope.builtin").vim_options()<CR>', 'Vim Options' },
    k = { '<cmd>lua require("telescope.builtin").keymaps()<CR>', 'Keymaps' },
    c = { '<cmd>lua require("telescope.builtin").commands()<CR>', 'Commands' },
    t = { '<cmd>lua require("telescope.builtin").treesitter()<CR>', 'Treesitter' },
  },
  g = {
    name = 'Git',
    f = { '<cmd>lua require("telescope.builtin").git_files()<CR>', 'Files' },
    s = { '<cmd>lua require("telescope.builtin").git_status()<CR>', 'Status' },
    c = { '<cmd>lua require("telescope.builtin").git_commits()<CR>', 'Commit Log' },
    l = { '<cmd>lua require("telescope.builtin").git_bcommits()<CR>', 'Commit Log Current Buffer' },
    b = { '<cmd>lua require("telescope.builtin").git_branches()<CR>', 'Branches' },
    t = { '<cmd>lua require("telescope.builtin").git_stash()<CR>', 'Stash' },
  },
  w = {
    name = 'Workspace',
    a = { name = 'Add' },
    l = { name = 'List' },
    r = { name = 'Remove' },
  },
}, { mode = 'n', prefix = "<leader>" })
