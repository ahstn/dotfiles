## "Custom" Extensions

- From [badlogic/pi-mono]:
    - [`.pi/agent/extensions/handoff.ts`] - extract current session to a hand-off prompt and open it in a new session.
    - [`.pi/agent/extensions/notify.ts`] - send desktop notifications when waiting for input
- From [mitsuhiko/agent-stuff]:
    - [`.pi/agent/extensions/summarize.ts`] - summarize the current session/thread.

- Personal:
    - [.pi/agent/extensions/skill-autocomplete.ts] - press `$` in the editor to open an autocomplete menu of loaded skills.

## Packages

https://pi.dev/packages

- [MasuRii/pi-permission-system] - permissions linked to [`.pi/agent/pi-permissions.jsonc`]
- [ayagmar/pi-extmgr] - UI for managing extensions.
- [nicobailon/pi-subagents] - Powerful sub-agent system with recursion and pipelining support
    - Alternatives: [tintinweb/pi-subagents] and [pasky/pi-side-agents]
- [pi-token-burden] - Claude-like context command with granular token counts per tool, mcp, etx
    - Alternatives: [pi-context]

<!-- Reference Links -->

[`.pi/agent/extensions/handoff.ts`]: ./.pi/agent/extensions/handoff.ts
[`.pi/agent/extensions/notify.ts`]: ./.pi/agent/extensions/notify.ts
[`.pi/agent/extensions/summarize.ts`]: ./.pi/agent/extensions/summarize.ts
[`.pi/agent/pi-permissions.jsonc`]: ./.pi/agent/pi-permissions.jsonc
[`.pi/agent/extensions/skill-autocomplete.ts`]: ./.pi/agent/extensions/skill-autocomplete.ts

[badlogic/pi-mono]: https://github.com/badlogic/pi-mono
[mitsuhiko/agent-stuff]: https://github.com/mitsuhiko/agent-stuff
[MasuRii/pi-permission-system]: https://github.com/MasuRii/pi-permission-system
[ayagmar/pi-extmgr]: https://github.com/ayagmar/pi-extmgr
[nicobailon/pi-subagents]: https://github.com/nicobailon/pi-subagents
[pi-context]: https://github.com/ttttmr/pi-context
[pi-token-burden]: https://github.com/Whamp/pi-token-burden

[tintinweb/pi-subagents]: https://x.com/nicht_tintin/status/2031119030224920979
[pasky/pi-side-agents]: https://x.com/xpasky/status/2028273594782855267
