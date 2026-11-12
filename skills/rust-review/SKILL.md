---
name: rust-review
description: Review Rust code or diffs for concrete correctness, safety, API, and maintenance issues. Use for a Rust review, audit, or idiomatic-code assessment, with findings ranked by consequence.
license: MIT
---

# Rust review

Assess whether Rust code meets its contract and remains clear to maintain. Report actionable problems with evidence. Use idioms to improve reasoning, not to count rule violations.

## Scope and context

The user's instructions take precedence over skill defaults. Review without changing files unless the request also asks for fixes. A review request does not authorize posting comments or changing remote state.

Resolve the requested file, crate, diff, or PR from the conversation and available repository state. For a diff, inspect the changed code and the callers, tests, and contracts needed to understand its effects. Report issues introduced or worsened by that change. For a whole-code assessment, the existing implementation is in scope. State a reasonable scope assumption; ask only if ambiguity would change what is reviewed.

Read the relevant manifest, toolchain, CI settings, and project instructions. Identify actual consumers, public compatibility promises, edition, MSRV, features, target platforms, `no_std` limits, and runtime. Do not treat every `lib.rs` as a published library. Check resolved framework documentation before judging framework-specific signatures, imports, or lifecycle rules.

Use the [review rubric](references/rubric.md) for the technical pass. It is sufficient to run this skill on its own. If another review workflow is active, use this as its Rust technical guidance and preserve that workflow's requested scope and output format.

## Review and verify

Inspect code before selecting checks. Reuse relevant current results. Run project-required checks that apply, then use focused checks to resolve material uncertainty. Formatting checks must not rewrite files during a review. Do not enable every feature, add pedantic lints, install audit tools, or expand to a full platform matrix by default. Report an unavailable check and continue the review that the evidence permits.

Delegate independent questions or areas when that improves coverage. Give agents the same scope and finding criteria. Validate their results, merge duplicate causes, and retain responsibility for coverage. Do not split a small review into fixed roles without a useful reason.

For each candidate finding:

1. Identify the contract or material maintenance cost. Trace an input or caller through the relevant guards to the consequence.
2. Check the actual types, dependency version, feature conditions, and supported platform. Use a focused probe or primary documentation when a disputed claim affects the finding.
3. Check whether a proposed correction changes behavior, compatibility, ownership, allocation, or cancellation. Prefer the smallest correction that preserves the intended contract.
4. Remove claims based only on a syntax pattern, guide preference, or missing comment. A deliberate design can still contain a defect; a comment is evidence to inspect, not an automatic exemption.

## Finding threshold and priority

Each finding needs a precise location, a concrete trigger or material cost, the consequence, and a correction direction. State uncertainty when an important condition is unverified. A source citation supports a claim; it does not replace evidence from the code.

| Priority | Meaning |
| --- | --- |
| P1 | A high-impact defect or soundness issue with a supported path. It blocks approval. |
| P2 | A material defect, compatibility regression, or maintenance cost that should be fixed before merge. |
| P3 | A concrete, non-blocking improvement. Include it when useful to the requested review. |

Assign priority from the consequence and affected use, not the presence of `unsafe`, `unwrap`, a clone, or a particular type. Omit taste-based nits unless requested. There is no target number of findings and no numerical idiom score. Sound code can receive no findings.

## Report

Lead with the findings, ordered by priority, or state that no actionable issues were found. Give the scope, verdict, and material verification limits briefly. Use `approve` when no blocking findings remain, `request changes` for P1/P2 findings, and `comment only` when an unresolved question prevents a verdict. Use `blocked` only when the missing context prevents a meaningful review.

A compact finding can use this form:

> **[P2] Preserve parse failures — `src/config.rs:42`.** A malformed record reaches the skip branch, so the caller receives a successful partial configuration. Propagate the parse error and reserve skipping for blank or comment lines. Add a regression case with a malformed record between valid entries.

Show code only when it makes the correction clearer. Cite a specific primary source for a disputed or non-obvious claim. Mention good design when it helps the author preserve it; do not add praise quotas, empty sections, lint promotions, or required rewrites. State which checks ran and what remains inferred.

The rubric records its [sources](references/rubric.md#sources). This skill is adapted from BeautifulRust under the [MIT license](LICENSE). Maintainers can use the [evaluation cases](references/evaluation.md) when changing its behavior.
