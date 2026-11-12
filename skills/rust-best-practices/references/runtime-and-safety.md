# Runtime behavior and safety

Read the sections touched by the change. Runtime names do not prove defects; trace their use and the contract they must preserve.

## Parsing and errors

Keep successful absence separate from invalid input. A line parser can return `Result<ParsedLine, ParseError>` where `ParsedLine` distinguishes an entry from an ignored line. `Result<Option<Entry>, ParseError>` is also clear when there are only two successful outcomes. Preserve malformed input as an error unless the requested format defines another policy. `filter_map(Result::ok)` silently discards failures.

Prefer standard operations such as `lines`, `split_once`, slice patterns, and `?` when they match the grammar. Specify empty keys, empty values, repeated keys, embedded delimiters, and encoding behavior from the task. Do not grow a small parser into a full file-format implementation without a need. Keep parsing separate from file access when that gives a useful test boundary; a `BufRead` parameter can support streaming without a parser framework.

Select error types by caller decisions. Typed errors or opaque errors with stable accessors support recovery. Erased errors can be suitable when callers only propagate or report failures. `anyhow`, `eyre`, `thiserror`, and handwritten types are options, not required dependencies. Respect `no_std`, MSRV, and allocation limits. Add `Send`, `Sync`, and `'static` bounds when crossing boundaries that require them.

Preserve useful causes with `source()` and add operation context where it becomes known. When a cause is exposed through `source()`, keep the outer `Display` focused on context instead of repeating that cause. A reporter that walks the chain should show each cause once. Avoid exposing credentials or entire untrusted records in messages. When one source type occurs in several operations, use explicit mapping; duplicate generated `From<T>` implementations conflict, but several enum variants may store the same source type. Return a consumed input on failure when retry or recovery needs it.

Sources: [parser case study and its limits](https://corrode.dev/blog/ugly/), [Rust error decisions](https://doc.rust-lang.org/book/ch09-03-to-panic-or-not-to-panic.html), [`Error` and cause rendering](https://doc.rust-lang.org/core/error/trait.Error.html), [error context at scale](https://greptime.com/blogs/2024-05-07-error-rust), [`thiserror`](https://docs.rs/thiserror/latest/thiserror/).

## Panics, arithmetic, and cleanup

Use `Result` for expected input and environment failures. An `expect` can be correct when local evidence establishes the invariant; explain why it holds when that is not clear. A documented panicking convenience API can coexist with a fallible alternative. Check the caller and deployment contract before replacing either. Removing visible unwraps does not prove panic freedom.

Arithmetic depends on operator and profile settings. Check `overflow-checks`, `debug-assertions`, and `panic` separately. Choose checked, saturating, or wrapping operations when those semantics are required. A `debug_assert!` cannot be the only enforcement of a condition required for release correctness or unsafe soundness.

Panic hooks run before both unwind and abort runtimes. `catch_unwind` catches only unwinding panics and is not routine error handling. A library should not silently replace a process-wide hook. Avoid assuming every process failure will invoke it.

RAII manages resources when destructors run. Abort, process exit, cycles, and safe leaks can skip cleanup. Soundness must not depend on every caller dropping a returned guard. Keep `Drop` short and robust; expose an explicit fallible close or shutdown operation when successful completion matters. A blocking destructor is a workload concern to assess, not automatic undefined behavior.

Lock poisoning signals possible damaged state. Recovery is valid when the protected invariant can be checked or repaired. Blindly ignoring poison and blindly declaring all poison fatal both discard needed context.

Sources: [profiles](https://doc.rust-lang.org/cargo/reference/profiles.html), [overflow](https://doc.rust-lang.org/reference/expressions/operator-expr.html#overflow), [panic hooks](https://doc.rust-lang.org/std/panic/fn.set_hook.html), [`catch_unwind`](https://doc.rust-lang.org/std/panic/fn.catch_unwind.html), [`mem::forget`](https://doc.rust-lang.org/std/mem/fn.forget.html), [mutex poisoning](https://doc.rust-lang.org/std/sync/struct.Mutex.html#poisoning).

## Async ownership and cancellation

Choose async to express concurrent work when it fits the application. It does not by itself make CPU work faster or parallel. Preserve the project's runtime and check its resolved version.

Trace task ownership through completion, failure, cancellation, and shutdown. Dropping a future cancels the work represented by that future, but does not necessarily undo external effects. Dropping a Tokio `JoinHandle` detaches its task. A timeout that owns the handle can therefore leave the task running. Retain control of work that must stop or be observed; request cancellation and await completion when the contract requires it.

At each affected `.await`, check partial mutation and ownership. Taking a value from shared state and restoring it after an await can leave the state empty on cancellation. Guard-based unlock does not repair a logical invariant. Local cancellation safety and system correctness are separate questions.

For `select!`, check the concrete operations and what each branch owns. Some operations lose partial progress or an owned message when dropped. A retained future polled through `&mut` can survive a losing branch. With biased selection, inspect starvation. Timeouts do not preempt non-yielding work or promise remote rollback; retries need a duplicate-effect policy.

Use brief synchronous lock sections for simple shared data when they do not span awaits or block the executor for too long. An async mutex can intentionally span an await. Inspect lock order, callbacks, contention, and cancellation before changing lock type. Channels and a single state owner may simplify a protocol, but are not mandatory replacements.

Move blocking or CPU-heavy work to an appropriate executor when needed. Bound job concurrency. Started Tokio `spawn_blocking` work cannot be aborted through its handle. Bounded queues constrain only what they hold; also check producers, in-flight tasks, message size, and shutdown behavior.

Sources: [cancellation analysis](https://sunshowers.io/posts/cancelling-async-rust/), [async and concurrency](https://kobzol.github.io/rust/2025/01/15/async-rust-is-about-concurrency.html), Tokio [`select!`](https://docs.rs/tokio/latest/tokio/macro.select.html#cancellation-safety), [`JoinHandle`](https://docs.rs/tokio/latest/tokio/task/struct.JoinHandle.html), [`timeout`](https://docs.rs/tokio/latest/tokio/time/fn.timeout.html), [`Mutex`](https://docs.rs/tokio/latest/tokio/sync/struct.Mutex.html), [`spawn_blocking`](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html).

## Unsafe and FFI

Prefer a safe interface from the standard library or a suitable maintained crate. Where unsafe code is needed, identify the exact obligations: validity, initialization, alignment, aliasing, provenance, lifetimes, layout, thread access, and unwind behavior. Inspect all safe paths that can affect them, including callbacks, panic, cancellation, and leaks.

Write `# Safety` documentation for caller obligations and `// SAFETY:` comments for the local proof. Use `unsafe_op_in_unsafe_fn` at a level compatible with the project and MSRV. Missing documentation can hide proof gaps, but is not itself proof of undefined behavior. A passing Miri run checks exercised behavior; it does not establish soundness for all callers.

Use representation attributes only with their documented guarantees. A plain newtype has no general FFI layout guarantee. Specify allocation ownership, nullability, string encoding, and ABI for foreign calls. `catch_unwind` cannot catch aborts; Rust panics crossing a non-unwind ABI abort, while foreign unwinding through such a boundary can cause undefined behavior. Use the exact ABI contract rather than assuming all FFI unwinding is equivalent.

Sources: [undefined behavior](https://doc.rust-lang.org/reference/behavior-considered-undefined.html), [exception safety](https://doc.rust-lang.org/nomicon/exception-safety.html), [layout](https://doc.rust-lang.org/reference/type-layout.html), [FFI and unwinding](https://doc.rust-lang.org/nomicon/ffi.html#ffi-and-unwinding), [pinning](https://doc.rust-lang.org/std/pin/index.html).
