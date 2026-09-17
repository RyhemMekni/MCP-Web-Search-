// Standalone smoke test against a REAL SearXNG instance.
// Usage:
//   npm run build
//   SEARXNG_URL=http://localhost:8080 node test-local.mjs
//
// Exercises the three tools directly (no MCP transport involved), so you can
// confirm the SearXNG connection and the core logic work before wiring this
// into Claude Desktop or the MCP inspector.

import { runWebSearch, formatSearchOutcome } from "./build/tools/webSearch.js";
import { runMultiSearch, formatMultiSearchOutcome } from "./build/tools/multiSearch.js";
import { runReadUrl, formatReadUrlOutcome } from "./build/tools/readUrl.js";

function section(title) {
  console.log("\n" + "=".repeat(60));
  console.log(title);
  console.log("=".repeat(60));
}

async function main() {
  section("1. web_search — single query");
  const single = await runWebSearch({ query: "site:wikipedia.org typescript", count: 3 });
  console.log(formatSearchOutcome(single));

  if (single.results.length === 0) {
    console.log(
      "\n⚠️  Zero results. Either the instance has no engines enabled for this " +
        "query, or something upstream is off — check the raw curl test before " +
        "going further."
    );
    return;
  }

  section("2. multi_search — dedupe across related queries");
  const multi = await runMultiSearch({
    queries: ["typescript generics tutorial", "typescript generic types explained"],
    count_per_query: 5,
  });
  console.log(formatMultiSearchOutcome(multi));

  section("3. read_url — extract readable text from a top result");
  const candidates = single.results.slice(0, 3);
  if (candidates.length === 0) {
    console.log("(no URLs on the top results to read)");
  } else {
    let read;
    for (const candidate of candidates) {
      try {
        read = await runReadUrl({ url: candidate.url, max_length: 800 });
        break;
      } catch (err) {
        console.log(
          `⚠️  read_url failed for ${candidate.url}: ${err instanceof Error ? err.message : err}`
        );
      }
    }
    if (read) {
      console.log(formatReadUrlOutcome(read));
    } else {
      console.log("(all candidate URLs failed to read)");
    }
  }

  section("Done");
  console.log("All three tools ran without throwing. Check the output above for correctness.");
}

main().catch((err) => {
  console.error("\n❌ Test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
