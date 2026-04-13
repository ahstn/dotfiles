---
name: code-review-and-quality
description: >-
  Reviews local diffs and GitHub pull requests across correctness, maintainability,
  architecture, security, and performance. Use before merging, when auditing changed
  files, when triaging PR comments, or when you want structured multi-axis review with
  optional parallel axis passes and inline review comments.
---

# Code Review and Quality

## Overview

Review changed code across five axes:

1. Correctness & robustness
2. Maintainability & readability
3. Design & architecture
4. Security & trust boundaries
5. Performance & scalability

Approve when the change clearly improves overall code health.
Do not block on personal taste.
Do not approve blindly.
Prefer discrete, actionable findings over exhaustive commentary.

## Review frame

Choose these three settings before reviewing:

### 1. Source of truth

- **local diff**: review the local git diff
- **github pr**: review the GitHub pull request; GitHub is authoritative for base, head, diff, PR body, and existing review state

If a local checkout exists during GitHub review, only treat it as authoritative when it matches the PR head SHA.

### 2. Execution mode

- **single-agent**: default for small or straightforward changes
- **parallel**: use when the diff is large, high-risk, or clearly benefits from separate axis passes

### 3. Delivery mode

- **thread-only**: return findings in the current conversation
- **github-inline**: post inline PR comments only when explicitly requested or when the environment is clearly set up for PR review automation

Separate reviewing from posting. Draft findings first, then publish only in the requested delivery mode.

## Workflow

### 1. Collect context

Identify:

- the user’s goal, spec, task, or bug being addressed
- base branch or PR base/head
- touched files and tests
- relevant local guidance such as `AGENTS.md`, repo docs, or module-specific conventions

If required context is missing and retrievable, fetch it.
If it is missing and not retrievable, mark the review `[blocked]` instead of guessing.

### 2. Collect the review scope

Review **every changed file**, including tests.
Use pre-computed artifacts if available; otherwise obtain the diff directly.

Local defaults:

- unstaged changes: `git diff`
- staged changes: `git diff --cached`
- branch review: `git diff $(git merge-base HEAD <base-branch>)..HEAD`

For GitHub PR review, read `references/github-review.md`.

### 3. Inspect the change

#### Single-agent mode

Review all five axes in one pass.

#### Parallel mode

After the scope is fixed, launch one **read-only** sub-agent per axis.
Each sub-agent must:

- inspect only its assigned axis
- use the same scope as the others
- return concise findings only
- avoid editing files, staging changes, or posting comments

Axis files for sub-agents:

- `references/axes/correctness.md`
- `references/axes/maintainability.md`
- `references/axes/architecture.md`
- `references/axes/security.md`
- `references/axes/performance.md`

### 4. Aggregate findings

The main agent is responsible for synthesis.

- deduplicate overlapping findings
- keep one finding per distinct issue
- prefer issues the author would likely fix if made aware
- do not report speculative or weakly grounded concerns
- do not restate obvious code or existing comments unless adding new value

### 5. Verify before finalizing

Before returning or posting findings, confirm:

- all changed files were covered
- every finding is tied to a concrete file, line, symbol, or diff hunk
- each finding includes a real failure mode or code-health cost
- each finding has a severity label and primary axis
- delivery mode matches the request

If posting to GitHub, verify inline anchors against the current PR diff before sending comments.

## The five review axes

### 1. Correctness & robustness

Check whether the change behaves as intended under normal and failure conditions.

- Does it match the task, spec, or expected behavior change?
- Are edge cases, error paths, retries, ordering, and state transitions handled correctly?
- Could this introduce races, off-by-one errors, stale state, or broken invariants?
- Do the tests actually cover the changed behavior and catch regressions?

### 2. Maintainability & readability

Check whether the code will be easy to understand and safely change later.

- Are names, control flow, and data flow clear?
- Is the implementation simpler than the problem demands, or more complex?
- Are there new layers, helpers, toggles, or abstractions that do not earn their cost?
- Did the change leave dead code, fallback paths, parameter threading, or speculative structure behind?

### 3. Design & architecture

Check whether the change fits the surrounding system.

- Does it respect module boundaries, ownership, and dependency direction?
- Does it follow an existing pattern, or is the new pattern justified?
- Is there duplication that should stay local, or duplication that should become shared?
- Does the abstraction level match the codebase, without over-generalizing?

### 4. Security & trust boundaries

Check how the change handles untrusted input, permissions, secrets, and data exposure.

- Are trust boundaries explicit and validated?
- Are authentication and authorization enforced where required?
- Could input reach SQL, shell, file system, templates, or browsers unsafely?
- Are secrets, tokens, or sensitive data exposed in code, logs, telemetry, or errors?

### 5. Performance & scalability

Check for avoidable latency, load, and memory cost.

- Any repeated work, N+1 access patterns, or redundant allocations?
- Any unbounded scans, fetches, or loops?
- Any synchronous blocking, unnecessary re-renders, or missing batching/pagination?
- Does the change add cost in a hot path or high-cardinality path?

## Reporting contract

Unless the caller requests a different format, return:

### Verdict

One of:

- `approve`
- `request changes`
- `comment only`
- `[blocked]`

### Findings

For each finding, include:

- severity
- axis
- location
- issue
- why it matters
- suggested direction

Keep findings brief and concrete.

### Verification gaps

List missing or unclear evidence such as:

- missing regression tests
- tests not run
- build status unknown
- manual verification not described where it matters

### Optional notes

Only include clearly useful non-blocking suggestions.

## Progressive disclosure

Read additional references only when needed:

- `references/behaviour-communication.md` for comment style, severity, and disagreement handling
- `references/github-review.md` for GitHub PR retrieval, inline anchors, stale comment handling, and posting rules
- `references/dead-code-and-simplifying.md` when the review surfaces dead code, speculative abstraction, legacy fallbacks, or cleanup opportunities

Keep the core review logic in this file.
Use reference files for optional detail, not for core behavior.
