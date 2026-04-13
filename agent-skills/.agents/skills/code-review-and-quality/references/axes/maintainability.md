# Maintainability & Readability Axis

Focus on future change cost.

Look for:

- names or control flow that hide intent
- unnecessary indirection, wrappers, helpers, or toggles
- parameter threading or duplicated logic caused by the new change
- speculative abstraction added before there is a real second or third use
- dead code, fallback paths, or comments that no longer match reality

Do not turn this axis into formatting review.
