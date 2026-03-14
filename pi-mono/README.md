## Custom Extensions

- From [badlogic/pi-mono]:
    - [`.pi/agent/extensions/handoff.ts`] - extract current session to a hand-off prompt and open it in a new session.
    - [`.pi/agent/extensions/notify.ts`] - send desktop notifications when waiting for input
- From [mitsuhiko/agent-stuff]:
    - [`.pi/agent/extensions/summarize.ts`] - summarize the current session/thread.

## Packages

https://pi.dev/packages

- [MasuRii/pi-permission-system] - permissions linked to [`.pi/agent/pi-permissions.jsonc`](./.pi/agent/pi-permissions.jsonc)
- [ayagmar/pi-extmgr](https://github.com/ayagmar/pi-extmgr) - UI for managing extensions.
- [nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents) - Sub agents
    - Alternatives: [tintinweb/pi-subagents(https://x.com/nicht_tintin/status/2031119030224920979) and [pasky/pi-side-agents](https://x.com/xpasky/status/2028273594782855267)
- [pi-context](https://github.com/ttttmr/pi-context) - Claude-like context command and agent managed context windows


[`.pi/agent/extensions/handoff.ts`]: ./.pi/agent/extensions/handoff.ts
[`.pi/agent/extensions/notify.ts`]: ./.pi/agent/extensions/notify.ts
[`.pi/agent/extensions/summarize.ts`]: ./.pi/agent/extensions/summarize.ts

[badlogic/pi-mono]: https://github.com/badlogic/pi-mono
[mitsuhiko/agent-stuff]: https://github.com/mitsuhiko/agent-stuff
[MasuRii/pi-permission-system]: https://github.com/MasuRii/pi-permission-system