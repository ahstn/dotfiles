# Jira Workflow Reference

Read this reference only when a request involves status transitions, workflow completion, or bulk status changes. It is not needed for searches, views, comments, or creation without transitions.

Read `../sensitive/variables.json` before using these templates. Use the issue's actual key for `ISSUE_KEY`, the configured `team_name` and team field name for team-scoped JQL, and the exact transitions available for the issue's current workflow. Placeholder variables are never literal Jira values.

## Transition procedure

1. Verify the issue and its current status:

   ```sh
   jira issue view "$ISSUE_KEY" --plain
   ```

2. Discover the available transitions for the current issue before selecting one. Transition names are workflow actions and may differ from visible status names. With the configured Jira base URL and API credentials:

   ```sh
   JIRA_VARIABLES="$HOME/.agents/skills/jira-manager/sensitive/variables.json"
   JIRA_SITE=$(jq -r '.jira_instance_url' "$JIRA_VARIABLES")
   curl --fail --silent --show-error \
     --user "$JIRA_USER_EMAIL:$JIRA_API_TOKEN" \
     --header 'Accept: application/json' \
     "${JIRA_SITE%/}/rest/api/3/issue/$ISSUE_KEY/transitions" |
     jq -r '.transitions[] | [.name, .to.name] | @tsv'
   ```

3. Choose the transition that reaches the requested status, and run `jira issue move "$ISSUE_KEY" "$TRANSITION_NAME"`. If Jira rejects it, use the exact names in its `Available states` list for the issue's current status; do not guess a transition name.

4. Verify the resulting status:

   ```sh
   jira issue view "$ISSUE_KEY" --plain
   ```

Transition availability depends on the current status and issue type. Do not reuse a transition name from another project's workflow without checking it.

## Completing work

For completion, discover a transition to the requested final status for this issue, then run:

```sh
jira issue move "$ISSUE_KEY" "$COMPLETION_TRANSITION_NAME"
```

Do not assume a particular close or completion transition or supply a resolution by default. A workflow may reject an explicitly supplied resolution.

Resolution handling:

- Omit `--resolution` by default.
- Supply a resolution only when the transition explicitly requires and accepts one.
- If Jira reports that the selected resolution cannot be chosen, retry the same transition without `--resolution`.
- If Jira requires a field such as Fix Version, do not guess. Leave the status unchanged and ask for the required value.

## Failure handling

- **Invalid transition state**: Retry using an exact value from `Available states`.
- **Required field missing**: Do not invent a value. Ask the user or leave the issue unchanged.
- **Resolution rejected**: Retry without `--resolution`.
- **Ambiguous result**: View the issue before retrying. A successful transition must not be applied twice blindly.
- **Useful partial progress**: If the requested final transition cannot be completed, preserve the current status and report the blocker. Add a status comment only when it helps future readers.

## Bulk workflow changes

Validate one representative issue before applying the workflow to the full batch:

1. Create one representative issue when creation is part of the request.
2. Capture its key using `--raw`.
3. Move it through the complete requested workflow.
4. Verify its final status and any required fields.
5. Apply the validated command sequence to the remaining issues.
6. Query all affected keys and verify status, assignee, and reporter.

For example:

```sh
JIRA_VARIABLES="$HOME/.agents/skills/jira-manager/sensitive/variables.json"
TEAM_NAME=$(jq -r '.team_name' "$JIRA_VARIABLES")
# Resolve TEAM_FIELD_NAME from the configured team custom field; ISSUE_KEYS contains verified issue keys.
TEAM_JQL=$(jq -nr --arg field "$TEAM_FIELD_NAME" --arg team "$TEAM_NAME" '"\($field | @json) = \($team | @json)"')
jira issue list \
  --jql "$TEAM_JQL AND key IN ($ISSUE_KEYS)" \
  --plain \
  --columns key,summary,status,assignee,reporter \
  --paginate 1:100
```

Run bulk transitions stage by stage. Verify the first requested status change before applying the next, and check each stage for failures. This keeps partial failures visible and limits repeated invalid requests.
