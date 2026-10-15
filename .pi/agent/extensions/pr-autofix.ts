import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * `/autofix [pr] [--no-checks] | off | status` — Claude Desktop style PR auto-fix.
 * Without a number, the current branch's PR is resolved once, when autofix starts.
 * The checkout must be on the PR's branch, at start and at every wake.
 *
 * Runs the github-yeet skill's `watch-pr` in the background and wakes the agent
 * with the verdict when the PR has conflicts, actionable review threads or
 * failing checks. The skill's references/autofix.md is the fixing playbook;
 * this file only watches and wakes.
 */

const STATUS_KEY = "autofix";
// After a wake, give the agent's push time to register new check runs before
// polling again, or the watcher would re-read the old failure.
const REARM_DELAY_MS = 30_000;
// Nothing to do (READY, waiting on a human, or a repeat verdict): poll slowly
// so late review comments still wake the agent.
const IDLE_POLL_MS = 5 * 60_000;
// Bounds token spend per /autofix run. The playbook's own cap is 3 attempts
// per check or thread; this catches loops across many of them.
const MAX_WAKES = 10;
// Enough for the last few lines of an error, which is all the notice shows.
const STDERR_TAIL_CHARS = 4_000;

const WATCHER_CANDIDATES = [
  process.env.GITHUB_YEET_WATCH_PR,
  join(homedir(), ".agents/skills/github-yeet/scripts/watch-pr/watch-pr"),
  join(homedir(), ".pi/agent/skills/github-yeet/scripts/watch-pr/watch-pr"),
  join(homedir(), ".claude/skills/github-yeet/scripts/watch-pr/watch-pr"),
];

interface Watch {
  readonly cwd: string;
  readonly pr: number;
  /** The agent commits and pushes in cwd, so its push target must stay this. */
  readonly head: PrHead;
  readonly allowNoChecks: boolean;
  child: ChildProcess | null;
  timer: ReturnType<typeof setTimeout> | null;
  awaitingAgent: boolean;
  lastKey: string | null;
  wakes: number;
}

interface Verdict {
  readonly kind: string;
  readonly exitCode?: number;
  readonly blocker?: Record<string, any>;
  readonly scope?: { kind: string; pr?: { kind: string } };
}

function output(command: string, args: string[], cwd: string): Promise<string | null> {
  return new Promise((resolve) =>
    execFile(command, args, { cwd }, (error, stdout) => resolve(error ? null : stdout.trim())),
  );
}

interface PrHead {
  readonly number: number;
  readonly headRefName: string;
  /** owner/repo the PR's branch lives in; a fork for fork PRs. */
  readonly headRepository: string;
}

/** The PR (given, or the current branch's) and where its branch lives. */
async function prHead(cwd: string, pr: number | null): Promise<PrHead | null> {
  const args = ["pr", "view", ...(pr === null ? [] : [String(pr)]), "--json", "number,headRefName,headRepository"];
  const json = await output("gh", args, cwd);
  if (json === null) return null;
  try {
    const value = JSON.parse(json) as {
      number?: unknown;
      headRefName?: unknown;
      headRepository?: { nameWithOwner?: unknown } | null;
    };
    const repository = value.headRepository?.nameWithOwner;
    return typeof value.number === "number" && typeof value.headRefName === "string" && typeof repository === "string"
      ? { number: value.number, headRefName: value.headRefName, headRepository: repository }
      : null;
  } catch {
    return null;
  }
}

function githubRepository(url: string): string | null {
  const match = /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(url.trim());
  return match?.[1] ?? null;
}

/**
 * Where a plain `git push` from cwd lands, which is what the playbook runs:
 * the push remote (branch pushRemote, then remote.pushDefault, then the
 * upstream remote) and the upstream branch.
 */
async function pushTarget(cwd: string): Promise<{ branch: string; repository: string | null; ref: string | null } | null> {
  const branch = await output("git", ["branch", "--show-current"], cwd);
  if (!branch) return null;
  const config = (key: string) => output("git", ["config", "--get", key], cwd);
  const remote =
    (await config(`branch.${branch}.pushRemote`)) || (await config("remote.pushDefault")) || (await config(`branch.${branch}.remote`));
  const merge = await config(`branch.${branch}.merge`);
  const url = remote ? await output("git", ["remote", "get-url", "--push", remote], cwd) : null;
  return {
    branch,
    repository: url ? githubRepository(url) : null,
    ref: merge?.replace(/^refs\/heads\//, "") ?? null,
  };
}

/**
 * Null when a fix committed and pushed from cwd lands on the PR's branch.
 * A name match isn't enough: a fork PR from `main` matches the base repo's
 * `main`, so the push repository has to be the PR's head repository too.
 */
async function checkoutMismatch(cwd: string, head: PrHead): Promise<string | null> {
  const target = await pushTarget(cwd);
  const want = `${head.headRepository}:${head.headRefName}`;
  if (target === null) return `the checkout is on a detached HEAD, not PR #${head.number}'s branch ${want}`;
  if (target.branch !== head.headRefName) return `the checkout is on ${target.branch}, not PR #${head.number}'s branch ${want}`;
  if (target.repository?.toLowerCase() !== head.headRepository.toLowerCase() || target.ref !== head.headRefName)
    return `${target.branch} pushes to ${target.repository ?? "an unknown remote"}:${target.ref ?? "?"}, not PR #${head.number}'s branch ${want}`;
  return null;
}

function findWatcher(): string | null {
  for (const candidate of WATCHER_CANDIDATES) if (candidate && existsSync(candidate)) return candidate;
  return null;
}

/** Identifies "the same problem" so an unchanged verdict never wakes the agent twice. */
function verdictKey(verdict: Verdict): string {
  const b = verdict.blocker ?? {};
  switch (b.kind) {
    case "merge-conflicts":
      return `conflicts:${b.facts?.headRefOid}`;
    case "review-threads":
      // The newest comment's time makes a reviewer's follow-up on an already
      // seen thread a new key, so it wakes the agent again.
      return `threads:${(b.threads ?? [])
        .map((t: { id: string; latestCommentAt?: string | null }) => `${t.id}@${t.latestCommentAt ?? ""}`)
        .sort()
        .join(",")}`;
    case "failing-checks":
      // The head SHA separates a failure after a push from the one already
      // reported; completedAt separates a retry of the same commit, for
      // providers that reuse a check's name and link.
      return `checks:${b.headRefOid}:${(b.ci?.failed ?? [])
        .map((c: { name: string; link: string; completedAt?: string }) => `${c.name}@${c.link}@${c.completedAt ?? ""}`)
        .sort()
        .join(",")}`;
    default:
      return `${verdict.kind}:${b.kind ?? ""}:${b.reason ?? ""}`;
  }
}

function wakeMessage(watch: Watch, verdict: Verdict): string {
  const pr = `PR #${watch.pr}`;
  return [
    `Autofix wake for ${pr}: watch-pr exited ${verdict.exitCode} (${verdict.blocker?.kind}).`,
    "Use the github-yeet skill's Watch & autofix section and follow references/autofix.md for this verdict.",
    "Do not run the watcher yourself; push your fix and end the turn, and /autofix will re-check.",
    "",
    "```json",
    JSON.stringify(verdict),
    "```",
  ].join("\n");
}

export default function (pi: ExtensionAPI) {
  let watch: Watch | null = null;
  let ui: ExtensionContext["ui"] | null = null;

  const status = (text: string | undefined) => ui?.setStatus?.(STATUS_KEY, text);
  const notify = (text: string, level: "info" | "warning" | "error" = "info") => ui?.notify?.(text, level);

  function stop(reason?: string) {
    if (!watch) return;
    if (watch.timer) clearTimeout(watch.timer);
    watch.child?.kill();
    watch = null;
    status(undefined);
    if (reason) notify(`autofix stopped: ${reason}`);
  }

  function schedule(ms: number) {
    if (!watch) return;
    if (watch.timer) clearTimeout(watch.timer);
    watch.timer = setTimeout(run, ms);
  }

  function run() {
    const current = watch;
    if (!current) return;
    current.timer = null;
    const watcher = findWatcher();
    if (!watcher) return stop("github-yeet watch-pr not found; set GITHUB_YEET_WATCH_PR");

    const args = ["--allow-draft", "--pr", String(current.pr)];
    if (current.allowNoChecks) args.push("--allow-no-checks");
    status(`autofix #${current.pr}: watching`);

    // Without --timeout the watcher prints a WAITING line every poll for as
    // long as CI stays pending, so keep only the newest complete line.
    let partial = "";
    let lastLine = "";
    const child = spawn(watcher, args, { cwd: current.cwd, stdio: ["ignore", "pipe", "pipe"] });
    current.child = child;
    // A missing or non-executable watcher emits "error"; unhandled, it would
    // crash the whole pi process rather than just stop autofix.
    child.on("error", (error) => {
      if (watch === current) stop(`could not run watch-pr: ${error.message}`);
    });
    // stderr must be read too, or a chatty failure (a first-run `bun install`
    // dumping its log) fills the pipe and the watcher never exits. Keep a tail
    // for the stop message.
    let stderrTail = "";
    child.stderr?.setEncoding("utf8").on("data", (chunk: string) => {
      stderrTail = (stderrTail + chunk).slice(-STDERR_TAIL_CHARS);
    });
    child.stdout?.setEncoding("utf8").on("data", (chunk: string) => {
      const lines = (partial + chunk).split("\n");
      partial = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) lastLine = line;
    });
    child.on("close", (code) => {
      if (watch !== current) return; // stopped or restarted meanwhile
      current.child = null;
      const last = partial.trim() || lastLine;
      let verdict: Verdict;
      try {
        verdict = JSON.parse(last);
      } catch {
        const detail = stderrTail.trim().split("\n").pop();
        return stop(`watch-pr exited ${code} without a verdict${detail ? `: ${detail}` : ""}`);
      }
      handle(current, verdict, code ?? -1);
    });
  }

  function handle(current: Watch, verdict: Verdict, code: number) {
    const tag = `autofix #${current.pr}`;
    switch (code) {
      case 0:
        if (verdict.scope?.pr?.kind === "merged-pr") return stop("PR merged");
        if (current.lastKey !== "READY") notify(`${tag}: PR is ready`);
        current.lastKey = "READY";
        status(`${tag}: ready`);
        return schedule(IDLE_POLL_MS);
      case 2:
      case 3:
      case 4: {
        const key = verdictKey(verdict);
        if (key === current.lastKey) {
          status(`${tag}: waiting for a change`);
          return schedule(IDLE_POLL_MS);
        }
        if (current.wakes >= MAX_WAKES) return stop(`reached ${MAX_WAKES} wakes; check the PR yourself`);
        current.lastKey = key;
        current.wakes += 1;
        current.awaitingAgent = true;
        status(`${tag}: agent fixing (${current.wakes}/${MAX_WAKES})`);
        // The agent fixes and pushes whatever is checked out. If that has
        // moved off the PR's branch since /autofix started, a wake would land
        // the fix on the wrong branch, so stop instead.
        void checkoutMismatch(current.cwd, current.head).then((mismatch) => {
          if (watch !== current) return;
          if (mismatch !== null) return stop(mismatch);
          pi.sendUserMessage(wakeMessage(current, verdict), { deliverAs: "followUp" });
        });
        return;
      }
      case 5:
        return schedule(0);
      case 6:
        if (verdict.blocker?.reason === "closed-without-merge") return stop("PR closed");
        if (current.lastKey !== verdictKey(verdict)) notify(`${tag}: needs a human (${verdict.blocker?.reason})`, "warning");
        current.lastKey = verdictKey(verdict);
        status(`${tag}: needs a human`);
        return schedule(IDLE_POLL_MS);
      default: {
        const detail = verdict.blocker?.failure?.detail ?? `exit ${code}`;
        const hint = /no checks reported/.test(detail) ? " (no CI? use /autofix --no-checks)" : "";
        return stop(`${detail}${hint}`);
      }
    }
  }

  pi.on("agent_end", async (_event, ctx) => {
    ui = ctx.ui;
    if (watch?.awaitingAgent) {
      watch.awaitingAgent = false;
      schedule(REARM_DELAY_MS);
    }
  });

  pi.on("session_shutdown", async () => stop());

  pi.registerCommand("autofix", {
    description: "Watch this branch's PR and wake the agent on CI failures, conflicts or review comments",
    getArgumentCompletions: (prefix) =>
      ["off", "status", "--no-checks"].filter((item) => item.startsWith(prefix)).map((value) => ({ value, label: value })),
    handler: async (args, ctx) => {
      ui = ctx.ui;
      const words = args.trim().split(/\s+/).filter(Boolean);
      if (words[0] === "off") return stop("turned off");
      if (words[0] === "status") {
        return notify(
          watch
            ? `autofix watching #${watch.pr}; ${watch.wakes}/${MAX_WAKES} wakes; last=${watch.lastKey ?? "none"}`
            : "autofix is off",
        );
      }
      const prArg = words.find((word) => /^#?\d+$/.test(word));
      // Pin the number now: the watcher reruns for as long as autofix is on,
      // and resolving the branch each time would follow a checkout to another PR.
      const head = await prHead(ctx.cwd, prArg ? Number(prArg.replace("#", "")) : null);
      if (head === null)
        return notify(
          prArg ? `autofix: could not read PR ${prArg}` : "autofix: this branch has no PR; pass a number, e.g. /autofix 123",
          "error",
        );
      const mismatch = await checkoutMismatch(ctx.cwd, head);
      if (mismatch !== null)
        return notify(`autofix: ${mismatch}. Check out the PR first (gh pr checkout ${head.number}); the fix is committed and pushed from here.`, "error");
      const pr = head.number;
      stop();
      watch = {
        cwd: ctx.cwd,
        pr,
        head,
        allowNoChecks: words.includes("--no-checks"),
        child: null,
        timer: null,
        awaitingAgent: false,
        lastKey: null,
        wakes: 0,
      };
      notify(`autofix on for PR #${watch.pr}`);
      run();
    },
  });
}
