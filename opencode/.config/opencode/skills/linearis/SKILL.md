---
name: linearis-management
description: Manage Linear issues, projects, cycles, and comments using the linearis CLI. Use this skill when you need to create, update, search, or read details about tickets in Linear.
license: MIT
metadata:
  author: Antigravity
  version: "1.0"
---

# Linearis Management Skill

This skill allows an agent to interact with [Linear.app](https://linear.app) via the `linearis` CLI. It supports lifecycle management of issues, project listing, user identification, and comment handling.

## Usage Instructions

1.  **Always use `linearis` command**: All operations should be performed via the `linearis` executable.
2.  **Reference IDs**: Linear issues should be referenced by their identifiers (e.g., `AH-56`) or UUIDs.
3.  **Authentication**: The CLI expects `LINEAR_API_TOKEN` to be set or a token in `~/.linear_api_token`.
4.  **JSON Output**: Most commands return structured JSON, which is ideal for parsing.
5.  **Self-Discovery**: Run `linearis usage` to get a comprehensive list of all commands and options.

## Common Commands

### Issue Lifecycle
- **List Issues**: `linearis issues list --limit <N>`
- **Read Issue**: `linearis issues read <ISSUE_ID>` (Returns description, status, priority, and `embeds`).
- **Create Issue**: 
  ```bash
  linearis issues create "<TITLE>" --description "<DESC>" --team <TEAM> --project <PROJECT_ID> --priority <1-4>
  ```
- **Update Issue**: `linearis issues update <ISSUE_ID> --status "<STATUS>" --priority <P>`
- **Assign Issue**: `linearis issues update <ISSUE_ID> --assignee <USER_ID>` (find user "Adam Houston" from `linearis users list --active`)
- **Search Issues**: `linearis issues search "<QUERY>"`

### Projects and Teams
- **List Projects**: `linearis projects list`
- **List Teams**: `linearis teams list`
- **List Users**: `linearis users list --active`

### Collaboration
- **Add Comment**: `linearis comments create <ISSUE_ID> --body "<MARKDOWN_CONTENT>"`
- **Upload File**: `linearis embeds upload <FILE_PATH>`
- **Download File**: `linearis embeds download "<URL>" --output <PATH>`

### Cycles (Sprints)
- **List Active Cycle**: `linearis cycles list --team <TEAM_ID> --active`
- **List Recent Cycles**: `linearis cycles list --team <TEAM_ID> --limit 10`

## Best Practices

- **Check Current State Before Update**: Always run `linearis issues read <ISSUE_ID>` before making updates to avoid overwriting or redundant changes.
- **Hierarchy**: When creating subtasks, link them to the parent using `--parent-ticket <PARENT_ID>`.
- **Status Updates**: When a task's status changes in a ticket description (e.g., checkbox checked), update the ticket description.
- **Progress Reports**: For significant updates, add a comment using `linearis comments create`.
- **Project Mapping**: If the project isn't specified, list projects first to find the correct association.
- **Shell safety:** When using `linearis comments create .. --body ..` from a shell, never wrap the body in double quotes if it contains backticks. Backticks trigger command substitution. Prefer single quotes around the entire body, or use a quoted heredoc `(<<'EOF')` / --body-file to avoid any shell interpolation.

## Examples

### Creating a Task with a Parent
```bash
# First, find the parent ID
# Then create the subtask
linearis issues create "Implement FDR correction" \
  --description "Part of statistical controls." \
  --project "674a8ad6-dc81-41ae-ab94-2d9db8532f0c" \
  --team "535dc4ad-1a0b-4ba1-9503-16c01cfdb0f4" \
  --parent-ticket "AH-56"
```

### Updating Assignment and Status
```bash
linearis issues update AH-56 \
  --status "In Progress" \
  --assignee "1e4e4c1f-dfbe-4bb7-8050-45e6cacc2e2e"
```
