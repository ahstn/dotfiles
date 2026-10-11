# Guard the Context Window

The context window is finite, and compaction is lossy. Spend it on decisions, not raw data.

**Why:** A full window degrades reasoning, and compaction drops detail you may need later. Raw logs, traces, and long files cost the most and inform the least.

**Pattern:**
- Route bulk reads (large logs, traces, heap snapshots, wide code surveys) to a subagent or a script. Keep the reduced finding in the main thread: file, symbol, line, number.
- Read ranges, not whole files. Avoid re-reading unchanged content unless the earlier read was partial or is no longer in context.
- Keep durable state (todo list, plan file) current during long work, so compaction or a restart costs as little as possible.
- Fan out only when slices are independent. One subagent per slice beats one subagent per file.

**Not this:** spawning subagents for work that fits in a few reads. Delegation has its own cost: the brief, the review, and the summary.
