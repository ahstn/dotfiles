# Correctness & Robustness Axis

Focus on behavior.

Look for:

- mismatch with the stated task or expected behavior
- broken invariants, state transitions, or lifecycle assumptions
- missing edge-case handling
- missing error-path handling
- races, ordering bugs, stale state, and off-by-one mistakes
- tests that miss the changed behavior or only test the happy path

Do not spend time on style unless it obscures a correctness issue.
