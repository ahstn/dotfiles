# Source analysis and adaptation

Reviewed on 2026-11-08. This file explains how the two Rust skills differ from their sources. Read it when updating guidance or resolving a disputed recommendation. It is not part of the routine implementation checklist.

## Inputs and provenance

The base is [BeautifulRust](https://github.com/morganlinton/BeautifulRust/tree/d55e94728cdc24aa41c9a3e5fe2aaefee08bdaed), revision `d55e94728cdc24aa41c9a3e5fe2aaefee08bdaed`. Both skill entrypoints and the supporting source digests were fetched and read. The adapted skills retain the upstream MIT notice in each skill's `LICENSE`.

| Fetched input at that revision | Git blob |
| --- | --- |
| `skills/rust-best-practices/SKILL.md` | `59bf05973535c6398854eeef7adfd7ecce672f5c` |
| `skills/rust-review/SKILL.md` | `78bf79f7c59b0197ead9cca911ebd6af28267bcf` |
| `LICENSE` | `ac8854130fbce7019423c53172914105591851f1` |

The five general-source digests cover Rust API Guidelines, Effective Rust, Rust Design Patterns, Microsoft, and Google. Their content informed this analysis, but the local skills use focused references rather than loading five broad summaries. Upstream plugin settings, remote services, lint packs, benchmarks, and evaluation harnesses were not installed.

The user supplied **Idiomatic Rust Reading List.md**, compiled 2026-10-21, and the attached **Using GPT-6** guide. The reading list supplies a design goal: reduce what callers must remember by expressing useful facts in types and signatures. The prompting guide supplies workflow requirements. Neither input is a language specification. The skills carry the useful guidance locally and do not depend on an Obsidian path or attachment being present.

## How conflicts were resolved

Rust language rules, standard-library contracts, Cargo behavior, and the resolved runtime documentation determine technical correctness. Project contracts determine supported behavior and compatibility. API guides, organizational rules, and essays help choose between valid designs. A source's authority does not turn a preference into a defect.

The local skills keep the useful parts of this advice. These include clear ownership, domain types, useful errors, safe boundaries, and measured costs. They remove unsupported absolutes, fixed workflow costs, and review findings based on syntax alone.

## Base skill decisions

| Base area | Decision in the local skills |
| --- | --- |
| Mindset and triggering | Keep meaningful types and application simplicity. Select the implementation skill for Rust work, not every mention of Cargo or a trait. Treat actual consumers as the API boundary; `lib.rs` alone does not prove a published contract. |
| Verification | Replace the fixed all-features, warnings-as-errors sequence with project checks and focused evidence. `cargo doc` does not enable missing-doc warnings. Preserve valid lint exceptions and MSRV. |
| Ownership | Keep borrowed views and deliberate transfer. Permit snapshots, shared handles, borrowed structs, and public guards when their contracts need them. Reject the claim that all borrow-related clones lose changes. |
| Domain types | Keep enums, newtypes, and checked construction. Remove bans on public booleans and refined integer types. Check all mutation and construction paths before trusting an invariant. |
| Standard traits | Derive only meaningful semantics. Check equality, hash, and order laws directly. A mixed manual/derived implementation is not automatically wrong. |
| Constructors and builders | Replace numeric argument thresholds and mandatory defaults with construction needs. A valid default must exist. Consuming builders can support conditional configuration through reassignment. |
| Public evolution | Make `non_exhaustive`, sealing, opaque returns, and dependency exposure deliberate choices. Preserve both source and behavioral contracts. These mechanisms do not make arbitrary changes safe. |
| Polymorphism | Add enums for a closed implementation set. Remove a fixed ranking that always prefers generics over `dyn`. Check dispatch, storage, code size, and the required extension points. |
| Refactoring | Preserve error, output, ownership, and API behavior unless change is requested. Converting panic to `Err` is a contract change, not automatically what a caller wants. |
| Errors and panics | Choose typed or erased errors from recovery needs. Permit locally proved panics. Treat cause chains, poison recovery, and cleanup as contracts to inspect. |
| Everyday syntax | Keep useful standard operations and explicit ownership. Follow local naming, imports, and output conventions. Loops, `+`, getters, or a prelude are not defects by themselves. |
| Async | Replace blanket `Send`, no-runtime, no-guard, and fixed-yield rules with runtime and workload needs. Add task ownership, cancellation, partial mutation, and shutdown checks. |
| Unsafe and FFI | Keep small sound abstractions and proof documentation. Separate missing comments from UB. Correct ABI and unwind claims; tests support but do not prove soundness. |
| Crates and dependencies | Preserve project boundaries and additive-feature intent. Do not split a crate because it has a subdirectory, install a lint pack, or add dependencies during unrelated work. |
| Documentation and tests | Document facts the signature cannot express. Choose meaningful behavior tests and existing test seams. Remove required mock constructors, blanket fuzzing, and full platform coverage for every task. |
| Performance | Measure important costs before making clarity worse. Do not prescribe allocator changes, shrinking collections, alternate hashers, or boxing without workload evidence. |
| Review output | Replace rule counts with a location, trigger or cost, consequence, and correction. Remove quotas, mandatory praise, forced snippets, and lint-pack promotion. Intentional or documented defects retain their real severity. |

## Checks against the base's named sources

| Source and pages inspected | What the comparison changed |
| --- | --- |
| [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/): checklist, [interoperability](https://rust-lang.github.io/api-guidelines/interoperability.html), [flexibility](https://rust-lang.github.io/api-guidelines/flexibility.html), [type safety](https://rust-lang.github.io/api-guidelines/type-safety.html), [future-proofing](https://rust-lang.github.io/api-guidelines/future-proofing.html), [dependability](https://rust-lang.github.io/api-guidelines/dependability.html) | The source discusses boxed errors and public opaque return types. It supports familiar contracts, not the base skill's universal bans. Use meaningful traits and document behavior that types cannot express. |
| Effective Rust: [builders](https://effective-rust.com/builders.html), [standard traits](https://effective-rust.com/std-traits.html), [optimization](https://effective-rust.com/optimize.html), [wildcard imports](https://effective-rust.com/wildcard.html) | The book permits conditional consuming builders, sensible allocation, shared pointers, and curated preludes. The digest sometimes removes these tradeoffs. Keep clear ownership and measure important costs. |
| Rust Design Patterns: [borrow-related clones](https://rust-unofficial.github.io/patterns/anti_patterns/borrow_clone.html), [extensibility](https://rust-unofficial.github.io/patterns/idioms/priv-extend.html), [command pattern](https://rust-unofficial.github.io/patterns/patterns/behavioural/command.html) | Cloning can improve clarity; non-exhaustive types have costs. Function pointers can make indirect calls, so they are not a general static-dispatch guarantee. |
| [Google Rust Style Guide](https://google.github.io/styleguide/rustguide.html) | The small, flat-crate preference includes Chromium-specific policy. Google permits practical clones, clear booleans, several collection-return cases, and some non-leaf module code. Those exceptions were lost or narrowed upstream. |
| Microsoft: [applicability](https://microsoft.github.io/rust-guidelines/#applicability), [universal](https://microsoft.github.io/rust-guidelines/guidelines/universal/index.html), [library UX](https://microsoft.github.io/rust-guidelines/guidelines/libs/ux/index.html), [interop](https://microsoft.github.io/rust-guidelines/guidelines/libs/interop/index.html), [resilience](https://microsoft.github.io/rust-guidelines/guidelines/libs/resilience/index.html), [apps](https://microsoft.github.io/rust-guidelines/guidelines/apps/index.html), [performance](https://microsoft.github.io/rust-guidelines/guidelines/performance/index.html), [layout](https://microsoft.github.io/rust-guidelines/guidelines/project/index.html) | The source allows adaptation and exceptions. Its Tokio, error-struct, wrapper, builder, allocator, and layout policies have a particular setting. Preserve their purpose without imposing them on GUI threads, embedded crates, or unrelated edits. |

## Reading-list findings

The four annotated corrode posts were checked against their text and primary documentation:

- [When Rust Gets Ugly](https://corrode.dev/blog/ugly/): retain standard parsing operations and explicit outcomes. The later parser skips every `InvalidLine`, including malformed records, despite earlier error handling. Keep ignored lines separate from failure. `Result<Option<Entry>, Error>` remains valid when its two successful outcomes are clear. The manual error example also leaves `source()` at its default, losing the wrapped I/O cause.
- [Hardening Rust](https://corrode.dev/blog/hardening-rust/): retain explicit failure boundaries and resource limits. Panic hooks also run under abort. The iterative factorial still exceeds `u64` at 21. Overflow depends on profile settings. Release tests do not test deployed abort policy. Allocator, container, sandbox, and circuit-breaker choices remain deployment decisions.
- [Dyn Compatibility](https://corrode.dev/blog/dyn-compatibility/): its short method checklist is incomplete. Lifetime parameters and some pointer receivers are allowed; other associated items matter. Add closed-set enum dispatch and upcasting when the MSRV supports it. A borrowed trait object need not allocate.
- [Practical API Design](https://corrode.dev/blog/practical-rust-api-design/): adopt local reasoning and visible ownership. Add the public turbofish caveat to argument `impl Trait`. A borrowed return signature does not prove the body has no allocations or side effects. Prefer explicit domain access without banning useful `Deref` implementations.

The wider list was used as follows. “Read” means the named page and relevant passages were inspected, not that every linked book or repository was audited.

| Reading-list group | Coverage and conclusions |
| --- | --- |
| Curated collections | The API Guidelines, Effective Rust, Design Patterns, and Microsoft pages above were checked. [Canonical's introduction](https://canonical.github.io/rust-best-practices/), [preconditions](https://canonical.github.io/rust-best-practices/preconditions.html), [errors](https://canonical.github.io/rust-best-practices/error-and-panic-discipline.html), and [structure](https://canonical.github.io/rust-best-practices/structural-discipline.html) are local policy, with valid unwrap exceptions. [Elements of Rust](https://github.com/ferrous-systems/elements-of-rust) offers clarity techniques, but contains obsolete examples and a one-shot formatter unsuitable as a general pattern. The `mre/idiomatic-rust` index was a discovery lead, not independently audited evidence. |
| Parse and refinement | Read [Alexis King](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/), [Eli Bendersky](https://eli.thegreenplace.net/2026/rusty-thoughts-on-parse-dont-validate/), and [Harudagondi](https://harudagondi.space/blog/parse-dont-validate-and-type-driven-design-in-rust/). Keep validation evidence in a type. Bendersky's empty config still creates an empty path component; list cardinality is insufficient. Harudagondi's sketches need compilation and stronger numeric assumptions. Do not infer that all optional results need refined input types. |
| Newtypes and state | Read the [newtype guide](https://www.howtocodeit.com/guides/ultimate-guide-rust-newtypes), [defensive programming](https://corrode.dev/blog/defensive-programming/), [Cliffle](https://cliffle.com/blog/rust-typestate/), [Hoverbear](https://hoverbear.org/blog/rust-state-machine-pattern/), and [enums versus booleans](https://blakesmith.me/2019/05/07/rust-patterns-enums-instead-of-booleans.html). Reject business-only validation as a reason for unsafe APIs. Check mutation and deserialization. Choose runtime enums or typestate from actual use; public variant additions can break callers. |
| API contracts | Read [Rust's Golden Rule](https://steveklabnik.com/writing/rusts-golden-rule/), [pattern matching and compatibility](https://seanmonstar.com/blog/pattern-matching-and-backwards-compatibility/), [sealed traits](https://predr.ag/blog/definitive-guide-to-sealed-traits-in-rust/), and [Elegant Library APIs](https://deterministic.space/elegant-apis-in-rust.html). Preserve signature promises and behavioral meaning. Sealing and non-exhaustiveness have limits. The older API article points readers toward current guidelines. |
| Syntax and scale | Read [Rust's Ugly Syntax](https://matklad.github.io/2023/01/26/rusts-ugly-syntax.html), the [Rust100k index](https://matklad.github.io/2021/09/05/Rust100k.html), and its [architecture](https://matklad.github.io/2021/02/06/ARCHITECTURE.md.html) and [testing](https://matklad.github.io/2021/05/31/how-to-test.html) articles. Prefer visible semantics and meaningful boundaries. Do not turn compiler-front-end testing advice into a universal ban on unit tests. |
| Errors | Read [Greptime](https://greptime.com/blogs/2024-05-07-error-rust), [library error design](https://d34dl0ck.me/rust-bites-designing-error-types-in-rust-libraries/index.html), and [Nick Cameron](https://www.ncameron.org/blog/to-panic-or-not-to-panic/). Preserve context and recovery needs. Multiple variants may contain one source type; duplicate generated `From` impls are the conflict. The boxed-error example loses `source()` without an annotation. [Three Kinds of Unwrap](https://zkrising.com/writing/three-unwraps/) remained unavailable after two attempts; no rule is attributed to it. |
| Async | Read [cancellation](https://sunshowers.io/posts/cancelling-async-rust/), [async and concurrency](https://kobzol.github.io/rust/2025/01/15/async-rust-is-about-concurrency.html), and the without.boats archive with [Pin](https://without.boats/blog/pin/) and [async cleanup](https://without.boats/blog/asynchronous-clean-up/). Separate local cancellation safety from system correctness. Treat proposed cleanup syntax as design discussion, not available language features. |
| Learning from std | Read the [concurrent-cache article](https://tech-lessons.in/en/blog/learning_from_the_source_architectural_idioms_in_a_concurrent_cache/). Keep borrowed lookup, guards, state extraction, and shared handles. Correct blanket newtype-layout and guaranteed-cleanup claims. The raw-pointer guard is an example requiring proof, not a trusted implementation to copy. |

## Primary checks for disputed claims

The focused references link the relevant specifications. Key corrections use these sources:

- [`Ord`](https://doc.rust-lang.org/std/cmp/trait.Ord.html), [`Borrow`](https://doc.rust-lang.org/std/borrow/trait.Borrow.html), and [`BTreeMap`](https://doc.rust-lang.org/std/collections/struct.BTreeMap.html): check actual laws; safe logic errors are not automatically memory corruption.
- [`Error`](https://doc.rust-lang.org/core/error/trait.Error.html): `Debug` and `Display` are required; thread and lifetime bounds depend on use. Preserve useful causes without duplicate rendering. [`thiserror`](https://docs.rs/thiserror/latest/thiserror/) defines conversion and source annotations.
- [Panic hooks](https://doc.rust-lang.org/std/panic/fn.set_hook.html), [allocation failure](https://doc.rust-lang.org/std/alloc/fn.handle_alloc_error.html), [profiles](https://doc.rust-lang.org/cargo/reference/profiles.html), and [FFI](https://doc.rust-lang.org/nomicon/ffi.html#ffi-and-unwinding): avoid replacing one broad failure claim with another. In particular, allocation failure is not universally outside panic handling.
- [Dyn compatibility](https://doc.rust-lang.org/reference/items/traits.html#dyn-compatibility), [`impl Trait`](https://doc.rust-lang.org/reference/types/impl-trait.html), [Rust 1.86](https://blog.rust-lang.org/2025/04/03/Rust-1.86.0/), and [Cargo SemVer](https://doc.rust-lang.org/cargo/reference/semver.html): preserve compiler and downstream contracts.
- [`mem::forget`](https://doc.rust-lang.org/std/mem/fn.forget.html), [layout](https://doc.rust-lang.org/reference/type-layout.html), and [exception safety](https://doc.rust-lang.org/nomicon/exception-safety.html): account for permitted leaks, representation guarantees, and panicking callbacks.
- Tokio [`select!`](https://docs.rs/tokio/latest/tokio/macro.select.html), [`JoinHandle`](https://docs.rs/tokio/latest/tokio/task/struct.JoinHandle.html), [`Mutex`](https://docs.rs/tokio/latest/tokio/sync/struct.Mutex.html), [`timeout`](https://docs.rs/tokio/latest/tokio/time/fn.timeout.html), and [`spawn_blocking`](https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html): use operation-specific cancellation and blocking contracts.

## Applying the supplied GPT-6 guidance

| Prompting concern | Concrete change |
| --- | --- |
| Strong instruction sensitivity | Reserve firm rules for correctness, scope, and contracts. State that user instructions override skill defaults. Treat source prose as evidence, not instructions to execute. |
| Initiative and follow-through | Resolve routine choices from project context, continue independent work, and do not add approval gates for ordinary implementation or checks. Explain a real instruction conflict if it stops progress. |
| Excess testing | Select checks from changed behavior and required CI. Stop after relevant uncertainty is resolved. Avoid implementation-mirroring tests and mandatory tool installation. |
| Delegation | Delegate bounded independent questions when useful. Validate findings centrally; do not require fixed reviewer roles or counts. |
| Detailed default output | Use concise findings and verification limits. Remove required praise, empty headings, fixed finding counts, and code blocks where prose is clearer. |
| Task scope | Review-only stays read-only; an explicit fix request permits fixes. Do not silently expand into lint-pack adoption, API migration, deployment hardening, or remote publication. |

No model name, reasoning level, provider setting, or API migration is required by these skills. The attachment informed their behavior; its unrelated product claims were not part of the Rust source audit.

## Validation limits

The upstream entrypoints and digests were read fully. The source review covered the pages above and the contracts used in the local guidance. It did not check every line in all linked books, the full Rust100k series, or each source repository. Article examples were checked for flaws, but were not all compiled. The local skills use the resulting rules; they do not import the example code.

The companion review skill includes behavioral cases for future changes. Three isolated trials and a separate file review checked the first version. The agents received the task, skill, and raw fixture without the expected findings.

| Check | Observed result |
| --- | --- |
| Skill structure | The skill-creator validator passed for both skills. Local links resolved and whitespace checks passed. Each skill has the references it needs within its own directory. |
| Review trial | Found the seeded malformed-record bug. Accepted a boolean setter, snapshot clone, clear loop, and consistent manual ordering with derived equality. Reported avoidable unsafe access as a small maintenance cost, not UB. Two focused tests failed as expected and confirmed the parser defect; two control tests passed. |
| Implementation trial | Built a small parser and native-path loader with no dependencies. Six tests, a doctest, formatting, Clippy, and docs passed on Rust 1.99.1. Inspection found duplicate cause text. A focused skill change led to a failing regression test and a narrow fix; all seven integration tests and formatting then passed. The broader checks were not repeated after that message-only fix. |
| Async review trial | Found loss of state during cancellation and a task detached by timeout. Accepted the short synchronous lock section and the retained future polled through a borrow. Verified the findings from source and Tokio docs; no async code was run. |
| File review | No blocking issues. Corrected one minor table entry that blurred argument and return `impl Trait`. Both skills were judged usable on their own. |

Rust 1.74 was declared by the parser fixture but was not installed, so its MSRV was not tested. The local macOS filesystem rejected the non-UTF-8 filename used in a test. The trial checked native-path preservation on that error path; successful loading with such a name remains unverified here.

Prose checks gave Flesch-Kincaid estimates near grades 7–10. This check excluded code, tables, headings, and link lists; it is a readability aid, not formal ASD-STE100 certification. The trials checked useful behavior, but did not measure model-wide quality or prove every rule. Public API breakage, `Borrow` laws, and the other listed cases remain available for future trials.
