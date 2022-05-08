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

-- Default Options for all LSPs
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

    local opts = { noremap = true, silent = true }
    local function buf_set_keymap(...)
        vim.api.nvim_buf_set_keymap(bufnr, ...)
    end
    buf_set_keymap('n', 'gD', '<cmd>lua vim.lsp.buf.declaration()<cr>', opts)
    buf_set_keymap('n', 'gd', '<cmd>lua vim.lsp.buf.definition()<cr>', opts)
    buf_set_keymap('n', 'gi', '<cmd>lua vim.lsp.buf.implementation()<cr>', opts)
    buf_set_keymap('n', 'gr', '<cmd>lua vim.lsp.buf.references()<cr>', opts)

    buf_set_keymap('n', 'H', '<cmd>lua vim.lsp.buf.hover()<cr>', opts)
    buf_set_keymap('n', '<leader>s', '<cmd>lua vim.lsp.buf.signature_help()<cr>', opts)
    buf_set_keymap('n', '<leader>wa', '<cmd>lua vim.lsp.buf.add_workspace_folder()<cr>', opts)
    buf_set_keymap('n', '<leader>wr', '<cmd>lua vim.lsp.buf.remove_workspace_folder()<cr>', opts)
    buf_set_keymap('n', '<leader>wl', '<cmd>lua print(vim.inspect(vim.lsp.buf.list_workspace_folders()))<cr>', opts)
    buf_set_keymap('n', '<leader>lD', '<cmd>lua vim.lsp.buf.type_definition()<cr>', opts)
    buf_set_keymap('n', '<leader>lr', '<cmd>lua vim.lsp.buf.rename()<CR>', opts)
    buf_set_keymap('n', '<leader>le', "<cmd>lua vim.diagnostic.show_line_diagnostics({float={border='rounded'}})<cr>", opts)
    buf_set_keymap('n', '[d', "<cmd>lua vim.diagnostic.goto_prev({float={border='rounded'}})<cr>", opts)
    buf_set_keymap('n', ']d', "<cmd>lua vim.diagnostic.goto_next({float={border='rounded'}})<cr>", opts)
    buf_set_keymap('n', '<leader>lq', '<cmd>lua vim.diagnostic.set_loclist()<cr>', opts)
    buf_set_keymap('n', '<leader>lf', '<cmd>lua vim.lsp.buf.formatting()<cr>', opts)

    print('LSP Attached.')
end

local function ensure_server(name)
    local lsp_installer = require('nvim-lsp-installer.servers')
    local _, server = lsp_installer.get_server(name)
    if not server:is_installed() then
        server:install()
    end
    return server
end

-- Specific LSP Settings (Python, TS, etc)
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
            eslint_bin = 'eslint',
            eslint_enable_diagnostics = true,
            eslint_opts = {},

            -- formatting
            enable_formatting = true,
            formatter = 'prettier',
            formatter_args = {"--stdin-filepath", "$FILENAME"},
            format_on_save = true,

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
        vim.api.nvim_buf_set_keymap(bufnr, "n", "gi", ":TSLspImportAll<CR>", {silent = true})
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
        fmt.prettier,
        fmt.eslint,
        fmt.rustfmt,
        fmt.terraform_fmt,
        fmt.gofmt,
        dgn.eslint,
        dgn.tsc,
        dgn.pylint,
        dgn.yamllint,
        dgn.cspell,
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
        -- vim.api.nvim_buf_set_keymap(bufnr, 'n', '<leader>lF', 'lua vim.lsp.buf.formatting_sync()', {})
    end,
})

ensure_server('rust_analyzer'):setup({
    capabilities = capabilities,
    on_attach = default_on_attach,
    settings = {
        ["rust-analyzer"] = {
            assist = {
                importMergeBehavior = "last",
                importPrefix = "by_self",
            },
            diagnostics = {
                disabled = { "unresolved-import" }
            },
            cargo = {
                loadOutDirsFromCheck = true
            },
            procMacro = {
                enable = true
            },
            checkOnSave = {
                command = "clippy"
            },
        }
    }
})
