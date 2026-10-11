# Explain the Number

A perf or eval number is a claim. Before you use it to compare options or justify a change, find what limits it and rule out that it measured something else. Deterministic counts need provenance, not this procedure.

**Why:** A broken run still prints a plausible number. Failed requests, skipped or cached work, code that never ran, an untuned side, and noise all produce results that look fine.

**Pattern:**
- **Ask "why not double?"** Name the resource or code path that bounds the result (a core, a lock, the disk, the network, the load generator). Get it from a profile or system counters taken during the run, then map it to source. A guess from reading code is not a limiter.
- **Rule out the usual suspects with evidence.** Errors, skipped or cached work, an untuned baseline, noise, and a change too small to matter end to end. Make the harness print its error count and a count of the work done.
- **Sample enough to clear the noise.** Median of several runs, with the spread, not one run.
- **Keep the evidence with the number.** Run count, spread, and limiter go in the reply or a linked artifact.

For an eval result, report the trial setup, sample size, failures, and spread. Check that every run did the task and that the gap holds across trials.

This checks that a number supports the claim, not only that an output exists.
