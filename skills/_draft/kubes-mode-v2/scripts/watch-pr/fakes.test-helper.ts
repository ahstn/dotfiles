import type {
  Check,
  ChecksFastPath,
  CommitRollup,
  GitHubReader,
  OpenPullRequest,
  PrContext,
  PullRequestFacts,
  ReviewThread,
  RollupPage,
} from "./types.ts";
import { parsePrNumber } from "./types.ts";

export interface FakeReaderOptions {
  readonly facts?: Partial<Omit<PullRequestFacts, "context">>;
  readonly fastPath?: ChecksFastPath;
  readonly rollupPages?: readonly RollupPage[];
  readonly threads?: readonly ReviewThread[];
  readonly writers?: Readonly<Record<string, boolean | null>>;
  readonly commitRollups?: readonly CommitRollup[];
  readonly openPullRequests?: readonly OpenPullRequest[];
  readonly current?: PrContext;
  readonly checkoutParent?: { readonly owner: string; readonly repo: string };
}

export function passingCheck(name = "ci"): Check {
  return {
    kind: "passed",
    name,
    reportedState: "SUCCESS",
    description: "",
    link: "",
    workflow: "",
  };
}

export function pendingCheck(name = "ci"): Check {
  return {
    kind: "pending",
    name,
    reportedState: "PENDING",
    description: "",
    link: "",
    workflow: "",
  };
}

export function failedCheck(name = "ci"): Check {
  return {
    kind: "failed",
    name,
    reportedState: "FAILURE",
    description: "",
    link: "",
    workflow: "",
  };
}

export function fakeReader(
  options: FakeReaderOptions = {}
): GitHubReader & { readonly calls: readonly string[] } {
  const calls: string[] = [];
  const context = options.current ?? {
    owner: "owner",
    repo: "repo",
    number: parsePrNumber(1),
  };
  const defaults: PullRequestFacts = {
    context,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    headRefOid: "head",
    baseRefOid: "base",
    headRefName: "feature",
    baseRefName: "main",
    state: "OPEN",
    mergedAt: null,
    isDraft: false,
  };
  let page = 0;
  return {
    calls,
    async checkoutRepository() {
      calls.push("checkoutRepository");
      return {
        repository: { owner: context.owner, repo: context.repo },
        parent: options.checkoutParent ?? null,
      };
    },
    async currentPr(pr) {
      calls.push("currentPr");
      return { ...context, number: pr ?? context.number };
    },
    async pullRequest(requested) {
      calls.push("pullRequest");
      return { ...defaults, ...options.facts, context: requested };
    },
    async revisions() {
      calls.push("revisions");
      return {
        headRefOid: options.facts?.headRefOid ?? defaults.headRefOid,
        baseRefOid: options.facts?.baseRefOid ?? defaults.baseRefOid,
      };
    },
    async openPullRequests() {
      calls.push("openPullRequests");
      return options.openPullRequests ?? [];
    },
    async checksFastPath() {
      calls.push("checksFastPath");
      return options.fastPath ?? { kind: "checks", checks: [passingCheck()] };
    },
    async checkRollupPage(_requested, after) {
      calls.push(`checkRollupPage:${after ?? "null"}`);
      return options.rollupPages?.[page++] ?? { checks: [], endCursor: null };
    },
    async reviewThreads() {
      calls.push("reviewThreads");
      return options.threads ?? [];
    },
    async permission(_requested, login) {
      calls.push(`permission:${login}`);
      const writers = options.writers ?? {};
      return login in writers ? (writers[login] ?? null) : true;
    },
    async commitRollups() {
      calls.push("commitRollups");
      return options.commitRollups ?? [{ oid: "head", state: "SUCCESS" }];
    },
  };
}
