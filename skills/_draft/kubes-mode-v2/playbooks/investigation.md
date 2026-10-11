# Investigation

Own the answer. Investigation produces a cited explanation or recommendation, not a code change.

1. **Gate.** Keep the investigation read-only unless the user authorizes changes, because diagnosis is not permission to implement.
2. Read the affected code paths and their callers. For motivation or regression history, read git log/blame.
3. Trace the relevant data flow and name the invariants, entry points, and failure modes. Delegate bulky independent research only when it saves context; review the findings yourself.
4. Explain the mechanism with source locations. For a choice between alternatives, give tradeoffs and a recommendation rather than forcing a fixed report template.
5. Separate observations from inference and name unresolved evidence. If the premise is wrong, say why.
6. If a change is needed, recommend `playbooks/bug-fix.md` or `playbooks/feature.md`; do not silently switch from investigation to implementation.

**Reply:** the cited answer or recommendation, your judgment with reasons, and unresolved questions.
