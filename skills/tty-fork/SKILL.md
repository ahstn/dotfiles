---
name: tty-fork
description: >-
  Start a fresh or forked OMP session in a right or below split, or a new tab,
  in tty7, Herdr, or Tern. Use only when the user explicitly invokes /tty-fork.
disable-model-invocation: true
argument-hint: "[new|fork] [vsplit|hsplit|split|tab]"
---

# tty-fork

Run only after an explicit `/tty-fork` invocation. Do not trigger this skill for an ordinary request to fork or open a terminal.

## Arguments

Read `$ARGUMENTS` as `[new|fork] [vsplit|hsplit|split|tab]`:

- No arguments: `new split`.
- One `new` or `fork` argument: use that behavior and the default placement `split`.
- One placement argument: use `new` with that placement.
- Two arguments: behavior first, placement second. Reject extra or invalid values before any terminal change.
- `split` means `vsplit`: open the new pane on the right. `hsplit` opens it below. `tab` opens a new tab.

## Session behavior

Use the active OMP working directory and the same OMP executable as the parent. Get the cwd from current OMP session context, not the terminal's `$PWD`. If it is unavailable or inaccessible, ask before creating a destination.
Before creating a destination, confirm that its shell accepts POSIX command syntax. Check the configured shell; if the destination shell is unknown or differs, ask before sending text.

- `new` starts a fresh, persistent OMP session without the current transcript. Run `omp --session-dir "<effective-session-root>"` with the active profile/config when available; this explicit session directory prevents `autoResume` from attaching an older transcript. For the default setup, use `$PI_CODING_AGENT_DIR/sessions`, or `$HOME/.omp/agent/sessions` when that variable is unset. Do not pass `--resume`, `--continue`, or `--fork`, and do not use `--no-session`. If a custom profile or session directory is active and its value is not available, ask rather than start in a different store.
- `fork` starts an independent OMP session from the current persisted transcript. Get its path from active OMP session context. If the path is not exposed there, use the OMP eval tool's `env("PI_SESSION_FILE")`; OMP injects this variable into managed eval kernels, but not necessarily into the terminal shell. Verify that it exists and belongs to this session. Never guess from the newest file in a directory. Flush pending session writes, then run the current OMP CLI with `--fork <path>`, not `--resume`. The parent must keep running. If the path is unavailable, ask before creating a pane or tab.
- Before a fork, require a persisted transcript. Do not fork during vibe mode or with a CLI `--api-key` override. Preserve the active cwd, profile, model/thinking, config and session directories, XDG directories, and prompt-cache key when available; omit one-shot prompts and goals, and never pass API keys. Refuse a fork when the destination cannot access the source transcript.

## Select the multiplexer

Require exactly one matching environment marker and its CLI. Do not infer the multiplexer from `TERM_PROGRAM`, terminal titles, or the installed binaries alone. If markers conflict or the CLI cannot address the current pane, stop without changing the layout.

### tty7

Use `TTY7` as the version marker and `TTY7_PANE` as the current pane ID. Require `tty7` on `PATH`. Refuse to fork from a remote tty7 pane.

- Right split (`split` or `vsplit`): `tty7 split --horizontal --json`.
- Below split (`hsplit`): `tty7 split --vertical --json`.
- Tab: `tty7 tab new --cwd "<active-omp-cwd>" --json`.

Read the new pane ID from the JSON response. A split inherits the source pane's cwd; if it differs from the active OMP cwd, begin the child command with a quoted `cd` to the active OMP cwd. For `wait` and `send`, prefix the pane ID with `%` only if it does not already have that prefix. Wait for its shell with `tty7 wait %<pane-id> --until free --timeout 15`, then send the OMP command once with `tty7 send %<pane-id> "<command>" --paste --enter`. `--paste` avoids slow per-character typing. Use the session ID instead of a path when possible; otherwise quote the path for the destination shell.

### Herdr

Require `HERDR_ENV=1`, `HERDR_PANE_ID`, and `herdr` on `PATH`. If the Herdr skill is not already loaded, read and follow `herdr --skill` before control commands.

- Right split (`split` or `vsplit`): `herdr pane split --current --direction right --cwd "<active-omp-cwd>"`.
- Below split (`hsplit`): use `--direction down`.
- Tab: `herdr tab create --cwd "<active-omp-cwd>"`.

Read the new pane ID from `.result.pane.pane_id` or `.result.root_pane.pane_id`. Start the child with `herdr pane run <pane-id> "<command>"`.

### Tern

Require numeric `TERN_PANE`, `TERN_PANE_SOCKET`, and `tern` on `PATH`. `TERN_COMPLETE` is not a pane or session identifier. If either pane variable is missing, use a read-only current-context command only if installed help documents one and its output identifies this pane; otherwise stop.

Read `tern --help` and the installed help for its split/open commands before changing layout; their syntax depends on the Tern version. Use the documented right/down split for `vsplit`/`hsplit`, or its new-terminal tab operation for `tab`; set the active OMP cwd if supported. Launch `omp` or `omp --fork <id-or-path>` through the CLI's documented command option, targeted at the created terminal. If the CLI cannot set the cwd, prepend a quoted `cd` in the new shell. If the installed CLI cannot target the current pane and launch the command in the new terminal, stop and report that limitation. Do not guess flags or send the OMP command to an agent prompt.

## Finish

Create one destination, read its returned ID, wait for its shell if supported, and launch once. Check that the new terminal runs OMP. If a command times out or returns an error after creation, inspect that destination before retrying; do not duplicate the child session.