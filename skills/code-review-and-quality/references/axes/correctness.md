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

Use exact boundary values. Do not report a generic “edge-case risk” without naming the input and wrong result.

### 2. Invariants and state transitions

- Is every reachable state valid, and is every transition legal from its source state?
- Can early returns, exceptions, or cancellation leave half-applied state?
- Are related reads and writes atomic at the level required by the invariant?
- Are stale reads, lost updates, check-then-act races, or duplicate effects possible?
- Does rollback restore the prior state, or does a compensating action restore the required business invariant?
- Are resources acquired and released on every path, including failure and cancellation?
- Can cached or derived state become inconsistent with its source?

Prefer explicit state transitions, exhaustive matching, transactions, compare-and-swap/version checks, and scope-bound cleanup when those mechanisms fit the codebase. Do not demand machinery that the invariant does not need.

### 3. Failure, timeout, retry, and cancellation

- Is each error handled at the layer that can add context, recover, translate, or terminate?
- Are errors propagated instead of silently converted into success, empty data, or a misleading default?
- Does a timeout cover the complete operation rather than one attempt while retries extend work without bound?
- Are retries limited to transient failures and safe for the operation’s idempotency rules?
- Can duplicate requests, events, or jobs repeat a non-idempotent side effect?
- Does cancellation stop downstream work and release resources promptly?
- Can cleanup failure hide the primary failure?

For retries, check the whole sequence: replayable input, idempotency, attempt limit, backoff, jitter where contention matters, and final error reporting.

### 4. Ordering and concurrency

- Can callbacks, tasks, events, or responses arrive in a different order from the one assumed?
- Are shared mutable values protected by one clear synchronization or ownership rule?
- Can a read-modify-write sequence interleave and lose data?
- Does lock scope preserve the invariant without deadlock or unnecessary global serialization?
- Are concurrent collections, database transactions, and queues used according to their actual guarantees?
- Does shutdown wait for required work and reject new work in the correct order?

Name a concrete interleaving when reporting a race. “This is not thread-safe” is not enough.

### 5. Tests and verification

- Is there a regression test for the changed contract when existing coverage would not catch it?
- Do tests cover failure paths and boundary transitions, not only the happy path?
- For stateful code, do tests cover invalid transitions, repeated operations, and cleanup?
- For concurrent code, do tests assert outcomes and synchronization rather than depend on sleeps or timing luck?
- Are time, randomness, environment, network, and global state controlled enough for deterministic results?
- Would the test fail if the old behavior or plausible bug returned?

Do not ask for tests that only mirror implementation details or assert that a mock was called. Require evidence for the observable contract.

## Finding bar

A correctness finding must include:

- the concrete input, state, event order, or failure condition
- the observed or logically implied wrong behavior
- the violated contract or invariant
- the smallest safe correction direction

Do not spend time on style unless it hides a behavior defect. Placement and dependency direction belong to architecture. Removable complexity belongs to dead code and simplification.
