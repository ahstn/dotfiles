/**
 * Custom Footer Extension - demonstrates ctx.ui.setFooter()
 *
 * footerData exposes data not otherwise accessible:
 * - getGitBranch(): current git branch
 * - getExtensionStatuses(): texts from ctx.ui.setStatus()
 *
 * Symbols for reference: π ◆ ↑ input tokens · ↓ output tokens · $
 *
 * Token stats come from ctx.sessionManager/ctx.model (already accessible).
 */

import { spawnSync } from "node:child_process";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

type FooterTheme = {
  fg(color: any, text: string): string;
};

type FooterContext = {
  model?: { contextWindow?: number };
  getContextUsage():
    | { contextWindow?: number; percent: number | null }
    | null
    | undefined;
};

function formatCwd(cwd: string): string {
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home && cwd.startsWith(home)) {
    return `~${cwd.slice(home.length)}`;
  }
  return cwd;
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
  return `${Math.round(n / 1000000)}M`;
}

function formatContext(theme: FooterTheme, ctx: FooterContext): string {
  const usage = ctx.getContextUsage();
  const contextWindow = usage?.contextWindow ?? ctx.model?.contextWindow;
  if (!usage || !contextWindow || usage.percent === null) {
    return theme.fg(
      "dim",
      `ctx ?${contextWindow ? `/${formatTokens(contextWindow)}` : ""}`,
    );
  }

  const text = `ctx ${usage.percent.toFixed(1)}%/${formatTokens(contextWindow)}`;
  if (usage.percent >= 90) return theme.fg("error", text);
  if (usage.percent >= 70) return theme.fg("warning", text);
  return theme.fg("dim", text);
}

function truncateBranch(branch: string): string {
  return branch.length > 20 ? `${branch.slice(0, 17)}...` : branch;
}

function getGitWorktreeCounts(cwd: string): {
  unstaged: number;
  untracked: number;
} {
  const result = spawnSync(
    "git",
    ["--no-optional-locks", "status", "--porcelain"],
    {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  if (result.status !== 0) return { unstaged: 0, untracked: 0 };

  let unstaged = 0;
  let untracked = 0;
  for (const line of result.stdout.split("\n")) {
    if (!line) continue;
    if (line.startsWith("??")) {
      untracked++;
      continue;
    }
    if (line[1] && line[1] !== " ") unstaged++;
  }
  return { unstaged, untracked };
}

function colorThinkingLevel(theme: FooterTheme, level: string): string {
  switch (level) {
    case "low":
      return theme.fg("thinkingLow", level);
    case "medium":
      return theme.fg("thinkingMedium", level);
    case "high":
      return theme.fg("thinkingHigh", level);
    case "xhigh":
      return theme.fg("thinkingXhigh", level);
    case "minimal":
      return theme.fg("thinkingMinimal", level);
    case "off":
    default:
      return theme.fg("thinkingOff", level);
  }
}

export default function (pi: ExtensionAPI) {
  let enabled = true;

  function installStatusline(ctx: any) {
    ctx.ui.setFooter((tui: any, theme: FooterTheme, footerData: any) => {
      const unsub = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose: unsub,
        invalidate() {},
        render(width: number): string[] {
          // Compute tokens from ctx (already accessible to extensions)
          let input = 0,
            output = 0,
            cost = 0;
          for (const e of ctx.sessionManager.getBranch()) {
            if (e.type === "message" && e.message.role === "assistant") {
              const m = e.message as AssistantMessage;
              input += m.usage.input;
              output += m.usage.output;
              cost += m.usage.cost.total;
            }
          }

          // Get git branch (not otherwise accessible)
          const branch = footerData.getGitBranch();
          const { unstaged, untracked } = getGitWorktreeCounts(ctx.cwd);
          const directory = theme.fg("thinkingMedium", formatCwd(ctx.cwd));
          const branchStr = branch
            ? theme.fg("success", ` (${truncateBranch(branch)})`)
            : "";
          const gitStatus = theme.fg("dim", ` [*${unstaged} ?${untracked}]`);
          const left = directory + branchStr + gitStatus;

          const provider = ctx.model?.provider || "provider";
          const modelId = ctx.model?.id || "no-model";
          const thinkingLevel = pi.getThinkingLevel() || "off";
          const model =
            theme.fg("dim", `${provider}/`) +
            `${modelId}` +
            theme.fg("dim", ` (`) +
            colorThinkingLevel(theme, thinkingLevel) +
            theme.fg("dim", ")");
          const stats =
            theme.fg(
              "dim",
              ` · ↑${formatTokens(input)} · ↓${formatTokens(output)} · `,
            ) +
            formatContext(theme, ctx) +
            theme.fg("dim", ` · $${cost.toFixed(2)}`);
          const right = model + stats;

          const minPad = 1;
          const rightWidth = visibleWidth(right);
          const availableLeft = width - rightWidth - minPad;
          if (availableLeft <= 0) {
            return [truncateToWidth(right, width)];
          }

          const fittedLeft = truncateToWidth(
            left,
            availableLeft,
            theme.fg("dim", "..."),
          );
          const pad = " ".repeat(
            Math.max(minPad, width - visibleWidth(fittedLeft) - rightWidth),
          );
          return [truncateToWidth(fittedLeft + pad + right, width)];
        },
      };
    });
  }

  pi.on("session_start", (_event, ctx) => {
    if (enabled) installStatusline(ctx);
  });

  pi.registerCommand("statusline", {
    description: "Toggle custom statusline",
    handler: async (_args, ctx) => {
      enabled = !enabled;

      if (enabled) {
        installStatusline(ctx);
        ctx.ui.notify("Custom statusline enabled", "info");
      } else {
        ctx.ui.setFooter(undefined);
        ctx.ui.notify("Default footer restored", "info");
      }
    },
  });
}
