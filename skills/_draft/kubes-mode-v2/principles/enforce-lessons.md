# Enforce Lessons in Structure

When the same correction comes up a second time, encode it in a mechanism instead of more text.

**Why:** A written rule needs the reader to notice, remember, and comply. A lint rule, type, test, or script enforces itself.

**Pattern:** rank fixes by how well they hold, and pick the highest that works.
1. Make the mistake impossible (architecture, data structure).
2. Block it (types, lint, CI check whose error names the fix).
3. Catch it (test).
4. Write it down (doc, agent rule, skill text). Nothing fails when an agent skips it, so this is last. Add an example of the failure when you use it.

**Scope:** one occurrence is an anecdote. Wait for the second. Propose the mechanism in your reply; build it only when it is in scope for the current task or the user agrees. A guardrail project is not a side effect of an unrelated fix.
