# Prove It Works

Before you call a task done, check the real artifact where you can: run the feature, read the actual value, inspect the output. "It compiles" and "tests pass" are proxies.

**Why:** Unverified work has unknown correctness. A wrong inference costs more than the check.

**Pattern:**
- Exercise the changed path on the surface its users touch: the CLI command, the page, the API call, the job run.
- Read the real value, not a cached or derived one. Check a process directly, not through a file it might have written.
- When a check fails in a surprising way, inspect the failure and the check's assumptions before changing either. Rerun a check only to test a new hypothesis or verify a change.
- Prefer a script that reruns the check over a one-time look. Its output is evidence a reviewer can reproduce.

**Proportion:** match the check to the risk. A one-line copy change needs a look, not a new test suite. Do not add tests that mirror the implementation. Broaden or repeat checks only when a new change, failure, or open concern justifies it.

**Report:** if you could not run the real check, say so and say why. "Not verified" is an acceptable result; a hidden gap is not.
