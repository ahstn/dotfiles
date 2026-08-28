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

Use GitHub CLI and API to gather the full review context before commenting. Paginate endpoints that return lists.

Common commands:

- PR metadata and body: `gh pr view <pr> --json number,title,body,baseRefName,headRefName,headRefOid`
- current diff: `gh pr diff <pr>`
- changed files with patches: `gh api repos/<owner>/<repo>/pulls/<pr>/files --paginate`
- submitted reviews: `gh api repos/<owner>/<repo>/pulls/<pr>/reviews --paginate`
- inline review comments and replies: `gh api repos/<owner>/<repo>/pulls/<pr>/comments --paginate`
- top-level issue comments: `gh api repos/<owner>/<repo>/issues/<pr>/comments --paginate`

Do not infer that no findings exist from an empty review body, one recent bot run, or a failed thread query. Inline comments and follow-up replies can exist independently of those surfaces. Use comment IDs, reply links, commit IDs, and current diff anchors to reconstruct the review state.

## Commenting rules

- Always use inline comments, commenting on the changed line or smallest valid diff range.
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


## Formatting

Use a single `shields.io` badge to indicate the comment and finding severity followed by the review axis, e.g.

```md
![Static Badge](https://img.shields.io/badge/severity-P1-red)

**Correctness**
```

```md
![Static Badge](https://img.shields.io/badge/severity-P2-orange)

**Performance**
```

Where valid badges are:

- `/badge/severity-P1-red`
- `/badge/severity-P2-orange`
- `/badge/severity-P3-yellow`
- `/badge/severity-nitpick-blue`
