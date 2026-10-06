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

Pass either form to `launch_app` in `urls`. Then poll `window_title` for a few seconds. If it names the channel, the link worked. If it still names the old channel, or a new window opened, use the sidebar route in [Fallback: foreground navigation and scrolling](#fallback-foreground-navigation-and-scrolling).

Test results, each from one live run on macOS with Slack already open:

- `slack://channel?team=<team-id>&id=<channel-id>` through `launch_app` switched the open window to the channel. The title changed within about 2 seconds.
- `https://<workspace>.slack.com/archives/<channel-id>` did not switch the channel. The title still named the old channel after 2 seconds. A longer wait was not tried, so treat this form as unreliable, not as broken.
- The window list in the `launch_app` response is a snapshot from launch time. It showed the old title even when the switch succeeded a moment later. Read the title with `list_windows` or `get_window_state` instead.
- The response reports a background launch. Which app was frontmost afterwards was not checked.

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

Use this route to read a channel when no Slack API or connector is available. It types and sends nothing. It does change what Slack shows, so read [Restore the view and report what you touched](#restore-the-view-and-report-what-you-touched) before you start.

This route was run end to end on macOS without `delivery_mode:"foreground"` and without `bring_to_front`. If it fails, use the [fallback](#fallback-foreground-navigation-and-scrolling), which needs the user's authorization.

1. **Open the channel.** Use a `slack://` link with `launch_app`, as described above. Wait until `window_title` names the channel.
2. **Take a large snapshot.** Channel panes had roughly 700 to 1,000 elements. Use `max_elements: 3000`, `max_depth: 40`, and `timeout_ms: 8000`. A budget of 50 nodes ran out before the sidebar and gave a partial tree. The first snapshot can show only native menus, so take a second one. A full snapshot is large, on the order of 10K tokens. After the first one, narrow later snapshots with `query`.
3. **Read the loaded posts from the tree.** Message text is `AXStaticText`. Each top-level post has an `AXLink` whose label looks like `<d> <Mon> at HH:MM:SS`. Use that as the post's unique key. A reply count is an `AXButton` labelled `<n> replies` or `1 reply`. `query` is a case-insensitive substring match. `a|b` is not alternation: three such queries returned no rows. Run one query per term.
4. **Load more posts with keys.** Slack renders only part of a channel. A fresh pane held about 5 top-level posts. Send `press_key` with `key` set to `pageup`, `pagedown`, `home`, or `end`, `delivery_mode:"background"`, and the `element_token` of the `AXWebArea`. Background `scroll` was refused with `background_unavailable` in 3 of 3 tries, so do not use it.
   - The key response says `effect: unverifiable`. Wait 1 to 2 seconds, take a new snapshot, and compare the post timestamps. The pane can keep moving after the key press, so an immediate read can show a mid-scroll view.
   - Keys stopped having any effect after the key target was an `AXList` node that sat after the posts. Targeting the `AXWebArea` token worked again. A thread pane was also open at the time. Whether it caused the stall was not tested, so close it before paging.
   - Do not bound the message block by where `AXList (<channel> (channel))` sits. It comes before the posts in some snapshots and after them in others. Use the post timestamps instead.
5. **Open a thread only when the user asked for replies.** A background `AXPress` on the `<n> replies` button opens the thread pane. Take a new snapshot, because the old token is stale. The text is under `AXList (Thread in <channel> (channel, <n> replies))`. Slack folds consecutive replies from one author under one header, so counting author headers undercounts. Compare your written reply count with the button's number.
6. **Check coverage by date.** One scroll position can miss posts. In one run, a pass by scrolling missed several posts, and jumping by date found them. The cause was not established, so do not treat a single scroll position as complete.
   - Press an `AXPopUpButton` labelled `Jump to date`. There is one per date divider, and any visible one works.
   - The menu items seen were `Most recent`, `Today`, and `Jump to a specific date`. The calendar days are `AXButton` entries labelled like `<Weekday>, <d> <Month> <yyyy>`.
   - A background `AXPress` worked on all of these. This is navigation only.
   - Check the start and the end of the range you were asked to cover.
7. **Convert relative dates.** Recent posts show `Yesterday` or a weekday name instead of a date. Convert them from today's date, and write the assumption into your notes.
8. **Do not trust a screenshot over the tree.** Once, three snapshots in a row returned identical screenshots while the tree changed. Take a fresh snapshot before you rely on a screenshot, and treat the tree as the live source for text.
9. **Read images from a preview.** The tree shows an attachment only as an `AXLink` and an `AXImage` named like `image.png`. A background `AXPress` on the link opened the preview. Then take a snapshot with `include_accessibility_tree:false` and `max_image_dimension:0` to get a native-resolution screenshot and read the content from it. `zoom` needs a screenshot from a `get_window_state` call on the same connection. A snapshot taken on another connection, such as an eval bridge instead of the direct tool route, returned `screenshot_context_missing`. If you cannot read the image, say so. Do not infer its content.
10. **Verify the title before you report.** The title is `<channel> (Channel) - <workspace> - Slack`. It can also carry a leading `*` or `!` and a count such as `<n> new items`, so match by containment, not equality. The user may change the pane between calls, so read the title again before you say which channel you read.

Message text is in the tree on channel panes and thread panes. Rows that are off-screen can report a frame height of 1 or 2 px. The text is still in the tree.

### Restore the view and report what you touched

Opening a thread, a menu, or a preview changes what Slack shows, and Slack may mark items as read. Record the starting state, then restore it and report the changes.

- Record the window title and whether a thread pane was open before you begin.
- **Thread pane.** A background `Escape` did not close it. Press the pane's `Close` `AXButton`. Two buttons labelled `Close` matched in one snapshot, so check which one belongs to the thread pane. Then confirm that no `AXList (Thread in …)` remains.
- **Date menu.** `AXCancel` on the `AXMenu` left it open, and its `Today` item was still in the tree. Choosing an item closes it. A background `Escape` closed the channel-options menu described earlier, but it was not tried on this menu.
- **Image preview.** No close route was verified. After you open one, look for a modal in the next snapshot. If one remains, tell the user.
- **Unexpected channel switch.** The window switched to another channel once mid-run. The cause was not found. It could have been a key press or the user. Check the title before each pass.
- **Saved files.** Screenshots and snapshot dumps of messages hold private content. Delete them when the task is done, and end your session.

### Fallback: foreground navigation and scrolling

Use this only if the `slack://` route did not switch the channel, or you must read from the sidebar. It needs `delivery_mode:"foreground"`, which briefly moves Slack to the front and moves the pointer. Use it only if the user already authorized visible control for this task. Otherwise ask first. If the user says no, stop and report the blocker.

1. **Find the sidebar row.** It is an `AXRow` inside the `AXOutline` named `Channels and direct messages`. Its label can carry a suffix such as `<channel> (has unread messages)`.
2. **Do not trust a background press.** A background `element_token` press on that row sets `selected: true` in the tree, but the window title and the pane stay on the old channel. A background pixel `click` reports `PX hit-test pressed the background element via AX` and does the same. Neither call opens the channel.
3. **Navigate with a foreground pixel click.** A pixel `click` with `delivery_mode:"foreground"` at the row's screenshot coordinates opened the channel.
4. **Verify with `window_title`.** The `selected` flag and the action response are not proof.
5. **Scroll in the foreground.** Use `scroll` with `delivery_mode:"foreground"` and window-local `x,y` over the message pane. The newest messages are at the bottom, and the pane may open near the bottom already. Scroll down first to be sure. Then scroll up in steps of 5 lines. Five lines moved the view by about 360 screenshot pixels. Take a new snapshot with a screenshot after each step.
6. **Keep a screenshot in the latest snapshot.** A snapshot with `include_screenshot:false` replaces the screenshot context. The next `x,y` action then fails with `screenshot_context_missing`. Take a new snapshot with a screenshot before each pixel action.
7. **Report what the pane shows.** A screenshot of the pane shows top-level posts and a reply count such as `<n> replies`. It does not show the replies. If you did not open the threads, state that the summary covers top-level posts only.

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
- Sidebar press shows `selected: true` but the pane did not change: the press did not navigate. See the [fallback](#fallback-foreground-navigation-and-scrolling) for the foreground pixel click and the `window_title` check.
- Page/DOM query finds nothing: return to the accessibility path. Do not restart a signed-in Slack process or enable DevTools only to simplify automation.
- Keys were sent but the pane did not move: wait 1 to 2 seconds and take a new snapshot, because the key response is `unverifiable`. If the pane is still the same, target the `AXWebArea` token, and close any open thread pane.
- Thread pane still open after `Escape`: press the pane's `Close` `AXButton`. See [Restore the view and report what you touched](#restore-the-view-and-report-what-you-touched).
- Window title still names the old channel after a `launch_app` URL: poll for a few seconds before you change route. The window list in the `launch_app` response is not current.

## References

- https://cua.ai/docs/reference/cua-driver/action-selection-policy
- https://cua.ai/docs/reference/cua-driver/contracts
- https://cua.ai/docs/how-to-guides/driver/drive-a-web-page
