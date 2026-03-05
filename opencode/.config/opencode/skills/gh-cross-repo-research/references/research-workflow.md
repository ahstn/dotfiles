# Cross-Repo Research Workflow

Use this workflow before implementing integrations or features that depend on external repos, adjacent services, or SDK behavior.

## 1) Frame the Research Target

Define:

- integration goal
- target owner/repo list
- language/runtime constraints
- API/SDK surface to verify

If repo candidates are unknown:

```bash
gh search repos "query" --owner <org> --limit 20
```

## 2) Gather Repo Orientation

For each candidate repo:

```bash
gh repo view <owner>/<repo>
gh api repos/<owner>/<repo>/readme --jq '.content' | base64 -d
gh api repos/<owner>/<repo>/contents/ --jq '.[].name'
gh api repos/<owner>/<repo>/commits --jq '.[0:5]'
```

Goal: identify likely directories and freshness of implementation.

## 3) Find Concrete Code References

Search for patterns in specific repos first, then broaden:

```bash
gh search code "query" --repo <owner>/<repo> --language typescript --limit 40
gh search code "query" --owner <org> --language go --limit 60
```

When searching, include:

- API endpoints
- SDK method names
- config keys/env vars
- error codes/status handling
- auth/retry/pagination logic

## 4) Inspect PRs for Rationale and Deltas

PR history often explains intent and tradeoffs:

```bash
gh pr list --repo <owner>/<repo> --state all --search "query" --limit 20
gh pr view <number> --repo <owner>/<repo> --comments
gh pr diff <number> --repo <owner>/<repo>
```

Use this to validate whether a pattern is current or superseded.

## 5) Pull Exact File Contents When Needed

If search output is insufficient, fetch full files:

```bash
gh api repos/<owner>/<repo>/contents/<path> --jq '.content' | base64 -d
```

For directories:

```bash
gh api repos/<owner>/<repo>/contents/<path> --jq '.[].name'
```

## 6) Verify Against Official Docs

For APIs and SDKs, confirm behavior using official docs before implementation.

Recommended practice:

1. Use EXA MCP web search for official docs and recent changes.
2. Cross-check claims from repo code with docs.
3. Record version/date context when behavior may drift.

## 7) Synthesize an Implementation Brief

Return a concise brief with:

1. Objective
2. Key findings (repo/path/PR/commit)
3. Recommended implementation pattern
4. Risks/tradeoffs
5. Open questions/blockers

## Quality Bar

- Prefer direct evidence over assumptions.
- Prefer newest maintained patterns over stale examples.
- Explicitly call out uncertainty and what to verify next.
- Keep command output references reproducible.
