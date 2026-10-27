import { homedir } from "node:os"
import path from "node:path"
import { Integration, Model, Plugin, Provider } from "@opencode/plugin/effect"
import type { ProviderRecord } from "@opencode/plugin/effect/provider"
import { Effect, Schedule, Schema } from "effect"

// Keep this projection aligned with OMP's mapLiteLLMRichEntry. Oceans implements
// this metadata contract so both harnesses can consume the same discovery API.
type Entry = Record<string, unknown>
export type Discovered = { readonly id: string; readonly entry: Entry }

// Copy this file into ~/.config/opencode/plugins/ and list gateways in
// ~/.config/opencode/gateways.yml. OpenCode provides `effect` and `@opencode/plugin`
// at runtime. Keys come from the environment or a saved OpenCode credential,
// never from the config file or provider settings.
const API = Schema.Literals(["openai-completions", "openai-responses", "anthropic-messages"])
type API = typeof API.Type

// The OMP models.yml subset that applies to discovery gateways. Unknown OMP keys are ignored.
const Override = Schema.Struct({
  api: Schema.optionalKey(API),
  /** Authoritative input modalities, e.g. `[text, image]` when discovery omits `supports_vision`. */
  input: Schema.optionalKey(Schema.Array(Schema.Literals(["text", "image"]))),
  thinking: Schema.optionalKey(Schema.Struct({
    /** `anthropic-adaptive` enables adaptive thinking by default. */
    mode: Schema.optionalKey(Schema.String),
    efforts: Schema.optionalKey(Schema.Array(Schema.String)),
    defaultLevel: Schema.optionalKey(Schema.String),
  })),
})
type Override = typeof Override.Type

const GatewayConfig = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  baseUrl: Schema.String,
  /** Environment variable name(s) holding the key, in precedence order; never a key value. */
  apiKey: Schema.optionalKey(Schema.Union([Schema.String, Schema.Array(Schema.String)])),
  /** Fallback API when discovery metadata gives no routing evidence. */
  api: Schema.optionalKey(API),
  modelOverrides: Schema.optionalKey(Schema.Record(Schema.String, Override)),
})

export type Gateway = {
  readonly id: string
  readonly name: string
  /** Gateway root without `/v1`: metadata lives here, inference under `/v1`. */
  readonly root: string
  readonly env: readonly string[]
  readonly api: API
  readonly modelOverrides: Readonly<Record<string, Override>>
}

/** The machine-local file replaces the tracked one entirely, so work and personal setups never merge. */
const configFiles = ["gateways.local.yml", "gateways.yml"]
const configDirectory = () => path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), ".config"), "opencode")

const packages = {
  "openai-completions": "@opencode/ai/providers/openai-compatible",
  "openai-responses": "@opencode/ai/providers/openai-compatible/responses",
  "anthropic-messages": "@opencode/ai/providers/anthropic-compatible",
} as const satisfies Record<API, string>
// First-party catalogs carry the vendor's own limits and prices; resellers can cap them.
const vendors = ["anthropic", "openai", "google", "xai", "deepseek", "mistral", "moonshotai", "zai", "alibaba", "minimax"]
const richPaths = ["/model_group/info", "/v2/model/info", "/model/info", "/v1/model/info"]
const effortNames: Record<string, true> = { minimal: true, low: true, medium: true, high: true, xhigh: true, max: true }
const refreshInterval = "60 seconds"
const requestTimeout = "10 seconds"

const record = (value: unknown): Entry => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Entry : {}
const text = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined
const positive = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined
const tokens = (value: unknown) => Number.isInteger(value) ? positive(value) : undefined
const strings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined
const metadata = (entry: Entry, key: string) => entry[key] ?? record(entry.model_info)[key]
const identity = (entry: Entry) => text(entry.model_group) ?? text(entry.model_name) ?? text(entry.id) ?? text(record(entry.litellm_params).model)
// Catalogs spell versions with dashes (claude-opus-5-5); gateways often use dots.
const catalogKey = (id: string) => id.replaceAll(".", "-")
const gatewayRoot = (url: string) => url.trim().replace(/\/+$/, "").replace(/\/v1$/, "")
const usdPerMillion = (perToken: unknown) => Model.Cost.fields.input.make((positive(perToken) ?? 0) * 1_000_000)

/** Returns undefined when the body has no recognisable model array. */
function entries(body: unknown): Entry[] | undefined {
  if (Array.isArray(body)) return body.map(record)
  const object = record(body)
  for (const key of ["data", "models", "result", "items"]) {
    const list = object[key]
    if (Array.isArray(list)) return list.map(record)
  }
  return undefined
}

// Positive provider evidence wins over a GPT-like public alias, including mixed routes.
// The gateway's configured `api` applies only when there is no evidence at all.
export function apiFor(entry: Entry, id: string, fallback: API = "openai-completions"): API {
  const routes = strings(entry.providers)?.map((route) => route.trim().toLowerCase()).filter(Boolean)
  if (routes?.length) return routes.every((route) => route === "openai") ? "openai-responses" : "openai-completions"
  const params = record(entry.litellm_params)
  const provider = text(params.custom_llm_provider)?.toLowerCase()
  if (provider) return provider === "openai" ? "openai-responses" : "openai-completions"
  for (const model of [text(params.model), text(metadata(entry, "base_model"))]) {
    if (model?.includes("/")) return model.split("/")[0].toLowerCase() === "openai" ? "openai-responses" : "openai-completions"
  }
  return /^(?:openai\/)?(?:gpt-|chatgpt-|o\d(?:-|$)|codex-)/i.test(id) ? "openai-responses" : fallback
}

function costs(entry: Entry, reference?: Model.Info): Model.Info["cost"] {
  const input = metadata(entry, "input_cost_per_token")
  const output = metadata(entry, "output_cost_per_token")
  if (positive(input) === undefined && positive(output) === undefined) return reference?.cost ?? []
  return [{
    input: usdPerMillion(input),
    output: usdPerMillion(output),
    cache: {
      read: usdPerMillion(metadata(entry, "cache_read_input_token_cost")),
      write: usdPerMillion(metadata(entry, "cache_creation_input_token_cost")),
    },
  }]
}

function supportsTools(entry: Entry, reference?: Model.Info): boolean {
  const declared = metadata(entry, "supports_function_calling")
  if (typeof declared === "boolean") return declared
  const params = strings(metadata(entry, "supported_openai_params"))
  if (params) return params.some((param) => ["tools", "tool_choice", "functions", "function_call"].includes(param))
  return reference?.capabilities.tools ?? true
}

function capabilities(entry: Entry, reference?: Model.Info, override?: Override): Model.Info["capabilities"] {
  const vision = metadata(entry, "supports_vision")
  return {
    tools: supportsTools(entry, reference),
    input: override?.input
      ?? (typeof vision === "boolean" ? (vision ? ["text", "image"] : ["text"]) : reference?.capabilities.input ?? ["text"]),
    output: reference?.capabilities.output ?? ["text"],
  }
}

// An explicit override is authoritative. Otherwise inherit catalog efforts unless
// the gateway explicitly denies reasoning or the reasoning_effort parameter.
function effortsFor(entry: Entry, reference?: Model.Info, override?: Override): readonly string[] {
  if (override?.thinking?.efforts) return override.thinking.efforts
  const reasoning = metadata(entry, "supports_reasoning")
  if (reasoning !== undefined && reasoning !== true) return []
  const params = strings(metadata(entry, "supported_openai_params"))
  if (params && !params.includes("reasoning_effort")) return []
  return reference?.variants.map((variant) => variant.id).filter((id) => effortNames[id] === true) ?? []
}

function effortSettings(api: API, effort: string): Model.Settings {
  if (api === "anthropic-messages") return { thinking: { type: "adaptive" }, effort }
  if (api === "openai-responses") return { reasoningEffort: effort, reasoningSummary: "auto" }
  return { reasoningEffort: effort }
}

// OMP's `defaultLevel` becomes the model's default effort; `anthropic-adaptive` alone enables adaptive thinking.
function defaultSettings(api: API, thinking: Override["thinking"]): Model.Settings | undefined {
  if (thinking?.defaultLevel) return effortSettings(api, thinking.defaultLevel)
  if (thinking?.mode === "anthropic-adaptive") return { thinking: { type: "adaptive" } }
  return undefined
}

export function toModel(
  providerID: Provider.ID, id: string, entry: Entry, reference?: Model.Info, override?: Override, fallback?: API,
): Model.Info {
  const api = override?.api ?? apiFor(entry, id, fallback)
  const context = tokens(metadata(entry, "max_input_tokens")) ?? reference?.limit.context ?? 128_000
  return {
    ...Model.Info.default(providerID, Model.ID.make(id)),
    name: reference?.name ?? id,
    family: reference?.family,
    package: packages[api],
    capabilities: capabilities(entry, reference, override),
    limit: { context, input: context, output: tokens(metadata(entry, "max_output_tokens")) ?? reference?.limit.output ?? Math.min(context, 32_768) },
    cost: costs(entry, reference),
    settings: defaultSettings(api, override?.thinking),
    variants: effortsFor(entry, reference, override).map((effort) => ({ id: Model.VariantID.make(effort), settings: effortSettings(api, effort) })),
  }
}

/** Catalog fallbacks keyed by dash-normalised model ID. Gateways never feed each other, and vendor catalogs win. */
export function catalogReferences(records: readonly ProviderRecord[], gatewayIDs: ReadonlySet<string>): ReadonlyMap<string, Model.Info> {
  const rank = (providerID: string) => {
    const index = vendors.indexOf(providerID)
    return index < 0 ? vendors.length : index
  }
  const sources = records
    .filter((source) => !gatewayIDs.has(source.provider.id))
    .toSorted((a, b) => rank(a.provider.id) - rank(b.provider.id))
  const references = new Map<string, Model.Info>()
  for (const source of sources) {
    for (const model of source.models.values()) {
      const key = catalogKey(model.id)
      if (!references.has(key)) references.set(key, model)
    }
  }
  return references
}

function complete(entry: Entry) {
  return typeof metadata(entry, "supports_vision") === "boolean" && [
    "input_cost_per_token", "output_cost_per_token", "cache_read_input_token_cost", "cache_creation_input_token_cost",
  ].every((key) => positive(metadata(entry, key)) !== undefined)
}

/** Discovery failed in a way the next refresh may not repeat; callers keep their last inventory. */
export class DiscoveryError extends Schema.TaggedError<DiscoveryError>()("LiteLLM.DiscoveryError", {
  url: Schema.String,
  reason: Schema.String,
}) {}

// Undefined means the gateway does not offer this endpoint. Authentication,
// throttling, server, transport, timeout, and JSON failures are DiscoveryErrors.
const fetchEntries = (url: string, key: string | undefined) =>
  Effect.gen(function* () {
    const headers: Record<string, string> = { accept: "application/json" }
    if (key) headers.authorization = `Bearer ${key}`
    const response = yield* Effect.tryPromise((signal) => fetch(url, { headers, signal }))
    const status = response.status
    if (status === 401 || status === 403 || status === 408 || status === 429 || status >= 500) {
      return yield* new DiscoveryError({ url, reason: `HTTP ${status}` })
    }
    if (status >= 400) return undefined
    return entries(yield* Effect.tryPromise(() => response.json()))
  }).pipe(
    Effect.timeout(requestTimeout),
    Effect.catchIf(
      (error) => !(error instanceof DiscoveryError),
      (error) => Effect.fail(new DiscoveryError({ url, reason: String(error) })),
    ),
  )

// First endpoint wins; later endpoints fill missing metadata, not overwrite it.
export const discover = Effect.fn("LiteLLM.discover")(function* (root: string, key: string | undefined) {
  const found = new Map<string, Entry>()
  for (const path of richPaths) {
    for (const entry of (yield* fetchEntries(`${root}${path}`, key)) ?? []) {
      const id = identity(entry)
      if (!id) continue
      const previous = found.get(id)
      found.set(id, { ...record(entry.model_info), ...entry, ...record(previous?.model_info), ...previous })
    }
    if (found.size && [...found.values()].every(complete)) break
  }
  if (!found.size) {
    for (const entry of (yield* fetchEntries(`${root}/v1/models`, key)) ?? []) {
      const id = identity(entry)
      if (id && !found.has(id)) found.set(id, entry)
    }
  }
  if (!found.size) return yield* new DiscoveryError({ url: root, reason: "no models discovered" })
  return [...found].map(([id, entry]): Discovered => ({ id, entry })).toSorted((a, b) => a.id.localeCompare(b.id))
})

const apiKey = Effect.fn("LiteLLM.apiKey")(function* (ctx: Plugin.Context, integrationID: string) {
  const connection = yield* ctx.integration.connection.active(integrationID)
  if (!connection) return undefined
  const credential = yield* ctx.integration.connection.resolve(connection).pipe(Effect.orElseSucceed(() => undefined))
  return credential?.type === "key" ? credential.key : undefined
})

/** The gateway config file exists but cannot be read or is not YAML. */
export class ConfigFileError extends Schema.TaggedError<ConfigFileError>()("LiteLLM.ConfigFileError", {
  file: Schema.String,
  reason: Schema.String,
}) {}

const decodeGateway = Schema.decodeUnknownEffect(GatewayConfig)

/** Reads an OMP-style `providers:` map. Only `discovery: { type: litellm }` entries are gateways; an invalid one is skipped. */
export const parseGateways = Effect.fn("LiteLLM.parseGateways")(function* (file: string, source: string) {
  const document = yield* Effect.try({
    try: () => Bun.YAML.parse(source),
    catch: (cause) => new ConfigFileError({ file, reason: String(cause) }),
  })
  const gateways: Gateway[] = []
  for (const [id, value] of Object.entries(record(record(document).providers))) {
    if (record(record(value).discovery).type !== "litellm") continue
    const config = yield* decodeGateway(value).pipe(
      Effect.tapError((error) =>
        Effect.logWarning("Skipping invalid LiteLLM gateway").pipe(Effect.annotateLogs({ file, provider: id, reason: String(error) }))),
      Effect.orElseSucceed(() => undefined),
    )
    const root = config && gatewayRoot(config.baseUrl)
    if (!config || !root) continue
    gateways.push({
      id,
      name: config.name ?? id,
      root,
      env: typeof config.apiKey === "string" ? [config.apiKey] : config.apiKey ?? [],
      api: config.api ?? "openai-completions",
      modelOverrides: config.modelOverrides ?? {},
    })
  }
  return gateways
})

export const loadGateways = Effect.fn("LiteLLM.loadGateways")(function* (directory: string) {
  for (const name of configFiles) {
    const file = path.join(directory, name)
    if (!(yield* Effect.promise(() => Bun.file(file).exists()))) continue
    const source = yield* Effect.tryPromise({
      try: () => Bun.file(file).text(),
      catch: (cause) => new ConfigFileError({ file, reason: String(cause) }),
    })
    return yield* parseGateways(file, source)
  }
  return []
})

const register = Effect.fn("LiteLLM.register")(function* (ctx: Plugin.Context, gateway: Gateway, gatewayIDs: ReadonlySet<string>) {
  const root = gateway.root
  const providerID = Provider.ID.make(gateway.id)
  const state = { models: [] as readonly Discovered[] }

  // The model resolver reads the same connection and passes it to the package as apiKey.
  yield* ctx.integration.transform((editor) => {
    editor.update(gateway.id, (integration) => {
      integration.name = gateway.name
    })
    editor.method.update({ integrationID: gateway.id, method: { type: "key", label: `${gateway.name} API key` } })
    if (gateway.env.length) editor.method.update({ integrationID: gateway.id, method: { type: "env", names: gateway.env } })
  })

  // Returns whether the inventory changed. A failed refresh keeps the last inventory.
  const sync = Effect.gen(function* () {
    const models = yield* discover(root, yield* apiKey(ctx, gateway.id))
    if (JSON.stringify(models) === JSON.stringify(state.models)) return false
    state.models = models
    return true
  }).pipe(
    Effect.catchTag("LiteLLM.DiscoveryError", (error) =>
      Effect.logWarning("LiteLLM discovery failed").pipe(
        Effect.annotateLogs({ provider: gateway.id, url: error.url, reason: error.reason }),
        Effect.as(false),
      )),
  )

  yield* sync
  yield* ctx.provider.transform((editor) => {
    if (!state.models.length) return
    const references = catalogReferences(editor.list(), gatewayIDs)
    editor.add({
      info: Object.assign(Provider.Info.empty(providerID), {
        name: gateway.name,
        activation: "enabled" as const,
        package: packages[gateway.api],
        integrationID: Integration.ID.make(gateway.id),
        settings: { baseURL: `${root}/v1` },
      }),
      models: state.models.map(({ id, entry }) =>
        toModel(providerID, id, entry, references.get(catalogKey(id)), gateway.modelOverrides[id], gateway.api)),
    })
  })
  yield* sync.pipe(
    Effect.flatMap((changed) => changed ? ctx.provider.reload() : Effect.void),
    Effect.repeat(Schedule.spaced(refreshInterval)),
    Effect.delay(refreshInterval),
    Effect.forkScoped,
  )
})

export default Plugin.define({
  id: "dotfiles.provider.litellm",
  effect: (ctx) =>
    Effect.gen(function* () {
      const gateways = yield* loadGateways(configDirectory()).pipe(
        Effect.catchTag("LiteLLM.ConfigFileError", (error) =>
          Effect.logWarning("LiteLLM gateway config unreadable").pipe(
            Effect.annotateLogs({ file: error.file, reason: error.reason }),
            Effect.as([] as readonly Gateway[]),
          )),
      )
      const gatewayIDs = new Set(gateways.map((gateway) => gateway.id))
      yield* Effect.forEach(gateways, (gateway) => register(ctx, gateway, gatewayIDs), { concurrency: "unbounded", discard: true })
    }),
})
