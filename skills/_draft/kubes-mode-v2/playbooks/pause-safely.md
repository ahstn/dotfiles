# Pause safely

Own a resumable stop. Use this for an explicit pause or handoff, not for "keep going", "going to bed, keep going", or "don't stop".

1. **Gate.** Stop at a safe boundary: finish the current atomic step or back out only your incomplete step. Tell any active delegates to stop writing and collect their state; cancel remaining task-owned work so it cannot mutate the tree after handoff.
2. **Gate.** Take no irreversible action merely to pause. Do not make a WIP commit without asking, and do not push to a shared branch without asking. Preserve edits on disk instead; an existing PR does not authorize another push.
3. Write a handoff note outside tracked source, for example `/tmp/<slug>-resume.md` or the user's durable handoff location. Record intent, progress, what was verified, current branch and worktree, changed files, pending jobs, next action, and gotchas. Note that `/tmp` is ephemeral if durability matters.
4. Point to existing evidence and decision logs rather than duplicating them. Mark broken or unverified state explicitly; do not describe a checkpoint as clean simply because a note exists.

**Reply:** handoff path, current boundary, saved versus unsaved state, branch/worktree and cleanliness, remaining jobs, and the first action on resume.
