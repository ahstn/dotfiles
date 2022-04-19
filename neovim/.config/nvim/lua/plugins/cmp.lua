local cmp = require('cmp')
require'luasnip.loaders.from_vscode'.lazy_load()

local lspkind = require('lspkind')
lspkind.init({})

local source_mapping = {
    nvim_lsp = '[LSP]',
    luasnip = '[Snippet]',
    treesitter = '[TS]',
    cmp_tabnine = '[TN]',
    nvim_lua = '[Lua]',
    path = '[Path]',
    buffer = '[Buffer]',
    calc = '[Calc]',
}

local has_words_before = function()
  local line, col = unpack(vim.api.nvim_win_get_cursor(0))
  return col ~= 0 and vim.api.nvim_buf_get_lines(0, line - 1, line, true)[1]:sub(col, col):match('%s') == nil
end

local feedkey = function(key, mode)
  vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes(key, true, true, true), mode, true)
end

cmp.setup({
  completion = {
    keyword_length = 2,
    completeopt = 'menu,menuone,noinsert'
  },
  snippet = {
    expand = function(args)
     require('luasnip').lsp_expand(args.body)
    end,
  },
  window = {
    documentation = {
      winhighlight = 'NormalFloat:CmpDocumentation,FloatBorder:CmpDocumentationBorder',
      border = 'rounded',
    }
  },
  mapping = {
    ['<C-Space>'] = cmp.mapping.complete(),
    ['<Tab>'] = cmp.mapping(function(fallback)
      if cmp.visible() then
        cmp.select_next_item(select_opts)
      else
        cmp.complete()
      end
    end, {'i', 's'}),
    ['<S-Tab>'] = cmp.mapping(function(fallback)
      if cmp.visible() then
        cmp.select_prev_item(select_opts)
      else
        fallback()
      end
    end, {'i', 's'}),
    ['<CR>'] = cmp.mapping.confirm({
      behavior = cmp.ConfirmBehavior.Replace,
      select = true,
    })
  },
  formatting = {
    format = function(entry, vim_item)
        vim_item.kind = lspkind.presets.default[vim_item.kind]
        local menu = source_mapping[entry.source.name]
        vim_item.menu = menu
        return vim_item
    end
  },
  sources = {
    { name = 'nvim_lsp' },
    { name = 'luasnip' },
    { name = 'treesitter' },
    { name = 'nvim_lua' },
    { name = 'path' },
    { name = 'buffer' },
    { name = 'calc' },
  },
  experimental = { ghost_text = true },
})
