import { Model, Plugin, Provider } from "@opencode/plugin"

// Mirrors omp's `discovery: type: proxy`: list the gateway's models and route each one
// to the Anthropic or OpenAI wire based on `supported_endpoint_types`.

const providerID = Provider.ID.make("oceans")
const defaultBaseURL = "https://hogwarts.tail58b1f6.ts.net"
const refreshInterval = 60_000

type RemoteModel = { id: string; supported_endpoint_types?: string[] }

// Both the OpenAI and Anthropic runtimes append their route (`/chat/completions`,
// `/messages`) to a base URL that ends in `/v1`.
function baseURL() {
  const root = (process.env.OCEANS_LLM_BASE_URL || defaultBaseURL).replace(/\/+$/, "")
  return root.endsWith("/v1") ? root : `${root}/v1`
}

async function load(base: string, key: string) {
  const res = await fetch(`${base}/models`, {
    headers: key ? { Authorization: `Bearer ${key}` } : {},
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`oceans: GET ${base}/models returned ${res.status}`)
  const { data } = (await res.json()) as { data: RemoteModel[] }
  return data
    .filter((model) => model.id.length > 0)
    .toSorted((a, b) => a.id.localeCompare(b.id))
    .map((model) => ({
      ...Model.Info.default(providerID, Model.ID.make(model.id)),
      package: model.supported_endpoint_types?.includes("anthropic")
        ? "@opencode/ai/providers/anthropic-compatible"
        : "@opencode/ai/providers/openai-compatible",
    }))
}

export default Plugin.define({
  id: "dotfiles.provider.oceans",
  async setup(ctx) {
    const state = { base: baseURL(), key: process.env.OCEANS_LLM_API_KEY ?? "", models: [] as Model.Info[] }
    state.models = await load(state.base, state.key).catch((error) => {
      console.error(error)
      return []
    })

    await ctx.provider.transform((editor) => {
      if (state.models.length === 0) return
      editor.add({
        info: {
          ...Provider.Info.empty(providerID),
          name: "Oceans",
          activation: "enabled",
          package: "@opencode/ai/providers/openai-compatible",
          settings: { baseURL: state.base, apiKey: state.key },
        },
        models: state.models,
      })
    })

    // Keep the last successful inventory through transient gateway outages.
    const refresh = async () => {
      const models = await load(state.base, state.key)
      if (JSON.stringify(models) === JSON.stringify(state.models)) return
      state.models = models
      await ctx.provider.reload()
    }
    const timer = setInterval(() => void refresh().catch(console.error), refreshInterval)
    return () => clearInterval(timer)
  },
})
