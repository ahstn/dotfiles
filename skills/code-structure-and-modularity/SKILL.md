---
name: code-structure-and-modularity
description: Code structure and module-boundary rubric for writing, extending, reviewing, or reorganizing code. Use when adding new functionality, choosing where code should live, splitting large files or functions, designing package/module boundaries, reviewing architecture drift, or deciding whether code should be extracted, inlined, grouped, or left together.
---

# Code Structure Rubric

## Purpose

Use this skill to keep code easy to read, test, modify, and review. Optimize for cohesive responsibilities and clear public boundaries, not for arbitrary line-count reduction.

This skill is adjacent to code simplification: simplification improves expression; this rubric improves placement, ownership, encapsulation, and module shape.

## Core Rules

- Group code by durable responsibility, domain concept, workflow, or ownership boundary.
- Keep public interfaces narrow, named, and stable. Hide implementation details where the language allows it.
- Prefer high cohesion and low coupling: things that change together should live together; unrelated reasons to change should be separated.
- Use line counts as review triggers, not targets.
- Avoid both mega-files and tiny-file scatter.
- Preserve behavior, tests, errors, side effects, performance expectations, and external API compatibility unless the task explicitly calls for a breaking change.
- Follow local project conventions before applying this rubric generically.

## Function Size

- Prefer functions under 60 executable lines.
- Functions over 80 executable lines should be easy to scan and justify.
- Functions over 120 executable lines require a reason in review.
- Functions over 150 executable lines should usually be split.
- Functions over 200 executable lines are exceptional.

A long function may be acceptable when:

- It is linear and low-branching.
- It keeps a single coherent workflow together.
- Splitting would create navigation-heavy helper chains.
- The repeated structure is easier to audit in one place.
- It is generated, table-like, parser/state-machine code, or simple dispatch.

A shorter function is not automatically better. Do not split solely to reduce line count if the result forces readers through several private helpers that are only meaningful in sequence.

## File and Module Size

- Prefer files in the 200-600 line range.
- Start questioning files around 800 lines.
- Treat 1000 lines as a soft cap.
- Files over 1500 lines need clear justification or a split plan.

Split files and modules by cohesion and ownership, not by arbitrary symbol count. Related helper types, local utilities, and tightly coupled implementation details may stay together when that makes the code easier to understand.

Split when a file contains distinct concepts, unrelated responsibilities, different change cadences, independent test surfaces, or sections that different maintainers would naturally own independently.

## Placement Rubric

Before adding code, ask:

- What existing module owns this responsibility?
- Does this change fit the module's current name and public contract?
- Would a future maintainer know to look here?
- Does it share data, invariants, lifecycle, or tests with nearby code?
- Is it a new domain concept that deserves a named file/module/package?
- Would adding it here create a second unrelated reason for this file to change?

Prefer adding to an existing cohesive module when the answer is clear. Create or split a module when the current location becomes hard to name, hard to test, or responsible for multiple domains.

## Encapsulation Rubric

- Expose the smallest useful public API.
- Re-export stable entry points from package/module boundaries when callers depend on them.
- Keep private helpers close to the code that uses them.
- Avoid generic `utils`, `helpers`, or `common` modules unless the code is truly cross-cutting and has a clear owner.
- Avoid cyclic dependencies. If two modules need each other's internals, the boundary is wrong or a third coordinating concept is missing.
- Put language/framework adapters at the edges; keep core domain logic independent where practical.

## Splitting Rubric

Split when it improves at least one of:

- comprehension: the extracted unit has a clear name and responsibility
- testability: the extracted unit can be tested independently
- ownership: different maintainers or workflows own different parts
- change safety: future edits affect fewer unrelated concepts
- dependency direction: imports become clearer and less cyclic
- reviewability: diffs become easier to inspect without hiding behavior

Do not split when:

- the new file is just a few lines with no independent concept
- readers must jump across many private helpers to understand one workflow
- the split only satisfies a line-count preference
- the abstraction is speculative
- the public API becomes wider or less obvious

## Review Heuristics

Before requesting or applying a split, ask:

- Can the function's job be summarized in one sentence?
- Is the control flow mostly linear?
- Are there more than 2-3 nesting levels?
- Is cyclomatic complexity above 10 or cognitive complexity above 15-25?
- Would a meaningful sub-part benefit from independent unit tests?
- Would extracting a helper name a real concept, or just hide a few lines?
- Does splitting reduce mental load, or create jump-chasing?

## New Feature Checklist

When writing new functionality:

- Start by locating the owning domain/module.
- Add to the existing module if it remains cohesive and reasonably sized.
- Introduce a new file/package only for a named concept, adapter, model family, command, workflow, or boundary.
- Keep tests close to the behavior or update the existing test grouping consistently.
- Update docs only when public behavior, API, command usage, or architecture changes.
- Preserve existing public imports or provide compatibility re-exports when callers may rely on them.

## Refactor Checklist

For structural changes:

- Separate mechanical moves from behavior changes when possible.
- Move code first, then update imports, then run formatting and tests.
- Keep exported names stable unless a breaking change is intentional.
- Verify no dead imports, duplicate definitions, or orphaned tests remain.
- Summarize what moved, what public surface stayed stable, and what verification passed.

## Done Criteria

- The new structure is easier to explain than the old one.
- File names describe responsibilities rather than implementation accidents.
- Public APIs are narrower or unchanged.
- Local conventions are preserved.
- Tests, build, lint, and formatting pass at the appropriate scope.
