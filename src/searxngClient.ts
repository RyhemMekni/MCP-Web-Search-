import { config } from "./config.js";

export interface SearxngResult {
  title?: string;
  url?: string;
  content?: string;
  engine?: string;
  score?: number;
  publishedDate?: string;
}

export interface SearxngResponse {
  query?: string;
  results?: SearxngResult[];
  answers?: string[];
  infoboxes?: { infobox?: string; content?: string }[];
}

export interface SearxngSearchParams {
  query: string;
  language?: string;
  categories?: string;
  time_range?: "day" | "month" | "year";
  pageno?: number;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function buildSearchUrl(base: string, params: SearxngSearchParams): string {
  const qs = new URLSearchParams({ q: params.query, format: "json" });
  if (params.language) qs.set("language", params.language);
  if (params.categories) qs.set("categories", params.categories);
  if (params.time_range) qs.set("time_range", params.time_range);
  if (params.pageno) qs.set("pageno", String(params.pageno));
  return `${base}/search?${qs.toString()}`;
}

/**
 * Queries SearXNG instances in order (config.searxngInstances), falling over
 * to the next one on network failure, HTTP error, or invalid JSON. Throws
 * only if every configured instance failed.
 */
export async function searchWithFailover(params: SearxngSearchParams): Promise<SearxngResponse> {
  const errors: string[] = [];

  for (const base of config.searxngInstances) {
    const url = buildSearchUrl(base, params);
    try {
      const response = await fetchWithTimeout(url, config.requestTimeoutMs);
      if (!response.ok) {
        errors.push(`${base}: HTTP ${response.status} ${response.statusText}`);
        continue;
      }
      try {
        return (await response.json()) as SearxngResponse;
      } catch {
        errors.push(`${base}: response was not valid JSON (is 'json' enabled in settings.yml?)`);
        continue;
      }
    } catch (err) {
      errors.push(`${base}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
  }

  throw new Error(
    `All SearXNG instances failed:\n` + errors.map((e) => `  - ${e}`).join("\n")
  );
}
