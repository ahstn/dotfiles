Audit this repository for low-value code: redundant tests, trivial wrappers, dead abstractions, duplicate helpers, stale comments, and unnecessary ceremony. Verify each removal is safe, make the smallest cleanup, run focused tests and lint, and report what changed with evidence. Inspect every major directory before finishing.

Sloppy code audits go through the rust code in [crates](crates/) hunting for slop. Useless tests, unnecessary function wrappers, overly complex code that could be decomposed, stuff like that.

This codebase will outlive you. Every shortcut becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.

You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

Fight entropy. Leave the codebase better than you found it.
