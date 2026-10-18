# Git branch tabs

This Tern window plugin shows the existing tab title on the first row and `branch: <name>` on the second row. Explicit tab names remain unchanged. Split tabs use the focused pane's repository. Detached HEAD uses `detached:<short SHA>`. A missing or unsupported repository keeps Tern's normal title.

Tern 0.8.4 calls `tern.chrome.tab_title`, but its vertical sidebar did not display the returned label during live verification. This plugin uses `cx.layout:name_tab` so branch names appear in that sidebar. Scoped CSS makes matching sidebar rows 48 px high. It draws the branch separately at 11 px in the theme’s muted text colour (`--t3`), while retaining the full two-line title for accessibility and tooltips. Long titles stay on one row and truncate. These internal CSS classes were verified against Tern 0.8.4 and may need adjustment after an upgrade. It records each name it owns in Tern's plugin store. Manual renames take priority, including after reload.

The plugin queries Tern's local Git API after focus, directory, command, and agent events. It also polls every five seconds for changes made by other processes and updates the underlying pane title at that interval. Remote panes are passed by ID and rejected by the local Git API; their paths are never queried on the local machine.

Link this plugin on each machine that displays Tern windows. From the dotfiles repository, run:

```sh
mise run tern-plugins-link
```

The task uses `tern plugin link` to register this checkout. Keep the source files in Git; Tern's generated `.path` pointer and runtime plugin data stay machine-local.

After edits, run `tern plugin reload`. Check the daemon catalog with `tern plugin list --json`; Preferences > Plugins also reports window-side loading failures.

To disable the plugin, first run **Git branch tabs: restore original titles** from Tern's command palette. This clears only names the plugin owns and pauses updates across reloads. Run **Git branch tabs: enable** to resume.

After restoring titles, you can remove the link:

```sh
tern plugin unlink git-branch-tabs
```

Restore before unlinking: tab names persist in Tern, and a removed plugin cannot clear them. Unrelated files and manually named tabs are not changed.

Requires the Tern window APIs shipped in version 0.8.4. Source reference: `stencil-hq/tern-sdk` at `13d3cca8bbd8f055431f8eb3caa434a22e966f8f`.

Live verification on Tern 0.8.4 confirmed visible two-line sidebar labels with long titles truncated independently, branch switching, detached HEAD, worktree directories, leaving a repository, manual-name preservation, and plugin reload. The restore and enable palette commands both changed the visible labels as expected. Branch tests used a temporary repository; the test tab was closed afterward. Multiple windows and split-pane focus changes were not tested.
