# GH CLI Command Index (Quick Lookup)

This file is a quick index for common cross-repo research commands.

`gh` changes over time. Before using flags, always run:

```bash
gh <command> --help
```

## Version Baseline

- Verified on: `gh version 2.74.2 (2025-06-17)`
- Snapshot source: local `--help` traversal

## High-Value Commands

### API and Repository Contents

```bash
# View repository contents
gh api repos/{owner}/{repo}/contents/{path}

# Get file content (decoded)
gh api repos/{owner}/{repo}/contents/{path} --jq '.content' | base64 -d

# List names under a directory
gh api repos/{owner}/{repo}/contents/{path} --jq '.[].name'

# Get README (decoded)
gh api repos/{owner}/{repo}/readme --jq '.content' | base64 -d

# View recent commits (first 5)
gh api repos/{owner}/{repo}/commits --jq '.[0:5]'
```

Useful `gh api` flags:

- `--paginate`, `--slurp` for multi-page responses
- `--jq` for inline extraction
- `--method`, `--header`, `--field` for custom calls

### Code and PR Search

```bash
# Search code in one repo
gh search code "query" --repo owner/repo

# Search code by language
gh search code "query" --language typescript --limit 40

# Search PRs with qualifiers
gh search prs "auth middleware" --repo owner/repo --state open
```

Useful `gh search code` flags:

- `--repo`, `--owner`, `--language`, `--extension`, `--filename`
- `--match {file|path}`, `--limit`, `--json`, `--jq`

Useful `gh search prs` flags:

- `--repo`, `--owner`, `--state`, `--author`, `--assignee`
- `--label`, `--review`, `--review-requested`, `--base`, `--head`
- `--json`, `--jq`

Note: `gh search code` help states results are currently served by a legacy API search engine and may differ from the web UI.

### Pull Request Inspection Across Repos

```bash
# View PR details from another repo
gh pr view <number> --repo {owner}/{repo}

# View PR diff from another repo
gh pr diff <number> --repo {owner}/{repo}

# List PRs in another repo
gh pr list --repo {owner}/{repo} --state all --limit 50
```

Useful `gh pr view` flags:

- `--comments`, `--json`, `--jq`, `--template`

Useful `gh pr diff` flags:

- `--name-only`, `--patch`, `--color`

Useful `gh pr list` flags:

- `--state {open|closed|merged|all}`, `--search`, `--author`, `--assignee`
- `--base`, `--head`, `--label`, `--json`, `--jq`

### Repository Discovery and Context

```bash
# Find candidate repos
gh search repos "gateway auth" --owner my-org --limit 20

# Inspect repo summary/readme
gh repo view owner/repo

# List org/user repos
gh repo list owner --limit 100
```

## Formatting and Parsing

For commands supporting JSON output:

```bash
gh <command> --json <fields> --jq '<jq-expression>'
```

For API responses:

```bash
gh api <endpoint> --jq '<jq-expression>'
```

Formatting reference:

- `gh help formatting`

## Manual Pages

- https://cli.github.com/manual/gh_pr_view
- https://cli.github.com/manual/gh_pr_list
- https://cli.github.com/manual/gh_pr_diff
- https://cli.github.com/manual/gh_help_formatting
- https://cli.github.com/manual/gh_search_code
- https://cli.github.com/manual/gh_search_prs
