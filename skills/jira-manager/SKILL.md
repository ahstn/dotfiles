---
name: jira-manager
description: >-
  Use this skill for all Jira workflows: create epics and issues, transition
  tickets, add comments, search with JQL, and manage the backlog. Use when
  users mention bugs, stories, tasks, sprints, or ask to file/update tickets.
license: MIT
metadata:
  author: Jira skill maintainers
  version: "1.1"
---

# Jira Issue Tracker

You are a Jira administrator using the `jira` CLI. Work in the project and team specified by `sensitive/variables.json`, not the examples below.

## When to use this skill

Use this skill when the user needs to:
- Create or update Jira issues (bugs, stories, tasks, epics)
- Search for tickets using JQL queries
- Transition issues between workflow states
- Add comments or link issues
- Manage the configured team's backlog

**Examples:**
- "I found a null pointer exception in the payment service. Can you file a bug?"
- "Show me all high priority tickets assigned to me."
- "Create an epic for the new authentication feature with stories for login, logout, and password reset."
- "Move ISSUE-KEY to the requested status."

## Project Context

**Before any Jira operation, read `sensitive/variables.json`.** It is the local, unshared source of project key, Jira base URL, team name, board ID, issue types, priorities, recent epics, description attribution, and custom-field names/IDs. Creating or updating tickets requires the correct field IDs for REST and the configured field names for CLI `--custom` arguments; neither IDs nor field names are portable between Jira instances. Do not infer missing values from the examples in this skill or from another user's configuration. If the file is missing or invalid, stop before changing Jira and ask for a valid copy based on `references/variables.example.jsonc`.

The `jira` CLI reads its own project, board, and custom-field mapping from `~/.config/.jira/.config.yml`. Check that it matches the personal variables before acting; for another project, use `--project` and a matching CLI configuration. The CLI resolves configured custom-field names to IDs for `--custom`; raw Jira responses and REST requests use `field_id`. The JQL field name comes from the same field's `name`. Resolve the CLI aliases for the configured team, acceptance-criteria, and Story Points fields before using the examples below.

`story_points_field` is separate from `custom_fields`: use its `field_id` for reading/verifying raw JSON and REST requests, and its configured `name` for the CLI custom-field alias. The **estimate** is not a configuration default: select it independently from the full scope of each Task, Story, or Bug with the rubric below. Do not change an existing estimate during an unrelated update.

- **Creator**: Always the authenticated `$(jira me)` account. Jira sets this server-side; the CLI has no `--creator` flag.
- **Default reporter**: `$(jira me)` unless the user explicitly requests a different reporter
- **Default assignee**: `$(jira me)` unless the user explicitly requests a different assignee

## Quick Reference

Commands below are templates. Read `sensitive/variables.json`, then resolve `TEAM_FIELD_NAME`, `TEAM_FIELD_ALIAS`, `ACCEPTANCE_CRITERIA_ALIAS`, and `STORY_POINTS_ALIAS` against its field entries and the matching CLI configuration. Choose `STORY_ISSUE_TYPE`, `SUBTASK_ISSUE_TYPE`, and `BUG_ISSUE_TYPE` from `issue_types`; use actual issue keys for `ISSUE_KEY`, `PARENT_KEY`, and `EPIC_KEY`. Never send an unset placeholder to Jira. Select `$STORY_POINTS` independently for each issue with the rubric below. Resolve status and link-type names from Jira before using `STATUS_NAME`, `OPEN_STATUSES`, or any `*_LINK_TYPE` variable; link types and directions are described in [the links reference](references/jira-links-and-attachments.md).

```sh
JIRA_VARIABLES="$HOME/.agents/skills/jira-manager/sensitive/variables.json"
TEAM_NAME=$(jq -r '.team_name' "$JIRA_VARIABLES")
PRIORITY_STANDARD=$(jq -r '.priorities.standard' "$JIRA_VARIABLES")
PRIORITY_HIGH=$(jq -r '.priorities.high' "$JIRA_VARIABLES")
# Resolve TEAM_FIELD_NAME and the three field aliases from the configured custom fields.
TEAM_JQL=$(jq -nr --arg field "$TEAM_FIELD_NAME" --arg team "$TEAM_NAME" '"\($field | @json) = \($team | @json)"')
# Set STORY_POINTS for the particular issue, and ISSUE_KEY / EPIC_KEY from Jira.
# Create issue; capture the returned key, verify Story Points, then apply the sprint policy
jira issue create --type "$STORY_ISSUE_TYPE" --summary "..." --priority "$PRIORITY_STANDARD" --reporter "$(jira me)" --assignee "$(jira me)" --custom "${TEAM_FIELD_ALIAS}=${TEAM_NAME}" --custom "${STORY_POINTS_ALIAS}=${STORY_POINTS}" --custom "${ACCEPTANCE_CRITERIA_ALIAS}=- [ ] Work is complete" --no-input --raw

# Create epic
jira epic create --name "..." --summary "..." --priority "$PRIORITY_HIGH" --reporter "$(jira me)" --assignee "$(jira me)" --custom "${TEAM_FIELD_ALIAS}=${TEAM_NAME}" --no-input

# Edit issue without changing its estimate
jira issue edit "$ISSUE_KEY" --summary "New summary" --body "New description" --no-input

# Re-estimate only on request or after a material scope change
jira issue edit "$ISSUE_KEY" --custom "${STORY_POINTS_ALIAS}=${STORY_POINTS}" --no-input

# Before transitions, read references/jira-workflow.md

# Comment
jira issue comment add "$ISSUE_KEY" "Comment text"

# Search
jira issue list --jql "$TEAM_JQL AND assignee = currentUser() AND status = \"$STATUS_NAME\"" --plain

# View
jira issue view "$ISSUE_KEY" --plain
```

## Required Fields

**ALL issues must include:**
- `--type` (select the configured issue type from `issue_types`)
- `--summary`
- `--priority` (choose the configured value under `priorities`)
- `--custom "${TEAM_FIELD_ALIAS}=${TEAM_NAME}"` (resolve the team field via `custom_fields`)
- `--reporter "$(jira me)"` unless the user explicitly requests a different reporter
- `--assignee "$(jira me)"` unless the user explicitly requests a different assignee
- `--no-input` (required for non-interactive execution)

The creator is not a settable CLI field. Jira automatically records the authenticated `$(jira me)` account as creator. Do not accept or invent a different creator.

**Tasks/Stories/Bugs must include:**
- `--custom "${ACCEPTANCE_CRITERIA_ALIAS}=${CRITERIA}"` (resolve the configured acceptance-criteria field)
- `--custom "${STORY_POINTS_ALIAS}=${STORY_POINTS}"` using the separate `story_points_field` and the Story Points rubric with a minimum floor of `0.5`
- `--parent "$EPIC_KEY"` (if linking to an epic)

Estimate from the full ask before creating the issue. Do not use a fixed default or copy one estimate across a batch. If the user gives a valid estimate, use it. If they give a value outside the allowed sequence, propose the nearest rubric value and get explicit approval before proceeding. Never send the invalid value.

By this team's planning policy, Epics do not receive Story Points even if Jira exposes the field. Sub-tasks receive Story Points only when Jira exposes the field for that issue type and the user explicitly requests a sub-task estimate; otherwise estimate the parent Task, Story, or Bug.

**Sub-task acceptance criteria fallback:**
- Try setting the configured Acceptance Criteria field when it is available.
- If Jira rejects it as a field that cannot be set on a Sub-task, retry without that custom field and include an `## Acceptance criteria` section in the description body. Do not retry creation blindly if a key was returned.

**Searching Issues:**
- Filter by the configured team field `name` and `team_name` in JQL to avoid other teams' tickets/issues; do not use the CLI alias as a JQL field name. Build `TEAM_JQL` as the quoted field name, ` = `, and the quoted team name, escaping embedded quotes and backslashes in both values.

## Shell Escaping for Bodies

Use `$'...'` syntax for bodies with newlines and special characters. Set `CRITERIA` separately when passing multiline acceptance criteria to `--custom`:

```sh
CRITERIA=$'- [ ] Criterion 1\n- [ ] Criterion 2'
# Multi-line body with markdown
jira issue create \
  --type "$STORY_ISSUE_TYPE" \
  --summary "Example story" \
  --priority "$PRIORITY_STANDARD" \
  --body $'## Summary\nBrief description\n\n## Technical Context\n- Component A\n- Component B' \
  --custom "${TEAM_FIELD_ALIAS}=${TEAM_NAME}" \
  --custom "${STORY_POINTS_ALIAS}=${STORY_POINTS}" \
  --reporter "$(jira me)" \
  --assignee "$(jira me)" \
  --custom "${ACCEPTANCE_CRITERIA_ALIAS}=${CRITERIA}" \
  --no-input \
  --raw
```

For bodies with backticks or complex markdown, escape them: `` \` ``

## Issue Operations

### Create Issues

Before each create command:

1. Read the summary, description, acceptance criteria, dependencies, affected systems, and stated unknowns.
2. Select one value from `0.5, 1, 2, 3, 5, 8, 13, 21, 34` using the rubric below.
3. Put that numeric value in `--custom "${STORY_POINTS_ALIAS}=${STORY_POINTS}"`; do not quote it as text in REST payloads.
4. If the estimate is above `8`, flag the issue for decomposition before sprint commitment.

```sh
CRITERIA=$'- [ ] AC 1\n- [ ] AC 2'
jira issue create \
  --type "$STORY_ISSUE_TYPE" \
  --summary "Implement feature X" \
  --priority "$PRIORITY_STANDARD" \
  --body "Description here" \
  --custom "${TEAM_FIELD_ALIAS}=${TEAM_NAME}" \
  --custom "${STORY_POINTS_ALIAS}=${STORY_POINTS}" \
  --reporter "$(jira me)" \
  --assignee "$(jira me)" \
  --custom "${ACCEPTANCE_CRITERIA_ALIAS}=${CRITERIA}" \
  --parent "$EPIC_KEY" \
  --no-input \
  --raw
```

Capture the returned key, verify the value under `story_points_field.field_id`, and then follow the sprint policy. If create fails without returning a key, search by exact summary before retrying.

### Sprint Assignment

For newly created Tasks, Stories, and Bugs estimated at `8` or less, add the issue to the current active sprint by default unless the user requests backlog, no sprint, or a different sprint. Keep estimates above `8` out of a sprint until the work is decomposed or the user explicitly accepts the oversized item for sprint commitment. Never hard-code a sprint ID or select the first of multiple active sprints.

Before assigning a sprint, read [the Jira sprint reference](references/jira-sprints.md). It contains dynamic sprint discovery, ambiguity handling, create-then-add commands, verification, and bulk guidance. Do not load it for searches, views, updates without sprint changes, Epics, or Sub-tasks.

### Edit Issues
```sh
# Update summary
jira issue edit "$ISSUE_KEY" --summary "Updated summary" --no-input

# Update description
jira issue edit "$ISSUE_KEY" --body "New description content" --no-input

# Re-estimate after an explicit scope change
jira issue edit "$ISSUE_KEY" --custom "${STORY_POINTS_ALIAS}=${STORY_POINTS}" --no-input
```

Do not change Story Points during unrelated edits, comments, assignments, sprint changes, or transitions. Re-estimate when the user requests it or when the ask changes scope, complexity, dependencies, or uncertainty. View the current issue first, apply the rubric to the new full scope, and verify the stored value after the edit.

### Transitions

Before moving an issue between statuses, read [the Jira workflow reference](references/jira-workflow.md). It contains transition discovery, completion behavior, retry handling, and bulk verification guidance.

### Comments
```sh
jira issue comment add "$ISSUE_KEY" "Simple comment"
jira issue comment add "$ISSUE_KEY" $'## Update\n\nMulti-line comment here'
```

### Link Issues

Before creating a directional issue link, read [the links and attachments reference](references/jira-links-and-attachments.md). Argument order determines the relationship shown on each issue and must be verified afterward.
```sh
# Use the configured link type names; verify each direction afterward
jira issue link "$PARENT_KEY" "$CHILD_KEY" "$ACTION_ITEM_LINK_TYPE"
jira issue link "$BLOCKER_KEY" "$BLOCKED_KEY" "$BLOCKS_LINK_TYPE"
jira issue link "$FIRST_KEY" "$SECOND_KEY" "$SYMMETRIC_LINK_TYPE"
```

### Attachments

- **Do not attach files by default.** Screenshots, images, documents, logs, and other supplied files are context for drafting the issue unless the user explicitly asks for them to be attached.
- A request to create an issue "based on" or "from" a file is not permission to attach that file.
- Attach only the specific files the user explicitly requests. Do not attach adjacent files or inferred supporting material.
- The installed `jira` CLI has no attachment command. When attachment upload is explicitly requested, read [the links and attachments reference](references/jira-links-and-attachments.md), use Jira's REST API, and verify the uploaded filenames or attachment count.

### Assign
```sh
jira issue assign "$ISSUE_KEY" "$(jira me)"  # Assign to self
```

## Epic Operations

### Create Epic
```sh
jira epic create \
  --name "Epic Name" \
  --summary "Epic summary for list views" \
  --priority "$PRIORITY_HIGH" \
  --body "Epic description" \
  --custom "${TEAM_FIELD_ALIAS}=${TEAM_NAME}" \
  --reporter "$(jira me)" \
  --assignee "$(jira me)" \
  --no-input
```

### Add Existing Issues to Epic
```sh
jira epic add "$FIRST_ISSUE_KEY" "$SECOND_ISSUE_KEY" "$THIRD_ISSUE_KEY"
```

**When to use `--parent` vs `jira epic add`:**
- `--parent "$EPIC_KEY"`: Use when creating a new issue that belongs to an epic
- `jira epic add`: Use to link existing issues to an epic

## Search & Query

```sh
# My open issues
jira issue list --jql "$TEAM_JQL AND assignee = currentUser() AND status IN ($OPEN_STATUSES)" --plain

# High priority unassigned bugs (priority name comes from configuration)
jira issue list --jql "$TEAM_JQL AND issuetype = \"$BUG_ISSUE_TYPE\" AND priority = \"$PRIORITY_HIGH\" AND assignee IS EMPTY" --plain

# Issues in epic or sub-tasks under a story
jira issue list --parent "$PARENT_KEY" --plain --paginate 1:100

# Raw JQL
jira issue list -q "$TEAM_JQL"

# Specific columns
jira issue list --plain --columns key,summary,status,priority,assignee

# JSON output (for parsing)
jira issue list --raw
```

### Pagination

`jira issue list --paginate` requires `<from>:<limit>`, with a positive start index and max limit 100.

Use:

```sh
jira issue list --parent "$PARENT_KEY" --plain --paginate 1:100
```

Do not use `--paginate 100` or `--paginate :100`.

### View Issue
```sh
jira issue view "$ISSUE_KEY" --plain
jira issue view "$ISSUE_KEY" --raw  # JSON output
```

### Scripting Issue Creation

When creating many issues, estimate each Task, Story, or Bug separately. Do not assign every issue the same value for convenience. Use `--raw` and parse the returned key:

```sh
jira issue create \
  --type "$SUBTASK_ISSUE_TYPE" \
  --summary "Example sub-task" \
  --parent "$PARENT_KEY" \
  --priority "$PRIORITY_STANDARD" \
  --body $'## Summary\nExample\n\n## Acceptance criteria\n- [ ] Done' \
  --custom "${TEAM_FIELD_ALIAS}=${TEAM_NAME}" \
  --reporter "$(jira me)" \
  --assignee "$(jira me)" \
  --no-input \
  --raw
```

Expected output has an issue-specific ID and a key with the configured project prefix; capture the returned key instead of copying this example:

```json
{"id":"<issue-id>","key":"<PROJECT_KEY>-<issue-number>"}
```

## Recent Epics

Use `recent_epics` in `sensitive/variables.json` as a quick lookup, not an exhaustive list. Search Jira when the work does not clearly fit; confirm with the user when uncertain which epic to use.

## Priority Selection

Use the *value* of the matching key under `priorities` in `sensitive/variables.json` as the Jira priority name. Never assume priority numbers or names transfer to another instance.

| Config key | When to Use |
|------------|-------------|
| `critical` | Production down, data loss, security breach |
| `high` | Major feature broken, significant user impact |
| `standard` | Standard work, moderate impact (default) |
| `low` | Nice-to-have, minor improvements |
| `backlog` | Backlog items, future considerations |

## Story Points Estimation Rubric

Read `story_points_field.field_id` and `story_points_field.name` from `sensitive/variables.json` for this Jira instance. This number/float field is distinct from a separate `Story point estimate` field. With the CLI, use the alias for the configured field name (`story-points` for `Story Points`); with REST API v3, send a JSON number under the configured field ID, never a quoted string. Calculate the estimate per issue; never store a fixed Story Points value in the variables file.

To refresh the live field metadata after a Jira configuration change or field error, use the configured base URL and field identity:

```sh
JIRA_VARIABLES="$HOME/.agents/skills/jira-manager/sensitive/variables.json"
JIRA_SITE=$(jq -r '.jira_instance_url' "$JIRA_VARIABLES")
STORY_POINTS_FIELD_ID=$(jq -r '.story_points_field.field_id' "$JIRA_VARIABLES")
STORY_POINTS_FIELD_NAME=$(jq -r '.story_points_field.name' "$JIRA_VARIABLES")
curl --fail --silent --show-error \
  --user "$JIRA_USER_EMAIL:$JIRA_API_TOKEN" \
  --header 'Accept: application/json' \
  "${JIRA_SITE%/}/rest/api/3/field" |
  jq -e --arg id "$STORY_POINTS_FIELD_ID" --arg name "$STORY_POINTS_FIELD_NAME" \
    '[.[] | select(.name == $name and .id == $id)] |
    if length == 1 and .[0].schema.type == "number" and .[0].schema.custom == "com.atlassian.jira.plugin.system.customfieldtypes:float"
    then .[0]
    else error("Story Points field metadata did not match the expected unique float field")
    end'
```

Fail closed if this check returns zero or multiple fields, or if the schema changes. For an existing issue, use `GET /rest/api/3/issue/KEY/editmeta` and require the configured `story_points_field.field_id` operations to include `set`. For create applicability, resolve the issue type with `GET /rest/api/3/issue/createmeta/PROJECT_KEY/issuetypes`, then inspect `GET /rest/api/3/issue/createmeta/PROJECT_KEY/issuetypes/ISSUE_TYPE_ID` and require that field's operations to include `set`. Use this create check before adding Story Points to a Sub-task.

Estimate strategically from the complete ask. Consider implementation effort, test and rollout work, affected systems, dependencies, operational risk, and unresolved requirements. The minimum is **`0.5`**, which represents half a day. Never use zero, negative values, arbitrary fractions, or values between sequence entries.

Use only this sequence: **`0.5, 1, 2, 3, 5, 8, 13, 21, 34`**.

| Points | Planning size | Use when | Examples |
|---|---|---|---|
| **0.5** | Half a day (floor) | The change is trivial, local, understood, and has a narrow verification step. | Change one config value, fix a markdown link, or make a minor Terraform variable update. |
| **1** | About 1 day | The task is small and well-defined, with one implementation path and targeted tests. | Add a CLI flag, fix a localized regression, or add focused unit tests. |
| **2** | About 2 days | The task is clear but needs a small feature, migration, or coordinated code and test changes. | Add a CRUD endpoint, refactor one helper service, or update a small schema migration. |
| **3** | About 3 days | The task spans several modules or needs investigation, integration work, and broader validation. | Add an API integration, build an issue-link workflow, or implement multi-step validation. |
| **5** | About 1 week | The task crosses components, has material uncertainty, or needs substantial tests and rollout work. | Add a service module or build a multi-provider authentication sync. |
| **8** | About 1.5 weeks | The task is complex, cross-system, dependency-heavy, or has significant migration and compatibility risk. This is the largest normal sprint-ready item. | Perform a subsystem overhaul or a database migration with backward compatibility. |
| **13** | Larger than one normal story | The ask is too large or uncertain for one sprint-ready item. Record `13` only if one issue must represent the full scope, and recommend decomposition. | Rewrite a core service or modernize infrastructure across several components. |
| **21** | Multi-sprint initiative | The ask contains several major deliverables and must be split before sprint commitment. | Complete a platform cloud migration or replace a core data pipeline. |
| **34** | Strategic milestone | The ask is organization-wide or multi-quarter and needs epics plus smaller delivery issues. | Re-architect an enterprise platform across teams. |

**Estimation rules:**
- **Floor**: Use `0.5` for all work smaller than half a day. Never omit Story Points because a task is small.
- **Sequence**: Use only `0.5`, `1`, `2`, `3`, `5`, `8`, `13`, `21`, or `34`.
- **Full scope**: Include coding, tests, review fixes, documentation, deployment, migration, and validation that are part of the ask.
- **Uncertainty**: Move up the sequence when unknowns or external dependencies materially increase delivery risk. Do not inflate points for priority or business impact alone.
- **Batches**: Estimate each issue independently. A parent estimate must not be copied to all children, and child estimates must not be copied back to the parent without reassessing scope.
- **Breakdown**: For estimates above `8`, recommend a split into independently valuable issues. Do not create extra issues without user approval. If the user keeps one issue, store the honest `13`, `21`, or `34` estimate and leave it out of a sprint unless the user explicitly accepts sprint commitment.
- **Existing estimates**: Preserve the current value for unrelated updates. Re-estimate only on request or after a material scope change.

After create or re-estimation, verify the value under the configured field ID:

```sh
STORY_POINTS_FIELD_ID=$(jq -r '.story_points_field.field_id' "$JIRA_VARIABLES")
jira issue view ISSUE-KEY --raw | jq --arg id "$STORY_POINTS_FIELD_ID" '.fields[$id]'
```

## Description Templates

### Bug (concise)
```
## Summary
Brief description of the issue

## Steps to Reproduce
1. Step one
2. Step two

## Expected vs Actual
- Expected: X
- Actual: Y

## Technical Context
- Component/service affected
- Environment details

<description_attribution from sensitive/variables.json>
```

### Story (concise)
```
## Summary
Brief description of the feature

## User Story
As a [user type], I want [feature], so that [benefit].

## Technical Context
- Components affected
- Dependencies

## Implementation Notes
- Key considerations

<description_attribution from sensitive/variables.json>
```

### Epic
```
## Overview
High-level description

## Goals
- Goal 1
- Goal 2

## Scope
- In scope items
- Out of scope items

<description_attribution from sensitive/variables.json>
```

**Footer**: End each new description with the exact `description_attribution` value from `sensitive/variables.json` (default: `Generated By: Pi π`). The angle-bracketed template lines above are placeholders, not literal text to send to Jira.

## Operational Guidelines

1. **Always use `--no-input`** for non-interactive CLI execution
2. **Verify before updating**: Use `jira issue view KEY --plain` to confirm issue exists
3. **Capture created keys**: Use `--raw` when scripting creates; report created keys to the user
4. **Verify ambiguous create failures**: If a create fails without a key, search by team and exact summary before retrying to avoid duplicates
5. **Verify explicit identities**: When the user specifies a non-default assignee or reporter, query the created issue and confirm Jira resolved both accounts correctly
6. **Keep attachments opt-in**: Treat supplied files as context only unless the user explicitly asks to attach specific files
7. **Ask for clarification** if the request is vague (missing priority, unclear scope, etc.)
8. **Use `--plain` for readable output**, `--raw` for JSON when parsing is needed
9. **Estimate before create**: Set Story Points on every new Task, Story, and Bug from the full ask; verify the value under `story_points_field.field_id` after create
10. **Preserve unrelated estimates**: Do not change Story Points during operations that do not alter scope
11. **Load transition guidance only when needed**: Read [the Jira workflow reference](references/jira-workflow.md) before changing issue statuses
12. **Load sprint guidance only when needed**: Read [the Jira sprint reference](references/jira-sprints.md) when creating a Task, Story, or Bug for the current or a requested sprint
13. **Load link or attachment guidance only when needed**: Read [the links and attachments reference](references/jira-links-and-attachments.md) before directional linking or explicit attachment uploads

Verify non-default identities with:

```sh
jira issue list \
  --jql "$TEAM_JQL AND key = $ISSUE_KEY" \
  --plain \
  --columns key,status,assignee,reporter \
  --paginate 1:10
```

## Bulk Backlog Sync Workflow

Before creating or updating many issues:

```sh
jira me
jira issue view "$PARENT_KEY" --plain
jira issue list --parent "$PARENT_KEY" --plain --paginate 1:100
```

For each work item:
- Skip it if a matching issue or sub-task already exists.
- Estimate each new Task, Story, or Bug independently with the Story Points rubric.
- Retain a key-to-estimate mapping and verify each stored value under `story_points_field.field_id` after creation; report mismatches without recreating issues.
- Create missing sub-tasks with `--raw` so the key is machine-readable; set Story Points only if live metadata allows `set` and the user requests a sub-task estimate.
- Add comments to partial/in-progress items describing what is done versus what remains.

Before changing statuses during a bulk sync, read [the Jira workflow reference](references/jira-workflow.md) and validate the workflow with one representative issue.

## Workflow: Create Epic with Stories

```sh
# 1. Create the epic (note the returned key)
jira epic create \
  --name "Feature Initiative" \
  --summary "Implement feature X" \
  --priority "$PRIORITY_HIGH" \
  --body "Epic description..." \
  --custom "${TEAM_FIELD_ALIAS}=${TEAM_NAME}" \
  --reporter "$(jira me)" \
  --assignee "$(jira me)" \
  --no-input

# 2. Estimate each story independently, then create it under the epic
STORY_POINTS="$ESTIMATE_FOR_THIS_STORY"  # Select from the rubric for this story before running
jira issue create \
  --type "$STORY_ISSUE_TYPE" \
  --summary "First story" \
  --priority "$PRIORITY_STANDARD" \
  --parent "$EPIC_KEY" \
  --custom "${TEAM_FIELD_ALIAS}=${TEAM_NAME}" \
  --custom "${STORY_POINTS_ALIAS}=${STORY_POINTS}" \
  --reporter "$(jira me)" \
  --assignee "$(jira me)" \
  --custom "${ACCEPTANCE_CRITERIA_ALIAS}=- [ ] AC 1" \
  --no-input
```

Your goal is to maintain the issue tracker as a reliable source of truth for the configured team's project state.
