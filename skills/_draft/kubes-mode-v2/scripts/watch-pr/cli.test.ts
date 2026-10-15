import { describe, expect, it } from "bun:test";
import { type CliRuntime, main, parseArgs } from "./cli.ts";
import { fakeReader, passingCheck } from "./fakes.test-helper.ts";
import { WatcherQueryError } from "./github.ts";
import { renderJson, renderPretty } from "./render.ts";
import type { GitHubReader, WatcherVerdict } from "./types.ts";
import { parsePrNumber } from "./types.ts";

const silentIo = { stdout: () => {}, stderr: () => {} };

function testRuntime(reader: GitHubReader): {
  readonly runtime: CliRuntime;
  readonly stdout: string[];
  readonly stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    runtime: {
      reader,
      clock: {
        now: () => 0,
        observedAt: () => "2026-07-26T00:00:00.000Z",
        async sleep() {
          throw new Error("test unexpectedly slept");
        },
      },
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
    },
  };
}

it("retries a transient failure while resolving the PR", async () => {
  const base = fakeReader();
  let attempts = 0;
  const reader: GitHubReader = {
    ...base,
    async checkoutRepository() {
      attempts += 1;
      if (attempts === 1)
        throw new WatcherQueryError({
          kind: "command-exit",
          retryable: true,
          code: 1,
          detail: "502 from api.github.com",
        });
      return base.checkoutRepository();
    },
  };
  const harness = testRuntime(reader);
  const slept: number[] = [];
  const runtime: CliRuntime = {
    ...harness.runtime,
    clock: { ...harness.runtime.clock, sleep: async (s) => void slept.push(s) },
  };
  expect(await main(["--pr", "1"], runtime)).toBe(0);
  expect(attempts).toBe(2);
  expect(slept).toEqual([60]);
  expect(JSON.parse(harness.stdout[0] ?? "{}").kind).toBe("RETRY");
  expect(
    harness.stdout.map((line) => JSON.parse(line).sequence as number)
  ).toEqual([1, 2]);
});

it("gives polling only the timeout left after discovery retries", async () => {
  const base = fakeReader({
    fastPath: { kind: "checks", checks: [] },
    rollupPages: [],
  });
  let now = 0;
  let failures = 2;
  const reader: GitHubReader = {
    ...base,
    async checkoutRepository() {
      if (failures-- > 0)
        throw new WatcherQueryError({
          kind: "command-exit",
          retryable: true,
          code: 1,
          detail: "502",
        });
      return base.checkoutRepository();
    },
    async checksFastPath() {
      return { kind: "checks", checks: [{ ...passingCheck(), kind: "pending" }] };
    },
  };
  const harness = testRuntime(reader);
  const runtime: CliRuntime = {
    ...harness.runtime,
    clock: {
      ...harness.runtime.clock,
      now: () => now,
      sleep: async (s) => {
        now += s;
      },
    },
  };
  expect(await main(["--pr", "1", "--timeout", "240"], runtime)).toBe(5);
  expect(now).toBeLessThanOrEqual(240);
});

it("stops when discovery itself runs past the timeout", async () => {
  let now = 0;
  const base = fakeReader();
  const reader: GitHubReader = {
    ...base,
    async checkoutRepository() {
      now += 120;
      return base.checkoutRepository();
    },
    async pullRequest() {
      throw new Error("snapshot should not start");
    },
  };
  const harness = testRuntime(reader);
  const runtime: CliRuntime = {
    ...harness.runtime,
    clock: { ...harness.runtime.clock, now: () => now },
  };
  expect(await main(["--pr", "1", "--timeout", "60"], runtime)).toBe(5);
  expect(JSON.parse(harness.stdout[0] ?? "{}").reason).toEqual({
    kind: "discovery",
  });
});

describe("parseArgs", () => {
  it("uses the specified defaults", () => {
    expect(parseArgs([], silentIo)).toMatchObject({
      owner: null,
      repo: null,
      pr: null,
      mode: "single",
      stackPrs: [],
      statusOnly: false,
      pretty: false,
      polling: {
        interval: 60,
        sweepInterval: 300,
        timeout: 0,
        maxQueryErrors: 5,
        allowDraft: false,
      },
    });
  });

  it("parses a frozen queued stack bottom-to-top", () => {
    const parsed = parseArgs(
      [
        "--queued-stack",
        "--stack-prs",
        "#10, 11,#12",
        "--interval",
        "2.5",
        "--sweep-interval",
        "30",
        "--timeout",
        "0",
        "--max-query-errors",
        "3",
        "--allow-draft",
        "--pretty",
      ],
      silentIo
    );
    expect(parsed.mode).toBe("queued-stack");
    expect(parsed.stackPrs.map(Number)).toEqual([10, 11, 12]);
    expect(parsed.polling).toEqual({
      interval: 2.5,
      sweepInterval: 30,
      timeout: 0,
      maxQueryErrors: 3,
      allowDraft: true,
      allowNoChecks: false,
    });
    expect(parsed.pretty).toBe(true);
  });

  it("rejects every invalid mode and numeric shape as usage", async () => {
    const invalid = [
      ["--unknown"],
      ["--interval", "0"],
      ["--sweep-interval", "-1"],
      ["--timeout", "-1"],
      ["--max-query-errors", "1.5"],
      ["--stack", "--queued-stack"],
      ["--stack-prs", "1,2"],
      ["--queued-stack", "--stack-prs", "1,1"],
      ["--owner", "other", "--repo", "project"],
      ["--owner", "other", "--pr", "1"],
    ];
    for (const argv of invalid) {
      const harness = testRuntime(fakeReader());
      expect(await main(argv, harness.runtime)).toBe(64);
      expect(harness.stdout).toEqual([]);
      expect(harness.stderr.join("")).toContain("error:");
    }
  });
});

describe("rendering", () => {
  const context = {
    owner: "owner",
    repo: "repo",
    number: parsePrNumber(1),
  };
  const status = {
    schemaVersion: 1,
    sequence: 1,
    observedAt: "2026-07-26T00:00:00.000Z",
    mode: "single",
    kind: "STATUS",
    terminal: true,
    exitCode: 0,
    reason: "status-only",
    rows: [
      {
        kind: "merged",
        context,
        facts: {
          context,
          mergeable: "MERGEABLE",
          mergeStateStatus: "CLEAN",
          reviewDecision: "APPROVED",
          headRefOid: "head",
          headRefName: "feature",
          baseRefName: "main",
          state: "MERGED",
          mergedAt: "now",
          isDraft: false,
        },
      },
    ],
  } satisfies WatcherVerdict;

  it("emits compact valid JSON by default", () => {
    const rendered = renderJson(status);
    expect(rendered.endsWith("\n")).toBe(true);
    expect(JSON.parse(rendered)).toEqual(status);
  });

  it("renders the Markdown table from the same verdict only", () => {
    const rendered = renderPretty(status);
    expect(rendered).toContain("| PR | CI | Review | Merge |");
    expect(rendered).toContain(
      "| [#1](https://github.com/owner/repo/pull/1) | \u2014 | \u2014 | ✅ merged |"
    );
  });
});

describe("main", () => {
  it("returns EX_USAGE 64 and writes usage errors only to stderr", async () => {
    const harness = testRuntime(fakeReader());
    expect(await main(["--interval", "0"], harness.runtime)).toBe(64);
    expect(harness.stdout).toEqual([]);
    expect(harness.stderr.join("")).toContain(
      "option '--interval <seconds>' argument '0' is invalid"
    );
  });

  it("bypasses the queue machine for queued-stack status-only", async () => {
    const reader = fakeReader();
    const harness = testRuntime(reader);
    const code = await main(
      [
        "--owner",
        "owner",
        "--repo",
        "repo",
        "--queued-stack",
        "--stack-prs",
        "1",
        "--status-only",
      ],
      harness.runtime
    );
    expect(code).toBe(0);
    expect(harness.stdout).toHaveLength(1);
    const verdict: unknown = JSON.parse(harness.stdout[0]);
    expect(verdict).toMatchObject({
      kind: "STATUS",
      terminal: true,
      exitCode: 0,
      mode: "queued-stack",
    });
    expect(harness.stdout[0]).not.toContain('"kind":"QUEUE"');
  });

  it("returns exit 4 for a hidden GitHub-side CI refusal", async () => {
    const reader = fakeReader({
      facts: { mergeStateStatus: "BLOCKED" },
      fastPath: { kind: "checks", checks: [passingCheck()] },
      commitRollups: [{ oid: "head", state: "FAILURE" }],
    });
    const harness = testRuntime(reader);
    const code = await main(
      ["--owner", "owner", "--repo", "repo", "--pr", "1"],
      harness.runtime
    );
    expect(code).toBe(4);
    expect(harness.stdout).toHaveLength(1);
    expect(JSON.parse(harness.stdout[0])).toMatchObject({
      kind: "BLOCKER",
      exitCode: 4,
      blocker: {
        kind: "failing-checks",
        ci: { kind: "ci-github-rejected" },
      },
    });
  });

  it("shows help without touching the reader", async () => {
    const reader = fakeReader();
    const harness = testRuntime(reader);
    expect(await main(["--help"], harness.runtime)).toBe(0);
    expect(harness.stdout.join("")).toContain("JSON (NDJSON while polling)");
    expect(reader.calls).toEqual([]);
  });
});
