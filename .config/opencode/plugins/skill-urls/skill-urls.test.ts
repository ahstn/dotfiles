import { afterAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ToolContext } from "@opencode/plugin/promise/tool"
import plugin from "./index.ts"
import { parseReference, resolveReference, skillMentions } from "./references.ts"

async function expectRejected(promise: Promise<unknown>, message?: string) {
  try { await promise } catch (error) {
    expect(error).toBeInstanceOf(Error)
    if (message) expect(error instanceof Error ? error.message : String(error)).toContain(message)
    return
  }
  throw new Error("Expected the operation to reject")
}

const temporary = path.join(tmpdir(), "opencode")
mkdirSync(temporary, { recursive: true })
const root = realpathSync(mkdtempSync(path.join(temporary, "skill-urls-unit-")))
const skillDirectory = path.join(root, "review")
mkdirSync(path.join(skillDirectory, "references"), { recursive: true })
writeFileSync(path.join(skillDirectory, "SKILL.md"), "---\nname: Review\n---\nReview carefully.\n")
writeFileSync(path.join(skillDirectory, "references", "notes.md"), "one\ntwo\nthree\n")
writeFileSync(path.join(skillDirectory, "references", "space name.md"), "space")
writeFileSync(path.join(root, "outside.md"), "private outside content")
symlinkSync(path.join(root, "outside.md"), path.join(skillDirectory, "escape.md"))
symlinkSync(skillDirectory, path.join(root, "linked-review"))
const skills = [{ id: "review", path: path.join(skillDirectory, "SKILL.md") }]
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe("skill reference resolution", () => {
  for (const value of ["skill://review", "$review", "skill://review/", "$review/."]) {
    test(`${value} reads the registered instruction file`, async () => {
      const result = await resolveReference(parseReference(value, skills)!)
      expect(result.path).toBe(skills[0].path)
      expect(result.uri).toBe("skill://review")
    })
  }

  test("bare references select the base directory for searches", async () => {
    expect((await resolveReference(parseReference("$review", skills)!, true)).path).toBe(skillDirectory)
  })

  test("supports nested resources and percent-encoded spaces", async () => {
    expect((await resolveReference(parseReference("skill://review/references/space%20name.md", skills)!)).path)
      .toBe(path.join(skillDirectory, "references", "space name.md"))
  })

  for (const value of ["skill://review/../outside.md", "skill://review/%2e%2e/outside.md", "skill://review/%2fetc/passwd", "skill://review/a%5c..%5cb", "skill://review/a%00b", "skill://review/SKILL.md?raw=1", "skill://review/SKILL.md#1", "skill://review/%ZZ"]) {
    test(`rejects unsafe or unsupported path ${value}`, () => {
      expect(() => parseReference(value, skills)).toThrow()
    })
  }

  test("rejects symlinks out of the skill directory", async () => {
    await expectRejected(resolveReference(parseReference("skill://review/escape.md", skills)!), "symlink escapes")
  })

  test("accepts a registered symlinked skill directory", async () => {
    const linked = [{ id: "review", path: path.join(root, "linked-review", "SKILL.md") }]
    expect((await resolveReference(parseReference("skill://review", linked)!)).path).toBe(skills[0].path)
  })

  test("retains exact ID casing; unknown explicit URLs fail rather than falling back", () => {
    expect(() => parseReference("skill://Review", skills)).toThrow("Unknown skill")
    expect(() => parseReference("skill://", skills)).toThrow("Unknown skill")
    expect(parseReference("$HOME", skills)).toBeUndefined()
    expect(parseReference("ordinary.md", skills)).toBeUndefined()
  })
})

describe("prompt aliases", () => {
  test("records native mention spans without changing prompt text", () => {
    const text = "Use $review and skill://review."
    expect(skillMentions(text, skills)).toEqual([
      { id: "review", mention: { start: 4, end: 11, text: "$review" } },
      { id: "review", mention: { start: 16, end: 30, text: "skill://review" } },
    ])
  })

  test("does not reinterpret escaped aliases, variables, longer IDs, or supporting files", () => {
    expect(skillMentions("\\$review $$review ${review} $HOME $review-more $review.md $review/notes.md skill://review/notes.md", skills)).toEqual([])
  })

  test("ignores Markdown inline code and complete/incomplete fenced blocks", () => {
    const text = "`$review` ``skill://review``\n```sh\n$review\n```\nUse ($review).\n~~~\nskill://review"
    expect(skillMentions(text, skills).map((mention) => mention.mention.text)).toEqual(["$review"])
  })

  test("tracks offsets in the original text with Unicode and newlines", () => {
    const text = "🦀\nUse $review"
    const [mention] = skillMentions(text, skills)
    expect(text.slice(mention.mention.start, mention.mention.end)).toBe("$review")
  })

  test("prefers the longest registered ID", () => {
    expect(skillMentions("$review-deep", [...skills, { id: "review-deep", path: skills[0].path }]).map((mention) => mention.id)).toEqual(["review-deep"])
  })
})

type SetupContext = Parameters<typeof plugin.setup>[0]
type Execute = (input: unknown, context: ToolContext) => Promise<{ output?: unknown; content?: string }>
type PromptEvent = { sessionID: ToolContext["sessionID"]; prompt: { text: string; skills?: { id: string; mention?: unknown }[]; files?: { uri: string; name?: string; mention?: unknown }[] } }

async function harness() {
  const calls: { tool: string; input: unknown }[] = []
  let denySkill = false
  let denyRead = false
  let currentDirectory = root
  const tools = new Map<string, { name: string; description: string; execute: Execute }>()
  tools.set("skill", { name: "skill", description: "skill", execute: async (input) => {
    calls.push({ tool: "skill", input })
    if (denySkill) throw new Error("Native skill permission denied")
    return { content: "native skill permission checked" }
  } })
  for (const name of ["read", "glob", "grep"]) {
    tools.set(name, { name, description: name, execute: async (input) => {
      calls.push({ tool: name, input })
      if (denyRead) throw new Error("Native filesystem permission denied")
      const args = input as { path: string; offset?: number; limit?: number }
      if (name === "read") {
        const lines = readFileSync(args.path, "utf8").trimEnd().split("\n")
        const offset = args.offset ?? 1
        const selected = lines.slice(offset - 1, offset - 1 + (args.limit ?? lines.length))
        return { output: { type: "text-page", content: selected.join("\n"), offset }, content: `Read file ${args.path}, lines ${offset}-${offset + selected.length - 1}\n${selected.map((line, index) => `${offset + index}: ${line}`).join("\n")}` }
      }
      const target = path.join(args.path, "references", "notes.md")
      const entry = { path: path.relative(currentDirectory, target), type: "file" }
      return name === "glob"
        ? { output: [entry], content: target }
        : { output: [{ entry, line: 2, text: "two" }], content: `Found 1 matches\n${target}:\n  Line 2: two` }
    } })
  }
  let promptHook: (event: PromptEvent) => Promise<void>
  let mutationHook: (event: { tool: string; input: unknown; sessionID: ToolContext["sessionID"] }) => Promise<void>
  const context = {
    session: {
      get: async () => ({ location: { directory: currentDirectory } }),
      hook: async (_name: string, hook: typeof promptHook) => { promptHook = hook },
    },
    skill: { list: async (input: { location: { directory: string } }) => {
      expect(input.location.directory).toBe(currentDirectory)
      return { data: skills }
    } },
    tool: {
      transform: async (apply: (editor: unknown) => void) => apply({
        get: (name: string) => tools.get(name),
        update: (name: string, update: (tool: unknown) => void) => { const tool = tools.get(name); if (tool) update(tool) },
      }),
      hook: async (_name: string, hook: typeof mutationHook) => { mutationHook = hook },
    },
  } as unknown as SetupContext
  await plugin.setup(context)
  const invocation = {
    sessionID: "ses_fixture", agent: "build", messageID: "msg_fixture", id: "call_fixture",
    signal: new AbortController().signal, progress: async () => {},
  } as unknown as ToolContext
  return {
    calls, tools, invocation,
    prompt: (prompt: PromptEvent["prompt"]) => promptHook!({ sessionID: invocation.sessionID, prompt }),
    mutate: (tool: string, input: unknown) => mutationHook!({ tool, input, sessionID: invocation.sessionID }),
    denySkill: () => { denySkill = true }, denyRead: () => { denyRead = true },
    move: (directory: string) => { currentDirectory = directory },
  }
}

describe("plugin hooks and original executor delegation", () => {
  test("reads a supporting file through both native permission gates and preserves pagination", async () => {
    const h = await harness()
    const result = await h.tools.get("read")!.execute({ path: "$review/references/notes.md", offset: 2, limit: 1 }, h.invocation)
    expect(h.calls.map((call) => call.tool)).toEqual(["skill", "read"])
    expect(h.calls[1].input).toEqual({ path: path.join(skillDirectory, "references", "notes.md"), offset: 2, limit: 1 })
    expect(result.content).toBe("Read file skill://review/references/notes.md, lines 2-2\n2: two")
  })

  test("normal filesystem calls and unknown $filenames remain untouched", async () => {
    const h = await harness()
    await h.tools.get("read")!.execute({ path: skills[0].path }, h.invocation)
    expect(h.calls.map((call) => call.tool)).toEqual(["read"])
    await expectRejected(h.tools.get("read")!.execute({ path: "$HOME" }, h.invocation))
    expect(h.calls.map((call) => call.tool)).toEqual(["read", "read"])
  })

  test("a denied native skill permission stops before any filesystem executor", async () => {
    const h = await harness()
    h.denySkill()
    await expectRejected(h.tools.get("read")!.execute({ path: "skill://review" }, h.invocation), "Native skill permission denied")
    expect(h.calls.map((call) => call.tool)).toEqual(["skill"])
  })

  test("native read/external-directory refusal is not bypassed", async () => {
    const h = await harness()
    h.denyRead()
    await expectRejected(h.tools.get("read")!.execute({ path: "skill://review" }, h.invocation), "Native filesystem permission denied")
  })

  test("symlink escapes never reach the filesystem executor", async () => {
    const h = await harness()
    await expectRejected(h.tools.get("read")!.execute({ path: "skill://review/escape.md" }, h.invocation), "symlink escapes")
    expect(h.calls.map((call) => call.tool)).toEqual(["skill"])
  })

  for (const name of ["glob", "grep"]) {
    test(`${name} uses directory roots and returns virtual paths in structured and text output`, async () => {
      const h = await harness()
      const result = await h.tools.get(name)!.execute({ path: "skill://review", pattern: "two" }, h.invocation)
      expect(result.content).toContain("skill://review/references/notes.md")
      expect(JSON.stringify(result.output)).toContain("skill://review/references/notes.md")
      expect(h.calls[1].input).toEqual({ path: skillDirectory, pattern: "two" })
    })
  }

  test("glob supports scheme-qualified patterns and rejects ambiguous or escaping roots", async () => {
    const h = await harness()
    await h.tools.get("glob")!.execute({ pattern: "skill://review/references/**/*.md" }, h.invocation)
    expect(h.calls[1].input).toEqual({ path: skillDirectory, pattern: "references/**/*.md" })
    await expectRejected(h.tools.get("glob")!.execute({ pattern: "$review/../*.md" }, h.invocation), "must stay inside")
    await expectRejected(h.tools.get("glob")!.execute({ path: root, pattern: "skill://review/**/*.md" }, h.invocation), "either")
  })

  test("unknown $ glob patterns retain their original path and filter", async () => {
    const h = await harness()
    await h.tools.get("glob")!.execute({ path: skillDirectory, pattern: "$ordinary/**/*.md" }, h.invocation)
    expect(h.calls).toEqual([{ tool: "glob", input: { path: skillDirectory, pattern: "$ordinary/**/*.md" } }])
  })

  test("unknown dollar filters do not prevent a valid URI root from routing", async () => {
    const h = await harness()
    await h.tools.get("glob")!.execute({ path: "skill://review", pattern: "$generated/**/*.md" }, h.invocation)
    expect(h.calls.map((call) => call.tool)).toEqual(["skill", "glob"])
    expect(h.calls[1].input).toEqual({ path: skillDirectory, pattern: "$generated/**/*.md" })
  })

  for (const pattern of ["/etc/*", "C:/Windows/*", "../*.md", "%2fetc/*", "%2e%2e/*.md", "{/etc/*,*.md}", "references/{../../*,*.md}"]) {
    test(`rejects rooted/traversing glob ${pattern} for an aliased path`, async () => {
      const h = await harness()
      await expectRejected(h.tools.get("glob")!.execute({ path: "skill://review", pattern }, h.invocation), "must stay inside")
      expect(h.calls).toHaveLength(0)
    })
  }

  test("uses the caller session's current location after moves", async () => {
    const h = await harness()
    h.move(path.join(root, "moved"))
    await h.tools.get("read")!.execute({ path: "skill://review" }, h.invocation)
    expect(h.calls).toHaveLength(2)
  })

  test("cancellation stops before authorization or filesystem access", async () => {
    const h = await harness()
    const controller = new AbortController()
    controller.abort()
    await expectRejected(h.tools.get("read")!.execute({ path: "skill://review" }, { ...h.invocation, signal: controller.signal }))
    expect(h.calls).toHaveLength(0)
  })

  test("prompt aliases append native attachments once, preserve existing mentions, and leave text intact", async () => {
    const h = await harness()
    const prompt = { text: "Use $review twice: $review and skill://review." } as PromptEvent["prompt"]
    await h.prompt(prompt)
    await h.prompt(prompt)
    expect(prompt.text).toBe("Use $review twice: $review and skill://review.")
    expect(prompt.skills).toEqual([{ id: "review", mention: { start: 4, end: 11, text: "$review" } }])
    const existing = { text: "$review", skills: [{ id: "review", mention: { text: "@review" } }] }
    await h.prompt(existing)
    expect(existing.skills).toHaveLength(1)
    expect(existing.skills[0].mention.text).toBe("@review")
  })

  test("translates explicit file attachments before admission", async () => {
    const h = await harness()
    const prompt = { text: "Read this", files: [{ uri: "skill://review/references/notes.md" }] } as PromptEvent["prompt"]
    await h.prompt(prompt)
    expect(prompt.files![0].uri).toBe(`file://${path.join(skillDirectory, "references", "notes.md")}`)
    expect(prompt.files![0].name).toBe("skill://review/references/notes.md")
  })

  for (const [tool, input] of [
    ["write", { path: "$review/SKILL.md", content: "replace" }],
    ["edit", { path: "skill://review/SKILL.md" }],
    ["patch", { patchText: "*** Begin Patch\n*** Delete File: skill://review/SKILL.md\n*** End Patch" }],
    ["patch", { patchText: "*** Begin Patch\n*** Update File: normal.md\n*** Move to: $review/SKILL.md\n*** End Patch" }],
  ] as const) {
    test(`rejects read-only skill mutations through ${tool}`, async () => {
      const h = await harness()
      await expectRejected(h.mutate(tool, input), "read-only")
    })
  }

  test("does not prohibit edits to explicit source paths or ordinary $filenames", async () => {
    const h = await harness()
    await h.mutate("write", { path: "$ordinary" })
    await h.mutate("edit", { path: skills[0].path })
  })
})
