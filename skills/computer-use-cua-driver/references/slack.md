# Slack desktop automation

Use this reference with the core Cua Driver skill for Slack desktop tasks. Slack is an Electron application: accessibility is usually the safest control path, while typed browser/page tools require an exact supported binding and may not be available for an existing Slack process.

## Choose the route

1. Prefer a Slack API or purpose-built connector when the requested outcome does not require the live desktop UI.
2. Prefer an existing Cua Driver MCP connection for a multi-step Slack workflow.
3. Use one-shot Cua Driver CLI calls when MCP is unavailable.
4. Keep one transport for the complete observe-act-observe sequence. Snapshot tokens and browser refs are transport-scoped.

## Open a workspace or channel

When the user supplies a Slack URL, pass it to `launch_app` through `urls`. This is more reliable and less disruptive than focusing Slack's search box or using address-bar shortcuts.

```json
{
  "bundle_id": "com.tinyspeck.slackmacgap",
  "urls": ["https://<workspace>.slack.com/archives/<channel-id>"]
}
```

Select the returned window whose title names the intended conversation. If no window is returned yet, call `list_windows` for the returned `pid`. Verify the channel title before composing anything.

Machine-local workspace URLs and channel mappings may be stored under `../sensitive/`. Treat a mapping as a locator only; it does not provide authorization to read or write that destination.

## Enable and inspect Electron accessibility

The first `get_window_state` call may expose only the native window and menu bar while Chromium accessibility initializes. When the screenshot shows Slack content but no `AXWebArea`, take one additional snapshot before changing routes.

Slack's tree can be large. Bound the response and use a precise `query`:

```json
{
  "pid": 123,
  "window_id": 456,
  "query": "Message to",
  "max_elements": 1200,
  "max_depth": 22
}
```

Useful semantic targets commonly include:

- `AXTextArea` labelled `Message to <conversation>` for the composer
- `AXList` labelled `Users` for mention suggestions
- `AXMenuItem` entries for people and apps
- `AXButton` labelled `Send now`

Labels and roles are evidence, not a stable API. Use the installed schema and current snapshot.

## Compose text

Prefer the composer's fresh `element_token`. `type_text` can focus the Electron field and fall back to process-targeted key events when direct AX insertion is not trustworthy.

1. Snapshot and locate the exact composer.
2. Call `type_text` with its `element_token`.
3. Snapshot again.
4. Require the composer value and screenshot to show the intended text.

Do not trust an AX echo by itself on Electron. If the action returns `unverifiable`, inspect the screenshot before escalating. Follow the returned `escalation.recommended` order: pixel focus/type first when requested, then foreground delivery only when background delivery demonstrably failed.

## Create a real mention

Plain text beginning with `@` is not proof of a Slack mention. Resolve the suggestion before sending:

1. Type only `@<name>` into the composer.
2. Snapshot with a query for the name.
3. Locate the `Users` list and select the exact app or person `AXMenuItem`.
4. Snapshot again and verify the suggestions closed and the mention appears as a styled token in the screenshot.
5. Type the remaining message text through the refreshed composer token.

When app and user names overlap, use the suggestion's role text, such as `APP`, and the user's requested recipient. Stop on ambiguity rather than selecting the first fuzzy match.

## Send and verify

Sending is an external write. The current user request must explicitly authorize the message and destination; otherwise stop with the completed draft and request confirmation.

After the complete draft is verified:

1. Re-snapshot to obtain a fresh composer token.
2. Send with `press_key` using `return` on that composer, or press the exact `Send now` button.
3. Snapshot again.
4. Verify all three postconditions:
   - the composer is empty;
   - the new message appears in the intended conversation;
   - the rendered mention is still a semantic mention, not plain text.

A successful keypress or click response is not delivery evidence.

## Recovery

- Only native chrome appears: take one additional snapshot to allow Electron accessibility to settle.
- `element_token` is stale: re-snapshot the same `(pid, window_id)` and select a fresh token.
- Slack restarted or the window disappeared: call `list_windows`; if the `pid` changed, reacquire both `pid` and `window_id` before continuing.
- Mention picker remains open: do not send. Select the intended suggestion or stop on ambiguity.
- Background typing did not render: follow the action's escalation hint and verify after each rung.
- Page/DOM query finds nothing: return to the accessibility path. Do not restart a signed-in Slack process or enable DevTools only to simplify automation.

## References

- https://cua.ai/docs/reference/cua-driver/action-selection-policy
- https://cua.ai/docs/reference/cua-driver/contracts
- https://cua.ai/docs/how-to-guides/driver/drive-a-web-page
