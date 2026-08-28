# Correctness & Robustness Axis

Focus on observable behavior. This axis owns contracts, invariants, state transitions, failure semantics, ordering, atomicity, and concurrency. It also checks whether tests can detect regressions in changed behavior.

## Core standard

The change must do what the task, public contract, and callers require across success, failure, retry, cancellation, and concurrent execution. It must preserve every invariant or change it explicitly.

Do not infer correctness from a clean happy path or passing tests alone. Derive the required behavior, then trace the implementation against it.

## Review method

1. Derive the contract from the task, API documentation, call sites, types, tests, and existing behavior.
2. State the relevant preconditions, postconditions, invariants, and allowed state transitions.
3. Trace the main path and each new or changed exit path.
4. Vary input boundaries, time, order, duplication, interruption, and concurrency where the code permits them.
5. Check that verification reaches the changed behavior and would fail for the suspected defect.

If the sources disagree, report the conflict rather than selecting the most convenient interpretation.

## Required checks

### 1. Contracts and input domains

- Does behavior match the stated task and the expectations of every affected caller?
- Are null, empty, zero, negative, minimum, maximum, overflow, encoding, locale, and time-zone cases handled where they are valid concerns?
- Does parsing reject malformed, ambiguous, truncated, or trailing input instead of accepting a misleading partial value?
- Are defaults applied at the correct layer and only when absence is valid?
- Do return values and errors preserve the documented meaning, including partial-success rules?
- If a schema, enum, protocol, or serialized form changes, can all intended producers and consumers interpret it?
- Do capability advertisement, dispatch, and documentation use the same explicit classifier?
- Is absence from a paginated source concluded only after all relevant pages or an exact provider-side lookup are exhausted?
- Do case-sensitive wire identifiers, enum values, protocol fields, and terminal-status predicates match the contract at every producer and consumer?
- Do request and response adapters preserve required correlation identifiers, opaque proof fields, and endpoint-specific envelope semantics through round trips?
- For chunked or incremental protocols, does parsing preserve partial frames across boundaries, consume terminal buffered data, and keep records ordered and correlated?

Use exact boundary values. Do not report a generic “edge-case risk” without naming the input and wrong result.

### 2. Evidence, identity, and data-shape integrity

- Does a receipt, digest, cache key, or persisted identity bind the exact admitted bytes and every semantic input, control, unit, and provenance field that affects behavior?
- Is mutable or external input observed once, then validated, hashed, and used from that same snapshot?
- Are raw types, required keys, duplicate identifiers, ranges, units, and timestamp domains validated before coercion, membership checks, map construction, or arithmetic?
- Are cross-record and cross-batch invariants checked over the complete semantic scope rather than only within each chunk?
- Does validation inspect every required element and related collection, including fixed-size, singleton, empty, and final-element cases, without a shortcut that can skip malformed data?
- Are mixed or versioned records normalized independently before union, with explicit compatibility rules?
- When original bytes or provenance are unavailable, does the code narrow the verification claim instead of implying stronger evidence?
- When a persisted artifact is reused, is its content, version, provenance, and completeness validated instead of treating file or row presence as proof?
- Are records published or marked complete only after all evidence and related artifacts pass validation?

Reject missing selectors that would silently broaden a query, filter, authorization, or replay scope. Do not let lossy transformations erase duplicates, ordering, or identity before validation.

### 3. Invariants and state transitions

- Is every reachable state valid, and is every transition legal from its source state?
- Can early returns, exceptions, or cancellation leave half-applied state?
- Are related reads and writes atomic at the level required by the invariant?
- Are stale reads, lost updates, check-then-act races, or duplicate effects possible?
- Does rollback restore the prior state, or does a compensating action restore the required business invariant?
- Are resources acquired and released on every path, including failure and cancellation?
- Can cached or derived state become inconsistent with its source?
- Are terminal outcome fields and derived status projections mutually consistent, and do they come from the authoritative committed state?
- If an external side-effect can begin before local ownership is durable, or ownership can be lost while it runs, does the code finish, reconcile, or cancel it before another attempt can orphan or duplicate work?

Prefer explicit state transitions, exhaustive matching, transactions, compare-and-swap/version checks, and scope-bound cleanup when those mechanisms fit the codebase. Do not demand machinery that the invariant does not need.

### 4. Failure, timeout, retry, and cancellation

- Is each error handled at the layer that can add context, recover, translate, or terminate?
- Are errors propagated instead of silently converted into success, empty data, or a misleading default?
- Does a timeout cover the complete operation rather than one attempt while retries extend work without bound?
- Are retries limited to transient failures and safe for the operation’s idempotency rules?
- Can duplicate requests, events, or jobs repeat a non-idempotent side effect?
- Does cancellation stop downstream work and release resources promptly?
- Does polling distinguish pending, terminal success, terminal failure, cancellation, expiration, and missing ownership without converting one outcome into another?
- Can cleanup failure hide the primary failure?
- Are paths, identities, and other preconditions validated before output side effects, and are failed temporary outputs safe to retry?

For retries, check the whole sequence: replayable input, idempotency, attempt limit, backoff, jitter where contention matters, and final error reporting.

### 5. Ordering and concurrency

- Can callbacks, tasks, events, or responses arrive in a different order from the one assumed?
- Are shared mutable values protected by one clear synchronization or ownership rule?
- Can a read-modify-write sequence interleave and lose data?
- Does lock scope preserve the invariant without deadlock or unnecessary global serialization?
- Are concurrent collections, database transactions, and queues used according to their actual guarantees?
- Does shutdown wait for required work and reject new work in the correct order?
- When a state transition and its audit or event fact must agree, are they committed together or reconciled through an established durable mechanism?

Name a concrete interleaving when reporting a race. “This is not thread-safe” is not enough.

### 6. Tests and verification

- Is there a regression test for the changed contract when existing coverage would not catch it?
- Do tests cover failure paths and boundary transitions, not only the happy path?
- For stateful code, do tests cover invalid transitions, repeated operations, and cleanup?
- For concurrent code, do tests assert outcomes and synchronization rather than depend on sleeps or timing luck?
- Are time, randomness, environment, network, and global state controlled enough for deterministic results?
- Would the test fail if the old behavior or plausible bug returned?
- Does each negative fixture pass earlier guards and reach the branch, error, or mutation layer named by the test?
- Do protocol and stream tests parse emitted records and assert cardinality, order, correlation, and contradictory-state absence instead of checking substrings only?
- Are expected identities or serialized contracts checked with an independent oracle or a canonical fixture rather than a second copy of production logic?
- Where collection traversal can shortcut, do focused tests place malformed or duplicate data at the first, middle, and last relevant positions?
- Where several signals determine an outcome, do tests cover contradictory signals and the documented precedence?

Do not ask for tests that only mirror implementation details or assert that a mock was called. Require evidence for the observable contract.

## Finding bar

A correctness finding must include:

- the concrete input, state, event order, or failure condition
- the observed or logically implied wrong behavior
- the violated contract or invariant
- the smallest safe correction direction

Do not spend time on style unless it hides a behavior defect. Placement and dependency direction belong to architecture. Removable complexity belongs to dead code and simplification.
