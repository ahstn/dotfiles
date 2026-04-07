## GitHub CLI Index

Use the following for a quick-up of GitHub CLI and API functionality:

- Get existing comments: `gh pr view --json comments`
- Get diff: `gh pr diff`
- Get changed files with patches to compute inline positions: `gh api repos/${{ github.repository }}/pulls/${{ github.event.pull_request.number }}/files --paginate --jq '.[] | {filename,patch}'`
- Compute exact inline anchors for each issue (file path + diff position). **Comments MUST be placed inline on the changed line** in the diff, not as top-level comments.
- Detect prior top-level "no issues" style comments authored by this bot (match bodies like: "no issues", "No issues found", "LGTM"; include earlier emoji-prefixed variants if present).


If CURRENT run finds issues and any prior "no issues" comments exist:

- Prefer to remove them to avoid confusion:
    - Try deleting top-level issue comments via: gh api -X DELETE repos/${{ github.repository }}/issues/comments/<comment_id>
    - If deletion isn't possible, minimize them via GraphQL (minimizeComment) or edit to prefix "[Superseded by new findings]".
- If neither delete nor minimize is possible, reply to that comment: "Superseded: issues were found in newer commits".
- If a previously reported issue appears fixed by nearby changes, reply: This issue appears to be resolved by the recent changes