// Explicitly loaded only by smoke.ts. Never auto-discovered by the global plugin directory.
import { Agent, Plugin, Rpc } from "@opencode/plugin"
import type { ToolContext } from "@opencode/plugin/promise/tool"

const Probe = Rpc.define({
  id: "dotfiles_skill_urls_smoke",
  events: {},
  methods: {
    run: {
      input: {
        type: "object",
        properties: {
          operation: { type: "string" }, path: { type: "string" }, pattern: { type: "string" },
          text: { type: "string" }, denyAction: { type: "string" }, denyResource: { type: "string" },
        },
        required: ["operation"], additionalProperties: false,
      },
      output: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: true },
    },
  },
})

export default Plugin.define({
  id: "dotfiles.skill-urls-smoke-fixture",
  async setup(ctx) {
    await ctx.rpc.register(Probe, {
      run: async (input, request) => {
        const args = input as { operation: string; path?: string; pattern?: string; text?: string; denyAction?: string; denyResource?: string }
        const session = await ctx.session.create({
          title: "Disposable skill URL verification", location: { directory: ctx.location.directory },
          agent: Agent.ID.make("build"),
          permissions: [
            { action: "*", resource: "*", effect: "allow" },
            ...(args.denyAction ? [{ action: args.denyAction, resource: args.denyResource ?? "*", effect: "deny" as const }] : []),
          ],
        })
        try {
          if (args.operation === "prompt") {
            const inbox = await ctx.session.prompt({ sessionID: session.id, text: args.text ?? "Use $probe-skill", resume: false })
            return { ok: true, inbox }
          }
          const tool = (await ctx.tool.list()).find((entry) => entry.id === args.operation)
          if (!tool) throw new Error(`Native tool missing: ${args.operation}`)
          const invocation = {
            sessionID: session.id as ToolContext["sessionID"], agent: Agent.ID.make("build"),
            messageID: "msg_smoke" as ToolContext["messageID"], id: "call_smoke" as ToolContext["id"],
            signal: request.signal, progress: async () => {},
          }
          const result = await tool.execute({ ...(args.path === undefined ? {} : { path: args.path }), ...(args.pattern === undefined ? {} : { pattern: args.pattern }) }, invocation)
          return { ok: true, result }
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) }
        } finally {
          await ctx.session.remove({ sessionID: session.id })
        }
      },
    })
  },
})
