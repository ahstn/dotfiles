# Repository instructions

## Work and personal model configuration

These tracked files differ between work and personal environments:

- `.pi/agent/models.json`
- `.pi/agent/settings.json`
- `.omp/agent/models.yml`

Their machine-local work copies are:

- `.pi/agent/models.work.json`
- `.pi/agent/settings.work.json`
- `.omp/agent/models.work.yml`

Rules:

- Never delete, overwrite, stage, or commit the work copies.
- Before changing a tracked file through Git, confirm its work copy exists and preserve unrelated worktree changes.
- When consuming the personal remote, use the incoming tracked files and leave the work copies unchanged.
- When restoring work configuration, use the work copies. Do not infer work providers from personal configuration.
- Resolve these files individually. Do not use blanket `ours` or `theirs`, merge work-only providers into personal configuration, or reorder and prune entries during unrelated work.
- Never commit credentials, tokens, or machine-local provider details.
- Prefer an isolated worktree over stashing or resetting unrelated changes.
