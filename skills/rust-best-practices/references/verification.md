# Verification

Use the repository's required checks and supported configurations. Choose extra checks from the changed behavior. The examples below are options, not a mandatory command sequence.

| Change or uncertainty | Useful check |
| --- | --- |
| Rust source formatting | `cargo fmt --check`; use formatting writes only within the authorized edit scope |
| Types, idioms, or compilation | Targeted `cargo check` or the project's Clippy command, with the affected package and supported features |
| Behavior or a defect | Existing focused tests; add a regression that fails for the actual defect |
| Public documentation | Relevant doctests and `cargo doc --no-deps`; broken-link or missing-doc checks need the corresponding lint policy |
| Profile-dependent arithmetic or assertions | Relevant tests under the production profile, such as `cargo test --release` |
| Deployed abort behavior | A subprocess check of an artifact built with that panic strategy |
| Unsafe memory operations | Focused Miri tests where supported, plus review of the safety argument |
| Parser or protocol boundary | Malformed input, size limits, and meaningful properties; fuzzing when the exposure warrants it |
| Async state or shutdown | Controlled interleavings and cancellation tests; avoid relying on arbitrary sleeps |
| Claimed performance improvement | Representative measurements with the intended profile and workload |
| Public compatibility or MSRV | Supported compiler checks and representative downstream use; existing SemVer tools when available |

`--all-features` is suitable only when that feature set is supported. Mutually exclusive backends, target-specific code, and `no_std` need the project's actual matrix. Do not infer coverage of all combinations from one successful build.

`cargo test --release` can expose profile-sensitive behavior, but the stable test harness uses unwinding even when the deployed binary uses `panic = "abort"`. It does not verify that process policy.

Follow the existing lint policy. A warning is evidence to inspect, not an automatic review severity. Prefer a narrow, explained suppression when a lint does not fit. `#[expect]` can detect a stale suppression, but needs a supporting compiler (stable since 1.81). `#[allow]` remains valid when the MSRV or conditional code requires it. Do not impose a new lint table, `-D warnings`, pedantic set, or dependency during an unrelated change.

Test contracts, not source shape. Check that malformed records fail, trait laws agree, cancellation preserves state, or output meets its ordering promise. Do not require mocks for every I/O call; use a useful boundary such as an in-memory reader, temporary file, controlled clock, or integration test.

Record what ran, the configuration, and the result. If a tool is missing or a check is blocked, state the affected confidence limit and finish independent work. Stop expanding verification after required checks and relevant uncertainty are resolved.

Sources: [Cargo profiles](https://doc.rust-lang.org/cargo/reference/profiles.html), [Cargo features](https://doc.rust-lang.org/cargo/reference/features.html), [lint expectations](https://doc.rust-lang.org/reference/attributes/diagnostics.html#the-expect-attribute), [Rust 1.81](https://blog.rust-lang.org/2024/09/05/Rust-1.81.0/), [Miri](https://github.com/rust-lang/miri).
