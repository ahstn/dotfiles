# Types and API contracts

Use this guide when a change affects ownership, domain models, traits, or callers. Its defaults apply only when they fit the project contract.

## Preserve facts in types

Parse untrusted values into types that retain the facts later code needs. Make fields private when unrestricted mutation would break those facts. Check every entry point: constructors, `From` and `TryFrom`, `Default`, deserialization, setters, and mutable accessors. An invariant holds only if all safe paths preserve it.

Use a newtype for a meaningful distinction such as units, identifiers, or validated input. Use an enum when each state has different data or only one choice is valid. Independent flags can remain booleans or a flag set. A named boolean setter such as `set_enabled(bool)` is often clear; `configure(true, false)` may hide two domain choices.

Use typestate for stable call sequences that are valuable to enforce at compile time. Use a runtime enum when state comes from runtime input or values must share one collection. A builder is useful for staged configuration or interacting options, not because a function crossed a fixed argument count.

Check the exact property a type proves. A nonempty list can contain an empty path. A nonzero float can be NaN or infinite. An absolute path need not exist or remain unchanged. A domain validation rule does not by itself justify an `unsafe` constructor.

Sources: [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/), [Rust adaptation](https://eli.thegreenplace.net/2026/rusty-thoughts-on-parse-dont-validate/), [typestate](https://cliffle.com/blog/rust-typestate/), [state machines](https://hoverbear.org/blog/rust-state-machine-pattern/).

## Ownership should describe use

Accept `&str`, `&[T]`, and `&Path` when the operation needs only those views. Use `&String`, `&Vec<T>`, or another concrete container when its own properties are needed. Take ownership when the operation stores or consumes a value. Use `&mut T` for mutation that the caller retains. Reusable output buffers and lending APIs can justify forms that differ from these defaults.

Borrowed structs are useful for views and parsers; owned structs can simplify storage and task boundaries. Do not replace a borrow with an allocation merely to remove lifetime syntax. `T: 'static` means the type has no shorter borrowed data; it does not force a value to live forever.

When a borrow conflict appears, inspect the required data flow. A shorter scope, split field borrow, or `mem::take`/`replace` may express it better. Check the temporary state left by a take operation, especially before a fallible call or `.await`. Cloning a small value can be the clearest correct solution. Cloning an `Arc` shares the allocation; it does not copy its contents.

Keep storage details private when callers do not need them. Expose shared ownership, a guard, a pin, or a boxed value when it is part of the contract. For example, returning a lock guard can tie access to lock ownership. Do not add a wrapper solely to conceal a standard type.

Sources: [Borrowing and clones](https://rust-unofficial.github.io/patterns/anti_patterns/borrow_clone.html), [`'static`](https://doc.rust-lang.org/rust-by-example/scope/lifetime/static_lifetime.html), [`Arc`](https://doc.rust-lang.org/std/sync/struct.Arc.html).

## Standard traits are contracts

Implement familiar traits when their semantics fit. Prefer `From` for infallible, lossless conversions and `TryFrom` for fallible conversions. Their blanket implementations normally supply `Into` and `TryInto`. Choose `FromStr` for parsing that returns an owned value; a borrowed parse result may need a different interface.

Derive only traits that match the domain. `Default` needs a valid default; `Copy` promises implicit copying; `Clone` may duplicate a resource or only a handle. `Debug` should avoid disclosing secrets. `Display` is for an intended text form, not every type. Trait implementations and bounds are public commitments.

Verify the laws, whether implementations are derived or handwritten:

- Equal values must hash equally. Equality must agree with ordering when both are implemented.
- `Ord` must define a total order consistent with `PartialOrd` and equality. A manual order and derived equality can be valid if they compare the same identity.
- `Borrow<Q>` requires compatible equality, ordering, and hashing with `Q`. A case-insensitive key generally cannot implement `Borrow<str>` using ordinary string semantics. `AsRef` promises only a reference conversion.
- A `Deref` implementation exposes implicit coercions and target methods. Use it for cheap, unsurprising transparent access. For distinct domain values, an explicit accessor often preserves meaning. Review `DerefMut` for invariant bypasses.

Sources: [`Ord`](https://doc.rust-lang.org/std/cmp/trait.Ord.html), [`Hash`](https://doc.rust-lang.org/std/hash/trait.Hash.html), [`Borrow`](https://doc.rust-lang.org/std/borrow/trait.Borrow.html), [`Deref`](https://doc.rust-lang.org/std/ops/trait.Deref.html), [API conventions](https://rust-lang.github.io/api-guidelines/).

## Choose variation deliberately

| Form | Useful when | Cost or limit to check |
| --- | --- | --- |
| Concrete type | One implementation meets the task | May need a later abstraction when variation becomes real |
| Enum | The alternatives form a controlled set | New public variants can break exhaustive callers |
| Named generic or argument `impl Trait` | Callers choose types with static dispatch | Generated code size, compile time, and type complexity |
| Return `impl Trait` | The function chooses one concrete type behind stated bounds | Captured lifetimes, exposed bounds, and auto-trait promises |
| `dyn Trait` | Runtime variation or an open implementation set matters | Dyn compatibility and indirect calls; allocation depends on storage |

A borrowed `&dyn Trait` does not require a heap allocation. Use named generics to express relationships or preserve explicit type arguments. Argument-position `impl Trait` can be clearer for one input, but changing a public named generic to it can break turbofish callers.

For trait objects, check the full dyn-compatibility rules. Lifetime parameters on methods are allowed; type parameters on dispatchable methods are not. Associated constants, generic associated types, receivers, supertraits, and uses of `Self` also matter. `where Self: Sized` can exclude a method from dynamic dispatch. Native `async fn` and opaque return types in methods need a compatible design before dynamic dispatch is possible. Boxing or an adapter can help, with explicit allocation and `Send` choices.

Trait upcasting is stable from Rust 1.86. Check the MSRV before replacing an adapter. Prefer an existing project design when a new dispatch form has no concrete benefit.

Sources: [dyn compatibility](https://doc.rust-lang.org/reference/items/traits.html#dyn-compatibility), [`impl Trait`](https://doc.rust-lang.org/reference/types/impl-trait.html), [Rust 1.86](https://blog.rust-lang.org/2025/04/03/Rust-1.86.0/).

## Evolve APIs without hiding changes

Keep fields private when representation or invariants may change. Public fields are suitable for passive data with a stable construction contract. Add `#[non_exhaustive]` when future variants or fields justify restrictions on downstream matches and construction. Adding it to an existing public type can itself break callers.

Seal a trait when downstream implementations would prevent its intended evolution. Sealing does not remove obligations to callers or trait-object users. Preserve method signatures, auto traits such as `Send`/`Sync`, return-type bounds, ownership, and observable behavior.

For an open protocol domain, consider an opaque validated value with associated constants. Adding a recognized enum variant can change matching behavior even when source code still compiles. A public refined type such as `NonZeroUsize` is valid when it expresses the domain; it need not be hidden behind a raw integer.

Choose iterators or owned collections from caller needs, borrowing, evaluation timing, and error behavior. Returning an iterator can defer work and retain a borrow. Returning a `Vec` can provide a useful snapshot. Exposing a dependency type is a compatibility decision, not an automatic defect.

Sources: [future-proofing](https://rust-lang.github.io/api-guidelines/future-proofing.html), [Cargo SemVer](https://doc.rust-lang.org/cargo/reference/semver.html), [pattern matching and compatibility](https://seanmonstar.com/blog/pattern-matching-and-backwards-compatibility/), [sealed traits](https://predr.ag/blog/definitive-guide-to-sealed-traits-in-rust/).
