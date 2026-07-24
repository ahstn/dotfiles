# GitHub PR Review

Load this file when the source of truth is a GitHub pull request or when posting inline review comments.

## Source of truth

Treat the GitHub PR as authoritative for:

- base branch
- head SHA
- PR description
- changed files
- current diff
- existing review state

If a local checkout exists, only use it as authoritative when its HEAD matches the PR head SHA.
Otherwise prefer GitHub data.

## Retrieval

Use GitHub CLI and API to gather review context before commenting.

Common commands:

- PR metadata and body: `gh pr view <pr> --json number,title,body,baseRefName,headRefName,headRefOid`
- current diff: `gh pr diff <pr>`
- changed files with patches: `gh api repos/<owner>/<repo>/pulls/<pr>/files --paginate`
- existing comments and review state: `gh pr view <pr> --json comments,reviews,reviewThreads`

## Commenting rules

- Prefer inline comments on the changed line or smallest valid diff range.
- Keep one comment per distinct issue.
- Do not post top-level `LGTM` or `no issues` comments unless explicitly requested.
- Draft findings first, then post only after aggregation and deduplication.

## Existing bot comments

Before posting new comments:

- check for unresolved prior bot comments on the same issue
- avoid duplicating an existing unresolved finding
- if older bot comments are clearly superseded, remove, minimize, resolve, or mark them as superseded when tooling permits
- if a previously reported issue now appears fixed, resolve or acknowledge that update when appropriate

## Safety checks before posting

Before sending comments:

1. verify the PR head SHA has not changed
2. verify file path and diff position against the current PR diff
3. verify each posted comment is still relevant to the latest patch

If these checks fail, refresh the review context before posting.
