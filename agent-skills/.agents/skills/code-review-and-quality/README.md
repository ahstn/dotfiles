
## Five Axis

Easily isolated for sub-agents:

- Correctness & robustness
- Maintainability & readability
- Design & architecture
- Security & trust boundaries
- Performance & scalability

The main improvement is not adding more axes, but making each one narrower and more legible for parallel passes.

Tests and verification are treated as a cross-cutting gate handled by the main agent, rather than as a sixth full axis. 


## What “simple but sufficient” looks like

Use light heuristics for the axes. Do not try to enumerate every possible review smell.

Be explicit about the fragile parts:

how to choose source of truth
when to use parallelism
what the sub-agents are allowed to do
what counts as a reportable issue
what the output must contain
how to verify completeness before finalizing
when comments may actually be posted to GitHub

That is exactly where prompt guidance says explicit structure pays off. [1]

## Parallel sub-agents

read-only sub-agents, same scope, one narrow role each, structured findings back to the main agent, and no direct edits or side effects from sub-agents.

For your version, I would go one step further and give each axis its own tiny reference file:

- references/axes/correctness.md
- references/axes/maintainability.md
- references/axes/architecture.md
- references/axes/security.md
- references/axes/performance.md

That gives you real progressive disclosure:

- single-agent mode can stay on the core SKILL.md
- parallel mode loads only the per-axis file relevant to each sub-agent
- GitHub mode adds references/github-review.md
- simplification only loads when the diff suggests it
- optional tone/style layers can be loaded later without contaminating core review logic

## GitHub PR Mode

- GitHub PR metadata, diff, changed files, comments, base branch, and head SHA are authoritative
- a local checkout is only authoritative if it matches the PR head SHA
- do not post comments until after aggregation and deduplication
- inline comments should target the smallest valid changed range
- stale bot “no issues” comments should be removed, minimized, or superseded when new findings appear


[1]: https://developers.openai.com/api/docs/guides/prompt-guidance