import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const packageRoot = fileURLToPath(new URL("../", import.meta.url))
const temporary = path.join(tmpdir(), "opencode")
mkdirSync(temporary, { recursive: true })
const root = realpathSync(mkdtempSync(path.join(temporary, "skill-urls-smoke-")))
const workdir = path.join(root, "workspace")
const configdir = path.join(root, "config", "opencode")
const skilldir = path.join(root, "skills", "probe-skill")
mkdirSync(workdir, { recursive: true })
mkdirSync(configdir, { recursive: true })
mkdirSync(path.join(configdir, "plugins"), { recursive: true })
symlinkSync(packageRoot, path.join(configdir, "plugins", "skill-urls"), "dir")
mkdirSync(path.join(skilldir, "references"), { recursive: true })
writeFileSync(path.join(skilldir, "SKILL.md"), "---\nname: Probe Skill\ndescription: Isolated skill URL verification\n---\nFollow the smoke-test instructions.\n")
writeFileSync(path.join(skilldir, "references", "notes.md"), "smoke-note-one\nsmoke-note-two\n")
writeFileSync(path.join(root, "outside.md"), "OUTSIDE_CONTENT_MUST_NOT_BE_READ")
symlinkSync(path.join(root, "outside.md"), path.join(skilldir, "escape.md"))
writeFileSync(path.join(configdir, "opencode.jsonc"), JSON.stringify({
  plugins: ["-opencode.provider.*", path.join(packageRoot, "test", "fixture")],
  skills: [path.join(root, "skills")], snapshots: false, warming: false,
}))
// No real configuration, database, credential store, or model provider is used.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(API_KEY|TOKEN|SECRET|PASSWORD)/.test(key)))
Object.assign(env, {
  XDG_CONFIG_HOME: path.join(root, "config"), XDG_DATA_HOME: path.join(root, "data"),
  XDG_CACHE_HOME: path.join(root, "cache"), XDG_STATE_HOME: path.join(root, "state"),
  OPENCODE_DB: path.join(root, "verification.db"),
})
delete env.OPENCODE_CONFIG
delete env.OPENCODE_CONFIG_DIR
delete env.OPENCODE_CONFIG_CONTENT

const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("reserved") })
const port = reservation.port
reservation.stop(true)

function probe(input: Record<string, string>) {
  const text = execFileSync("opencode", [
    "api", "post", "/api/rpc/dotfiles_skill_urls_smoke/run", "--data", JSON.stringify({ input }),
  ], { cwd: workdir, env, encoding: "utf8", timeout: 30_000 })
  return JSON.parse(text).output as { ok: boolean; result?: { content?: string }; error?: string; inbox?: unknown }
}

function check(label: string, input: Record<string, string>, accepted: boolean, includes?: string) {
  const result = probe(input)
  if (result.ok !== accepted || includes && !JSON.stringify(result).includes(includes)) throw new Error(`${label}: ${JSON.stringify(result)}`)
  console.log(`PASS ${label}`)
}

try {
  execFileSync("opencode", ["service", "set", "port", String(port)], { cwd: workdir, env, encoding: "utf8" })
  check("read skill:// instructions", { operation: "read", path: "skill://probe-skill" }, true, "Follow the smoke-test instructions")
  check("read $ alias supporting file", { operation: "read", path: "$probe-skill/references/notes.md" }, true, "smoke-note-two")
  check("glob URI root", { operation: "glob", path: "skill://probe-skill", pattern: "**/*.md" }, true, "skill://probe-skill/references/notes.md")
  check("grep URI root", { operation: "grep", path: "skill://probe-skill", pattern: "smoke-note-two" }, true, "skill://probe-skill/references/notes.md")
  check("native $ skill attachment admission", { operation: "prompt", text: "Use $probe-skill" }, true, "<skill_content")
  check("native skill:// attachment admission", { operation: "prompt", text: "Use skill://probe-skill" }, true, "<skill_content")
  check("native skill deny", { operation: "read", path: "skill://probe-skill", denyAction: "skill", denyResource: "probe-skill" }, false)
  check("native read deny", { operation: "read", path: "skill://probe-skill/references/notes.md", denyAction: "read", denyResource: path.join(skilldir, "references", "notes.md") }, false)
  check("native external_directory deny", { operation: "read", path: "skill://probe-skill", denyAction: "external_directory", denyResource: `${skilldir}/*` }, false)
  check("symlink escape refusal", { operation: "read", path: "skill://probe-skill/escape.md" }, false)
  console.log("Runtime smoke checks passed without model calls or live provider credentials.")
} catch (error) {
  const documents = JSON.parse(execFileSync("opencode", ["api", "get", "/api/config"], { cwd: workdir, env, encoding: "utf8" }))
  console.error("Configuration sources:", documents.map((entry: { path: string; info?: { plugins?: unknown } }) => ({ path: entry.path, plugins: entry.info?.plugins })))
  const plugins = JSON.parse(execFileSync("opencode", ["api", "get", "/api/plugin"], { cwd: workdir, env, encoding: "utf8" }))
  console.error("Plugin status:", plugins.data.filter((plugin: { id: string }) => plugin.id.startsWith("dotfiles.")))
  for (const log of new Bun.Glob("**/*.log").scanSync({ cwd: root, absolute: true })) {
    console.error(readFileSync(log, "utf8").split("\n").filter((line) => /plugin|error/i.test(line)).slice(-15).join("\n"))
  }
  throw error
} finally {
  execFileSync("opencode", ["service", "stop"], { cwd: workdir, env, encoding: "utf8", timeout: 30_000 })
  rmSync(root, { recursive: true, force: true })
}
