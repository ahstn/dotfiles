---@diagnostic disable: undefined-global
local fn = vim.fn
local install_path = fn.stdpath('data')..'/site/pack/packer/start/packer.nvim'

-- Only required if you have packer configured as `opt`
vim.cmd [[packadd packer.nvim]]
if fn.empty(fn.glob(install_path)) > 0 then
  packer_bootstrap = fn.system({'git', 'clone', '--depth', '1', 'https://github.com/wbthomason/packer.nvim', install_path})
end

vim.cmd([[
  augroup packer_user_config
    autocmd!
    autocmd BufWritePost plugins.lua source <afile> | PackerSync
  augroup end
]])

return require('packer').startup(function()
  use 'wbthomason/packer.nvim'
  use 'nvim-lua/plenary.nvim'

  -- UI
  use 'ful1e5/onedark.nvim' -- Color Scheme
  use 'j-hui/fidget.nvim' --  LSP Progress
  use 'folke/which-key.nvim' -- Keybinds Helper
  use {'nvim-lualine/lualine.nvim', requires = {'kyazdani42/nvim-web-devicons', opt = true}}
  use {'lewis6991/gitsigns.nvim', requires = 'nvim-lua/plenary.nvim', config = "require('gitsigns').setup()",}
  use {  -- Code Actions & File Finding
    'nvim-telescope/telescope.nvim',
    requires = {
      'nvim-lua/plenary.nvim',
      'nvim-telescope/telescope-ui-select.nvim'
    },
    config = function() require("telescope").load_extension("ui-select") end
  }
  use {
    'kyazdani42/nvim-tree.lua',
    requires = 'kyazdani42/nvim-web-devicons',
    config = function() require'nvim-tree'.setup {} end
  }
  use('ggandor/lightspeed.nvim') -- hop to different parts of the buffer with s + character

  -- Treesitter
  use { 'nvim-treesitter/nvim-treesitter', run = ':TSUpdate' }
  use { 'nvim-treesitter/nvim-treesitter-textobjects', after = 'nvim-treesitter'}

  -- LSP
  use 'neovim/nvim-lspconfig'  -- collection of LSP configurations for nvim
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
  use "jose-elias-alvarez/null-ls.nvim"
  use "jose-elias-alvarez/nvim-lsp-ts-utils"
  use { 'David-Kunz/cmp-npm', requires = 'nvim-lua/plenary.nvim' }

  -- Rust Specifics
  use { 'simrat39/rust-tools.nvim', config = function() require'rust-tools'.setup {} end }

  use 'hashivim/vim-terraform'
end)
