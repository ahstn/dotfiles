# Feature

Own the design, review, and verification. Delegate by judgment, not by task label.

1. Read the affected code paths and their callers, including existing conventions and all consumers of shared primitives.
2. Name the desired behavior, success criteria, data shape, and boundaries before implementation. Use `code-structure-and-modularity` for boundary or domain-model decisions and `grill` when material choices remain contested.
3. Identify prerequisite gates and genuinely independent slices. Keep coupled changes with one owner; separate shared writes only when the invariant permits it. Delegate independent slices per the Subagents section of `SKILL.md`, and review delegate output yourself.
4. Implement the smallest coherent feature. Re-ground upstream-derived edits in the actual source and update every affected consumer; a partial shared-primitive cutover leaves divergent behavior.
5. **Gate.** Verify the acceptance criteria on the matching surface and run the relevant regression checks. Use the project's verify-* skill or documented verification path; otherwise drive the real surface yourself (CLI run, browser, test harness). Wrong-surface or inconclusive evidence is not a pass. Apply `principles/prove-it-works.md`.
6. Keep larger work in small, ordered, independently verifiable units. Commit and open PRs only through `github-yeet`, per the Git section of `SKILL.md`; do not make committing or opening a PR a prerequisite for implementation.

**Reply:** what you built, the important design choices and their reasons, acceptance evidence, and open decisions.
