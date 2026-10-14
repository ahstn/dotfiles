# Model-selected coordination agents

A separate OpenCode server plugin for model-selected workers, frozen system
instructions, and two-way peer messages. No new agent definition/profile files
are needed: each worker reuses the caller's current profile and starts a fresh
conversation on the explicitly requested model.

**Requires OpenCode 2.0.29.** The plugin needs its public permission-assert API
and fails closed before registering tools on older hosts. The running/global
CLI is not upgraded by this change. SDK and test CLI dependencies are pinned;
only the local CLI package's postinstall is trusted for isolated verification.

## Tools and handles

```json
{"model":"openai/gpt-6.1-sol","description":"Review authentication","prompt":"Review authentication for correctness; message me with questions."}
```

Pass that input to `agent_spawn`, using a model explicitly requested by the user.
It returns an opaque `agent://<session-id>` handle immediately. It does not take
an agent-name argument or select a model automatically.

- `agent_send`: `{ "target": "agent://<id>", "message": "…", "delivery": "steer" }`.
  Delivery defaults to `steer`; `queue` preserves queued input order. Both the
  parent and a managed worker can address one another. `agent://all` broadcasts
  to managed peers and the root, excluding the sender.
- `agent_status`: inspect one handle or omit `target` to list the family.
- `agent_stop`: interrupt a descendant, preserving its transcript and inbox.
  A worker cannot stop the root, siblings, or itself; returning a final response
  is how it finishes its own task. Stopping an already settled worker is a no-op.
- `read agent://<id>`: published output, or status/progress before publication.
  A previous run's output is clearly marked as stale while a follow-up runs.
- `read agent://<id>/findings/0/path`: slash-separated extraction from published
  JSON. String values return as prose; other values return as JSON. Missing
  fields return `null`; non-JSON or unpublished output produces an error.
- `write agent://<id>`: send the verbatim `content` as a peer message. GPT models
  may not expose `write`; use `agent_send`, which works independently of that.

`agent://all` is broadcast-only, not a readable document. Handles identify
executions/sessions, not predefined agent profiles. There is no autocomplete
dropdown, friendly-name/dotted-ID mapping, virtual glob/grep tree, or URI file
attachment adapter in this version. Agent outputs cannot be edited or patched.

## Prompt and authority inheritance

The context hook retains the parent's request draft until `model.request`, so
later parent-context edits are included. At spawn, its system parts are copied
into the worker record. Each child request replaces its model's default system
parts with that frozen snapshot. Conversation history is **not** copied; the
child's identity, parent handle, and task are supplied as a user message.

The child also intersects its current tool catalog with the parent's captured
tool names. It uses the same profile and inherits only session-specific rule
overrides; resolved global/agent rules are not copied into session overrides
that could defeat later policy changes. Provider restrictions and native tool
permissions still apply. Other plugins deliberately rewriting child context
after this plugin can override prompt inheritance; order those transforms
before this plugin when exact reuse is required. Provider-native lowering may
also differ across model families, so use a compatible tool-capable model.

Spawning checks both native `subagent` and `agent_spawn` permissions against the
model reference. Messages check `agent_send` against each destination handle.
Reads check both `read` and `agent_read`; write aliases also require `edit`.
Cancellation checks `agent_stop`. Normal configured asks/denials are respected;
the plugin never auto-approves them.

The coordination family consists of the root and workers created by this
plugin. Foreign roots and unmanaged native subagents are rejected, even if
they share a directory. Moving workers/roots across locations is unsupported.
Peer messages carry verified sender attribution and are user/task data, never
system instructions or permission grants.

## Bounds, lifecycle, and persistence

Defaults: `maxDepth: 1`, `maxActive: 8`, `maxMessages: 64`. Positive integer
plugin options can override these. Tasks/messages are limited to 32 KiB;
published output is retained up to 1 MiB. Larger results must be inspected in
the native transcript. Reads use native-style line numbering, paging, and
50 KiB/2,000-line bounds.

Worker state and frozen prompts are stored in OpenCode's plugin storage. Treat
that storage with the same confidentiality as session transcripts. Session
removal cleans up corresponding snapshots, worker references, and outgoing
message fingerprints. Concurrent mutations in one runtime are family-serialized.
Message admission uses stable IDs and fingerprints for safe replay of the same
tool call; reusing it with changed content fails. A broadcast can still be
partially delivered if a later recipient fails.

Delivery intent is reserved before counters change. Each counter and its
operation marker are saved in the same worker record, so restart/replay repairs
partial updates without counting them twice. Pending intents reserve sender
quota even if the counter save did not finish. Native admission failures leave
the reserved turn pending for retry or explicit cancellation; acknowledgement
storage failures do not undo an already admitted native message.

Live completion events append a **status-only** parent notification and wake
the parent. Output remains behind read permission checks rather than being
quoted into the notification. Superseded runs do not report a terminal result;
shutdown does not wake models. Event-stream interruptions can lose a live
notification. After restart, explicit read/status/capacity checks reconcile
native outcomes without automatically waking or restarting agents.
Failed-outcome reconciliation preserves the newest native idle/assistant error
for that request, rather than replacing provider/tool details with a generic
failure. Errors older than the current request are not reused.

This uses real provider requests outside tests: spawning, messaging an idle
worker, and waking a parent can all incur costs. Native spend controls and
agent-step limits remain important; these bounds are not a global token budget.

## Verification

From this package directory:

```sh
mise exec -- bun install --frozen-lockfile
mise exec -- bun run typecheck
mise exec -- bun test
mise exec -- bun run smoke
```

The smoke test uses the package-local 2.0.29 binary, an isolated temporary
OpenCode service/database/config, and a deterministic loopback-only provider.
It verifies actual model selection, both message directions, URI JSON reads,
permission denial, foreign-family rejection, exact transmitted system reuse,
and coexistence with the skill URL plugin. No live provider credentials or
global installation changes are needed.
