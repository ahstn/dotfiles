import {
  WatcherQueryError,
  requireWriteAccess,
  resolveChecks,
} from "./github.ts";
import type * as T from "./types.ts";
import { nonEmpty } from "./types.ts";
export function assessGitHubMerge(args: {
  readonly mergeStateStatus: T.MergeStateStatus;
  readonly headRollupState: T.RollupState;
  /**
   * Whether something the watcher already handles explains a BLOCKED state:
   * a review still owed, a pending check (the review gate included), or an
   * unresolved thread. Without one, BLOCKED is a hidden blocker, not READY.
   */
  readonly blockExplained: boolean;
  /** Unresolved threads the watcher deliberately parks (they don't block READY). */
  readonly parkedThreads?: boolean;
}): T.GitHubMergeAssessment {
  if (args.mergeStateStatus === "BLOCKED") {
    if (args.headRollupState === "ERROR" || args.headRollupState === "FAILURE")
      return {
        kind: "refused",
        mergeStateStatus: args.mergeStateStatus,
        headRollupState: args.headRollupState,
        cause: "failing-rollup",
      };
    if (!args.blockExplained)
      return {
        kind: "refused",
        mergeStateStatus: args.mergeStateStatus,
        headRollupState: args.headRollupState,
        cause: args.parkedThreads ? "open-conversations" : "unexplained-block",
      };
    return {
      kind: "allowed",
      basis: "rollup",
      mergeStateStatus: args.mergeStateStatus,
      headRollupState: args.headRollupState,
    };
  }
  return {
    kind: "allowed",
    basis: "merge-state",
    mergeStateStatus: args.mergeStateStatus,
    headRollupState: args.headRollupState,
  };
}
async function mergeAssessment(
  reader: T.GitHubReader,
  facts: T.PullRequestFacts,
  blockExplained: boolean,
  parkedThreads: boolean
) {
  const commits = await reader.commitRollups(facts.context);
  const headRollupState =
    facts.headRefOid === null
      ? null
      : (commits.find((commit) => commit.oid === facts.headRefOid)?.state ??
        null);
  return {
    hadPreviousPassingCi: commits.some(
      (commit) => commit.oid !== facts.headRefOid && commit.state === "SUCCESS"
    ),
    github: assessGitHubMerge({
      mergeStateStatus: facts.mergeStateStatus,
      headRollupState,
      blockExplained,
      parkedThreads,
    }),
  };
}
export const MERGEABILITY_PENDING = "(GitHub mergeability)";
export const ROLLUP_DISAGREES = "(GitHub check rollup)";
const AUTOMATION_TOKENS = [
  "bugbot",
  "security review",
  "pr review automation",
  "review automation",
] as const;
export async function readSnapshot(args: {
  readonly reader: T.GitHubReader;
  readonly context: T.PrContext;
  readonly pendingHistory: "include" | "omit";
  readonly allowDraft: boolean;
  readonly allowNoChecks?: boolean;
}): Promise<T.PrSnapshot> {
  // Threads and checks are read against whatever is current when each query
  // runs, so a push (or a base update) mid-snapshot could pair one revision's
  // mergeability with another's checks. Re-read both and start over if either moved.
  for (let attempt = 1; ; attempt += 1) {
    const facts = await args.reader.pullRequest(args.context);
    if (facts.state === "MERGED" || facts.mergedAt !== null)
      return { kind: "merged", context: args.context, facts };
    if (facts.state === "CLOSED")
      return { kind: "closed", context: args.context, facts };
    const snapshot = await readOpenOrConflict(args, facts);
    // Confirming reads come first and the field recheck comes last, so a push
    // landing during any of them is caught by the final comparison.
    let now: T.RecheckFacts;
    let confirmed = true;
    try {
      // Check activity moves none of the recheck fields. Before a clean CI
      // read can become READY, confirm no check has registered or failed.
      if (
        snapshot.kind === "open" &&
        snapshot.ci.kind === "ci-clean" &&
        !(
          await resolveChecks(args.reader, args.context, args.allowNoChecks)
        ).checks.every(
          (check) => check.kind !== "pending" && check.kind !== "failed"
        )
      )
        confirmed = false;
      // BEHIND stays BEHIND when an admin turns strict checks on or off, so
      // the rule result has to be re-read too.
      // Skipped for a partial snapshot (threads kept after a failed CI read),
      // which never read the rule: its verdict is the thread blocker anyway.
      if (
        snapshot.kind === "open" &&
        facts.mergeStateStatus === "BEHIND" &&
        snapshot.upToDateRequired !== undefined &&
        (await args.reader.upToDateRequired(args.context, facts.baseRefName)) !==
          snapshot.upToDateRequired
      )
        confirmed = false;
      now = await args.reader.recheck(args.context);
    } catch (error) {
      // A known conflict or actionable thread outranks a failed
      // lower-priority read.
      if (
        error instanceof WatcherQueryError &&
        (isConflicted(facts) ||
          (snapshot.kind === "open" && snapshot.threads.length > 0))
      )
        return snapshot;
      throw error;
    }
    // The base matters too: a base-branch update can create a conflict with
    // no new head commit. So do the gates: a PR closed, set to draft, or given
    // changes-requested mid-read would otherwise slip out as READY.
    if (sameFacts(facts, now) && confirmed) return snapshot;
    if (attempt >= HEAD_RACE_ATTEMPTS)
      throw new WatcherQueryError({
        kind: "head-moved",
        retryable: true,
        detail: `PR kept changing during ${attempt} snapshots (head ${facts.headRefOid} -> ${now.headRefOid}, base ${facts.baseRefOid} -> ${now.baseRefOid}, state ${facts.state} -> ${now.state}, checks/rules confirmed: ${confirmed})`,
      });
  }
}
/** Whether nothing a snapshot depends on moved between two fact reads. */
function sameFacts(facts: T.PullRequestFacts, now: T.RecheckFacts): boolean {
  return (
    now.headRefOid === facts.headRefOid &&
    now.baseRefOid === facts.baseRefOid &&
    now.state === facts.state &&
    now.isDraft === facts.isDraft &&
    now.reviewDecision === facts.reviewDecision &&
    now.mergedAt === facts.mergedAt &&
    // A review comment posted or edited after the thread read changes no
    // field above; updatedAt catches it before a stale READY goes out.
    now.updatedAt === facts.updatedAt &&
    // A ruleset or protection change can flip CLEAN to BLOCKED with nothing
    // else above moving.
    now.mergeStateStatus === facts.mergeStateStatus
  );
}
/**
 * Whether any row but the last (just validated) changed while later rows were
 * read: its facts moved, or, for a BEHIND row, the up-to-date rule flipped.
 * Stack verdicts (READY, and the status-only rows the playbook checks right
 * before resolving a thread) must not rest on a stale earlier row.
 */
async function earlierRowsMoved(
  reader: T.GitHubReader,
  rows: readonly T.PrSnapshot[]
): Promise<boolean> {
  for (const row of rows.slice(0, -1)) {
    if (!sameFacts(row.facts, await reader.recheck(row.context))) return true;
    if (
      row.kind === "open" &&
      row.facts.mergeStateStatus === "BEHIND" &&
      row.upToDateRequired !== undefined &&
      (await reader.upToDateRequired(row.context, row.facts.baseRefName)) !==
        row.upToDateRequired
    )
      return true;
  }
  return false;
}
/** The first conflict among rows already read; the top-tier verdict. */
function knownConflict(rows: readonly T.PrSnapshot[]): T.MergeBlocker | null {
  for (const row of rows) {
    const conflict = conflictBlocker(row);
    if (conflict !== null) return conflict;
  }
  return null;
}
// Back-to-back pushes are the only way to lose this race repeatedly; three
// tries absorbs a push-and-fixup, then the poll loop's backoff takes over.
const HEAD_RACE_ATTEMPTS = 3;
async function readOpenOrConflict(
  args: Parameters<typeof readSnapshot>[0],
  facts: T.PullRequestFacts
): Promise<T.PrSnapshot> {
  try {
    return await readOpenSnapshot(args, facts);
  } catch (error) {
    // A conflict outranks threads and CI, and is already known from facts, so a
    // failing lower-priority read (an API blip, or a repo with no checks) must
    // not hide it behind a query error.
    if (!(error instanceof WatcherQueryError) || !isConflicted(facts))
      throw error;
    return {
      kind: "open",
      context: args.context,
      facts,
      threads: [],
      parkedThreads: [],
      ci: unreadCi("(not read: merge conflict)", error.failure.detail),
      reviewAutomationRunning: false,
    };
  }
}
/** Stands in for CI that wasn't read because a higher-priority blocker is known. */
function unreadCi(name: string, detail: string): T.CiState {
  const unread: T.PendingCheck = {
    kind: "pending",
    name,
    reportedState: "PENDING",
    description: detail,
    link: "",
    workflow: "",
  };
  return {
    kind: "ci-pending",
    source: "graphql-rollup",
    all: [unread],
    failed: [],
    pending: [unread],
    hadPreviousPassingCi: false,
  };
}
const isConflicted = (facts: T.PullRequestFacts): boolean =>
  facts.mergeable === "CONFLICTING" ||
  facts.mergeStateStatus === "DIRTY" ||
  facts.mergeStateStatus === "CONFLICTING";
async function readOpenSnapshot(
  args: Parameters<typeof readSnapshot>[0],
  facts: T.PullRequestFacts
): Promise<T.PrSnapshot> {
  const allThreads = await requireWriteAccess(
    args.reader,
    args.context,
    await args.reader.reviewThreads(args.context)
  );
  const summaries = allThreads.map(
    ({ recentComments: _history, ...summary }): T.ReviewThreadSummary => summary
  );
  const threads = summaries.filter(
    (thread) => thread.disposition === "actionable"
  );
  const parkedThreads = summaries.filter(
    (thread) => thread.disposition !== "actionable"
  );
  try {
    const { ci, reviewAutomationRunning } = await readCi(
      args,
      facts,
      {
        blocking:
          threads.length +
          parkedThreads.filter((thread) => thread.disposition === "unverifiable")
            .length,
        parked: parkedThreads.filter(
          (thread) => thread.disposition !== "unverifiable"
        ).length,
      }
    );
    return {
      kind: "open",
      context: args.context,
      facts,
      threads,
      parkedThreads,
      ci,
      reviewAutomationRunning,
      ...(facts.mergeStateStatus === "BEHIND"
        ? {
            upToDateRequired: await args.reader.upToDateRequired(
              args.context,
              facts.baseRefName
            ),
          }
        : {}),
    };
  } catch (error) {
    // Threads outrank CI (see classifyPr), so a failed CI read (an API blip,
    // or a repo with no checks) must not hide actionable threads already found.
    if (!(error instanceof WatcherQueryError) || threads.length === 0)
      throw error;
    return {
      kind: "open",
      context: args.context,
      facts,
      threads,
      parkedThreads,
      ci: unreadCi("(not read: review threads first)", error.failure.detail),
      reviewAutomationRunning: false,
    };
  }
}
async function readCi(
  args: Parameters<typeof readSnapshot>[0],
  facts: T.PullRequestFacts,
  // Threads that themselves stop READY (actionable or unverifiable) explain a
  // BLOCKED state; parked ones don't, since READY would still go out.
  threadCounts: { readonly blocking: number; readonly parked: number }
): Promise<{ readonly ci: T.CiState; readonly reviewAutomationRunning: boolean }> {
  const checks = await resolveChecks(
    args.reader,
    args.context,
    args.allowNoChecks
  );
  const failed = nonEmpty(
    checks.checks.filter(
      (check): check is T.FailedCheck => check.kind === "failed"
    )
  );
  // GitHub reports UNKNOWN while it is still computing conflicts, typically
  // right after a push. Treat that as a pending check so the watcher polls
  // again instead of declaring READY before a conflict shows up.
  // mergeStateStatus UNKNOWN is the same "not computed yet", for the gates
  // (protection, rules) rather than the conflict check.
  const mergeability: T.PendingCheck[] =
    facts.mergeable === "UNKNOWN" || facts.mergeStateStatus === "UNKNOWN"
      ? [
          {
            kind: "pending",
            name: MERGEABILITY_PENDING,
            reportedState: "PENDING",
            description: "GitHub is still computing mergeability",
            link: "",
            workflow: "",
          },
        ]
      : [];
  const pending = nonEmpty([
    ...checks.checks.filter(
      (check): check is T.PendingCheck => check.kind === "pending"
    ),
    ...mergeability,
  ]);
  let ci: T.CiState;
  if (failed === null && pending !== null && args.pendingHistory === "omit")
    ci = {
      kind: "ci-pending",
      source: checks.source,
      all: checks.checks,
      failed: [],
      pending,
      hadPreviousPassingCi: false,
    };
  else {
    const merge = await mergeAssessment(
      args.reader,
      facts,
      facts.reviewDecision === "REVIEW_REQUIRED" ||
        facts.reviewDecision === "CHANGES_REQUESTED" ||
        threadCounts.blocking > 0 ||
        checks.checks.some(
          (check) => check.kind === "pending" || check.kind === "code-review-gate"
        ),
      threadCounts.parked > 0
    );
    const base = {
      source: checks.source,
      all: checks.checks,
      hadPreviousPassingCi: merge.hadPreviousPassingCi,
    };
    const rollup = merge.github.headRollupState;
    // The owner-approval gate is left out of pending on purpose, but the
    // commit rollup still counts it as PENDING. Only discount that when a
    // fresh read, taken after the rollup, shows the gate is the sole thing
    // outstanding: a workflow that started between the reads must still count.
    const rollupPending = rollup === "PENDING" || rollup === "EXPECTED";
    const gatePresent = checks.checks.some(
      (check) => check.kind === "code-review-gate"
    );
    // A second check read, taken after the rollup, whenever the first one is
    // about to be reported as failing or discounted for the gate: checks can
    // recover or start failing between reads, and the verdict must name
    // failures that still exist.
    const fresh =
      failed !== null || (rollupPending && gatePresent)
        ? (await resolveChecks(args.reader, args.context, args.allowNoChecks))
            .checks
        : null;
    const gateHoldsRollup =
      rollupPending &&
      gatePresent &&
      fresh !== null &&
      fresh.every((check) => check.kind !== "pending" && check.kind !== "failed");
    // A failing first read always gets a fresh read, taken after the rollup,
    // so it is the newest evidence: it alone decides whether a failure
    // remains. The rollup in between may predate a check that failed since.
    const failureGone =
      fresh !== null && !fresh.some((check) => check.kind === "failed");
    if (failed !== null && failureGone) {
      // The failure the first read saw is gone (rerun running, or green).
      // Poll again rather than send the agent after a failure that no longer
      // exists.
      const disagreement: T.PendingCheck = {
        kind: "pending",
        name: ROLLUP_DISAGREES,
        reportedState: rollup ?? "UNKNOWN",
        description: "checks failed but the commit rollup has since moved on",
        link: "",
        workflow: "",
      };
      ci = {
        ...base,
        all: [...base.all, disagreement],
        kind: "ci-pending",
        failed: [],
        pending: [disagreement],
      };
    } else if (failed !== null) {
      // When the fresh read was taken it is the current truth: report its
      // failures, not the first read's, which may have recovered meanwhile.
      const current =
        fresh === null
          ? failed
          : (nonEmpty(
              fresh.filter(
                (check): check is T.FailedCheck => check.kind === "failed"
              )
            ) ?? failed);
      ci = {
        ...(fresh === null ? base : { ...base, all: nonEmpty(fresh) ?? base.all }),
        kind: "ci-failing",
        failed: current,
        pending: pending ?? [],
        github: merge.github,
      };
    }
    else if (merge.github.kind === "refused")
      ci = {
        ...base,
        kind: "ci-github-rejected",
        failed: [],
        pending: pending ?? [],
        github: merge.github,
      };
    else if (pending !== null)
      ci = { ...base, kind: "ci-pending", failed: [], pending };
    else if (
      !gateHoldsRollup &&
      ((rollup !== null && rollup !== "SUCCESS") ||
        facts.mergeStateStatus === "UNSTABLE")
    ) {
      // The check list and the rollup are separate reads of the same commit,
      // so a retry or new workflow between them can leave a passing list next
      // to a pending or failing rollup. UNSTABLE (mergeable, but a commit
      // status isn't passing) says the same from the PR's side. Wait for a
      // poll where they agree rather than call it clean.
      const disagreement: T.PendingCheck = {
        kind: "pending",
        name: ROLLUP_DISAGREES,
        reportedState: rollup ?? facts.mergeStateStatus,
        description:
          facts.mergeStateStatus === "UNSTABLE"
            ? "checks passed but GitHub reports the merge state as UNSTABLE"
            : "checks passed but the commit rollup has not",
        link: "",
        workflow: "",
      };
      ci = {
        ...base,
        all: [...base.all, disagreement],
        kind: "ci-pending",
        failed: [],
        pending: [disagreement],
      };
    } else
      ci = {
        ...base,
        kind: "ci-clean",
        failed: [],
        pending: [],
        github: merge.github,
      };
  }
  return {
    ci,
    reviewAutomationRunning: checks.checks.some(
      (check) =>
        check.kind === "pending" &&
        AUTOMATION_TOKENS.some((token) =>
          check.name.toLowerCase().includes(token)
        )
    ),
  };
}
// BEHIND is reported when branch protection requires the branch to be up to
// date with its base: GitHub won't merge it, even with green checks. The fix
// is the same as for a conflict (merge the base, push), so it shares exit 2.
const conflictBlocker = (row: T.PrSnapshot): T.MergeBlocker | null =>
  row.kind === "open" &&
  (isConflicted(row.facts) ||
    (row.facts.mergeStateStatus === "BEHIND" && row.upToDateRequired === true))
    ? { kind: "merge-conflicts", pr: row.context, facts: row.facts }
    : null;
function threadBlocker(row: T.PrSnapshot): T.MergeBlocker | null {
  if (row.kind !== "open") return null;
  const threads = nonEmpty(row.threads);
  return threads === null
    ? null
    : { kind: "review-threads", pr: row.context, threads };
}
const ciBlocker = (row: T.PrSnapshot): T.MergeBlocker | null =>
  row.kind === "open" &&
  (row.ci.kind === "ci-failing" || row.ci.kind === "ci-github-rejected")
    ? {
        kind: "failing-checks",
        pr: row.context,
        headRefOid: row.facts.headRefOid,
        ci: row.ci,
      }
    : null;
function gateReason(
  row: T.PrSnapshot,
  allowDraft: boolean
): T.MergeGateReason | null {
  if (row.kind === "merged") return null;
  if (row.kind === "closed") return "closed-without-merge";
  if (row.facts.isDraft && !allowDraft) return "draft-pr";
  if (row.facts.reviewDecision === "CHANGES_REQUESTED")
    return "changes-requested";
  // Behind, and we couldn't tell whether the base requires up to date: a
  // human decides, rather than READY or an unneeded merge commit.
  if (
    row.kind === "open" &&
    row.facts.mergeStateStatus === "BEHIND" &&
    row.upToDateRequired === null
  )
    return "behind-base";
  if (
    row.kind === "open" &&
    row.parkedThreads.some((thread) => thread.disposition === "unverifiable")
  )
    return "unverifiable-thread";
  // A required approval is a human's job, not the agent's, and GitHub won't
  // merge without it: a gate, not READY.
  return row.facts.reviewDecision === "REVIEW_REQUIRED" ? "review-required" : null;
}
function gateBlocker(
  row: T.PrSnapshot,
  allowDraft: boolean
): T.MergeBlocker | null {
  const reason = gateReason(row, allowDraft);
  // Like a draft, a missing approval waits for CI to settle first, so a CI
  // failure still reaches the agent before the watch hands over to a human.
  return reason === null ||
    ((reason === "draft-pr" || reason === "review-required") &&
      row.kind === "open" &&
      row.ci.kind === "ci-pending")
    ? null
    : { kind: "merge-gate", pr: row.context, reason };
}
function readyContribution(
  row: T.PrSnapshot,
  allowDraft: boolean
): T.ReadyPr | T.MergedPr | null {
  if (row.kind === "merged")
    return {
      kind: "merged-pr",
      context: row.context,
      mergedAt: row.facts.mergedAt,
    };
  if (
    row.kind !== "open" ||
    row.ci.kind !== "ci-clean" ||
    row.threads.length !== 0 ||
    conflictBlocker(row) !== null ||
    gateReason(row, allowDraft) !== null
  )
    return null;
  const reviewDecision = row.facts.reviewDecision;
  if (
    reviewDecision === "CHANGES_REQUESTED" ||
    reviewDecision === "REVIEW_REQUIRED"
  )
    return null;
  return {
    kind: "ready-pr",
    context: row.context,
    proof: {
      mergeability: "clear",
      threads: [],
      ci: row.ci,
      gate: {
        state: "OPEN",
        reviewDecision,
        draft: row.facts.isDraft ? "draft-allowed" : "not-draft",
      },
    },
  };
}
export function classifyPr(
  row: T.PrSnapshot,
  allowDraft = false
): T.PrDecision {
  for (const blocker of [
    conflictBlocker(row),
    threadBlocker(row),
    ciBlocker(row),
    gateBlocker(row, allowDraft),
  ])
    if (blocker !== null) return { kind: "blocker", blocker };
  if (row.kind === "open" && row.ci.kind === "ci-pending")
    return { kind: "waiting", frontier: row.context, pending: row.ci.pending };
  const ready = readyContribution(row, allowDraft);
  if (ready === null) throw new Error("snapshot has no classified decision");
  return ready.kind === "merged-pr"
    ? { kind: "merged", pr: ready }
    : { kind: "ready", pr: ready };
}
export function selectTierMajorStackDecision(
  rows: T.NonEmpty<T.PrSnapshot>,
  allowDraft = false
): T.StackDecision {
  for (const tier of [conflictBlocker, threadBlocker, ciBlocker])
    for (const row of rows) {
      const blocker = tier(row);
      if (blocker !== null) return { kind: "blocker", blocker };
    }
  for (const row of rows) {
    const blocker = gateBlocker(row, allowDraft);
    if (blocker !== null) return { kind: "blocker", blocker };
  }
  for (const row of rows)
    if (row.kind === "open" && row.ci.kind === "ci-pending")
      return {
        kind: "waiting",
        frontier: row.context,
        pending: row.ci.pending,
      };
  const prs = nonEmpty(
    rows
      .map((row) => readyContribution(row, allowDraft))
      .filter((row): row is T.ReadyPr | T.MergedPr => row !== null)
  );
  if (prs === null || prs.length !== rows.length)
    throw new Error("stack has no classified decision");
  return { kind: "clear", prs };
}
export const queryBackoffSeconds = (
  interval: number,
  failures: number
): number => Math.min(Math.max(interval, 60) * 2 ** (failures - 1), 300);
interface Envelope<M extends T.WatchMode> {
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly observedAt: string;
  readonly mode: M;
}
type Payload<V> = V extends unknown
  ? Omit<V, keyof Envelope<T.WatchMode>>
  : never;
type VerdictPayload = Payload<T.WatcherVerdict>;
export interface VerdictStamp<M extends T.WatchMode = T.WatchMode> {
  <const P extends VerdictPayload>(payload: P): Envelope<M> & P;
  <const P extends VerdictPayload, M2 extends T.WatchMode>(
    payload: P,
    mode: M2
  ): Envelope<M2> & P;
}
export function verdictFactory<M extends T.WatchMode>(
  clock: WatchClock,
  mode: M
): VerdictStamp<M> {
  let sequence = 0;
  function stamp<const P extends VerdictPayload>(payload: P): Envelope<M> & P;
  function stamp<const P extends VerdictPayload, M2 extends T.WatchMode>(
    payload: P,
    mode: M2
  ): Envelope<M2> & P;
  function stamp<const P extends VerdictPayload>(
    payload: P,
    override?: T.WatchMode
  ): Envelope<T.WatchMode> & P {
    return {
      schemaVersion: 1,
      sequence: (sequence += 1),
      observedAt: clock.observedAt(),
      mode: override ?? mode,
      ...payload,
    };
  }
  return stamp;
}
function blockerVerdict(
  stamp: VerdictStamp,
  blocker: T.MergeBlocker
): T.BlockerVerdict {
  switch (blocker.kind) {
    case "merge-conflicts":
      return stamp({ kind: "BLOCKER", terminal: true, exitCode: 2, blocker });
    case "review-threads":
      return stamp({ kind: "BLOCKER", terminal: true, exitCode: 3, blocker });
    case "failing-checks":
      return stamp({ kind: "BLOCKER", terminal: true, exitCode: 4, blocker });
    case "merge-gate":
      return stamp({ kind: "BLOCKER", terminal: true, exitCode: 6, blocker });
    default: {
      const exhaustive: never = blocker;
      return exhaustive;
    }
  }
}
export function statusQueryVerdict(
  stamp: VerdictStamp,
  failures: number,
  failure: T.QueryFailure
): T.BlockerVerdict {
  return stamp({
    kind: "BLOCKER",
    terminal: true,
    exitCode: 7,
    blocker: { kind: "status-query", failures, failure },
  });
}
export interface WatchClock {
  now(): number;
  observedAt(): string;
  sleep(seconds: number): Promise<void>;
}
export interface RunDependencies {
  readonly reader: T.GitHubReader;
  readonly clock: WatchClock;
  readonly emit: (verdict: T.ProgressVerdict) => void;
}
const deadlinePassed = (
  started: number,
  options: T.PollingOptions,
  now: number
): boolean => options.timeout > 0 && now - started >= options.timeout;
// Sleeps never run past --timeout, so a run sized for a tool's time limit ends
// on time even mid-backoff; the next step then hits the deadline check.
const untilDeadline = (
  seconds: number,
  started: number,
  options: T.PollingOptions,
  now: number
): number =>
  options.timeout > 0
    ? Math.max(0, Math.min(seconds, options.timeout - (now - started)))
    : seconds;
type StepResult<V> =
  | { readonly kind: "terminal"; readonly verdict: V }
  | {
      readonly kind: "sleep";
      readonly seconds: number;
      readonly onDeadline?: () => V;
    }
  | { readonly kind: "continue"; readonly onDeadline?: () => V };
async function pollUntilTerminal<V>(args: {
  readonly dependencies: RunDependencies;
  readonly options: T.PollingOptions;
  readonly stamp: VerdictStamp;
  readonly step: () => Promise<StepResult<V>>;
}): Promise<V | T.BlockerVerdict | T.TimeoutVerdict> {
  let failures = 0;
  const started = args.dependencies.clock.now();
  while (true) {
    let result: StepResult<V>;
    try {
      result = await args.step();
      failures = 0;
    } catch (error) {
      if (!(error instanceof WatcherQueryError)) throw error;
      failures += 1;
      if (!error.failure.retryable || failures >= args.options.maxQueryErrors)
        return statusQueryVerdict(args.stamp, failures, error.failure);
      const retryInSeconds = queryBackoffSeconds(
        args.options.interval,
        failures
      );
      args.dependencies.emit(
        args.stamp({
          kind: "RETRY",
          terminal: false,
          failure: error.failure,
          consecutiveFailures: failures,
          retryInSeconds,
        })
      );
      if (deadlinePassed(started, args.options, args.dependencies.clock.now()))
        return args.stamp({
          kind: "TIMEOUT",
          terminal: true,
          exitCode: 5,
          reason: { kind: "status-unavailable", failure: error.failure },
        });
      await args.dependencies.clock.sleep(
        untilDeadline(
          retryInSeconds,
          started,
          args.options,
          args.dependencies.clock.now()
        )
      );
      // A capped sleep ends exactly at the deadline; starting another full
      // snapshot then would overrun --timeout.
      if (deadlinePassed(started, args.options, args.dependencies.clock.now()))
        return args.stamp({
          kind: "TIMEOUT",
          terminal: true,
          exitCode: 5,
          reason: { kind: "status-unavailable", failure: error.failure },
        });
      continue;
    }
    if (result.kind === "terminal") return result.verdict;
    if (
      result.kind === "continue" &&
      result.onDeadline !== undefined &&
      deadlinePassed(started, args.options, args.dependencies.clock.now())
    )
      return result.onDeadline();
    if (result.kind === "sleep") {
      if (
        result.onDeadline !== undefined &&
        deadlinePassed(started, args.options, args.dependencies.clock.now())
      )
        return result.onDeadline();
      await args.dependencies.clock.sleep(
        untilDeadline(
          result.seconds,
          started,
          args.options,
          args.dependencies.clock.now()
        )
      );
      if (
        result.onDeadline !== undefined &&
        deadlinePassed(started, args.options, args.dependencies.clock.now())
      )
        return result.onDeadline();
    }
  }
}
export async function runSimple(args: {
  readonly dependencies: RunDependencies;
  readonly contexts: T.NonEmpty<T.PrContext>;
  readonly mode: T.WatchMode;
  readonly statusOnly: boolean;
  readonly options: T.PollingOptions;
  /** Continue a caller's sequence numbers (the CLI's discovery retries). */
  readonly stamp?: VerdictStamp;
}): Promise<T.TerminalVerdict> {
  const stamp = args.stamp ?? verdictFactory(args.dependencies.clock, args.mode);
  const started = args.dependencies.clock.now();
  const step = async (): Promise<StepResult<T.TerminalVerdict>> => {
    const rows: T.PrSnapshot[] = [];
    for (const context of args.contexts) {
      // A large or slow --stack can cross --timeout mid-scan; stop between
      // PRs instead of reading the rest.
      if (
        rows.length > 0 &&
        deadlinePassed(started, args.options, args.dependencies.clock.now())
      ) {
        // Conflicts are the top tier and rows are read bottom-to-top, so a
        // conflict already seen is the right verdict even for a partial scan;
        // timing out would discard it on every run of a slow stack.
        const conflict = knownConflict(rows);
        if (conflict !== null)
          return { kind: "terminal", verdict: blockerVerdict(stamp, conflict) };
        return {
          kind: "terminal",
          verdict: stamp({
            kind: "TIMEOUT",
            terminal: true,
            exitCode: 5,
            reason: {
              kind: "stack-scan",
              read: rows.length,
              total: args.contexts.length,
            },
          }),
        };
      }
      try {
        rows.push(
          await readSnapshot({
            reader: args.dependencies.reader,
            context,
            pendingHistory: "include",
            allowDraft: args.options.allowDraft,
            allowNoChecks: args.options.allowNoChecks,
          })
        );
      } catch (error) {
        // Same rule as the deadline: a later PR's failed read must not hide
        // a conflict already found lower in the stack.
        const conflict =
          error instanceof WatcherQueryError ? knownConflict(rows) : null;
        if (conflict !== null)
          return { kind: "terminal", verdict: blockerVerdict(stamp, conflict) };
        throw error;
      }
    }
    const complete = nonEmpty(rows);
    if (complete === null) throw new Error("watch context cannot be empty");
    const rescan: StepResult<T.TerminalVerdict> = {
      kind: "continue",
      onDeadline: () =>
        stamp({
          kind: "TIMEOUT",
          terminal: true,
          exitCode: 5,
          reason: {
            kind: "stack-scan",
            read: rows.length,
            total: args.contexts.length,
          },
        }),
    };
    if (args.statusOnly && (await earlierRowsMoved(args.dependencies.reader, rows)))
      return rescan;
    if (args.statusOnly)
      return {
        kind: "terminal",
        verdict: stamp({
          kind: "STATUS",
          terminal: true,
          exitCode: 0,
          reason: "status-only",
          rows: complete,
        }),
      };
    if (args.mode === "queued-stack")
      throw new Error("queued-stack requires status-only in the simple runner");
    if (args.mode === "stack")
      args.dependencies.emit(
        stamp(
          { kind: "STATUS", terminal: false, reason: "poll", rows: complete },
          args.mode
        )
      );
    const decision =
      args.mode === "single"
        ? classifyPr(complete[0], args.options.allowDraft)
        : selectTierMajorStackDecision(complete, args.options.allowDraft);
    if (decision.kind === "blocker")
      return {
        kind: "terminal",
        verdict: blockerVerdict(stamp, decision.blocker),
      };
    if (decision.kind === "ready" || decision.kind === "merged")
      return {
        kind: "terminal",
        verdict: stamp(
          {
            kind: "READY",
            terminal: true,
            exitCode: 0,
            scope: { kind: "single", pr: decision.pr },
          },
          args.mode
        ),
      };
    // Each row was validated as it was read, but earlier rows can change
    // while later ones are read. Before calling a whole stack READY, check
    // them again; if any moved, scan again.
    if (
      decision.kind === "clear" &&
      (await earlierRowsMoved(args.dependencies.reader, rows))
    )
      return rescan;
    if (decision.kind === "clear")
      return {
        kind: "terminal",
        verdict: stamp(
          {
            kind: "READY",
            terminal: true,
            exitCode: 0,
            scope: { kind: "stack", prs: decision.prs },
          },
          args.mode
        ),
      };
    args.dependencies.emit(
      stamp({
        kind: "WAITING",
        terminal: false,
        frontier: decision.frontier,
        reason: { kind: "pending-checks", pending: decision.pending },
      })
    );
    return {
      kind: "sleep",
      seconds: args.options.interval,
      onDeadline: () =>
        stamp({
          kind: "TIMEOUT",
          terminal: true,
          exitCode: 5,
          reason: { kind: "pending-checks", pending: decision.pending },
        }),
    };
  };
  return pollUntilTerminal({
    dependencies: args.dependencies,
    options: args.options,
    stamp,
    step,
  });
}
export type QueueWork =
  | {
      readonly kind: "whole-stack-sweep";
      readonly remaining: T.NonEmpty<T.PrContext>;
    }
  | { readonly kind: "frontier-poll"; readonly frontier: T.PrContext };
export interface QueueState {
  readonly queue: T.NonEmpty<T.PrContext>;
  readonly snapshots: ReadonlyMap<T.PrNumber, T.PrSnapshot>;
  readonly work: QueueWork | null;
  readonly nextSweepAt: number;
  readonly frontier: T.PrContext | null;
  readonly lastWaitKey: string | null;
  readonly startedAt: number;
}
export const createQueueState = (
  queue: T.NonEmpty<T.PrContext>,
  now: number
): QueueState => ({
  queue,
  snapshots: new Map(),
  work: { kind: "whole-stack-sweep", remaining: queue },
  nextSweepAt: now,
  frontier: null,
  lastWaitKey: null,
  startedAt: now,
});
const orderedRows = (state: QueueState): T.PrSnapshot[] =>
  state.queue.flatMap((context) => {
    const row = state.snapshots.get(context.number);
    return row === undefined ? [] : [row];
  });
const activeRows = (state: QueueState): T.PrSnapshot[] =>
  orderedRows(state).filter((row) => row.kind !== "merged");
export function planQueue(state: QueueState, now: number): QueueState {
  if (state.work !== null) return state;
  if (state.snapshots.size === 0 || now >= state.nextSweepAt) {
    const remaining = nonEmpty(
      state.queue.filter(
        (context) => state.snapshots.get(context.number)?.kind !== "merged"
      )
    );
    if (remaining !== null)
      return { ...state, work: { kind: "whole-stack-sweep", remaining } };
  }
  const frontier = activeRows(state)[0]?.context;
  return frontier === undefined
    ? state
    : { ...state, work: { kind: "frontier-poll", frontier } };
}
export interface QueueSnapshotResult {
  readonly state: QueueState;
  readonly completedSweepRows: T.NonEmpty<T.PrSnapshot> | null;
}
export function applyQueueSnapshot(
  state: QueueState,
  snapshot: T.PrSnapshot,
  now: number,
  options: T.PollingOptions
): QueueSnapshotResult {
  if (state.work === null) throw new Error("queue has no read in flight");
  const snapshots = new Map(state.snapshots);
  snapshots.set(snapshot.context.number, snapshot);
  const base = { ...state, snapshots };
  if (state.work.kind === "frontier-poll")
    return { state: { ...base, work: null }, completedSweepRows: null };
  const [head, ...tail] = state.work.remaining;
  if (head.number !== snapshot.context.number)
    throw new Error("snapshot does not match sweep head");
  const remaining = nonEmpty(tail);
  if (remaining !== null)
    return {
      state: { ...base, work: { kind: "whole-stack-sweep", remaining } },
      completedSweepRows: null,
    };
  const rows = nonEmpty(
    state.queue.flatMap((context) => {
      const row = snapshots.get(context.number);
      return row === undefined ? [] : [row];
    })
  );
  if (rows === null || rows.length !== state.queue.length)
    throw new Error("sweep completed without every snapshot");
  return {
    state: { ...base, work: null, nextSweepAt: now + options.sweepInterval },
    completedSweepRows: rows,
  };
}
export type QueueEvaluation =
  | {
      readonly kind: "complete";
      readonly state: QueueState;
      readonly merged: T.NonEmpty<T.MergedPr>;
    }
  | {
      readonly kind: "blocker";
      readonly state: QueueState;
      readonly blocker: T.MergeBlocker;
    }
  | {
      readonly kind: "advance";
      readonly state: QueueState;
      readonly merged: T.PrContext;
      readonly frontier: T.PrContext;
      readonly remaining: number;
    }
  | {
      readonly kind: "timeout";
      readonly state: QueueState;
      readonly frontier: T.PrContext;
      readonly unmergedCount: number;
    }
  | {
      readonly kind: "waiting";
      readonly state: QueueState;
      readonly frontier: T.PrContext;
      readonly reason:
        | {
            readonly kind: "pending-checks";
            readonly pending: T.NonEmpty<T.PendingCheck>;
          }
        | { readonly kind: "merge-queue"; readonly unmergedCount: number };
      readonly emit: boolean;
    };
export function evaluateQueue(
  state: QueueState,
  now: number,
  options: T.PollingOptions
): QueueEvaluation {
  const active = activeRows(state);
  if (active.length === 0) {
    const merged = nonEmpty(
      orderedRows(state).flatMap((row) =>
        row.kind === "merged"
          ? [
              {
                kind: "merged-pr" as const,
                context: row.context,
                mergedAt: row.facts.mergedAt,
              },
            ]
          : []
      )
    );
    if (merged === null) throw new Error("empty queue cannot complete");
    return { kind: "complete", state, merged };
  }
  const rows = nonEmpty(active);
  if (rows === null) throw new Error("active queue cannot be empty");
  const decision = selectTierMajorStackDecision(rows, options.allowDraft);
  if (decision.kind === "blocker")
    return { kind: "blocker", state, blocker: decision.blocker };
  const frontier = rows[0].context;
  if (state.frontier !== null && state.frontier.number !== frontier.number)
    return {
      kind: "advance",
      state: { ...state, frontier, lastWaitKey: null },
      merged: state.frontier,
      frontier,
      remaining: active.length,
    };
  if (deadlinePassed(state.startedAt, options, now))
    return {
      kind: "timeout",
      state: { ...state, frontier },
      frontier,
      unmergedCount: active.length,
    };
  const row = rows[0];
  const pending =
    row.kind === "open" && row.ci.kind === "ci-pending" ? row.ci.pending : null;
  const reason =
    pending === null
      ? ({ kind: "merge-queue", unmergedCount: active.length } as const)
      : ({ kind: "pending-checks", pending } as const);
  const key =
    reason.kind === "pending-checks"
      ? `pending:${frontier.number}:${reason.pending.length}`
      : `queue:${frontier.number}:${reason.unmergedCount}`;
  return {
    kind: "waiting",
    state: { ...state, frontier, lastWaitKey: key },
    frontier,
    reason,
    emit: state.lastWaitKey !== key,
  };
}
export async function runQueued(args: {
  readonly dependencies: RunDependencies;
  readonly contexts: T.NonEmpty<T.PrContext>;
  readonly options: T.PollingOptions;
  readonly stamp?: VerdictStamp;
}): Promise<T.QueueTerminalVerdict> {
  let state = createQueueState(args.contexts, args.dependencies.clock.now());
  const stamp =
    args.stamp ?? verdictFactory(args.dependencies.clock, "queued-stack");
  args.dependencies.emit(
    stamp({ kind: "QUEUE", terminal: false, queue: args.contexts })
  );
  const step = async (): Promise<StepResult<T.QueueTerminalVerdict>> => {
    state = planQueue(state, args.dependencies.clock.now());
    if (state.work === null) {
      const complete = evaluateQueue(
        state,
        args.dependencies.clock.now(),
        args.options
      );
      if (complete.kind !== "complete")
        throw new Error("queue has no work while active");
      return {
        kind: "terminal",
        verdict: stamp({
          kind: "COMPLETE",
          terminal: true,
          exitCode: 0,
          queue: state.queue,
          merged: complete.merged,
        }),
      };
    }
    const context =
      state.work.kind === "whole-stack-sweep"
        ? state.work.remaining[0]
        : state.work.frontier;
    let snapshot: T.PrSnapshot;
    try {
      snapshot = await readSnapshot({
        reader: args.dependencies.reader,
        context,
        pendingHistory: "omit",
        allowDraft: args.options.allowDraft,
        allowNoChecks: args.options.allowNoChecks,
      });
    } catch (error) {
      // As in runSimple: a later PR's failed read must not hide a conflict
      // already recorded lower in the queue.
      const recorded = state.queue.flatMap((pr) => {
        const row = state.snapshots.get(pr.number);
        return row === undefined ? [] : [row];
      });
      const conflict =
        error instanceof WatcherQueryError ? knownConflict(recorded) : null;
      if (conflict !== null)
        return { kind: "terminal", verdict: blockerVerdict(stamp, conflict) };
      throw error;
    }
    const applied = applyQueueSnapshot(
      state,
      snapshot,
      args.dependencies.clock.now(),
      args.options
    );
    state = applied.state;
    if (applied.completedSweepRows !== null)
      args.dependencies.emit(
        stamp({
          kind: "STATUS",
          terminal: false,
          reason: "whole-stack-sweep",
          rows: applied.completedSweepRows,
        })
      );
    if (state.work !== null) {
      // A large or slow stack can cross --timeout mid-sweep; stop between
      // PRs rather than reading the rest.
      const snapshotState = state;
      // The lowest PR not known to be merged, in queue order. During the first
      // sweep state.frontier isn't set yet, and the next unread PR isn't the
      // frontier when one below it was already read and is still open.
      const lowestUnmerged =
        state.queue.find(
          (pr) => snapshotState.snapshots.get(pr.number)?.kind !== "merged"
        ) ?? state.queue[0];
      return {
        kind: "continue",
        onDeadline: () => {
          // As in runSimple: a conflict already read is the top-tier verdict
          // even for a partial sweep, and timing out would hide it on every
          // run of a stack that never finishes a sweep in time.
          for (const pr of snapshotState.queue) {
            const row = snapshotState.snapshots.get(pr.number);
            const conflict = row === undefined ? null : conflictBlocker(row);
            if (conflict !== null) return blockerVerdict(stamp, conflict);
          }
          return stamp({
            kind: "TIMEOUT",
            terminal: true,
            exitCode: 5,
            reason: {
              kind: "queued-stack",
              frontier: snapshotState.frontier ?? lowestUnmerged,
              unmergedCount: snapshotState.queue.filter(
                (pr) => snapshotState.snapshots.get(pr.number)?.kind !== "merged"
              ).length,
            },
          });
        },
      };
    }
    const evaluation = evaluateQueue(
      state,
      args.dependencies.clock.now(),
      args.options
    );
    state = evaluation.state;
    switch (evaluation.kind) {
      case "complete":
        return {
          kind: "terminal",
          verdict: stamp({
            kind: "COMPLETE",
            terminal: true,
            exitCode: 0,
            queue: state.queue,
            merged: evaluation.merged,
          }),
        };
      case "blocker":
        return {
          kind: "terminal",
          verdict: blockerVerdict(stamp, evaluation.blocker),
        };
      case "advance":
        args.dependencies.emit(
          stamp({
            kind: "ADVANCE",
            terminal: false,
            merged: evaluation.merged,
            frontier: evaluation.frontier,
            remaining: evaluation.remaining,
          })
        );
        return {
          kind: "continue",
          // The snapshot that saw the merge may itself have crossed the
          // deadline; don't read the new frontier past it.
          onDeadline: () =>
            stamp({
              kind: "TIMEOUT",
              terminal: true,
              exitCode: 5,
              reason: {
                kind: "queued-stack",
                frontier: evaluation.frontier,
                unmergedCount: activeRows(evaluation.state).length,
              },
            }),
        };
      case "timeout":
        return {
          kind: "terminal",
          verdict: stamp({
            kind: "TIMEOUT",
            terminal: true,
            exitCode: 5,
            reason: {
              kind: "queued-stack",
              frontier: evaluation.frontier,
              unmergedCount: evaluation.unmergedCount,
            },
          }),
        };
      case "waiting":
        if (evaluation.emit)
          args.dependencies.emit(
            stamp({
              kind: "WAITING",
              terminal: false,
              frontier: evaluation.frontier,
              reason: evaluation.reason,
            })
          );
        return {
          kind: "sleep",
          // Wake for the next whole-stack sweep if it's due before the next
          // frontier poll, so a long --interval can't postpone it.
          seconds: Math.max(
            0,
            Math.min(
              args.options.interval,
              evaluation.state.nextSweepAt - args.dependencies.clock.now()
            )
          ),
          // Without this the poll loop would wake at the deadline and read
          // another snapshot (or a whole sweep) before evaluateQueue times out.
          onDeadline: () =>
            stamp({
              kind: "TIMEOUT",
              terminal: true,
              exitCode: 5,
              reason: {
                kind: "queued-stack",
                frontier: evaluation.frontier,
                unmergedCount: activeRows(evaluation.state).length,
              },
            }),
        };
      default: {
        const exhaustive: never = evaluation;
        return exhaustive;
      }
    }
  };
  return pollUntilTerminal({
    dependencies: args.dependencies,
    options: args.options,
    stamp,
    step,
  });
}
