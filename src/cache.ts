// ---------------------------------------------------------------------------
// A minimal in-memory cache with per-entry TTL. Not persisted, not shared
// across processes — good enough for a single long-lived MCP server process,
// which is the typical deployment for stdio-based MCP servers.
// ---------------------------------------------------------------------------

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export class TtlCache<V> {
  private store = new Map<string, CacheEntry<V>>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): V | undefined {
    if (this.ttlMs <= 0) return undefined;
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    if (this.ttlMs <= 0) return;
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  /** Builds a stable cache key from a plain object of parameters. */
  static keyFrom(parts: Record<string, unknown>): string {
    return JSON.stringify(parts, Object.keys(parts).sort());
  }
}
