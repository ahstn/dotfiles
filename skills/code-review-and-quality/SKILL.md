---
name: code-review-and-quality
description: >-
  Reviews local diffs and GitHub pull requests across correctness, maintainability,
  architecture, security, and performance. Use only when the user explicitly invokes
  this skill. Supports review comment triage and optional parallel axis passes.
disable-model-invocation: true
argument-hint: "[target=...] [execution=auto|single-agent|parallel] [delivery=thread-only|github-inline]"
---

# Code Review and Quality

## Overview

Review changed code across six axes:

1. Correctness & robustness
2. Maintainability & readability
3. Design & architecture
4. Security & trust boundaries
5. Performance & scalability
6. Dead code & simplification

Approve when the change clearly improves overall code health.
Do not block on personal taste.
Do not approve blindly.
Prefer discrete, actionable findings over exhaustive commentary.

## Invocation options

Caller options: $ARGUMENTS

Read named options from the invocation text or the caller's prompt. Options can appear in any order. Accept equivalent plain-language requests and apply defaults only to omitted settings. If the client leaves placeholders unchanged, ignore them and use the caller's prompt.

| Option | Values | Default |
| --- | --- | --- |
| `target` | `unstaged`, `staged`, `branch:<ref>`, or a GitHub PR URL | Use the scope requested in the conversation; otherwise `unstaged`. |
| `execution` | `auto`, `single-agent`, `parallel` | `auto` |
| `delivery` | `thread-only`, `github-inline` | `thread-only` |

Resolve invalid or conflicting options before the affected action. If delivery is unresolved, draft findings without posting. Use the [Reporting contract](#reporting-contract) unless the caller requests another format.

### Target and source

Local targets select the corresponding git diff. For `branch:<ref>`, compare HEAD with its merge base against `<ref>`.

A PR URL selects GitHub as authoritative for base, head, diff, PR body, and existing review state. A local checkout is authoritative only when its HEAD matches the PR head SHA. A PR URL alone keeps `thread-only` delivery.

### Execution

- **single-agent**: review all axes in the main agent. This explicit override prohibits delegation.
- **parallel**: run separate read-only axis passes as described in the workflow.

For **auto**, count added plus deleted lines across the selected diff, including tests. Count a replacement as one addition and one deletion; do not use net line growth.

- **Fewer than 80 changed lines:** use one agent to cover all axes. Delegate only a bounded question whose answer could materially change the review.
- **80 changed lines or more:** use parallel mode when the scope, complexity, or risk benefits from separate axis passes. Straightforward changes can stay in single-agent mode.

After collecting the scope, state the target, selected execution mode, and delivery mode. Give a brief reason for the execution choice. Both modes must cover every changed file and meet the same finding and verification requirements.

### Delivery

- **thread-only**: return findings in the current conversation.
- **github-inline**: publish inline comments on the selected GitHub PR after aggregation and verification. An explicit caller option or equivalent request authorizes publication. This mode requires a GitHub PR target.

### Examples

```text
/code-review-and-quality target=staged execution=single-agent
$code-review-and-quality target=branch:main execution=auto delivery=thread-only
/code-review-and-quality target=https://github.com/owner/repo/pull/123 delivery=github-inline
```

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

For the resolved local target:

- unstaged changes: `git diff`
- staged changes: `git diff --cached`
- branch review: `git diff $(git merge-base HEAD <base-branch>)..HEAD`

For GitHub PR review, read `references/github-review.md`.

#### Existing review comments and historical findings

When review comments or prior findings are available, use them as evidence leads, not as ground truth.

- Inventory every accessible inline comment, reply, review body, and top-level comment before drawing conclusions from review history.
- Classify each material concern as still valid, fixed or stale, outside the current diff, incorrect, or unverifiable from available evidence.
- Inspect the referenced code and current patch. Do not infer a defect from comment text alone.
- Generalize a concern only when it names an observable invariant, failure mode, trust boundary, cost shape, or maintenance burden that applies beyond one repository or implementation.
- Map each valid generic concern to one owner axis. Add a new check only when the current rubric and finding bar would not already catch it.
- Keep protocol- or framework-specific details only when that protocol or framework defines the contract under review.

This pre-emption pass should improve recall without training the rubric to repeat stale comments or one-off implementation advice.

### 3. Inspect the change

#### Single-agent mode

Review all six axes in one pass. Load all six axis files listed below.

#### Parallel mode

After the scope is fixed, launch one **read-only** sub-agent per axis.
Each sub-agent must:

- inspect only its assigned axis
- use the same scope as the others
- return concise findings only
- avoid editing files, staging changes, or posting comments

Axis files:

- `references/axes/correctness.md`
- `references/axes/maintainability.md`
- `references/axes/architecture.md`
- `references/axes/security.md`
- `references/axes/performance.md`
- `references/axes/dead-code-and-simplifying.md`

#### Axis ownership

- **Correctness** owns behavior, contracts, invariants, state transitions, failure semantics, ordering, atomicity, concurrency, and regression coverage.
- **Maintainability** owns local cognitive load: naming, control and data flow, comments, error context, and readable tests.
- **Architecture** owns canonical placement, dependency direction, encapsulation, public contract shape, data ownership, and cross-layer coupling.
- **Security** owns trust-boundary flows involving untrusted data, identity, authority, sensitive assets, and attacker-controlled resource use.
- **Performance** owns normal-workload cost: complexity, I/O count, allocations and copies, contention, concurrency bounds, backpressure, and performance evidence.
- **Dead code and simplification** owns the structural delta: concepts, decision points, modes, wrappers, reachable states, and removable paths added or retained by the patch.

An axis agent may use evidence from another axis to explain its primary concern, but it should not emit that other axis's finding. The main agent resolves overlap and reports each distinct issue once.

### 4. Aggregate findings

The main agent is responsible for synthesis.

- deduplicate overlapping findings
- keep one finding per distinct issue
- prefer issues the author would likely fix if made aware
- do not report speculative or weakly grounded concerns
- do not restate obvious code or existing comments unless adding new value
- sort by severity; within the same severity, prioritize structural regressions and concrete simplifications over local legibility notes

Comment(s) posted should follow a Flesch–Kincaid readability score between 60 and 80 and use ASD-STE100 Technical English.

### 5. Verify before finalizing

Before returning or posting findings, confirm:

- all changed files were covered
- every finding is tied to a concrete file, line, symbol, or diff hunk
- each finding includes a real failure mode or code-health cost
- each finding has a severity label and primary axis
- no clear structural regression remains merely because the changed behavior works or tests pass
- delivery mode matches the request
- available review comments and historical findings were reconciled, and each valid recurring concern is covered once by its owner axis

If posting to GitHub, verify inline anchors against the current PR diff before sending comments.

## The six review axes

### 1. Correctness & robustness

Check whether the change behaves as intended under normal and failure conditions.

- Does it match the task, spec, or expected behavior change?
- Are edge cases, error paths, retries, ordering, and state transitions handled correctly?
- Could this introduce races, off-by-one errors, stale state, or broken invariants?
- Do the tests actually cover the changed behavior and catch regressions?
- Could related writes leave invalid partial state?

### 2. Maintainability & readability

Check whether the code will be easy to understand and safely change later.

- Are names, control flow, and data flow clear?
- Can a reader understand the code that remains without the author explaining it?
- Is related code grouped so the local flow is easy to follow?
- Do comments explain non-obvious intent without restating the implementation?

### 3. Design & architecture

Check whether the change fits the surrounding system.

- Does it respect module boundaries, ownership, and dependency direction?
- Does it follow an existing pattern, or is the new pattern justified?
- Does responsibility stay with its canonical owner without coupling unrelated layers?
- Are public API and contract boundaries narrow, explicit, and consistent with the codebase?

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
- Is independent work serialized without a correctness or resource-ordering reason?

### 6. Dead code & simplification

Check whether the patch leaves removable code or adds avoidable incidental complexity.

- Did the change leave unused code, obsolete paths, compatibility shims, or speculative structure behind?
- Can a concrete reframe remove branches, modes, wrappers, layers, or reachable states?
- Are new abstractions and helpers necessary, or do they add indirection without clarity?
- Does file growth reveal a cohesive unit that should be extracted, without splitting by line count alone?

## Reporting contract

The default report contains the following fields.

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

Keep the core review logic in this file.
Axis reference files define core axis behavior. Use the remaining references for optional detail.
