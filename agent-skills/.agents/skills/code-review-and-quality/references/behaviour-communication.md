# Reporting, Comments, and Feedback

## What to report

Report only issues that are:

- discrete
- actionable
- grounded in the current diff or directly relevant context
- likely worth fixing once surfaced

Prefer silence over low-confidence noise.
Do not turn the review into a style lecture.

## What not to report

Do **not** report:

- pure taste disagreements
- cosmetic nits unless explicitly requested
- speculative risks without a concrete failure path
- pre-existing issues that the current change did not introduce or worsen
- repeated summaries of patterns already visible in the diff
- minor test hygiene unless it affects correctness or maintainability materially

## Severity labels

Use one label for every finding.

| Label | Meaning | Expected action |
| --- | --- | --- |
| **Critical** | Merge-blocking issue | Must fix before merge |
| **Important** | Material issue | Should fix before merge |
| **Consider** | Non-blocking improvement | Worth considering |
| **Nit** | Minor cleanup or wording/style note | Optional |
| **FYI** | Context only | No action required |

Default to `Important` for actionable review findings.
Use `Consider`, `Nit`, and `FYI` sparingly.

## Comment shape

Each comment should do three things quickly:

1. identify the issue
2. explain the concrete failure mode or maintenance cost
3. suggest the direction of a fix

Guidelines:

- one issue per comment
- keep the referenced range as small as possible
- keep the prose to one short paragraph when possible
- state conditionality explicitly when severity depends on inputs or environment
- make inferences explicit rather than presenting them as facts
- avoid praise, filler, and hedging

Bad:

- "Could we maybe add some guards here?"
- "This feels a bit risky."
- "It might be safer to refactor this somehow."

Better:

- "This path accepts raw user input into the SQL fragment, so a crafted filter value can change the query instead of just the parameter value. Use a parameterized predicate here."

## Dedupe and synthesis

When multiple axes surface the same underlying problem:

- emit one final finding
- choose the primary axis that best explains the issue
- mention secondary effects only if they materially help the author

## Disagreements

When reviewer and author disagree, apply this order:

1. technical facts and concrete evidence
2. explicit project conventions
3. sound design principles
4. local consistency
5. personal preference

If the author has missing context that changes the conclusion, update or withdraw the finding cleanly.
Comment on code, not people.
