# Worktree cleanup

Own the disk audit and safety gate. Audit first; a suggested bucket is not permission to delete.

1. Record disk usage and run `bash scripts/worktree-audit.sh <repo-path>` relative to the skill directory. It reads paths from git's worktree registry and reports size, age, local merge state, uncommitted work, remote state, and available PR state without changing the repository.
2. **Gate.** Verify every candidate is not in use by the user, another session, or a background job. Ask for usage information only when it cannot be established from available evidence; a merged branch alone does not prove an idle worktree.
3. **Gate.** Inspect tracked, untracked, and ignored files, plus local-only commits, before proposing removal. Untracked files are not automatically disposable scratch, and a closed PR is not proof that its commits were merged.
4. Present exact paths, size estimates, and reasons to remove or retain each candidate. Flag stale local refs or unavailable PR metadata rather than presenting uncertain merge status as fact.
5. **Gate.** Obtain explicit confirmation for the exact deletion set, including any force removal or ignored artifacts. Never infer consent from an audit bucket, because uncommitted files are not recoverable from branch refs.
6. Remove confirmed worktrees with `git worktree remove <path>`; use `--force` only if the confirmed action explicitly covers its data loss. If ignored artifacts prevent removal, inspect and obtain permission for those artifacts instead of blindly deleting the directory.
7. Preview stale registration cleanup with `git worktree prune --dry-run`; confirm the listed removals before `git worktree prune`. Re-list worktrees and record disk usage after the authorized cleanup. Do not delete branch refs as part of worktree cleanup.

**Reply:** disk usage before and after, space reclaimed, worktrees removed, and the reason each remaining candidate was retained.
