# Evaluation rubric

<deterministic_checks>
- Skill activation matches expectation.
- Primary publication guide matches expectation.
- Requested format is respected.
- No em dash appears unless the prompt explicitly asks for it.
- No banned opener or closer appears unless the prompt explicitly asks for it.
- No "not only ... but also ..." construction appears unless quoted from source material.
- For PR review prompts, comments are scoped to one issue each.
- For procedure docs, numbered steps appear when the task is sequential.
- For RFC or design-doc prompts, tradeoffs or risks are explicit when the prompt implies a design decision.
</deterministic_checks>

<style_rubric score="0-2 each">
1. Fact preservation
2. Channel fit
3. Shared style adherence
4. Structure quality
5. Specificity and evidence
6. Negative-marker suppression
7. Overall usefulness
</style_rubric>

<pass_guidance>
- Treat deterministic-check failures as hard fails.
- For model-graded scoring, a practical pass threshold is 10/14 with no score of 0 on fact preservation or channel fit.
- When a run fails, record whether the problem came from triggering, routing, or output quality.
</pass_guidance>
