return {
  updater = {
    remote = "origin", -- remote to use
    channel = "stable", -- "stable" or "nightly"
    version = "latest", -- "latest", tag name, or regex search like "v1.*" to only do updates before v2 (STABLE ONLY)
    branch = "nightly", -- branch name (NIGHTLY ONLY)
    skip_prompts = false, -- skip prompts about breaking changes
    show_changelog = true, -- show the changelog after performing an update
  },
  colorscheme = "onedark",
  diagnostics = {
    virtual_text = true,
    underline = true,
  },
  lsp = {
    formatting = {
      format_on_save = {
        enabled = true, -- enable or disable format on save globally
        ignore_filetypes = {
          "markdown",
        },
      },
      timeout_ms = 1000, -- default format timeout
    },
    servers = {}, -- externally installed servers
  },
  lazy = {
    -- Configure require("lazy").setup() options
    defaults = { lazy = true },
    performance = {
      rtp = {
        -- customize default disabled vim plugins
        disabled_plugins = { "tohtml", "gzip", "matchit", "zipPlugin", "netrwPlugin", "tarPlugin" },
      },
    },
  },
  plugins = {
    {
      "navarasu/onedark.nvim",
      name = "onedark.nvim",
      config = function() require("onedark").load() end,
    },
    "AstroNvim/astrocommunity",
    { import = "astrocommunity.motion.hop-nvim" },
    { import = "astrocommunity.motion.nvim-surround" },
    { import = "astrocommunity.pack.lua" },
    { import = "astrocommunity.pack.rust" },
    { import = "astrocommunity.pack.terraform" },
    { import = "astrocommunity.pack.typescript" },
  },
  polish = function()
    -- Set up custom filetypes
    vim.filetype.add {
      extension = {
        tfvars = "terraform",
      },
    }
  end,
}
