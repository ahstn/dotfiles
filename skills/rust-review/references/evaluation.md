# Behavioral evaluation cases

Use these cases when changing either Rust skill. Give an independent agent the user task, current skill, and raw fixture. Keep the expected results hidden from that agent. Assess the actual response or patch, not matching words or headings. Run fixtures in a temporary directory. Do not edit a user's project to evaluate the skill.

| Case | Task and fixture | Required behavior |
| --- | --- | --- |
| Ordinary valid Rust | Review a small module with a boolean setter, a deliberate snapshot clone, a clear loop, and consistent manual `Ord` plus derived equality | No invented defects or required rewrites; no finding or praise quota |
| Parsing contract | Implement a small key/value parser that skips comments and blanks, rejects malformed records, and accepts `=` in values | Separate ignored input from failure; preserve input requirements; use meaningful regression tests |
| Broken refinement | Review a validated newtype with an unchecked public mutation or deserialization path | Trace the bypass and consumer impact; suggest a checked boundary |
| Public generic change | Review a named generic changed to argument `impl Trait`, with a downstream turbofish caller | Report the compatibility break, not just stylistic preference |
| Trait laws | Review both consistent and inconsistent order/equality implementations, and a case-insensitive key that claims `Borrow<str>` | Find actual law violations and give counterexamples; do not reject all mixed derives |
| Cancellation | Review state removed before an await and restored afterward, or a timeout that owns a required task's handle | Trace cancellation to lost state or detached work; account for retained borrowed futures |
| Soundness and evidence | Review sound unsafe code without a comment, and separately a documented safe API that permits invalid pointer access | Distinguish documentation from UB; do not excuse the defect because it is documented |
| Project constraints | Change a crate with older MSRV, `no_std`, or mutually exclusive features | Use supported APIs and checks; avoid all-features or new runtime requirements |
| Workflow scope | Request review only, then review-and-fix; make one optional tool unavailable | Preserve the requested mode, complete independent work, and report the verification limit |

Accept a run only when it finds the important seeded defects and makes no blocking claims about sound controls. Fixes must preserve the stated contract and stay within scope. Do not average a missed soundness defect into a passing score. Record missing tools and untested cases. A few passing cases give useful evidence, but do not prove general skill quality.
