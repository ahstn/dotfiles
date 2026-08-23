# Design & Architecture Axis

Focus on system fit.

Look for:

- violations of module boundaries or ownership
- dependency direction problems or new coupling across layers
- shared responsibilities placed at the wrong boundary, or local code coupled across layers
- new patterns that diverge from the codebase without strong reason
- type or API boundaries loosened through casts, optionality, silent fallbacks, or ad hoc object shapes

Report placement, boundary direction, coupling, and contract-shape findings only. Whether code, an abstraction, a branch, or a duplicate path should exist belongs to the dead code and simplification axis.

Do not rewrite the architecture in your head. Judge the actual change in context.
