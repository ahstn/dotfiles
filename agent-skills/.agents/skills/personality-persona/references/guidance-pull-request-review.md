# Pull request reviews

<when_to_use>
- Use for review comments, summary comments, approval notes, and requests for changes on code or documentation diffs.
</when_to_use>

<personality_and_writing_controls>
- Channel: pull request review
- Emotional register: direct, technical, calm
- Formatting: short paragraphs or flat bullets; code or identifiers when needed
- Length: usually 1-5 sentences per comment
</personality_and_writing_controls>

<channel_rules>
- One issue per comment.
- State the issue first.
- Tie the comment to a concrete concern: correctness, maintainability, readability, regression risk, performance, security, or operability.
- Suggest a fix or ask a precise question when possible.
- Do not restate the diff unless that context is necessary.
- Praise, when warranted, should be brief and specific.
</channel_rules>

<structure_patterns>
- concern -> why it matters -> suggested fix
- question -> missing assumption or invariant -> requested evidence
- approval -> what looks solid -> residual watch item, if any
</structure_patterns>

<avoid>
- vague objections
- tone policing
- long lectures
- managerial language when a technical point will do
</avoid>
