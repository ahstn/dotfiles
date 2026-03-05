# Prompting and Skill Design Notes

This reference distills guidance from current OpenAI Codex prompting docs and Agent Skills docs into practical rules for this skill.

## Prompting Rules for Research Tasks

1. Be explicit about scope.
   - State exactly what to research (repos, APIs, SDKs, timeframe, language).
   - State what is out of scope to prevent drift.
2. Enforce evidence-backed output.
   - Require references to repo/path/PR/commit/doc URL.
   - Separate findings from assumptions.
3. Keep output shape stable.
   - Use fixed sections: objective, findings, pattern, risks, open questions.
4. Prefer tools and live data over memory.
   - For volatile facts, use command output and web/doc verification.
5. Keep updates concise.
   - Share only meaningful phase changes or findings.

## Scope Discipline for Implementation Prep

- Do not jump to coding before evidence collection is complete.
- Do not add adjacent feature ideas unless requested.
- If information is ambiguous, present the top interpretations and the evidence gap.

## Skill Structure Rules

- Keep `SKILL.md` lean; move details to `references/`.
- Keep reusable shell operations in `scripts/` when repetition or reliability matters.
- Keep script interfaces non-interactive and discoverable with `--help`.
- Treat quick indexes as convenience only; defer to live `--help`.

## Script Design Rules (Agent-Friendly)

- No interactive prompts.
- Accept inputs via flags/env/stdin.
- Provide clear usage and error messages.
- Prefer structured outputs where parsing is needed.
- Keep outputs bounded; avoid dumping huge payloads by default.

## Sources

- https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide/
- https://developers.openai.com/codex/skills/
- https://agentskills.io/what-are-skills
- https://agentskills.io/skill-creation/using-scripts
