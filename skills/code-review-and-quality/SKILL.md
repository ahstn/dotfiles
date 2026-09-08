---
name: code-review-and-quality
description: >-
  Reviews local diffs and GitHub pull requests for defects and material code-health costs.
  Use only when explicitly invoked. Supports review comment triage and parallel axis passes.
disable-model-invocation: true
argument-hint: "[target=...] [execution=auto|single-agent|parallel] [delivery=thread-only|github-inline]"
---

# Code Review and Quality

## Purpose and review boundary

Review the agreed change for concrete defects and material code-health costs. The caller's explicit instructions take precedence over skill defaults. Cover every changed file and all axes by default; honor a requested subset of files or axes and state that scope.

Review without editing the patch or the rubric unless the caller requests those changes.

## Invocation options

Caller options: $ARGUMENTS

Read named options from the invocation text or the caller's prompt, in any order. Accept equivalent plain-language requests and apply defaults only to omitted settings. If the client leaves placeholders unchanged, ignore them and use the caller's prompt.

| Option | Values | Default |
| --- | --- | --- |
| `target` | `unstaged`, `staged`, `branch:<ref>`, or a GitHub PR URL | Use the scope requested in the conversation; otherwise `unstaged`. |
| `execution` | `auto`, `single-agent`, `parallel` | `auto` |
| `delivery` | `thread-only`, `github-inline` | `thread-only` |

Resolve invalid or conflicting options before the affected action. Continue independent review work while clarification is pending. If delivery is unresolved, draft findings without posting. Use the [Reporting contract](#reporting-contract) unless the caller requests another format.

### Target and source

Local targets select the corresponding git diff. A PR URL selects GitHub as authoritative for base, head, diff, PR body, and existing review state. A local checkout is authoritative for a PR only when its HEAD matches the PR head SHA. A PR URL alone keeps `thread-only` delivery.

### Execution

- **single-agent**: review in the main agent. This explicit override prohibits delegation.
- **parallel**: run separate axis passes within the client's available concurrency. If delegation is unavailable, perform the passes directly and disclose the fallback.

For **auto**, count added plus deleted lines across the selected diff, including tests. A replacement counts as one addition and one deletion; do not use net line growth.

- **Fewer than 80 changed lines:** use one agent. Delegate only a bounded question whose answer could materially change the review.
- **80 changed lines or more:** use parallel mode when scope, complexity, or risk benefits from separate passes. Straightforward changes can stay in single-agent mode.

After collecting the scope, state the target, execution choice and brief reason, and delivery mode.

### Delivery

- **thread-only**: return findings in the current conversation.
- **github-inline**: publish inline comments on the selected GitHub PR after verification. An explicit caller option or equivalent request authorizes publication. This mode requires a GitHub PR target.

### Examples

```text
/code-review-and-quality target=staged execution=single-agent
$code-review-and-quality target=branch:main execution=auto delivery=thread-only
/code-review-and-quality target=https://github.com/owner/repo/pull/123 delivery=github-inline
```

## Axis reference map

The guides own the detailed checks and axis-specific evidence requirements. Ownership determines where to report an issue; evidence can cross axis boundaries.

| Axis and guide | Owned concern |
| --- | --- |
| [Correctness & robustness](references/axes/correctness.md) | Behavior, contracts, invariants, failure paths, ordering, atomicity, concurrency, and regression coverage. |
| [Maintainability & readability](references/axes/maintainability.md) | Local clarity: naming, control and data flow, comments, error context, and readable tests. |
| [Design & architecture](references/axes/architecture.md) | Placement, ownership, dependency direction, encapsulation, public contracts, and cross-layer coupling. |
| [Security & trust boundaries](references/axes/security.md) | Untrusted input, identity, authority, sensitive data, and attacker-controlled resource use. |
| [Performance & scalability](references/axes/performance.md) | Normal-workload cost: complexity, I/O, allocations, contention, concurrency bounds, and backpressure. |
| [Dead code & simplification](references/axes/dead-code-and-simplifying.md) | Removable code, concepts, decision points, wrappers, modes, and reachable states. |

## Workflow

### 1. Collect the agreed scope

Identify the intended behavior, base and head, changed files and tests, and relevant project guidance. Fetch missing context when it is retrievable. Continue with available evidence and state material gaps; use `[blocked]` only when missing information prevents a meaningful review.

Review every changed file in the agreed scope, including tests. Use current pre-computed artifacts when available; otherwise obtain the selected diff:

- `unstaged`: `git diff`
- `staged`: `git diff --cached`
- `branch:<ref>`: `git diff $(git merge-base HEAD <ref>)..HEAD`

For a PR target, read [GitHub review](references/github-review.md) before retrieving context or publishing findings. Treat prior comments as evidence leads: check relevant concerns against the current patch and avoid duplicate findings. The reference defines the additional work for explicit history triage and comment management.

### 2. Inspect and delegate

In single-agent mode, read each guide when starting its axis pass. Complete every axis in the agreed scope; reading in stages does not make its checks optional.

In parallel mode, assign one read-only pass per selected axis and schedule passes within available capacity. Give each child the same fixed scope, its axis guide, the [Finding requirements](#finding-requirements), and the [Reporting contract](#reporting-contract). Children return concise findings without editing files, staging changes, or posting comments.

The main agent reads the relevant guide when validating a delegated finding. It remains responsible for complete scope coverage and the final review.

### 3. Validate and report

Validate candidate findings against the source and axis guide. Deduplicate underlying issues and select one primary axis per finding. Sort by severity; within a severity, prioritize material structural costs over local legibility notes.

Use existing verification evidence and focused checks to resolve material uncertainty. Complete project-required checks that apply to the review. Broaden or repeat checks only when new changes, failures, or unresolved concerns justify them. Do not require tests that merely mirror implementation details.

Before finalizing, confirm coverage of the agreed files and axes, the evidence for each finding, and the requested delivery. For publication, follow the current-head and inline-anchor checks in the GitHub reference.

## Finding requirements

Report distinct, actionable issues introduced or worsened by the change, including paths the change makes unused or misleading. Each finding needs a concrete failure mode or material maintenance cost, a precise code location, and a correction direction. Do not report pure taste, speculative risks without a concrete path, or unrelated pre-existing issues.

Structural findings can block approval even when behavior is correct and tests pass. Apply the same evidence bar in every execution and delivery mode.

Assign severity from the demonstrated consequence; do not assign a default severity.

| Severity | Meaning |
| --- | --- |
| `P1` | High-impact defect or structural regression that blocks approval. |
| `P2` | Material defect or maintenance cost that should be fixed before merge. |
| `P3` | Concrete, non-blocking improvement that can follow after merge. |

Approve when the change improves overall code health and no blocking findings remain. Use `request changes` for unresolved P1 or P2 findings; use `comment only` for non-blocking feedback or an unresolved question that prevents an approval decision.

## Reporting contract

Return a verdict (`approve`, `request changes`, `comment only`, or `[blocked]`), findings, and material verification gaps. Each finding includes severity, primary axis, location, issue, why it matters, and suggested direction. State which checks ran and distinguish observed results from code-based inference.

Keep the report concise and omit empty optional sections. Include cosmetic nits only when requested. Read [Communication guidance](references/behaviour-communication.md) when drafting review comments or handling disagreements.
