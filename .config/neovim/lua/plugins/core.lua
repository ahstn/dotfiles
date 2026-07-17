return {
  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = "catppuccin",
    },
  },

  {
    "folke/trouble.nvim",
    opts = { use_diagnostic_signs = true },
  },

  -- default lsp servers
  -- most are installed via extras in ../../lazyvim.json
  {
    "neovim/nvim-lspconfig",
    ---@class PluginLspOpts
    opts = {
      ---@type lspconfig.options
      servers = {
        ty = {}, -- python
        tsserver = {},
        rust_analyzer = {},
      },
    },
  },

  {
    "nvim-treesitter/nvim-treesitter",
    opts = {
      ensure_installed = {
        "bash",
        "html",
        "javascript",
        "json",
        "lua",
        "markdown",
        "markdown_inline",
        "python",
        "toml",
        "tsx",
        "typescript",
        "rust",
        "vim",
        "yaml",
      },
    },
  },
}
