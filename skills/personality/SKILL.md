---
name: personality
description: Draft, edit, or review professional writing in the user's conversational engineering voice. Supports close preservation, clearer revisions, audience adaptation, personal reflections, and evidence-based style calibration.
---

# Personality and voice

Preserve the writer's judgment, warmth, and useful edge while making the writing easier to understand. Match the publication and the requested degree of editing. A personal voice includes how the writer reasons and relates to readers, as well as vocabulary and rhythm.

## Precedence

1. Preserve meaning, facts, evidence, uncertainty, ownership, commitments, technical identifiers, and any limits on what may be included.
2. Follow the user's explicit requirements for audience, purpose, publication, tone, format, length, and editing mode.
3. Apply the selected publication's requirements.
4. Apply the personal profile and the selected improvement goals.
5. Use shared editing defaults and quantitative diagnostics.

The personal profile overrides generic voice defaults only. Examples do not override the task or authorise new facts, experiences, opinions, deadlines, or promises. Flag material inconsistencies instead of silently repairing them through invention.

## Workflow and modes

Identify the operation: draft, edit, review, or analyse. Infer the audience and purpose when clear, including whether the text informs, explores, requests, or records a decision. Ask a focused question only when missing information would materially change the result; continue independent work when possible.

When working from mixed notes, distinguish the writer's text from quotations, feedback, prompts, suggested wording, and excluded passages. Follow the user's current inclusion instructions; do not silently promote background notes or someone else's judgment into the writer's claims.

Read [personal voice](references/personal-voice.md), then the relevant publication reference below. Choose the editing mode from the user's request:

| Mode | Use when | Editing behaviour |
|---|---|---|
| Preserve | "Light edit", "keep my wording", or a close copy edit | Repair errors and unclear passages. Keep clear sentence shapes, structure, personal asides, and degree of formality. |
| Refine | Default for drafting or editing without another mode | Keep the writer's stance and warmth. Untangle sentences, tighten evidence, remove repetition, and improve organisation where it helps the reader. |
| Adapt | The user asks for another audience, register, or desired style | Change presentation to serve that purpose. Retain the factual and personal boundaries above. Borrow named qualities, such as clarity or narrative pacing, without inventing a new identity. |

Publication and mode are separate choices: a performance review can receive a light edit; a short chat can need substantial clarification. When reviewing without a rewrite, return findings and targeted suggestions. Do not produce a rewritten artifact unless requested.

For a rewrite, identify a few voice signals to keep before editing. Keep this working note internal. Return the requested artifact; explain changes only when requested or when a substantial reorganisation needs explanation. Do not append a standard "What changed" section to every response.

## Publication router

Read one primary reference. Read another only when the artifact has a second purpose that needs it.

| Publication or purpose | Reference |
|---|---|
| Chat, Slack, Teams, quick operational update | [Direct messages](references/guidance-direct-messages.md) |
| Blog post, engineering article, public essay | [Blog posts](references/guidance-blog-posts.md) |
| PR review, email, memo, technical documentation, ADR or RFC | [Professional formats](references/guidance-professional-formats.md), using only the relevant section |
| Self-review, performance reflection, growth plan, reflective notes | [Reflections and performance reviews](references/guidance-reflections.md) |

Read [annotated examples](references/annotated-examples.md) when calibrating a mode or resolving a likely loss of voice. Read [storytelling and metaphor](references/guidance-storytelling-metaphor.md) when requested or when an analogy would materially clarify a difficult concept. Read [evaluation](references/evaluation.md) for profile extraction, comparison, measurement, or changes to this skill.

Required references travel with this skill. If one is unavailable, use the core rules and available guidance, and disclose the limitation when it prevents the requested task. Do not claim a personal match from a profile you could not read. Local source records and the original Obsidian files are optional evidence for calibration, not runtime dependencies.

## Shared editing defaults

- Use common words around exact domain terms. Keep names and terms stable; do not rotate synonyms for variety.
- Follow the stated goals of clarity, simplicity, brevity, and humanity. Preserve a useful personal aside, admission, or story when it serves the piece.
- Keep direct judgments where the writer has made them. Preserve uncertainty that marks a real limit. Remove empty hedging without changing the strength of a claim.
- Keep specific warmth, pride, gratitude, disappointment, and earned enthusiasm when relevant to the purpose. These can carry meaning without a metric. Preserve feelings as the writer's experience, not proof of another person's motives. Remove promotional claims that lack support.
- Use "I" for the writer's own actions, judgments, and limits; use "we" for shared work. Do not invent consensus or turn help with a task into sole ownership.
- Keep responsibility aligned with control. Preserve what the writer can do, what needs another owner or decision, and any capacity limit. Do not turn a shared constraint into a personal failing or an offer to absorb more work.
- Keep bluntness or humour when appropriate to the task and source. Do not add contempt, personal attacks, or invented motives. A firm decision does not need to become a tentative suggestion.
- Use active voice when the actor matters. Passive voice can help describe system behaviour without accusing a person.
- Vary sentence length with the reasoning. Keep a clear longer sentence when its conditions belong together. Split overloaded sentences without turning connected prose into stacked fragments.
- Select context and evidence for what this audience needs to understand or assess. Make missing links between ideas explicit. Keep a short sequence of situation, action, and consequence when it explains the point; do not impose that structure on every message.
- Cut empty preambles, repeated conclusions, faux-insight setups, ornamental binary contrasts, and decorative lists of three. Preserve a real question or tension when both sides affect the meaning, such as progress alongside an unresolved cost.
- Let an unresolved concern remain unresolved when that serves the purpose. Do not add a positive lesson, neat resolution, or new commitment to make an ending feel complete. Include an action or decision when the request calls for one, using only supported details.
- Treat words such as "delve", "foster", "empower", "game changer", and "transformative" as prompts to inspect the claim, not proof of authorship. Remove inflated or formulaic uses. Preserve literal technical uses, such as a canary deployment or an agent harness, and quoted wording or identifiers.
- Do not add mistakes, profanity, slang, or catchphrases to simulate authenticity.

## Target mechanics

- Use plain technical English and UK spelling in authored prose; preserve official names, quotes, code, and identifiers. Follow the user's ASD-STE100 and Flesch-Kincaid grade 7-10 requirements when applicable. A grade score alone does not establish STE compliance.
- For sufficiently long prose, use readability results to locate difficult passages. Rewrite around necessary technical terms without changing them. Do not pad easy sentences to reach a grade floor or claim a measured score without running a measure.
- Use straight quotation marks and avoid em dashes in authored prose. These are target preferences even where older samples differ. Preserve exact source quotations when fidelity is required.
- Use headings, lists, tables, and code because the content needs them. Keep emphasis sparse. Familiar chat may retain an appropriate emoji from the source or established context; do not add decorative emoji by default.
- Do not hard wrap Markdown paragraphs at 80 columns.

## Final check

Check meaning and commitments first, then publication fit, voice, clarity, and presentation. Ensure that the result answers the actual request, preserves material limits and credit, and contains no invented evidence or generic summary. Remove edits that only make the prose more uniform.
