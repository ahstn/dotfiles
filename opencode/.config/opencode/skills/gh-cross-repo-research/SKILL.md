---
name: gh-cross-repo-research
description: Research GitHub APIs, SDK/library implementations, and cross-repo references before implementing features or integrations. Use when tasks require studying adjacent repositories (microservices, split frontend/backend), inspecting PRs in other repos, searching implementation patterns with gh search, retrieving repo files via gh api, or building evidence-backed implementation plans.
---

# GH Cross-Repo Research

## Overview

Use this skill to collect implementation evidence across repositories and docs before coding. Prefer precise, reproducible command output and cite concrete references (repo/path, PR number, commit SHA, docs URL).

## Operating Rules

1. Treat `references/gh-cli-command-index.md` as a quick lookup only.
2. Always verify command flags with live help:
   ```bash
   gh <command> --help
   ```
3. If command behavior is uncertain, refresh local help snapshots:
   ```bash
   bash scripts/refresh_gh_help_snapshot.sh
   ```
4. For external documentation and API behavior, use web research (EXA MCP when available), not memory alone.
5. Keep outputs concise and evidence-backed; avoid speculative conclusions.

## Workflow

1. Define the target integration question and the relevant repos/services.
2. Collect repository context (README, top-level directories, recent commits, open/merged PRs).
3. Search for concrete implementation references (`gh search code`, `gh search prs`, `gh pr view`, `gh pr diff`).
4. Retrieve exact file contents or API payloads with `gh api` when code search is insufficient.
5. Cross-check with official docs before recommending implementation details.
6. Synthesize into an implementation brief: findings, reusable patterns, risks, and open questions.

For detailed command patterns and sequencing, read:

- `references/research-workflow.md`
- `references/gh-cli-command-index.md`

For prompt composition and scope-control guidance, read:

- `references/prompting-and-skill-design.md`

## Output Contract

When this skill is used, return results in this shape:

1. **Objective**: one-sentence restatement of the integration/research goal.
2. **Key Findings**: concrete references from repos/docs.
3. **Implementation Pattern**: recommended approach grounded in findings.
4. **Evidence**: command snippets and links/paths/PR numbers.
5. **Open Questions**: only blockers that materially affect implementation.
