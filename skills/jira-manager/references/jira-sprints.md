# Jira Sprint Reference

Read this reference only when creating a Task, Story, or Bug that should enter a sprint, or when the user explicitly requests a sprint change. It is not needed for searches, views, comments, ordinary edits, Epics, Sub-tasks, or tickets explicitly intended for the backlog or no sprint.

## Board configuration

Read `../sensitive/variables.json` before acting. Its `board_id` identifies the intended team board; ensure the Jira CLI board in `~/.config/.jira/.config.yml` matches it. Resolve the configured project, priority, team field, acceptance-criteria field, and separate Story Points field as described in `../SKILL.md`. Do not use example identifiers as Jira values.

`jira sprint list` is scoped through the configured board. Jira board filters can expose sprints that originated on another board, so a stale board configuration can return plausible but misleading results. Do not compensate by hard-coding the current sprint ID.

## Default assignment policy

Apply these rules in order:

1. If the user requests backlog or no sprint, do not assign a sprint.
2. If the user specifies a sprint ID or an unambiguous sprint, use that sprint after validating it.
3. For a newly created Task, Story, or Bug estimated at `8` or less with no contrary instruction, resolve and assign the single active sprint.
4. Keep an issue estimated above `8` out of a sprint until it is decomposed or the user explicitly accepts sprint commitment for the oversized item.
5. Do not automatically assign Epics or Sub-tasks. Assign them only when explicitly requested and Jira supports the operation.
6. For searches, views, comments, links, or updates unrelated to sprint membership, do not perform sprint discovery.

Sprint IDs change over time. Never retain an observed sprint ID as a default.

## Why assignment is a second operation

The installed Jira CLI does not support creating an issue directly in the current sprint. Sprint is a board-dependent custom field, and the CLI's intended workflow uses two operations:

1. Create the issue and capture its key with `--raw`.
2. Add the created key with `jira sprint add`.

Do not use `--custom sprint=...` as a shortcut. Do not retry issue creation if sprint assignment fails after a key was returned.

## Resolve the active sprint

Use machine-readable plain output:

```sh
jira sprint list \
  --state active \
  --table \
  --plain \
  --no-headers \
  --columns id,name,state
```

Do not use `--current` to discover the sprint ID; that option lists issues in the current sprint rather than providing the active sprint metadata needed for assignment.

Validate the number of active sprints:

- **Zero**: Leave the created issue without a sprint and report that no active sprint was found.
- **One**: Use its ID.
- **Multiple**: Do not choose the first row. Ask the user which sprint to use.

Parallel active sprints are valid Jira configurations, so first-row selection is unsafe even with the correct board.

## Safe create-and-assign helper

Resolve the sprint before creation so ambiguity can be handled without creating an unintended issue. Before running the helper, estimate the specific Task, Story, or Bug with the Story Points rubric in `../SKILL.md`; do not use one batch-wide default. Resolve every variable below before running this template, including `TASK_ISSUE_TYPE` from `issue_types` and the custom-field CLI aliases from the matching CLI configuration.

```sh
set -euo pipefail

JIRA_VARIABLES="$HOME/.agents/skills/jira-manager/sensitive/variables.json"
TEAM_NAME=$(jq -er '.team_name' "$JIRA_VARIABLES")
PRIORITY_STANDARD=$(jq -er '.priorities.standard' "$JIRA_VARIABLES")
STORY_POINTS_FIELD_ID=$(jq -er '.story_points_field.field_id' "$JIRA_VARIABLES")
STORY_POINTS="$ESTIMATE_FOR_THIS_ISSUE"  # Choose from the rubric before running

case "$STORY_POINTS" in
  0.5|1|2|3|5|8) ;;
  13|21|34)
    printf 'Estimate %s exceeds 8; keep the issue out of a sprint pending decomposition or explicit approval.\n' "$STORY_POINTS" >&2
    exit 4
    ;;
  *)
    printf 'Invalid Story Points value: %s\n' "$STORY_POINTS" >&2
    exit 5
    ;;
esac

ACTIVE_SPRINTS=$(
  jira sprint list \
    --state active \
    --table \
    --plain \
    --no-headers \
    --columns id,name,state
)

SPRINT_COUNT=$(
  printf '%s\n' "$ACTIVE_SPRINTS" |
    awk -F '\t' '$3 == "active" { count++ } END { print count + 0 }'
)

if [ "$SPRINT_COUNT" -eq 0 ]; then
  printf 'No active sprint found; create without sprint or report the condition.\n' >&2
  exit 2
fi

if [ "$SPRINT_COUNT" -ne 1 ]; then
  printf 'Expected one active sprint; found %s:\n%s\n' \
    "$SPRINT_COUNT" "$ACTIVE_SPRINTS" >&2
  exit 3
fi

SPRINT_ID=$(
  printf '%s\n' "$ACTIVE_SPRINTS" |
    awk -F '\t' '$3 == "active" { print $1; exit }'
)

ISSUE_JSON=$(
  jira issue create \
    --type "$TASK_ISSUE_TYPE" \
    --summary "Example task" \
    --priority "$PRIORITY_STANDARD" \
    --custom "${TEAM_FIELD_ALIAS}=${TEAM_NAME}" \
    --custom "${STORY_POINTS_ALIAS}=${STORY_POINTS}" \
    --custom "${ACCEPTANCE_CRITERIA_ALIAS}=- [ ] Work is complete" \
    --reporter "$(jira me)" \
    --assignee "$(jira me)" \
    --no-input \
    --raw
)

ISSUE_KEY=$(printf '%s\n' "$ISSUE_JSON" | jq -er '.key')

jira issue view "$ISSUE_KEY" --raw |
  jq -e --arg id "$STORY_POINTS_FIELD_ID" --argjson expected "$STORY_POINTS" \
    '.fields[$id] == $expected' >/dev/null

jira sprint add "$SPRINT_ID" "$ISSUE_KEY"
```

If the default policy permits creating without an active sprint, handle exit code `2` by creating the issue without sprint assignment and reporting that result. Multiple active sprints require clarification before creation unless the user explicitly permits an unassigned issue.

## Explicit sprint requests

When the user supplies a sprint ID, use the Jira Agile REST API to inspect sprint metadata before assignment. Set `JIRA_SITE` and `BOARD_ID` from `../sensitive/variables.json` and `SPRINT_ID` to the requested ID:

```sh
JIRA_VARIABLES="$HOME/.agents/skills/jira-manager/sensitive/variables.json"
JIRA_SITE=$(jq -er '.jira_instance_url' "$JIRA_VARIABLES")
BOARD_ID=$(jq -er '.board_id' "$JIRA_VARIABLES")
# Set SPRINT_ID to the requested sprint ID after validating it is numeric.
curl --fail --silent --show-error \
  --user "$JIRA_USER_EMAIL:$JIRA_API_TOKEN" \
  --header 'Accept: application/json' \
  "${JIRA_SITE%/}/rest/agile/1.0/sprint/$SPRINT_ID" |
  jq -e --argjson sprint "$SPRINT_ID" --argjson board "$BOARD_ID" \
    'select(.id == $sprint and .originBoardId == $board and .state != "closed") | {id, name, state, originBoardId}'
```

The check must return one object for the configured board in a non-closed state. Stop if the sprint is missing, closed, or belongs to another origin board. Do not infer a similarly named sprint when multiple matches exist.

Assign the captured issue key:

```sh
jira sprint add "$SPRINT_ID" "$ISSUE_KEY"
```

Sprint assignment does not change scope. Preserve the issue's Story Points when adding or moving it between sprints.

## Verification

After assignment, verify that the issue appears in the selected sprint:

```sh
jira sprint list "$SPRINT_ID" \
  --plain \
  --no-headers \
  --columns key,summary,status
```

For scripted verification, compare the returned key exactly rather than matching only the summary.

If assignment fails:

- Preserve and report the already created issue key.
- Do not recreate the issue.
- Check whether the sprint is closed, the issue type supports sprint membership, the board filter includes the issue, or permissions are missing.
- Retry only the `jira sprint add` operation after correcting the cause.

## Bulk creation

For a batch intended for the same current sprint:

1. Resolve and validate the active sprint once immediately before the batch.
2. Estimate each issue independently and create it with the configured Story Points CLI alias and `--raw`; retain every returned key and expected estimate.
3. Verify each key's value under `story_points_field.field_id` against its expected estimate. Report mismatches and do not recreate issues.
4. Exclude estimates above `8` unless the user explicitly accepted sprint commitment for those oversized items.
5. Add eligible created keys with `jira sprint add`; the command accepts up to 50 issue keys at once.
6. Verify all assigned keys against the selected sprint.
7. Report any created issues whose sprint assignment failed; never recreate them automatically.

If a long-running batch crosses a sprint boundary or the active sprint changes, stop and re-resolve rather than continuing with the stale ID.
