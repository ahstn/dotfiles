# Design & Architecture Axis

Focus on system fit.

Look for:

- violations of module boundaries or ownership
- dependency direction problems or new coupling across layers
- duplication that should be shared, or premature sharing that should stay local
- new patterns that diverge from the codebase without strong reason
- abstractions that are too broad, too leaky, or too generic for the actual need
- type or API boundaries loosened through casts, optionality, silent fallbacks, or ad hoc object shapes
- independent orchestration serialized without a correctness reason, or related updates made non-atomic

For material structural changes, also apply `../dead-code-and-simplifying.md`. Architecture owns canonical placement, boundary direction, and state-model findings; maintainability owns local cognitive cost. The main reviewer deduplicates any overlap.

Do not rewrite the architecture in your head. Judge the actual change in context.
