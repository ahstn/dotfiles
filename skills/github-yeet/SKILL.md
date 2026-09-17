---
name: "github-yeet"
description: "Use only when the user explicitly asks to stage, commit, push, and open a GitHub pull request"
compatibility: requires `gh` cli
metadata: 
  author: OpenAI
  source: https://github.com/openai/skills
---

## Prerequisites

- Require GitHub CLI `gh`. Check `gh --version`. If missing, ask the user to install `gh` and stop.
- Require authenticated `gh` session. Run `gh auth status`. If not authenticated, ask the user to run `gh auth login` (and re-run `gh auth status`) before continuing.

## Naming conventions

MUST follow the conventional commits specification for commit, branch and PR titles.

- Branch: `<type>/{description}` when starting from main/master/default.
- Commit: `<type>(optional scope): {terse description}`.
  - Example: `feat(api): send customer email when product ships
- PR title: `<type>(optional scope): {terse description}` summarizing the full diff.
- Valid types: `build`. `chore`, `ci`, `docs`, `feat`, `fix`, `perf` `refactor`, `revert`, `style`, `test`

## Workflow

1. If on main/master/default, create a branch: `git checkout -b "{description}"`
2. Otherwise stay on the current branch.
3. Only stage files changed in this session, ignore unrelated changes and/or any pre-existing unstaged files.
4. Commit tersely with the description: `git commit -m "{description}"`
5. Push with tracking: `git push -u origin $(git branch --show-current)`
6. Discover and read the repository PR template, if any.
7. Check whether the current branch already has a PR: `gh pr view "$(git branch --show-current)" --json number,isDraft,url`
8. If a PR already exists, update that PR in place.
9. If no PR exists, open a new draft PR with `gh pr create --help`, avoid draft PRs unless explictly requested.
  i. Set the PR title and body so they reflect the actual net change in the diff.

## Determining the PR

When updating a PR created earlier in the flow, infer the PR from the current branch when possible:

```shell
git branch --show-current
gh pr view "$(git branch --show-current)" --json number --jq '.number'
```

If this finds an existing PR, preserve its current review state. Never convert an existing ready-for-review PR back to draft as part of `yeet`; only new PRs created by this flow should start as draft.

## PR Body & Description

### PR template discovery

Before creating the PR, resolve the repository root and look for the active GitHub PR template from there:

```shell
repo_root="$(git rev-parse --show-toplevel)"
```

Template candidates: `.github/pull_request_template.md` or `.github/pull_request_template/*.md`.

1. If multiple template files are found, stop before PR creation and ask which template to use. 
2. If exactly one template is found, read it before composing the final PR body and 
3. If no template exists, use the fallback body shape in this skill.
4. Use the template with `gh pr create --help`.

### PR Body

It is essential to explain _why_ the change is being made. Limit discussion to the _net change_ of the commit(s). 

DO:
- Write a concise body, brevity is key.
- Use bullet points for the text you do write.
- Utilise mermaid codeblock diagrams for visualising larger scale changes (>= 4 services, components, modules)
- For frontend, UI or UX changes: create a table of before and after with uploaded images/videos.

DO NOT:
- Include intermediate PR details, attempted changes that didn't land in the PR, refactored commits in the this PR, etc
- Restate obvious CI tasks that were ran locally, e.g. automated tests, linting, etc

### Suggested PR Body Shape

Use this as a fallback when the repository does not have a PR template:

```md
<!-- PR title format must follow Conventional Commits, for example `build(gateway): add release workflow`. -->

## Overview

A clear and concise description of this PR.

Use this section for review hints, explanations, discussion points, and follow-up TODOs.

- Lorem Lipsum

## Verfication

<!-- Checklist of tasks preformed in addition to CI checks, linting, automated tests, etc-->

- [x] Verified new behaviour locally in browser.

## Related Issues & Pull Requests

<!-- 
If closing GitHub issues, reference these here. 
For issues, explicitly mention "Closes" or "Resolves" to auto-resolve the issue on PR merge.

If a JIRA issue can be inferred from context, notes or branch name, reference it here.
-->
```