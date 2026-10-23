---
name: slack-message
description: Rules for sending Slack messages and reference request payloads.
disable-model-invocation: true
---

# Slack message

- Use `skill://personality` to draft messages. Always end each sent message, including thread replies, with a Block Kit `context` block: `:omp: Sent by Adam's Interns` as a footer.
- Use `mrkdwn` for the footer so custom emoji render. Assume `:omp:` exists in the workspace. Avoid adding it to the message body.
- Include the body and footer in top-level `text` for notifications and screen readers. The footer does not change sender identity.
- Current Slack MCP send/draft/schedule tools lack `blocks`. Use direct HTTP with an existing authorised Slack token; never print or store the token. If no token is available, report the blocker; do not replace the footer with normal text.
- Confirm the recipient before sending. Check Slack's JSON `ok` field, retain returned `channel` and `ts`, and return the permalink. Do not retry an uncertain send without checking for duplicates.
- If the message or user prompt is ambiguous or uncertain, use `ask` for clarification and alignment before sending. Examples: the prompt does not match the current Slack state, or the channel, recipient or target message is unclear. Do not guess the intended destination or content.

## Local lookup

- Before resolving a recipient, check that `sensitive/variables.json` exists relative to this skill. If it exists, read it and use it first.
- If missing, use `ask` to offer two options: the user creates the file, or you create it from their frequent chats. For the second option, ask which users, channels or group chats to include, then resolve their IDs with read-only Slack calls. Do not guess IDs or send messages during setup. Keep the file gitignored.
- Use three maps: `users` keyed by username, `channels` keyed by channel name, and `group_chats` keyed by comma-separated participant usernames. Each value is an object with `id` and `notes` strings; see [`variables.example.jsonc`]. Read `.id` for API requests and `.notes` for destination guidance. Group chat IDs can be used directly as `channel`, regardless of ID prefix. Search Slack for missing entries.

## Tested requests

Run in the shell where the tokens are available. Replace placeholders with values from the gitignored [`variables.json`] and API responses; use the returned DM channel ID for direct messages. Add `thread_ts` to the send payload for replies.

```bash
TOKEN="${SLACK_XOXP_TOKEN:-${SLACK_MCP_XOXP_TOKEN}}"
# Verify identity.
curl -sS --max-time 30 https://slack.com/api/auth.test -H "Authorization: Bearer $TOKEN"
# Open a DM; use the returned channel.id below.
curl -sS --max-time 30 https://slack.com/api/conversations.open -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json; charset=utf-8' --data '{"users":"<user ID>"}'
# Send; \u0027 preserves the apostrophe inside shell single quotes.
curl -sS --max-time 30 https://slack.com/api/chat.postMessage -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json; charset=utf-8' --data '{"channel":"<channel ID>","text":":omp: Footer test.\nSent by Adam\u0027s Interns","blocks":[{"type":"section","text":{"type":"mrkdwn","text":":omp: Footer test."}},{"type":"context","elements":[{"type":"mrkdwn","text":":omp: Sent by Adam\u0027s Interns"}]}]}'
# Get the link: this method uses query parameters, not a JSON body.
curl -sS --max-time 30 --get https://slack.com/api/chat.getPermalink -H "Authorization: Bearer $TOKEN" --data-urlencode 'channel=<channel ID>' --data-urlencode 'message_ts=REPLACE_WITH_RETURNED_TS'
unset TOKEN
```

See [Context block | Slack] and [chat.postMessage API method | Slack].

[Context block | Slack]: https://docs.slack.dev/reference/block-kit/blocks/context-block/
[chat.postMessage API method | Slack]: https://docs.slack.dev/reference/methods/chat.postMessage/
[`variables.json`]: sensitive/variables.json
[`variables.example.jsonc`]: references/variables.example.jsonc
