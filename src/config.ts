// ---------------------------------------------------------------------------
// Configuration: reads environment variables once at startup.
// ---------------------------------------------------------------------------

function parseInstanceList(raw: string): string[] {
  return raw
    .split(";")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter((s) => s.length > 0);
}

export const config = {
  /** One or more SearXNG base URLs, semicolon-separated. First is primary, rest are failover. */
  searxngInstances: parseInstanceList(process.env.SEARXNG_URL ?? "http://localhost:8080"),

  /** Default number of results returned by web_search when the caller doesn't specify one. */
  defaultResultCount: Number(process.env.SEARXLENS_DEFAULT_RESULTS ?? 8),

  /** Hard ceiling on results per single search, regardless of what the caller asks for. */
  maxResultCount: Number(process.env.SEARXLENS_MAX_RESULTS ?? 20),

  /** How long search results stay cached, in milliseconds. 0 disables the cache. */
  searchCacheTtlMs: Number(process.env.SEARXLENS_SEARCH_CACHE_TTL_MS ?? 5 * 60 * 1000),

  /** How long fetched URL content stays cached, in milliseconds. 0 disables the cache. */
  urlCacheTtlMs: Number(process.env.SEARXLENS_URL_CACHE_TTL_MS ?? 15 * 60 * 1000),

  /** Max number of sub-queries accepted by multi_search in a single call. */
  maxMultiSearchQueries: Number(process.env.SEARXLENS_MAX_MULTI_QUERIES ?? 6),

  /** Timeout for any single outbound HTTP request, in milliseconds. */
  requestTimeoutMs: Number(process.env.SEARXLENS_REQUEST_TIMEOUT_MS ?? 10_000),
} as const;

if (config.searxngInstances.length === 0) {
  throw new Error(
    "No SearXNG instance configured. Set SEARXNG_URL (optionally a semicolon-separated list for failover)."
  );
}
