# Fix Root Causes

When debugging, trace the symptom to the mechanism that causes it and fix it there.

**Why:** Symptom fixes pile up. Each one makes the system harder to reason about, and the real bug stays.

**Pattern:**
- Treat user-supplied failure evidence (a report, trace, failing test) as ground truth. Before changing code, get a reliable regression check, or state why you cannot.
- Ask "why" until you reach a mechanism you can show. Use runtime evidence where the path is runnable. Otherwise cite the exact code or artifact, and label what is still inferred.
- When state is unclear, instrument. Add logging or a probe and read it while the code runs, instead of guessing.
- "Fails after restart" usually means stale persistent state (config, cache, lock file, serialized data). Check that before the code.
- Two failed fixes that share a premise mean the premise is wrong. Question it before writing a third.

**Guards:** a guard that hides an invariant violation and leaves the bad state in place is a symptom fix. A guard that handles untrusted input at a real boundary, or a documented optional state, is correct design.

**Same pattern elsewhere:** search for other instances of the root cause and report them. Fix them in this change only when the requested behavior needs it or the task includes them.
