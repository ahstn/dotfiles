# Dead Code & Simplification Axis

Focus on code and concepts the patch can remove or avoid. This axis owns dead code, obsolete paths, unnecessary abstractions, state-space growth, avoidable branching, and concrete structural simplifications across every changed file.

## Core standard

Correct behavior is necessary but not sufficient. Prefer a design that preserves behavior while deleting concepts, branches, modes, wrappers, state, or cross-layer knowledge.

Look for a concrete "code judo" move: a reframe that uses the existing architecture better and makes the implementation smaller, more direct, and easier to explain. A structural finding must identify the complexity added, a plausible simpler direction, and the material maintenance cost. Do not block on taste or an imagined rewrite.

## Ownership boundary

This axis decides whether code or a concept should exist and gives the simpler design direction. Other axes own the behavior and placement of code that remains:

- correctness owns behavior, invariants, failure paths, ordering, and atomicity
- maintainability owns local clarity, naming, comments, and scan cost
- architecture owns canonical placement, dependency direction, coupling, and contract boundaries
- security owns trust boundaries and exploit paths
- performance owns measured or plausible runtime cost

When one hunk raises several concerns, report it here only when the primary remedy deletes or collapses code, concepts, states, or paths. Otherwise leave the finding to the owning axis. The main reviewer deduplicates overlap.

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

### 5. State-space simplification

- Question new `any`, `unknown`, casts, optional parameters, loosely shaped objects, and silent fallbacks when they multiply possible states or force extra branches.
- Prefer an explicit model or dispatcher when it removes invalid states and simplifies control flow.
- Leave broken contract, boundary, and invariant findings to architecture or correctness unless the primary remedy is to collapse the state model.

### 6. Duplication and canonical reuse

- Reuse an existing canonical helper when it matches the required semantics and removes a duplicate path.
- Flag bespoke near-duplicates, pass-through adapters, and feature-specific copies that increase the number of concepts or flows.
- Do not force reuse when semantics differ or sharing would require a broader abstraction than the use cases justify.
- Leave placement and dependency-direction findings to architecture unless relocation is part of a concrete simplification that deletes duplication.

### 7. Orchestration simplification

- Flag orchestration layers, sequential stages, or intermediate state whose removal preserves behavior.
- Prefer separating orchestration from business logic only when this reduces reachable states or makes whole failure branches unnecessary.
- Leave atomicity and ordering failures to correctness, and runtime serialization costs to performance.
- Do not recommend parallelism only to make the implementation look shorter.

### 8. Dead and obsolete paths

- Flag unreachable or unused code introduced or exposed by the change.
- Flag fallback paths, compatibility shims, feature toggles, config knobs, dead comments, and removed-code markers kept without a current requirement.
- Suggest removal only when code is clearly unused, superseded, or misleading.
- Respect explicit migration and backward-compatibility requirements. If intent is unclear, report the ambiguity instead of assuming deletion is safe.

## Measure the structural delta

Compare the design before and after the change. Count or describe material changes in:

- concepts, layers, wrappers, and indirection points
- decision points, modes, flags, and reachable states
- casts, optional values, fallbacks, and state translations
- duplicate flows and cross-module feature knowledge
- orchestration stages and intermediate states
- file size, cohesion, and scan cost

Use this delta to support findings. Static size or complexity in unchanged code is not a finding unless the patch worsens it or makes it directly relevant.

## Preferred remedies

Prefer, in order:

1. Reframe the model so complexity disappears.
2. Collapse duplicate or special-case flows into one default path.
3. Replace loose state with an explicit typed model or dispatcher.
4. Delete an unearned wrapper, obsolete path, or layer.
5. Reuse a canonical implementation that removes a duplicate path.
6. Extract one cohesive helper, component, or module.

A remedy must fit the patch and surrounding architecture. Do not prescribe a broad rewrite when a smaller change removes the regression.

## Finding and approval bar

Prioritize by severity. Within the same severity, prefer:

1. substantial removable incidental complexity
2. dead or obsolete code and paths
3. branching and state-space growth
4. unearned abstractions, wrappers, and duplicate flows
5. file decomposition opportunities

Treat these as presumptive merge blockers when the evidence is concrete:

- the patch preserves substantial incidental complexity that a plausible reframe would remove
- a file crosses 1,000 lines without a strong cohesion reason or decomposition review
- ad hoc branching tangles an existing flow
- feature checks become scattered across shared code
- a wrapper, generic mechanism, or cast-heavy model makes a direct design more indirect
- logic duplicates a canonical helper or preserves a redundant path

Do not approve only because tests pass. Also do not block on an aesthetic preference. The final finding must name the added cost, show the relevant code, and give an actionable direction.
