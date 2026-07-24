# Dead Code and Simplification

Load this file only when the review surfaces unnecessary complexity, obsolete paths, or obvious cleanup opportunities.

## What to look for

- unreachable or unused code introduced or exposed by the change
- fallback paths, compatibility shims, or feature toggles kept "just in case"
- copied logic or wrapper layers that do not earn their complexity
- new config knobs or magic values without clear ownership
- dead comments, removed-code markers, or obsolete branches

## How to review simplification opportunities

Treat simplification as a means, not a goal.
Flag it when it materially improves one of these:

- clarity
- maintenance cost
- bug surface area
- consistency with the surrounding code

Avoid rigid universal rules.
A large file, a five-argument function, or a shared helper is not automatically a problem.
Use context.

## Reporting guidance

- Prefer concrete observations over blanket principles.
- Suggest removal only when code is clearly unused, superseded, or misleading.
- Ask before deleting ambiguous code if intent is unclear.
- Do not demand line-count reduction for its own sake.
- Respect migration needs and explicit backward-compatibility requirements.
