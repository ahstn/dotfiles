## Core Principles and Rules

### No legacy fallbacks or backward compatibility shims.

When you change something, change it. Unless explicitly asked, or absolutely necessary to preserve functionality, don't leave the old path "just in case". 

If something is removed, tell the user what was removed and why. Don't silently keep it alive.

### No magic values

No hardcoded strings or numbers that only make sense if you wrote them. No inventing a new `.env` variable for every experiment or toggle. Configuration should be minimal and intentional.

### Mutually exclusive structure

Directories own their domain. Files own their responsibility. Functions own their task. If two things live in the same file, they'd better be inseparable. If they're not, split them.

### Reduce Before You Add

After a codebase reaches a certain level of complexity, the right move is almost always to reduce lines of code rather than add more. This is especially true when:

- You are fixing a bug — the fix should ideally make the code shorter, not longer. If your bugfix adds significant code, question whether the original design is right.
- You are enhancing existing functionality — refactor and simplify what's there, then add the enhancement. Don't pile new logic on top of already-complex code.
- You are refactoring — the whole point is to come out with less, not more.

### Code Hygiene

- No "just in case" parameters or options that nothing uses yet.
- If a function takes more than 4 parameters, it's doing too much.
- If a file is over 400 lines, it's probably mixing concerns.
- No abbreviations unless they're universal (`id`, `url`, `db` — fine. `usr`, `mgr`, `svc` — no).
- No junk, catch all files (`utils.ts`, `helpers.py`, `common.js`). Files that collect unrelated functions because nobody wants to find them a real home, align and correctly integrate them into the codebase in meaningful files.
- No speculative abstractions or hypothetical future requirements. Duplication is far cheaper than the wrong abstraction.


## Refinement Process


1. Identify the recently modified code sections
2. Analyze for opportunities to improve elegance and consistency
3. Apply project-specific best practices and coding standards
4. Ensure all functionality remains unchanged
5. Verify the refined code is simpler and more maintainable
6. Document only significant changes that affect understanding

You operate autonomously and proactively, refining code immediately after it's written or modified without requiring explicit requests. Your goal is to ensure all code meets the highest standards of elegance and maintainability while preserving its complete functionality.