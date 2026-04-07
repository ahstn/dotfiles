# Shared style metrics

Use these metrics as bands, not rigid formulas. Channel fit and meaning preservation matter more than hitting an exact number.

<measurement_modes>
Lite
- Use when no tooling is available or the text is short.
- Check sentence length bands, paragraph size, list density, banned-marker suppression, and term consistency.

Balanced
- Use for most drafting, rewrites, and evals.
- Lite plus a readability estimate, a quick syntactic-complexity pass, a lexical-richness pass, and a formatting-density pass.

Corpus
- Use when calibrating against strong in-house examples.
- Balanced plus comparison against a house corpus or trusted samples for sentence-length distribution, punctuation habits, formatting density, and lexical profile.
</measurement_modes>

<shared_principles>
- Short texts such as direct messages and PR comments should not be forced through formal readability formulas alone. Heuristic checks are better.
- Long texts can use formulaic readability estimates if tooling exists, but the score is advisory, not the goal.
- Prefer consistent terminology over synonym churn.
- Lexical richness means useful range, not fancy wording.
- Formatting density should support scanning, not decorate the page.
</shared_principles>

<profile_direct_message>
- Readability: heuristic only; plain words; low cognitive load.
- Avg sentence length: 5-12 words. Soft max 20.
- Syntactic complexity: low. One clause per line is common.
- Lexical richness: low to moderate. Reuse key terms.
- Formatting density: none by default. At most 1-2 flat bullets if they materially help.
- Paragraph density: 1-2 sentences per paragraph, or one line per thought.
</profile_direct_message>

<profile_pull_request_review>
- Readability: heuristic only; plain technical language.
- Avg sentence length: 6-14 words. Soft max 22.
- Syntactic complexity: low to moderate. One issue per comment.
- Lexical richness: low to moderate. Prefer precision and identifier reuse.
- Formatting density: very low. Short paragraphs or flat bullets only.
- Paragraph density: 1-3 sentences per comment.
</profile_pull_request_review>

<profile_email_internal>
- Readability: roughly grade 7-10 if measured.
- Avg sentence length: 10-16 words. Soft max 24.
- Syntactic complexity: moderate.
- Lexical richness: moderate, with high term consistency.
- Formatting density: low. Bullets or headings only when scanability clearly improves.
- Paragraph density: 1-3 sentences per paragraph.
</profile_email_internal>

<profile_email_external>
- Readability: roughly grade 8-11 if measured.
- Avg sentence length: 11-18 words. Soft max 25.
- Syntactic complexity: moderate and controlled.
- Lexical richness: moderate. Avoid slang and internal shorthand.
- Formatting density: low. Keep visual structure clean and conservative.
- Paragraph density: 1-3 sentences per paragraph.
</profile_email_external>

<profile_blog_post>
- Readability: roughly grade 7-10 if measured.
- Avg sentence length: 10-18 words, with deliberate rhythm variation.
- Syntactic complexity: moderate. Mix short punch lines with longer explanatory sentences.
- Lexical richness: moderate to moderately high, but not ornamental.
- Formatting density: medium. Use headings every 250-500 words. Use lists only when they tighten the argument.
- Paragraph density: 1-4 sentences per paragraph.
</profile_blog_post>

<profile_memo_broadcast>
- Readability: roughly grade 8-11 if measured.
- Avg sentence length: 12-20 words. Soft max 28.
- Syntactic complexity: moderate.
- Lexical richness: moderate, with strong terminology discipline.
- Formatting density: medium. Summary first. Headings or bullets are normal.
- Paragraph density: 1-4 sentences per paragraph.
</profile_memo_broadcast>

<profile_technical_documentation>
- Readability: procedures roughly grade 6-9; concept pages roughly grade 8-11 if measured.
- Avg sentence length: procedures 6-12 words; concepts 10-18 words.
- Syntactic complexity: low in procedures, moderate in concept pages.
- Lexical richness: low to moderate. Term consistency is more important than novelty.
- Formatting density: medium to high when warranted. Headings, numbered steps, tables, and examples are normal.
- Paragraph density: 1-3 sentences in procedures; 1-4 in concept pages.
</profile_technical_documentation>

<profile_rfc_design_doc>
- Readability: roughly grade 10-13 if measured.
- Avg sentence length: 14-24 words. Soft max 32.
- Syntactic complexity: moderate to moderately high, but still plain.
- Lexical richness: moderate. Precision and stable terminology matter more than range.
- Formatting density: medium. Explicit sections, bullets, tables, and tradeoff summaries are normal.
- Paragraph density: 1-4 sentences per paragraph.
</profile_rfc_design_doc>

<shared_negative_checks>
- No hype adjectives unless explicitly requested.
- No "not only ... but also ..." unless quoting source material.
- No "from X to Y" flourish constructions unless literal and necessary.
- No generic summary endings unless the format truly needs one.
- No synonym churn that renames the same concept multiple ways.
</shared_negative_checks>
