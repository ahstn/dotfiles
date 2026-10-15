import { spawn } from "node:child_process";
import type * as T from "./types.ts";
import { nonEmpty, parsePrNumber } from "./types.ts";
export const REVIEW_THREADS_QUERY = `
query ReviewThreads($owner: String!, $repo: String!, $pr: Int!, $after: String) {
  viewer { login }
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          isResolved
          comments(first: 1) {
            nodes {
              ...ThreadComment
            }
          }
          latest: comments(last: 20) {
            pageInfo {
              hasPreviousPage
              startCursor
            }
            nodes {
              ...ThreadComment
            }
          }
        }
      }
    }
  }
}
fragment ThreadComment on PullRequestReviewComment {
  body
  createdAt
  updatedAt
  path
  line
  authorAssociation
  author { __typename login }
}
`;
export const THREAD_COMMENTS_QUERY = `
query ThreadComments($id: ID!, $before: String!) {
  node(id: $id) {
    ... on PullRequestReviewThread {
      comments(last: 100, before: $before) {
        pageInfo {
          hasPreviousPage
          startCursor
        }
        nodes {
          ...ThreadComment
        }
      }
    }
  }
}
fragment ThreadComment on PullRequestReviewComment {
  body
  createdAt
  updatedAt
  path
  line
  authorAssociation
  author { __typename login }
}
`;
// Threads past the newest 20 comments are read in full, because an edit to an
// older trusted comment can be the newest activity. A thread flooded past this
// many pages stops there; if no trusted comment was loaded it is parked (see
// decideThread) rather than costing an API call per hundred replies.
const MAX_HISTORY_PAGES = 10;
export const PR_COMMIT_STATUS_QUERY =
  "\nquery PrCommitStatuses($owner: String!, $repo: String!, $pr: Int!) {\n  repository(owner: $owner, name: $repo) {\n    pullRequest(number: $pr) {\n      commits(last: 50) {\n        nodes {\n          commit {\n            oid\n            statusCheckRollup {\n              state\n            }\n          }\n        }\n      }\n    }\n  }\n}\n";
export const PR_CHECK_ROLLUP_QUERY =
  "\nquery PrCheckRollup($owner: String!, $repo: String!, $pr: Int!, $after: String) {\n  repository(owner: $owner, name: $repo) {\n    pullRequest(number: $pr) {\n      commits(last: 1) {\n        nodes {\n          commit {\n            statusCheckRollup {\n              contexts(first: 100, after: $after) {\n                pageInfo {\n                  hasNextPage\n                  endCursor\n                }\n                nodes {\n                  __typename\n                  ... on CheckRun {\n                    name\n                    status\n                    conclusion\n                    detailsUrl\n                    completedAt\n                  }\n                  ... on StatusContext {\n                    context\n                    state\n                    targetUrl\n                    createdAt\n                  }\n                }\n              }\n            }\n          }\n        }\n      }\n    }\n  }\n}\n";

interface CommandResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}
export class WatcherQueryError extends Error {
  readonly failure: T.QueryFailure;
  constructor(failure: T.QueryFailure) {
    super(failure.detail);
    this.name = "WatcherQueryError";
    this.failure = failure;
  }
}
export class ChecksUnavailable extends WatcherQueryError {
  constructor(detail: string) {
    super({ kind: "checks-unavailable", retryable: true, detail });
    this.name = "ChecksUnavailable";
  }
}
const firstLine = (value: string): string =>
  value.trim().split(/\r?\n/, 1)[0]?.slice(0, 240) ?? "";
// A gh call normally takes seconds; this caps one stalled by the network or
// a credential helper even when no --timeout was given.
const CALL_TIMEOUT_MS = 120_000;
let watchDeadline: number | null = null;
/**
 * Wall-clock time (ms since epoch) by which every gh call must finish, from
 * --timeout. Deadline checks between calls can't interrupt a hung child, so
 * each call is killed at whichever comes first: this or CALL_TIMEOUT_MS.
 */
export function setWatchDeadline(at: number | null): void {
  watchDeadline = at;
}
function run(argv: readonly [string, ...string[]]): Promise<CommandResult> {
  const budget = Math.max(
    0,
    Math.min(
      CALL_TIMEOUT_MS,
      watchDeadline === null ? Infinity : watchDeadline - Date.now()
    )
  );
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    const settle = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    // Resolve on the timer itself: a grandchild (a credential helper, say)
    // can hold the pipes open, so "close" may never come.
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      child.stdout.destroy();
      child.stderr.destroy();
      settle({
        code: -1,
        stdout: "",
        stderr: `${argv.slice(0, 3).join(" ")} timed out after ${Math.round(budget / 1000)}s`,
      });
    }, budget);
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    // A spawn failure must surface as a WatcherQueryError, which the poll
    // loop and discovery handle, not a raw Error that crashes the CLI. A
    // missing gh won't appear by retrying; anything else (EAGAIN, EMFILE)
    // may, so it settles as a failed command and takes the retry path.
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) return;
      if (error.code === "ENOENT") {
        settled = true;
        clearTimeout(timer);
        reject(
          new WatcherQueryError({
            kind: "command-missing",
            retryable: false,
            detail: `${argv[0]} not found on PATH; install it and run \`gh auth login\``,
          })
        );
        return;
      }
      settle({
        code: -1,
        stdout: "",
        stderr: `could not start ${argv[0]}: ${error.message}`,
      });
    });
    child.on("close", (code) => settle({ code: code ?? -1, stdout, stderr }));
  });
}
function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new WatcherQueryError({
      kind: "json-parse",
      retryable: true,
      detail: `${label}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}
// Failures that retrying can't fix: gh's exit 4 (authentication required),
// bad credentials, no access, or a PR/repo that doesn't exist. Retrying them
// only burns --timeout and ends as a misleading TIMEOUT. Rate limits also
// come back as 403 but clear up, so they stay retryable.
function isPermanent(result: CommandResult): boolean {
  if (result.code === 4) return true;
  if (/rate limit/i.test(result.stderr)) return false;
  return /HTTP 40[134]\b|Could not resolve to an? |no pull requests found|gh auth login/i.test(
    result.stderr
  );
}
async function runJson(argv: readonly [string, ...string[]]): Promise<unknown> {
  const result = await run(argv);
  if (result.code !== 0) {
    const detail =
      firstLine(result.stderr) || `${argv.join(" ")} exited ${result.code}`;
    throw new WatcherQueryError(
      isPermanent(result)
        ? { kind: "command-rejected", retryable: false, code: result.code, detail }
        : { kind: "command-exit", retryable: true, code: result.code, detail }
    );
  }
  return parseJson(result.stdout, argv.join(" "));
}
function raw(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
function missing(path: string, value?: unknown): never {
  throw new WatcherQueryError({
    kind: "missing-key",
    retryable: true,
    detail:
      value === undefined
        ? `missing ${path}`
        : `invalid ${path}: ${raw(value)}`,
    ...(value === undefined ? {} : { rawValue: raw(value) }),
  });
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) missing(path, value);
  return value;
}
function list(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) missing(path, value);
  return value;
}
function at(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    const object = record(current, path.join("."));
    if (!(key in object)) missing(path.join("."));
    current = object[key];
  }
  return current;
}
function string(value: unknown, path: string): string {
  if (typeof value !== "string") missing(path, value);
  return value;
}
const optionalString = (value: unknown, path: string): string | null =>
  value === null ? null : string(value, path);
function enumValue<const V extends readonly string[]>(
  value: unknown,
  values: V,
  path: string
): V[number] {
  if (typeof value === "string")
    for (const candidate of values) if (candidate === value) return candidate;
  return missing(path, value);
}
const nullableEnum = <const V extends readonly string[]>(
  value: unknown,
  values: V,
  path: string
): V[number] | null => (value === null ? null : enumValue(value, values, path));
const MERGE_STATES = [
  "BEHIND",
  "BLOCKED",
  "CLEAN",
  "CONFLICTING",
  "DIRTY",
  "DRAFT",
  "HAS_HOOKS",
  "UNKNOWN",
  "UNSTABLE",
] as const satisfies readonly T.MergeStateStatus[];
const ROLLUP_STATES = [
  "ERROR",
  "EXPECTED",
  "FAILURE",
  "PENDING",
  "SUCCESS",
] as const;
const REVIEW_DECISIONS = [
  "APPROVED",
  "CHANGES_REQUESTED",
  "REVIEW_REQUIRED",
] as const;
// `gh pr view` reports no review decision as "", not null. Only this field does
// it, so the normalization stays here rather than in nullableEnum, where it
// would stop a genuinely unexpected rollup state from failing closed.
const reviewDecision = (value: unknown): T.ReviewDecision =>
  nullableEnum(
    value === "" ? null : value,
    REVIEW_DECISIONS,
    "pull request.reviewDecision"
  );
function parsePrUrl(value: string): T.PrContext {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      parts.length !== 4 ||
      parts[2] !== "pull"
    )
      throw new Error("not a canonical GitHub pull URL");
    return {
      owner: parts[0],
      repo: parts[1],
      number: parsePrNumber(Number(parts[3])),
    };
  } catch (error) {
    throw new WatcherQueryError({
      kind: "invalid-context-url",
      retryable: false,
      rawValue: value,
      detail: `could not infer owner/repo from PR URL: ${value} (${error instanceof Error ? error.message : String(error)})`,
    });
  }
}
function checkDetails(value: Record<string, unknown>, nameKey: string) {
  return {
    name: string(value[nameKey], nameKey),
    description: typeof value.description === "string" ? value.description : "",
    link:
      typeof value.link === "string"
        ? value.link
        : typeof value.detailsUrl === "string"
          ? value.detailsUrl
          : "",
    workflow: typeof value.workflow === "string" ? value.workflow : "",
    completedAt:
      typeof value.completedAt === "string"
        ? value.completedAt
        : typeof value.createdAt === "string"
          ? value.createdAt
          : "",
  };
}
export function parseFastCheck(value: unknown): T.Check {
  const object = record(value, "check");
  const details = checkDetails(object, "name");
  const state = string(object.state, "check.state").toUpperCase();
  const bucket = string(object.bucket, "check.bucket");
  if (
    bucket === "fail" ||
    ["FAILURE", "ERROR", "ACTION_REQUIRED"].includes(state)
  )
    return { ...details, kind: "failed", reportedState: state };
  if (bucket === "pending") return pendingOrGate(details, state);
  if (bucket === "pass")
    return { ...details, kind: "passed", reportedState: state };
  if (bucket === "skipping")
    return { ...details, kind: "skipped", reportedState: state };
  return { ...details, kind: "failed", reportedState: state };
}
// The owner-approval gate is excluded from pending everywhere, so the rule has
// one home. Classifying it as pending on either read path makes the watcher
// wait on a human, which is the behaviour #172004 removed from the Python.
function pendingOrGate(
  details: {
    readonly name: string;
    readonly description: string;
    readonly link: string;
    readonly workflow: string;
    readonly completedAt?: string;
  },
  reportedState: string
): T.Check {
  return details.name === "Code Review Gate"
    ? {
        ...details,
        kind: "code-review-gate",
        name: "Code Review Gate",
        reportedState,
      }
    : { ...details, kind: "pending", reportedState };
}
export function mapRollupNode(value: unknown): T.Check | null {
  const object = record(value, "rollup node");
  const typename = object.__typename;
  if (typename !== "CheckRun" && typename !== "StatusContext") return null;
  const details = checkDetails(
    object,
    typename === "CheckRun" ? "name" : "context"
  );
  const link =
    typeof object.targetUrl === "string" ? object.targetUrl : details.link;
  if (typename === "CheckRun") {
    const status =
      typeof object.status === "string" ? object.status.toUpperCase() : "";
    const conclusion =
      typeof object.conclusion === "string"
        ? object.conclusion.toUpperCase()
        : "";
    if (status !== "COMPLETED")
      return pendingOrGate({ ...details, link }, "PENDING");
    if (conclusion === "SUCCESS")
      return { ...details, link, kind: "passed", reportedState: "SUCCESS" };
    if (conclusion === "NEUTRAL" || conclusion === "SKIPPED")
      return { ...details, link, kind: "skipped", reportedState: conclusion };
    return {
      ...details,
      link,
      kind: "failed",
      reportedState: conclusion === "ACTION_REQUIRED" ? conclusion : "FAILURE",
    };
  }
  const state =
    typeof object.state === "string" ? object.state.toUpperCase() : "";
  if (state === "PENDING" || state === "EXPECTED")
    return pendingOrGate({ ...details, link }, "PENDING");
  return state === "SUCCESS"
    ? { ...details, link, kind: "passed", reportedState: state }
    : { ...details, link, kind: "failed", reportedState: state || "FAILURE" };
}
function parseComment(
  value: unknown,
  viewerLogin: string | null
): T.ReviewComment {
  const object = record(value, "review comment");
  const author =
    object.author === null
      ? null
      : record(object.author, "review comment.author");
  const authorLogin =
    author === null
      ? null
      : optionalString(author.login, "review comment.author.login");
  const createdAt = string(object.createdAt, "review comment.createdAt");
  return {
    authorLogin,
    body: string(object.body, "review comment.body"),
    path: optionalString(object.path, "review comment.path"),
    line:
      object.line === null || object.line === undefined
        ? null
        : Number.isInteger(object.line)
          ? Number(object.line)
          : missing("review comment.line", object.line),
    createdAt,
    activityAt:
      typeof object.updatedAt === "string" ? object.updatedAt : createdAt,
    authorAssociation:
      typeof object.authorAssociation === "string"
        ? object.authorAssociation
        : "NONE",
    authorIsBot: author !== null && author.__typename === "Bot",
    isViewer: viewerLogin !== null && authorLogin === viewerLogin,
  };
}
// Mirrors who Claude Desktop's auto-fix listens to: people with write access
// and installed GitHub Apps. CONTRIBUTOR and NONE can be anyone on the internet.
const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
// MEMBER and COLLABORATOR don't imply write access (see requireWriteAccess).
const PERMISSION_CHECKED = new Set(["MEMBER", "COLLABORATOR"]);
// The agent posts through the user's own `gh` login, so authorship alone
// cannot tell the user's review notes from the agent's replies, and the marker
// alone can be pasted by anyone. A comment parks its thread only when it has
// the marker and was written by the `gh` viewer.
export const AUTOFIX_REPLY_MARKER = "<!-- pr-autofix -->";
// Ends a reply on a thread the agent fixed and then resolved. Only unresolved
// threads are read, so seeing it means a reviewer reopened the thread: that is
// new feedback, not an answer awaiting the reviewer.
export const AUTOFIX_FIXED_MARKER = "<!-- pr-autofix:fixed -->";
export type CommentTrust = (comment: T.ReviewComment) => boolean;
export const trustedByAssociation: CommentTrust = (comment) =>
  comment.isViewer ||
  comment.authorIsBot ||
  TRUSTED_ASSOCIATIONS.has(comment.authorAssociation);
/**
 * Re-derives a thread's disposition from the newest comment a trusted author
 * wrote. Untrusted replies are skipped, so an outsider cannot reopen a thread
 * the agent answered, or bump its dedupe key.
 */
export function decideThread(
  thread: T.ReviewThread,
  trusted: CommentTrust
): T.ReviewThread {
  const first = thread.firstComment;
  if (first === null || !trusted(first))
    return {
      ...thread,
      disposition: "untrusted",
      decidingComment: first,
      lastAuthorLogin: first?.authorLogin ?? null,
      latestCommentAt: first?.activityAt ?? null,
    };
  const trustedRecent = thread.recentComments.filter(trusted);
  // With history missing, the deciding trusted comment (or a newer edit to
  // one) may be in the part not read. Neither waking nor parking is safe, so
  // the thread is held for a human (see ThreadDisposition).
  if (!thread.historyComplete)
    return {
      ...thread,
      disposition: "unverifiable",
      decidingComment: null,
      lastAuthorLogin: null,
      latestCommentAt: null,
    };
  // Latest activity, not latest position: a reviewer editing an older comment
  // after the agent's answer is new feedback. Ties keep the later comment.
  const decisive = [first, ...trustedRecent].reduce((best, comment) =>
    comment.activityAt >= best.activityAt ? comment : best
  );
  return {
    ...thread,
    disposition:
      decisive.isViewer &&
      decisive.body.includes(AUTOFIX_REPLY_MARKER) &&
      !decisive.body.includes(AUTOFIX_FIXED_MARKER)
        ? "awaiting-reviewer"
        : "actionable",
    decidingComment: decisive,
    lastAuthorLogin: decisive.authorLogin,
    latestCommentAt: decisive.activityAt,
  };
}
function isBugbot(comment: T.ReviewComment | null): boolean {
  if (comment === null) return false;
  const author = (comment.authorLogin ?? "").toLowerCase();
  const body = comment.body.toLowerCase();
  return (
    author.includes("bugbot") ||
    (author === "cursor" &&
      [
        "bugbot",
        "cursor_automation_id",
        "agentic security review",
        "description start",
        "severity",
      ].some((token) => body.includes(token)))
  );
}
function passKey(comment: T.ReviewComment | null): string | null {
  if (comment === null) return null;
  for (const pattern of [
    /RUN_ID:\s*([a-zA-Z0-9_.:-]+)/,
    /CURSOR_AUTOMATION_ID:\s*([a-zA-Z0-9_.:-]+)/,
  ]) {
    const match = pattern.exec(comment.body);
    if (match?.[1]) return match[1];
  }
  return null;
}
export function parseReviewThreads(value: unknown): readonly T.ReviewThread[] {
  const nodes = list(
    at(value, ["data", "repository", "pullRequest", "reviewThreads", "nodes"]),
    "reviewThreads.nodes"
  );
  const data = isRecord(value) ? value.data : null;
  const viewer = isRecord(data) ? data.viewer : null;
  const viewerLogin =
    isRecord(viewer) && typeof viewer.login === "string" ? viewer.login : null;
  const threads: {
    readonly id: string;
    readonly firstComment: T.ReviewComment | null;
    readonly recentComments: readonly T.ReviewComment[];
    readonly historyComplete: boolean;
    readonly resolved: boolean;
  }[] = [];
  for (const node of nodes) {
    const thread = record(node, "review thread");
    if (typeof thread.isResolved !== "boolean")
      missing("review thread.isResolved", thread.isResolved);
    const comments = list(
      at(thread, ["comments", "nodes"]),
      "review thread.comments.nodes"
    );
    const recent =
      "latest" in thread
        ? list(at(thread, ["latest", "nodes"]), "review thread.latest.nodes")
        : [];
    const latestPage =
      "latest" in thread && isRecord(thread.latest)
        ? thread.latest.pageInfo
        : null;
    threads.push({
      id: string(thread.id, "review thread.id"),
      firstComment:
        comments.length === 0 ? null : parseComment(comments[0], viewerLogin),
      recentComments: recent.map((comment) =>
        parseComment(comment, viewerLogin)
      ),
      historyComplete: !(
        isRecord(latestPage) && latestPage.hasPreviousPage === true
      ),
      resolved: thread.isResolved,
    });
  }
  const keys = new Set<string>();
  let keyless = false;
  for (const thread of threads) {
    if (!isBugbot(thread.firstComment)) continue;
    const key = passKey(thread.firstComment);
    if (key === null) keyless = true;
    else keys.add(key);
  }
  const passes = keys.size > 0 ? keys.size : keyless ? 1 : 0;
  return threads
    .filter((thread) => !thread.resolved)
    .map(({ id, firstComment, recentComments, historyComplete }) =>
      decideThread(
        {
          id,
          firstComment,
          recentComments,
          historyComplete,
          decidingComment: null,
          lastAuthorLogin: null,
          latestCommentAt: null,
          disposition: "actionable",
          isBugbot: isBugbot(firstComment),
          bugbotReviewPasses: passes,
        },
        trustedByAssociation
      )
    );
}
export function parsePullRequest(
  value: unknown,
  context: T.PrContext
): T.PullRequestFacts {
  const object = record(value, "pull request");
  if (typeof object.isDraft !== "boolean")
    missing("pull request.isDraft", object.isDraft);
  return {
    context,
    mergeable: enumValue(
      object.mergeable,
      ["MERGEABLE", "CONFLICTING", "UNKNOWN"] as const,
      "pull request.mergeable"
    ),
    mergeStateStatus: enumValue(
      object.mergeStateStatus,
      MERGE_STATES,
      "pull request.mergeStateStatus"
    ),
    reviewDecision: reviewDecision(object.reviewDecision),
    headRefOid: optionalString(object.headRefOid, "pull request.headRefOid"),
    baseRefOid:
      typeof object.baseRefOid === "string" ? object.baseRefOid : null,
    updatedAt: typeof object.updatedAt === "string" ? object.updatedAt : null,
    headRefName: string(object.headRefName, "pull request.headRefName"),
    baseRefName: string(object.baseRefName, "pull request.baseRefName"),
    state: enumValue(
      object.state,
      ["OPEN", "CLOSED", "MERGED"] as const,
      "pull request.state"
    ),
    mergedAt: optionalString(object.mergedAt, "pull request.mergedAt"),
    isDraft: object.isDraft,
  };
}
function graphqlArgs(
  query: string,
  context: T.PrContext
): [string, ...string[]] {
  return [
    "gh",
    "api",
    "graphql",
    "-f",
    `query=${query}`,
    "-f",
    `owner=${context.owner}`,
    "-f",
    `repo=${context.repo}`,
    "-F",
    `pr=${context.number}`,
  ];
}

export class GhGitHubReader implements T.GitHubReader {
  async currentPr(pr: T.PrNumber | null): Promise<T.PrContext> {
    const argv: [string, ...string[]] = ["gh", "pr", "view"];
    if (pr !== null) argv.push(String(pr));
    argv.push("--json", "number,url");
    const object = record(await runJson(argv), "current PR");
    const parsed = parsePrUrl(string(object.url, "current PR.url"));
    return {
      ...parsed,
      number: pr ?? parsePrNumber(object.number, "current PR.number"),
    };
  }
  async checkoutRepository(): Promise<{
    readonly repository: T.Repository;
    readonly parent: T.Repository | null;
  }> {
    const object = record(
      await runJson(["gh", "repo", "view", "--json", "nameWithOwner,parent"]),
      "checkout repository"
    );
    const [owner, repo] = string(
      object.nameWithOwner,
      "checkout repository.nameWithOwner"
    ).split("/");
    if (!owner || !repo)
      missing("checkout repository.nameWithOwner", object.nameWithOwner);
    const parent =
      object.parent === null || object.parent === undefined
        ? null
        : record(object.parent, "checkout repository.parent");
    return {
      repository: { owner, repo },
      parent:
        parent === null
          ? null
          : {
              owner: string(
                record(parent.owner, "checkout repository.parent.owner").login,
                "checkout repository.parent.owner.login"
              ),
              repo: string(parent.name, "checkout repository.parent.name"),
            },
    };
  }
  async pullRequest(context: T.PrContext): Promise<T.PullRequestFacts> {
    return parsePullRequest(
      await runJson([
        "gh",
        "pr",
        "view",
        String(context.number),
        "--repo",
        `${context.owner}/${context.repo}`,
        "--json",
        "mergeable,mergeStateStatus,reviewDecision,headRefOid,baseRefOid,headRefName,baseRefName,state,mergedAt,isDraft,updatedAt",
      ]),
      context
    );
  }
  async upToDateRequired(
    context: T.PrContext,
    baseRefName: string
  ): Promise<boolean | null> {
    const branch = encodeURIComponent(baseRefName);
    const repo = `repos/${context.owner}/${context.repo}`;
    // Rulesets are readable with plain read access.
    let rulesStrict = false;
    let rulesKnown = false;
    const rules = await run(["gh", "api", `${repo}/rules/branches/${branch}`]);
    if (rules.code === 0) {
      try {
        const list = JSON.parse(rules.stdout) as unknown;
        if (Array.isArray(list)) {
          rulesKnown = true;
          for (const rule of list) {
            if (!isRecord(rule)) continue;
            // A merge queue brings PRs up to date itself; authors needn't.
            if (rule.type === "merge_queue") return false;
            if (
              rule.type === "required_status_checks" &&
              isRecord(rule.parameters) &&
              rule.parameters.strict_required_status_checks_policy === true
            )
              rulesStrict = true;
          }
        }
      } catch {
        rulesKnown = false;
      }
    }
    if (rulesStrict) return true;
    // Classic branch protection needs admin to read. "Branch not protected"
    // and "not enabled" are definite; a bare 404/403 just means we can't see.
    const classic = await run([
      "gh",
      "api",
      `${repo}/branches/${branch}/protection/required_status_checks`,
      "--jq",
      ".strict",
    ]);
    if (classic.code === 0) {
      if (classic.stdout.trim() === "true") return true;
      return rulesKnown ? false : null;
    }
    if (/Branch not protected|not enabled/i.test(classic.stderr))
      return rulesKnown ? false : null;
    return null;
  }
  async recheck(context: T.PrContext): Promise<T.RecheckFacts> {
    const object = record(
      await runJson([
        "gh",
        "pr",
        "view",
        String(context.number),
        "--repo",
        `${context.owner}/${context.repo}`,
        "--json",
        "headRefOid,baseRefOid,state,isDraft,reviewDecision,mergedAt,updatedAt",
      ]),
      "pull request recheck"
    );
    if (typeof object.isDraft !== "boolean")
      missing("pull request.isDraft", object.isDraft);
    return {
      headRefOid: optionalString(object.headRefOid, "pull request.headRefOid"),
      baseRefOid: optionalString(object.baseRefOid, "pull request.baseRefOid"),
      state: enumValue(
        object.state,
        ["OPEN", "CLOSED", "MERGED"] as const,
        "pull request.state"
      ),
      isDraft: object.isDraft,
      reviewDecision: reviewDecision(object.reviewDecision),
      mergedAt: optionalString(object.mergedAt, "pull request.mergedAt"),
      updatedAt: optionalString(object.updatedAt, "pull request.updatedAt"),
    };
  }
  async openPullRequests(
    repository: T.Repository
  ): Promise<readonly T.OpenPullRequest[]> {
    const value = await runJson([
      "gh",
      "pr",
      "list",
      "--repo",
      `${repository.owner}/${repository.repo}`,
      "--state",
      "open",
      "--limit",
      String(OPEN_PR_LIMIT),
      "--json",
      "number,headRefName,baseRefName,isCrossRepository",
    ]);
    const prs = list(value, "open PRs");
    if (prs.length >= OPEN_PR_LIMIT)
      throw new WatcherQueryError({
        kind: "stack-too-large",
        retryable: false,
        detail: `${prs.length} open PRs hit the ${OPEN_PR_LIMIT} discovery cap; pass --queued-stack --stack-prs instead of --stack`,
      });
    return prs.map((item, index) => {
      const object = record(item, `open PRs[${index}]`);
      return {
        number: parsePrNumber(object.number, `open PRs[${index}].number`),
        headRefName: string(
          object.headRefName,
          `open PRs[${index}].headRefName`
        ),
        baseRefName: string(
          object.baseRefName,
          `open PRs[${index}].baseRefName`
        ),
        isCrossRepository: object.isCrossRepository === true,
      };
    });
  }
  async checksFastPath(context: T.PrContext): Promise<T.ChecksFastPath> {
    const result = await run([
      "gh",
      "pr",
      "checks",
      String(context.number),
      "--repo",
      `${context.owner}/${context.repo}`,
      "--json",
      "name,state,description,link,workflow,bucket,completedAt",
    ]);
    if ([0, 1, 8].includes(result.code) && result.stdout.trim()) {
      try {
        const value = parseJson(result.stdout, "gh pr checks");
        if (Array.isArray(value))
          return { kind: "checks", checks: value.map(parseFastCheck) };
      } catch (error) {
        if (!(error instanceof WatcherQueryError)) throw error;
      }
    }
    return { kind: "unusable", exitCode: result.code, stderr: result.stderr };
  }
  async checkRollupPage(
    context: T.PrContext,
    after: string | null
  ): Promise<T.RollupPage> {
    const argv = graphqlArgs(PR_CHECK_ROLLUP_QUERY, context);
    if (after !== null) argv.push("-f", `after=${after}`);
    const value = await runJson(argv);
    const commits = list(
      at(value, ["data", "repository", "pullRequest", "commits", "nodes"]),
      "commits.nodes"
    );
    if (commits.length === 0) return { checks: [], endCursor: null };
    const commit = record(
      at(commits[commits.length - 1], ["commit"]),
      "commit"
    );
    if (commit.statusCheckRollup === null)
      return { checks: [], endCursor: null };
    const contexts = record(
      at(commit, ["statusCheckRollup", "contexts"]),
      "contexts"
    );
    const checks = list(contexts.nodes, "contexts.nodes")
      .map(mapRollupNode)
      .filter((check): check is T.Check => check !== null);
    const page = record(contexts.pageInfo, "contexts.pageInfo");
    if (typeof page.hasNextPage !== "boolean")
      missing("contexts.pageInfo.hasNextPage", page.hasNextPage);
    const cursor = optionalString(
      page.endCursor,
      "contexts.pageInfo.endCursor"
    );
    return { checks, endCursor: page.hasNextPage && cursor ? cursor : null };
  }
  async reviewThreads(
    context: T.PrContext
  ): Promise<readonly T.ReviewThread[]> {
    // Resolved and parked threads still fill pages, so an actionable thread
    // can sit past the first 100. Read every page before classifying.
    const nodes: unknown[] = [];
    let viewer: unknown = null;
    let after: string | null = null;
    do {
      const argv = graphqlArgs(REVIEW_THREADS_QUERY, context);
      if (after !== null) argv.push("-f", `after=${after}`);
      const value = await runJson(argv);
      viewer = at(value, ["data", "viewer"]);
      const connection = record(
        at(value, ["data", "repository", "pullRequest", "reviewThreads"]),
        "reviewThreads"
      );
      nodes.push(...list(connection.nodes, "reviewThreads.nodes"));
      const page = record(connection.pageInfo, "reviewThreads.pageInfo");
      const cursor = optionalString(
        page.endCursor,
        "reviewThreads.pageInfo.endCursor"
      );
      after = page.hasNextPage === true && cursor ? cursor : null;
    } while (after !== null);
    // Permissions can change during a long watch; each snapshot re-checks.
    this.permissions.clear();
    for (const node of nodes)
      await this.extendHistory(record(node, "review thread"));
    return parseReviewThreads({
      data: {
        viewer,
        repository: { pullRequest: { reviewThreads: { nodes } } },
      },
    });
  }
  /**
   * Pages a thread's comments backward, in place, to the start of the thread
   * or the page budget, so neither a burst of untrusted replies nor an edit
   * to an older comment can hide the deciding comment.
   */
  private async extendHistory(thread: Record<string, unknown>): Promise<void> {
    if (thread.isResolved === true || !isRecord(thread.latest)) return;
    const latest = thread.latest;
    let nodes = list(latest.nodes, "review thread.latest.nodes");
    let page = record(latest.pageInfo, "review thread.latest.pageInfo");
    for (let pages = 0; pages < MAX_HISTORY_PAGES; pages += 1) {
      if (page.hasPreviousPage !== true || typeof page.startCursor !== "string")
        break;
      const value = await runJson([
        "gh",
        "api",
        "graphql",
        "-f",
        `query=${THREAD_COMMENTS_QUERY}`,
        "-f",
        `id=${string(thread.id, "review thread.id")}`,
        "-f",
        `before=${page.startCursor}`,
      ]);
      const older = record(
        at(value, ["data", "node", "comments"]),
        "thread comments"
      );
      nodes = [...list(older.nodes, "thread comments.nodes"), ...nodes];
      page = record(older.pageInfo, "thread comments.pageInfo");
    }
    latest.nodes = nodes;
    latest.pageInfo = page;
  }
  // One lookup per login per snapshot: paging and requireWriteAccess ask
  // about the same people, and reviewThreads clears it so a revoked
  // permission takes effect on the next poll.
  private readonly permissions = new Map<string, Promise<boolean | null>>();
  permission(context: T.PrContext, login: string): Promise<boolean | null> {
    const key = `${context.owner}/${context.repo}:${login}`;
    let cached = this.permissions.get(key);
    if (cached === undefined) {
      cached = this.lookupPermission(context, login);
      this.permissions.set(key, cached);
    }
    return cached;
  }
  private async lookupPermission(
    context: T.PrContext,
    login: string
  ): Promise<boolean | null> {
    const result = await run([
      "gh",
      "api",
      `repos/${context.owner}/${context.repo}/collaborators/${login}/permission`,
      "--jq",
      ".permission",
    ]);
    if (result.code === 0) return WRITE_PERMISSIONS.has(result.stdout.trim());
    // 403 is GitHub refusing to say (the caller lacks push access, as in a
    // fork); anything else is a failed read, which must retry rather than
    // fall through to trusting the commenter.
    // Rate limits also arrive as 403 (or 429) but clear up; treating them as
    // "won't say" would drop real reviewers' feedback, so they retry instead.
    if (/HTTP 403/.test(result.stderr) && !/rate limit/i.test(result.stderr))
      return null;
    // 404: the author is no longer a collaborator (or the account is gone).
    // That's a definite "no write access", not a failed read to retry.
    if (/HTTP 404/.test(result.stderr)) return false;
    throw new WatcherQueryError({
      kind: "command-exit",
      retryable: true,
      code: result.code,
      detail:
        firstLine(result.stderr) ||
        `permission lookup for ${login} exited ${result.code}`,
    });
  }
  async commitRollups(
    context: T.PrContext
  ): Promise<readonly T.CommitRollup[]> {
    const value = await runJson(graphqlArgs(PR_COMMIT_STATUS_QUERY, context));
    const commits = list(
      at(value, ["data", "repository", "pullRequest", "commits", "nodes"]),
      "commits.nodes"
    );
    return commits.map((item, index) => {
      const commit = record(at(item, ["commit"]), `commits[${index}].commit`);
      const rollup = commit.statusCheckRollup;
      return {
        oid: string(commit.oid, `commits[${index}].oid`),
        state:
          rollup === null
            ? null
            : nullableEnum(
                at(rollup, ["state"]),
                ROLLUP_STATES,
                `commits[${index}].statusCheckRollup.state`
              ),
      };
    });
  }
}

// MEMBER and COLLABORATOR only say the author belongs to the org or was
// invited, not that they can write: org base permission and collaborator
// invites can both be Read. Every such author in a thread, opener or replier,
// needs verified write access to count as trusted. GitHub only answers this
// for callers with push access, so where it won't (a fork contributor), those
// comments are untrusted and only the owner, Apps and the viewer count.
const WRITE_PERMISSIONS = new Set(["admin", "write"]);
const needsPermissionCheck = (
  comment: T.ReviewComment
): comment is T.ReviewComment & { readonly authorLogin: string } =>
  !comment.isViewer &&
  !comment.authorIsBot &&
  comment.authorLogin !== null &&
  PERMISSION_CHECKED.has(comment.authorAssociation);
export async function requireWriteAccess(
  reader: T.GitHubReader,
  context: T.PrContext,
  threads: readonly T.ReviewThread[]
): Promise<readonly T.ReviewThread[]> {
  const needsCheck = needsPermissionCheck;
  const logins = new Set<string>();
  for (const thread of threads)
    for (const comment of [thread.firstComment, ...thread.recentComments])
      if (comment !== null && needsCheck(comment)) logins.add(comment.authorLogin);
  const readOnly = new Set<string>();
  let lookupFailure: unknown = null;
  await Promise.all(
    [...logins].map(async (login) => {
      try {
        if ((await reader.permission(context, login)) !== true)
          readOnly.add(login);
      } catch (error) {
        // Not trusted while unknown; whether that can stand is decided below.
        readOnly.add(login);
        lookupFailure ??= error;
      }
    })
  );
  if (readOnly.size === 0) return threads;
  const trusted: CommentTrust = (comment) =>
    trustedByAssociation(comment) &&
    !(needsCheck(comment) && readOnly.has(comment.authorLogin));
  const decided = threads.map((thread) => decideThread(thread, trusted));
  // A failed lookup only blocks the result when it could change it. If some
  // thread is actionable on trust that needed no failed lookup, report it
  // (threads outrank everything but conflicts, so this can't end in READY);
  // otherwise retry rather than let a failed lookup park real feedback.
  if (
    lookupFailure !== null &&
    !decided.some((thread) => thread.disposition === "actionable")
  )
    throw lookupFailure;
  return decided;
}
export const NO_CHECKS_CONFIGURED = "(no checks configured)";
export async function resolveChecks(
  reader: T.GitHubReader,
  context: T.PrContext,
  allowNoChecks = false
): Promise<T.CheckRead> {
  const fast = await reader.checksFastPath(context);
  const direct = fast.kind === "checks" ? nonEmpty(fast.checks) : null;
  if (direct !== null) return { source: "gh-pr-checks", checks: direct };
  const checks: T.Check[] = [];
  let after: string | null = null;
  do {
    const page = await reader.checkRollupPage(context, after);
    checks.push(...page.checks);
    after = page.endCursor;
  } while (after !== null);
  const fallback = nonEmpty(checks);
  if (fallback !== null) return { source: "graphql-rollup", checks: fallback };
  // A repo without CI reports no checks forever, which is otherwise
  // indistinguishable from checks that have not registered yet. The caller
  // opts in, and a synthetic skipped check keeps CheckRead non-empty.
  if (allowNoChecks)
    return {
      source: "graphql-rollup",
      checks: [
        {
          kind: "skipped",
          name: NO_CHECKS_CONFIGURED,
          reportedState: "SKIPPED",
          description: "",
          link: "",
          workflow: "",
        },
      ],
    };
  const suffix =
    fast.kind === "unusable"
      ? `fast path exit=${fast.exitCode}; GraphQL rollup was empty${firstLine(fast.stderr) ? `; ${firstLine(fast.stderr)}` : ""}`
      : "fast path and GraphQL rollup were empty";
  throw new ChecksUnavailable(`could not read PR checks: ${suffix}`);
}
export async function resolveContext(args: {
  readonly reader: T.GitHubReader;
  readonly owner: string | null;
  readonly repo: string | null;
  readonly pr: T.PrNumber | null;
}): Promise<T.PrContext> {
  if (args.pr !== null && args.owner !== null && args.repo !== null)
    return { owner: args.owner, repo: args.repo, number: args.pr };
  if (args.pr !== null) {
    // A bare number belongs to some repository, and in a fork checkout `gh`
    // (and `origin`) may point at the fork while the PR lives upstream, or
    // the other way round. Rather than guess and watch an unrelated PR that
    // shares the number, a fork checkout must name the repository.
    const checkout = await args.reader.checkoutRepository();
    if (checkout.parent !== null)
      throw new WatcherQueryError({
        kind: "ambiguous-repository",
        retryable: false,
        detail: `this checkout is a fork of ${checkout.parent.owner}/${checkout.parent.repo}; pass --owner and --repo with --pr ${args.pr}`,
      });
    return { ...checkout.repository, number: args.pr };
  }
  // With no number, `gh pr view` finds the current branch's PR.
  const inferred = await args.reader.currentPr(args.pr);
  return {
    owner: args.owner ?? inferred.owner,
    repo: args.repo ?? inferred.repo,
    number: args.pr ?? inferred.number,
  };
}
// `gh pr list --limit` truncates rather than pages. Stack discovery needs the
// whole graph, so a list that hits the cap fails loudly instead of building a
// partial stack that could report READY while a missing member is blocked.
export const OPEN_PR_LIMIT = 1000;
export function orderStack(
  context: T.PrContext,
  open: readonly T.OpenPullRequest[]
): T.NonEmpty<T.PrContext> {
  // A fork PR's head branch lives in another repository, so its name says
  // nothing about this repository's branches: a fork's `main` -> `main` would
  // otherwise become its own parent. Stacks are same-repository only.
  const local = open.filter((pr) => pr.isCrossRepository !== true);
  const byNumber = new Map(local.map((pr) => [pr.number, pr]));
  const byHead = new Map(local.map((pr) => [pr.headRefName, pr]));
  // One branch can head several open PRs (into different bases). Where the
  // walk passes through such a branch the parent/child links are ambiguous,
  // and picking one would silently drop the other PR from the stack.
  const heads = new Map<string, number>();
  for (const pr of local)
    heads.set(pr.headRefName, (heads.get(pr.headRefName) ?? 0) + 1);
  const unambiguous = (branch: string): void => {
    if ((heads.get(branch) ?? 0) > 1)
      throw new WatcherQueryError({
        kind: "ambiguous-stack",
        retryable: false,
        detail: `branch ${branch} heads more than one open PR, so the stack is ambiguous; pass --queued-stack --stack-prs instead of --stack`,
      });
  };
  const children = new Map<string, T.OpenPullRequest[]>();
  for (const pr of local)
    children.set(pr.baseRefName, [...(children.get(pr.baseRefName) ?? []), pr]);
  for (const values of children.values())
    values.sort((a, b) => a.number - b.number);
  const start = byNumber.get(context.number);
  if (start === undefined) return [context];
  const down: T.OpenPullRequest[] = [];
  let current = start;
  const walked = new Set<T.PrNumber>([start.number]);
  while (byHead.has(current.baseRefName)) {
    unambiguous(current.baseRefName);
    const parent = byHead.get(current.baseRefName);
    if (parent === undefined || walked.has(parent.number)) break;
    walked.add(parent.number);
    down.push(parent);
    current = parent;
  }
  const seen = new Set<T.PrNumber>([
    ...down.map((pr) => pr.number),
    start.number,
  ]);
  const up: T.OpenPullRequest[] = [];
  const visit = (parent: T.OpenPullRequest): void => {
    unambiguous(parent.headRefName);
    for (const child of children.get(parent.headRefName) ?? []) {
      if (seen.has(child.number)) continue;
      seen.add(child.number);
      up.push(child);
      visit(child);
    }
  };
  // Walk up from every node on the way down too, so siblings that branch off
  // an ancestor are part of the connected stack.
  for (const node of [...down].reverse()) visit(node);
  visit(start);
  return (
    nonEmpty(
      [...down.reverse(), start, ...up].map((pr) => ({
        ...context,
        number: pr.number,
      }))
    ) ?? [context]
  );
}
export async function discoverStack(
  reader: T.GitHubReader,
  context: T.PrContext
): Promise<T.NonEmpty<T.PrContext>> {
  return orderStack(context, await reader.openPullRequests(context));
}
