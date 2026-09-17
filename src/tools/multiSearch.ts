import { z } from "zod";
import { config } from "../config.js";
import { searchWithFailover, SearxngResult } from "../searxngClient.js";

export const MultiSearchInputSchema = z.object({
  queries: z
    .array(z.string().min(1))
    .min(2)
    .max(config.maxMultiSearchQueries)
    .describe(
      `2 to ${config.maxMultiSearchQueries} related search queries exploring the same topic from different angles.`
    ),
  count_per_query: z
    .number()
    .int()
    .min(1)
    .max(config.maxResultCount)
    .optional()
    .describe("How many raw results to fetch per sub-query before merging (default 8)."),
  language: z.string().optional().describe("Language code applied to all sub-queries."),
  time_range: z.enum(["day", "month", "year"]).optional().describe("Applied to all sub-queries."),
});

export type MultiSearchInput = z.infer<typeof MultiSearchInputSchema>;

interface MergedResult extends SearxngResult {
  /** How many of the sub-queries surfaced this URL. */
  hitCount: number;
  /** Which sub-queries surfaced it. */
  matchedQueries: string[];
}

function normalizeUrlForDedup(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    // Ignore protocol, trailing slash, and common tracking params so the
    // same article found via two different queries collapses to one entry.
    u.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((p) =>
      u.searchParams.delete(p)
    );
    return `${u.hostname}${u.pathname.replace(/\/+$/, "")}${u.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Runs each query against SearXNG in parallel, then merges results:
 * - dedupes by normalized URL
 * - a URL found by more than one sub-query is ranked higher (it's a
 *   stronger consensus signal than any single engine's relevance score)
 * - ties broken by the underlying SearXNG score, when present
 */
export async function runMultiSearch(input: MultiSearchInput): Promise<{
  queries: string[];
  merged: MergedResult[];
}> {
  const perQueryCount = input.count_per_query ?? 8;

  const responses = await Promise.allSettled(
    input.queries.map((query) =>
      searchWithFailover({ query, language: input.language, time_range: input.time_range })
    )
  );

  const byUrl = new Map<string, MergedResult>();

  responses.forEach((res, idx) => {
    if (res.status !== "fulfilled") return;
    const query = input.queries[idx];
    const results = (res.value.results ?? []).slice(0, perQueryCount);
    for (const r of results) {
      const key = normalizeUrlForDedup(r.url);
      if (!key) continue;
      const existing = byUrl.get(key);
      if (existing) {
        existing.hitCount += 1;
        existing.matchedQueries.push(query);
        if ((r.score ?? 0) > (existing.score ?? 0)) existing.score = r.score;
      } else {
        byUrl.set(key, { ...r, hitCount: 1, matchedQueries: [query] });
      }
    }
  });

  const failedQueries = responses
    .map((r, i) => (r.status === "rejected" ? input.queries[i] : null))
    .filter((q): q is string => q !== null);

  const merged = Array.from(byUrl.values()).sort((a, b) => {
    if (b.hitCount !== a.hitCount) return b.hitCount - a.hitCount;
    return (b.score ?? 0) - (a.score ?? 0);
  });

  if (failedQueries.length === input.queries.length) {
    throw new Error(`All sub-queries failed: ${failedQueries.join(", ")}`);
  }

  return { queries: input.queries, merged };
}

export function formatMultiSearchOutcome(outcome: {
  queries: string[];
  merged: MergedResult[];
}): string {
  if (outcome.merged.length === 0) {
    return `No results found across: ${outcome.queries.join(" | ")}`;
  }

  const lines: string[] = [
    `Merged results across ${outcome.queries.length} queries: ${outcome.queries.join(" | ")}`,
    "",
  ];

  outcome.merged.slice(0, 20).forEach((r, i) => {
    lines.push(`${i + 1}. ${r.title ?? "(no title)"}`);
    lines.push(`   URL: ${r.url ?? "(no url)"}`);
    if (r.content) lines.push(`   ${r.content}`);
    lines.push(
      `   Matched by ${r.hitCount}/${outcome.queries.length} sub-queries: ${r.matchedQueries.join(", ")}`
    );
    lines.push("");
  });

  return lines.join("\n").trimEnd();
}
