# Multi-phase or multi-PR plan

Own the plan, not implementation. Each PR is one independently verifiable unit; the operator audits its evidence.

1. Skip a program plan for a small, obvious change; explain why a short task plan is sufficient.
2. Read affected code paths, callers, conventions, and verification commands. Delegate independent research when it saves context. Use `playbooks/prototype.md` for empirical uncertainties and `grill` for material unresolved choices; ask only for decisions evidence cannot settle.
3. Fill the skeleton below at the operator's path or a suitable project planning location. Keep its headings, sub-blocks, verification rule, and audit prompt exactly; repeat the PR section per unit and fill every placeholder. Record prototype artifacts and alternatives in the appendices.
4. **Gate.** Run `node scripts/check-plan.mjs <plan.md>` relative to this skill directory and resolve its findings before handoff, because the checklist must be executable rather than an outline.
5. **Gate.** Hand back the plan and stop. Execution and `/goal` arming begin only on the operator's explicit go; a plan request is not permission to ship.

**Verification.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are checked or marked n/a with a reason. Live verification is required for user-facing surfaces. Every verification sub-block opens with that exact rule. Unit checks name commands and cases; live checks name scenarios, artifacts, and pass predicates. Perf checks are required when performance is affected and otherwise state n/a with a reason. Compare the load-bearing scenario at base and head where useful; if the base lacks the feature, record that and check the added behavior and end state instead of claiming equivalence.

Use the project's verify-* skill or documented verification path; otherwise drive the real surface yourself (CLI run, browser, test harness). Run only the independent live scenarios needed for coverage, not a fixed worker count. Operator review is required for product choices or interaction changes that need approval; other PRs explain why no operator review gate applies.

```markdown
# <Program> plan

<What changes, for whom, the governing invariant, and PR ids in order. Keep under ten lines.>

## How to read this

One box is one unit of work. Every box names the evidence that checks it. Check a box only when its evidence exists: a file, log, screenshot, test run, or SHA. Nested boxes are sub-steps. Use `playbooks/<applicable-playbook>.md` for each unit; <who implements, reviews, and merges>.

Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are checked or marked n/a with a reason. Live verification is required for user-facing surfaces.

## Program checklist

### Arm the program

- [ ] Present the protocol and plan to the operator; stop until explicit go.
- [ ] On the operator's go, arm `/goal` with "<Plan path, PR order, verification rule, merge authority, stop conditions, and done condition>." If unsupported, persist the same goal in the harness's task state or handoff note.
- [ ] Arm a 30-minute audit tick using the harness's scheduled wake mechanism, such as `/loop` when available. If none exists, disclose that limit and agree a manual cadence before unattended work.
- [ ] Use this tick prompt verbatim: "Re-read the plan, applicable playbooks, and armed goal. Audit execution against them and fix drift. Check active work by observable evidence; stop or replace stuck work when authorized. Report only newly observed tracked changes, new or cleared blockers, and decisions requiring the operator. If nothing changed, send no status message."
- [ ] On hold or stand-down, tell every active owner to stop writes and collect a safe handoff.

### Assign owners and dependencies

- [ ] <One owner per PR; own implementation, review coordination, verification, and evidence. Use delegates only when useful.>
- [ ] <Dependency graph and base branches. Start independent units together only when writes are disjoint; dependent work waits for its parent or explicitly stacks on it.>
- [ ] <File boundaries, shared interfaces, and operator-review-gated PR ids.>

### PR mechanics

- [ ] <Record shipping authorization, forge tooling, PR base, and merge authority. Use github-yeet only when the user asked to ship.>
- [ ] <Run documented lint, typecheck, and regression commands before a PR-facing push; preserve hooks.>
- [ ] <Review the diff with code-review-and-quality. Status requests are read-only; fixing comments means assess validity, fix valid findings, push when authorized, and resolve addressed threads.>

### Verdict and merge

- [ ] <Audit evidence at the exact head SHA. Invalidate affected receipts after patch changes and re-run those checks.>
- [ ] <Require passing applicable checks and completed review gates before merge. Record who merges and when a unit stops at merge-ready.>

### Live verification setup

- [ ] <Check out the exact head in an isolated worktree when needed; start the backend and surface and wait for ready. Or state n/a with a reason if all units have no user-facing surface.>
- [ ] <Name the project's verify-* skill or documented verification path; otherwise name the real CLI, browser, or test harness and artifact directory.>

## <Task as a verb phrase> (<PR id>)

**Depends on.** <PR id or None.>

**Files.**
- [ ] <Edit, create, or delete exact paths.>

**Build.**
- [ ] <One change with its symbol and file.>

**You see.**
- [ ] <Observable result with its log line, output, or screen state.>

**Verify, unit.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are checked or marked n/a with a reason. Live verification is required for user-facing surfaces.
- [ ] <Test file, case, command, and evidence path; or n/a. Specific reason.>

**Verify, live.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are checked or marked n/a with a reason. Live verification is required for user-facing surfaces.
- [ ] Scope. <user-facing or not-user-facing, and the affected surface or reason.>
- [ ] Scenario. <Drive the load-bearing path at the head and compare the base when useful.> Save `<artifact path>`. Pass when <predicate>. <Repeat for necessary scenarios; replace scenario boxes with n/a. Specific reason only for not-user-facing scope.>

**Verify, perf.** Tests alone are not sufficient verification. A PR is verified only when its unit, live, and perf boxes are checked or marked n/a with a reason. Live verification is required for user-facing surfaces.
- [ ] Metric. <Comparable metric and workload.>
- [ ] Probe. <Repeatable command or procedure at base and head, interleaved when noise matters.>
- [ ] Baseline. <Record base value before changes and artifact path.>
- [ ] Rule. <Regression threshold or absolute budget when a base comparison is invalid. Replace all four boxes with n/a. Specific reason if performance is unaffected.>

**Review gate.** <Operator review required, or None. Specific reason.>
- [ ] <Show the operator screenshots, output, or recordings appropriate to the changed surface; wait for approval before merge. Omit this box when the gate is None.>

**Merge.**
- [ ] <Review and verification evidence at exact head SHA, addressed valid comments, base/conflict checks, and authorized merge action or merge-ready handoff.>

## Close the program

- [ ] Every applicable box has evidence; n/a boxes have reasons. Report unmet criteria rather than marking them complete.
- [ ] <Summarize delivered units, verification, unresolved risks, and merge state for the operator.>

## Appendix A. Prototype evidence

<Questions answered, branch/SHA when applicable, artifact paths, and what remains unproven; or None with reason.>

## Appendix B. Alternatives rejected

<Approaches weighed and why they lost; or None with reason.>

## Appendix C. Risks

<Risk, affected PR, trigger to watch, and mitigation; or None with reason.>

## Appendix D. Links and reading list

<Source pointers, docs to read, applicable skills, and evidence or decision log locations.>
```

**Reply:** plan path, PR ids and dependencies, operator-review-gated units, prototype findings and unknowns, and checker output.
