import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const scriptsDirectory = import.meta.dir;
const nodeModulesDirectory = join(scriptsDirectory, "node_modules");
const commanderPackagePath = join(
  nodeModulesDirectory,
  "commander",
  "package.json"
);
const installKeyPath = join(
  nodeModulesDirectory,
  ".kubes-mode-v2-scripts-install-key"
);

function currentInstallKey(): string {
  return createHash("sha256")
    .update(readFileSync(join(scriptsDirectory, "package.json")))
    .update("\0")
    .update(readFileSync(join(scriptsDirectory, "bun.lock")))
    .digest("hex");
}

// bun.lock is lockfile v1 with configVersion, which Bun 1.3.2 introduced.
// Older Bun rejects it under --frozen-lockfile with a confusing error, so name
// the requirement instead. Bun 1.4+ keeps v1 lockfiles at v1 on install.
const MINIMUM_BUN = "1.3.2";
// Six small packages install in seconds; two minutes covers a slow network
// without letting a stalled install hang the watcher.
const INSTALL_TIMEOUT_MS = 120_000;
// The restarted watcher reads this to charge the install against --timeout.
export const STARTED_AT_ENV = "WATCH_PR_STARTED_AT";

/**
 * The --timeout the watcher was given, in ms, read before commander is
 * installed so the install itself can't outlast a short deadline. Like
 * commander, the last occurrence wins and `--` ends option parsing. Null when
 * absent, 0 or malformed; the CLI validates it properly later.
 */
export function requestedTimeoutMs(argv: readonly string[]): number | null {
  let value: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") break;
    if (arg === "--timeout") {
      value = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--timeout=")) value = arg.slice(10);
  }
  if (value === undefined) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : null;
}

/**
 * Writes a terminal verdict and exits, for failures before the CLI can load
 * (commander isn't installed yet). Mirrors cli.ts and render.ts by hand, so
 * callers always get a last stdout line they can classify.
 */
function terminal(
  argv: readonly string[],
  verdict: { readonly exitCode: number; readonly [key: string]: unknown },
  pretty: string
): never {
  const mode = argv.includes("--queued-stack")
    ? "queued-stack"
    : argv.includes("--stack")
      ? "stack"
      : "single";
  process.stdout.write(
    argv.includes("--pretty")
      ? `${pretty}\n`
      : `${JSON.stringify({
          schemaVersion: 1,
          sequence: 1,
          observedAt: new Date().toISOString(),
          mode,
          terminal: true,
          ...verdict,
        })}\n`
  );
  process.exit(verdict.exitCode);
}
/** Exit 5, reason `startup`: the install ran out of the --timeout budget. */
function startupTimeout(argv: readonly string[]): never {
  return terminal(
    argv,
    { kind: "TIMEOUT", exitCode: 5, reason: { kind: "startup" } },
    "TIMEOUT: --timeout ran out installing dependencies"
  );
}
/** Exit 7: the watcher can't start (old Bun, failed install). Retrying won't help. */
function startupFailure(argv: readonly string[], detail: string): never {
  return terminal(
    argv,
    {
      kind: "BLOCKER",
      exitCode: 7,
      blocker: {
        kind: "status-query",
        failures: 1,
        failure: { kind: "bootstrap-failed", retryable: false, detail },
      },
    },
    `BLOCKER: status-query\nfailures=1\ndetail=${detail}\naction=fix the watcher's install (see stderr), then rearm`
  );
}

export function ensureDependenciesInstalled(): void {
  const startedAt = Date.now();
  const requested = requestedTimeoutMs(process.argv.slice(2));
  const installTimeoutMs = Math.min(INSTALL_TIMEOUT_MS, requested ?? Infinity);
  if (!Bun.semver.satisfies(Bun.version, `>=${MINIMUM_BUN}`))
    startupFailure(
      process.argv.slice(2),
      `watch-pr needs Bun >= ${MINIMUM_BUN} (found ${Bun.version}); run \`bun upgrade\``
    );
  const installKey = currentInstallKey();
  if (
    existsSync(commanderPackagePath) &&
    existsSync(installKeyPath) &&
    readFileSync(installKeyPath, "utf8").trim() === installKey
  ) {
    return;
  }

  const result = Bun.spawnSync(
    [process.execPath, "install", "--frozen-lockfile"],
    { cwd: scriptsDirectory, timeout: installTimeoutMs }
  );
  if (result.exitCode === null || result.signalCode) {
    process.stderr.write(
      `bun install --frozen-lockfile did not finish within ${installTimeoutMs / 1_000}s\n`
    );
    startupTimeout(process.argv.slice(2));
  }
  if (result.exitCode !== 0) {
    // stdout is reserved for verdicts, so the installer's log goes to stderr.
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    startupFailure(
      process.argv.slice(2),
      `bun install --frozen-lockfile exited with status ${result.exitCode}`
    );
  }
  if (!existsSync(commanderPackagePath))
    startupFailure(
      process.argv.slice(2),
      "bun install --frozen-lockfile completed without installing commander"
    );

  writeFileSync(installKeyPath, `${installKey}\n`);

  const restarted = Bun.spawnSync([process.execPath, ...process.argv.slice(1)], {
    cwd: process.cwd(),
    env: { ...process.env, [STARTED_AT_ENV]: String(startedAt) },
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exit(restarted.exitCode ?? 1);
}
