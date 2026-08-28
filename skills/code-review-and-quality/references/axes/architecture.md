# Design & Architecture Axis

Focus on system fit. This axis owns placement, canonical ownership, dependency direction, encapsulation, public contract shape, data ownership, and cross-layer coupling.

## Core standard

The change should put each responsibility with its durable owner and expose it through the narrowest stable boundary that serves real callers. Dependencies should point toward policy and stable contracts, while volatile details stay behind those contracts.

Architecture review is about change propagation, not diagram purity. A finding must show how the proposed shape creates coupling, weakens a boundary, duplicates ownership, or makes a likely change unsafe.

## Review method

1. Map the changed components, imports, calls, events, data stores, and public types.
2. Identify the canonical owner of each policy, invariant, and piece of mutable state.
3. Trace dependency direction from entry point to domain policy to external effect.
4. Compare the change with existing local patterns and extension points.
5. Ask what must change together when the feature evolves, fails, or gains another caller.

Judge the actual change in context. Do not design an ideal system that ignores repository constraints.

## Required checks

### 1. Responsibility and canonical ownership

- Does each rule or invariant have one canonical owner?
- Is policy implemented in the domain or service that has the facts needed to enforce it?
- Are presentation, transport, persistence, and domain concerns kept at their established boundaries?
- Does shared behavior live with a stable concept rather than the first caller that needed it?
- Is mutable state owned by one component with a clear write path?
- Do duplicate implementations risk drift because no owner is authoritative?
- Do canonical literals, status predicates, serializers, and schema definitions come from one owner across code, storage, APIs, UI, tests, and documentation?
- If a contract is generated, is its editable source and regeneration path authoritative and explicit?

Place validation and normalization at the boundary that can define their meaning. Keep invariant enforcement with the state it protects.

### 2. Dependency direction and coupling

- Do high-level policies depend on stable abstractions rather than transport, framework, storage, or vendor details?
- Does the change introduce a dependency cycle or require lower layers to know about higher-layer workflows?
- Are unrelated features coupled through a shared singleton, registry, global event, or utility module?
- Does a small policy change now require coordinated edits across several layers?
- Are consumers coupled to the provider’s internal data shape instead of a deliberate contract?
- Does an adapter isolate genuine provider variation, or duplicate common mapping and policy that will drift across adapters?
- Is temporal coupling hidden, so valid behavior depends on calls occurring in an undocumented order?

Use dependency inversion only at a real volatility or test boundary. Do not introduce an interface with one trivial implementation merely to satisfy a pattern.

### 3. Encapsulation and information hiding

- Does the public surface expose implementation details that callers can begin to depend on?
- Can internals change without coordinated caller edits?
- Are write operations routed through the owner that protects the invariant?
- Are collections, mutable objects, database records, or framework types escaping across a boundary without need?
- Do callbacks or extension hooks expose more authority than the caller needs?
- Are configuration and feature controls scoped to the component that owns their effect?

Prefer capability-shaped methods, domain values, immutable results, and boundary-specific adapters when they reduce coupling. Do not wrap a direct dependency with a pass-through layer that hides nothing.

### 4. API and contract evolution

- Is the boundary internal, repository-wide, or externally consumed? Apply compatibility requirements to the actual audience.
- Are names, required fields, defaults, errors, pagination, ordering, and idempotency semantics stable for intended consumers?
- Can old and new producers or consumers coexist when deployment is not atomic?
- Does added optionality, a cast, a silent fallback, or an ad hoc object shape weaken a useful guarantee?
- Are enum and union changes handled exhaustively by consumers?
- If a breaking change is intentional, are all in-scope callers migrated in the same change or the version boundary explicit?
- Is the required producer/consumer coexistence matrix explicit for rolling deployment, persisted old data, caches, workers, and delayed events?
- Do compatibility claims cover semantic meaning as well as parseability, including defaults, units, ordering, and omission behavior?
- Is the version or migration boundary observable and reversible enough to diagnose a mixed-version failure?

Do not preserve obsolete internal APIs by default. Do not break an external contract because all callers visible in the repository were updated.

### 5. Data ownership and consistency boundaries

- Is there one source of truth for each durable fact?
- Are derived copies synchronized by an explicit mechanism with defined failure behavior?
- Does a transaction include all writes required for one invariant, and exclude unrelated work?
- Can events be published before the committed state they describe is visible?
- Is orchestration located where retry, compensation, and partial failure can be handled coherently?
- Does one service reach into another service’s storage or private model?
- Is workflow state that must survive restart, failover, retry, or another worker stored by the durable owner rather than only in process memory?
- Can dual-written representations, state and audit records, or state and published notifications diverge because they do not share an atomic boundary or reconciliation path?
- Are mutable external inputs snapshotted or versioned so later replay and audit use the admitted state rather than current ambient state?

Prefer local transactions for local invariants. Use durable events, an outbox, sagas, or compensation only when the system already needs a cross-boundary workflow; do not add distributed machinery to solve a local problem.

### 6. Cohesion and extension shape

- Do things that change together live together?
- Does a module have one clear reason to change at its current level of abstraction?
- Is a “shared” package becoming a dependency sink without a domain owner?
- Does the new extension point represent observed variation, or does each implementation still require branching in the host?
- Can the next credible use case extend one owner, or will it require shotgun edits?
- Does configuration select policy cleanly, or leak feature knowledge through unrelated layers?
- Do new providers, modes, or record versions extend one canonical policy, or copy conditionals and mappings into each integration?

Dead code and simplification owns whether an abstraction, mode, wrapper, branch, or module should exist at all. Architecture owns where necessary code belongs and how its boundaries point.

## Useful patterns, applied conditionally

- Keep domain policy independent from delivery and persistence details.
- Translate external representations once at the system edge.
- Inject external effects at established seams; keep pure policy direct.
- Put stable facades at boundaries with multiple real consumers.
- Use adapters to isolate genuine vendor or protocol variation.
- Keep events factual and owned by the component that commits the fact.
- Make illegal cross-boundary writes impossible through narrow capabilities.

Patterns are tools, not findings. Report the violated design force and maintenance cost, not a missing pattern name.

## Finding bar

An architecture finding must name:

- the responsibility, contract, or state with unclear ownership
- the dependency or boundary that is wrong
- the concrete change-amplification, consistency, or compatibility risk
- the canonical home or boundary direction that resolves it

Do not rewrite the architecture in your head. Do not report speculative future extensibility without a credible change case.
