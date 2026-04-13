# Design & Architecture Axis

Focus on system fit.

Look for:

- violations of module boundaries or ownership
- dependency direction problems or new coupling across layers
- duplication that should be shared, or premature sharing that should stay local
- new patterns that diverge from the codebase without strong reason
- abstractions that are too broad, too leaky, or too generic for the actual need

Do not rewrite the architecture in your head. Judge the actual change in context.
