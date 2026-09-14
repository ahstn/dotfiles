# Cua Driver setup and recovery

Load this reference only when neither a Cua Driver MCP connection nor the `cua-driver` CLI is available, when MCP registration is missing, or when the installed driver is unhealthy. Installation, permission changes, daemon startup, and MCP registration affect the user's environment; explain the required action and obtain permission before performing it.

## Select the available route

1. Use an already-connected Cua Driver MCP server when the host exposes its tools.
2. Otherwise check whether `cua-driver` is on `PATH`.
3. If the CLI exists, use it unless the user specifically requires MCP.
4. If neither route exists, stop and provide the official installation instructions below. Do not substitute raw GUI automation utilities.

Do not move snapshot tokens, element indices, browser refs, or implicit session state between MCP and CLI transports.

## Install Cua Driver

Use the current commands from the official tutorial:

https://cua.ai/docs/tutorials/drive-your-first-app

Do not run an installer automatically. Ask the user to run it, or obtain explicit permission first. Never copy illustrative binary paths from documentation.

### macOS

Requires macOS 14 or later.

```bash
/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"
open -n -g -a CuaDriver --args serve
cua-driver permissions grant
```

Enable CuaDriver under both Privacy & Security sections:

- Accessibility
- Screen & System Audio Recording

A changed grant may require a full CuaDriver relaunch.

### Windows

Requires Windows 10 or 11 with an interactive desktop session.

```powershell
irm https://cua.ai/driver/install.ps1 | iex
cua-driver autostart kick
```

If autostart is unavailable, run `cua-driver serve` in the interactive desktop session and leave it running.

### Linux

Requires an interactive desktop session and AT-SPI 2. Minimal Debian or Ubuntu installations may also require `libxi6` and `at-spi2-core`.

```bash
/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"
cua-driver serve
```

Run the service inside the same desktop session the agent will operate.

## Register MCP

When the CLI exists but the host has no Cua Driver MCP connection, generate configuration from the installed binary:

```bash
cua-driver mcp-config
```

Use exactly the emitted command or JSON. Add it to the host's MCP configuration, reload or restart the agent session, then verify that the Cua Driver tools are present. Use a client-specific `--client` option only when the installed `mcp-config` help advertises it.

Do not synthesize an executable path or open a second MCP connection when a working host-managed connection already exists.

## Verify readiness

For CLI operation:

```bash
cua-driver status
cua-driver doctor
cua-driver call list_apps '{}'
```

On macOS, also run:

```bash
cua-driver permissions status
```

Continue only when the daemon is reachable, required permissions are granted, and `list_apps` returns a recognizable GUI application. A zero exit status alone is not readiness evidence.

For MCP operation, use the advertised `check_permissions` and `health_report` tools, then confirm that inspection tools such as `list_apps` are available.

## User-facing recovery messages

No CLI or MCP:

> Cua Driver is unavailable: no connected Cua Driver MCP server was found, and `cua-driver` is not on PATH. Install it using the official guide at https://cua.ai/docs/tutorials/drive-your-first-app, then verify it with `cua-driver status` and `cua-driver doctor`.

CLI present, MCP missing:

> Cua Driver is installed, but this host has no connected Cua Driver MCP server. Run `cua-driver mcp-config`, add exactly the emitted configuration to the host, reload the agent session, and confirm the Cua Driver tools are available.

macOS permissions missing:

> Cua Driver is installed, but Accessibility or Screen Recording permission is missing. Run `cua-driver permissions grant`, enable CuaDriver in both Privacy & Security sections, relaunch it if macOS requests that, then verify with `cua-driver permissions status` and `cua-driver doctor`.

Installed but unhealthy:

> Cua Driver is installed but not ready. Run `cua-driver status` and `cua-driver doctor`, then resolve the reported daemon, desktop-session, or permission issue before retrying.
