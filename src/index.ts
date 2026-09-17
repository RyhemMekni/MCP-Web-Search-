#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { config } from "./config.js";
import { WebSearchInputSchema, runWebSearch, formatSearchOutcome } from "./tools/webSearch.js";
import { MultiSearchInputSchema, runMultiSearch, formatMultiSearchOutcome } from "./tools/multiSearch.js";
import { ReadUrlInputSchema, runReadUrl, formatReadUrlOutcome } from "./tools/readUrl.js";

const server = new Server(
  { name: "searxlens-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "web_search",
      description:
        "Search the web via SearXNG. Use for a single, well-formed query when you need current information.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query." },
          count: { type: "number", description: `Results to return (default ${config.defaultResultCount}, max ${config.maxResultCount}).` },
          language: { type: "string", description: "Language code, e.g. 'en', 'fr'." },
          categories: { type: "string", description: "Comma-separated SearXNG categories." },
          time_range: { type: "string", enum: ["day", "month", "year"] },
          min_score: { type: "number", description: "Drop results below this relevance score (0-1)." },
          pageno: { type: "number", description: "Result page number (default 1)." },
        },
        required: ["query"],
      },
    },
    {
      name: "multi_search",
      description:
        "Run several related queries in parallel and merge the results, deduplicated by URL and " +
        "ranked by how many sub-queries agreed on them. Use this for exploratory research on a topic " +
        "('search this from a few angles') rather than a single precise lookup.",
      inputSchema: {
        type: "object",
        properties: {
          queries: {
            type: "array",
            items: { type: "string" },
            minItems: 2,
            maxItems: config.maxMultiSearchQueries,
            description: "2+ related search queries.",
          },
          count_per_query: { type: "number", description: "Results fetched per sub-query before merging (default 8)." },
          language: { type: "string" },
          time_range: { type: "string", enum: ["day", "month", "year"] },
        },
        required: ["queries"],
      },
    },
    {
      name: "read_url",
      description:
        "Fetch a URL and extract its readable text (boilerplate stripped), for reading an article " +
        "found via search in more depth.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to fetch." },
          max_length: { type: "number", description: "Max characters to return (default 4000)." },
        },
        required: ["url"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "web_search": {
        const parsed = WebSearchInputSchema.safeParse(args ?? {});
        if (!parsed.success) return errorResult(`Invalid arguments: ${parsed.error.message}`);
        const outcome = await runWebSearch(parsed.data);
        return { content: [{ type: "text", text: formatSearchOutcome(outcome) }] };
      }
      case "multi_search": {
        const parsed = MultiSearchInputSchema.safeParse(args ?? {});
        if (!parsed.success) return errorResult(`Invalid arguments: ${parsed.error.message}`);
        const outcome = await runMultiSearch(parsed.data);
        return { content: [{ type: "text", text: formatMultiSearchOutcome(outcome) }] };
      }
      case "read_url": {
        const parsed = ReadUrlInputSchema.safeParse(args ?? {});
        if (!parsed.success) return errorResult(`Invalid arguments: ${parsed.error.message}`);
        const outcome = await runReadUrl(parsed.data);
        return { content: [{ type: "text", text: formatReadUrlOutcome(outcome) }] };
      }
      default:
        return errorResult(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return errorResult(`Tool "${name}" failed: ${err instanceof Error ? err.message : String(err)}`);
  }
});

function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `searxlens-mcp running on stdio (instances: ${config.searxngInstances.join(", ")})`
  );
}

main().catch((err) => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});
