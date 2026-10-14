import { realpath } from "node:fs/promises"
import path from "node:path"

export type SkillSource = { id: string; path: string }
export type SkillReference = { skill: SkillSource; relative: string; uri: string }
export type ResolvedReference = SkillReference & { path: string }
export type Mention = { id: string; mention: { start: number; end: number; text: string } }

export function isReference(value: unknown): value is string {
  return typeof value === "string" && (value.startsWith("skill://") || value.startsWith("$"))
}

export function parseReference(value: string, skills: readonly SkillSource[]): SkillReference | undefined {
  const explicit = value.startsWith("skill://")
  if (!explicit && !value.startsWith("$")) return
  const body = value.slice(explicit ? 8 : 1)
  const slash = body.indexOf("/")
  const rawId = slash === -1 ? body : body.slice(0, slash)
  let id: string
  try {
    id = decodeURIComponent(rawId)
  } catch {
    throw new Error("Invalid skill reference encoding")
  }
  const skill = skills.find((entry) => entry.id === id)
  if (!skill) {
    if (!explicit) return // Unknown $variables and literal filenames retain native behavior.
    throw new Error(`Unknown skill: ${id || "(empty)"}`)
  }
  let relative: string
  try {
    relative = decodeURIComponent(slash === -1 ? "" : body.slice(slash + 1))
  } catch {
    throw new Error("Invalid skill path encoding")
  }
  if (/[\\\0?#]/.test(relative) || relative.startsWith("/") || relative.split("/").includes("..")) {
    throw new Error("Skill references must stay inside the skill directory; queries and fragments are unsupported")
  }
  const segments = relative.split("/").filter((segment) => segment !== "" && segment !== ".")
  relative = segments.join("/")
  return {
    skill,
    relative,
    uri: `skill://${encodeURIComponent(skill.id)}${relative ? "/" + segments.map(encodeURIComponent).join("/") : ""}`,
  }
}

function contained(root: string, target: string) {
  const relative = path.relative(root, target)
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

export async function resolveReference(reference: SkillReference, directory = false): Promise<ResolvedReference> {
  const lexicalRoot = path.dirname(path.resolve(reference.skill.path))
  const target = reference.relative
    ? path.resolve(lexicalRoot, reference.relative)
    : directory ? lexicalRoot : path.resolve(reference.skill.path)
  if (!contained(lexicalRoot, target)) throw new Error("Skill path escapes its directory")
  const root = await realpath(lexicalRoot)
  const canonical = await realpath(target)
  if (!contained(root, canonical)) throw new Error("Skill symlink escapes its directory")
  return { ...reference, path: canonical }
}

// Preserve ordinary Markdown code and shell variables. Only exact registered
// IDs at token boundaries become attachments; supporting-file URLs stay text.
export function skillMentions(text: string, skills: readonly SkillSource[]): Mention[] {
  const candidates = skills.flatMap((skill) => [
    { id: skill.id, token: `$${skill.id}` },
    { id: skill.id, token: `skill://${encodeURIComponent(skill.id)}` },
  ]).sort((left, right) => right.token.length - left.token.length)
  const result: Mention[] = []
  let fence: { character: string; length: number } | undefined
  let lineStart = true
  for (let index = 0; index < text.length;) {
    if (lineStart) {
      const lineEnd = text.indexOf("\n", index)
      const line = text.slice(index, lineEnd === -1 ? text.length : lineEnd)
      const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
      if (fence) {
        if (delimiter?.[1][0] === fence.character && delimiter[1].length >= fence.length && !delimiter[2].trim()) fence = undefined
        index = lineEnd === -1 ? text.length : lineEnd + 1
        continue
      }
      if (delimiter) {
        fence = { character: delimiter[1][0], length: delimiter[1].length }
        index = lineEnd === -1 ? text.length : lineEnd + 1
        continue
      }
    }
    lineStart = text[index] === "\n"
    if (text[index] === "`") {
      const delimiter = /^`+/.exec(text.slice(index))![0]
      let end = text.indexOf(delimiter, index + delimiter.length)
      while (end !== -1 && (text[end - 1] === "`" || text[end + delimiter.length] === "`")) {
        end = text.indexOf(delimiter, end + delimiter.length)
      }
      if (end !== -1) {
        index = end + delimiter.length
        lineStart = false
        continue
      }
    }
    const before = index === 0 ? "" : text[index - 1]
    if (!before || /[\s([{'"]/.test(before)) {
      const match = candidates.find(({ token }) => {
        if (!text.startsWith(token, index)) return false
        const after = text[index + token.length] ?? ""
        return !after || /[\s),\]}'".!?:;]/.test(after) && !(after === "." && /[\w-]/.test(text[index + token.length + 1] ?? ""))
      })
      if (match) {
        result.push({ id: match.id, mention: { start: index, end: index + match.token.length, text: match.token } })
        index += match.token.length
        continue
      }
    }
    index++
  }
  return result
}

export function virtualPath(value: string, target: ResolvedReference, directory: string) {
  const absolute = path.resolve(directory, value)
  if (!contained(target.path, absolute)) return value
  const relative = path.relative(target.path, absolute).split(path.sep).filter(Boolean).map(encodeURIComponent).join("/")
  return target.uri + (relative ? "/" + relative : "")
}
