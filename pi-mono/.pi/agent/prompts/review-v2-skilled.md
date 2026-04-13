Run the multi-axis code review workflow.

Follow the injected `code-review-and-quality` skill.
Resolve:
- source_of_truth = `github-pr` or `local-diff`
- delivery_mode = `github-inline` or `thread`

Execution order:
1. Gather prerequisites and build one compact shared review context:
   intent, base/head, changed files, diff, test signal, and existing review context.
2. Launch one read-only axis reviewer in parallel for:
   correctness, maintainability, architecture, security, performance.
3. Give each reviewer the shared context plus only the axis reference it needs.
4. Wait for all reviewer outputs, then aggregate and deduplicate.
5. Keep only findings that are concrete, actionable, and introduced or worsened by the change.
6. Verify full changed-file coverage, severity consistency, and evidence completeness.
7. Deliver:
   - `thread`: concise grouped review in the local response
   - `github-inline`: inline comments on the narrowest changed range; only the primary agent may publish

Rules:
- Do not let subagents edit files or post comments.
- If required context is retrievable, retrieve it. Ask only if it is not.
- Prefer no finding over weak speculation.