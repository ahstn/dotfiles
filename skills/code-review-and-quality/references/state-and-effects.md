# State Transitions and Required Effects

Use the relevant checks when a change affects versioned state, single-use operations, required effects across writes or tasks, or distinct failure policies. Derive the obligations from the changed contract.

## Mutation outcomes

- Does the protected write provide the actual target, changed/no-op result, and before/after snapshots required by its event or response contract?
- Does mutable authorization remain valid through the protected write?
- Do progress records reflect actual committed changes, including writes inside nested helpers? What remains visible if a later step fails?
- Can each required effect proceed when an independent sibling effect fails? Check quota, audit, and state updates separately from optional pricing or logging work.

## Completion and replay

- Which effects must finish before success is visible, and which must survive caller cancellation? Trace cancellation at each await against those obligations.
- Do permits and reservations remain owned by work that continues after the caller exits, until that work ends?
- For a single-use operation, check success, partial failure, retry, sequential replay, concurrent losers, and failed compensation. What remains usable, committed, or revoked in each case?

## Versioned state

- After approval, rejection, supersession, and return to an older state, do payload, status, selected version, and permitted actions agree? Include records that were never approved.
- Is the selected record's identity carried through each transition, even when it is older than the maximum version?
- Does an unchanged or empty valid first observation close a one-time compatibility path? Test that observation followed by a real change.

## Failure policy

- For each supported policy, compare cold, stale, and partial state with read failure, write failure, timeout, policy denial, and malformed input where applicable.
- For each case, check the response, retry, cache reuse or eviction, required audit evidence, and behavior of later requests.
