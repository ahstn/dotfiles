import { Model, Plugin, Provider } from "@opencode/plugin"

// Lists a LiteLLM gateway's models and registers them as one OpenAI-compatible provider.
// `GET {root}/v1/models` is the inventory; `GET {root}/model/info` is optional enrichment
// (context window, max output, vision and tool support).

const providerID = Provider.ID.make("litellm")
const refreshInterval = 60_000

type ModelInfo = {
  context?: number
  output?: number
  vision?: boolean
  tools?: boolean
}

type Endpoints = { models: string; info: string; base: string }

// LiteLLM serves `/model/info` at the proxy root, not under `/v1`.
function endpoints(): Endpoints | undefined {
  const raw = process.env.LITELLM_BASE_URL?.trim()
  if (!raw) return undefined
  const root = raw.replace(/\/+$/, "").replace(/\/v1$/, "")
  return { models: `${root}/v1/models`, info: `${root}/model/info`, base: `${root}/v1` }
}

const positiveInt = (value: unknown) => (Number.isInteger(value) && (value as number) > 0 ? (value as number) : undefined)

// Deployments that share a `model_name` are load-balanced; the first one to define a field wins.
async function loadInfo(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`litellm: GET ${url} returned ${res.status}`)
  const body = (await res.json()) as { data?: { model_name?: string; model_info?: Record<string, unknown> }[] }
  const info = new Map<string, ModelInfo>()
  for (const entry of Array.isArray(body.data) ? body.data : []) {
    if (!entry.model_name) continue
    const raw = entry.model_info ?? {}
    const previous = info.get(entry.model_name) ?? {}
    info.set(entry.model_name, {
      context: previous.context ?? positiveInt(raw.max_input_tokens) ?? positiveInt(raw.max_tokens),
      output: previous.output ?? positiveInt(raw.max_output_tokens),
      vision: previous.vision ?? (typeof raw.supports_vision === "boolean" ? raw.supports_vision : undefined),
      tools: previous.tools ?? (typeof raw.supports_function_calling === "boolean" ? raw.supports_function_calling : undefined),
    })
  }
  return info
}

function toModel(id: string, info: ModelInfo | undefined): Model.Info {
  const model = Model.Info.default(providerID, Model.ID.make(id))
  return {
    ...model,
    package: "@opencode/ai/providers/openai-compatible",
    capabilities: {
      tools: info?.tools ?? model.capabilities.tools,
      input: info?.vision === undefined ? model.capabilities.input : info.vision ? ["text", "image"] : ["text"],
      output: model.capabilities.output,
    },
    limit: { context: info?.context ?? model.limit.context, output: info?.output ?? model.limit.output },
  }
}

// A missing or failing `/model/info` must not hide the models: fall back to the last good
// enrichment (empty on first load) and keep the plain list.
async function load(urls: Endpoints, headers: Record<string, string>, fallback: Map<string, ModelInfo>) {
  const res = await fetch(urls.models, { headers, signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`litellm: GET ${urls.models} returned ${res.status}`)
  const body = (await res.json()) as { data?: { id: string }[] }
  if (!Array.isArray(body.data)) throw new Error(`litellm: GET ${urls.models} returned no data array`)
  const info = await loadInfo(urls.info, headers).catch(() => fallback)
  const models = body.data
    .filter((model) => typeof model.id === "string" && model.id.length > 0)
    .toSorted((a, b) => a.id.localeCompare(b.id))
    .map((model) => toModel(model.id, info.get(model.id)))
  return { models, info }
}

export default Plugin.define({
  id: "dotfiles.provider.litellm",
  async setup(ctx) {
    const urls = endpoints()
    if (!urls) {
      console.error("litellm: LITELLM_BASE_URL is not set; provider not registered")
      return
    }
    const key = process.env.LITELLM_API_KEY ?? ""
    const headers: Record<string, string> = key ? { Authorization: `Bearer ${key}` } : {}
    const state = { models: [] as Model.Info[], info: new Map<string, ModelInfo>() }
    Object.assign(
      state,
      await load(urls, headers, state.info).catch((error) => {
        console.error(error)
        return {}
      }),
    )

    await ctx.provider.transform((editor) => {
      if (state.models.length === 0) return
      editor.add({
        info: {
          ...Provider.Info.empty(providerID),
          name: "LiteLLM",
          activation: "enabled",
          package: "@opencode/ai/providers/openai-compatible",
          // An empty key is a missing credential for the runtime, so leave the field out.
          settings: key ? { baseURL: urls.base, apiKey: key } : { baseURL: urls.base },
        },
        models: state.models,
      })
    })

    // Keep the last successful inventory through transient gateway outages.
    const refresh = async () => {
      const next = await load(urls, headers, state.info)
      state.info = next.info
      if (JSON.stringify(next.models) === JSON.stringify(state.models)) return
      state.models = next.models
      await ctx.provider.reload()
    }
    const timer = setInterval(() => void refresh().catch(console.error), refreshInterval)
    return () => clearInterval(timer)
  },
})
