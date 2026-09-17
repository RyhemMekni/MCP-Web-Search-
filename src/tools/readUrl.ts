import { z } from "zod";
import { parse, HTMLElement } from "node-html-parser";
import { config } from "../config.js";
import { TtlCache } from "../cache.js";

export const ReadUrlInputSchema = z.object({
  url: z.string().url().describe("The URL to fetch and extract readable text from."),
  max_length: z
    .number()
    .int()
    .min(200)
    .max(20000)
    .optional()
    .describe("Maximum characters of extracted text to return (default 4000)."),
});

export type ReadUrlInput = z.infer<typeof ReadUrlInputSchema>;

const urlCache = new TtlCache<string>(config.urlCacheTtlMs);

const NOISE_TAGS = ["script", "style", "noscript", "nav", "footer", "header", "aside", "form", "svg"];

/** Very lightweight readability pass: strips boilerplate tags, keeps text of
 * the largest remaining content block. Not a full Readability port — good
 * enough for giving an LLM the gist of an article without a heavy dependency. */
function extractReadableText(html: string): { title: string; text: string } {
  const root = parse(html);
  const title = root.querySelector("title")?.text.trim() ?? "";

  for (const tag of NOISE_TAGS) {
    root.querySelectorAll(tag).forEach((el) => el.remove());
  }

  const candidates = root.querySelectorAll("article, main, [role=main], body");
  const scored: { el: HTMLElement; score: number }[] = candidates.map((el) => {
    const text = el.text.replace(/\s+/g, " ").trim();
    return { el, score: text.length };
  });
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.el ?? root;

  const text = best.text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return { title, text };
}

export async function runReadUrl(input: ReadUrlInput): Promise<{ url: string; title: string; text: string }> {
  const cacheKey = TtlCache.keyFrom({ url: input.url });
  let raw = urlCache.get(cacheKey);

  if (raw === undefined) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    try {
      const response = await fetch(input.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText} fetching ${input.url}`);
      }
      raw = await response.text();
      urlCache.set(cacheKey, raw);
    } finally {
      clearTimeout(timer);
    }
  }

  const { title, text } = extractReadableText(raw);
  const maxLength = input.max_length ?? 4000;
  const truncated = text.length > maxLength ? text.slice(0, maxLength) + "\u2026 [truncated]" : text;

  return { url: input.url, title, text: truncated };
}

export function formatReadUrlOutcome(outcome: { url: string; title: string; text: string }): string {
  return [`Title: ${outcome.title || "(untitled)"}`, `URL: ${outcome.url}`, "", outcome.text].join("\n");
}
