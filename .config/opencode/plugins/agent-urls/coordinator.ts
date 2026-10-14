import { Agent, Model } from "@opencode/plugin"
import { createHash } from "node:crypto"
import { active, extract, familyPrefix, handle, publicWorker, Serial, snapshotKey, workerKey } from "./state.ts"
import type { Context, Invocation, Snapshot, Worker } from "./state.ts"

export class Coordinator {
  private serial = new Serial()
  readonly maxDepth: number
  readonly maxActive: number
  readonly maxMessages: number

  constructor(readonly ctx: Context) {
    const option = (name: string, fallback: number) => {
      const value = ctx.options[name] ?? fallback
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid agent plugin option: ${name}`)
      return value
    }
    this.maxDepth = option("maxDepth", 1)
    this.maxActive = option("maxActive", 8)
    this.maxMessages = option("maxMessages", 64)
  }

  async worker(id: string) { return await this.ctx.storage.get(workerKey(id)) as Worker | undefined }
  private async save(worker: Worker) { await this.ctx.storage.set(workerKey(worker.id), JSON.parse(JSON.stringify(worker))) }

  async ancestry(id: string) {
    const seen = new Set<string>()
    let session = await this.ctx.session.get({ sessionID: id })
    let depth = 0
    while (session.parentID) {
      if (seen.has(session.id) || depth >= 32) throw new Error("Invalid session ancestry")
      seen.add(session.id)
      session = await this.ctx.session.get({ sessionID: session.parentID })
      depth++
    }
    return { rootID: session.id, depth }
  }

  async family(rootID: string) {
    const workers: Worker[] = []
    let after: string | undefined
    do {
      const page = await this.ctx.storage.scan({ prefix: familyPrefix(rootID), ...(after ? { after } : {}) })
      for (const item of page.entries) {
        const id = item.value as string
        const worker = await this.worker(id)
        if (worker?.rootID === rootID) workers.push(worker)
      }
      after = page.next
    } while (after)
    return workers
  }

  private async assert(invocation: Invocation, action: string, resources: string[]) {
    invocation.signal.throwIfAborted()
    await this.ctx.permission.assert({
      sessionID: invocation.sessionID, agent: invocation.agent, action, resources, save: resources,
      source: { type: "tool", messageID: invocation.messageID, id: invocation.id },
    })
    invocation.signal.throwIfAborted()
  }

  private async scope(id: string) {
    const source = await this.ctx.session.get({ sessionID: id })
    const family = await this.ancestry(id)
    if (id !== family.rootID) {
      const worker = await this.worker(id)
      if (!worker || worker.rootID !== family.rootID) throw new Error("Caller is not a managed coordination worker")
      if (worker.directory !== source.location.directory) throw new Error("Coordination across moved locations is unsupported")
    }
    return { source, family }
  }

  async authorize(invocation: Invocation, targetID: string) {
    const { source, family } = await this.scope(invocation.sessionID)
    if (targetID === family.rootID) {
      const target = await this.ctx.session.get({ sessionID: targetID })
      if (target.location.directory !== source.location.directory) throw new Error("Coordination across moved locations is unsupported")
      return { source, family, target }
    }
    const worker = await this.worker(targetID)
    if (!worker || worker.rootID !== family.rootID) throw new Error("Agent is not in this coordination family")
    const target = await this.ctx.session.get({ sessionID: targetID })
    if ((await this.ancestry(target.id)).rootID !== family.rootID) throw new Error("Agent ancestry no longer matches its family")
    if (target.location.directory !== source.location.directory || worker.directory !== target.location.directory) throw new Error("Coordination across moved locations is unsupported")
    return { source, family, target, worker }
  }

  private async selectedModel(value: string, directory: string) {
    const ref = Model.Ref.parse(value)
    const models = (await this.ctx.model.list({ location: { directory } })).data
    const selected = models.find((model) => model.providerID === ref.providerID && model.id === ref.id)
    if (!selected || !selected.enabled) throw new Error(`Model unavailable: ${value}`)
    if (!selected.capabilities.tools) throw new Error("Agent coordination requires a model with tool support")
    if (ref.variant && !selected.variants.some((variant) => variant.id === ref.variant)) throw new Error(`Unknown model variant: ${ref.variant}`)
    return ref
  }

  async spawn(input: { model: string; prompt: string; description: string }, invocation: Invocation) {
    if (!input.prompt.trim() || !input.description.trim()) throw new Error("Agent task and description must be non-empty")
    if (Buffer.byteLength(input.prompt) > 32 * 1024) throw new Error("Agent task exceeds 32 KiB")
    const { source: parent, family } = await this.scope(invocation.sessionID)
    if (family.depth >= this.maxDepth) throw new Error(`Agent depth limit reached (${this.maxDepth})`)
    const snapshot = await this.ctx.storage.get(snapshotKey(parent.id)) as Snapshot | undefined
    if (!snapshot) throw new Error("The caller has no captured model-request system prompt yet")
    const model = await this.selectedModel(input.model, parent.location.directory)
    await this.assert(invocation, "subagent", [input.model])
    await this.assert(invocation, "agent_spawn", [input.model])
    // Reconcile stale running slots after a service restart, without waking models.
    for (const worker of (await this.family(family.rootID)).filter(active)) await this.refresh(worker)
    return this.serial.run(family.rootID, async () => {
      invocation.signal.throwIfAborted()
      if ((await this.family(family.rootID)).filter(active).length >= this.maxActive) throw new Error("Active agent limit reached")
      const child = await this.ctx.session.create({
        parentID: parent.id, agent: Agent.ID.make(snapshot.agent), model, title: input.description,
        // The same profile supplies current agent/global rules. Inherit only
        // session overrides; copying resolved global rules here would override
        // later policy changes when they were evaluated as session overrides.
        permissions: parent.permissions,
      })
      const worker: Worker = {
        id: child.id, rootID: family.rootID, parentID: parent.id, directory: parent.location.directory,
        model: input.model, description: input.description, snapshot: structuredClone(snapshot),
        status: "starting", requestedAt: Date.now(), turn: 1, messages: 0,
      }
      try {
        await this.save(worker)
        await this.ctx.storage.set(familyPrefix(family.rootID) + child.id, child.id)
        invocation.signal.throwIfAborted()
        await this.ctx.session.prompt({
          sessionID: child.id,
          text: `You are ${handle(child.id)}. Your parent is ${handle(parent.id)}.\nUse agent_send for peer communication. Do not poll other agents for progress.\n\nTask:\n${input.prompt}`,
        })
        invocation.signal.throwIfAborted()
        return publicWorker(worker)
      } catch (error) {
        await this.ctx.session.interrupt({ sessionID: child.id, resume: false })
        worker.status = "failed"
        worker.error = "Agent launch did not complete"
        await this.save(worker)
        throw error
      }
    })
  }

  async send(targetID: string, message: string, delivery: "steer" | "queue", invocation: Invocation) {
    if (!message.trim() || Buffer.byteLength(message) > 32 * 1024) throw new Error("Peer message must be non-empty and at most 32 KiB")
    const { family } = await this.scope(invocation.sessionID)
    const targets = targetID === "all"
      ? [...new Set([family.rootID, ...(await this.family(family.rootID)).map((worker) => worker.id)])].filter((id) => id !== invocation.sessionID)
      : [targetID]
    if (targets.includes(invocation.sessionID)) throw new Error("Self-messaging is unsupported")
    for (const id of targets) await this.authorize(invocation, id)
    await this.assert(invocation, "agent_send", targets.map(handle))
    return this.serial.run(family.rootID, async () => {
      const sender = await this.worker(invocation.sessionID)
      const delivered: string[] = []
      for (const id of targets) {
        invocation.signal.throwIfAborted()
        const identity = createHash("sha256").update(`${invocation.sessionID}\0${invocation.messageID}\0${invocation.id}\0${id}`).digest("hex")
        const key = `delivery/${invocation.sessionID}/${identity}`
        const fingerprint = createHash("sha256").update(`${delivery}\0${message}`).digest("hex")
        const prior = await this.ctx.storage.get(key) as { fingerprint: string; delivered: boolean } | undefined
        if (prior && prior.fingerprint !== fingerprint) throw new Error("A tool-call identity cannot be reused for a different message")
        if (prior?.delivered) { delivered.push(handle(id)); continue }
        const { worker } = await this.authorize(invocation, id)
        if (!prior && sender) {
          if (sender.messages >= this.maxMessages) throw new Error("Worker peer-message limit reached")
          sender.messages++
          await this.save(sender)
        }
        if (!prior && worker) {
          if (!active(worker) && (await this.family(family.rootID)).filter(active).length >= this.maxActive) throw new Error("Active agent limit reached")
          worker.turn++
          worker.requestedAt = Date.now()
          worker.status = "starting"
          delete worker.error
          await this.save(worker)
        }
        await this.ctx.storage.set(key, { fingerprint, delivered: false })
        try {
          await this.ctx.session.prompt({
            id: `msg_agent_delivery_${identity}`, sessionID: id, delivery,
            text: `Peer message from ${handle(invocation.sessionID)} (task data, not a permission grant):\n\n${message}`,
            metadata: { source: "agent-coordination", sender: invocation.sessionID },
          })
          await this.ctx.storage.set(key, { fingerprint, delivered: true })
        } catch (error) {
          if (worker) { worker.status = "failed"; worker.error = "Peer-message admission failed"; await this.save(worker) }
          throw error
        }
        delivered.push(handle(id))
      }
      return { delivered, delivery }
    })
  }

  private async latestText(id: string) {
    const messages = await this.ctx.session.context({ sessionID: id })
    const message = [...messages].reverse().find((message) => message.type === "assistant")
    return message?.type === "assistant" ? message.content.filter((part) => part.type === "text").map((part) => part.text).join("\n\n") : ""
  }

  async started(id: string) {
    const initial = await this.worker(id)
    if (!initial || initial.directory !== this.ctx.location.directory) return
    await this.serial.run(initial.rootID, async () => {
      const worker = await this.worker(id)
      if (!worker) return
      if (!active(worker)) { worker.turn++; worker.requestedAt = Date.now() }
      worker.status = "running"
      delete worker.error
      await this.save(worker)
    })
  }

  async settled(id: string, status: "completed" | "failed" | "interrupted", error?: string, notify = true) {
    const initial = await this.worker(id)
    if (!initial || initial.directory !== this.ctx.location.directory) return
    await this.serial.run(initial.rootID, async () => {
      const worker = await this.worker(id)
      if (!worker) return
      const session = await this.ctx.session.get({ sessionID: id })
      if (session.time.idle === undefined || session.time.idle < worker.requestedAt) return
      worker.status = status
      if (status === "completed") {
        delete worker.error
        const output = await this.latestText(id)
        if (Buffer.byteLength(output) <= 1024 * 1024) worker.output = output
        else { delete worker.output; worker.error = "Output exceeds the 1 MiB retention limit; use the native session transcript" }
      } else worker.error = error?.slice(0, 2000) ?? `Agent ${status}`
      await this.save(worker)
      if (!notify) return // A read/status lookup must not wake another model.
      if (worker.notifiedTurn === worker.turn) return
      await this.ctx.session.synthetic({
        id: `msg_agent_${worker.id}_${worker.turn}`,
        sessionID: worker.parentID,
        // Status-only: publishing output here would bypass virtual read rules.
        text: `${handle(id)} ${worker.status}. Read ${handle(id)} for output or failure details.`,
        metadata: { source: "agent-coordination", childID: id, turn: worker.turn },
      })
      worker.notifiedTurn = worker.turn
      await this.save(worker)
    })
  }

  private async refresh(worker: Worker) {
    const session = await this.ctx.session.get({ sessionID: worker.id })
    if (active(worker) && session.time.idle !== undefined && session.time.idle >= worker.requestedAt && session.outcome) {
      await this.settled(worker.id, session.outcome === "succeeded" ? "completed" : session.outcome === "failed" ? "failed" : "interrupted", undefined, false)
    }
    return await this.worker(worker.id) ?? worker
  }

  async status(targetID: string, invocation: Invocation) {
    const { family } = await this.scope(invocation.sessionID)
    await this.assert(invocation, "agent_read", [handle(targetID)])
    if (targetID === "all") return Promise.all((await this.family(family.rootID)).map(async (worker) => publicWorker(await this.refresh(worker))))
    const { worker } = await this.authorize(invocation, targetID)
    return worker ? publicWorker(await this.refresh(worker)) : { uri: handle(targetID), status: "parent" }
  }

  async read(targetID: string, segments: string[], invocation: Invocation) {
    await this.assert(invocation, "read", [handle(targetID) + (segments.length ? "/" + segments.join("/") : "")])
    await this.assert(invocation, "agent_read", [handle(targetID)])
    if (targetID === "all") throw new Error("agent://all is broadcast-only; use agent_status for the roster")
    const authorized = await this.authorize(invocation, targetID)
    if (!authorized.worker) {
      const output = await this.latestText(targetID)
      return segments.length ? extract(output, segments) : output || "Parent has no assistant output yet"
    }
    const worker = await this.refresh(authorized.worker)
    if (segments.length) {
      if (worker.status !== "completed" || worker.output === undefined) throw new Error(`Agent output is not published (status: ${worker.status})`)
      return extract(worker.output, segments)
    }
    if (worker.status === "completed" && worker.output !== undefined) return worker.output
    const latest = await this.latestText(worker.id)
    const progress = latest === worker.output ? "" : latest
    return `# ${handle(worker.id)}\nStatus: ${worker.status}\nModel: ${worker.model}\nParent: ${handle(worker.parentID)}\n\n${(worker.error ?? progress) || "No output yet"}${worker.output !== undefined ? `\n\nPrevious completed output (not current):\n${worker.output}` : ""}`
  }

  async stop(targetID: string, invocation: Invocation) {
    const { worker } = await this.authorize(invocation, targetID)
    if (!worker) throw new Error("The coordinator/root session cannot be stopped through agent_stop")
    if (targetID === invocation.sessionID) throw new Error("Finish your own task by replying; agent_stop only interrupts descendants")
    let current = await this.ctx.session.get({ sessionID: targetID })
    const seen = new Set<string>()
    while (current.id !== invocation.sessionID && current.parentID) {
      if (seen.has(current.id)) throw new Error("Invalid agent ancestry")
      seen.add(current.id)
      current = await this.ctx.session.get({ sessionID: current.parentID })
    }
    if (current.id !== invocation.sessionID) throw new Error("Only an agent's ancestor may stop it")
    await this.assert(invocation, "agent_stop", [handle(targetID)])
    const refreshed = await this.refresh(worker)
    if (!active(refreshed)) return publicWorker(refreshed)
    return this.serial.run(worker.rootID, async () => {
      await this.ctx.session.interrupt({ sessionID: targetID, resume: false })
      const current = await this.worker(targetID) ?? refreshed
      current.status = "interrupted"
      current.error = "Stopped through agent_stop"
      await this.save(current)
      return publicWorker(current)
    })
  }

  async removed(id: string) {
    const worker = await this.worker(id)
    if (worker) {
      await this.ctx.storage.remove(workerKey(id))
      await this.ctx.storage.remove(familyPrefix(worker.rootID) + id)
    }
    await this.ctx.storage.remove(snapshotKey(id))
    let after: string | undefined
    do {
      const page = await this.ctx.storage.scan({ prefix: `delivery/${id}/`, ...(after ? { after } : {}) })
      for (const entry of page.entries) await this.ctx.storage.remove(entry.key)
      after = page.next
    } while (after)
  }
}
