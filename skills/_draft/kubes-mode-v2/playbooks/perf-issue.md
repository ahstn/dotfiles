# Perf issue

Own the measurement story. Follow `principles/fix-root-causes.md`; tie each fix to measured cost rather than source inspection alone.

1. **Gate.** Capture a baseline trace and metric on the matching surface before changing code. Use the project's verify-* skill or documented verification path; otherwise drive the real surface yourself (CLI run, browser, test harness). Record workload, environment, and repeatability so before and after are comparable.
2. Read the affected code paths and their callers to ground hypotheses. Do not claim a performance ceiling without measuring it. The eight strategy families below are hypothesis generators, not a checklist; a family earns an attempt only when the trace shows its signal.
   - **Elimination.** Cost comes from work whose result may be unused. Confirm consumers and behavior before deletion; a trace shows cost, not whether work is dispensable.
   - **Divide and conquer.** Dominant cost scales with input size. Chunk, shard, prune, or parallelize independent work so each piece touches less.
   - **Caching.** Identical inputs repeatedly trigger the same computation or fetch. Name invalidation before reusing results.
   - **Indirection.** A cheaper index, queue, or handle can absorb expensive critical-path work. Add the hop only when the removed cost exceeds its overhead.
   - **Batching.** Many small operations each pay fixed overhead. Coalesce them while preserving latency and ordering requirements.
   - **Redundancy.** One slow instance or attempt dominates the wait. Replication or hedging needs measured headroom and a bounded extra-work cost.
   - **Lazy evaluation.** Eager work produces results never used or not yet needed. Defer it until use and measure first-use cost too.
   - **Scheduling.** Required work blocks an interactive moment. Move it to idle or background time; measure perceived latency, not just total work.
3. Plan from the trace. Use `code-structure-and-modularity` for boundary changes; delegate only when it saves context or creates independent work. Review the diff and measure one attempt before the next.
4. **Gate.** Capture and compare post-change artifacts with the same workload and regression checks. Apply `principles/explain-the-number.md` and `principles/prove-it-works.md`. Wrong-surface or inconclusive measurements are not a pass.
5. Use `playbooks/hillclimb.md` for sustained improvement against a target rather than a one-off fix.

**Reply:** baseline, post-fix metric, delta, workload, artifact paths, and the mechanism explaining the change.
