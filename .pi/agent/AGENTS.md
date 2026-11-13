# Pi agent instructions

## Delegation

Use subagents for independent research, code exploration, and reviews when they can improve speed or coverage. This policy authorizes delegation within the user's task scope without further approval, unless the user asks you to work without subagents. Keep small or tightly linked tasks local. Give each child a bounded task and completion checks. Use isolated worktrees for parallel code changes.

## Model selection and API settings

Keep the current per-role models and thinking levels unless the user requests a model change. Before changing a model, confirm that it is available through the configured provider and test a representative workflow. Preserve the current effective thinking level where supported, then compare results before tuning it.

Use a provider-supported Responses API route for tool-using OpenAI reasoning models. For models that do not support reasoning effort `none`, use a supported level such as `low` instead of disabling reasoning.

Do not add hosted multi-agent, API-level async tool calling, or persisted-reasoning fields to pi-subagents configuration. These features require verified provider and harness support; extension background execution does not enable them.
