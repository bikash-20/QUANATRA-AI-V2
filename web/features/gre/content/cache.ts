// Tiny TTL cache primitives used by the GRE server-side content loader.
// Extracted here (no Next / "server-only" / fs imports) so that the unit
// tests can exercise them under the Node strip-types runner without
// resolving package aliases or pulling in server-only.
//
// Conservative defaults: 60s TTL, defensive 5,000 entry cap on the
// question/word maps (today's static corpus is ~4,100 entries).

export const DEFAULT_CACHE_TTL_MS = 60_000;
export const MAX_CACHE_ENTRIES = 5_000;

export class TtlEntry<V> {
  value: V;
  expiresAt: number;
  constructor(value: V, expiresAt: number) {
    this.value = value;
    this.expiresAt = expiresAt;
  }
}

export class MapWithTTL<K, V> {
  private store = new Map<K, TtlEntry<V>>();

  get(key: K, now: number = Date.now()): V | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= now) {
      this.store.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key: K, value: V, ttlMs: number = DEFAULT_CACHE_TTL_MS, now: number = Date.now()): void {
    this.store.set(key, new TtlEntry(value, now + ttlMs));
  }

  has(key: K, now: number = Date.now()): boolean {
    return this.get(key, now) !== undefined;
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  get size(): number {
    return this.store.size;
  }

  pruneExpired(now: number = Date.now()): number {
    let removed = 0;
    for (const [k, e] of this.store) {
      if (e.expiresAt <= now) {
        this.store.delete(k);
        removed += 1;
      }
    }
    return removed;
  }

  *keys(): IterableIterator<K> {
    for (const k of this.store.keys()) yield k;
  }
}

export class TtlSlot<V> {
  private entry: TtlEntry<V> | null = null;
  read(now: number = Date.now()): V | undefined {
    if (!this.entry) return undefined;
    if (this.entry.expiresAt <= now) {
      this.entry = null;
      return undefined;
    }
    return this.entry.value;
  }
  write(value: V, ttlMs: number = DEFAULT_CACHE_TTL_MS, now: number = Date.now()): void {
    this.entry = new TtlEntry(value, now + ttlMs);
  }
  invalidate(): void {
    this.entry = null;
  }
}

export function enforceSizeGuard(
  maps: Array<MapWithTTL<unknown, unknown>>,
  cap: number,
  now: number = Date.now(),
): void {
  for (const m of maps) m.pruneExpired(now);
  const total = maps.reduce((s, m) => s + m.size, 0);
  if (total <= cap) return;
  maps.sort((a, b) => b.size - a.size);
  const target = maps[0];
  const drop = Math.ceil(target.size / 4);
  let i = 0;
  for (const k of target.keys()) {
    target.delete(k);
    if (++i >= drop) break;
  }
}