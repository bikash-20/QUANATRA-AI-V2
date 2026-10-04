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
  const cap = perMin + burst;

  // 1. Atomic in-memory increment (single-threaded JS — no race).
  let b = memCounters.get(ip);
  if (!b || b.window !== windowStart) {
    b = { window: windowStart, count: 0 };
    memCounters.set(ip, b);
  }
  b.count += 1;

  // 2. KV floor: if KV has a higher count from prior isolates, use it.
  let kvCount = 0;
  if (kv) {
    try {
      const v = await kv.get(`rl:${ip}:${windowStart}`);
      kvCount = Number(v ?? "0");
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