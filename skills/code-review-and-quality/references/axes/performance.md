# Performance & Scalability Axis

Focus on avoidable cost under a credible workload. This axis owns time complexity, I/O count, allocation and copy cost, contention, concurrency bounds, backpressure, and evidence from benchmarks or profiles.

## Core standard

The change should use resources in proportion to useful work. Evaluate cost against the input dimension that grows: rows, requests, tenants, bytes, objects, frames, connections, or retries.

Do not trade correctness or clarity for a theoretical micro-optimization. Do not ignore an obvious multiplicative cost because no production profile is attached.

## Review method

1. Identify the changed hot or potentially scaling paths and the workload dimensions they process.
2. Count database calls, network calls, full scans, serializations, allocations, copies, renders, and synchronization points per unit of work.
3. Compare the old and new cost model, including retry and failure amplification.
4. Check bounds, lifecycle, caching, batching, and backpressure.
5. Ask for measurement when impact depends on constants or runtime behavior; reason directly when the complexity change is clear.

State the cost as a relationship when possible: one query per row, two full payload copies, all tenants scanned per request, or independent calls serialized on the latency path.

## Required checks

### 1. Algorithmic cost and cardinality

- Does a loop, sort, lookup, join, or recursive walk scale with the intended input size?
- Are nested operations accidentally quadratic or worse over a growing collection?
- Is a linear membership check repeated where a set, map, index, or merge pass fits existing patterns?
- Are full scans, global sorts, or repeated aggregations performed when the caller needs a bounded subset?
- Is pagination stable, bounded, and applied before materializing or transforming the full result?
- Can fan-out multiply by users, rows, partitions, plugins, or retries without a hard bound?

Prefer the simplest data structure with the required access pattern. Include construction and memory cost; a map is not free when the collection is tiny or used once.

### 2. Database and network I/O

- Does the change add an N+1 query or request pattern?
- Can independent lookups be joined, batched, prefetched, pipelined, or issued concurrently within a safe bound?
- Are queries selective, indexed for their filter and ordering shape, and limited to required columns and rows?
- Does code fetch a complete object or payload to use one field?
- Are pagination, compression, connection reuse, and request coalescing used where payload or call count makes them material?
- Do retries multiply non-idempotent work or overload an already failing dependency?
- Is cache invalidation explicit, and does the cache avoid turning fresh local work into stale global behavior?

Do not recommend caching before removing avoidable work. A cache adds state, invalidation, memory, and cold-start costs.

### 3. CPU, allocation, and copies

- Is parsing, validation, serialization, hashing, formatting, or regex compilation repeated inside a hot loop?
- Are large buffers, strings, collections, images, or object graphs copied or rebuilt without need?
- Can the code stream or iterate once instead of materializing several full intermediate collections?
- Are temporary objects or closures created per item on a high-frequency path?
- Does conversion between layers repeat the same representation work?
- Are expensive computations performed before a cheap rejection or cache check?
- In compiled code, can ownership, borrowing, views, slices, or move semantics avoid a material copy while keeping lifetime rules clear?

Prefer eliminating work over making the same work faster. Avoid low-level rewrites unless profiling or a clear cost model shows that the path matters.

### 4. Concurrency, blocking, and contention

- Is independent I/O serialized without a correctness, dependency, or resource-ordering reason?
- Does synchronous blocking occur on an async event loop, UI thread, request executor, or shared worker?
- Is concurrency bounded to protect the downstream service, connection pool, memory, and scheduler?
- Is there backpressure when producers can outrun consumers?
- Are locks held across I/O, callbacks, sleeps, or expensive computation?
- Does one global lock, queue, or coordinator serialize otherwise independent keys or tenants?
- Can cancellation and timeout free worker capacity promptly?

Use bounded parallelism, not unlimited task creation. More concurrency can reduce throughput through contention, queueing, or downstream overload.

### 5. Resource lifecycle and retained memory

- Are clients, pools, threads, parsers, and expensive immutable objects created once at the correct lifetime?
- Are connections, file descriptors, buffers, subscriptions, timers, and tasks released on success, failure, and cancellation?
- Can a cache, queue, map, listener list, or task registry grow without eviction or ownership cleanup?
- Do closures, callbacks, or global registries retain large objects longer than intended?
- Is streaming actually bounded, or does a downstream stage buffer the full payload?
- Does pooling reduce cost without retaining unsafe state or increasing contention?

### 6. UI and render paths

- Does state change trigger avoidable tree-wide renders, layout work, or repeated data derivation?
- Are stable values or callbacks recreated in a way that defeats established memoization?
- Are DOM or scene reads and writes interleaved, causing repeated layout or synchronization?
- Are large lists virtualized or incrementally rendered when the supported size requires it?
- Is work tied to frame rate, input rate, or resize events throttled or coalesced appropriately?

Do not request memoization by default. It is useful only when the computation or invalidated subtree is material and dependencies remain correct.

## Measurement and benchmark quality

When measurement is needed, check that it:

- compares against the relevant baseline with representative data sizes and distributions
- runs optimized or production-equivalent code
- separates setup, I/O fixtures, and one-time initialization from the measured operation
- includes warm-up where the runtime, caches, or branch predictors need it
- uses enough samples and reports distribution or tail latency, not one favorable run
- records throughput, latency, allocation, memory, query count, or contention according to the suspected cost
- prevents dead-code elimination and verifies that both versions produce the same result

Prefer a profile or query plan when it can identify the actual cost center. A microbenchmark cannot prove end-to-end scalability, and an end-to-end average can hide a local allocation or tail-latency regression.

## Finding bar

A performance finding must include:

- the hot or scaling path
- the input dimension or workload condition
- the repeated, unbounded, serialized, copied, or contended work
- the expected cost shape or measured regression
- a plausible lower-cost direction that preserves behavior

Prefer concrete impact over “this may be slow.” Security owns attacker-controlled resource amplification. Correctness owns ordering required by invariants.
