
Intended to be used with [agents/reviewer.md](../../../../agent/agents/reviewer.md) and the following example prompts:

```md
Use the `code-review-and-quality` skill for a multi-axis code review. Orchestrate read-only @review sub-agents per axes (5 total) and aggregate their findings.

The delta between this branch and `main`, with this thread as a response delivery mode.
```
 
Optionally to consider any existing GH comments:
```
Using the GitHub CLI, fetch comments from the pull request <id>. Consider their validity and, if any, additional context they might provide.
```


## Five Axis

Easily isolated for sub-agents:

- Correctness & robustness
- Maintainability & readability
- Design & architecture
- Security & trust boundaries
- Performance & scalability

Tests and verification are treated as a cross-cutting gate handled by the main agent, rather than as a sixth full axis. 

## Simple but sufficient guidelines

Use light heuristics for the axes. Intentionally avoids enumerating every possible review smell.

IMO being overly specific on guidelines leads to overfitting. Models are generally smart enough to figure out our intentions. In this, simple guidelines should be sufficient.

Of course, there's a balance to strike here, which is why the skill exists.

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