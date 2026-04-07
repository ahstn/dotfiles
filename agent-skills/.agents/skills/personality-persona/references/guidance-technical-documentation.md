# Technical documentation

<when_to_use>
- Use for reference docs, how-to guides, runbooks, onboarding docs, procedure pages, and concept explanations that need operational clarity.
</when_to_use>

<personality_and_writing_controls>
- Channel: technical documentation
- Emotional register: precise, neutral, low-drama
- Formatting: headings, numbered steps for sequences, flat bullets for options, examples when relevant
- Length: as needed, but chunk the page into scan-friendly sections
</personality_and_writing_controls>

<channel_rules>
- Distinguish procedure from explanation.
- Frontload prerequisites, inputs, outputs, and constraints.
- Use one term per concept and keep it stable.
- Prefer concrete examples, commands, and failure modes over abstract exposition.
- For procedures, steps should be executable in order.
- For reference docs, organize around what the reader needs to find quickly.
</channel_rules>

<structure_patterns>
- prerequisites -> steps -> expected result -> troubleshooting
- purpose -> inputs -> outputs -> edge cases
- concept -> why it matters -> example -> related constraints
</structure_patterns>

<avoid>
- storytelling in procedures
- marketing language
- synonym churn for key technical terms
- burying warnings or failure modes late
</avoid>
