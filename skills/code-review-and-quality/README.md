
Intended to be used with [agents/reviewer.md](../../../../agent/agents/reviewer.md) and the following example prompts:

```md
Use the `code-review-and-quality` skill for a multi-axis code review. Orchestrate six read-only @review sub-agents, one per axis, and aggregate their findings.

The delta between this branch and `main`, with this thread as a response delivery mode.
```

Optionally to consider any existing GH comments:
```
Using the GitHub CLI, fetch comments from the pull request <id>. Consider their validity and, if any, additional context they might provide.
```


## Six Axes

Easily isolated for sub-agents:

- Correctness & robustness
- Maintainability & readability
- Design & architecture
- Security & trust boundaries
- Performance & scalability
- Dead code & simplification

Tests and verification are treated as a cross-cutting gate handled by the main agent, rather than as a seventh full axis.

## Simple but sufficient guidelines

Use light heuristics for the general axes. Avoid long smell catalogs that make reviewers overfit to named patterns. The dedicated dead code and simplification axis is stricter because it must test concrete structural alternatives, not only scan for local defects.

Of course, there's a balance to strike here, which is why the skill exists.

## Parallel sub-agents

Use read-only sub-agents with the same scope and one narrow role each. Each agent returns structured findings to the main agent and makes no edits or other side effects.

Give each axis its own reference file:

- references/axes/correctness.md
- references/axes/maintainability.md
- references/axes/architecture.md
- references/axes/security.md
- references/axes/performance.md
- references/axes/dead-code-and-simplifying.md

That gives you real progressive disclosure:

- single-agent mode covers all six axes from the core SKILL.md
- parallel mode loads exactly one axis file for each of the six sub-agents
- the dead code and simplification axis always owns structural-delta and removal findings
- GitHub mode adds references/github-review.md
- optional tone/style layers can be loaded later without contaminating core review logic

## GitHub PR Mode

- GitHub PR metadata, diff, changed files, comments, base branch, and head SHA are authoritative
- a local checkout is only authoritative if it matches the PR head SHA
- do not post comments until after aggregation and deduplication
- inline comments should target the smallest valid changed range
- stale bot “no issues” comments should be removed, minimized, or superseded when new findings appear


[1]: https://developers.openai.com/api/docs/guides/prompt-guidance