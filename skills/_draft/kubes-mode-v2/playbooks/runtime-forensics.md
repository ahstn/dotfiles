# Runtime forensics

Own the diagnosis. Follow `principles/fix-root-causes.md`; the deliverable is a cited mechanism, not a fix.

1. **Gate.** Capture a live artifact on the matching surface before drawing a conclusion: CPU profile for a spinning process, heap snapshot for a leak, or trace for a visual glitch. Use the project's verify-* skill or documented verification path; otherwise drive the real surface yourself (CLI run, browser, test harness).
2. Reduce the artifact to the hot function, retainer chain to a GC root, or loop firing without input. Follow `principles/context-window.md`; delegate bulky parsing when useful and keep the reduced findings with artifact pointers.
3. **Gate.** Test the proposed mechanism with runtime evidence before you believe it. On a local dev process, reversible instrumentation (logging, a debugger eval, a temporary hot patch) is fine. On a shared or production process, prefer read-only diagnostics and ask before changing its behavior.
4. Map the finding to source: file, symbol, and the allocation, retention, or scheduling site. Distinguish observed evidence from inference and state limitations.
5. Keep production source unchanged unless asked to implement a fix. Restore temporary diagnostic changes you introduced. Recommend `playbooks/bug-fix.md` or `playbooks/perf-issue.md` once the cause is known.

**Reply:** signal captured, reduced finding, mechanism evidence, source location, artifact paths, and unresolved diagnostic limits.
