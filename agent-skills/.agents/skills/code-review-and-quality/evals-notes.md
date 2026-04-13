# Evaluation Notes

## Trigger eval ideas

Should trigger:

- "Review my staged changes before I merge this branch."
- "Audit this GitHub PR for security and performance regressions."
- "Please review the diff and leave inline PR comments."
- "Run a multi-axis code review on my local changes."

Should not trigger:

- "Implement this feature."
- "Refactor this module for me." 
- "Write tests for this file."
- "Explain this codebase architecture."

## Output-quality eval ideas

1. local diff with one clear correctness bug
2. local diff with only a minor nit; expect no actionable finding
3. PR diff with a security bug at a trust boundary
4. diff that introduces N+1 behavior
5. diff with large architectural spread; expect architecture finding
6. bug fix without regression test; expect verification gap or correctness finding
7. stale local checkout vs GitHub PR head; expect GitHub to be used as source of truth
8. parallel axis pass with overlapping findings; expect deduplication into one final issue

For each eval, compare:

- with skill vs without skill, or
- new skill vs previous skill snapshot

Track:

- pass/fail assertions
- tokens
- duration
- human review notes
