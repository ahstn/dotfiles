import { Agent, Model, Plugin, Provider, Rpc } from "@opencode/plugin"
import type { ToolContext } from "@opencode/plugin/promise/tool"

const Probe = Rpc.define({ id: "agent_urls_smoke", events: {}, methods: { scenario: {
  input: { type: "object", properties: {}, additionalProperties: false },
  output: { type: "object", additionalProperties: true },
} } })

export default Plugin.define({
  id: "dotfiles.agent-urls-smoke-fixture",
  async setup(ctx) {
    const providerID = Provider.ID.make("agent-fixture")
    await ctx.provider.transform((editor) => editor.add({
      info: { ...Provider.Info.empty(providerID), activation: "enabled", package: "@opencode/ai/providers/openai-compatible", settings: { baseURL: process.env.AGENT_SMOKE_PROVIDER_URL!, apiKey: "isolated-test-only" } },
      models: ["parent", "worker"].map((id) => {
        const model = Model.Info.default(providerID, Model.ID.make(id))
        return { ...model, capabilities: { ...model.capabilities, tools: true }, limit: { ...model.limit, context: 128000, output: 4096 } }
      }),
    }))
    await ctx.agent.transform((editor) => editor.update("build", (agent) => { agent.system = "EXACT_SYSTEM_MARKER: preserve this system prompt verbatim for workers." }))
    await ctx.session.hook("title", (event) => { event.result = "Isolated agent smoke" })
    await ctx.rpc.register(Probe, {
      scenario: async (_input, request) => {
        const root = await ctx.session.create({ title: "Agent smoke root", agent: Agent.ID.make("build"), model: Model.Ref.parse("agent-fixture/parent"), location: { directory: ctx.location.directory }, permissions: [{ action: "*", resource: "*", effect: "allow" }] })
        const foreign = await ctx.session.create({ title: "Foreign smoke root", agent: Agent.ID.make("build"), location: { directory: ctx.location.directory }, permissions: [{ action: "*", resource: "*", effect: "allow" }] })
        let sequence = 0
        let stage = "initialize parent"
        let deniedRootID: string | undefined
        const execute = async (name: string, input: unknown, source = root.id) => {
          const tool = (await ctx.tool.list()).find((item) => item.id === name)
          if (!tool) throw new Error(`Tool absent: ${name}`)
          sequence++
          const invocation = { sessionID: source as ToolContext["sessionID"], agent: Agent.ID.make("build"), messageID: `msg_smoke_${sequence}` as ToolContext["messageID"], id: `call_smoke_${sequence}` as ToolContext["id"], signal: request.signal, progress: async () => {} }
          return tool.execute(input, invocation)
        }
        try {
          await ctx.session.prompt({ sessionID: root.id, text: "ROOT_CAPTURE: initialize the parent system snapshot." })
          await ctx.session.wait({ sessionID: root.id })
          stage = "spawn worker"
          const spawned = (await execute("agent_spawn", { model: "agent-fixture/worker", prompt: "WORKER_TASK: communicate with your parent, then publish JSON findings.", description: "Bidirectional worker" })).output as { uri: string }
          const childID = spawned.uri.slice(8)
          stage = "wait for worker"
          await ctx.session.wait({ sessionID: childID })
          stage = "read published JSON"
          const field = await execute("read", { path: `${spawned.uri}/findings/0/path` })
          const status = await execute("agent_status", { target: spawned.uri })
          stage = "deliver follow-up"
          await execute("agent_send", { target: spawned.uri, message: "PARENT_TO_CHILD: publish a follow-up reply.", delivery: "queue" })
          await ctx.session.wait({ sessionID: childID })
          stage = "read follow-up"
          const reply = await execute("read", { path: `${spawned.uri}/reply` })
          const parentMessages = await ctx.session.context({ sessionID: root.id })
          let foreignBlocked = false
          try { await execute("read", { path: spawned.uri }, foreign.id) } catch { foreignBlocked = true }
          const denied = await ctx.session.create({ agent: Agent.ID.make("build"), model: Model.Ref.parse("agent-fixture/parent"), location: { directory: ctx.location.directory }, permissions: [{ action: "*", resource: "*", effect: "allow" }, { action: "agent_send", resource: "*", effect: "deny" }] })
          deniedRootID = denied.id
          await ctx.session.prompt({ sessionID: denied.id, text: "ROOT_CAPTURE: initialize deny-rule verification." })
          await ctx.session.wait({ sessionID: denied.id })
          const deniedWorker = (await execute("agent_spawn", { model: "agent-fixture/worker", prompt: "Do not send messages; publish JSON only.", description: "Permission worker" }, denied.id)).output as { uri: string }
          await ctx.session.wait({ sessionID: deniedWorker.uri.slice(8) })
          let permissionBlocked = false
          try { await execute("agent_send", { target: `agent://${denied.id}`, message: "MUST_NOT_BE_ADMITTED" }, deniedWorker.uri.slice(8)) } catch (error) { permissionBlocked = error instanceof Error && /permission|denied/i.test(error.message) }
          const skill = await execute("read", { path: "skill://agent-smoke-skill" })
          return { rootID: root.id, childID, field: field.content, status: status.output, reply: reply.content, parentMessages, foreignBlocked, permissionBlocked, skill: skill.content }
        } catch (error) {
          return { stage, error: error instanceof Error ? error.message : String(error) }
        } finally {
          await ctx.session.interrupt({ sessionID: root.id, resume: false })
          await ctx.session.remove({ sessionID: root.id })
          await ctx.session.remove({ sessionID: foreign.id })
          if (deniedRootID) await ctx.session.remove({ sessionID: deniedRootID })
        }
      },
    })
  },
})
