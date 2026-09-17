import { z } from "zod";
import { config } from "../config.js";
import { TtlCache } from "../cache.js";
import { searchWithFailover, SearxngResult } from "../searxngClient.js";

export const WebSearchInputSchema = z.object({
  query: z.string().min(1).describe("The search query."),
  count: z
    .number()
    .int()
    .min(1)
    .max(config.maxResultCount)
    .optional()
    .describe(`Number of results to return (default ${config.defaultResultCount}, max ${config.maxResultCount}).`),
  language: z.string().optional().describe("Language code, e.g. 'en', 'fr' (default: all)."),
  categories: z.string().optional().describe("Comma-separated SearXNG categories, e.g. 'general,news'."),
  time_range: z.enum(["day", "month", "year"]).optional().describe("Restrict to a recent time window."),
  min_score: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Drop results below this relevance score (0-1), when the instance reports one."),
  pageno: z.number().int().min(1).optional().describe("SearXNG result page number (default 1)."),
});

export type WebSearchInput = z.infer<typeof WebSearchInputSchema>;

const searchCache = new TtlCache<SearchOutcome>(config.searchCacheTtlMs);

interface SearchOutcome {
  query: string;
  answers: string[];
  results: SearxngResult[];
}

/** Runs the search (via cache when possible) and returns raw structured data. */
export async function runWebSearch(input: WebSearchInput): Promise<SearchOutcome> {
  const cacheKey = TtlCache.keyFrom({
    query: input.query,
    language: input.language ?? "",
    categories: input.categories ?? "",
    time_range: input.time_range ?? "",
    pageno: input.pageno ?? 1,
  });

  const cached = searchCache.get(cacheKey);
  const data =
    cached ??
    (await (async () => {
      const raw = await searchWithFailover({
        query: input.query,
        language: input.language,
        categories: input.categories,
        time_range: input.time_range,
        pageno: input.pageno,
      });
      const outcome: SearchOutcome = {
        query: input.query,
        answers: raw.answers ?? [],
        results: raw.results ?? [],
      };
      searchCache.set(cacheKey, outcome);
      return outcome;
    })());

  let results = data.results;
  if (input.min_score !== undefined) {
    results = results.filter((r) => r.score === undefined || r.score >= input.min_score!);
  }
  const count = input.count ?? config.defaultResultCount;
  results = results.slice(0, count);

  return { query: data.query, answers: data.answers, results };
}

/** Formats a search outcome as agent-readable text. */
export function formatSearchOutcome(outcome: SearchOutcome): string {
  if (outcome.results.length === 0) {
    return `No results found for "${outcome.query}".`;
  }

  const lines: string[] = [];

  if (outcome.answers.length > 0) {
    lines.push("Answers:");
    for (const a of outcome.answers) lines.push(`- ${a}`);
    lines.push("");
  }

  lines.push(`Search results for "${outcome.query}":`, "");
  outcome.results.forEach((r, i) => {
    lines.push(`${i + 1}. ${r.title ?? "(no title)"}`);
    lines.push(`   URL: ${r.url ?? "(no url)"}`);
    if (r.content) lines.push(`   ${r.content}`);
    if (r.score !== undefined) lines.push(`   Relevance score: ${r.score.toFixed(2)}`);
    if (r.publishedDate) lines.push(`   Published: ${r.publishedDate}`);
    if (r.engine) lines.push(`   Source engine: ${r.engine}`);
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}
