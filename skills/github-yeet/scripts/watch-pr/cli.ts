import { setTimeout as delay } from "node:timers/promises";
import {
  Command,
  CommanderError,
  InvalidArgumentError,
  Option,
} from "commander";
import {
  GhGitHubReader,
  WatcherQueryError,
  discoverStack,
  setIgnoredPendingChecks,
  setTrustedBots,
  setWatchDeadline,
  resolveContext,
} from "./github.ts";
import {
  queryBackoffSeconds,
  runQueued,
  runSimple,
  statusQueryVerdict,
  verdictFactory,
  type WatchClock,
} from "./policy.ts";
import { renderJson, renderPretty } from "./render.ts";
import type * as T from "./types.ts";
import { nonEmpty, parsePrNumber } from "./types.ts";
export interface CliOptions {
  readonly owner: string | null;
  readonly repo: string | null;
  readonly pr: T.PrNumber | null;
  readonly mode: T.WatchMode;
  readonly stackPrs: readonly T.PrNumber[];
  readonly statusOnly: boolean;
  readonly ignoredPendingChecks: readonly string[];
  readonly trustedBots: readonly string[];
  readonly pretty: boolean;
  readonly polling: T.PollingOptions;
}
function positiveNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new InvalidArgumentError("must be greater than zero");
  return parsed;
}
function nonNegativeNumber(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new InvalidArgumentError("must be zero or greater");
  return parsed;
}
function positiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new InvalidArgumentError("must be a positive integer");
  return parsed;
}
function prNumber(value: string): T.PrNumber {
  try {
    return parsePrNumber(Number(value.replace(/^#/, "")));
  } catch {
    throw new InvalidArgumentError("must be a positive integer");
  }
}
function stackPrList(value: string): T.NonEmpty<T.PrNumber> {
  const numbers = value.split(",").map((part) => prNumber(part.trim()));
  if (new Set(numbers).size !== numbers.length)
    throw new InvalidArgumentError("contains a duplicate PR");
  const parsed = nonEmpty(numbers);
  if (parsed === null) throw new InvalidArgumentError("cannot be empty");
  return parsed;
}
interface RawOptions {
  readonly owner?: string;
  readonly repo?: string;
  readonly pr?: T.PrNumber;
  readonly stack: boolean;
  readonly queuedStack: boolean;
  readonly stackPrs?: T.NonEmpty<T.PrNumber>;
  readonly interval: number;
  readonly sweepInterval: number;
  readonly timeout: number;
  readonly maxQueryErrors: number;
  readonly statusOnly: boolean;
  readonly ignorePendingCheck: readonly string[];
  readonly trustBot: readonly string[];
  readonly allowDraft: boolean;
  readonly allowNoChecks: boolean;
  readonly pretty: boolean;
}
export function parseArgs(
  argv: readonly string[],
  io: Pick<CliRuntime, "stdout" | "stderr">
): CliOptions {
  const program = new Command("watch-pr")
    .description(
      "Watch one pull request, a connected stack, or an immutable queued stack.\nJSON (NDJSON while polling) is the default; --pretty renders human text."
    )
    .configureOutput({ writeOut: io.stdout, writeErr: io.stderr })
    .exitOverride()
    .option("--owner <owner>", "GitHub repository owner")
    .option("--repo <repo>", "GitHub repository name")
    .option("--pr <number>", "pull request number", prNumber)
    .addOption(
      new Option("--stack", "watch the connected open stack")
        .default(false)
        .conflicts("queuedStack")
    )
    .option(
      "--queued-stack",
      "watch a frozen stack (--stack-prs) until all PRs merge",
      false
    )
    .option(
      "--stack-prs <n,...>",
      "frozen bottom-to-top queue (queued mode only)",
      stackPrList
    )
    .option("--interval <seconds>", "poll interval", positiveNumber, 60)
    .option(
      "--sweep-interval <seconds>",
      "whole-stack sweep interval",
      positiveNumber,
      300
    )
    .option(
      "--timeout <seconds>",
      "deadline; 0 disables it",
      nonNegativeNumber,
      0
    )
    .option(
      "--max-query-errors <count>",
      "consecutive query-error budget",
      positiveInteger,
      5
    )
    .option("--status-only", "print one status table and exit 0", false)
    .option("--allow-draft", "do not treat a draft as a merge gate", false)
    .option(
      "--allow-no-checks",
      "treat a PR with no checks at all as passing CI (repos without CI)",
      false
    )
    .option(
      "--ignore-pending-check <name>",
      "don't wait on a pending check with exactly this name, e.g. a human approval gate (repeatable)",
      (value: string, previous: readonly string[]) => [...previous, value],
      [] as readonly string[]
    )
    .option(
      "--trust-bot <login>",
      "treat review comments from this bot as trusted, e.g. chatgpt-codex-connector (repeatable; other bots are ignored)",
      (value: string, previous: readonly string[]) => [...previous, value],
      [] as readonly string[]
    )
    .option("--pretty", "render human text instead of JSON", false);
  program.parse(argv, { from: "user" });
  const raw = program.opts<RawOptions>();
  if (raw.stackPrs !== undefined && !raw.queuedStack)
    program.error("error: --stack-prs requires --queued-stack");
  // Each run would otherwise rediscover the stack from its seed PR, and once
  // that PR merges it leaves the open-PR graph: a rearmed watcher would see
  // only the merged seed and report COMPLETE with PRs above it still open.
  if (raw.queuedStack && raw.stackPrs === undefined)
    program.error(
      "error: --queued-stack needs a frozen --stack-prs <n,...> (bottom to top); capture it once from `--stack --status-only` and pass the same list on every run"
    );
  // Without a number, the PR comes from the checkout's branch, which belongs to
  // the checkout's repository; pairing it with another repository would watch
  // an unrelated PR that happens to share the number.
  if (
    (raw.owner !== undefined || raw.repo !== undefined) &&
    (raw.owner === undefined ||
      raw.repo === undefined ||
      (raw.pr === undefined && raw.stackPrs === undefined))
  )
    program.error("error: --owner and --repo must be given together, with --pr");
  return {
    owner: raw.owner ?? null,
    repo: raw.repo ?? null,
    pr: raw.pr ?? null,
    mode: raw.queuedStack ? "queued-stack" : raw.stack ? "stack" : "single",
    stackPrs: raw.stackPrs ?? [],
    statusOnly: raw.statusOnly,
    ignoredPendingChecks: raw.ignorePendingCheck,
    trustedBots: raw.trustBot,
    pretty: raw.pretty,
    polling: {
      interval: raw.interval,
      sweepInterval: raw.sweepInterval,
      timeout: raw.timeout,
      maxQueryErrors: raw.maxQueryErrors,
      allowDraft: raw.allowDraft,
      allowNoChecks: raw.allowNoChecks,
    },
  };
}
export interface CliRuntime {
  readonly reader: T.GitHubReader;
  readonly clock: WatchClock;
  readonly stdout: (value: string) => void;
  readonly stderr: (value: string) => void;
  /** Seconds already spent before main() (a first-run dependency install). */
  readonly spentBeforeStart?: number;
}
function realRuntime(): CliRuntime {
  const startedAt = Number(process.env.WATCH_PR_STARTED_AT);
  return {
    spentBeforeStart:
      Number.isFinite(startedAt) && startedAt > 0
        ? Math.max(0, (Date.now() - startedAt) / 1_000)
        : 0,
    reader: new GhGitHubReader(),
    clock: {
      now: () => performance.now() / 1_000,
      observedAt: () => new Date().toISOString(),
      sleep: async (seconds) => {
        await delay(seconds * 1_000);
      },
    },
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  };
}
export async function main(
  argv: readonly string[],
  runtime: CliRuntime = realRuntime()
): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(argv, runtime);
  } catch (error) {
    if (!(error instanceof CommanderError)) throw error;
    return error.exitCode === 0 ? 0 : 64;
  }
  setIgnoredPendingChecks(options.ignoredPendingChecks);
  setTrustedBots(options.trustedBots);
  const render = options.pretty
    ? (verdict: T.WatcherVerdict) =>
        renderPretty(verdict, { allowDraft: options.polling.allowDraft })
    : renderJson;
  const emit = (verdict: T.ProgressVerdict): void =>
    runtime.stdout(render(verdict));
  let anchor: T.PrContext | undefined;
  const discover = async (): Promise<T.NonEmpty<T.PrContext>> => {
    const seed = await resolveContext({
      reader: runtime.reader,
      owner: options.owner,
      repo: options.repo,
      pr: options.pr ?? options.stackPrs[0] ?? null,
    });
    anchor = seed;
    return (
      nonEmpty(options.stackPrs.map((number) => ({ ...seed, number }))) ??
      (options.mode === "single"
        ? [seed]
        : await discoverStack(runtime.reader, seed))
    );
  };
  // Discovery gets the same retry budget, backoff and deadline as polling, so
  // one transient `gh` failure at startup doesn't end the watch.
  const stamp = verdictFactory(runtime.clock, options.mode);
  const started = runtime.clock.now();
  const { maxQueryErrors, interval } = options.polling;
  // --timeout covers the whole command, including a first-run install that
  // happened before this process started.
  const timeout =
    options.polling.timeout > 0
      ? options.polling.timeout - (runtime.spentBeforeStart ?? 0)
      : 0;
  if (options.polling.timeout > 0 && timeout <= 0) {
    const verdict = stamp({
      kind: "TIMEOUT",
      terminal: true,
      exitCode: 5,
      reason: { kind: "startup" },
    });
    runtime.stdout(render(verdict));
    return verdict.exitCode;
  }
  setWatchDeadline(timeout > 0 ? Date.now() + timeout * 1_000 : null);
  let contexts: T.NonEmpty<T.PrContext> | null = null;
  for (let failures = 1; contexts === null; failures += 1) {
    try {
      contexts = await discover();
    } catch (error) {
      if (!(error instanceof WatcherQueryError)) throw error;
      const elapsed = runtime.clock.now() - started;
      const remaining = timeout > 0 ? timeout - elapsed : Infinity;
      // Past the deadline a retryable failure is a timeout (the caller
      // reruns), even on the last allowed attempt.
      if (error.failure.retryable && remaining <= 0) {
        const verdict = stamp({
          kind: "TIMEOUT",
          terminal: true,
          exitCode: 5,
          reason: { kind: "status-unavailable", failure: error.failure },
        });
        runtime.stdout(render(verdict));
        return verdict.exitCode;
      }
      if (!error.failure.retryable || failures >= maxQueryErrors) {
        const verdict = statusQueryVerdict(stamp, failures, error.failure);
        runtime.stdout(render(verdict));
        return verdict.exitCode;
      }
      const retryInSeconds = Math.min(
        queryBackoffSeconds(interval, failures),
        remaining
      );
      emit(
        stamp({
          kind: "RETRY",
          terminal: false,
          failure: error.failure,
          consecutiveFailures: failures,
          retryInSeconds,
        })
      );
      await runtime.clock.sleep(retryInSeconds);
      if (timeout > 0 && runtime.clock.now() - started >= timeout) {
        const verdict = stamp({
          kind: "TIMEOUT",
          terminal: true,
          exitCode: 5,
          reason: { kind: "status-unavailable", failure: error.failure },
        });
        runtime.stdout(render(verdict));
        return verdict.exitCode;
      }
    }
  }
  // Polling gets only what discovery left of --timeout, so retries at startup
  // can't stretch the run to nearly twice the limit. A discovery that ran past
  // the deadline stops here rather than starting a snapshot.
  const left = timeout - (runtime.clock.now() - started);
  if (timeout > 0 && left <= 0) {
    const verdict = stamp({
      kind: "TIMEOUT",
      terminal: true,
      exitCode: 5,
      reason: { kind: "discovery" },
    });
    runtime.stdout(render(verdict));
    return verdict.exitCode;
  }
  const polling: T.PollingOptions =
    timeout > 0 ? { ...options.polling, timeout: left } : options.polling;
  const dependencies = { reader: runtime.reader, clock: runtime.clock, emit };
  const verdict =
    options.mode === "queued-stack" && !options.statusOnly
      ? await runQueued({ dependencies, contexts, options: polling, stamp })
      : await runSimple({
          dependencies,
          contexts,
          mode: options.mode,
          statusOnly: options.statusOnly,
          options: polling,
          stamp,
          ...(options.mode === "stack"
            ? {
                rediscover: (from: T.PrContext) =>
                  discoverStack(runtime.reader, from),
                ...(anchor === undefined ? {} : { anchor }),
              }
            : {}),
        });
  runtime.stdout(render(verdict));
  return verdict.exitCode;
}
