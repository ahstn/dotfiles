import { describe, expect, test } from "bun:test"
import { Coordinator } from "./coordinator.ts"
import plugin from "./index.ts"
import { extract, parseTarget, snapshotKey, textPage, workerKey } from "./state.ts"
import type { Context, Invocation, Snapshot, Worker } from "./state.ts"

const snapshot: Snapshot = { agent: "build", system: [{ type: "text", text: "EXACT_PARENT_SYSTEM" }], tools: ["agent_send", "agent_spawn", "read"] }

function fixture(options: Record<string, unknown> = {}) {
  const data = new Map<string, unknown>([[snapshotKey("root"), structuredClone(snapshot)]])
  type Session = { id: string; parentID?: string; agent?: string; permissions?: unknown[]; location: { directory: string }; time: { idle?: number }; outcome?: string }
  const sessions = new Map<string, Session>([
    ["root", { id: "root", agent: "build", permissions: [{ action: "edit", resource: "*", effect: "ask" }], location: { directory: "/project" }, time: {} }],
    ["foreign", { id: "foreign", location: { directory: "/project" }, time: {} }],
  ])
  const creates: Record<string, unknown>[] = []
  const prompts: Record<string, unknown>[] = []
  const notifications: Record<string, unknown>[] = []
  const assertions: { action: string; resources: string[]; agent: string }[] = []
  const interrupted: string[] = []
  const outputs = new Map<string, string>()
  const hooks = new Map<string, (event: unknown) => Promise<void>>()
  const tools = new Map<string, { execute: (input: unknown, invocation: Invocation) => Promise<unknown> }>([
    ["read", { execute: async () => ({ content: "ordinary read" }) }],
    ["write", { execute: async () => ({ content: "ordinary write" }) }],
  ])
  let blockedAction: string | undefined
  let rejectPrompt = false
  const profileRules = [{ action: "shell", resource: "*", effect: "deny" }]
  const ctx = {
    options, location: { directory: "/project" },
    storage: {
      get: async (key: string) => structuredClone(data.get(key)),
      set: async (key: string, value: unknown) => { data.set(key, structuredClone(value)) },
      remove: async (key: string) => { data.delete(key) },
      scan: async ({ prefix }: { prefix: string }) => ({ entries: [...data].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, value })) }),
    },
    permission: { assert: async (input: typeof assertions[number]) => {
      assertions.push(input)
      if (input.action === blockedAction) throw new Error(`Native ${input.action} permission denied`)
    } },
    agent: { get: async () => ({ data: { permissions: profileRules } }) },
    model: { list: async () => ({ data: [
      { providerID: "fixture", id: "worker", enabled: true, capabilities: { tools: true }, variants: [{ id: "high" }] },
      { providerID: "fixture", id: "text", enabled: true, capabilities: { tools: false }, variants: [] },
    ] }) },
    session: {
      get: async ({ sessionID }: { sessionID: string }) => { const session = sessions.get(sessionID); if (!session) throw new Error("Session missing"); return structuredClone(session) },
      create: async (input: Record<string, unknown>) => {
        creates.push(input)
        const id = `child${creates.length}`
        const session = { id, parentID: input.parentID as string, agent: input.agent as string, permissions: input.permissions as unknown[], location: { directory: "/project" }, time: {} }
        sessions.set(id, session)
        return structuredClone(session)
      },
      prompt: async (input: Record<string, unknown>) => { if (rejectPrompt) throw new Error("Admission failed"); prompts.push(input); return {} },
      synthetic: async (input: Record<string, unknown>) => { notifications.push(input); return {} },
      interrupt: async ({ sessionID }: { sessionID: string }) => { interrupted.push(sessionID) },
      context: async ({ sessionID }: { sessionID: string }) => outputs.has(sessionID) ? [{ type: "assistant", content: [{ type: "text", text: outputs.get(sessionID) }] }] : [],
      hook: async (name: string, callback: (event: unknown) => Promise<void>) => { hooks.set(name, callback) },
    },
    tool: {
      transform: async (apply: (editor: unknown) => void) => apply({ add: (tool: { name: string; execute: (input: unknown, invocation: Invocation) => Promise<unknown> }) => tools.set(tool.name, tool), update: (name: string, mutate: (tool: unknown) => void) => mutate(tools.get(name)) }),
      hook: async (name: string, callback: (event: unknown) => Promise<void>) => { hooks.set(`tool.${name}`, callback) },
    },
    event: { subscribe: () => ({ async *[Symbol.asyncIterator]() {} }) },
  } as unknown as Context
  const coordinator = new Coordinator(ctx)
  const invocation = (sessionID = "root", id = "call1"): Invocation => ({ sessionID, agent: "build", messageID: `msg_${id}`, id, signal: new AbortController().signal }) as Invocation
  const spawn = (source = invocation()) => coordinator.spawn({ model: "fixture/worker#high", prompt: "TASK_ONLY", description: "Worker test" }, source)
  const complete = (id: string, text = '{"findings":[{"path":"src/demo.ts"}]}') => {
    const session = sessions.get(id)!
    session.time.idle = Date.now() + 10
    session.outcome = "succeeded"
    outputs.set(id, text)
  }
  return { ctx, coordinator, invocation, spawn, complete, data, sessions, creates, prompts, notifications, assertions, outputs, hooks, tools, interrupted, profileRules, block: (action: string) => { blockedAction = action }, failAdmission: () => { rejectPrompt = true } }
}

describe("model-selected spawn and frozen authority", () => {
  test("uses the requested model without defining a new agent profile or copying conversation history", async () => {
    const h = fixture()
    const worker = await h.spawn()
    expect(worker.uri).toBe("agent://child1")
    expect(h.creates[0]).toMatchObject({ parentID: "root", agent: "build", model: { providerID: "fixture", id: "worker", variant: "high" } })
    expect(h.creates[0].permissions).toEqual([{ action: "edit", resource: "*", effect: "ask" }])
    expect(h.creates[0].permissions).not.toContainEqual(h.profileRules[0])
    expect(h.prompts[0].text).toContain("Your parent is agent://root")
    expect(h.prompts[0].text).toContain("TASK_ONLY")
    const stored = h.data.get(workerKey("child1")) as Worker
    h.data.set(snapshotKey("root"), { ...snapshot, system: [{ type: "text", text: "CHANGED_LATER" }] })
    expect(stored.snapshot.system).toEqual(snapshot.system)
    expect(h.assertions.map((item) => item.action)).toEqual(["subagent", "agent_spawn"])
  })

  test("fails closed before creating a child when native permissions deny", async () => {
    for (const action of ["subagent", "agent_spawn"]) {
      const h = fixture()
      h.block(action)
      await expect(h.spawn()).rejects.toThrow("permission denied")
      expect(h.creates).toHaveLength(0)
    }
  })

  for (const model of ["fixture/missing", "fixture/worker#unknown", "fixture/text"]) {
    test(`rejects unavailable, invalid-variant, or tool-less model ${model}`, async () => {
      const h = fixture()
      await expect(h.coordinator.spawn({ model, prompt: "task", description: "test" }, h.invocation())).rejects.toThrow()
      expect(h.creates).toHaveLength(0)
    })
  }

  test("requires a captured effective system prompt", async () => {
    const h = fixture()
    h.data.delete(snapshotKey("root"))
    await expect(h.spawn()).rejects.toThrow("captured")
    expect(h.creates).toHaveLength(0)
  })

  test("bounds active fan-out even when spawn calls race", async () => {
    const h = fixture({ maxActive: 1 })
    const results = await Promise.allSettled([h.spawn(h.invocation("root", "one")), h.spawn(h.invocation("root", "two"))])
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    expect(h.creates).toHaveLength(1)
  })

  test("bounds nested spawning and rejects invalid options", async () => {
    const h = fixture()
    await h.spawn()
    await expect(h.spawn(h.invocation("child1"))).rejects.toThrow("depth limit")
    expect(() => fixture({ maxDepth: 0 })).toThrow("Invalid")
  })

  test("interrupts a newly created worker when prompt admission fails", async () => {
    const h = fixture()
    h.failAdmission()
    await expect(h.spawn()).rejects.toThrow("Admission failed")
    expect(h.interrupted).toEqual(["child1"])
    expect((h.data.get(workerKey("child1")) as Worker).status).toBe("failed")
  })

  test("cancellation before launch makes no child/model request", async () => {
    const h = fixture()
    const controller = new AbortController()
    controller.abort()
    await expect(h.spawn({ ...h.invocation(), signal: controller.signal })).rejects.toThrow()
    expect(h.creates).toHaveLength(0)
  })
})

describe("family-scoped two-way communication", () => {
  test("delivers parent-to-child and child-to-parent with sender attribution", async () => {
    const h = fixture()
    await h.spawn()
    await h.coordinator.send("child1", "PARENT_TO_CHILD", "steer", h.invocation("root", "send1"))
    await h.coordinator.send("root", "CHILD_TO_PARENT", "queue", h.invocation("child1", "send2"))
    expect(h.prompts[1]).toMatchObject({ sessionID: "child1", delivery: "steer", metadata: { sender: "root" } })
    expect(h.prompts[2]).toMatchObject({ sessionID: "root", delivery: "queue", metadata: { sender: "child1" } })
    expect(h.prompts[2].text).toContain("not a permission grant")
  })

  test("replayed tool calls are idempotent and conflicting reuse is rejected", async () => {
    const h = fixture()
    await h.spawn()
    const call = h.invocation("root", "send")
    await h.coordinator.send("child1", "hello", "queue", call)
    await h.coordinator.send("child1", "hello", "queue", call)
    expect(h.prompts).toHaveLength(2)
    expect((h.data.get(workerKey("child1")) as Worker).turn).toBe(2)
    await expect(h.coordinator.send("child1", "different", "queue", call)).rejects.toThrow("identity")
  })

  test("broadcast reaches family peers, never the sender or foreign roots", async () => {
    const h = fixture()
    await h.spawn(h.invocation("root", "spawn1"))
    await h.spawn(h.invocation("root", "spawn2"))
    const result = await h.coordinator.send("all", "broadcast", "queue", h.invocation("child1", "broadcast"))
    expect(result.delivered.sort()).toEqual(["agent://child2", "agent://root"])
    await expect(h.coordinator.send("foreign", "no", "steer", h.invocation())).rejects.toThrow("family")
    await expect(h.coordinator.send("root", "self", "steer", h.invocation())).rejects.toThrow("Self")
  })

  test("native send denial causes no message admission", async () => {
    const h = fixture()
    await h.spawn()
    h.block("agent_send")
    await expect(h.coordinator.send("child1", "denied", "steer", h.invocation())).rejects.toThrow("permission denied")
    expect(h.prompts).toHaveLength(1)
  })

  test("worker outgoing-message limits prevent unbounded ping-pong", async () => {
    const h = fixture({ maxMessages: 1 })
    await h.spawn()
    await h.coordinator.send("root", "one", "queue", h.invocation("child1", "one"))
    await expect(h.coordinator.send("root", "two", "queue", h.invocation("child1", "two"))).rejects.toThrow("message limit")
  })

  test("empty/oversized messages and moved locations are rejected", async () => {
    const h = fixture()
    await h.spawn()
    await expect(h.coordinator.send("child1", " ", "queue", h.invocation())).rejects.toThrow("32 KiB")
    await expect(h.coordinator.send("child1", "x".repeat(32769), "queue", h.invocation())).rejects.toThrow("32 KiB")
    h.sessions.get("child1")!.location.directory = "/other"
    await expect(h.coordinator.send("child1", "hello", "queue", h.invocation())).rejects.toThrow("moved")
  })

  test("roots can stop descendants, but workers cannot stop root or siblings", async () => {
    const h = fixture()
    await h.spawn(h.invocation("root", "first"))
    await h.spawn(h.invocation("root", "second"))
    await expect(h.coordinator.stop("root", h.invocation("child1"))).rejects.toThrow("cannot be stopped")
    await expect(h.coordinator.stop("child2", h.invocation("child1"))).rejects.toThrow("ancestor")
    await h.coordinator.stop("child1", h.invocation())
    expect(h.interrupted).toEqual(["child1"])
  })

  test("unmanaged native subagents do not gain the coordination mailbox", async () => {
    const h = fixture()
    h.sessions.set("unmanaged", { id: "unmanaged", parentID: "root", location: { directory: "/project" }, time: {} })
    await expect(h.coordinator.send("root", "message", "queue", h.invocation("unmanaged"))).rejects.toThrow("not a managed")
    await expect(h.coordinator.status("all", h.invocation("unmanaged"))).rejects.toThrow("not a managed")
  })

  test("stopping a completed worker preserves its terminal result", async () => {
    const h = fixture()
    await h.spawn()
    h.complete("child1", "done")
    expect((await h.coordinator.stop("child1", h.invocation())).status).toBe("completed")
    expect(h.interrupted).toHaveLength(0)
    await expect(h.coordinator.stop("child1", h.invocation("child1"))).rejects.toThrow("Finish your own task")
  })
})

describe("published output, progress, and prompt hooks", () => {
  test("persists completed outputs, extracts JSON fields, and notifies only once per turn", async () => {
    const h = fixture()
    await h.spawn()
    h.complete("child1")
    await h.coordinator.settled("child1", "completed")
    await h.coordinator.settled("child1", "completed")
    expect(h.notifications).toHaveLength(1)
    expect(h.notifications[0].text).not.toContain("src/demo.ts")
    expect(await h.coordinator.read("child1", ["findings", "0", "path"], h.invocation())).toBe("src/demo.ts")
    expect(JSON.stringify(await h.coordinator.status("child1", h.invocation()))).not.toContain("EXACT_PARENT_SYSTEM")
  })

  test("read/status can recover a completed snapshot without waking a model", async () => {
    const h = fixture()
    await h.spawn()
    h.complete("child1", "done")
    expect(await h.coordinator.read("child1", [], h.invocation())).toBe("done")
    expect(h.notifications).toHaveLength(0)
  })

  test("marks previous output as stale and refuses JSON extraction while running", async () => {
    const h = fixture()
    await h.spawn()
    h.complete("child1", "previous")
    await h.coordinator.read("child1", [], h.invocation())
    h.sessions.get("child1")!.time.idle = undefined
    await h.coordinator.send("child1", "follow up", "queue", h.invocation("root", "followup"))
    const progress = await h.coordinator.read("child1", [], h.invocation())
    expect(progress).toContain("Previous completed output (not current)")
    expect(progress.indexOf("previous")).toBeGreaterThan(progress.indexOf("Previous completed output"))
    await expect(h.coordinator.read("child1", ["field"], h.invocation())).rejects.toThrow("not published")
  })

  test("virtual read permissions and family membership cannot be bypassed", async () => {
    const h = fixture()
    await h.spawn()
    h.block("read")
    await expect(h.coordinator.read("child1", [], h.invocation())).rejects.toThrow("Native read")
    const other = fixture()
    await expect(other.coordinator.read("foreign", [], other.invocation())).rejects.toThrow("family")
    await expect(other.coordinator.read("all", [], other.invocation())).rejects.toThrow("broadcast-only")
  })

  test("captures later parent context edits and injects the frozen child system with no new tools", async () => {
    const h = fixture()
    const cleanup = await plugin.setup(h.ctx)
    const event = { sessionID: "root", agent: "build", system: [{ type: "text", text: "before" }], tools: { agent_send: {} } }
    await h.hooks.get("context")!(event)
    event.system.push({ type: "text", text: "later hook" })
    await h.hooks.get("model.request")!({ sessionID: "root", kind: "primary" })
    await h.spawn()
    const child = { sessionID: "child1", system: [{ type: "text", text: "different model defaults" }], tools: { agent_send: {}, unsafe_new_tool: {} } }
    await h.hooks.get("context")!(child)
    expect(child.system).toEqual(event.system)
    expect(Object.keys(child.tools)).toEqual(["agent_send"])
    if (cleanup) await cleanup()
  })

  test("fails closed on the older permission API before registering tools", async () => {
    const h = fixture()
    delete (h.ctx.permission as unknown as { assert?: unknown }).assert
    await expect(plugin.setup(h.ctx)).rejects.toThrow("2.0.29")
    expect(h.tools.has("agent_spawn")).toBe(false)
  })

  test("write aliases send messages, while edit/patch aliases cannot mutate output", async () => {
    const h = fixture()
    const cleanup = await plugin.setup(h.ctx)
    await h.spawn()
    await h.tools.get("write")!.execute({ path: "agent://child1", content: "WRITE_MESSAGE" }, h.invocation("root", "write"))
    expect(h.assertions.map((assertion) => assertion.action)).toContain("edit")
    expect(h.prompts[1].text).toContain("WRITE_MESSAGE")
    expect(() => h.hooks.get("tool.execute.before")!({ tool: "edit", input: { path: "agent://child1" } })).toThrow("not editable")
    expect(() => h.hooks.get("tool.execute.before")!({ tool: "patch", input: { patchText: "*** Delete File: agent://child1" } })).toThrow("cannot be patched")
    if (cleanup) await cleanup()
  })

  test("started transitions and deletion cleanup preserve lifecycle boundaries", async () => {
    const h = fixture()
    await h.spawn()
    await h.coordinator.started("child1")
    expect((await h.coordinator.worker("child1"))?.status).toBe("running")
    expect((await h.coordinator.worker("child1"))?.turn).toBe(1)
    await h.coordinator.send("root", "hello", "queue", h.invocation("child1", "send"))
    h.data.set(snapshotKey("child1"), snapshot)
    await h.coordinator.removed("child1")
    expect(await h.coordinator.worker("child1")).toBeUndefined()
    expect(h.data.has(snapshotKey("child1"))).toBe(false)
    expect([...h.data.keys()].some((key) => key.startsWith("delivery/child1/"))).toBe(false)
    expect(await h.coordinator.family("root")).toHaveLength(0)
  })
})

describe("URI/value safety and paging", () => {
  test("preserves opaque ID casing and slash-separated JSON paths", () => {
    expect(parseTarget("agent://ses_AbC/findings/0/path")).toEqual({ id: "ses_AbC", segments: ["findings", "0", "path"], uri: "agent://ses_AbC" })
    for (const value of ["agent://", "agent://../x", "agent://foo?x", "agent://foo/../x", "agent://foo%2fbar"]) expect(() => parseTarget(value)).toThrow()
  })

  test("extracts only JSON-owned fields without traversing prototypes", () => {
    expect(extract('{"x":[{"value":"yes"}]}', ["x", "0", "value"])).toBe("yes")
    expect(extract("{}", ["constructor", "name"])).toBe("null")
    expect(() => extract("markdown", ["field"])).toThrow("not valid JSON")
  })

  test("preserves read shape, offsets, and truncation", () => {
    const result = textPage("agent://child", "one\ntwo\nthree", 2, 1)
    expect(result.output).toMatchObject({ type: "text-page", offset: 2, content: "two", truncated: true, next: 3 })
    expect(result.content).toContain("2: two")
    expect(() => textPage("agent://child", "one", 5)).toThrow("exceeds")
  })
})
