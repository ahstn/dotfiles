# Refactoring

Own the behavior contract. Structure changes; behavior does not. Split discovered bugs or missing features into separate work rather than hiding them in cleanup.

1. Read the affected code paths and their callers. **Gate.** Pin current behavior with a characterization test, snapshot, or equivalence harness before moving structure. Add the pin if coverage is absent; type checking and lint are not behavior pins.
2. Name the reader-load problem and the target module layout, types, and call graph. Use `code-simplification` for behavior-preserving simplification and `code-structure-and-modularity` for boundary changes. Keep clear, local code rather than adding indirection to satisfy a pattern.
3. Subtract obsolete code, redundant wrappers, or orphan references only within the requested change. The new shape should remove branches, invalid states, or repeated assumptions, not merely move complexity.
4. Move in small behavior-preserving steps. **Gate.** Keep the pin green after each step, because a large mixed diff makes regressions harder to isolate. Delegate mechanical edits only when the scope and review cost justify it.
5. **Gate.** For an internal API, migrate every caller and remove the obsolete API in the same cutover; a published API with external consumers keeps its compatibility contract unless the user says otherwise. Check strings, documentation, and back-references as well as symbols; rename tools do not cover every use.
6. **Gate.** Prove equivalence on the real artifact with output comparison, baseline replay, or the documented verification path. Apply `principles/prove-it-works.md`; compilation alone cannot show unchanged behavior.
7. Keep the change only if it reduces reader load somewhere. Revert speculative reshaping that does not; name any intentional behavior change and route it to `playbooks/feature.md`.

**Reply:** the structure changed, pinned contract, equivalence evidence, reader-load improvement, and any proposed change you rejected.
