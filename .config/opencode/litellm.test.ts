import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Model, Provider } from "@opencode/plugin/effect"
import type { ProviderRecord } from "@opencode/plugin/effect/provider"
import { Effect } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { apiFor, catalogReferences, discover, loadGateways, parseGateways, toModel } from "./plugins/litellm"

const providerID = Provider.ID.make("gateway")
const servers: Bun.Server<undefined>[] = []
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => server.stop(true))) })

/** Serves JSON bodies by path; a number serves that bare status. Returns the gateway root. */
function gateway(routes: Record<string, unknown>) {
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    fetch(request) {
      const body = routes[new URL(request.url).pathname]
      if (body === undefined) return new Response(null, { status: 404 })
      return typeof body === "number" ? new Response(null, { status: body }) : Response.json(body)
    },
  })
  servers.push(server)
  return server.url.toString().replace(/\/$/, "")
}

const discovered = (root: string) => Effect.runPromise(discover(root, undefined).pipe(Effect.provide(FetchHttpClient.layer)))

test("routing evidence overrides public model names; Messages is explicit", () => {
  expect(apiFor({ providers: ["openai", "bedrock"] }, "gpt-6.1-sol")).toBe("openai-completions")
  expect(apiFor({ litellm_params: { custom_llm_provider: "bedrock", model: "openai/gpt-6.1-sol" } }, "gpt-6.1-sol")).toBe("openai-completions")
  expect(apiFor({ providers: ["openai"] }, "private-alias")).toBe("openai-responses")
  expect(apiFor({ providers: ["anthropic"] }, "claude-opus-5.5")).toBe("openai-completions")
  const model = toModel(providerID, "claude-opus-5.5", { supports_reasoning: true, supported_openai_params: ["reasoning_effort"] }, undefined, {
    api: "anthropic-messages", thinking: { mode: "anthropic-adaptive", efforts: ["low", "medium", "high", "xhigh", "max"] },
  })
  expect(model.package).toBe("@opencode/ai/providers/anthropic-compatible")
  expect(model.settings).toEqual({ thinking: { type: "adaptive" } })
  expect(model.variants.find((variant) => variant.id === "low")?.settings).toEqual({ thinking: { type: "adaptive" }, effort: "low" })
})

test("top-level capabilities and per-token prices override catalog and nested metadata", () => {
  const reference = Model.Info.default(Provider.ID.make("anthropic"), Model.ID.make("claude-opus-5-5"))
  const model = toModel(providerID, "claude-opus-5.5", {
    supports_vision: false, supports_function_calling: false,
    max_input_tokens: 272000, max_output_tokens: 128000, input_cost_per_token: 4e-6, output_cost_per_token: 20e-6,
    cache_read_input_token_cost: 0.2e-6, cache_creation_input_token_cost: 5e-6,
    model_info: { supports_vision: true, supports_function_calling: true, max_input_tokens: 1000000, input_cost_per_token: 1e-6 },
  }, reference)
  expect(model.capabilities.tools).toBe(false)
  expect(model.capabilities.input).toEqual(["text"])
  expect(model.limit).toEqual({ context: 272000, input: 272000, output: 128000 })
  expect<unknown>(model.cost).toMatchObject([{ input: 4, output: 20, cache: { write: 5 } }])
  expect(model.cost[0].cache.read).toBeCloseTo(0.2)
})

test("an explicit lack of reasoning or effort support removes inherited variants", () => {
  const reference: Model.Info = {
    ...Model.Info.default(Provider.ID.make("openai"), Model.ID.make("gpt-6.1-sol")),
    variants: [{ id: Model.VariantID.make("high"), settings: { reasoningEffort: "high" } }],
  }
  expect(toModel(providerID, "gpt-6.1-sol", { supports_reasoning: false }, reference).variants).toEqual([])
  expect(toModel(providerID, "gpt-6.1-sol", { supports_reasoning: true, supported_openai_params: ["tools"] }, reference).variants).toEqual([])
  const model = toModel(providerID, "gpt-6.1-sol", { providers: ["openai"], supports_reasoning: true, supported_openai_params: ["reasoning_effort"] }, reference)
  expect<unknown>(model.variants).toEqual([{ id: "high", settings: { reasoningEffort: "high", reasoningSummary: "auto" } }])
})

test("override efforts win over sparse or negative gateway metadata", () => {
  const override = { api: "anthropic-messages", thinking: { efforts: ["low", "high"] } } as const
  expect<unknown>(toModel(providerID, "claude-opus-5.5", {}, undefined, override).variants.map((variant) => variant.id)).toEqual(["low", "high"])
  expect<unknown>(toModel(providerID, "claude-opus-5.5", { supports_reasoning: false }, undefined, override).variants.map((variant) => variant.id)).toEqual(["low", "high"])
})

test("catalog fallbacks prefer the vendor and never come from another gateway", () => {
  const catalog = (id: string, context: number): ProviderRecord => ({
    provider: Provider.Info.empty(Provider.ID.make(id)),
    models: new Map([["claude-opus-5-5", { ...Model.Info.default(Provider.ID.make(id), Model.ID.make("claude-opus-5-5")), limit: { context, output: 8_000 } }]]),
  })
  const reseller = catalog("github-copilot", 128_000)
  const gateways = new Set(["litellm", "oceans"])
  expect(catalogReferences([catalog("oceans", 400_000), reseller, catalog("anthropic", 1_000_000)], gateways).get("claude-opus-5-5")?.limit.context).toBe(1_000_000)
  expect<unknown>(catalogReferences([catalog("litellm", 400_000), reseller], gateways).get("claude-opus-5-5")?.providerID).toBe("github-copilot")
})

test("OMP thinking defaults and the gateway api fallback map to OpenCode settings", () => {
  const gpt = toModel(providerID, "gpt-6.1-sol", {}, undefined, {
    api: "openai-responses", thinking: { mode: "effort", efforts: ["low"], defaultLevel: "medium" },
  })
  expect(gpt.settings).toEqual({ reasoningEffort: "medium", reasoningSummary: "auto" })
  expect(toModel(providerID, "private-alias", {}, undefined, undefined, "openai-responses").package).toBe("@opencode/ai/providers/openai-compatible/responses")
  expect(toModel(providerID, "private-alias", { providers: ["bedrock"] }, undefined, undefined, "openai-responses").package).toBe("@opencode/ai/providers/openai-compatible")
})

test("gateway config keeps only valid LiteLLM discovery entries from an OMP-style file", async () => {
  const gateways = await Effect.runPromise(parseGateways("gateways.yml", `
providers:
  openrouter:
    modelOverrides: { x: { contextWindow: 1 } }
  broken:
    discovery: { type: litellm }
    api: not-an-api
    baseUrl: https://broken.example
  oceans:
    baseUrl: https://oceans.example/v1/
    apiKey: OCEANS_LLM_API_KEY
    discovery: { type: litellm }
    modelOverrides:
      claude-opus-5.5: { api: anthropic-messages, thinking: { mode: anthropic-adaptive, supportsDisplay: false } }
`))
  expect(gateways).toEqual([{
    id: "oceans", name: "oceans", root: "https://oceans.example", env: ["OCEANS_LLM_API_KEY"], api: "openai-completions",
    modelOverrides: { "claude-opus-5.5": { api: "anthropic-messages", thinking: { mode: "anthropic-adaptive" } } },
  }])
})

test("a machine-local gateway file replaces the tracked one", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "gateways-"))
  try {
    const gateway = (id: string) => `providers:\n  ${id}:\n    baseUrl: https://${id}.example\n    discovery: { type: litellm }\n`
    await writeFile(path.join(directory, "gateways.yml"), gateway("personal"))
    expect((await Effect.runPromise(loadGateways(directory))).map((item) => item.id)).toEqual(["personal"])
    await writeFile(path.join(directory, "gateways.local.yml"), gateway("work"))
    expect((await Effect.runPromise(loadGateways(directory))).map((item) => item.id)).toEqual(["work"])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("rich endpoint enrichment fills missing fields without replacing earlier capability evidence", async () => {
  const root = gateway({
    "/model_group/info": { data: [{ model_group: "private", supports_vision: false, input_cost_per_token: 4e-6, model_info: { supports_function_calling: false } }] },
    "/model/info": { data: [{ model_name: "private", model_info: { supports_vision: true, supports_function_calling: true, input_cost_per_token: 1e-6, output_cost_per_token: 20e-6, max_input_tokens: 272000 } }] },
  })
  const [{ id, entry }] = await discovered(root)
  const model = toModel(providerID, id, entry)
  expect(model.capabilities.input).toEqual(["text"])
  expect(model.capabilities.tools).toBe(false)
  expect(model.limit.context).toBe(272000)
  expect<unknown>(model.cost).toEqual([{ input: 4, output: 20, cache: { read: 0, write: 0 } }])
})

test("a transient endpoint failure fails discovery instead of shrinking the inventory", async () => {
  const root = gateway({
    "/model_group/info": 503,
    "/model/info": { data: [{ model_name: "deployment-a" }] },
  })
  const error = await Effect.runPromise(Effect.flip(discover(root, undefined)).pipe(Effect.provide(FetchHttpClient.layer)))
  expect(error).toMatchObject({ _tag: "LiteLLM.DiscoveryError", reason: "HTTP 503" })
})

test("plain inventory fallback still selects Responses for a known OpenAI model", async () => {
  const root = gateway({ "/v1/models": { data: [{ id: "gpt-6.1-sol" }] } })
  const [{ id, entry }] = await discovered(root)
  expect(toModel(providerID, id, entry).package).toBe("@opencode/ai/providers/openai-compatible/responses")
})
