# searxlens-mcp

An MCP server for web search via [SearXNG](https://docs.searxng.org), built for
research-style workflows: it can fan a topic out across several related
queries and merge the results, not just answer one query at a time.

*Inspired by the broader [mcp-searxng](https://github.com/ihor-sokoliuk/mcp-searxng) ecosystem.*

## Tools

### `web_search`
A single search against SearXNG. Supports `count`, `language`, `categories`,
`time_range`, `pageno`, and `min_score` (drops results below a relevance
threshold, when the instance reports scores). Results are cached in-memory
for `SEARXLENS_SEARCH_CACHE_TTL_MS`.

### `multi_search` — the differentiator
Takes 2+ related queries, runs them **in parallel**, and merges the results:
- deduplicates by normalized URL (ignores `utm_*` tracking params, trailing
  slashes, and fragments)
- a URL surfaced by more than one sub-query is ranked above one found by
  only a single sub-query — cross-query agreement is treated as a stronger
  signal than any one engine's relevance score
- ties are broken by SearXNG's own score, when present

Good for "research this topic from a few angles" prompts, where a single
query would miss results that a slightly different phrasing would catch.

### `read_url`
Fetches a URL and extracts its readable text — strips `<script>`, `<nav>`,
`<footer>`, etc., and picks the largest remaining content block (a light
readability heuristic, not a full port of Mozilla Readability). Cached for
`SEARXLENS_URL_CACHE_TTL_MS`.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `SEARXNG_URL` | `http://localhost:8080` | One instance, or several separated by `;` for failover (tried in order). |
| `SEARXLENS_DEFAULT_RESULTS` | `8` | Default results for `web_search`. |
| `SEARXLENS_MAX_RESULTS` | `20` | Hard ceiling on `count`. |
| `SEARXLENS_SEARCH_CACHE_TTL_MS` | `300000` (5 min) | Search result cache TTL. `0` disables. |
| `SEARXLENS_URL_CACHE_TTL_MS` | `900000` (15 min) | `read_url` cache TTL. `0` disables. |
| `SEARXLENS_MAX_MULTI_QUERIES` | `6` | Max sub-queries per `multi_search` call. |
| `SEARXLENS_REQUEST_TIMEOUT_MS` | `10000` | Timeout per outbound HTTP request. |

Your SearXNG instance needs JSON output enabled — in `settings.yml`:
```yaml
search:
  formats:
    - html
    - json
```

## Install & run

```bash
npm install
npm run build
```

MCP client config (e.g. `claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "searxlens": {
      "command": "node",
      "args": ["/absolute/path/to/searxlens-mcp/build/index.js"],
      "env": { "SEARXNG_URL": "http://localhost:8080" }
    }
  }
}
```

## Roadmap

Rough priority order for what's next — not committed, just notes for whoever
picks this up:

- [ ] HTTP transport (`MCP_HTTP_PORT`), for remote/shared deployments
- [ ] Instance capability discovery (`/config`) tool
- [ ] HTML fallback when an instance rejects `format=json`
- [ ] Real test suite (currently just a manual smoke script) + CI
- [ ] Docker image
- [ ] Optional: rank fusion in `multi_search` using reciprocal rank fusion
      instead of raw hit-count, for more principled merging

## License

MIT
