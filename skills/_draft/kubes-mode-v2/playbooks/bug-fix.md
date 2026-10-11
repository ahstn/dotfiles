# Bug fix

Own the diagnosis, fix, and verification. Follow `principles/fix-root-causes.md`; runtime evidence determines the scope of the fix.

1. **Gate.** Establish failing evidence before changing code. Accept a user-supplied repro, logs, or recording as evidence; reproduce yourself when feasible on the matching surface. Use the project's verify-* skill or documented verification path; otherwise drive the real surface yourself (CLI run, browser, test harness). If you cannot reach the target, state the specific limitation rather than asking the user to repeat evidence you already have.
2. Read the affected code paths and their callers; read git log/blame for regression history. Form candidate hypotheses and choose probes that eliminate the most remaining possibilities. Instrument unclear program state and inspect it as the code runs.
3. **Gate.** Confirm the causal mechanism before choosing the fix, because a plausible source-level story is not a diagnosis. Use runtime evidence where the path is runnable; otherwise cite the exact code or artifact and label what is inferred.
4. Plan the smallest justified fix. Use `code-structure-and-modularity` when data shape or boundaries change, and `grill` for material unresolved design choices. Delegate only when it enables a genuinely independent slice or saves context; retain review ownership.
5. Add a regression test before the fix when a cheap local path exists. Otherwise preserve the failing artifact and explain why a local test cannot represent the repro. Keep the failing evidence separate from the fix without requiring separate commits.
6. **Gate.** Verify the original repro on the same surface after the fix and run the relevant regression checks. Wrong-surface or inconclusive evidence is not a pass; report what remains unverified. Apply `principles/prove-it-works.md`.

**Reply:** what was broken, root cause, fix, failing-then-passing evidence, and any verification limitation.
