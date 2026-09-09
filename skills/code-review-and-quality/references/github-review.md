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

Use GitHub CLI and API to gather the patch and relevant review context. Paginate endpoints that return lists.

Common commands:

- PR metadata and body: `gh pr view <pr> --json number,title,body,baseRefName,headRefName,headRefOid`
- current diff: `gh pr diff <pr>`
- changed files with patches: `gh api repos/<owner>/<repo>/pulls/<pr>/files --paginate`
- submitted reviews: `gh api repos/<owner>/<repo>/pulls/<pr>/reviews --paginate`
- inline review comments and replies: `gh api repos/<owner>/<repo>/pulls/<pr>/comments --paginate`
- top-level issue comments: `gh api repos/<owner>/<repo>/issues/<pr>/comments --paginate`
- review-thread resolution state: use the paginated GraphQL query below

```sh
gh api graphql --paginate \
  -F 'owner=<owner>' -F 'repo=<repo>' -F 'pr=<pr>' \
  -f query='query(
    $owner: String!
    $repo: String!
    $pr: Int!
    $endCursor: String
  ) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $pr) {
        reviewThreads(first: 100, after: $endCursor) {
          nodes {
            id
            isResolved
            isOutdated
            comments(first: 1) {
              nodes { databaseId url }
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }
    }
  }'
```

When checking thread state, match each thread's first comment to the fully paginated REST comments. Use this mapping to distinguish unresolved, resolved, and outdated findings.

## Review history

For a normal review, inspect history relevant to the current patch and candidate findings. Check current code and replies before reporting an issue, and avoid duplicating an unresolved finding.

For an explicit review-history triage request:

- inventory every accessible inline comment, reply, review body, and top-level comment
- classify each material concern as still valid, fixed or stale, outside the current diff, incorrect, or unverifiable
- compare each concern with the current code and patch; treat comment text as an evidence lead, not proof
- report material access or evidence gaps instead of treating missing results as a clean history

Do not infer that no findings exist from an empty review body, one recent bot run, or a failed thread query. Inline comments and follow-up replies can exist independently of those surfaces. Use comment IDs, reply links, commit IDs, and current diff anchors to reconstruct the review state.

## Commenting

Use the caller's delivery mode from [Invocation options](../SKILL.md#invocation-options). Apply [Finding requirements](../SKILL.md#finding-requirements) before publication.

Post inline findings on the changed line or smallest valid diff range. Do not post top-level `LGTM` or `no issues` comments unless requested.

Changing existing comments requires an explicit comment-management request. Publication alone does not authorize deletion, minimization, resolution, or superseding older comments. When those changes are already authorized, act within that scope without asking again.

## Safety checks before posting

Before sending comments:

1. verify the PR head SHA has not changed
2. verify file path and diff position against the current PR diff
3. verify each posted comment is still relevant to the latest patch

If these checks fail, refresh the review context before posting.

## Formatting

Use the canonical P1, P2, or P3 severity and the primary axis. A plain-text label is sufficient. An optional badge can display the same severity:

```md
![P2](https://img.shields.io/badge/severity-P2-orange)

**Performance**
```

For badges, use `P1-red`, `P2-orange`, or `P3-yellow` after `severity-`. Keep requested nits outside formal findings and do not assign them a severity badge.
