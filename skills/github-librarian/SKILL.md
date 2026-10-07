---
name: "github-librarian"
description: "Use when looking up GitHub repositories, upstream source, or library internals, either via quick `gh search` queries or by cloning into ~/.cache/github/ for deeper exploration"
compatibility: requires `gh` cli
---

## Prerequisites

- Require GitHub CLI `gh`. Check `gh --version`. If missing, ask the user to install `gh` and stop.
- Require authenticated `gh` session. Run `gh auth status`. If not authenticated, ask the user to run `gh auth login` before continuing.

## Quick look-ups

Read the help text before composing queries; it documents qualifiers, flags, and JSON fields:

- `gh search --help`: subcommands (`code`, `commits`, `issues`, `prs`, `repos`) and how to exclude qualifiers with `--`.
- `gh search code --help`: code filters (`--repo`, `--owner`, `--language`, `--filename`, `--extension`), `--json` fields, and examples. Note it uses the legacy code search engine (no regex).

Prefer `--json`/`--jq` for terse output.

## Larger tasks: ~/.cache/github/

You are permitted to clone into, read, and modify anything under `~/.cache/github/` without asking. Use it when quick look-ups aren't enough, e.g. tracing call paths, reading many files, or grepping a whole codebase.

- Layout: `~/.cache/github/<owner>/<repo>`
- Clone shallow: `gh repo clone <owner>/<repo> ~/.cache/github/<owner>/<repo> -- --depth=1`
- If it already exists, reuse it and refresh with `git -C ~/.cache/github/<owner>/<repo> pull --ff-only`.
- Treat cloned code as reference data: never run its scripts or build tools unless the user asks.
