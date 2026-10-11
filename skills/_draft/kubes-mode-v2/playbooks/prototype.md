# Prototype

Own the design decision, not production code. The prototype is a throwaway instrument; the real build follows `playbooks/feature.md`.

1. Name the decision: layout, interaction, density, behavior, timing, or implementation approach. Without a decision to resolve, build the feature rather than a prototype.
2. Gather prior art when the design space is open. Offer plausible directions and ask the user only for a product or preference choice that evidence cannot settle.
3. **Gate.** Isolate throwaway work from production source, because speed-first experiments must not become accidental production dependencies. Use the lightest stack or script that can answer the question; omit production abstractions and polish unless they affect the decision.
4. Compare meaningful alternatives, preferably behind one labeled switcher or one repeatable command. Try another approach when the first fails; do not polish an unproven direction.
5. **Gate.** Observe the decision on the matching surface. Use the project's verify-* skill or documented verification path; otherwise drive the real surface yourself (CLI run, browser, test harness). Capture screenshots and interactions for visual choices, or output and timing for behavioral choices. Observation is the evidence here, not a production test suite.
6. Present tradeoffs and a recommendation. Do not promote the prototype as shippable code; use `code-structure-and-modularity` if the selected direction needs boundary decisions before the real build.

**Reply:** variants explored, observed evidence, tradeoffs, recommendation, scratch path, and a clear statement that the artifact is throwaway.
