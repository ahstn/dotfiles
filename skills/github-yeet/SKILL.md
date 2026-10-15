---
name: "github-yeet"
description: "Stages, commits, pushes and opens or updates GitHub pull requests, then optionally watches the PR and fixes failing CI, merge conflicts and review comments until it is ready. Use only when the user explicitly asks to commit, push or open a PR, or asks to watch, babysit or autofix a PR."
compatibility: requires `gh` cli; watch & autofix also requires `bun` >= 1.3.2
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
10. If the user asked to watch, babysit or autofix the PR, continue with [Watch & autofix](#watch--autofix). Otherwise stop after reporting the PR URL.

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
  - Upload with `--attach` on `gh pr create`/`gh pr edit` ([docs](https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli)). Reference each file inline in the table cell, `| ![alt text](./after.png) |`, and pass the identical path (`--attach ./after.png`); gh rewrites the reference in place and keeps the Markdown alt text.
  - Avoid `--attach 'file#alt'` for tables: that alt only applies to unreferenced files, which are appended after the whole body.

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

## Watch & autofix

Only when the user asks for it, in this turn or a later one. Never start it on your own after a plain yeet.

Paths are relative to this skill's directory. Run from the repository checkout:

```shell
<skill-dir>/scripts/watch-pr/watch-pr --pr <number> --allow-draft --timeout 540
```

- Add `--allow-no-checks` when the repository has no CI. Without it, a PR with no checks ends in exit 7.
- `--timeout 540` keeps one run under a 10 minute shell tool limit. Exit 5 means "still pending", so rerun it.
- Output is NDJSON. The last line is the verdict. Act on the exit code:

| Exit | Verdict | Do |
| --- | --- | --- |
| 0 | `READY`, or the PR merged | Report and stop. |
| 2 | Merge conflicts | [autofix.md: Conflicts](references/autofix.md#conflicts) |
| 3 | Actionable review threads | [autofix.md: Review threads](references/autofix.md#review-threads) |
| 4 | Failing checks | [autofix.md: Failing checks](references/autofix.md#failing-checks) |
| 5 | Timeout, checks still pending | Rerun the watcher. |
| 6 | Merge gate: changes requested, or PR closed | Report. A human has to act. |
| 7 | GitHub query failed | Check `gh auth status` and the PR number, then report. |
| 64 | Bad arguments | Fix the command. |

Read [references/autofix.md](references/autofix.md) before the first fix. It holds the guardrails and the fix, push, rerun loop.

Some harnesses wake the agent for you: in pi, `/autofix` runs the watcher in the background and sends you the verdict as a message. When you get such a message, skip the watcher run and act on its verdict.

