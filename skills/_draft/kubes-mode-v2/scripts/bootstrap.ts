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
 * installed so the install itself can't outlast a short deadline. Null when
 * absent, 0 or malformed; the CLI validates it properly later.
 */
function requestedTimeoutMs(argv: readonly string[]): number | null {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = arg === "--timeout" ? argv[i + 1] : arg.startsWith("--timeout=") ? arg.slice(10) : undefined;
    if (value === undefined) continue;
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : null;
  }
  return null;
}

export function ensureDependenciesInstalled(): void {
  const startedAt = Date.now();
  const requested = requestedTimeoutMs(process.argv.slice(2));
  const installTimeoutMs = Math.min(INSTALL_TIMEOUT_MS, requested ?? Infinity);
  if (!Bun.semver.satisfies(Bun.version, `>=${MINIMUM_BUN}`)) {
    throw new Error(
      `watch-pr needs Bun >= ${MINIMUM_BUN} (found ${Bun.version}); run \`bun upgrade\``
    );
  }
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
    throw new Error(
      `bun install --frozen-lockfile did not finish within ${installTimeoutMs / 1_000}s`
    );
  }
  if (result.exitCode !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(
      `bun install --frozen-lockfile exited with status ${result.exitCode}`
    );
  }
  if (!existsSync(commanderPackagePath)) {
    throw new Error(
      "bun install --frozen-lockfile completed without installing commander"
    );
  }

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
