// KV cache + per-IP rate limiter. Both backends are optional: if env.CACHE
// or env.RATE is missing, the corresponding feature becomes a no-op so the
// worker still works locally without KV bindings.
//
// The Cloudflare `KVNamespace` type comes from `@cloudflare/workers-types`
// (already in the worker's tsconfig).

// ---------------------------------------------------------------------------
// Rate limiter — fixed-window per minute, isolate-scoped.
//
// KV is eventually consistent and has no atomic increment, so concurrent
// requests can lose updates under burst. We solve that by gating in a
// module-scope counter that is correct within an isolate (single-threaded
// JS guarantee), and then *additionally* persisting the count to KV so we
// still block abusive clients if the isolate is recycled. The KV read is
// used as a floor: the effective count is max(inMemory, kv), which means
// once an IP has been seen across many isolates, the limit still holds.
//
// In practice the in-memory check is the one that does 99% of the work; KV
// is a safety net that survives isolate restarts.
// ---------------------------------------------------------------------------

type Bucket = { window: number; count: number };
const memCounters = new Map<string, Bucket>();
const MAX_MEMORY_COUNTERS = 10_000;
let lastPrunedWindow = 0;

function pruneCounters(windowStart: number): void {
  if (lastPrunedWindow === windowStart && memCounters.size < MAX_MEMORY_COUNTERS) return;

  for (const [key, bucket] of memCounters) {
    if (bucket.window < windowStart) memCounters.delete(key);
  }
  while (memCounters.size >= MAX_MEMORY_COUNTERS) {
    const oldest = memCounters.keys().next().value;
    if (oldest === undefined) break;
    memCounters.delete(oldest);
  }
  lastPrunedWindow = windowStart;
}

function finiteLimit(value: number, fallback: number, min: number, max: number): number {
  return Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback;
}

export type RateResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; remaining: 0; resetAt: number; retryAfterS: number };

export async function rateLimit(
  kv: KVNamespace | undefined,
  ip: string,
  perMin: number,
  burst: number
): Promise<RateResult> {
  const now = Date.now();
  const windowMs = 60_000;
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  const cap =
    finiteLimit(perMin, 60, 1, 10_000) +
    finiteLimit(burst, 20, 0, 1_000);

  // 1. Atomic in-memory increment (single-threaded JS — no race).
  pruneCounters(windowStart);
  let b = memCounters.get(ip);
  if (!b || b.window !== windowStart) {
    b = { window: windowStart, count: 0 };
    memCounters.delete(ip);
    memCounters.set(ip, b);
  }
  b.count += 1;

  // 2. KV floor: if KV has a higher count from prior isolates, use it.
  let kvCount = 0;
  if (kv) {
    try {
      const v = await kv.get(`rl:${ip}:${windowStart}`);
      const storedCount = Number(v ?? "0");
      kvCount = Number.isFinite(storedCount) && storedCount >= 0
        ? Math.floor(storedCount)
        : 0;
    } catch {
      kvCount = 0;
    }
  }
  const effective = Math.max(b.count, kvCount);
  if (effective > cap) {
    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfterS: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
  }

  // 3. Best-effort async KV write so other isolates eventually see us.
  if (kv) {
    // TTL 2 windows so the key auto-expires even if subsequent ones fail.
    kv.put(`rl:${ip}:${windowStart}`, String(effective), { expirationTtl: 120 })
      .catch((e) => console.error("[quantara] kv rate put failed:", (e as Error)?.message));
  }

  return { allowed: true, remaining: Math.max(0, cap - effective), resetAt };
}

// ---------------------------------------------------------------------------
// JSON cache — writes the full JSON string with a TTL. Key is provided by the
// caller so we keep cache-key logic in cascade.ts.
// ---------------------------------------------------------------------------

export async function cacheGetJSON(
  kv: KVNamespace | undefined,
  key: string
): Promise<string | null> {
  if (!kv) return null;
  try {
    return await kv.get(key);
  } catch (e) {
    console.error("[quantara] kv cache get failed:", (e as Error)?.message);
    return null;
  }
}

export async function cachePutJSON(
  kv: KVNamespace | undefined,
  key: string,
  value: string,
  ttlS: number
): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(key, value, { expirationTtl: ttlS });
  } catch (e) {
    console.error("[quantara] kv cache put failed:", (e as Error)?.message);
  }
}