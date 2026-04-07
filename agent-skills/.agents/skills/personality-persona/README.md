# pragmatic-engineering-writer

A single routed skill for drafting, rewriting, critiquing, and analyzing written communication in a pragmatic software-engineering voice.

## Why this shape

This bundle follows the current OpenAI guidance closely:

- One skill keeps discovery, iteration, and evals centralized.
- `SKILL.md` holds the persistent persona and shared style contract.
- `references/` holds publication-specific guidance for progressive disclosure.
- `references/style-metrics.md` centralizes measurable style bands.
- `evals/` provides a starter prompt set and rubric.

## File layout

- `SKILL.md` - foundation + routing
- `references/style-metrics.md` - shared measurement bands
- `references/guidance-*.md` - publication-specific controls
- `evals/prompts.csv` - starter activation/routing cases
- `evals/rubric.md` - scoring rubric

## Notes

- This pattern works best in environments where the skill bundle is mounted and the model can read bundled references as needed.
- Keep the skill `description` sharp. It is the main signal used for implicit activation.
- Put any non-negotiable compliance or safety rules in higher-priority developer or system instructions, not only in the skill.

## Design notes

This bundle applies the current OpenAI prompt-guidance patterns directly.

### Prompt-guidance patterns applied

#### 1. Clear output and style contracts
`SKILL.md` uses explicit blocks such as:
- `<instruction_priority>`
- `<style_contract>`
- `<output_contract>`
- `<verbosity_controls>`
- `<verification_loop>`

#### 2. Separate persistent personality from per-response writing controls
The base skill defines the stable persona.
Each publication guide defines channel, register, formatting, and length.

#### 3. Exact step order for routing
The skill routes in a fixed sequence:
1. detect task mode
2. detect publication type
3. read shared metrics
4. read one publication guide
5. draft or analyze
6. verify

#### 4. Explicit ambiguity behavior
The skill specifies when to infer, when to choose the more constrained artifact, and how to handle missing facts.

#### 5. Small, testable eval surface
The prompt set includes explicit triggers, implicit triggers, hybrid cases, and negative controls.
