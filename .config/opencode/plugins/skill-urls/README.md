# Skill URLs for OpenCode V2

Adds OMP-style skill references to the existing file tools and native skill
attachments. Tested against OpenCode **2.0.26** and alongside the agent plugin on
**2.0.29**. Development types remain pinned to 2.0.26.

## Usage

```text
Use $github-yeet to commit and push this change.
Use skill://github-yeet to commit and push this change.
```

Both bare mentions attach the exact registered skill ID using OpenCode's native
`skills` input. Prompt text and mention offsets remain intact; existing skill
attachments are preserved and repeated IDs are attached only once. Unknown
`$variables`, escaped tokens, Markdown inline code, and fenced code blocks are
not converted. Supporting-file references remain text until read explicitly.

```json
{"path":"skill://github-yeet"}
{"path":"$github-yeet/references/example.md","offset":1,"limit":100}
```

- `read` maps a bare reference to the registered instruction file, and suffixes
  to files/directories inside its base directory.
- `glob` and `grep` map a bare `path` reference to the base directory.
- `glob` also accepts a qualified pattern such as
  `skill://github-yeet/references/**/*.md` without a separate `path`.
- Explicit `files` attachments using these aliases are converted to `file:`
  URIs before normal prompt admission.
- Search results expose `skill://` paths instead of physical backing paths.
  Native tool options, pagination, result schemas, and limits are preserved.

## Permissions and bounds

File-tool aliases first execute the native skill tool's permission gate, then
delegate to the original file tool. Native `skill`, `read`/search, and
`external_directory` denials remain effective. The plugin does not read file
content directly or auto-approve permission requests. User-selected prompt
attachments follow the same admission path as native `@skill` selections.

Only registered skills resolve. IDs remain case-sensitive. Decoded `..`, absolute
suffixes, backslashes, NULs, and escaping symlinks are rejected. URI query/fragment
selectors are unsupported; use native `offset`/`limit` options instead. A skill
directory itself may be a registered symlink, but its descendants must resolve
inside that directory's canonical root.

Aliases are read-only: `write`, `edit`, and patch operations naming them fail.
To intentionally edit a skill, use its explicit source path with ordinary edit
permissions. No shell interpreter or external command gains URI support.

This is a server plugin, **not a `$` autocomplete provider**. It does not add a
dropdown or replace native `@` completion. It does not implement `agent://`.

## Install and verify

The parent dotfiles config already maps `plugins/` to the global plugin directory;
this package is auto-discovered there. Changes do not require enabling another
provider or copying credentials. Do not apply all dotfiles to install one change.

From this package directory:

```sh
mise exec -- bun install --frozen-lockfile
mise exec -- bun run typecheck
mise exec -- bun test
mise exec -- bun run smoke
```

The smoke test starts and stops a separate OpenCode service on a temporary port
with isolated config/data/cache/state paths and a disposable database. It checks
real native executors, permission denials, containment, and prompt admission
with `resume: false`; no model call or live provider credential is needed. Its
RPC fixture is a separate test-only package and is not auto-discovered globally.

Sources: [V2 plugins](https://opencode.ai/v2/docs/build/plugins/),
[skills](https://opencode.ai/v2/docs/skills/), and
[OMP's skill resolver](https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/internal-urls/skill-protocol.ts).
