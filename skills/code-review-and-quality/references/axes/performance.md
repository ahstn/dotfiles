# Performance & Scalability Axis

Focus on avoidable cost.

Look for:

- repeated work or redundant fetches
- N+1 database or network patterns
- unbounded loops, scans, or pagination gaps
- extra allocations or large object churn in hot paths
- synchronous blocking, unnecessary re-renders, or missing batching
- independent work serialized without a correctness or resource-ordering reason

Prefer concrete impact over vague "this may be slow" language.
