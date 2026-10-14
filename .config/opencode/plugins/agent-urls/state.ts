import type { Plugin } from "@opencode/plugin"
import type { SessionContext } from "@opencode/plugin/promise/session"
import type { ToolContext } from "@opencode/plugin/promise/tool"

export type Context = Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0]
export type Invocation = Pick<ToolContext, "sessionID" | "agent" | "messageID" | "id" | "signal">
export type Snapshot = { system: SessionContext["system"]; agent: string; tools: string[] }
export type Status = "starting" | "running" | "completed" | "failed" | "interrupted"
export type Worker = {
  id: string; rootID: string; parentID: string; directory: string; model: string; description: string;
  snapshot: Snapshot; status: Status; requestedAt: number; turn: number; messages: number;
  output?: string; error?: string; notifiedTurn?: number;
}

export const handle = (id: string) => `agent://${id}`
export const workerKey = (id: string) => `worker/${id}`
export const snapshotKey = (id: string) => `snapshot/${id}`
export const familyPrefix = (rootID: string) => `family/${rootID}/`
export const active = (worker: Worker) => worker.status === "starting" || worker.status === "running"

export function parseTarget(input: string) {
  if (!input.startsWith("agent://") || /[?#\\\0]/.test(input)) throw new Error("Expected agent://<session-id>[/JSON/path]")
  const [rawID, ...rawSegments] = input.slice(8).split("/")
  const id = decodeURIComponent(rawID)
  if (!id || /[\s/\\]/.test(id) || id === "." || id === "..") throw new Error("Invalid agent handle")
  const segments = rawSegments.filter(Boolean).map(decodeURIComponent)
  if (segments.some((segment) => segment === ".." || /[\\\0]/.test(segment))) throw new Error("Invalid agent JSON path")
  return { id, segments, uri: handle(id) }
}

export function extract(output: string, segments: string[]) {
  let value: unknown
  try { value = JSON.parse(output) } catch { throw new Error("Published agent output is not valid JSON") }
  for (const segment of segments) {
    if (value === null || typeof value !== "object") { value = undefined; break }
    if (Array.isArray(value)) {
      value = /^\d+$/.test(segment) && Number.isSafeInteger(Number(segment)) ? value[Number(segment)] : undefined
    } else {
      value = Object.hasOwn(value, segment) ? (value as Record<string, unknown>)[segment] : undefined
    }
  }
  return typeof value === "string" ? value : JSON.stringify(value ?? null, null, 2)
}

export function textPage(uri: string, text: string, offset = 1, limit = 2000) {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 0) throw new Error("Invalid read offset/limit")
  offset ||= 1
  const lines = text.replace(/\n$/, "").split("\n")
  if (offset > lines.length) throw new Error("Read offset exceeds agent output length")
  const selected: string[] = []
  let bytes = 0
  for (const line of lines.slice(offset - 1, offset - 1 + Math.min(limit, 2000))) {
    const bounded = line.length > 2000 ? line.slice(0, 2000) + "... (line truncated)" : line
    if (bytes + Buffer.byteLength(bounded) + 1 > 50 * 1024) break
    selected.push(bounded)
    bytes += Buffer.byteLength(bounded) + 1
  }
  const next = offset + selected.length
  const truncated = next <= lines.length
  return {
    output: { type: "text-page", mime: "text/plain", content: selected.join("\n"), offset, truncated, ...(truncated ? { next } : {}) },
    content: [`Read file ${uri}, lines ${offset}-${next - 1}`, ...selected.map((line, index) => `${offset + index}: ${line}`), ...(truncated ? [`[Output truncated. Continue reading with offset: ${next}]`] : [])].join("\n"),
    metadata: { truncated },
  }
}

export function publicWorker(worker: Worker) {
  return { uri: handle(worker.id), parent: handle(worker.parentID), model: worker.model, description: worker.description, status: worker.status, turn: worker.turn, ...(worker.error ? { error: worker.error } : {}) }
}

// Serialize mutations within a family, without holding locks while a model runs.
export class Serial {
  private tails = new Map<string, Promise<void>>()
  async run<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve()
    let release!: () => void
    const tail = new Promise<void>((resolve) => { release = resolve })
    this.tails.set(key, tail)
    await previous
    try { return await action() } finally {
      release()
      if (this.tails.get(key) === tail) this.tails.delete(key)
    }
  }
}
