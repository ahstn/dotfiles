local install_path = vim.fn.stdpath 'data' .. '/site/pack/packer/start/packer.nvim'

if vim.fn.empty(vim.fn.glob(install_path)) > 0 then
  vim.fn.execute('!git clone https://github.com/wbthomason/packer.nvim ' .. install_path)
end

local packer_group = vim.api.nvim_create_augroup('Packer', { clear = true })
vim.api.nvim_create_autocmd('BufWritePost', { command = 'source <afile> | PackerCompile', group = packer_group, pattern = 'init.lua' })

return require('packer').startup(function()
  use 'wbthomason/packer.nvim'
  use 'nvim-lua/plenary.nvim'

  -- UI
  use 'ful1e5/onedark.nvim' -- Color Scheme
  use 'folke/which-key.nvim' -- Keybinds Helper
  use {'nvim-lualine/lualine.nvim', requires = {'kyazdani42/nvim-web-devicons', opt = true}}
  use {
    'akinsho/bufferline.nvim',
    requires = 'kyazdani42/nvim-web-devicons',
    config = function() require('plugins.bufferline') end,
  }
  use {'lewis6991/gitsigns.nvim', requires = 'nvim-lua/plenary.nvim', config = "require('gitsigns').setup()",}
  use {  -- Code Actions & File Finding
    'nvim-telescope/telescope.nvim',
    requires = {
      'nvim-lua/plenary.nvim',
      { 'nvim-telescope/telescope-fzf-native.nvim', run = 'make' }
    },
    config = function() require("plugins.telescope") end
  }
  use {
    'kyazdani42/nvim-tree.lua',
    requires = 'kyazdani42/nvim-web-devicons',
    config = function() require'nvim-tree'.setup {} end
  }
  use 'stevearc/dressing.nvim' -- general interactive UI element improvements
  use('ggandor/lightspeed.nvim') -- hop to different parts of the buffer with s + character

  -- Treesitter
  use { 'nvim-treesitter/nvim-treesitter', run = ':TSUpdate' }
  use { 'nvim-treesitter/nvim-treesitter-textobjects', after = 'nvim-treesitter'}

  -- LSP
  use { 'neovim/nvim-lspconfig', config = function() require('plugins.lspconfig') end }
  use 'williamboman/nvim-lsp-installer' -- auto installers for language servers
  use {
      'hrsh7th/nvim-cmp', -- auto completion
      config = function() require('plugins.cmp') end,
      requires = {
          'hrsh7th/cmp-nvim-lsp',
          'L3MON4D3/LuaSnip',
          'saadparwaiz1/cmp_luasnip',
          'hrsh7th/cmp-buffer',
          'hrsh7th/cmp-path',
          'hrsh7th/cmp-nvim-lua',
          'windwp/nvim-autopairs',
          { 'Saecki/crates.nvim', requires = { 'nvim-lua/plenary.nvim' }, branch = 'main' },
      },
  }
  use 'onsails/lspkind-nvim' -- show pictograms in the auto complete popup
  use 'nvim-lua/popup.nvim'
  use 'b0o/schemastore.nvim' -- adds schemas for json lsp

  -- TypeScript Specifics
  use 'jose-elias-alvarez/null-ls.nvim'
  use 'jose-elias-alvarez/nvim-lsp-ts-utils'
  use { 'David-Kunz/cmp-npm', requires = 'nvim-lua/plenary.nvim' }

  -- Rust Specifics
  use { 'simrat39/rust-tools.nvim', config = function() require'rust-tools'.setup {} end }

  use 'hashivim/vim-terraform'
  use 'tpope/vim-commentary'
end)
