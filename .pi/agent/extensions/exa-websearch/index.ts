import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { Exa } from "exa-js";

const Operation = Type.Union(
  [Type.Literal("search"), Type.Literal("contents")],
  {
    description:
      "Operation to run. 'search' searches the web. 'contents' retrieves content for known URLs or Exa document IDs.",
  },
);

const SearchType = Type.Union(
  [
    Type.Literal("auto"),
    Type.Literal("fast"),
    Type.Literal("instant"),
    Type.Literal("deep-lite"),
    Type.Literal("deep"),
    Type.Literal("deep-reasoning"),
  ],
  {
    description:
      "Search type: auto general default; fast/instant for low latency; deep-lite/deep/deep-reasoning for synthesized multi-step research.",
  },
);

const SearchCategory = Type.Union([
  Type.Literal("company"),
  Type.Literal("research paper"),
  Type.Literal("news"),
  Type.Literal("pdf"),
  Type.Literal("personal site"),
  Type.Literal("financial report"),
  Type.Literal("people"),
]);

const TextVerbosity = Type.Union(
  [Type.Literal("compact"), Type.Literal("standard"), Type.Literal("full")],
  {
    description:
      "Text verbosity: compact, standard, or full. Exa recommends using maxAgeHours=0 with this option.",
  },
);

const PageSection = Type.Union([
  Type.Literal("header"),
  Type.Literal("navigation"),
  Type.Literal("banner"),
  Type.Literal("body"),
  Type.Literal("sidebar"),
  Type.Literal("footer"),
  Type.Literal("metadata"),
]);

function compactSnippet(text: string, maxLength = 280) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function asList(value?: string[]) {
  return Array.isArray(value) ? value.filter(Boolean) : undefined;
}

function isDeepSearchType(type?: string) {
  return type === "deep-lite" || type === "deep" || type === "deep-reasoning";
}

function stripUndefined<T extends Record<string, any>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function formatJson(value: unknown, maxLength = 1800) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return compactSnippet(text, maxLength);
}

function buildContentsOptions(params: any, operation: "search" | "contents") {
  const includeHighlights = params.includeHighlights ?? operation === "search";
  const includeText = params.includeText ?? operation === "contents";
  const includeSummary = params.includeSummary ?? false;

  const textOptions = stripUndefined({
    maxCharacters: params.maxTextCharacters,
    includeHtmlTags: params.includeHtmlTags,
    verbosity: params.textVerbosity,
    includeSections: asList(params.includeSections),
    excludeSections: asList(params.excludeSections),
  });

  const highlightOptions = stripUndefined({
    query: params.highlightQuery,
    maxCharacters: params.maxHighlightCharacters,
  });

  const summaryOptions = stripUndefined({
    query: params.summaryQuery,
    schema: params.summarySchema,
  });

  const extras = stripUndefined({
    links: params.extraLinks,
    imageLinks: params.extraImageLinks,
  });

  const contents = stripUndefined({
    text: includeText
      ? Object.keys(textOptions).length > 0
        ? textOptions
        : true
      : undefined,
    highlights: includeHighlights
      ? Object.keys(highlightOptions).length > 0
        ? highlightOptions
        : true
      : undefined,
    summary: includeSummary
      ? Object.keys(summaryOptions).length > 0
        ? summaryOptions
        : true
      : undefined,
    maxAgeHours: params.maxAgeHours,
    livecrawlTimeout: params.livecrawlTimeout,
    filterEmptyResults: params.filterEmptyResults,
    subpages: params.subpages,
    subpageTarget: params.subpageTarget,
    extras: Object.keys(extras).length > 0 ? extras : undefined,
  });

  return Object.keys(contents).length > 0 ? contents : false;
}

function sanitizeSearchOptions(params: any, options: Record<string, any>) {
  const warnings: string[] = [];

  if (params.category === "company" || params.category === "people") {
    for (const key of [
      "startPublishedDate",
      "endPublishedDate",
      "startCrawlDate",
      "endCrawlDate",
      "excludeDomains",
    ]) {
      if (options[key] !== undefined) {
        delete options[key];
        warnings.push(
          `Removed ${key}: category='${params.category}' does not support this filter.`,
        );
      }
    }
  }

  if (params.category === "people" && Array.isArray(options.includeDomains)) {
    const linkedinDomains = options.includeDomains.filter((domain: string) =>
      /(^|\.)linkedin\.com(\/|$)/i.test(domain),
    );
    if (linkedinDomains.length !== options.includeDomains.length) {
      warnings.push(
        "Removed non-LinkedIn includeDomains: category='people' only supports LinkedIn domains.",
      );
      options.includeDomains = linkedinDomains.length > 0 ? linkedinDomains : undefined;
    }
  }

  if (params.additionalQueries && !isDeepSearchType(options.type)) {
    delete options.additionalQueries;
    warnings.push(
      "Ignored additionalQueries: they are only supported with type='deep-lite', 'deep', or 'deep-reasoning'.",
    );
  }

  return warnings;
}

function appendResult(lines: string[], result: any, index: number, indent = "") {
  lines.push(`${indent}${index + 1}. ${result.title || "Untitled"}`);
  lines.push(`${indent}   URL: ${result.url}`);
  if (result.publishedDate) lines.push(`${indent}   Published: ${result.publishedDate}`);
  if (result.author) lines.push(`${indent}   Author: ${result.author}`);
  if (Array.isArray(result.entities) && result.entities.length > 0) {
    lines.push(`${indent}   Entities: ${formatJson(result.entities, 700)}`);
  }

  if (Array.isArray(result.highlights) && result.highlights.length > 0) {
    lines.push(`${indent}   Highlights:`);
    result.highlights.slice(0, 3).forEach((highlight: string) => {
      lines.push(`${indent}   - ${compactSnippet(highlight, 360)}`);
    });
  }

  if (typeof result.summary === "string" && result.summary.trim()) {
    lines.push(`${indent}   Summary: ${compactSnippet(result.summary, 700)}`);
  }

  if (typeof result.text === "string" && result.text.trim()) {
    lines.push(`${indent}   Text: ${compactSnippet(result.text, 700)}`);
  }

  if (result.extras?.links?.length) {
    lines.push(`${indent}   Links: ${result.extras.links.slice(0, 8).join(", ")}`);
  }
  if (result.extras?.imageLinks?.length) {
    lines.push(
      `${indent}   Image links: ${result.extras.imageLinks.slice(0, 5).join(", ")}`,
    );
  }

  if (Array.isArray(result.subpages) && result.subpages.length > 0) {
    lines.push(`${indent}   Subpages:`);
    result.subpages.slice(0, 5).forEach((subpage: any, subIndex: number) => {
      lines.push(`${indent}   ${subIndex + 1}. ${subpage.title || "Untitled"} — ${subpage.url}`);
      if (typeof subpage.text === "string" && subpage.text.trim()) {
        lines.push(`${indent}      ${compactSnippet(subpage.text, 240)}`);
      } else if (typeof subpage.summary === "string" && subpage.summary.trim()) {
        lines.push(`${indent}      ${compactSnippet(subpage.summary, 240)}`);
      }
    });
  }

  lines.push("");
}

function appendResponseMetadata(lines: string[], response: any) {
  if (response.searchType) lines.push(`Search type: ${response.searchType}`);
  if (response.resolvedSearchType) lines.push(`Resolved type: ${response.resolvedSearchType}`);
  if (response.searchTime != null) lines.push(`Search time: ${response.searchTime}ms`);
  if (response.requestId) lines.push(`Request ID: ${response.requestId}`);
  if (response.costDollars?.total != null) lines.push(`Cost: $${response.costDollars.total}`);
}

function appendSynthesizedOutput(lines: string[], response: any) {
  if (!response.output) return;

  lines.push("Synthesized output:");
  lines.push(formatJson(response.output.content, 2500));

  if (Array.isArray(response.output.grounding) && response.output.grounding.length > 0) {
    lines.push("Grounding:");
    response.output.grounding.slice(0, 8).forEach((entry: any) => {
      const citations = Array.isArray(entry.citations)
        ? entry.citations
          .slice(0, 3)
          .map((citation: any) => citation.title ? `${citation.title} (${citation.url})` : citation.url)
          .join("; ")
        : "";
      lines.push(
        `- ${entry.field || "content"}${entry.confidence ? ` [${entry.confidence}]` : ""}: ${citations}`,
      );
    });
  }
  lines.push("");
}

function appendStatuses(lines: string[], response: any) {
  if (!Array.isArray(response.statuses)) return;
  const notable = response.statuses.filter((status: any) => status.status !== "success");
  if (notable.length === 0) return;
  lines.push("Statuses:");
  notable.slice(0, 10).forEach((status: any) => {
    lines.push(`- ${status.id}: ${status.status}${status.source ? ` (${status.source})` : ""}`);
  });
  lines.push("");
}

export default function exaWebsearchExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "exa_websearch",
    label: "Exa Web Search",
    description:
      "Search the web or retrieve known URL contents with Exa, returning ranked results with highlights, text, summaries, subpages, extras, or synthesized output.",
    promptSnippet:
      "Search the web with Exa for recent information, source discovery, papers, company/people lookup, domain-filtered research, and URL content retrieval.",
    promptGuidelines: [
      "Use exa_websearch for live web search, recent information, source discovery, domain-filtered research, papers, company/people lookup, and cited external facts.",
      "Use operation='contents' when you already have URLs and need page text, summaries, links, subpages, or highlights.",
      "Use type='auto' by default, type='instant' or 'fast' when latency matters, and type='deep-lite'/'deep'/'deep-reasoning' for complex multi-step research or structured outputs.",
      "Use outputSchema with systemPrompt when the user asks for structured web-grounded extraction; do not include citation/confidence fields in outputSchema because Exa returns grounding separately.",
      "Use category='research paper' for academic papers, category='financial report' for SEC/earnings documents, category='company' for company discovery, and category='people' for professional/person lookup.",
    ],
    parameters: Type.Object({
      operation: Type.Optional(Operation),
      query: Type.Optional(
        Type.String({ description: "Search query. Required for operation='search'." }),
      ),
      urls: Type.Optional(
        Type.Array(Type.String(), {
          minItems: 1,
          maxItems: 25,
          description:
            "URLs or Exa document IDs to retrieve. Required for operation='contents'.",
        }),
      ),
      numResults: Type.Optional(
        Type.Number({
          minimum: 1,
          maximum: 100,
          description:
            "Number of results to return. Exa supports up to 100; higher values may be plan-limited and increase cost/context.",
        }),
      ),
      type: Type.Optional(SearchType),
      category: Type.Optional(SearchCategory),
      includeDomains: Type.Optional(
        Type.Array(Type.String({ description: "A domain or domain path to include, e.g. arxiv.org or docs.example.com/path" })),
      ),
      excludeDomains: Type.Optional(
        Type.Array(Type.String({ description: "A domain or domain path to exclude, e.g. pinterest.com" })),
      ),
      includeTextTerms: Type.Optional(
        Type.Array(Type.String(), {
          maxItems: 1,
          description:
            "Require this exact text phrase in result page text. Exa supports one phrase up to about 5 words.",
        }),
      ),
      excludeTextTerms: Type.Optional(
        Type.Array(Type.String(), {
          maxItems: 1,
          description:
            "Exclude results containing this exact text phrase. Exa supports one phrase up to about 5 words.",
        }),
      ),
      includeHighlights: Type.Optional(
        Type.Boolean({
          description:
            "Include token-efficient highlights. Defaults to true for search and false for contents.",
        }),
      ),
      highlightQuery: Type.Optional(
        Type.String({
          description:
            "Optional query used to guide highlights. Omit for Exa's highest-quality default highlights.",
        }),
      ),
      maxHighlightCharacters: Type.Optional(
        Type.Number({
          minimum: 100,
          maximum: 10000,
          description:
            "Maximum highlight characters per result. Omit unless a specific budget is needed.",
        }),
      ),
      includeText: Type.Optional(
        Type.Boolean({
          description:
            "Include extracted page text. Defaults to false for search and true for contents.",
        }),
      ),
      maxTextCharacters: Type.Optional(
        Type.Number({
          minimum: 100,
          maximum: 50000,
          description:
            "Maximum extracted text characters per result when includeText is true.",
        }),
      ),
      textVerbosity: Type.Optional(TextVerbosity),
      includeHtmlTags: Type.Optional(
        Type.Boolean({ description: "Preserve HTML tags in returned text." }),
      ),
      includeSections: Type.Optional(
        Type.Array(PageSection, {
          description:
            "Only include these semantic page sections. Exa recommends maxAgeHours=0 with this option.",
        }),
      ),
      excludeSections: Type.Optional(
        Type.Array(PageSection, {
          description:
            "Exclude these semantic page sections. Exa recommends maxAgeHours=0 with this option.",
        }),
      ),
      includeSummary: Type.Optional(
        Type.Boolean({ description: "Include Exa-generated summaries for each result." }),
      ),
      summaryQuery: Type.Optional(
        Type.String({ description: "Optional query to guide per-result summaries." }),
      ),
      summarySchema: Type.Optional(
        Type.Any({ description: "Optional JSON schema for structured per-result summaries." }),
      ),
      maxAgeHours: Type.Optional(
        Type.Number({
          description:
            "Maximum age of cached content in hours. 0 = always livecrawl, -1 = cache only, omit for Exa default fallback behavior.",
        }),
      ),
      livecrawlTimeout: Type.Optional(
        Type.Number({
          minimum: 1000,
          maximum: 30000,
          description: "Livecrawl timeout in milliseconds when Exa crawls fresh content.",
        }),
      ),
      filterEmptyResults: Type.Optional(
        Type.Boolean({ description: "Filter out results with no returned contents. Default is Exa's default." }),
      ),
      subpages: Type.Optional(
        Type.Number({
          minimum: 0,
          maximum: 10,
          description: "Number of subpages to crawl per result.",
        }),
      ),
      subpageTarget: Type.Optional(
        Type.Union(
          [Type.String(), Type.Array(Type.String())],
          {
            description:
              "Keyword or keywords to prioritize when selecting subpages, e.g. pricing or docs.",
          },
        ),
      ),
      extraLinks: Type.Optional(
        Type.Number({
          minimum: 0,
          maximum: 50,
          description: "Number of URLs to extract from each page.",
        }),
      ),
      extraImageLinks: Type.Optional(
        Type.Number({
          minimum: 0,
          maximum: 50,
          description: "Number of image URLs to extract from each page.",
        }),
      ),
      startPublishedDate: Type.Optional(
        Type.String({ description: "ISO start date filter for published date, e.g. 2024-01-01" }),
      ),
      endPublishedDate: Type.Optional(
        Type.String({ description: "ISO end date filter for published date, e.g. 2024-12-31" }),
      ),
      startCrawlDate: Type.Optional(
        Type.String({ description: "ISO start date filter for crawl date." }),
      ),
      endCrawlDate: Type.Optional(
        Type.String({ description: "ISO end date filter for crawl date." }),
      ),
      moderation: Type.Optional(
        Type.Boolean({ description: "Filter unsafe content from search results." }),
      ),
      additionalQueries: Type.Optional(
        Type.Array(Type.String(), {
          maxItems: 5,
          description:
            "Extra query variations for type='deep-lite', 'deep', or 'deep-reasoning'.",
        }),
      ),
      systemPrompt: Type.Optional(
        Type.String({
          description:
            "Instructions for Exa synthesized output and deep-search planning, e.g. prefer official sources.",
        }),
      ),
      outputSchema: Type.Optional(
        Type.Any({
          description:
            "JSON schema for Exa synthesized output. Max depth 2 and max 10 total properties. Do not include citation/confidence fields.",
        }),
      ),
      userLocation: Type.Optional(
        Type.String({ description: "Two-letter ISO country code, e.g. US." }),
      ),
    }),
    prepareArguments(args) {
      const { useAutoprompt, livecrawl, ...rest } = args as any;
      return rest;
    },
    async execute(toolCallId, params, signal, onUpdate) {
      if (!process.env.EXA_API_KEY) {
        throw new Error(
          "EXA_API_KEY is not set. Add it to your environment before using exa_websearch.",
        );
      }

      const operation = (params.operation ?? "search") as "search" | "contents";
      const exa = new Exa(process.env.EXA_API_KEY);
      const contents = buildContentsOptions(params, operation);

      let response: any;
      let warnings: string[] = [];

      if (operation === "contents") {
        if (!Array.isArray(params.urls) || params.urls.length === 0) {
          throw new Error("operation='contents' requires urls.");
        }

        onUpdate?.({
          content: [{ type: "text", text: `Retrieving Exa contents for ${params.urls.length} URL(s)` }],
          details: {},
        });

        response = await exa.getContents(params.urls, contents === false ? undefined : contents as any);
      } else {
        if (!params.query) throw new Error("operation='search' requires query.");

        onUpdate?.({
          content: [{ type: "text", text: `Searching Exa for: ${params.query}` }],
          details: {},
        });

        const searchOptions = stripUndefined({
          numResults: params.numResults ?? 5,
          type: params.type ?? "auto",
          category: params.category,
          includeDomains: asList(params.includeDomains),
          excludeDomains: asList(params.excludeDomains),
          includeText: asList(params.includeTextTerms),
          excludeText: asList(params.excludeTextTerms),
          startPublishedDate: params.startPublishedDate,
          endPublishedDate: params.endPublishedDate,
          startCrawlDate: params.startCrawlDate,
          endCrawlDate: params.endCrawlDate,
          moderation: params.moderation,
          additionalQueries: asList(params.additionalQueries),
          systemPrompt: params.systemPrompt,
          outputSchema: params.outputSchema,
          userLocation: params.userLocation,
          contents,
        });

        warnings = sanitizeSearchOptions(params, searchOptions);
        response = await exa.search(params.query, searchOptions as any);
      }

      const lines: string[] = [];
      lines.push(
        operation === "contents"
          ? `Exa contents for ${params.urls?.length ?? 0} URL(s)`
          : `Exa search results for: ${params.query}`,
      );
      lines.push(`Operation: ${operation}`);
      lines.push(`Results: ${response.results?.length ?? 0}`);
      appendResponseMetadata(lines, response);
      if (warnings.length > 0) {
        lines.push("Warnings:");
        warnings.forEach((warning) => lines.push(`- ${warning}`));
      }
      lines.push("");

      appendSynthesizedOutput(lines, response);

      (response.results ?? []).forEach((result: any, index: number) => {
        appendResult(lines, result, index);
      });

      appendStatuses(lines, response);

      return {
        content: [{ type: "text", text: lines.join("\n").trim() }],
        details: {
          toolCallId,
          operation,
          query: params.query,
          urls: params.urls,
          requestId: response.requestId,
          searchType: response.searchType,
          resolvedSearchType: response.resolvedSearchType,
          searchTime: response.searchTime,
          costDollars: response.costDollars,
          warnings,
          raw: response,
        },
      };
    },
  });
}
