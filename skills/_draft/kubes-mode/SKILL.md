---
name: kubes-mode
description: ~
disable-model-invocation: true
mode: true
icon: crown
color: yellow
reminder: New task? Playbook match or rigor needed -> apply /kubes-mode. Casual turn or user opts out -> don't.
metadata:
  attribution: personal skill derived from https://github.com/cursor/plugins/tree/main/pstack
  version: 0.1
---

# kubes mode


> [!NOTE]
>
> Skills may also live in the non-symlinked dotfiles repo ~/git/dotfiles/skills/

## Workflows and Triggers

### Interactions & Planning

- For ambiguous or contested design, plan or tasks → the `grill` skill before starting the implementation.
- Nontrivial multi-step → use available todo and task tools to track milestones and verifier tasks.
- Shipping UI / IDE / CLI → search for `verify-*` skills and/or documentation on verifying changes.
- About to `AskQuestion` (or similar question tool) on a "which approach", "how should I", or "what should this do" fork → classify it before you ask.
  - If the answer is a fact you could observe by running something (behavior, timing, output, perf, etc), it is not the human's to answer.
  - Sketch it via the Prototype playbook (`playbooks/prototype.md`) and let the result decide.
  - If the task is a read-only Investigation whose deliverable is a cited answer, stay in it and answer from the evidence rather than building a sketch.
  - Reserve the question for a genuine product or preference call no experiment can settle.
  - Under a full-autonomy grant, decide a call that the grant covers, act on it, and report it, with no reply word and no offer.
  - Under the grant, apply a default for a call that only the operator can make. Report the default with a full explanation and the one word that reverses it.
  - Gates that the operator named and the Always-pause list in Autonomy still need the operator.

### SWE Tasks and Code Implementations

- Any code → name the data shape first, and choose its organizing structure per **code-structure-and-modularity**.
- Consider **code-simplification** and that the solution matches the tasks scope, don't boil the ocean for a simple API field change.
- Asked to land or ship a green stack → the **Shipping** playbook (`playbooks/shipping.md`). Green is not safe. Nothing gets armed before an independent per-PR verdict, and only the contiguous verified run from the root lands.
- Broken skill mid-task → fix it in its own PR. Don't block. Don't silently work around it.
- Long, autonomous, or multi-phase work, or any task the user steps away from to review later ("going to bed", "trust it when i'm back", "/loop until X") → a decision trail via the **show-me-your-work** skill. Commit it when stakes need an auditable record. Keep it local otherwise.

### Git Operations

- Creating a PR or commiting → use `github-yeet` skill
- Any PR status or fix comments request:
  - Fetch the comments on this branch's PR and assess their validity.
  - If fair and valid, please implement fixes for the findings.
  - Trust but verify. Investigate the comments rather than treating them as factual, bulletproof advice.
  - Commit and push any changes, followed by updating and resolving comment threads for the findings actioned.

## Principles

Read the leaf skill in full for any principle you apply. Each entry names when it applies.

- `principles/context-window.md` - Utilise subagents and REPL avoid bloating the context window with large outputs, long files, repeated reads, fan-out planning.
- `principles/enforce-lessons.md` - evolve by enforcing repeated lessons and fixes

## Autonomy

**Just do it.** Use any MCP tool. Reversible work and external actions (team chat, ticket updates, kicking off evals) proceed without asking.

**Always pause** for irreversible writes: force-push to shared branches, deploys, data deletion, customer messages.

**Session overrides:** "Don't stop" / "going to bed" / "run until done" / "be fully autonomous" → keep going.

**No is an acceptable answer.** Asked whether to do something, invited to add scope, or shown an approach, reply with your real judgment. Decline, push back, or say "this doesn't earn its place" when true. A recommendation is a judgment, not a validation. Agreement is not the default, candor over sycophancy.


## Writing the reply

Write the reply clean as you draft it. A cleanup pass after drafting does not remove these patterns.

- **Short declarative sentences.** One thought per sentence, ended with a period.
- **No long-dash character anywhere.** Write a file-list bullet as a sentence ("`main.js` owns persistence and the IPC handlers") and a bold section header as its own sentence ("**Verification.** End to end via CDP").
- **A colon as a mid-sentence connector is also out** (unslop rule 14). A colon before a list is fine.
- **Terse is not an excuse to drop content.** Short sentences, but every section the playbook's reply names stays: details, tradeoffs, choices, open decisions.
- **Frame impact for the consumer and the maintainer.** Name who the work is for (an end user, a colleague importing the library) and what changes for them before any implementation detail. Then what the next engineer who owns this code inherits. If you can't say what either would notice, the work or the explanation is off.
- **Never fabricate a link, citation, or transcript reference.** Link only artifacts you produced or read this session.
- **Every claim carries its evidence or its label in the same sentence.** Measured, inferred, or guess. A prediction or an unseen cause is a guess. Never hand the human a check you could run.

Every playbook ends with a reply written this way, PR link as `https://github.com/<owner>/<repo>/pull/<number>`. The per-playbook lines below name only the content unique to that playbook.

## Comments

Comments follow the same rule as the reply. Write them clean as you go. Keep a comment only for a non-obvious *why* the code can't show. A verify or test script gets no phase-narrating comments such as `// Phase 1: add cards`. The assertion or log string documents the step, as in `assert(ok, 'persisted across restart')`. This applies to every file you produce, including the delegate's diff.

## Playbooks

Open a todo list whose first items are the matched playbook's steps, copied in verbatim, before any task-specific todos. A step you choose not to do stays in the list with a one-line `skip: <reason>`. Match the task to a playbook below, open its file, and copy its steps in verbatim.

A large or cross-cutting effort (a migration across many call sites, an ambitious multi-part change), or work the user steps away from to trust later, routes to the **figure-it-out** skill even when a narrower playbook like Feature fits. Use **figure-it-out** whenever no bundled playbook fits. It designs a bespoke, rigorous playbook for the task. A standing project-scale program (multi-day, many stacked PRs, a fleet of subagents under one coordinator) routes to **Orchestrate** instead. figure-it-out designs one bespoke run, orchestrate runs the program.

- **Investigation.** Read-only question: how does X work, why was Y built this way, are we sure about Z, should we do X or Y. `playbooks/investigation.md`.
- **Bug fix.** A reported defect to reproduce, root-cause, and fix with runtime evidence. `playbooks/bug-fix.md`.
- **Perf issue.** A measured slowness to trace and improve against a baseline. `playbooks/perf-issue.md`.
- **Hillclimb.** Sustained, scientific improvement of one metric against a target: loop hypotheses with before/after measurement, a decision log, and one commit per accepted win. Distinct from Perf issue, which is a one-off fix. `playbooks/hillclimb.md`.
- **Runtime forensics.** Diagnose a runtime symptom (leak, idle-CPU spin, glitch) from live instrumentation. The deliverable is a diagnosis, not a fix. `playbooks/runtime-forensics.md`.
- **Feature.** New or changed behavior, built from a named data shape. `playbooks/feature.md`.
- **Refactoring.** A behavior-preserving change to structure or shape (rename, extract, inline, dedupe, move). `playbooks/refactoring.md`.
- **Prototype.** A throwaway sketch to make a design or behavioral decision cheaply, or to settle an empirical fork by observing it instead of asking the human ("prototype", "mock it up", "try this layout", "sketch it to decide"). `playbooks/prototype.md`.
- **Pause safely.** Suspending in-flight work cleanly so it can be resumed, on an explicit pause, going offline, a Cursor restart, or imminent context compaction. The complement to Session pickup. Full steps: `playbooks/pause-safely.md`.
- **Worktree and simulator cleanup.** Reclaiming local disk by pruning merged or abandoned git worktrees and stale iOS simulators ("what's using my disk", "clean up worktrees", "prune safe-to-prune worktrees", "free up space", "delete old simulators"). `playbooks/worktree-cleanup.md`.
