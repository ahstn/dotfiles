import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import Exa from "exa-js";

const SearchType = Type.Union([
  Type.Literal("auto"),
  Type.Literal("fast"),
  Type.Literal("deep"),
  Type.Literal("deep-reasoning"),
  Type.Literal("instant"),
]);

const SearchCategory = Type.Union([
  Type.Literal("company"),
  Type.Literal("research paper"),
  Type.Literal("news"),
  Type.Literal("pdf"),
  Type.Literal("tweet"),
  Type.Literal("personal site"),
  Type.Literal("financial report"),
  Type.Literal("people"),
]);

function compactSnippet(text: string, maxLength = 280) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function asList(value?: string[]) {
  return Array.isArray(value) ? value.filter(Boolean) : undefined;
}

export default function exaWebsearchExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "exa_websearch",
    label: "Exa Web Search",
    description: "Search the web with Exa and return ranked results with optional highlights or text.",
    promptSnippet: "Search the web with Exa when the user asks for external web results, especially for recent pages, research papers, or domain-filtered search.",
    promptGuidelines: [
      "Use exa_websearch for web searches when EXA_API_KEY is configured.",
      "Prefer highlights for concise snippets; enable full text only when the user needs more page content.",
      "Use category='research paper' or category='financial report' when the user asks for papers or finance documents.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "The search query." }),
      numResults: Type.Optional(Type.Number({ minimum: 1, maximum: 10, description: "Number of results to return. Exa basic plans typically allow up to 10." })),
      type: Type.Optional(SearchType),
      category: Type.Optional(SearchCategory),
      includeDomains: Type.Optional(Type.Array(Type.String({ description: "A domain to include, e.g. arxiv.org" }))),
      excludeDomains: Type.Optional(Type.Array(Type.String({ description: "A domain to exclude, e.g. pinterest.com" }))),
      includeText: Type.Optional(Type.Boolean({ description: "Include extracted page text in each result." })),
      includeHighlights: Type.Optional(Type.Boolean({ description: "Include highlighted snippets in each result." })),
      highlightQuery: Type.Optional(Type.String({ description: "Optional query used to generate highlights. Defaults to the main query." })),
      maxTextCharacters: Type.Optional(Type.Number({ minimum: 100, maximum: 20000, description: "Maximum extracted text characters per result when includeText is true." })),
      maxHighlightCharacters: Type.Optional(Type.Number({ minimum: 100, maximum: 10000, description: "Maximum highlight characters per result when includeHighlights is true." })),
      startPublishedDate: Type.Optional(Type.String({ description: "ISO start date filter for published date, e.g. 2024-01-01" })),
      endPublishedDate: Type.Optional(Type.String({ description: "ISO end date filter for published date, e.g. 2024-12-31" })),
      startCrawlDate: Type.Optional(Type.String({ description: "ISO start date filter for crawl date." })),
      endCrawlDate: Type.Optional(Type.String({ description: "ISO end date filter for crawl date." })),
      useAutoprompt: Type.Optional(Type.Boolean({ description: "Let Exa expand the query automatically." })),
      userLocation: Type.Optional(Type.String({ description: "Two-letter ISO country code, e.g. US." })),
    }),
    async execute(toolCallId, params, _signal, onUpdate) {
      if (!process.env.EXA_API_KEY) {
        throw new Error("EXA_API_KEY is not set. Add it to your environment before using exa_websearch.");
      }

      onUpdate?.({
        content: [{ type: "text", text: `Searching Exa for: ${params.query}` }],
      });

      const exa = new Exa(process.env.EXA_API_KEY);
      const includeHighlights = params.includeHighlights ?? true;
      const includeText = params.includeText ?? false;

      const baseOptions = {
        numResults: params.numResults ?? 5,
        type: params.type ?? "auto",
        category: params.category,
        includeDomains: asList(params.includeDomains),
        excludeDomains: asList(params.excludeDomains),
        startPublishedDate: params.startPublishedDate,
        endPublishedDate: params.endPublishedDate,
        startCrawlDate: params.startCrawlDate,
        endCrawlDate: params.endCrawlDate,
        useAutoprompt: params.useAutoprompt,
        userLocation: params.userLocation,
      };

      const response = includeHighlights || includeText
        ? await exa.searchAndContents(params.query, {
            ...baseOptions,
            text: includeText
              ? (params.maxTextCharacters ? { maxCharacters: params.maxTextCharacters } : true)
              : undefined,
            highlights: includeHighlights
              ? {
                  query: params.highlightQuery || params.query,
                  maxCharacters: params.maxHighlightCharacters ?? 1200,
                }
              : undefined,
          })
        : await exa.search(params.query, baseOptions);

      const lines: string[] = [];
      lines.push(`Exa search results for: ${params.query}`);
      lines.push(`Results: ${response.results.length}`);
      if ((response as any).resolvedSearchType) lines.push(`Resolved type: ${(response as any).resolvedSearchType}`);
      if (response.requestId) lines.push(`Request ID: ${response.requestId}`);
      if ((response as any).costDollars?.total != null) lines.push(`Cost: $${(response as any).costDollars.total}`);
      lines.push("");

      response.results.forEach((result: any, index: number) => {
        lines.push(`${index + 1}. ${result.title || "Untitled"}`);
        lines.push(`   URL: ${result.url}`);
        if (result.publishedDate) lines.push(`   Published: ${result.publishedDate}`);
        if (result.author) lines.push(`   Author: ${result.author}`);
        if (Array.isArray(result.highlights) && result.highlights.length > 0) {
          lines.push(`   Highlights:`);
          result.highlights.slice(0, 3).forEach((highlight: string) => {
            lines.push(`   - ${compactSnippet(highlight, 320)}`);
          });
        } else if (typeof result.text === "string" && result.text.trim()) {
          lines.push(`   Text: ${compactSnippet(result.text, 500)}`);
        }
        lines.push("");
      });

      return {
        content: [{ type: "text", text: lines.join("\n").trim() }],
        details: {
          toolCallId,
          query: params.query,
          requestId: response.requestId,
          resolvedSearchType: (response as any).resolvedSearchType,
          costDollars: (response as any).costDollars,
          raw: response,
        },
      };
    },
  });
}
