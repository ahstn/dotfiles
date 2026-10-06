import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const CONFIG_PATH = join(homedir(), ".git-ai", "config.json");
const OVERRIDE_PATH = join(homedir(), ".omp", "agent", "git-ai.override.json");

type ToolName = "edit" | "write" | "replace" | "rename" | "bash";
type ToolPolicy = { kind: "ignore" } | {
  kind: "mutating";
  canonical: ToolName;
  filepath_fields: string[];
};
type MutatingCall = { toolName: ToolName; toolNameRaw: string; filepaths: string[] };
type Checkpoint = {
  hook_event_name: "before_edit" | "after_edit" | "before_command" | "after_command";
  session_id: string;
  session_path: string;
  cwd: string;
  model: string;
  tool_name: ToolName;
  tool_name_raw: string;
  tool_use_id: string;
  command?: string;
  will_edit_filepaths?: string[];
  edited_filepaths?: string[];
  dirty_files?: Record<string, string>;
};
type PendingCall = { call: MutatingCall; checkpoint: Checkpoint };

async function loadPolicies(pi: ExtensionAPI): Promise<Map<string, ToolPolicy>> {
  const policies = new Map<string, ToolPolicy>([
    ["edit", { kind: "mutating", canonical: "edit", filepath_fields: ["path"] }],
    ["apply_patch", { kind: "mutating", canonical: "edit", filepath_fields: ["path"] }],
    ["write", { kind: "mutating", canonical: "write", filepath_fields: ["path"] }],
    ["bash", { kind: "mutating", canonical: "bash", filepath_fields: [] }],
  ]);
  try {
    const z = pi.zod;
    const config = z.object({ version: z.literal(1), tools: z.record(z.string(), z.unknown()) })
      .parse(await Bun.file(OVERRIDE_PATH).json());
    const policySchema = z.union([
      z.object({ kind: z.literal("ignore") }),
      z.object({
        kind: z.literal("mutating"),
        canonical: z.enum(["edit", "write", "replace", "rename", "bash"]),
        filepath_fields: z.array(z.string().trim().min(1)),
      }),
    ]);
    for (const [name, raw] of Object.entries(config.tools)) {
      if (!name.trim()) continue;
      const parsed = policySchema.safeParse(raw);
      if (parsed.success) policies.set(name, parsed.data);
    }
  } catch {
    // The optional user-owned override never prevents the default integration.
  }
  return policies;
}

function extractCall(
  cwd: string,
  toolNameRaw: string,
  input: Record<string, unknown>,
  policies: Map<string, ToolPolicy>,
): MutatingCall | undefined {
  const policy = policies.get(toolNameRaw);
  if (!policy || policy.kind === "ignore") return;
  if (policy.canonical === "bash") return { toolName: "bash", toolNameRaw, filepaths: [] };

  const paths: string[] = [];
  for (const field of policy.filepath_fields) {
    const value = input[field];
    if (typeof value === "string") paths.push(value);
    else if (Array.isArray(value)) {
      for (const path of value) if (typeof path === "string") paths.push(path);
    }
  }
  if (toolNameRaw === "edit" || toolNameRaw === "apply_patch") {
    const patch = typeof input.input === "string" ? input.input : input.patch;
    if (typeof patch === "string") {
      for (const line of patch.split(/\r?\n/)) {
        const section = /^\[(.+)#[A-Fa-f0-9]{4}\]$/.exec(line);
        const operation = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/.exec(line);
        const move = /^(?:MV |\*\*\* Move to: )(.+)$/.exec(line);
        if (section) paths.push(section[1]);
        else if (operation) paths.push(operation[1]);
        else if (move) {
          const destination = move[1];
          paths.push(destination.startsWith('"') && destination.endsWith('"')
            ? destination.slice(1, -1) : destination);
        }
      }
    }
  }
  const filepaths = [...new Set(paths.filter((path) => path.trim()).map((path) => {
    const expanded = path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
    return isAbsolute(expanded) ? expanded : resolve(cwd, expanded);
  }))];
  if (filepaths.length === 0) return;
  return { toolName: policy.canonical, toolNameRaw, filepaths };
}

async function readDirtyFiles(filepaths: string[]): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  await Promise.all(filepaths.map(async (path) => {
    try {
      files[path] = await Bun.file(path).text();
    } catch (error) {
      // New files and deleted/moved sources have no contents. Other read failures
      // must not masquerade as empty files and corrupt attribution.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      files[path] = "";
    }
  }));
  return files;
}

export default function gitAi(pi: ExtensionAPI) {
  const policies = loadPolicies(pi);
  const privacySchema = pi.zod.object({
    telemetry_oss: pi.zod.literal("off"),
    telemetry_enterprise_dsn: pi.zod.unknown().optional(),
  });
  const pending = new Map<string, PendingCall>();
  let lastWarning: string | undefined;

  function warn(ctx: ExtensionContext, message: string) {
    if (message === lastWarning) return;
    lastWarning = message;
    ctx.ui.notify(`git-ai: ${message}`, "warning");
  }

  async function checkpoint(ctx: ExtensionContext, payload: Checkpoint): Promise<boolean> {
    // git-ai has no production telemetry env override. Check its actual config
    // before every invocation; never launch with missing/unsafe privacy settings.
    try {
      const config = privacySchema.safeParse(await Bun.file(CONFIG_PATH).json());
      if (!config.success || (config.data.telemetry_enterprise_dsn !== undefined
        && config.data.telemetry_enterprise_dsn !== null && config.data.telemetry_enterprise_dsn !== "")) {
        warn(ctx, `checkpoints disabled: set telemetry_oss to "off" and remove telemetry_enterprise_dsn in ${CONFIG_PATH}`);
        return false;
      }
    } catch (error) {
      warn(ctx, `checkpoints disabled: cannot read telemetry settings in ${CONFIG_PATH}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
    const binary = Bun.which("git-ai") ?? join(homedir(), ".git-ai", "bin", "git-ai");
    try {
      // Pi's preset accepts omp's JSONL session format and preserves the source
      // integration's bash snapshots. Git AI records the agent label as "pi".
      const child = Bun.spawn([binary, "checkpoint", "pi", "--hook-input", "stdin"], {
        cwd: payload.cwd,
        stdin: new Blob([JSON.stringify(payload)]),
        stdout: "ignore",
        stderr: "pipe",
      });
      const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
      if (code !== 0) {
        warn(ctx, `checkpoint failed (${code}): ${stderr.trim()}`);
        return false;
      }
      lastWarning = undefined;
      return true;
    } catch (error) {
      warn(ctx, `checkpoint unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  pi.on("tool_call", async (event, ctx) => {
    const sessionPath = ctx.sessionManager.getSessionFile();
    if (!sessionPath) return;
    const call = extractCall(ctx.cwd, event.toolName, event.input, await policies);
    if (!call) return;
    const payload: Checkpoint = {
      hook_event_name: call.toolName === "bash" ? "before_command" : "before_edit",
      session_id: ctx.sessionManager.getSessionId(),
      session_path: sessionPath,
      cwd: ctx.cwd,
      model: ctx.model?.id ?? "",
      tool_name: call.toolName,
      tool_name_raw: call.toolNameRaw,
      tool_use_id: event.toolCallId,
    };
    if (call.toolName === "bash") {
      if (typeof event.input.command === "string") payload.command = event.input.command;
    } else {
      payload.will_edit_filepaths = call.filepaths;
      payload.dirty_files = await readDirtyFiles(call.filepaths);
    }
    if (await checkpoint(ctx, payload)) pending.set(event.toolCallId, { call, checkpoint: payload });
  });

  pi.on("tool_result", async (event, ctx) => {
    const entry = pending.get(event.toolCallId);
    pending.delete(event.toolCallId);
    if (!entry || event.isError) return;
    const { call, checkpoint: before } = entry;
    const { will_edit_filepaths: _paths, dirty_files: _files, ...payload } = before;
    payload.hook_event_name = call.toolName === "bash" ? "after_command" : "after_edit";
    if (call.toolName !== "bash") {
      payload.edited_filepaths = call.filepaths;
      payload.dirty_files = await readDirtyFiles(call.filepaths);
    }
    await checkpoint(ctx, payload);
  });

  // Blocked/interrupted tool calls may never emit tool_result.
  pi.on("agent_end", () => pending.clear());
  pi.on("session_switch", () => pending.clear());
  pi.on("session_shutdown", () => pending.clear());
}
