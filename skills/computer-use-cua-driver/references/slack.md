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

Select the returned window whose title names the intended conversation. Slack owns many windows. Most are tiny or off-screen and have an empty title. Choose the one with a full title and `is_on_screen: true`. If no window is returned yet, call `list_windows` for the returned `pid`. Verify the channel title before composing anything.

### Prefer a channel ID to a channel name

A channel ID is stable and unique. Most channels start with `C`. A private channel can start with `G`. The reason is not verified, so accept both prefixes. Use the ID exactly as Channel details shows it. A name can change, and the sidebar can show similar names such as `example-channel` and `example-channel-team`. An ID also avoids the sidebar, which scrolls and can hide the row you need. Two URL forms take an ID:

- `https://<workspace>.slack.com/archives/<channel-id>` needs the workspace subdomain.
- `slack://channel?team=<team-id>&id=<channel-id>` needs the team ID (`T` plus letters and digits). Slack documents that `slack://` links accept IDs only, not channel names or subdomains. Source: https://docs.slack.dev/interactivity/deep-linking

Pass either form to `launch_app` in `urls`. Then read `window_title`. If it names the channel, the link worked. If it still names the old channel, or a new window opened, use the sidebar route in [Read recent messages](#read-recent-messages-no-writes).

Status: the `slack://` and `archives` forms are documented by Slack. Upstream Cua docs say `launch_app` with `urls` restores focus for Electron apps. Neither form has been tested live with `launch_app`. Record the result here after the first live test.

### Local variables

Read `../sensitive/variables.json` when a task names a Slack channel or workspace. `variables.example.jsonc` in `references/` shows the shape. The `sensitive/` directory is git-ignored, so keep real IDs out of tracked files. A value is a locator only. It does not provide authorization to read or write that destination.

```bash
# <skill-dir> is the directory that contains SKILL.md.
SLACK_VARS="<skill-dir>/sensitive/variables.json"
TEAM_ID=$(jq -r '.slack.workspace.team_id' "$SLACK_VARS")
SUBDOMAIN=$(jq -r '.slack.workspace.subdomain' "$SLACK_VARS")
CHANNEL_ID=$(jq -r --arg name "<channel-name>" '.slack.channels[$name] // empty' "$SLACK_VARS")
```

If the channel is not in the map, do not guess an ID. Use the sidebar route or ask the user for the ID.

To find an ID in the desktop app, open the channel, click the channel name in the header, and read `Channel ID: ...` at the bottom of the About tab. In the accessibility tree it is an `AXStaticText` with the value `Channel ID: <id>`, so match it with `^Channel ID: ([CG][A-Z0-9]{8,})$`. This route was tested and needs foreground clicks. See [Read a channel ID](#read-a-channel-id-from-the-desktop-app).

To find an ID in a web browser instead, open the channel at `https://<subdomain>.slack.com`. When the page loads, the URL is `https://app.slack.com/client/<TEAM_ID>/<CHANNEL_ID>`. The `T...` part is the team ID and the `C...` part is the channel ID. Slack documents this URL form for the workspace ID: https://slack.com/help/articles/221769328-Locate-your-Slack-URL-or-ID. A copied message link also holds the channel ID, as `https://<subdomain>.slack.com/archives/<CHANNEL_ID>/p<timestamp>`. On Enterprise plans that URL shows an `E...` org ID. It is untested whether `slack://` accepts an org ID.

Slack Web API history methods take a channel ID. If a Slack MCP server or connector is available, use it to read messages and skip the desktop UI.

## Read a channel ID from the desktop app

This route reads the ID shown in Channel details. It was tested on the Slack desktop app for macOS. It sends nothing and changes no channel settings. Foreground delivery needs user authorization, as described in `SKILL.md`.

Background-only routes that did not work:

- The sidebar row exposes no ID. Its accessibility label holds the name and flags such as `private`, `starred`, and `<n> members`.
- `right_click` with an `element_token` opens the `Channel options` menu. The menu items `Channel details` and `Copy` ignore `AXPress` and `AXOpen`, even though the menu is visible. `Copy` is a submenu that has to open before its items can be read.
- A background `Escape` closed the menu. `AXCancel` on the menu did not.

Route that worked, per channel:

1. Press `Escape` in the background to close any dialog. Confirm no `Channel ID:` text remains.
2. Take a snapshot with a screenshot. Find the sidebar `AXRow` whose label, before ` (`, equals the channel name. It must be about 20 px or more tall in `screenshot_frame`, and inside the sidebar. A row that is 1 or 2 px tall is clipped and cannot be clicked. Scroll the sidebar in the foreground to reveal it.
3. Foreground `click` on the row, using `x,y` from that snapshot's `screenshot_frame` and that snapshot's `capture_id`.
4. Poll `get_window_state` until `window_title` starts with `<channel> (Channel)`. Ignore a leading `*` or `!`. A single snapshot right after a click can still show the old channel.
5. Find the header `AXButton` labelled `Channel details for #<channel>`. Private channels omit the `#`: `Channel details for <channel>`. Match both forms.
6. Foreground `click` on that button. The `About` tab opens.
7. Poll until one `AXStaticText` matches `Channel ID: <id>`. Read the ID from that text and do not guess it.
8. Press `Escape` again before the next channel.

Check each result against a known ID when you have one. In testing, the route returned the same ID that the user had supplied.

Pitfalls:

- The sidebar reorders while you work. A channel can move between sections, and the list can jump when unread counts change. Re-snapshot before every click and never reuse a row position.
- The user may change the Slack view between calls. Read `window_title` at the start of each run.
- The sidebar `scroll` needs foreground delivery, like the message pane.

## Read recent messages (no writes)

Use this route to read a channel when no Slack API or connector is available. It sends nothing.

1. **Take a large snapshot.** Slack's web tree has hundreds of elements and over a thousand walked nodes. The size varies with the workspace. A budget of 50 nodes ran out before the sidebar and gave a partial tree. Use `max_elements: 3000`, `max_depth: 40`, `timeout_ms: 8000`, and a `query` for the channel name. The first snapshot can show only native menus. Take a second one.
2. **Find the sidebar row.** Do this only if you have no channel ID or the URL route failed. It is an `AXRow` inside the `AXOutline` named `Channels and direct messages`. Its label can carry a suffix such as `<channel> (has unread messages)`.
3. **Do not trust a background press.** A background `element_token` press on that row sets `selected: true` in the tree, but the window title and the pane stay on the old channel. A background pixel `click` reports `PX hit-test pressed the background element via AX` and does the same. Neither call opens the channel.
4. **Use foreground delivery for navigation.** A pixel `click` with `delivery_mode:"foreground"` at the row's screenshot coordinates opened the channel. Foreground delivery briefly moves Slack to the front and moves the pointer. Use it only if the user already authorized visible control for this task. Otherwise ask first. If the user says no, stop and report the blocker.
5. **Verify with `window_title`.** After a successful open, `get_window_state` returns `<channel> (Channel) - <workspace> - Slack`. The `selected` flag and the action response are not proof. Read the messages from the screenshot.
6. **Scroll in the foreground.** Background `scroll` returns `background_unavailable` on Slack. Use `scroll` with `delivery_mode:"foreground"` and window-local `x,y` over the message pane. The newest messages are at the bottom, and the pane may open near the bottom already. Scroll down first to be sure. Then scroll up in steps of 5 lines. Five lines moved the view by about 360 screenshot pixels. Take a new snapshot with a screenshot after each step.
7. **Keep a screenshot in the latest snapshot.** A snapshot with `include_screenshot:false` replaces the screenshot context. The next `x,y` action then fails with `screenshot_context_missing`. Take a new snapshot with a screenshot before each pixel action.
8. **Report only what is on screen.** The pane shows top-level posts and a reply count such as `<n> replies`. It does not show the replies. Do not open threads unless the user asks. State that the summary covers top-level posts only.
9. **Re-check the title on a shared desktop.** The user may change the Slack pane between calls. Read `window_title` again before you report which channel you read.

Message text also appears as `AXStaticText` in web content. This was seen in the Threads view, where some rows reported a height of about 2 px. It was not tested on a channel pane. Until it is tested, treat the screenshot as the source of truth.

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
- Sidebar press shows `selected: true` but the pane did not change: the press did not navigate. See [Read recent messages](#read-recent-messages-no-writes) for the foreground pixel click and the `window_title` check.
- Page/DOM query finds nothing: return to the accessibility path. Do not restart a signed-in Slack process or enable DevTools only to simplify automation.

## References

- https://cua.ai/docs/reference/cua-driver/action-selection-policy
- https://cua.ai/docs/reference/cua-driver/contracts
- https://cua.ai/docs/how-to-guides/driver/drive-a-web-page
