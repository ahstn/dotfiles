# Rust review rubric

Use the applicable sections to inspect the agreed scope. A finding needs a reachable consequence or a material cost. The examples show questions to resolve, not patterns that automatically fail review.

## 1. Correctness and domain contracts

Trace data from input through validation, transformation, and use. Check that the types preserve the facts consumers rely on. Look for a constructor bypass through public fields, setters, derived deserialization, mutable access, or an invalid `Default`. A nonempty collection does not establish that its members are valid.

Check parsing outcomes separately: a valid item, an intentionally ignored item, and malformed input. Look for discarded errors, partial success that violates the contract, and unexpected changes in duplicate handling or output order. A loop and an iterator chain can both be correct; assess their behavior and clarity.

Inspect arithmetic and casts against the input range and configured profile. Narrowing `as` casts can truncate; they do not generally panic. Overflow behavior depends on the operation and settings. An external-input check or safety invariant must not depend only on `debug_assert!`.

For panics, establish a failing input or state and the effect on the required boundary. An `expect` on a locally proved invariant, a test assertion, or a documented panicking API is not automatically a defect. A comment that promises correctness cannot excuse a reachable violation.

## 2. Trait laws and unsafe soundness

Check equality, hashing, and ordering by semantics. Show values that violate their required relation before reporting a contract bug. A handwritten `Ord` and derived `Eq` can agree. `Borrow<Q>` also requires matching comparison and hash behavior; `AsRef<Q>` has a weaker contract. Trait-law errors in safe collections are logic errors, not automatically memory unsafety.

For unsafe code, trace a sequence of valid safe calls to the operation. Check the proof needed by that operation. This can include initialization, bounds, alignment, pointer validity, aliasing, lifetimes, layout, pinning, thread access, and unwind behavior. Inspect cleanup paths and user callbacks. Safe callers can leak values. A returned guard's destructor cannot be the sole basis of soundness.

Separate a missing safety explanation from a broken safety condition. A missing proof can justify a docs finding or a stated gap in the review. Claim undefined behavior only when the code supports it. Passing tests or Miri do not prove soundness for all callers.

At FFI boundaries, verify the exact ABI, allocation owner, nullability, encoding, and unwind contract. `catch_unwind` does not catch aborts. A `repr` annotation must supply the layout guarantee the operation actually needs.

## 3. Resources, concurrency, and cancellation

Trace owners of locks, tasks, messages, and external effects. Look for deadlocks, invalid intermediate states, unbounded work, lost required results, duplicate effects, and incomplete shutdown. Establish how the supported workload reaches the failure.

Check each affected await for cancellation. Taking state before an await and restoring it afterward can lose that state. Unlocking a mutex does not restore a domain invariant. Check which future a losing `select!` branch drops; a retained future borrowed with `&mut` can survive. Confirm the cancellation contract of the actual read, write, send, or receive operation.

For Tokio, dropping a task handle detaches its task. A timeout over that handle is not proof the task stopped. Started blocking tasks cannot be aborted through their handle. A timeout does not roll back remote effects or preempt work that does not yield.

A short synchronous mutex section in async code can be correct. An async mutex can intentionally span awaits. A public guard can correctly express access lifetime. Recovery from poison can be valid after checking or repairing state. Judge lock order, blocking, repair, and cancellation rather than banning these forms.

## 4. API design and evolution

Identify actual callers and compatibility promises. A published API refactor must preserve more than successful compilation inside its own crate.

| Proposed change | Inspect before accepting it |
| --- | --- |
| Named generic to argument `impl Trait` | Existing explicit type arguments and relationships between positions |
| Enum variants, public fields, or `non_exhaustive` | Downstream matching, construction, and behavior |
| Trait methods or sealing | Downstream implementations, dyn compatibility, and method callers |
| Borrow to owned value, iterator to collection, or the reverse | Allocation, lifetime, evaluation timing, and failure timing |
| Error type or conversion | Recovery categories, cause chains, dependency exposure, and public impls |
| Trait bounds or storage types | `Send`/`Sync`, lifetimes, MSRV, `no_std`, and target requirements |

Prefer type distinctions that prevent actual misuse. Booleans can express predicates; enums can express domain choices; `NonZero` can be a useful public contract. A builder or typestate needs a real construction or sequencing benefit.

Compare concrete types, enums, generics, and `dyn` by the required variation. Borrowed trait objects do not require allocation. Check full dyn-compatibility rules rather than a partial checklist. Trait upcasting requires Rust 1.86 or later. Do not recommend unavailable features based on a current online example.

Public errors should support the decisions callers need. Typed and opaque errors are useful; erased errors are not automatically wrong. Missing cause information matters when it prevents diagnosis or recovery. If a reporter walks `source()`, check that the outer message does not repeat the same cause. A dependency preference alone is not a finding.

## 5. Clarity, cost, and verification

Report a maintenance issue when it creates repeated reasoning, invalid states, hidden ownership, or costly coupling. Explain who must maintain it and what becomes harder. Cosmetic naming, formatting, imports, and a particular module layout usually belong to project conventions.

A clone may intentionally create a snapshot or retain shared ownership. A collection may provide needed random access. An explicit loop may show control flow more clearly. Before recommending an optimization, identify a meaningful allocation, complexity, memory, or latency cost. Do not replace a clear solution with speculative machinery.

Check tests at behavior boundaries. For a missing test finding, name the important unprotected behavior. Do not report a bare lack of tests as proof of a bug. Check docs for ownership, errors, panic policy, safety obligations, and effects the signature cannot express.

Use existing checks and the supported feature matrix. `cargo doc` alone does not enable missing-doc warnings. Release tests do not verify abort behavior. Lint suppressions can be justified and must fit the MSRV. Do not prescribe all-features, pedantic lints, Miri, fuzzing, or a full platform matrix for every change.

## Sources

Use current primary documentation for claims that affect a finding, with the project's versions and targets. These links support the rubric; they do not require loading every source for every review.

- [Rust Reference](https://doc.rust-lang.org/reference/): [dyn compatibility](https://doc.rust-lang.org/reference/items/traits.html#dyn-compatibility), [`impl Trait`](https://doc.rust-lang.org/reference/types/impl-trait.html), [undefined behavior](https://doc.rust-lang.org/reference/behavior-considered-undefined.html).
- Standard library contracts: [`Ord`](https://doc.rust-lang.org/std/cmp/trait.Ord.html), [`Hash`](https://doc.rust-lang.org/std/hash/trait.Hash.html), [`Borrow`](https://doc.rust-lang.org/std/borrow/trait.Borrow.html), [`Mutex`](https://doc.rust-lang.org/std/sync/struct.Mutex.html), [`mem::forget`](https://doc.rust-lang.org/std/mem/fn.forget.html).
- [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/), [Cargo SemVer](https://doc.rust-lang.org/cargo/reference/semver.html), [Cargo profiles](https://doc.rust-lang.org/cargo/reference/profiles.html), [Rust 1.86](https://blog.rust-lang.org/2025/04/03/Rust-1.86.0/).
- [Practical API design](https://corrode.dev/blog/practical-rust-api-design/), [parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/), [pattern matching and compatibility](https://seanmonstar.com/blog/pattern-matching-and-backwards-compatibility/).
- [Cancellation analysis](https://sunshowers.io/posts/cancelling-async-rust/) and Tokio [`select!`](https://docs.rs/tokio/latest/tokio/macro.select.html), [`JoinHandle`](https://docs.rs/tokio/latest/tokio/task/struct.JoinHandle.html), [`Mutex`](https://docs.rs/tokio/latest/tokio/sync/struct.Mutex.html), [`timeout`](https://docs.rs/tokio/latest/tokio/time/fn.timeout.html), [`spawn_blocking`](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html).
- [BeautifulRust base review](https://github.com/morganlinton/BeautifulRust/blob/d55e94728cdc24aa41c9a3e5fe2aaefee08bdaed/skills/rust-review/SKILL.md). The companion `rust-best-practices` skill contains the full source analysis when installed; it is not needed to run this rubric.
