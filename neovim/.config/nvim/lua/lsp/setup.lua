require"fidget".setup{}
local lsp_installer = require('nvim-lsp-installer')

local capabilities = vim.lsp.protocol.make_client_capabilities()
capabilities = require("cmp_nvim_lsp").update_capabilities(capabilities)

local servers = {
  'jsonls',
  'yamlls',
  'taplo', -- toml
  'sumneko_lua',
  'pyright',
  'tsserver',
  'rust_analyzer',
}

-- Install LSP Servers
for _, name in pairs(servers) do
  local ok, server = lsp_installer.get_server(name)
  if ok and not server:is_installed() then
    server:install()
  end
end

-- Helper Functions
local autocmd = vim.api.nvim_create_autocmd
local augroup = function(name)
    vim.api.nvim_create_augroup(name, { clear = true })
end

local default_on_attach = function(client, bufnr)
    if client.resolved_capabilities.code_lens then
        autocmd({ 'BufEnter', 'InsertLeave' }, {
            desc = 'Auto show code lenses',
            pattern = '<buffer>',
            command = 'silent! lua vim.lsp.codelens.refresh()',
        })
    else
      vim.api.nvim_buf_set_option(bufnr, "omnifunc", "v:lua.vim.lsp.omnifunc")
      vim.api.nvim_buf_set_option(0, "formatexpr", "v:lua.vim.lsp.formatexpr()")
    end
    vim.cmd('setlocal omnifunc=v:lua.vim.lsp.omnifunc')
    vim.api.nvim_buf_set_option(0, 'omnifunc', 'v:lua.vim.lsp.omnifunc')
end

local function ensure_server(name)
    local lsp_installer = require('nvim-lsp-installer.servers')
    local _, server = lsp_installer.get_server(name)
    if not server:is_installed() then
        server:install()
    end
    return server
end

ensure_server('pyright'):setup({
    on_attach = default_on_attach,
    capabilities = capabilities,
})

ensure_server('tsserver'):setup({
    init_options = require('nvim-lsp-ts-utils').init_options,
    capabilities = capabilities,
    on_attach = function(client, bufnr)
        default_on_attach(client, bufnr)
        local ts_utils = require('nvim-lsp-ts-utils')

        -- defaults
        ts_utils.setup({
            debug = false,
            disable_commands = false,
            enable_import_on_completion = true,

            -- import all
            import_all_timeout = 5000, -- ms
            -- lower numbers indicate higher priority
            import_all_priorities = {
                same_file = 1, -- add to existing import statement
                local_files = 2, -- git files or files with relative path markers
                buffer_content = 3, -- loaded buffer content
                buffers = 4, -- loaded buffer names
            },
            import_all_scan_buffers = 100,
            import_all_select_source = false,

            -- eslint
            eslint_enable_code_actions = true,
            eslint_enable_disable_comments = true,
            eslint_bin = 'eslint_d',
            eslint_enable_diagnostics = true,
            eslint_opts = {},

            -- formatting
            enable_formatting = true,
            formatter = 'eslint_d',
            formatter_opts = {},

            -- update imports on file move
            update_imports_on_move = true,
            require_confirmation_on_move = false,
            watch_dir = nil,

            -- filter diagnostics
            filter_out_diagnostics_by_severity = {},
            filter_out_diagnostics_by_code = {},

            -- inlay hints
            auto_inlay_hints = true,
            inlay_hints_highlight = 'Comment',
        })

        -- required to fix code action ranges and filter diagnostics
        ts_utils.setup_client(client)

        -- no default maps, so you may want to define some here
        local opts = { silent = true }
        vim.api.nvim_buf_set_keymap(bufnr, 'n', 'gs', ':TSLspOrganize<CR>', opts)
        vim.api.nvim_buf_set_keymap(bufnr, 'n', 'gf', ':TSLspRenameFile<CR>', opts)
        vim.api.nvim_buf_set_keymap(bufnr, 'n', 'go', ':TSLspImportAll<CR>', opts)
        print('TS LSP Attached')
    end,
})


local null_ls = require('null-ls')
local fmt = null_ls.builtins.formatting
local dgn = null_ls.builtins.diagnostics
null_ls.setup({
    sources = {
        fmt.trim_whitespace.with({
            filetypes = { 'text', 'sh', 'zsh', 'toml', 'make', 'conf', 'tmux' },
        }),
        fmt.prettierd,
        fmt.eslint_d,
        fmt.rustfmt,
        fmt.terraform_fmt,
        fmt.gofmt,
        dgn.eslint_d,
        dgn.pylint,
        dgn.yamllint
    },
    on_attach = function(client, bufnr)
        if client.resolved_capabilities.document_formatting then
            vim.cmd([[
                augroup FORMATTING
                    autocmd! * <buffer>
                    autocmd BufWritePre <buffer> lua vim.lsp.buf.formatting_sync()
                augroup END
            ]])
        end
        vim.api.nvim_buf_set_keymap(bufnr, 'n', '<leader>lF', 'lua vim.lsp.buf.formatting_sync()', {})
    end,
})
