import { Plugin, Skill } from "@opencode/plugin"
import type { Result, ToolContext } from "@opencode/plugin/promise/tool"
import { pathToFileURL } from "node:url"
import path from "node:path"
import { isReference, parseReference, resolveReference, skillMentions, virtualPath } from "./references.ts"
import type { ResolvedReference, SkillSource } from "./references.ts"

type Context = Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0]

async function sessionSkills(ctx: Context, sessionID: ToolContext["sessionID"]) {
  const session = await ctx.session.get({ sessionID })
  const catalog = await ctx.skill.list({ location: session.location })
  return { skills: catalog.data, directory: session.location.directory }
}

function relabelResult(result: Result, target: ResolvedReference, directory: string, tool: string): Result {
  const translate = (value: string) => virtualPath(value, target, directory)
  const rawOutput: unknown = result.output
  const output: unknown = Array.isArray(rawOutput) ? rawOutput.map((value: unknown) => {
    if (!value || typeof value !== "object") return value
    const entry = value as { path?: string; entry?: { path?: string } }
    if (typeof entry.path === "string") return { ...entry, path: translate(entry.path) }
    if (typeof entry.entry?.path === "string") return { ...entry, entry: { ...entry.entry, path: translate(entry.entry.path) } }
    return value
  }) : rawOutput
  const content = typeof result.content === "string" ? result.content.split("\n").map((line, index) => {
    if (tool === "read") return index === 0 ? line.replace(target.path, target.uri) : line
    if (tool === "grep") return line.endsWith(":") ? translate(line.slice(0, -1)) + ":" : line
    return translate(line)
  }).join("\n") : result.content?.map((item) => item.type === "file" && item.name === target.path ? { ...item, name: target.uri } : item)
  return { ...result, output, content }
}

function validateGlob(pattern: unknown) {
  if (typeof pattern !== "string") throw new Error("Skill glob patterns must be strings")
  const decoded = decodeURIComponent(pattern)
  const branches = decoded.split(/[{},|()]/)
  if (/[\\\0]/.test(decoded) || branches.some((branch) => path.posix.isAbsolute(branch) || path.win32.isAbsolute(branch) || /^~(?:\/|$)/.test(branch)) || decoded.split(/[/{},|()]/).includes("..")) {
    throw new Error("Glob patterns must stay inside the skill directory")
  }
}

function routedInput(input: unknown, name: string, skills: readonly SkillSource[]) {
  if (!input || typeof input !== "object") return
  const args = input as Record<string, unknown>
  let path = args.path
  let pattern = args.pattern
  // Glob can express its root in either `path` or a scheme-qualified pattern.
  if (name === "glob" && isReference(pattern)) {
    const slash = pattern.indexOf("/", pattern.startsWith("skill://") ? 8 : 1)
    const root = slash === -1 ? pattern : pattern.slice(0, slash)
    if (parseReference(root, skills)) {
      if (path !== undefined) throw new Error("Use a skill reference in either glob.path or glob.pattern, not both")
      path = root
      pattern = slash === -1 ? "**/*" : decodeURIComponent(pattern.slice(slash + 1))
    }
  }
  if (!isReference(path)) return
  const reference = parseReference(path, skills)
  if (!reference) return
  if (name === "glob") validateGlob(pattern)
  return { reference, args: { ...args, ...(name === "glob" ? { pattern } : {}) } }
}

function mutationPaths(name: string, input: unknown) {
  if (!input || typeof input !== "object") return []
  const args = input as Record<string, unknown>
  if (name === "write" || name === "edit") return typeof args.path === "string" ? [args.path] : []
  if (name !== "patch" || typeof args.patchText !== "string") return []
  return [...args.patchText.matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File:|Move to:) (.+)$/gm)].map((match) => match[1])
}

export default Plugin.define({
  id: "dotfiles.skill-urls",
  async setup(ctx) {
    await ctx.tool.transform((editor) => {
      const authorize = editor.get("skill")?.execute
      for (const name of ["read", "glob", "grep"]) {
        editor.update(name, (tool) => {
          const original = tool.execute
          tool.description += " Also accepts read-only skill://<id>[/path] and $<id>[/path] references to registered skills."
          tool.execute = async (input, invocation) => {
            if (!input || typeof input !== "object") return original(input, invocation)
            const args = input as Record<string, unknown>
            if (!isReference(args.path) && !(name === "glob" && isReference(args.pattern))) return original(input, invocation)
            invocation.signal.throwIfAborted()
            const { skills, directory } = await sessionSkills(ctx, invocation.sessionID)
            const routed = routedInput(input, name, skills)
            if (!routed) return original(input, invocation)
            if (!authorize) throw new Error("Skill references require the native skill tool for permission checks")
            // Reuse the native skill permission gate, then the original file tool's
            // read/search and external-directory checks. No direct content reads.
            await authorize({ id: Skill.ID.make(routed.reference.skill.id) }, invocation)
            const target = await resolveReference(routed.reference, name !== "read")
            invocation.signal.throwIfAborted()
            const result = await original({ ...routed.args, path: target.path }, invocation)
            return relabelResult(result, target, directory, name)
          }
        })
      }
    })

    await ctx.tool.hook("execute.before", async (event) => {
      const paths = mutationPaths(event.tool, event.input).filter(isReference)
      if (!paths.length) return
      const { skills } = await sessionSkills(ctx, event.sessionID)
      if (paths.some((value) => parseReference(value, skills))) throw new Error("Skill references are read-only; edit the source path explicitly")
    })

    await ctx.session.hook("prompt", async (event) => {
      if (!event.prompt.text.includes("$") && !event.prompt.text.includes("skill://") && !event.prompt.files?.some((file) => isReference(file.uri))) return
      const { skills } = await sessionSkills(ctx, event.sessionID)
      const selected = new Set(event.prompt.skills?.map((skill) => skill.id))
      for (const mention of skillMentions(event.prompt.text, skills)) {
        const id = Skill.ID.make(mention.id)
        if (selected.has(id)) continue
        selected.add(id)
        event.prompt.skills ??= []
        event.prompt.skills.push({ id, mention: mention.mention })
      }
      await Promise.all((event.prompt.files ?? []).map(async (file) => {
        if (!isReference(file.uri)) return
        const reference = parseReference(file.uri, skills)
        if (!reference) return
        const target = await resolveReference(reference)
        file.uri = pathToFileURL(target.path).href
        file.name ??= target.uri
      }))
    })
  },
})
