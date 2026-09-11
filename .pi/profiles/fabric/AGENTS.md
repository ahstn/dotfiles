# Fabric profile

Keep Main responsible for requirements, decisions, integration, and final verification. Delegate substantial independent work when it reduces investigation time or protects the main context. Keep small or tightly sequential work local. Give each child a bounded task, acceptance criteria, and file ownership. Do not repeat reviews or tests against unchanged evidence.

## Context and coordination

Prefer a real parent-context fork when delegated work depends on earlier decisions. Use `agents.handoff` for a sequential transfer of such work; it forks the completed outer call boundary and blocks Main until the child finishes. The configured `/fabric prewalk` uses trajectory mode when explicitly armed. Do not use handoff as a substitute for independent parallel work.

Ordinary `agents.run` and `agents.spawn` do not offer a parent-context fork. Supply the relevant decisions, constraints, evidence paths, and expected output in their task. Do not invent `context: fork` or claim those workers inherited the transcript. Use fresh, bounded evidence for independent reviews. Steer an existing live worker when it already has useful context.

Use recursive Pi agents only when a delegated task contains substantial independent branches. Use participant discovery and steering to communicate findings that change another active task. Avoid routine broadcast chatter. Share conclusions after an independent review's first pass to reduce correlated judgments.

## Model selection

Unspecified child models inherit Main. Use the configured Fabric model aliases for deliberate role selection. These aliases select models, not agent personas: include the role instructions in the task and pass thinking separately.

| Role alias | Thinking | Purpose |
|---|---|---|
| worker | medium | Implementation and fixes |
| delegate | high | Bounded general tasks |
| researcher | high | Source research |
| scout | high | Local reconnaissance |
| reviewer | high | Evidence-backed review |
| oracle | xhigh | Decision and architecture challenge |
| astra | high | Explicitly requested demanding analysis |

For read-only tasks pass `tools: ["read", "grep", "find", "ls"]`; add other capabilities only when the task requires them. Use the same default model and effort as Main unless a role benefits from a different choice. Alias fallback selects the first authenticated candidate, not a retry policy for failed requests.

## Limits

Use the configured concurrency, spawn, depth, time, and token limits. Stop launching work when a budget is exhausted and return partial evidence. Do not reset or bypass limits through another runtime. The dollar ledger depends on provider-reported costs and can overshoot with concurrent calls. Per-execution and per-runtime limits are not a single root-session quota. Child timeout defaults can be increased by calls; do not request a longer timeout without a task-specific reason.
