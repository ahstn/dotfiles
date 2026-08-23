# Maintainability & Readability Axis

Focus on future change cost.

Can another engineer (or agent) understand this code without the author explaining it?

- Are names descriptive and consistent with project conventions? (No `temp`, `data`, `result` without context)
- Is the control flow straightforward (avoid nested ternaries, deep callbacks)?
- Is the code organized logically (related code grouped, clear module boundaries)?
- Are there any "clever" tricks that should be simplified?
- **Could this use fewer concepts, states, branches, or layers?** Prefer a simpler model over line-count reduction alone.
- **Are abstractions earning their complexity?** Do not generalize before the use cases justify it.
- If the change materially alters structure or pushes a file across 1,000 lines, also apply `../dead-code-and-simplifying.md`.
- Would comments help clarify non-obvious intent? (But don't comment obvious code.)
- Are there dead code artifacts: no-op variables (`_unused`), backwards-compat shims, or `// removed` comments?
- Does the change follow all applicable project guidance and established local patterns? If it diverges, is the reason explicit?

Do not turn this axis into formatting review.
