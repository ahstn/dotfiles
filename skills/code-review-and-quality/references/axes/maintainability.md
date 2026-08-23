# Maintainability & Readability Axis

Focus on future change cost.

Can another engineer (or agent) understand this code without the author explaining it?

- Are names descriptive and consistent with project conventions? (No `temp`, `data`, `result` without context)
- Is the control flow straightforward (avoid nested ternaries, deep callbacks)?
- Is the code organized logically (related code grouped, clear module boundaries)?
- Would comments help clarify non-obvious intent? (But don't comment obvious code.)
- Does the change follow all applicable project guidance and established local patterns? If it diverges, is the reason explicit?

Do not report dead code, unused paths, unearned abstractions, broad structural simplifications, or file-decomposition findings. Those belong to the dead code and simplification axis.

Do not turn this axis into formatting review.
