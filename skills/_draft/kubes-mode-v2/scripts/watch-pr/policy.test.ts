import { describe, expect, it } from "bun:test";
import { AUTOFIX_REPLY_MARKER, WatcherQueryError } from "./github.ts";
import {
  applyQueueSnapshot,
  assessGitHubMerge,
  classifyPr,
  createQueueState,
  evaluateQueue,
  planQueue,
  queryBackoffSeconds,
  readSnapshot,
  runQueued,
  runSimple,
  selectTierMajorStackDecision,
} from "./policy.ts";
import {
  fakeReader,
  failedCheck,
  passingCheck,
  pendingCheck,
} from "./fakes.test-helper.ts";
import type {
  Check,
  GitHubReader,
  NonEmpty,
  PollingOptions,
  PrContext,
  ProgressVerdict,
  PullRequestFacts,
  ReviewThread,
  RollupState,
} from "./types.ts";
import { parsePrNumber } from "./types.ts";

const context = (number: number): PrContext => ({
  owner: "owner",
  repo: "repo",
  number: parsePrNumber(number),
});
const options = {
  interval: 10,
  sweepInterval: 300,
  timeout: 0,
  maxQueryErrors: 5,
  allowDraft: false,
} satisfies PollingOptions;

describe("readiness truth table", () => {
  it("covers every specified row and every UNKNOWN rollup value", () => {
    const cases: readonly [
      PullRequestFacts["mergeStateStatus"],
      RollupState,
      "allowed" | "refused",
      boolean?,
    ][] = [
      ["BLOCKED", "FAILURE", "refused"],
      ["BLOCKED", "ERROR", "refused"],
      ["BLOCKED", "PENDING", "allowed"],
      // A required check that never reported: BLOCKED, nothing to explain it.
      ["BLOCKED", "SUCCESS", "refused", false],
      ["BLOCKED", "PENDING", "refused", false],
      ["UNSTABLE", "FAILURE", "allowed"],
      ["UNKNOWN", "ERROR", "allowed"],
      ["UNKNOWN", "EXPECTED", "allowed"],
      ["UNKNOWN", "FAILURE", "allowed"],
      ["UNKNOWN", "PENDING", "allowed"],
      ["UNKNOWN", "SUCCESS", "allowed"],
      ["UNKNOWN", null, "allowed"],
      ["CLEAN", "SUCCESS", "allowed"],
    ];
    for (const [mergeStateStatus, headRollupState, expected, blockExplained = true] of cases) {
      expect(
        assessGitHubMerge({ mergeStateStatus, headRollupState, blockExplained })
          .kind
      ).toBe(expected);
    }
  });

  it("keeps a confirmed check failure when the rollup read fails", async () => {
    const base = fakeReader({
      fastPath: { kind: "checks", checks: [failedCheck("unit")] },
    });
    const snapshot = await readSnapshot({
      reader: {
        ...base,
        async commitRollups() {
          throw new WatcherQueryError({
            kind: "command-exit",
            retryable: true,
            code: 1,
            detail: "GraphQL unavailable",
          });
        },
      },
      context: context(1),
      pendingHistory: "include",
      allowDraft: false,
    });
    if (snapshot.kind !== "open") throw new Error("expected open snapshot");
    expect(snapshot.ci).toMatchObject({
      kind: "ci-failing",
      github: null,
      hadPreviousPassingCi: false,
    });
    expect(classifyPr(snapshot)).toMatchObject({
      kind: "blocker",
      blocker: { kind: "failing-checks" },
    });
  });

  it("keeps waiting on a visible pending check when the rollup read fails", async () => {
    const base = fakeReader({
      fastPath: { kind: "checks", checks: [pendingCheck("unit")] },
    });
    const snapshot = await readSnapshot({
      reader: {
        ...base,
        async commitRollups() {
          throw new WatcherQueryError({
            kind: "command-exit",
            retryable: true,
            code: 1,
            detail: "GraphQL unavailable",
          });
        },
      },
      context: context(1),
      pendingHistory: "include",
      allowDraft: false,
    });
    if (snapshot.kind !== "open") throw new Error("expected open snapshot");
    expect(snapshot.ci).toMatchObject({ kind: "ci-pending", hadPreviousPassingCi: false });
  });

  it("lets a merge-queue base's BLOCKED through, but not a failing rollup", async () => {
    const read = (state: "SUCCESS" | "FAILURE") =>
      readSnapshot({
        reader: fakeReader({
          facts: { mergeStateStatus: "BLOCKED" },
          fastPath: { kind: "checks", checks: [passingCheck()] },
          commitRollups: [{ oid: "head", state }],
          mergeQueueEnabled: true,
        }),
        context: context(1),
        pendingHistory: "include",
        allowDraft: false,
      });
    const queued = await read("SUCCESS");
    if (queued.kind !== "open") throw new Error("expected open snapshot");
    expect(queued.ci).toMatchObject({
      kind: "ci-clean",
      github: { kind: "allowed", basis: "merge-queue" },
    });
    expect(classifyPr(queued).kind).toBe("ready");
    const failing = await read("FAILURE");
    if (failing.kind !== "open") throw new Error("expected open snapshot");
    expect(failing.ci.kind).toBe("ci-github-rejected");
  });

  it("skips the merge-queue lookup when the refusal is already known", async () => {
    for (const [state, parked] of [["FAILURE", false], ["FAILURE", true]] as const) {
      const base = fakeReader({
        facts: { mergeStateStatus: "BLOCKED" },
        fastPath: { kind: "checks", checks: [passingCheck()] },
        commitRollups: [{ oid: "head", state }],
        ...(parked
          ? {
              threads: [
                {
                  id: "t",
                  firstComment: null,
                  recentComments: [],
                  historyComplete: true,
                  decidingComment: null,
                  lastAuthorLogin: null,
                  latestCommentAt: null,
                  disposition: "untrusted" as const,
                  isBugbot: false,
                  bugbotReviewPasses: 0,
                },
              ],
            }
          : {}),
      });
      const snapshot = await readSnapshot({
        reader: {
          ...base,
          async mergeQueueRules() {
            throw new WatcherQueryError({
              kind: "command-exit",
              retryable: true,
              code: 1,
              detail: "should not be asked",
            });
          },
        },
        context: context(1),
        pendingHistory: "include",
        allowDraft: false,
      });
      if (snapshot.kind !== "open") throw new Error("expected open snapshot");
      expect(snapshot.ci).toMatchObject({
        kind: "ci-github-rejected",
        github: { cause: "failing-rollup" },
      });
    }
  });

  it("re-reads merge-queue policy before calling a BLOCKED PR clean", async () => {
    let lookups = 0;
    const base = fakeReader({
      facts: { mergeStateStatus: "BLOCKED" },
      fastPath: { kind: "checks", checks: [passingCheck()] },
      commitRollups: [{ oid: "head", state: "SUCCESS" }],
    });
    const snapshot = await readSnapshot({
      reader: {
        ...base,
        // An admin turns the queue off right after the first lookup.
        async mergeQueueRules() {
          lookups += 1;
          return lookups === 1
            ? { requiredChecks: [], threadResolutionRequired: false }
            : null;
        },
      },
      context: context(1),
      pendingHistory: "include",
      allowDraft: false,
    });
    if (snapshot.kind !== "open") throw new Error("expected open snapshot");
    expect(snapshot.ci).toMatchObject({
      kind: "ci-github-rejected",
      github: { cause: "unexplained-block" },
    });
  });

  it("re-reads a GitHub refusal whose rollup recovers before the snapshot settles", async () => {
    let rollups = 0;
    const base = fakeReader({
      facts: { mergeStateStatus: "BLOCKED" },
      fastPath: { kind: "checks", checks: [passingCheck()] },
      mergeQueueEnabled: true,
    });
    const snapshot = await readSnapshot({
      reader: {
        ...base,
        async commitRollups() {
          rollups += 1;
          return [{ oid: "head", state: rollups === 1 ? "FAILURE" : "SUCCESS" }];
        },
      },
      context: context(1),
      pendingHistory: "include",
      allowDraft: false,
    });
    if (snapshot.kind !== "open") throw new Error("expected open snapshot");
    expect(snapshot.ci).toMatchObject({
      kind: "ci-clean",
      github: { basis: "merge-queue" },
    });
  });

  it("reports a check that turns up failing behind a GitHub refusal", async () => {
    let checkReads = 0;
    const base = fakeReader({
      facts: { mergeStateStatus: "BLOCKED" },
      commitRollups: [{ oid: "head", state: "FAILURE" }],
    });
    const snapshot = await readSnapshot({
      reader: {
        ...base,
        async checksFastPath() {
          checkReads += 1;
          return {
            kind: "checks",
            checks: [checkReads === 1 ? passingCheck("unit") : failedCheck("unit")],
          };
        },
      },
      context: context(1),
      pendingHistory: "include",
      allowDraft: false,
    });
    if (snapshot.kind !== "open") throw new Error("expected open snapshot");
    expect(snapshot.ci.kind).toBe("ci-failing");
  });

  it("doesn't let a merge queue explain BLOCKED while a required check is missing", async () => {
    const snapshot = await readSnapshot({
      reader: fakeReader({
        facts: { mergeStateStatus: "BLOCKED" },
        fastPath: { kind: "checks", checks: [passingCheck("unit")] },
        commitRollups: [{ oid: "head", state: "SUCCESS" }],
        mergeQueueEnabled: true,
        // A required check that never reported.
        queueRequiredChecks: ["unit", "e2e"],
      }),
      context: context(1),
      pendingHistory: "include",
      allowDraft: false,
    });
    if (snapshot.kind !== "open") throw new Error("expected open snapshot");
    expect(snapshot.ci).toMatchObject({
      kind: "ci-github-rejected",
      github: { cause: "unexplained-block" },
    });
  });

  it("re-reads the rollup before calling a BLOCKED queue PR clean", async () => {
    let rollups = 0;
    const base = fakeReader({
      facts: { mergeStateStatus: "BLOCKED" },
      fastPath: { kind: "checks", checks: [passingCheck()] },
      mergeQueueEnabled: true,
    });
    const snapshot = await readSnapshot({
      reader: {
        ...base,
        // The rollup fails right after the first read; the list stays clean.
        async commitRollups() {
          rollups += 1;
          return [{ oid: "head", state: rollups === 1 ? "SUCCESS" : "FAILURE" }];
        },
      },
      context: context(1),
      pendingHistory: "include",
      allowDraft: false,
    });
    if (snapshot.kind !== "open") throw new Error("expected open snapshot");
    expect(snapshot.ci).toMatchObject({
      kind: "ci-github-rejected",
      github: { cause: "failing-rollup" },
    });
  });

  it("lets queue rules decide whether a parked conversation blocks", async () => {
    const untrusted = {
      id: "drive-by",
      firstComment: null,
      recentComments: [],
      historyComplete: true,
      decidingComment: null,
      lastAuthorLogin: null,
      latestCommentAt: null,
      disposition: "untrusted" as const,
      isBugbot: false,
      bugbotReviewPasses: 0,
    };
    const read = async (threadResolution: boolean) => {
      const snapshot = await readSnapshot({
        reader: fakeReader({
          facts: { mergeStateStatus: "BLOCKED" },
          fastPath: { kind: "checks", checks: [passingCheck()] },
          commitRollups: [{ oid: "head", state: "SUCCESS" }],
          threads: [untrusted],
          mergeQueueEnabled: true,
          queueThreadResolution: threadResolution,
        }),
        context: context(1),
        pendingHistory: "include",
        allowDraft: false,
      });
      if (snapshot.kind !== "open") throw new Error("expected open snapshot");
      return snapshot.ci;
    };
    expect(await read(false)).toMatchObject({
      kind: "ci-clean",
      github: { basis: "merge-queue" },
    });
    expect(await read(true)).toMatchObject({
      kind: "ci-github-rejected",
      github: { cause: "open-conversations" },
    });
  });

  it("turns a clean visible list plus GitHub refusal into an explicit CI blocker", async () => {
    const reader = fakeReader({
      facts: { mergeStateStatus: "BLOCKED" },
      fastPath: { kind: "checks", checks: [passingCheck()] },
      commitRollups: [{ oid: "head", state: "FAILURE" }],
    });
    const snapshot = await readSnapshot({
      reader,
      context: context(1),
      pendingHistory: "include",
      allowDraft: false,
    });
    expect(snapshot.kind).toBe("open");
    if (snapshot.kind !== "open") throw new Error("expected open snapshot");
    expect(snapshot.ci.kind).toBe("ci-github-rejected");
    expect(classifyPr(snapshot)).toMatchObject({
      kind: "blocker",
      blocker: { kind: "failing-checks" },
    });
  });
});

describe("snapshot query planning", () => {
  it("does not query commit rollups while queued checks are pending", async () => {
    const reader = fakeReader({
      fastPath: { kind: "checks", checks: [pendingCheck()] },
    });
    const snapshot = await readSnapshot({
      reader,
      context: context(2),
      pendingHistory: "omit",
      allowDraft: false,
    });
    expect(snapshot.kind).toBe("open");
    if (snapshot.kind !== "open") throw new Error("expected open snapshot");
    expect(snapshot.ci.kind).toBe("ci-pending");
    expect(reader.calls).toEqual([
      "pullRequest",
      "reviewThreads",
      "checksFastPath",
      "recheck",
    ]);
  });

  it("queries rollups for settled and failed lists", async () => {
    const settled = fakeReader();
    await readSnapshot({
      reader: settled,
      context: context(3),
      pendingHistory: "omit",
      allowDraft: false,
    });
    expect(settled.calls).toContain("commitRollups");

    const failed = fakeReader({
      fastPath: { kind: "checks", checks: [failedCheck()] },
    });
    await readSnapshot({
      reader: failed,
      context: context(4),
      pendingHistory: "omit",
      allowDraft: false,
    });
    expect(failed.calls).toContain("commitRollups");
  });

  it("short-circuits merged rows before threads and checks", async () => {
    const reader = fakeReader({
      facts: { state: "MERGED", mergedAt: "2026-07-26T00:00:00Z" },
    });
    expect(
      (
        await readSnapshot({
          reader,
          context: context(5),
          pendingHistory: "include",
          allowDraft: false,
        })
      ).kind
    ).toBe("merged");
    expect(reader.calls).toEqual(["pullRequest"]);
  });
});

it("blocks on actionable threads only; parked threads still allow READY", async () => {
  const thread = (id: string, disposition: ReviewThread["disposition"]) => ({
    id,
    firstComment: null,
    recentComments: [],
    historyComplete: true,
    decidingComment: null,
    lastAuthorLogin: null,
    latestCommentAt: null,
    disposition,
    isBugbot: false,
    bugbotReviewPasses: 0,
  });
  const decide = async (threads: readonly ReviewThread[]) =>
    classifyPr(
      await readSnapshot({
        reader: fakeReader({ threads }),
        context: context(9),
        pendingHistory: "include",
        allowDraft: false,
      })
    ).kind;
  expect(
    await decide([
      thread("answered", "awaiting-reviewer"),
      thread("drive-by", "untrusted"),
    ])
  ).toBe("ready");
  expect(await decide([thread("fix-me", "actionable")])).toBe("blocker");
});

it("demotes threads from read-only members and collaborators", async () => {
  const thread = (login: string, authorAssociation: string): ReviewThread => ({
    id: login,
    firstComment: {
      authorLogin: login,
      body: "change this",
      path: null,
      line: null,
      createdAt: "now",
      activityAt: "now",
      authorAssociation,
      authorIsBot: false,
      isViewer: false,
    },
    recentComments: [],
    historyComplete: true,
    decidingComment: null,
    lastAuthorLogin: login,
    latestCommentAt: "now",
    disposition: "actionable",
    isBugbot: false,
    bugbotReviewPasses: 0,
  });
  const reader = fakeReader({
    threads: [
      thread("writer", "MEMBER"),
      thread("reader", "MEMBER"),
      thread("forker-cannot-check", "COLLABORATOR"),
      thread("owner", "OWNER"),
    ],
    writers: { writer: true, reader: false, "forker-cannot-check": null },
  });
  const snapshot = await readSnapshot({
    reader,
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  if (snapshot.kind !== "open") throw new Error("expected open");
  expect(snapshot.threads.map((t) => t.id)).toEqual(["writer", "owner"]);
  expect(snapshot.parkedThreads.map((t) => [t.id, t.disposition])).toEqual([
    ["reader", "untrusted"],
    ["forker-cannot-check", "untrusted"],
  ]);
  // Drive-by text never reaches a verdict, even as a parked thread.
  expect(JSON.stringify(snapshot.parkedThreads)).not.toContain("change this");
  expect(reader.calls).not.toContain("permission:owner");
});

it("skips replies from read-only members when deciding a thread", async () => {
  const comment = (
    login: string,
    authorAssociation: string,
    body: string,
    at: string
  ): ReviewThread["recentComments"][number] => ({
    authorLogin: login,
    body,
    path: null,
    line: null,
    createdAt: at,
    activityAt: at,
    authorAssociation,
    authorIsBot: false,
    isViewer: login === "me",
  });
  const opener = comment("rev", "COLLABORATOR", "fix this", "2026-01-01T00:00:00Z");
  const answer = comment(
    "me",
    "OWNER",
    `done\n${AUTOFIX_REPLY_MARKER}`,
    "2026-01-02T00:00:00Z"
  );
  const snapshot = await readSnapshot({
    reader: fakeReader({
      threads: [
        {
          id: "t",
          firstComment: opener,
          recentComments: [
            opener,
            answer,
            comment(
              "lurker",
              "MEMBER",
              "actually rewrite it",
              "2026-01-03T00:00:00Z"
            ),
          ],
          historyComplete: true,
          decidingComment: null,
          lastAuthorLogin: "lurker",
          latestCommentAt: "lurker",
          disposition: "actionable",
          isBugbot: false,
          bugbotReviewPasses: 0,
        },
      ],
      writers: { rev: true, lurker: false },
    }),
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  if (snapshot.kind !== "open") throw new Error("expected open");
  expect(snapshot.threads).toEqual([]);
  expect(snapshot.parkedThreads[0]?.disposition).toBe("awaiting-reviewer");
  expect(snapshot.parkedThreads[0]?.latestCommentAt).toBe("2026-01-02T00:00:00Z");
  expect(JSON.stringify(snapshot.parkedThreads)).not.toMatch(/fix this|done|rewrite/);
});

it("reports a known conflict even when later reads fail", async () => {
  const snapshot = await readSnapshot({
    reader: fakeReader({
      facts: { mergeable: "CONFLICTING", mergeStateStatus: "DIRTY" },
      fastPath: { kind: "unusable", exitCode: 1, stderr: "no checks reported" },
    }),
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  const decision = classifyPr(snapshot);
  expect(decision.kind === "blocker" && decision.blocker.kind).toBe(
    "merge-conflicts"
  );
});

it("re-reads the snapshot when the head moves mid-read", async () => {
  const base = fakeReader();
  let heads = ["b", "b"];
  let facts = 0;
  const reader: GitHubReader = {
    ...base,
    async pullRequest(pr) {
      facts += 1;
      return { ...(await base.pullRequest(pr)), headRefOid: facts === 1 ? "a" : "b" };
    },
    async recheck(pr) {
      return { ...(await base.recheck(pr)), headRefOid: heads.shift() ?? "b" };
    },
  };
  const snapshot = await readSnapshot({
    reader,
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(facts).toBe(2);
  expect(snapshot.kind === "open" && snapshot.facts.headRefOid).toBe("b");
});

it("keeps a known conflict when the head re-check fails", async () => {
  const base = fakeReader({
    facts: { mergeable: "CONFLICTING", mergeStateStatus: "DIRTY" },
  });
  const snapshot = await readSnapshot({
    reader: {
      ...base,
      async recheck() {
        throw new WatcherQueryError({
          kind: "command-exit",
          retryable: true,
          code: 1,
          detail: "outage",
        });
      },
    },
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  const decision = classifyPr(snapshot);
  expect(decision.kind === "blocker" && decision.blocker.kind).toBe(
    "merge-conflicts"
  );
});

it("holds a PR with an unverifiable thread at a merge gate", async () => {
  const snapshot = await readSnapshot({
    reader: fakeReader({
      threads: [
        {
          id: "huge",
          firstComment: null,
          recentComments: [],
          historyComplete: false,
          decidingComment: null,
          lastAuthorLogin: null,
          latestCommentAt: null,
          disposition: "unverifiable",
          isBugbot: false,
          bugbotReviewPasses: 0,
        },
      ],
    }),
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  const decision = classifyPr(snapshot);
  expect(decision.kind === "blocker" && decision.blocker).toMatchObject({
    kind: "merge-gate",
    reason: "unverifiable-thread",
  });
});

it("waits when the check list passed but the rollup has not", async () => {
  const snapshot = await readSnapshot({
    reader: fakeReader({ commitRollups: [{ oid: "head", state: "PENDING" }] }),
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(classifyPr(snapshot).kind).toBe("waiting");
});

it("reports actionable threads even when the checks can't be read", async () => {
  const thread: ReviewThread = {
    id: "t",
    firstComment: null,
    recentComments: [],
    historyComplete: true,
    decidingComment: null,
    lastAuthorLogin: null,
    latestCommentAt: null,
    disposition: "actionable",
    isBugbot: false,
    bugbotReviewPasses: 0,
  };
  const snapshot = await readSnapshot({
    reader: fakeReader({
      threads: [thread],
      fastPath: { kind: "unusable", exitCode: 1, stderr: "no checks reported" },
    }),
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  const decision = classifyPr(snapshot);
  expect(decision.kind === "blocker" && decision.blocker.kind).toBe(
    "review-threads"
  );
});

it("waits when the check list failed but the rollup has since passed", async () => {
  const base = fakeReader({ commitRollups: [{ oid: "head", state: "SUCCESS" }] });
  let reads = 0;
  const snapshot = await readSnapshot({
    reader: {
      ...base,
      async checksFastPath() {
        reads += 1;
        return { kind: "checks", checks: [reads === 1 ? failedCheck() : passingCheck()] };
      },
    },
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(classifyPr(snapshot).kind).toBe("waiting");
});

it("reports owner threads when another reviewer's lookup fails", async () => {
  const comment = (login: string, authorAssociation: string) => ({
    authorLogin: login,
    body: "fix",
    path: null,
    line: null,
    createdAt: "2026-01-01T00:00:00Z",
    activityAt: "2026-01-01T00:00:00Z",
    authorAssociation,
    authorIsBot: false,
    isViewer: false,
  });
  const thread = (id: string, login: string, association: string): ReviewThread => ({
    id,
    firstComment: comment(login, association),
    recentComments: [],
    historyComplete: true,
    decidingComment: null,
    lastAuthorLogin: null,
    latestCommentAt: null,
    disposition: "actionable",
    isBugbot: false,
    bugbotReviewPasses: 0,
  });
  const outage = new WatcherQueryError({
    kind: "command-exit",
    retryable: true,
    code: 1,
    detail: "502",
  });
  const read = (threads: readonly ReviewThread[]) => {
    const base = fakeReader({ threads });
    return readSnapshot({
      reader: {
        ...base,
        async permission() {
          throw outage;
        },
      },
      context: context(9),
      pendingHistory: "include",
      allowDraft: false,
    });
  };
  const snapshot = await read([
    thread("owner", "boss", "OWNER"),
    thread("member", "m", "MEMBER"),
  ]);
  if (snapshot.kind !== "open") throw new Error("expected open");
  expect(snapshot.threads.map((t) => t.id)).toEqual(["owner"]);
  await expect(read([thread("member", "m", "MEMBER")])).rejects.toBe(outage);
});

it("waits while a failed check is being rerun", async () => {
  const base = fakeReader({ commitRollups: [{ oid: "head", state: "PENDING" }] });
  let reads = 0;
  const snapshot = await readSnapshot({
    reader: {
      ...base,
      async checksFastPath() {
        reads += 1;
        return { kind: "checks", checks: [reads === 1 ? failedCheck() : pendingCheck()] };
      },
    },
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(classifyPr(snapshot).kind).toBe("waiting");
});

it("does not wait on the ignored review gate through the rollup", async () => {
  const gate: Check = {
    kind: "code-review-gate",
    name: "Code Review Gate",
    reportedState: "PENDING",
    description: "",
    link: "",
    workflow: "",
  };
  const snapshot = await readSnapshot({
    reader: fakeReader({
      fastPath: { kind: "checks", checks: [passingCheck(), gate] },
      commitRollups: [{ oid: "head", state: "PENDING" }],
    }),
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(classifyPr(snapshot).kind).toBe("ready");
});

it("still waits when a workflow starts behind the review gate", async () => {
  const gate: Check = {
    kind: "code-review-gate",
    name: "Code Review Gate",
    reportedState: "PENDING",
    description: "",
    link: "",
    workflow: "",
  };
  const base = fakeReader({ commitRollups: [{ oid: "head", state: "PENDING" }] });
  let reads = 0;
  const snapshot = await readSnapshot({
    reader: {
      ...base,
      async checksFastPath() {
        reads += 1;
        return {
          kind: "checks",
          checks:
            reads === 1 ? [passingCheck(), gate] : [passingCheck(), gate, pendingCheck("new")],
        };
      },
    },
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(reads).toBe(2);
  expect(classifyPr(snapshot).kind).toBe("waiting");
});

it("waits when a failure next to the review gate has since gone green", async () => {
  const gate: Check = {
    kind: "code-review-gate",
    name: "Code Review Gate",
    reportedState: "PENDING",
    description: "",
    link: "",
    workflow: "",
  };
  const base = fakeReader({ commitRollups: [{ oid: "head", state: "PENDING" }] });
  let reads = 0;
  const snapshot = await readSnapshot({
    reader: {
      ...base,
      async checksFastPath() {
        reads += 1;
        return {
          kind: "checks",
          checks: reads === 1 ? [failedCheck(), gate] : [passingCheck(), gate],
        };
      },
    },
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(classifyPr(snapshot).kind).toBe("waiting");
});

it("re-reads the snapshot when the base branch moves mid-read", async () => {
  const base = fakeReader();
  let facts = 0;
  const reader: GitHubReader = {
    ...base,
    async pullRequest(pr) {
      facts += 1;
      return {
        ...(await base.pullRequest(pr)),
        baseRefOid: facts === 1 ? "old-base" : "new-base",
        mergeable: facts === 1 ? "MERGEABLE" : "CONFLICTING",
      };
    },
    async recheck(pr) {
      return { ...(await base.recheck(pr)), baseRefOid: "new-base", mergeable: "CONFLICTING" };
    },
  };
  const snapshot = await readSnapshot({
    reader,
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(facts).toBe(2);
  const decision = classifyPr(snapshot);
  expect(decision.kind === "blocker" && decision.blocker.kind).toBe(
    "merge-conflicts"
  );
});

it("re-reads the snapshot when the PR is set to draft mid-read", async () => {
  const base = fakeReader();
  let facts = 0;
  const reader: GitHubReader = {
    ...base,
    async pullRequest(pr) {
      facts += 1;
      return { ...(await base.pullRequest(pr)), isDraft: facts > 1 };
    },
    async recheck(pr) {
      return { ...(await base.recheck(pr)), isDraft: true };
    },
  };
  const snapshot = await readSnapshot({
    reader,
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(facts).toBe(2);
  const decision = classifyPr(snapshot);
  expect(decision.kind === "blocker" && decision.blocker).toMatchObject({
    kind: "merge-gate",
    reason: "draft-pr",
  });
});

it("reports the fresh read's failures when the first read's recovered", async () => {
  const gate: Check = {
    kind: "code-review-gate",
    name: "Code Review Gate",
    reportedState: "PENDING",
    description: "",
    link: "",
    workflow: "",
  };
  const base = fakeReader({ commitRollups: [{ oid: "head", state: "PENDING" }] });
  let reads = 0;
  const snapshot = await readSnapshot({
    reader: {
      ...base,
      async checksFastPath() {
        reads += 1;
        return {
          kind: "checks",
          checks:
            reads === 1
              ? [failedCheck("a"), passingCheck("b"), gate]
              : [passingCheck("a"), failedCheck("b"), gate],
        };
      },
    },
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  const decision = classifyPr(snapshot);
  if (decision.kind !== "blocker" || decision.blocker.kind !== "failing-checks")
    throw new Error("expected failing checks");
  expect(decision.blocker.ci.failed.map((check) => check.name)).toEqual(["b"]);
});

it("names the current failure when a different check fails between reads", async () => {
  const base = fakeReader({ commitRollups: [{ oid: "head", state: "FAILURE" }] });
  let reads = 0;
  const snapshot = await readSnapshot({
    reader: {
      ...base,
      async checksFastPath() {
        reads += 1;
        return {
          kind: "checks",
          checks:
            reads === 1
              ? [failedCheck("a"), passingCheck("b")]
              : [passingCheck("a"), failedCheck("b")],
        };
      },
    },
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  const decision = classifyPr(snapshot);
  if (decision.kind !== "blocker" || decision.blocker.kind !== "failing-checks")
    throw new Error("expected failing checks");
  expect(decision.blocker.ci.failed.map((check) => check.name)).toEqual(["b"]);
});

it("re-reads when a review comment lands mid-read (updatedAt moves)", async () => {
  const base = fakeReader();
  let facts = 0;
  let threadReads = 0;
  const comment: ReviewThread = {
    id: "late",
    firstComment: {
      authorLogin: "boss",
      body: "one more thing",
      path: null,
      line: null,
      createdAt: "2026-01-01T00:00:00Z",
      activityAt: "2026-01-01T00:00:00Z",
      authorAssociation: "OWNER",
      authorIsBot: false,
      isViewer: false,
    },
    recentComments: [],
    historyComplete: true,
    decidingComment: null,
    lastAuthorLogin: null,
    latestCommentAt: null,
    disposition: "actionable",
    isBugbot: false,
    bugbotReviewPasses: 0,
  };
  const reader: GitHubReader = {
    ...base,
    async pullRequest(pr) {
      facts += 1;
      return { ...(await base.pullRequest(pr)), updatedAt: facts === 1 ? "t1" : "t2" };
    },
    async reviewThreads() {
      threadReads += 1;
      return threadReads === 1 ? [] : [comment];
    },
    async recheck(pr) {
      return { ...(await base.recheck(pr)), updatedAt: "t2" };
    },
  };
  const snapshot = await readSnapshot({
    reader,
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(facts).toBe(2);
  expect(classifyPr(snapshot).kind).toBe("blocker");
});

it("refuses READY when GitHub blocks the merge for no visible reason", async () => {
  const snapshot = await readSnapshot({
    reader: fakeReader({
      facts: { mergeStateStatus: "BLOCKED", reviewDecision: "APPROVED" },
      commitRollups: [{ oid: "head", state: "SUCCESS" }],
    }),
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  const decision = classifyPr(snapshot);
  if (decision.kind !== "blocker" || decision.blocker.kind !== "failing-checks")
    throw new Error("expected a CI blocker");
  expect(decision.blocker.ci.kind).toBe("ci-github-rejected");
});

it("blocks a green PR that GitHub reports as behind its base", async () => {
  const snapshot = await readSnapshot({
    reader: fakeReader({ facts: { mergeStateStatus: "BEHIND" } }),
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  const decision = classifyPr(snapshot);
  expect(decision.kind === "blocker" && decision.blocker.kind).toBe(
    "merge-conflicts"
  );
});

it("lets BEHIND through when the base doesn't require up to date", async () => {
  const snapshot = await readSnapshot({
    reader: fakeReader({
      facts: { mergeStateStatus: "BEHIND" },
      upToDateRequired: false,
    }),
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(classifyPr(snapshot).kind).toBe("ready");
});

it("holds BEHIND at a merge gate when the rules can't be read", async () => {
  const snapshot = await readSnapshot({
    reader: fakeReader({
      facts: { mergeStateStatus: "BEHIND" },
      upToDateRequired: null,
    }),
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  const decision = classifyPr(snapshot);
  expect(decision.kind === "blocker" && decision.blocker).toMatchObject({
    kind: "merge-gate",
    reason: "behind-base",
  });
});

it("re-reads before READY when a check registers after the CI read", async () => {
  const base = fakeReader();
  let checkReads = 0;
  const snapshot = await readSnapshot({
    reader: {
      ...base,
      async checksFastPath() {
        checkReads += 1;
        return {
          kind: "checks",
          checks: checkReads === 1 ? [passingCheck()] : [passingCheck(), pendingCheck("late")],
        };
      },
    },
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(checkReads).toBeGreaterThanOrEqual(3);
  expect(classifyPr(snapshot).kind).toBe("waiting");
});

it("waits while GitHub hasn't computed the merge state", async () => {
  const snapshot = await readSnapshot({
    reader: fakeReader({
      facts: { mergeable: "MERGEABLE", mergeStateStatus: "UNKNOWN" },
    }),
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(classifyPr(snapshot).kind).toBe("waiting");
});

it("re-reads when the merge state changes mid-read", async () => {
  const base = fakeReader();
  let facts = 0;
  const reader: GitHubReader = {
    ...base,
    async pullRequest(pr) {
      facts += 1;
      return {
        ...(await base.pullRequest(pr)),
        mergeStateStatus: facts === 1 ? "CLEAN" : "BLOCKED",
        reviewDecision: "APPROVED",
      };
    },
    async recheck(pr) {
      return { ...(await base.recheck(pr)), mergeStateStatus: "BLOCKED" };
    },
  };
  const snapshot = await readSnapshot({
    reader,
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(facts).toBe(2);
  expect(classifyPr(snapshot).kind).toBe("blocker");
});

it("re-reads when the up-to-date rule changes mid-read on a BEHIND PR", async () => {
  const base = fakeReader({ facts: { mergeStateStatus: "BEHIND" } });
  let ruleReads = 0;
  const snapshot = await readSnapshot({
    reader: {
      ...base,
      async upToDateRequired() {
        ruleReads += 1;
        return ruleReads > 1;
      },
    },
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(ruleReads).toBeGreaterThanOrEqual(3);
  const decision = classifyPr(snapshot);
  expect(decision.kind === "blocker" && decision.blocker.kind).toBe(
    "merge-conflicts"
  );
});

it("names open conversations when only parked threads could explain BLOCKED", async () => {
  const parked: ReviewThread = {
    id: "answered",
    firstComment: null,
    recentComments: [],
    historyComplete: true,
    decidingComment: null,
    lastAuthorLogin: null,
    latestCommentAt: null,
    disposition: "awaiting-reviewer",
    isBugbot: false,
    bugbotReviewPasses: 0,
  };
  const snapshot = await readSnapshot({
    reader: fakeReader({
      facts: { mergeStateStatus: "BLOCKED", reviewDecision: "APPROVED" },
      threads: [parked],
    }),
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  const decision = classifyPr(snapshot);
  if (decision.kind !== "blocker" || decision.blocker.kind !== "failing-checks")
    throw new Error("expected a CI blocker");
  expect(decision.blocker.ci).toMatchObject({
    kind: "ci-github-rejected",
    github: { cause: "open-conversations" },
  });
});

it("reports a failure the fresh read saw even when the rollup said SUCCESS", async () => {
  const base = fakeReader({ commitRollups: [{ oid: "head", state: "SUCCESS" }] });
  let reads = 0;
  const snapshot = await readSnapshot({
    reader: {
      ...base,
      async checksFastPath() {
        reads += 1;
        return {
          kind: "checks",
          checks:
            reads === 1
              ? [failedCheck("a"), passingCheck("b")]
              : [passingCheck("a"), failedCheck("b")],
        };
      },
    },
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  const decision = classifyPr(snapshot);
  if (decision.kind !== "blocker" || decision.blocker.kind !== "failing-checks")
    throw new Error("expected failing checks");
  expect(decision.blocker.ci.failed.map((check) => check.name)).toEqual(["b"]);
});

it("retries when an unverified reply is newer than an actionable thread's decider", async () => {
  const at = (t: string) => `2026-01-0${t}T00:00:00Z`;
  const comment = (login: string, assoc: string, t: string) => ({
    authorLogin: login,
    body: login,
    path: null,
    line: null,
    createdAt: at(t),
    activityAt: at(t),
    authorAssociation: assoc,
    authorIsBot: false,
    isViewer: false,
  });
  const opener = comment("boss", "OWNER", "1");
  const base = fakeReader({
    threads: [
      {
        id: "t",
        firstComment: opener,
        recentComments: [opener, comment("m", "MEMBER", "2")],
        historyComplete: true,
        decidingComment: null,
        lastAuthorLogin: null,
        latestCommentAt: null,
        disposition: "actionable",
        isBugbot: false,
        bugbotReviewPasses: 0,
      },
    ],
  });
  const outage = new WatcherQueryError({
    kind: "command-exit",
    retryable: true,
    code: 1,
    detail: "502",
  });
  await expect(
    readSnapshot({
      reader: {
        ...base,
        async permission() {
          throw outage;
        },
      },
      context: context(9),
      pendingHistory: "include",
      allowDraft: false,
    })
  ).rejects.toBe(outage);
});

it("returns a known thread blocker for a BEHIND PR whose CI read failed", async () => {
  const thread: ReviewThread = {
    id: "t",
    firstComment: null,
    recentComments: [],
    historyComplete: true,
    decidingComment: null,
    lastAuthorLogin: null,
    latestCommentAt: null,
    disposition: "actionable",
    isBugbot: false,
    bugbotReviewPasses: 0,
  };
  const snapshot = await readSnapshot({
    reader: fakeReader({
      facts: { mergeStateStatus: "BEHIND" },
      threads: [thread],
      fastPath: { kind: "unusable", exitCode: 1, stderr: "no checks reported" },
    }),
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  const decision = classifyPr(snapshot);
  expect(decision.kind === "blocker" && decision.blocker.kind).toBe("review-threads");
});

it("waits while GitHub reports UNSTABLE despite a green check read", async () => {
  const snapshot = await readSnapshot({
    reader: fakeReader({ facts: { mergeStateStatus: "UNSTABLE" } }),
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(classifyPr(snapshot).kind).toBe("waiting");
});

it("retries when an unverified reply ties the decider's timestamp", async () => {
  const comment = (login: string, assoc: string) => ({
    authorLogin: login,
    body: login,
    path: null,
    line: null,
    createdAt: "2026-01-01T00:00:00Z",
    activityAt: "2026-01-01T00:00:00Z",
    authorAssociation: assoc,
    authorIsBot: false,
    isViewer: false,
  });
  const opener = comment("boss", "OWNER");
  const base = fakeReader({
    threads: [
      {
        id: "t",
        firstComment: opener,
        recentComments: [opener, comment("m", "MEMBER")],
        historyComplete: true,
        decidingComment: null,
        lastAuthorLogin: null,
        latestCommentAt: null,
        disposition: "actionable",
        isBugbot: false,
        bugbotReviewPasses: 0,
      },
    ],
  });
  const outage = new WatcherQueryError({
    kind: "command-exit",
    retryable: true,
    code: 1,
    detail: "502",
  });
  await expect(
    readSnapshot({
      reader: {
        ...base,
        async permission() {
          throw outage;
        },
      },
      context: context(9),
      pendingHistory: "include",
      allowDraft: false,
    })
  ).rejects.toBe(outage);
});

it("gates a green PR that still needs an approving review", async () => {
  const ready = await readSnapshot({
    reader: fakeReader({ facts: { reviewDecision: "REVIEW_REQUIRED" } }),
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  const decision = classifyPr(ready);
  expect(decision.kind === "blocker" && decision.blocker).toMatchObject({
    kind: "merge-gate",
    reason: "review-required",
  });
  const pending = await readSnapshot({
    reader: fakeReader({
      facts: { reviewDecision: "REVIEW_REQUIRED" },
      fastPath: { kind: "checks", checks: [pendingCheck()] },
    }),
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(classifyPr(pending).kind).toBe("waiting");
});

it("waits while GitHub is still computing mergeability", async () => {
  const snapshot = await readSnapshot({
    reader: fakeReader({ facts: { mergeable: "UNKNOWN" } }),
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(classifyPr(snapshot).kind).toBe("waiting");
});

it("scans stacks tier-major so an upstack conflict outranks frontier CI", async () => {
  const frontier = await readSnapshot({
    reader: fakeReader({
      fastPath: { kind: "checks", checks: [failedCheck()] },
      commitRollups: [{ oid: "head", state: "FAILURE" }],
    }),
    context: context(10),
    pendingHistory: "omit",
    allowDraft: false,
  });
  const upstack = await readSnapshot({
    reader: fakeReader({ facts: { mergeable: "CONFLICTING" } }),
    context: context(11),
    pendingHistory: "omit",
    allowDraft: false,
  });
  const decision = selectTierMajorStackDecision([frontier, upstack]);
  expect(decision).toMatchObject({
    kind: "blocker",
    blocker: { kind: "merge-conflicts", pr: { number: 11 } },
  });
});

it("attributes a stack wait to the PR whose checks are pending, not the bottom", async () => {
  const readyBottom = await readSnapshot({
    reader: fakeReader(),
    context: context(20),
    pendingHistory: "omit",
    allowDraft: false,
  });
  const pendingUpstack = await readSnapshot({
    reader: fakeReader({
      fastPath: { kind: "checks", checks: [pendingCheck("upstack-build")] },
    }),
    context: context(21),
    pendingHistory: "omit",
    allowDraft: false,
  });
  const decision = selectTierMajorStackDecision([readyBottom, pendingUpstack]);
  expect(decision).toMatchObject({
    kind: "waiting",
    frontier: { number: 21 },
    pending: [{ name: "upstack-build" }],
  });
});

it("waits on a draft while checks are pending, then reports the draft gate", async () => {
  const pending = await readSnapshot({
    reader: fakeReader({
      facts: { isDraft: true },
      fastPath: { kind: "checks", checks: [pendingCheck()] },
    }),
    context: context(12),
    pendingHistory: "omit",
    allowDraft: false,
  });
  expect(classifyPr(pending).kind).toBe("waiting");

  const settled = await readSnapshot({
    reader: fakeReader({ facts: { isDraft: true } }),
    context: context(12),
    pendingHistory: "omit",
    allowDraft: false,
  });
  expect(classifyPr(settled)).toMatchObject({
    kind: "blocker",
    blocker: { kind: "merge-gate", reason: "draft-pr" },
  });
});

it("stops a --stack scan between PRs once the deadline passes", async () => {
  let now = 0;
  const base = fakeReader();
  const reader: GitHubReader = {
    ...base,
    async pullRequest(pr) {
      now += 100;
      return base.pullRequest(pr);
    },
  };
  const verdict = await runSimple({
    dependencies: {
      reader,
      clock: { now: () => now, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2), context(3)],
    mode: "stack",
    statusOnly: false,
    options: { ...options, timeout: 150 },
  });
  expect(verdict.kind === "TIMEOUT" && verdict.reason).toEqual({
    kind: "stack-scan",
    read: 2,
    total: 3,
  });
});

it("returns a conflict already read instead of timing out a stack scan", async () => {
  let now = 0;
  const base = fakeReader();
  const verdict = await runSimple({
    dependencies: {
      reader: {
        ...base,
        async pullRequest(pr) {
          now += 100;
          return {
            ...(await base.pullRequest(pr)),
            ...(Number(pr.number) === 1
              ? { mergeable: "CONFLICTING" as const, mergeStateStatus: "DIRTY" as const }
              : {}),
          };
        },
        async recheck(pr) {
          return {
            ...(await base.recheck(pr)),
            ...(Number(pr.number) === 1 ? { mergeable: "CONFLICTING" as const, mergeStateStatus: "DIRTY" as const } : {}),
          };
        },
      },
      clock: { now: () => now, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2), context(3)],
    mode: "stack",
    statusOnly: false,
    options: { ...options, timeout: 150 },
  });
  expect(verdict.kind === "BLOCKER" && verdict.blocker.kind).toBe("merge-conflicts");
});

it("re-reads when a push lands during the final check confirmation", async () => {
  const base = fakeReader();
  let facts = 0;
  let rechecks = 0;
  const snapshot = await readSnapshot({
    reader: {
      ...base,
      async pullRequest(pr) {
        facts += 1;
        return { ...(await base.pullRequest(pr)), headRefOid: facts === 1 ? "old" : "new" };
      },
      async recheck(pr) {
        rechecks += 1;
        return { ...(await base.recheck(pr)), headRefOid: "new" };
      },
    },
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(facts).toBe(2);
  expect(snapshot.kind === "open" && snapshot.facts.headRefOid).toBe("new");
});

it("keeps a stack conflict when a later PR's read fails", async () => {
  const base = fakeReader();
  const verdict = await runSimple({
    dependencies: {
      reader: {
        ...base,
        async pullRequest(pr) {
          if (Number(pr.number) === 2)
            throw new WatcherQueryError({
              kind: "command-rejected",
              retryable: false,
              code: 1,
              detail: "HTTP 404",
            });
          return {
            ...(await base.pullRequest(pr)),
            mergeable: "CONFLICTING" as const,
            mergeStateStatus: "DIRTY" as const,
          };
        },
        async recheck(pr) {
          return {
            ...(await base.recheck(pr)),
            mergeable: "CONFLICTING" as const,
            mergeStateStatus: "DIRTY" as const,
          };
        },
      },
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    mode: "stack",
    statusOnly: false,
    options,
  });
  expect(verdict.kind === "BLOCKER" && verdict.blocker.kind).toBe("merge-conflicts");
});

it("rescans a stack when an earlier row changed before READY", async () => {
  const base = fakeReader();
  let firstRowRechecks = 0;
  let scans = 0;
  const verdict = await runSimple({
    dependencies: {
      reader: {
        ...base,
        async pullRequest(pr) {
          if (Number(pr.number) === 1) scans += 1;
          return base.pullRequest(pr);
        },
        async recheck(pr) {
          const facts = await base.recheck(pr);
          if (Number(pr.number) !== 1) return facts;
          firstRowRechecks += 1;
          // The revalidation after the first scan (2nd recheck of row 1)
          // sees a new comment; later reads agree.
          return firstRowRechecks === 2 ? { ...facts, baseRefOid: "moved" } : facts;
        },
      },
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    mode: "stack",
    statusOnly: false,
    options,
  });
  expect(scans).toBe(2);
  expect(verdict.kind).toBe("READY");
});

it("rescans a status-only stack when an earlier row moved", async () => {
  const base = fakeReader();
  let firstRowRechecks = 0;
  let scans = 0;
  const verdict = await runSimple({
    dependencies: {
      reader: {
        ...base,
        async pullRequest(pr) {
          if (Number(pr.number) === 1) scans += 1;
          return base.pullRequest(pr);
        },
        async recheck(pr) {
          const facts = await base.recheck(pr);
          if (Number(pr.number) !== 1) return facts;
          firstRowRechecks += 1;
          return firstRowRechecks === 2 ? { ...facts, baseRefOid: "moved" } : facts;
        },
      },
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    mode: "stack",
    statusOnly: true,
    options,
  });
  expect(scans).toBe(2);
  expect(verdict.kind).toBe("STATUS");
});

it("rescans a stack when an earlier BEHIND row's rule flips before READY", async () => {
  const base = fakeReader({ facts: { mergeStateStatus: "BEHIND" } });
  let ruleReads = 0;
  let scans = 0;
  const verdict = await runSimple({
    dependencies: {
      reader: {
        ...base,
        async pullRequest(pr) {
          if (Number(pr.number) === 1) scans += 1;
          return base.pullRequest(pr);
        },
        async upToDateRequired(pr) {
          if (Number(pr.number) !== 1) return false;
          ruleReads += 1;
          // Loose for the first snapshot and its confirmation; strict when
          // the stack revalidates, and from then on.
          return ruleReads > 2;
        },
      },
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    mode: "stack",
    statusOnly: false,
    options,
  });
  expect(scans).toBe(2);
  expect(verdict.kind === "BLOCKER" && verdict.blocker.kind).toBe("merge-conflicts");
});

it("keeps a queued conflict when a later PR's read fails", async () => {
  const base = fakeReader();
  const verdict = await runQueued({
    dependencies: {
      reader: {
        ...base,
        async pullRequest(pr) {
          if (Number(pr.number) === 2)
            throw new WatcherQueryError({
              kind: "command-rejected",
              retryable: false,
              code: 1,
              detail: "HTTP 404",
            });
          return {
            ...(await base.pullRequest(pr)),
            mergeable: "CONFLICTING" as const,
            mergeStateStatus: "DIRTY" as const,
          };
        },
        async recheck(pr) {
          return {
            ...(await base.recheck(pr)),
            mergeable: "CONFLICTING" as const,
            mergeStateStatus: "DIRTY" as const,
          };
        },
      },
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    options,
  });
  expect(verdict.kind === "BLOCKER" && verdict.blocker.kind).toBe("merge-conflicts");
});

it("doesn't let an ignored pending check explain a BLOCKED merge", async () => {
  const gate: Check = {
    kind: "code-review-gate",
    name: "Human Gate",
    reportedState: "PENDING",
    description: "",
    link: "",
    workflow: "",
  };
  const snapshot = await readSnapshot({
    reader: fakeReader({
      facts: { mergeStateStatus: "BLOCKED", reviewDecision: "APPROVED" },
      fastPath: { kind: "checks", checks: [passingCheck(), gate] },
      commitRollups: [{ oid: "head", state: "SUCCESS" }],
    }),
    context: context(9),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(classifyPr(snapshot).kind).not.toBe("ready");
});

it("scans a PR that joined the stack before declaring it READY", async () => {
  const base = fakeReader();
  const scanned: number[] = [];
  const verdict = await runSimple({
    dependencies: {
      reader: {
        ...base,
        async pullRequest(pr) {
          scanned.push(Number(pr.number));
          return {
            ...(await base.pullRequest(pr)),
            ...(Number(pr.number) === 3
              ? { mergeable: "CONFLICTING" as const, mergeStateStatus: "DIRTY" as const }
              : {}),
          };
        },
        async recheck(pr) {
          return {
            ...(await base.recheck(pr)),
            ...(Number(pr.number) === 3 ? { mergeable: "CONFLICTING" as const, mergeStateStatus: "DIRTY" as const } : {}),
          };
        },
      },
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    mode: "stack",
    statusOnly: false,
    options,
    rediscover: async () => [context(1), context(2), context(3)],
  });
  expect(scanned).toContain(3);
  expect(verdict.kind === "BLOCKER" && verdict.blocker.kind).toBe("merge-conflicts");
});

it("drops a PR that left the stack before returning its blocker", async () => {
  const base = fakeReader();
  const conflicted = (pr: PrContext) => Number(pr.number) === 2;
  const verdict = await runSimple({
    dependencies: {
      reader: {
        ...base,
        async pullRequest(pr) {
          return {
            ...(await base.pullRequest(pr)),
            ...(conflicted(pr)
              ? { mergeable: "CONFLICTING" as const, mergeStateStatus: "DIRTY" as const }
              : {}),
          };
        },
        async recheck(pr) {
          return {
            ...(await base.recheck(pr)),
            ...(conflicted(pr) ? { mergeable: "CONFLICTING" as const, mergeStateStatus: "DIRTY" as const } : {}),
          };
        },
      },
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    mode: "stack",
    statusOnly: false,
    options,
    // #2 was retargeted away; the stack is now #1 alone.
    rediscover: async () => [context(1)],
  });
  expect(verdict.kind).toBe("READY");
});

it("rescans a stack when the last row changed during revalidation", async () => {
  const base = fakeReader();
  let lastRowRechecks = 0;
  let scans = 0;
  const verdict = await runSimple({
    dependencies: {
      reader: {
        ...base,
        async pullRequest(pr) {
          if (Number(pr.number) === 1) scans += 1;
          return base.pullRequest(pr);
        },
        async recheck(pr) {
          const facts = await base.recheck(pr);
          if (Number(pr.number) !== 2) return facts;
          lastRowRechecks += 1;
          return lastRowRechecks === 2 ? { ...facts, baseRefOid: "moved" } : facts;
        },
      },
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    mode: "stack",
    statusOnly: false,
    options,
  });
  expect(scans).toBe(2);
  expect(verdict.kind).toBe("READY");
});

it("rescans a stack when an earlier clean row gains a pending check", async () => {
  const base = fakeReader();
  let row1CheckReads = 0;
  let scans = 0;
  const verdict = await runSimple({
    dependencies: {
      reader: {
        ...base,
        async pullRequest(pr) {
          if (Number(pr.number) === 1) scans += 1;
          return base.pullRequest(pr);
        },
        async checksFastPath(pr) {
          if (Number(pr.number) !== 1)
            return { kind: "checks", checks: [passingCheck()] };
          row1CheckReads += 1;
          // Clean for its own snapshot and confirmation; a workflow starts
          // while row 2 is read, then finishes green.
          return {
            kind: "checks",
            checks: row1CheckReads === 3 ? [pendingCheck("late")] : [passingCheck()],
          };
        },
      },
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    mode: "stack",
    statusOnly: false,
    options,
  });
  expect(scans).toBe(2);
  expect(verdict.kind).toBe("READY");
});

it("rescans a stack when an earlier failing row recovers", async () => {
  const base = fakeReader();
  let row1CheckReads = 0;
  let scans = 0;
  const verdict = await runSimple({
    dependencies: {
      reader: {
        ...base,
        async pullRequest(pr) {
          if (Number(pr.number) === 1) scans += 1;
          return base.pullRequest(pr);
        },
        async checksFastPath(pr) {
          if (Number(pr.number) !== 1)
            return { kind: "checks", checks: [passingCheck()] };
          row1CheckReads += 1;
          // Failing for its own snapshot and that read's confirmation; a
          // rerun passes while row 2 is read.
          return {
            kind: "checks",
            checks: row1CheckReads <= 2 ? [failedCheck()] : [passingCheck()],
          };
        },
      },
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    mode: "stack",
    statusOnly: false,
    options,
  });
  expect(scans).toBe(2);
  expect(verdict.kind).toBe("READY");
});

it("drops a row that closed before it was read from the stack", async () => {
  const base = fakeReader();
  const verdict = await runSimple({
    dependencies: {
      reader: {
        ...base,
        async pullRequest(pr) {
          const facts = await base.pullRequest(pr);
          return Number(pr.number) === 2 ? { ...facts, state: "CLOSED" as const } : facts;
        },
        async recheck(pr) {
          const facts = await base.recheck(pr);
          return Number(pr.number) === 2 ? { ...facts, state: "CLOSED" as const } : facts;
        },
      },
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2), context(3)],
    mode: "stack",
    statusOnly: false,
    options,
    rediscover: async () => [context(1), context(3)],
  });
  expect(verdict.kind).toBe("READY");
});

it("follows the requested PR's stack when a retarget splits it", async () => {
  const base = fakeReader();
  const conflicted = (pr: PrContext) => Number(pr.number) === 2;
  const verdict = await runSimple({
    dependencies: {
      reader: {
        ...base,
        async pullRequest(pr) {
          return {
            ...(await base.pullRequest(pr)),
            ...(conflicted(pr)
              ? { mergeable: "CONFLICTING" as const, mergeStateStatus: "DIRTY" as const }
              : {}),
          };
        },
        async recheck(pr) {
          return {
            ...(await base.recheck(pr)),
            ...(conflicted(pr) ? { mergeable: "CONFLICTING" as const, mergeStateStatus: "DIRTY" as const } : {}),
          };
        },
      },
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    mode: "stack",
    statusOnly: false,
    options,
    // #2, the PR asked about, was retargeted away from #1 mid-scan.
    anchor: context(2),
    rediscover: async (from) => [from],
  });
  expect(verdict.kind === "BLOCKER" && verdict.blocker.kind).toBe("merge-conflicts");
  expect(
    verdict.kind === "BLOCKER" &&
      "pr" in verdict.blocker &&
      Number(verdict.blocker.pr.number)
  ).toBe(2);
});

it("reports the newest failing attempt when a rerun fails again", async () => {
  const base = fakeReader();
  let row1CheckReads = 0;
  const verdict = await runSimple({
    dependencies: {
      reader: {
        ...base,
        async checksFastPath(pr) {
          if (Number(pr.number) !== 1)
            return { kind: "checks", checks: [passingCheck()] };
          row1CheckReads += 1;
          const run = row1CheckReads <= 2 ? "runs/1" : "runs/2";
          return { kind: "checks", checks: [{ ...failedCheck("unit"), link: run }] };
        },
      },
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    mode: "stack",
    statusOnly: false,
    options,
  });
  expect(
    verdict.kind === "BLOCKER" &&
      verdict.blocker.kind === "failing-checks" &&
      verdict.blocker.ci.kind === "ci-failing" &&
      verdict.blocker.ci.failed[0].link
  ).toBe("runs/2");
});

it("keeps a known thread blocker when stack revalidation fails", async () => {
  const comment = {
    authorLogin: "owner",
    body: "fix this",
    path: null,
    line: null,
    createdAt: "2026-01-01T00:00:00Z",
    activityAt: "2026-01-01T00:00:00Z",
    authorAssociation: "OWNER",
    authorIsBot: false,
    isViewer: false,
  };
  const threads = fakeReader({
    threads: [
      {
        id: "t",
        firstComment: comment,
        recentComments: [comment],
        historyComplete: true,
        decidingComment: comment,
        lastAuthorLogin: "owner",
        latestCommentAt: comment.activityAt,
        disposition: "actionable",
        isBugbot: false,
        bugbotReviewPasses: 0,
      },
    ],
  });
  const base = fakeReader();
  let row1CheckReads = 0;
  const verdict = await runSimple({
    dependencies: {
      reader: {
        ...base,
        async reviewThreads(pr) {
          return Number(pr.number) === 2 ? threads.reviewThreads(pr) : [];
        },
        async checksFastPath(pr) {
          if (Number(pr.number) === 1 && (row1CheckReads += 1) > 2)
            throw new WatcherQueryError({
              kind: "command-exit",
              retryable: true,
              code: 1,
              detail: "GraphQL unavailable",
            });
          return { kind: "checks", checks: [passingCheck()] };
        },
      },
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    mode: "stack",
    statusOnly: false,
    options,
  });
  expect(verdict.kind === "BLOCKER" && verdict.blocker.kind).toBe("review-threads");
});

it("settles a snapshot when only untrusted activity moves updatedAt", async () => {
  const base = fakeReader();
  let rechecks = 0;
  const snapshot = await readSnapshot({
    reader: {
      ...base,
      // A drive-by comment lands after every PR read, bumping updatedAt.
      async pullRequest(pr) {
        return { ...(await base.pullRequest(pr)), updatedAt: "before" };
      },
      async recheck(pr) {
        rechecks += 1;
        return { ...(await base.recheck(pr)), updatedAt: "bumped" };
      },
    },
    context: context(1),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(snapshot.kind === "open" && snapshot.ci.kind).toBe("ci-clean");
  // The recheck, then one more after re-reading the threads.
  expect(rechecks).toBe(2);
});

it("doesn't settle when updatedAt moves again during the thread re-read", async () => {
  const base = fakeReader();
  let rechecks = 0;
  const read = readSnapshot({
    reader: {
      ...base,
      // Comments keep landing, including while the threads are re-read.
      async recheck(pr) {
        rechecks += 1;
        return { ...(await base.recheck(pr)), updatedAt: `bumped-${rechecks}` };
      },
    },
    context: context(1),
    pendingHistory: "include",
    allowDraft: false,
  });
  await expect(read).rejects.toMatchObject({ failure: { kind: "head-moved" } });
});

it("re-reads a snapshot when updatedAt moved for a trusted comment", async () => {
  const comment = {
    authorLogin: "owner",
    body: "fix this",
    path: null,
    line: null,
    createdAt: "2026-01-01T00:00:00Z",
    activityAt: "2026-01-01T00:00:00Z",
    authorAssociation: "OWNER",
    authorIsBot: false,
    isViewer: false,
  };
  const thread = fakeReader({
    threads: [
      {
        id: "t",
        firstComment: comment,
        recentComments: [comment],
        historyComplete: true,
        decidingComment: comment,
        lastAuthorLogin: "owner",
        latestCommentAt: comment.activityAt,
        disposition: "actionable",
        isBugbot: false,
        bugbotReviewPasses: 0,
      },
    ],
  });
  const base = fakeReader();
  let threadReads = 0;
  let rechecks = 0;
  const snapshot = await readSnapshot({
    reader: {
      ...base,
      // The owner comments right after the first thread read.
      async reviewThreads(pr) {
        threadReads += 1;
        return threadReads === 1 ? [] : thread.reviewThreads(pr);
      },
      async pullRequest(pr) {
        return { ...(await base.pullRequest(pr)), updatedAt: rechecks === 0 ? "t0" : "t1" };
      },
      async recheck(pr) {
        rechecks += 1;
        return { ...(await base.recheck(pr)), updatedAt: "t1" };
      },
    },
    context: context(1),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(snapshot.kind === "open" && snapshot.threads.map((t) => t.id)).toEqual(["t"]);
});

it("rescans a stack when a GitHub-rejected row's rollup recovers", async () => {
  const base = fakeReader({
    facts: { mergeStateStatus: "BLOCKED" },
    mergeQueueEnabled: true,
  });
  let row1Rollups = 0;
  const verdict = await runSimple({
    dependencies: {
      reader: {
        ...base,
        async commitRollups(pr) {
          if (Number(pr.number) !== 1) return base.commitRollups(pr);
          row1Rollups += 1;
          // A transient failure on the first read; green by revalidation.
          return [{ oid: "head", state: row1Rollups === 1 ? "FAILURE" : "SUCCESS" }];
        },
      },
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    mode: "stack",
    statusOnly: false,
    options,
  });
  expect(verdict.kind).toBe("READY");
});

it("re-reads a PR that was reopened right after a CLOSED read", async () => {
  const base = fakeReader();
  let reads = 0;
  const snapshot = await readSnapshot({
    reader: {
      ...base,
      async pullRequest(pr) {
        reads += 1;
        const facts = await base.pullRequest(pr);
        return reads === 1 ? { ...facts, state: "CLOSED" as const } : facts;
      },
    },
    context: context(1),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(snapshot.kind).toBe("open");
});

it("re-reads a snapshot when GitHub finds a conflict behind an unchanged BLOCKED", async () => {
  const base = fakeReader({ facts: { mergeStateStatus: "BLOCKED" } });
  let reads = 0;
  const snapshot = await readSnapshot({
    reader: {
      ...base,
      async pullRequest(pr) {
        reads += 1;
        return {
          ...(await base.pullRequest(pr)),
          mergeable: reads === 1 ? ("MERGEABLE" as const) : ("CONFLICTING" as const),
        };
      },
      async recheck(pr) {
        return { ...(await base.recheck(pr)), mergeable: "CONFLICTING" as const };
      },
    },
    context: context(1),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(snapshot.facts.mergeable).toBe("CONFLICTING");
});

it("re-reads a snapshot when the PR was retargeted to a branch at the same commit", async () => {
  const base = fakeReader();
  let reads = 0;
  const snapshot = await readSnapshot({
    reader: {
      ...base,
      async pullRequest(pr) {
        reads += 1;
        return { ...(await base.pullRequest(pr)), baseRefName: reads === 1 ? "main" : "release" };
      },
      async recheck(pr) {
        return { ...(await base.recheck(pr)), baseRefName: "release" };
      },
    },
    context: context(1),
    pendingHistory: "include",
    allowDraft: false,
  });
  expect(snapshot.facts.baseRefName).toBe("release");
});

it("rescans a stack when an earlier pending row fails", async () => {
  const base = fakeReader();
  let row1CheckReads = 0;
  const verdict = await runSimple({
    dependencies: {
      reader: {
        ...base,
        async checksFastPath(pr) {
          if (Number(pr.number) === 2) return { kind: "checks", checks: [failedCheck("e2e")] };
          row1CheckReads += 1;
          // Pending when the scan reads it; failed while #2 is read.
          return {
            kind: "checks",
            checks: [row1CheckReads === 1 ? pendingCheck("unit") : failedCheck("unit")],
          };
        },
      },
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    mode: "stack",
    statusOnly: false,
    options,
  });
  expect(
    verdict.kind === "BLOCKER" && "pr" in verdict.blocker && Number(verdict.blocker.pr.number)
  ).toBe(1);
});

it("rescans a stack whose order changed on rediscovery", async () => {
  const base = fakeReader();
  let rediscoveries = 0;
  const verdict = await runSimple({
    dependencies: {
      reader: base,
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    mode: "stack",
    statusOnly: true,
    options,
    rediscover: async () => {
      rediscoveries += 1;
      return [context(2), context(1)];
    },
  });
  expect(rediscoveries).toBe(2);
  expect(
    verdict.kind === "STATUS" && verdict.rows.map((row) => Number(row.context.number))
  ).toEqual([2, 1]);
});

it("rediscovers from the next open row when the seed merged after the scan", async () => {
  const seeds: number[] = [];
  const verdict = await runSimple({
    dependencies: {
      reader: fakeReader(),
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    mode: "stack",
    statusOnly: true,
    options,
    rediscover: async (from) => {
      seeds.push(Number(from.number));
      if (Number(from.number) === 1)
        throw new WatcherQueryError({
          kind: "stack-seed-gone",
          retryable: false,
          detail: "PR #1 is no longer open",
        });
      return [context(2)];
    },
  });
  expect(seeds).toEqual([1, 2, 2]);
  expect(
    verdict.kind === "STATUS" && verdict.rows.map((row) => Number(row.context.number))
  ).toEqual([2]);
});

it("keeps a stack conflict when the final revalidation fails", async () => {
  const base = fakeReader();
  let rechecks = 0;
  const verdict = await runSimple({
    dependencies: {
      reader: {
        ...base,
        async pullRequest(pr) {
          return {
            ...(await base.pullRequest(pr)),
            mergeable: "CONFLICTING" as const,
            mergeStateStatus: "DIRTY" as const,
          };
        },
        async recheck(pr) {
          rechecks += 1;
          // Each snapshot's own recheck succeeds; the stack revalidation fails.
          if (rechecks > 2)
            throw new WatcherQueryError({
              kind: "command-exit",
              retryable: true,
              code: 1,
              detail: "502",
            });
          return {
            ...(await base.recheck(pr)),
            mergeable: "CONFLICTING" as const,
            mergeStateStatus: "DIRTY" as const,
          };
        },
      },
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    mode: "stack",
    statusOnly: false,
    options,
  });
  expect(verdict.kind === "BLOCKER" && verdict.blocker.kind).toBe("merge-conflicts");
});

it("re-reads a queued sweep's stale blocker row before reporting it", async () => {
  let now = 0;
  let row2Read = false;
  const base = fakeReader();
  const reader: GitHubReader = {
    ...base,
    async pullRequest(pr) {
      if (Number(pr.number) === 2) row2Read = true;
      return base.pullRequest(pr);
    },
    // #1's check fails when the sweep reads it, then passes on a rerun while
    // #2 is read.
    async checksFastPath(pr) {
      return {
        kind: "checks",
        checks:
          Number(pr.number) === 1 && !row2Read ? [failedCheck()] : [passingCheck()],
      };
    },
  };
  const verdict = await runQueued({
    dependencies: {
      reader,
      clock: {
        now: () => now,
        observedAt: () => "now",
        sleep: async (seconds) => {
          now += seconds;
        },
      },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    options: { ...options, interval: 60, timeout: 90 },
  });
  expect(verdict.kind).toBe("TIMEOUT");
});

it("keeps a queued thread blocker when its refresh read fails", async () => {
  const comment = {
    authorLogin: "owner",
    body: "fix this",
    path: null,
    line: null,
    createdAt: "2026-01-01T00:00:00Z",
    activityAt: "2026-01-01T00:00:00Z",
    authorAssociation: "OWNER",
    authorIsBot: false,
    isViewer: false,
  };
  const threads = fakeReader({
    threads: [
      {
        id: "t",
        firstComment: comment,
        recentComments: [comment],
        historyComplete: true,
        decidingComment: comment,
        lastAuthorLogin: "owner",
        latestCommentAt: comment.activityAt,
        disposition: "actionable",
        isBugbot: false,
        bugbotReviewPasses: 0,
      },
    ],
  });
  const base = fakeReader();
  let row1ThreadReads = 0;
  const verdict = await runQueued({
    dependencies: {
      reader: {
        ...base,
        async reviewThreads(pr) {
          if (Number(pr.number) !== 1) return [];
          row1ThreadReads += 1;
          if (row1ThreadReads > 1)
            throw new WatcherQueryError({
              kind: "command-exit",
              retryable: true,
              code: 1,
              detail: "GraphQL unavailable",
            });
          return threads.reviewThreads(pr);
        },
      },
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    options,
  });
  expect(verdict.kind === "BLOCKER" && verdict.blocker.kind).toBe("review-threads");
});

it("emits a new queued wait when a different check is pending", async () => {
  let now = 0;
  const waits: string[] = [];
  const base = fakeReader();
  await runQueued({
    dependencies: {
      reader: {
        ...base,
        // One job finishes as another starts: same count, different check.
        async checksFastPath() {
          return {
            kind: "checks",
            checks: [pendingCheck(now < 120 ? "build" : "deploy")],
          };
        },
      },
      clock: {
        now: () => now,
        observedAt: () => "now",
        sleep: async (seconds) => {
          now += seconds;
        },
      },
      emit: (verdict) => {
        if (verdict.kind === "WAITING" && verdict.reason.kind === "pending-checks")
          waits.push(verdict.reason.pending.map((check) => check.name).join(","));
      },
    },
    contexts: [context(1)],
    options: { ...options, interval: 60, timeout: 300 },
  });
  expect(waits).toEqual(["build", "deploy"]);
});

it("revalidates earlier queued rows before reporting a later CI blocker", async () => {
  const base = fakeReader();
  let row1Reads = 0;
  let row1Rechecks = 0;
  const conflict = { mergeable: "CONFLICTING" as const, mergeStateStatus: "DIRTY" as const };
  const verdict = await runQueued({
    dependencies: {
      reader: {
        ...base,
        // #1 gains a conflict right after the sweep reads it.
        async pullRequest(pr) {
          const facts = await base.pullRequest(pr);
          if (Number(pr.number) !== 1) return facts;
          row1Reads += 1;
          return row1Reads === 1 ? facts : { ...facts, ...conflict };
        },
        async recheck(pr) {
          const facts = await base.recheck(pr);
          if (Number(pr.number) !== 1) return facts;
          row1Rechecks += 1;
          return row1Rechecks === 1 ? facts : { ...facts, ...conflict };
        },
        async checksFastPath(pr) {
          return {
            kind: "checks",
            checks: [Number(pr.number) === 2 ? failedCheck() : passingCheck()],
          };
        },
      },
      clock: { now: () => 0, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2)],
    options,
  });
  expect(verdict.kind === "BLOCKER" && verdict.blocker.kind).toBe("merge-conflicts");
});

it("times out a queued wait at the deadline without another snapshot", async () => {
  let now = 0;
  let reads = 0;
  const base = fakeReader({
    fastPath: { kind: "checks", checks: [pendingCheck()] },
  });
  const reader: GitHubReader = {
    ...base,
    async pullRequest(pr) {
      reads += 1;
      return base.pullRequest(pr);
    },
  };
  const verdict = await runQueued({
    dependencies: {
      reader,
      clock: {
        now: () => now,
        observedAt: () => "now",
        sleep: async (seconds) => {
          now += seconds;
        },
      },
      emit: () => {},
    },
    contexts: [context(1)],
    options: { ...options, interval: 60, timeout: 90 },
  });
  expect(verdict.kind).toBe("TIMEOUT");
  expect(now).toBeLessThanOrEqual(90);
  expect(reads).toBe(2);
});

it("wakes a queued watch for its next sweep before a long poll interval", async () => {
  const sleeps: number[] = [];
  const running = runQueued({
    dependencies: {
      reader: fakeReader({
        fastPath: { kind: "checks", checks: [pendingCheck()] },
      }),
      clock: {
        now: () => sleeps.reduce((sum, s) => sum + s, 0),
        observedAt: () => "now",
        sleep: async (seconds) => {
          sleeps.push(seconds);
          throw new Error("stop after first sleep");
        },
      },
      emit: () => {},
    },
    contexts: [context(1)],
    options: { ...options, interval: 600, sweepInterval: 60, timeout: 0 },
  });
  await expect(running).rejects.toThrow("stop after first sleep");
  expect(sleeps[0]).toBeLessThanOrEqual(60);
});

it("reports the lowest unmerged PR as the frontier on a mid-sweep timeout", async () => {
  let now = 0;
  const base = fakeReader();
  const verdict = await runQueued({
    dependencies: {
      reader: {
        ...base,
        async pullRequest(pr) {
          now += 100;
          return base.pullRequest(pr);
        },
      },
      clock: { now: () => now, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2), context(3)],
    options: { ...options, timeout: 150 },
  });
  expect(verdict.kind === "TIMEOUT" && verdict.reason).toMatchObject({
    kind: "queued-stack",
    frontier: { number: 1 },
  });
});

it("returns a conflict already read instead of timing out a queued sweep", async () => {
  let now = 0;
  const base = fakeReader();
  const conflicting = (pr: PrContext) => Number(pr.number) === 1;
  const verdict = await runQueued({
    dependencies: {
      reader: {
        ...base,
        async pullRequest(pr) {
          now += 100;
          return {
            ...(await base.pullRequest(pr)),
            ...(conflicting(pr)
              ? { mergeable: "CONFLICTING" as const, mergeStateStatus: "DIRTY" as const }
              : {}),
          };
        },
        async recheck(pr) {
          return {
            ...(await base.recheck(pr)),
            ...(conflicting(pr) ? { mergeable: "CONFLICTING" as const, mergeStateStatus: "DIRTY" as const } : {}),
          };
        },
      },
      clock: { now: () => now, observedAt: () => "now", sleep: async () => {} },
      emit: () => {},
    },
    contexts: [context(1), context(2), context(3)],
    options: { ...options, timeout: 50 },
  });
  expect(verdict.kind === "BLOCKER" && verdict.blocker.kind).toBe("merge-conflicts");
});

describe("queued-stack cadence", () => {
  async function openSnapshot(pr: PrContext) {
    return readSnapshot({
      reader: fakeReader(),
      context: pr,
      pendingHistory: "omit",
      allowDraft: false,
    });
  }

  it("drops a sweep head only after its snapshot succeeds", async () => {
    const queue = [
      context(20),
      context(21),
      context(22),
    ] satisfies NonEmpty<PrContext>;
    let state = createQueueState(queue, 0);
    const first = await openSnapshot(queue[0]);
    state = applyQueueSnapshot(state, first, 0, options).state;
    expect(state.work).toMatchObject({
      kind: "whole-stack-sweep",
      remaining: [{ number: 21 }, { number: 22 }],
    });
    const second = await openSnapshot(queue[1]);
    state = applyQueueSnapshot(state, second, 60, options).state;
    expect(state.work).toMatchObject({
      kind: "whole-stack-sweep",
      remaining: [{ number: 22 }],
    });
  });

  it("resumes the sweep at the PR whose read failed", async () => {
    const middle = context(21);
    const base = fakeReader();
    let failNext = true;
    const timeline: string[] = [];
    const reader = {
      ...base,
      async pullRequest(pr: PrContext) {
        if (pr.number === middle.number && failNext) {
          failNext = false;
          timeline.push(`fail:${pr.number}`);
          throw new WatcherQueryError({
            kind: "command-exit",
            retryable: true,
            detail: "rate limited",
            code: 1,
          });
        }
        timeline.push(`read:${pr.number}`);
        return base.pullRequest(pr);
      },
    } satisfies GitHubReader;
    let now = 0;
    let sleeps = 0;
    const running = runQueued({
      dependencies: {
        reader,
        clock: {
          now: () => now,
          observedAt: () => "2026-07-26T00:00:00.000Z",
          async sleep(seconds) {
            timeline.push("sleep");
            now += seconds;
            sleeps += 1;
            if (sleeps === 2) throw new Error("stop after resume proof");
          },
        },
        emit(verdict) {
          timeline.push(`emit:${verdict.kind}`);
        },
      },
      contexts: [context(20), middle, context(22)],
      options,
    });
    await expect(running).rejects.toThrow("stop after resume proof");
    expect(timeline).toEqual([
      "emit:QUEUE",
      "read:20",
      "fail:21",
      "emit:RETRY",
      "sleep",
      "read:21",
      "read:22",
      "emit:STATUS",
      "emit:WAITING",
      "sleep",
    ]);
  });

  it("emits a completed sweep only after its final successful snapshot", async () => {
    const queue = [context(30), context(31)] satisfies NonEmpty<PrContext>;
    let state = createQueueState(queue, 0);
    const first = applyQueueSnapshot(
      state,
      await openSnapshot(queue[0]),
      0,
      options
    );
    expect(first.completedSweepRows).toBeNull();
    state = first.state;
    const second = applyQueueSnapshot(
      state,
      await openSnapshot(queue[1]),
      5,
      options
    );
    expect(
      second.completedSweepRows?.map((row) => Number(row.context.number))
    ).toEqual([30, 31]);
    expect(second.state.nextSweepAt).toBe(305);
  });

  it("ADVANCE continues directly to the new frontier without sleeping", async () => {
    const one = context(40);
    const two = context(41);
    const base = fakeReader();
    const reads = new Map<number, number>();
    const timeline: string[] = [];
    const reader = {
      ...base,
      async pullRequest(pr: PrContext) {
        timeline.push(`read:${pr.number}`);
        const facts = await base.pullRequest(pr);
        const count = (reads.get(pr.number) ?? 0) + 1;
        reads.set(pr.number, count);
        return pr.number === one.number && count > 1
          ? {
              ...facts,
              state: "MERGED" as const,
              mergedAt: "2026-07-26T00:00:00Z",
            }
          : facts;
      },
    } satisfies GitHubReader;
    let now = 0;
    let sleeps = 0;
    const emitted: ProgressVerdict[] = [];
    const running = runQueued({
      dependencies: {
        reader,
        clock: {
          now: () => now,
          observedAt: () => "2026-07-26T00:00:00.000Z",
          async sleep(seconds) {
            timeline.push("sleep");
            now += seconds;
            sleeps += 1;
            if (sleeps === 2) throw new Error("stop after advance proof");
          },
        },
        emit(verdict) {
          emitted.push(verdict);
          timeline.push(`emit:${verdict.kind}`);
        },
      },
      contexts: [one, two],
      options,
    });
    await expect(running).rejects.toThrow("stop after advance proof");
    expect(emitted.some((event) => event.kind === "ADVANCE")).toBe(true);
    const firstSleep = timeline.indexOf("sleep");
    expect(timeline.slice(firstSleep, firstSleep + 5)).toEqual([
      "sleep",
      "read:40",
      "emit:ADVANCE",
      "read:41",
      "emit:WAITING",
    ]);
  });

  it("deduplicates identical waits and schedules the next due sweep", async () => {
    const queue = [context(50)] satisfies NonEmpty<PrContext>;
    let state = createQueueState(queue, 0);
    state = applyQueueSnapshot(
      state,
      await openSnapshot(queue[0]),
      0,
      options
    ).state;
    const first = evaluateQueue(state, 0, options);
    expect(first.kind).toBe("waiting");
    if (first.kind !== "waiting") throw new Error("expected waiting");
    expect(first.emit).toBe(true);
    const second = evaluateQueue(first.state, 10, options);
    expect(second.kind).toBe("waiting");
    if (second.kind !== "waiting") throw new Error("expected waiting");
    expect(second.emit).toBe(false);
    expect(planQueue(second.state, 300).work?.kind).toBe("whole-stack-sweep");
  });
});

it("never sleeps past --timeout while backing off", async () => {
  let now = 0;
  const sleeps: number[] = [];
  const reader = fakeReader();
  let reads = 0;
  const failing: GitHubReader = {
    ...reader,
    async pullRequest() {
      reads += 1;
      throw new WatcherQueryError({
        kind: "command-exit",
        retryable: true,
        code: 1,
        detail: "outage",
      });
    },
  };
  const verdict = await runSimple({
    dependencies: {
      reader: failing,
      clock: {
        now: () => now,
        observedAt: () => "now",
        sleep: async (seconds) => {
          sleeps.push(seconds);
          now += seconds;
        },
      },
      emit: () => {},
    },
    contexts: [context(1)],
    mode: "single",
    statusOnly: false,
    options: { ...options, interval: 60, timeout: 540, maxQueryErrors: 99 },
  });
  expect(verdict.kind).toBe("TIMEOUT");
  expect(now).toBeLessThanOrEqual(540);
  expect(sleeps).toEqual([60, 120, 240, 120]);
  expect(reads).toBe(4);
});

it("uses the specified retry floor and cap", () => {
  expect(queryBackoffSeconds(1, 1)).toBe(60);
  expect(queryBackoffSeconds(1, 2)).toBe(120);
  expect(queryBackoffSeconds(60, 4)).toBe(300);
});
