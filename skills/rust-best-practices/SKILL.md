---
name: rust-best-practices
description: Write, refactor, or debug Rust with clear type contracts, deliberate ownership, useful errors, and checks matched to the change. Use for Rust implementation and API design work.
license: MIT
---

# Rust best practices

Build correct Rust that callers can understand from a small amount of context. Use types and signatures to express useful contracts. Choose abstractions that remove repeated reasoning and keep the requested change small enough to assess.

## Working contract

The user's instructions take precedence over skill defaults. Use project context to fill routine gaps, and complete the requested work. Ask only when a missing decision changes behavior, compatibility, or scope and the evidence cannot resolve it. Continue other work while an answer is pending.

Preserve existing public behavior and API compatibility unless the task calls for a change. A panic-to-error rewrite, changed output order, new allocation, or new trait bound can change a contract. Check callers before treating these as cleanup. Keep unrelated work intact.

Use these rules to choose a design. Do not treat them as a list of patterns to remove. Language rules and library contracts govern correctness. Project conventions govern local style. External guides offer advice. Rules for one company need not fit another project. If a skill instruction stops the requested work, identify it and explain the concrete conflict.

## Establish the context

Read the relevant code, callers, tests, `Cargo.toml`, toolchain settings, and applicable CI commands. Establish the edition, minimum supported Rust version (MSRV), enabled features, target platforms, and runtime where they affect the change. Check for `no_std` or allocation limits before choosing dependencies or owned data.

Check who calls the code. Public libraries, shared internal code, and applications can need different contracts. A `lib.rs` alone does not establish an external compatibility promise. Keep application code direct. Plan how published interfaces handle errors and evolve. Follow the documented conventions of the resolved framework version.

## Design and implement

- **Express domain distinctions.** Use enums for meaningful alternatives, newtypes for values that must not mix, and validated constructors for persistent invariants. Plain booleans, tuples, and structs remain useful when their meaning is clear. Add typestate only when it removes a real sequence error without making callers harder to write.
- **Preserve information.** Separate expected absence, malformed input, and operational failure. Use `Option`, `Result`, or a small domain enum as needed. Do not discard errors merely to shorten an iterator chain.
- **Make ownership deliberate.** Borrow for temporary access and move for transfer. Clone when an independent value or shared handle is needed. Before changing a clone, inspect its semantics and cost. Use `Rc`, `Arc`, interior mutability, or guards when the contract requires them.
- **Keep contracts honest.** Validate trait laws, conversion behavior, mutation paths, and lifetime relationships. A newtype does not protect an invariant if its fields, setters, deserializer, or `DerefMut` can bypass validation.
- **Choose the simplest useful abstraction.** Start from concrete types. Compare enums, generics, and trait objects against actual variation and costs. Use clear loops or iterator chains; syntax alone does not decide quality.
- **Keep failure and resource behavior visible.** Handle expected failures with useful context. Use a panic for an established bug or documented precondition only when its effect is acceptable. Check cleanup, cancellation, resource bounds, and unsafe contracts where the change touches them.

Load only the references needed for the task:

| Task | Reference |
| --- | --- |
| Ownership, domain types, public APIs, traits, or compatibility | [Types and API contracts](references/types-and-apis.md) |
| Parsing, errors, panics, async, locks, unsafe, or FFI | [Runtime behavior and safety](references/runtime-and-safety.md) |
| Build commands, tests, lint policy, or toolchain limits | [Verification](references/verification.md) |
| Conflicting advice, source provenance, or updating these skills | [Source analysis](references/source-analysis.md) |

For independent questions, delegate bounded research or review when it can improve the result. Give each agent a clear scope and validate its conclusions before applying them. Keep a small change in one place when delegation adds no value.

## Verify and finish

Run the project checks that apply and add tests for meaningful behavior or a demonstrated regression. Use the verification reference to select feature, release, async, or unsafe checks when relevant. Do not add tests that merely repeat the implementation. After required checks pass, broaden testing only for new changes, failures, or unresolved concerns.

Report the result, material compatibility changes, checks run, and remaining limits in concise prose. Distinguish observed results from inference. Do not claim checks passed when tools were unavailable. A narrow verification gap does not prevent completion of work that the evidence supports.

Adapted from BeautifulRust, with the user's Rust reading list and supplied GPT-6 prompting guidance. See [source analysis](references/source-analysis.md) and [license](LICENSE).
