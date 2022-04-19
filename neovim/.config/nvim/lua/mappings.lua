require("which-key").register({
  t = { '<cmd>NvimTreeToggle<cr>', 'Nvim Tree' },
  f = { "<cmd>Telescope find_files<cr>", "Find File" },
  r = { "<cmd>Telescope oldfiles<cr>", "Open Recent File" },
  T = { ":TSConfigInfo<cr>", "Treesitter Info" },
  w = { ":HopWord<cr>", "Hop - Word" },
  W = { ":HopChar2<cr>", "Hop - 2 Char" },
  l = {
    name = 'LSP',
    f = { "<cmd>lua require('lspsaga.provider').lsp_finder()<cr>", "Find References" },
    f = { "<cmd>lua vim.lsp.buf.formatting_sync()<cr>", "Format References" },
    a = { "<cmd>lua require('lspsaga.codeaction').code_action()<cr>", 'Code Action' },
  },
  p = {
    name = "Packer",
    c = { "<cmd>PackerCompile<cr>", "Compile" },
    i = { "<cmd>PackerInstall<cr>", "Install" },
    r = { "<cmd>lua require('lvim.plugin-loader').recompile()<cr>", "Re-compile" },
    s = { "<cmd>PackerSync<cr>", "Sync" },
    S = { "<cmd>PackerStatus<cr>", "Status" },
    u = { "<cmd>PackerUpdate<cr>", "Update" },
  },
  h = { "<cmd>nohlsearch<CR>", "No Highlight" },
  c = { "<cmd>BufferKill<CR>", "Close Buffer" },
  b = {
    name = "Buffers",
    j = { "<cmd>BufferLinePick<cr>", "Jump" },
    f = { "<cmd>Telescope buffers<cr>", "Find" },
    b = { "<cmd>BufferLineCyclePrev<cr>", "Previous" },
    e = {
      "<cmd>BufferLinePickClose<cr>",
      "Pick which buffer to close",
    },
    h = { "<cmd>BufferLineCloseLeft<cr>", "Close all to the left" },
    l = {
      "<cmd>BufferLineCloseRight<cr>",
      "Close all to the right",
    },
    D = {
      "<cmd>BufferLineSortByDirectory<cr>",
      "Sort by directory",
    },
    L = {
      "<cmd>BufferLineSortByExtension<cr>",
      "Sort by language",
    },
  },
  s = {
    name = "Search",
    b = { "<cmd>Telescope git_branches<cr>", "Checkout branch" },
    c = { "<cmd>Telescope colorscheme<cr>", "Colorscheme" },
    f = { "<cmd>Telescope find_files<cr>", "Find File" },
    h = { "<cmd>Telescope help_tags<cr>", "Find Help" },
    M = { "<cmd>Telescope man_pages<cr>", "Man Pages" },
    r = { "<cmd>Telescope oldfiles<cr>", "Open Recent File" },
    R = { "<cmd>Telescope registers<cr>", "Registers" },
    t = { "<cmd>Telescope live_grep<cr>", "Text" },
    k = { "<cmd>Telescope keymaps<cr>", "Keymaps" },
    C = { "<cmd>Telescope commands<cr>", "Commands" },
    p = {
      "<cmd>lua require('telescope.builtin.internal').colorscheme({enable_preview = true})<cr>",
      "Colorscheme with Preview",
    },
  },
}, { mode = 'n', prefix = "<leader>" })