# Jira Links and Attachments Reference

Read this reference only when a request involves directional issue links or the user explicitly asks to attach files. It is not needed for ordinary issue creation, searches, views, comments, or transitions.

## Directional issue links

The CLI syntax is:

```sh
jira issue link "$FIRST_KEY" "$SECOND_KEY" "$LINK_TYPE"
```

For directional link types, the first issue displays the outward relationship and the second issue displays the inward relationship. A successful command can still encode the opposite direction from the user's intent.

Retrieve the instance's link types before linking. For a directional type, assign `FIRST_KEY` to the issue that should display the outward relationship and `SECOND_KEY` to the issue that should display the inward relationship. Set `LINK_TYPE` to the exact configured name. For symmetric links, use either issue order.

After creating a directional link, view both issues and confirm the displayed relationship:

```sh
jira issue view "$FIRST_KEY" --plain
jira issue view "$SECOND_KEY" --plain
```

If the direction is wrong, remove and recreate the link rather than leaving misleading issue relationships:

```sh
jira issue unlink "$FIRST_KEY" "$SECOND_KEY"
```

When the exact link type or inward/outward wording is uncertain, retrieve the configured Jira link types before linking:

```sh
JIRA_VARIABLES="$HOME/.agents/skills/jira-manager/sensitive/variables.json"
JIRA_SERVER=$(jq -er '.jira_instance_url' "$JIRA_VARIABLES")
curl --fail --silent --show-error \
  --user "$JIRA_USER_EMAIL:$JIRA_API_TOKEN" \
  "${JIRA_SERVER%/}/rest/api/3/issueLinkType" |
  jq -r '.issueLinkTypes[] | [.name, .inward, .outward] | @tsv'
```

Do not print authentication values. Use the exact configured link type name returned by Jira.

## Attachment policy

Attachments are opt-in:

- Do not attach screenshots, images, documents, logs, notebooks, or other files unless the user explicitly asks for those files to be attached.
- Files supplied to explain, summarize, or provide context for a ticket remain local context only.
- "Create a ticket from this screenshot" and similar wording does not authorize attachment upload.
- Attach only files explicitly named or unambiguously selected by the user.
- Do not infer that related files in the same directory should also be attached.
- Avoid attaching material that contains secrets, credentials, tokens, private keys, or unnecessary personal data. If an explicitly requested attachment appears sensitive, stop and ask before uploading it.

## Uploading explicitly requested attachments

The installed `jira` CLI does not provide an attachment command. Use Jira's REST API only after the issue key has been captured.

Read the Jira base URL from `../sensitive/variables.json`, and verify it matches the CLI configuration. Do not upload unless the user explicitly requested the attachment:

```sh
JIRA_VARIABLES="$HOME/.agents/skills/jira-manager/sensitive/variables.json"
JIRA_SERVER=$(jq -er '.jira_instance_url' "$JIRA_VARIABLES")
```

Upload one or more explicitly requested files:

```sh
curl -sS \
  -u "$JIRA_USER_EMAIL:$JIRA_API_TOKEN" \
  -H 'X-Atlassian-Token: no-check' \
  -F "file=@$REQUESTED_FILE" \
  "${JIRA_SERVER%/}/rest/api/3/issue/$ISSUE_KEY/attachments"
```

Add one `-F 'file=@...'` argument for each explicitly requested file. Never expose the API token in output or persist it in a script.

Verify the result by checking returned filenames or retrieving attachment metadata:

```sh
curl -sS \
  -u "$JIRA_USER_EMAIL:$JIRA_API_TOKEN" \
  "${JIRA_SERVER%/}/rest/api/3/issue/$ISSUE_KEY?fields=attachment" |
  jq -r '.fields.attachment[] | [.filename, .size] | @tsv'
```

Report which files were attached. If the upload result is ambiguous, inspect the issue before retrying to avoid duplicate attachments.
