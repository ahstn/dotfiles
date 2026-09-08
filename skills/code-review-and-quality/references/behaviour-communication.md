# Reporting, Comments, and Feedback

Use [Finding requirements](../SKILL.md#finding-requirements) for reportable issues, severity, and finding content.

## Comment style

Use ASD-STE100 Simplified Technical English and aim for a Flesch–Kincaid Grade Level of 7–10.

Guidelines:

- keep the referenced range as small as possible
- keep the prose to one short paragraph when possible
- state conditionality explicitly when severity depends on inputs or environment
- make inferences explicit rather than presenting them as facts
- avoid praise and filler; state uncertainty precisely
- state material structural regressions directly; do not soften a merge blocker into an optional cleanup request

Bad:

- "Could we maybe add some guards here?"
- "This feels a bit risky."
- "It might be safer to refactor this somehow."

Better:

- "This path accepts raw user input into the SQL fragment, so a crafted filter value can change the query instead of just the parameter value. Use a parameterized predicate here."

## Disagreements

When reviewer and author disagree, apply this order:

1. technical facts and concrete evidence
2. explicit project conventions
3. sound design principles
4. local consistency
5. personal preference

If new context changes the conclusion, update or withdraw the finding.
Comment on code, not people.
