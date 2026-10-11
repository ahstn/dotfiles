# Hillclimb

Own the metric and experiment integrity. One change, one measurement, keep or revert. For a one-off fix, use `playbooks/bug-fix.md` or `playbooks/perf-issue.md`.

1. Read the affected code paths and their callers. **Gate.** Choose a realistic workload that reproduces the complaint before optimizing. Name workload dimensions such as data size, history, state, and concurrency; otherwise a fast toy case can conceal the problem.
2. Fix one metric, its improvement direction, and a checkable stop predicate that pairs a target with a minimum attempt count, so a lucky early win cannot end the run (for example "at least 50% better than baseline and at least 10 iterations"). Use the user's numbers when given; otherwise propose them.
3. **Gate.** Prove harness sensitivity with contrasting realistic workloads, then freeze one repeatable measurement command. Sample enough to separate signal from noise. Record the baseline and a passing regression gate before any change; a moving harness cannot establish a win.
4. Keep a `decision.tsv` outside tracked source, with one row per attempt: id, hypothesis, change, before, after, delta, tests, verdict, note. Read it before each attempt so rejected ideas are not retried blindly.
5. Ground each hypothesis in a specific mechanism. Delegate attempts when useful; isolate independent experiments in separate worktrees and review their diffs. Keep the measurement harness and comparison method unchanged.
6. **Gate.** Measure each attempt before and after with the frozen harness and run the regression gate before starting another. Accept only an improvement beyond noise with passing regressions; otherwise revert the attempt in full. Apply `principles/explain-the-number.md` and `principles/prove-it-works.md`.
7. Log kept and reverted attempts. Preserve accepted changes as independent units; commit them only when authorized. For unattended work, use an available scheduled wake mechanism and the agreed stop predicate, not an unbounded retry loop.
8. At a plateau, re-read the source, pivot strategy, or test a combined near-miss only when it forms a new measurable hypothesis. Correctness and simplicity outrank the number; reject a win that breaks behavior.
9. Stop when the predicate is met or remaining ideas are not worth their cost. Do not lower the target to manufacture success; report an unmet target and blockers instead of spinning or hiding cheap untried hypotheses.

**Reply:** metric and target, baseline to final with percent delta, attempt counts kept versus reverted, accepted fixes, decision log path, and the best remaining hypothesis.
