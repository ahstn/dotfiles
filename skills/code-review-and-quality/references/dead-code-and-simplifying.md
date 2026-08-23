# Structural Quality and Simplification

Use this reference when a change affects module structure, control flow, type contracts, ownership boundaries, orchestration, a large file, or dead code. Apply it as a strict review rubric, not as permission to demand speculative rewrites.

## Core standard

Correct behavior is necessary but not sufficient. Prefer a design that preserves behavior while deleting concepts, branches, modes, wrappers, state, or cross-layer knowledge.

Look for a concrete "code judo" move: a reframe that uses the existing architecture better and makes the implementation smaller, more direct, and easier to explain. A structural finding must identify the complexity added, a plausible simpler direction, and the material maintenance cost. Do not block on taste or an imagined rewrite.

## Required checks

### 1. Structural simplification

- Do not stop at local cleanup when a clear reframe can remove whole branches, helpers, modes, or layers.
- Prefer deleting complexity over moving or renaming it.
- Prefer the smallest state space and fewest concepts, not the fewest source lines.
- Flag refactors that move code but do not reduce what a reader must hold in mind.

### 2. File growth and decomposition

- Treat a change that pushes a file from below 1,000 lines to above 1,000 lines as a strong decomposition smell.
- Explicitly evaluate whether cohesive helpers, components, or modules should be extracted before merge.
- Do not demand a split for line count alone. Waive the concern when the file has one clear owner, remains easy to scan, and splitting would weaken cohesion or hide control flow.

### 3. Control-flow growth

- Reject ad hoc conditionals, scattered feature checks, temporary branches, one-off booleans, nullable modes, and narrow edge-case branches added to unrelated flows.
- Treat repeated conditionals as evidence of a missing model, policy, dispatcher, state machine, helper, or default path.
- Prefer a state or ownership model that makes branches disappear over one that only centralizes the same branch count.

### 4. Direct code and earned abstractions

- Prefer direct, boring code over magic, generic machinery, or hidden data-shape assumptions.
- Flag thin wrappers, identity abstractions, pass-through helpers, and speculative layers that add indirection without clarity.
- Do not replace one tangled function with many tiny helpers that preserve the same cognitive load.

### 5. Type and boundary cleanliness

- Question new `any`, `unknown`, casts, optional parameters, loosely shaped objects, and silent fallbacks when the real invariant can be explicit.
- Prefer typed models and shared contracts that reduce possible states and simplify control flow.
- Flag implementation details that leak through an API or feature logic that leaks into a general-purpose path.

### 6. Canonical ownership and reuse

- Keep logic in the package, service, module, or layer that owns the concept.
- Reuse an existing canonical helper when it matches the required semantics.
- Flag bespoke near-duplicates, dependency-direction drift, and feature-specific logic scattered across shared code.
- Do not force reuse when the semantics differ or sharing would create a broader abstraction than the use cases justify.

### 7. Orchestration and atomicity

- Flag independent work that is serialized without a correctness or resource-ordering reason.
- Flag related updates that can leave state partly applied when an atomic structure is available.
- Prefer separation of orchestration from business logic when it makes ordering, failure, and rollback behavior explicit.
- Do not recommend parallelism when it weakens determinism, rate control, transaction safety, or readability.

### 8. Dead and obsolete paths

- Flag unreachable or unused code introduced or exposed by the change.
- Flag fallback paths, compatibility shims, feature toggles, config knobs, dead comments, and removed-code markers kept without a current requirement.
- Suggest removal only when code is clearly unused, superseded, or misleading.
- Respect explicit migration and backward-compatibility requirements. If intent is unclear, report the ambiguity instead of assuming deletion is safe.

## Measure the structural delta

Compare the design before and after the change. Count or describe material changes in:

- concepts, layers, wrappers, and ownership points
- decision points, modes, flags, and reachable states
- casts, optional values, fallbacks, and boundary translations
- dependency edges and cross-module knowledge
- sequential steps and partial-update windows
- file size, cohesion, and scan cost

Use this delta to support findings. Static size or complexity in unchanged code is not a finding unless the patch worsens it or makes it directly relevant.

## Preferred remedies

Prefer, in order:

1. Reframe the model so complexity disappears.
2. Move ownership to the canonical boundary.
3. Collapse duplicate or special-case flows into one default path.
4. Replace loose state with an explicit typed model or dispatcher.
5. Delete an unearned wrapper, obsolete path, or layer.
6. Extract one cohesive helper, component, or module.
7. Parallelize independent work or make related updates atomic when this also clarifies failure behavior.

A remedy must fit the patch and surrounding architecture. Do not prescribe a broad rewrite when a smaller change removes the regression.

## Finding and approval bar

Prioritize by severity. Within the same severity, prefer:

1. structural regressions and architecture leaks
2. missed concrete simplifications that delete substantial complexity
3. branching and state-space growth
4. type, contract, and ownership problems
5. file decomposition and local legibility

Treat these as presumptive merge blockers when the evidence is concrete:

- the patch preserves substantial incidental complexity that a plausible reframe would remove
- a file crosses 1,000 lines without a strong cohesion reason or decomposition review
- ad hoc branching tangles an existing flow
- feature checks become scattered across shared code
- a wrapper, generic mechanism, or cast-heavy contract makes a direct design more indirect
- logic duplicates a canonical helper or lands in the wrong owning layer
- related writes can leave invalid partial state

Do not approve only because tests pass. Also do not block on an aesthetic preference. The final finding must name the added cost, show the relevant code, and give an actionable direction.
