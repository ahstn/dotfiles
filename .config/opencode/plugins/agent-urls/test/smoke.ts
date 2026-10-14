import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const packageRoot = fileURLToPath(new URL("../", import.meta.url))
const binary = path.join(packageRoot, "node_modules", ".bin", process.platform === "win32" ? "opencode.cmd" : "opencode")
const temporary = path.join(tmpdir(), "opencode")
mkdirSync(temporary, { recursive: true })
const root = realpathSync(mkdtempSync(path.join(temporary, "agent-urls-smoke-")))
const workdir = path.join(root, "workspace")
const configdir = path.join(root, "config", "opencode")
mkdirSync(workdir, { recursive: true })
mkdirSync(path.join(configdir, "plugins"), { recursive: true })
symlinkSync(packageRoot, path.join(configdir, "plugins", "agent-urls"), "dir")
symlinkSync(path.resolve(packageRoot, "../skill-urls"), path.join(configdir, "plugins", "skill-urls"), "dir")
const skilldir = path.join(root, "skills", "agent-smoke-skill")
mkdirSync(skilldir, { recursive: true })
writeFileSync(path.join(skilldir, "SKILL.md"), "---\nname: Agent smoke skill\ndescription: Test coexistence\n---\nSKILL_PLUGIN_STILL_WORKS\n")

type Message = { role: string; content?: string | { type: string; text?: string }[]; tool_calls?: { function: { name: string } }[] }
type RequestBody = { model: string; stream?: boolean; messages: Message[] }
type SmokeResult = { error?: string; stage?: string; rootID: string; field: string; reply: string; skill: string; parentMessages: unknown; foreignBlocked: boolean; permissionBlocked: boolean }
const traces: { model: string; system: Message[]; messages: Message[] }[] = []
const text = (message: Message) => typeof message.content === "string" ? message.content : message.content?.map((part) => part.text ?? "").join("\n") ?? ""
let calls = 0
const provider = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
  if (new URL(request.url).pathname !== "/v1/chat/completions") return new Response("Unexpected provider route", { status: 404 })
  const body = await request.json() as RequestBody
  if (body.model !== "parent" && body.model !== "worker") return new Response("Unknown mock model", { status: 400 })
  traces.push({ model: body.model, system: body.messages.filter((message) => message.role === "system"), messages: body.messages })
  const userText = body.messages.filter((message) => message.role === "user").map(text).join("\n")
  const alreadySent = body.messages.some((message) => message.tool_calls?.some((call) => call.function.name === "agent_send"))
  const parent = /Your parent is (agent:\/\/[A-Za-z0-9_]+)\./.exec(userText)?.[1]
  const tool = body.model === "worker" && !alreadySent && !userText.includes("PARENT_TO_CHILD") && !userText.includes("Do not send messages")
    ? { id: `call_mock_${++calls}`, type: "function", function: { name: "agent_send", arguments: JSON.stringify({ target: parent, message: "CHILD_TO_PARENT: worker request received.", delivery: "queue" }) } }
    : undefined
  const content = body.model === "parent" ? "PARENT_ACK" : JSON.stringify({ findings: [{ path: "src/demo.ts" }], reply: userText.includes("PARENT_TO_CHILD") ? "FOLLOWUP_DONE" : "CHILD_DONE" })
  const common = { id: `chatcmpl_${++calls}`, created: Math.floor(Date.now() / 1000), model: body.model }
  const usage = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
  if (!body.stream) return Response.json({ ...common, object: "chat.completion", choices: [{ index: 0, message: { role: "assistant", ...(tool ? { tool_calls: [tool] } : { content }) }, finish_reason: tool ? "tool_calls" : "stop" }], usage })
  const delta = tool ? { role: "assistant", tool_calls: [{ index: 0, ...tool }] } : { role: "assistant", content }
  return new Response([
    { ...common, object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: null }] },
    { ...common, object: "chat.completion.chunk", choices: [{ index: 0, delta: {}, finish_reason: tool ? "tool_calls" : "stop" }], usage },
  ].map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } })
} })

writeFileSync(path.join(configdir, "opencode.jsonc"), JSON.stringify({
  plugins: ["-opencode.provider.*", path.join(packageRoot, "test", "fixture")],
  skills: [path.join(root, "skills")], snapshots: false, warming: false,
}))
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(API_KEY|TOKEN|SECRET|PASSWORD)/.test(key)))
Object.assign(env, { XDG_CONFIG_HOME: path.join(root, "config"), XDG_DATA_HOME: path.join(root, "data"), XDG_CACHE_HOME: path.join(root, "cache"), XDG_STATE_HOME: path.join(root, "state"), OPENCODE_DB: path.join(root, "verification.db"), AGENT_SMOKE_PROVIDER_URL: `http://127.0.0.1:${provider.port}/v1` })
delete env.OPENCODE_CONFIG
delete env.OPENCODE_CONFIG_DIR
delete env.OPENCODE_CONFIG_CONTENT
const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("reserved") })
const servicePort = reservation.port
await reservation.stop(true)

async function cli(args: string[]) {
  const subprocess = Bun.spawn([binary, ...args], { cwd: workdir, env, stdout: "pipe", stderr: "pipe" })
  const timeout = setTimeout(() => subprocess.kill(), 60_000)
  try {
    const [stdout, stderr, code] = await Promise.all([new Response(subprocess.stdout).text(), new Response(subprocess.stderr).text(), subprocess.exited])
    if (code !== 0) throw new Error(`${args.join(" ")}: ${stderr}\n${stdout}`)
    return stdout
  } finally { clearTimeout(timeout) }
}

function check(condition: unknown, label: string) { if (!condition) throw new Error(label); console.log(`PASS ${label}`) }

try {
  check((await cli(["--version"])).includes("2.0.29"), "isolated 2.0.29 runtime")
  await cli(["service", "set", "port", String(servicePort)])
  const response = JSON.parse(await cli(["api", "post", "/api/rpc/agent_urls_smoke/scenario", "--data", '{"input":{}}'])) as { output: SmokeResult }
  const result = response.output
  if (result.error) throw new Error(`${result.stage}: ${result.error}`)
  check(result.field.includes("src/demo.ts"), "spawned worker publishes JSON fields through agent://")
  check(result.reply.includes("FOLLOWUP_DONE"), "parent-to-child message wakes the selected model")
  check(JSON.stringify(result.parentMessages).includes("CHILD_TO_PARENT"), "child-to-parent message is admitted")
  check(result.foreignBlocked, "foreign session family is rejected")
  check(result.permissionBlocked, "native peer-message deny is enforced")
  check(result.skill.includes("SKILL_PLUGIN_STILL_WORKS"), "skill URL plugin coexists on 2.0.29")
  const parent = traces.find((trace) => trace.model === "parent")
  const workers = traces.filter((trace) => trace.model === "worker" && trace.messages.some((message) => text(message).includes(`Your parent is agent://${result.rootID}`)))
  check(parent && workers.length >= 2 && JSON.stringify(parent.system).includes("EXACT_SYSTEM_MARKER"), "real parent and worker requests were captured")
  check(workers.every((worker) => JSON.stringify(worker.system) === JSON.stringify(parent!.system)), "worker system prompt equals the parent's captured system exactly")
  check(traces.every((trace) => trace.model === "parent" || trace.model === "worker"), "all model calls used the local deterministic provider")
  console.log("Agent coordination smoke passed without live provider credentials or a global CLI upgrade.")
} catch (error) {
  const plugins = JSON.parse(await cli(["api", "get", "/api/plugin"])) as { data: { id: string }[] }
  console.error(plugins.data.filter((plugin: { id: string }) => plugin.id.startsWith("dotfiles.")))
  console.error("Model request counts:", traces.map((trace) => trace.model))
  throw error
} finally {
  try { await cli(["service", "stop"]) } finally { await provider.stop(true); rmSync(root, { recursive: true, force: true }) }
}
