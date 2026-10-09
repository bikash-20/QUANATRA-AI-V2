import * as P from "./prompts";
import type { Difficulty, Lang } from "./prompts";
import { cascadeHealth, runCascade } from "./cascade";
import type { CascadeMsg, TierAttempt } from "./cascade";
import { applyCors } from "./cors";
import { rateLimit } from "./kv";

export interface Env {
  AI: Ai;
  MODEL: string;
  MODEL_CASCADE?: string;
  OPENROUTER_API_KEY?: string;
  MAX_TOKENS?: string;
  CASCADE_TIMEOUT_MS?: string;
  ALLOWED_ORIGIN: string;
  ALLOWED_ORIGINS?: string;
  RATE?: KVNamespace;
  RATE_LIMIT_PER_MIN?: string;
  RATE_BURST?: string;
  CACHE?: KVNamespace;
  CACHE_TTL_S?: string;
}

const json = (
  env: Env,
  data: unknown,
  status = 200,
  extra: Record<string, string> = {}
) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extra },
  });

const clamp = (n: unknown, min: number, max: number, d: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isChatMessage(value: unknown): value is CascadeMsg {
  return (
    isRecord(value) &&
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string" &&
    value.content.trim().length > 0 &&
    value.content.length <= 8_000
  );
}

function isTierAttempt(value: unknown): value is TierAttempt {
  return (
    isRecord(value) &&
    typeof value.model === "string" &&
    (value.source === "cf" || value.source === "openrouter") &&
    (value.status === "ok" || value.status === "error" || value.status === "timeout") &&
    typeof value.durationMs === "number"
  );
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

const pickDifficulty = (b: Record<string, unknown>): Difficulty =>
  b?.difficulty === "easy" || b?.difficulty === "hard" ? b.difficulty : "medium";

const pickLang = (b: Record<string, unknown>): Lang => (b?.lang === "bn" ? "bn" : "en");

// Try the cascade; on success return parsed JSON + which model served it,
// on failure throw. Per-call maxTokens + optional timeoutMs override.
async function cascadeJSON(
  env: Env,
  prompt: { system: string; user: string },
  maxTokens: number,
  timeoutMs?: number
): Promise<{ data: unknown; model: string; cacheHit: boolean }> {
  const messages: CascadeMsg[] = [
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user },
  ];
  let lastModel = "unknown";
  let lastCacheHit = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await runCascade(env, {
      messages,
      jsonMode: true,
      maxTokens,
      timeoutMs,
    });
    lastModel = res.model;
    lastCacheHit = res.cacheHit;
    const text = typeof res.text === "string" ? res.text : "";
    const parsed = extractJSON(text);
    if (parsed !== null) return { data: parsed, model: res.model, cacheHit: res.cacheHit };
  }
  throw new Error(`Model ${lastModel} did not return valid JSON after retry`);
}

function extractJSON(text: string): unknown | null {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through */
  }
  const s = cleaned.search(/[\{\[]/);
  const e = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
  if (s >= 0 && e > s) {
    try {
      return JSON.parse(cleaned.slice(s, e + 1));
    } catch {
      /* fall through */
    }
  }
  return null;
}

async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  if (req.method === "OPTIONS") return new Response(null);

  // Health endpoint exposes the cascade config so we can verify it from the browser.
  if (url.pathname === "/" || url.pathname === "/health") {
    return json(env, {
      ok: true,
      service: "quantara-worker",
      primary: env.MODEL,
      rateLimit: {
        perMin: Number(env.RATE_LIMIT_PER_MIN) || 60,
        burst: Number(env.RATE_BURST) || 20,
      },
      cacheTtlS: Number(env.CACHE_TTL_S) || 600,
      ...cascadeHealth(env),
    });
  }
  if (req.method !== "POST") return json(env, { error: "Use POST" }, 405);

  // Per-IP rate limit. Counts every POST to /api/* against a fixed-window
  // counter stored in KV. Burst absorbs small spikes; sustained traffic
  // above (RATE_LIMIT_PER_MIN + RATE_BURST)/min gets a 429.
  if (url.pathname.startsWith("/api/")) {
    const ip = req.headers.get("CF-Connecting-IP") ?? "anon";
    // Use ?? so explicit "0" overrides the default rather than getting clobbered.
    const perMin = clamp(env.RATE_LIMIT_PER_MIN, 1, 10_000, 60);
    const burst = clamp(env.RATE_BURST, 0, 1_000, 20);
    const rl = await rateLimit(env.RATE, ip, perMin, burst);
    if (!rl.allowed) {
      return json(
        env,
        {
          error: `Rate limit exceeded. Retry after ${rl.retryAfterS}s.`,
          retryAfterS: rl.retryAfterS,
        },
        429,
        { "Retry-After": String(rl.retryAfterS) }
      );
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(env, { error: "Request body must be valid JSON" }, 400);
  }
  if (!isRecord(body)) return json(env, { error: "Request body must be a JSON object" }, 400);
  const b = body;
  if (b.lang !== undefined && b.lang !== "en" && b.lang !== "bn") {
    return json(env, { error: "lang must be en or bn" }, 400);
  }
  if (
    b.difficulty !== undefined &&
    b.difficulty !== "easy" &&
    b.difficulty !== "medium" &&
    b.difficulty !== "hard"
  ) {
    return json(env, { error: "difficulty must be easy, medium, or hard" }, 400);
  }
  const lang = pickLang(b);
  const difficulty = pickDifficulty(b);

  try {
    switch (url.pathname) {
      case "/api/explain": {
        if (typeof b?.kind !== "string" || !b.kind.trim() || b.kind.length > 40)
          return json(env, { error: "kind required (max 40 characters)" }, 400);
        if (
          typeof b.question !== "string" ||
          !b.question.trim() ||
          b.question.length > 4000
        )
          return json(env, { error: "question required (max 4000 characters)" }, 400);
        if (b.options !== undefined) {
          if (
            !Array.isArray(b.options) ||
            b.options.length < 1 ||
            b.options.length > 12 ||
            b.options.some(
              (option: unknown) =>
                typeof option !== "string" || !option.trim() || option.length > 1000
            )
          ) {
            return json(
              env,
              { error: "options must be an array of 1-12 strings (max 1000 characters each)" },
              400
            );
          }
        }
        for (const [field, maxLength] of [
          ["correctAnswer", 2000],
          ["userAnswer", 2000],
          ["context", 8000],
        ] as const) {
          if (
            b[field] !== undefined &&
            (typeof b[field] !== "string" || b[field].length > maxLength)
          )
            return json(
              env,
              { error: `${field} must be a string (max ${maxLength} characters)` },
              400
            );
        }
        // gre-rc and gre-quant both get the larger token/timeout budget;
        // gre-reading is kept here during the migration window so legacy
        // callers don't see a cold path.
        const kindStr = b.kind.trim();
        const isGreKind =
          kindStr === "gre-quant" || kindStr === "gre-rc" || kindStr === "gre-reading";
        const explainMaxTokens = isGreKind ? 2200 : 1000;
        const explainTimeoutMs = isGreKind ? 20000 : undefined;
        const { data, model, cacheHit } = await cascadeJSON(
          env,
          P.explainPrompt(
            {
              kind: b.kind.trim(),
              question: b.question.trim(),
              options: Array.isArray(b.options)
                ? b.options.filter((value): value is string => typeof value === "string")
                : undefined,
              correctAnswer: optionalString(b, "correctAnswer"),
              userAnswer: optionalString(b, "userAnswer"),
              context: optionalString(b, "context"),
            },
            difficulty,
            lang
          ),
          explainMaxTokens,
          explainTimeoutMs
        );
        if (
          !data ||
          typeof data !== "object" ||
          typeof (data as { explanation?: unknown }).explanation !== "string"
        )
          throw new Error("Model did not return a valid explanation");
        return json(env, data, 200, {
          "X-Model": model,
          "X-Cache": cacheHit ? "HIT" : "MISS",
        });
      }

      // ---- Streaming chat ----
      case "/api/chat": {
        const history: CascadeMsg[] = Array.isArray(b.messages)
          ? b.messages
              .filter(isChatMessage)
              .slice(-20)
          : [];
        if (!history.length) return json(env, { error: "messages required" }, 400);
        if (typeof b.subject === "string" && b.subject.length > 80) {
          return json(env, { error: "subject must be 80 characters or fewer" }, 400);
        }
        const messages: CascadeMsg[] = [
          {
            role: "system",
            content: P.tutorSystem(
              lang,
              typeof b.subject === "string" ? b.subject : undefined,
              difficulty
            ),
          },
          ...history,
        ];
        const res = await runCascade(env, {
          messages,
          stream: true,
          maxTokens: 1500,
        });
        const stream = res.text as ReadableStream<Uint8Array>;
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Model": res.model,
            "X-Cache": res.cacheHit ? "HIT" : "MISS",
          },
        });
      }

      case "/api/quiz/mcq": {
        if (!b.topic) return json(env, { error: "topic required" }, 400);
        const { data, model, cacheHit } = await cascadeJSON(
          env,
          P.mcqPrompt(String(b.topic), clamp(b.count, 1, 15, 5), difficulty, lang),
          2000
        );
        return json(env, data, 200, { "X-Model": model, "X-Cache": cacheHit ? "HIT" : "MISS" });
      }

      case "/api/quiz/passage": {
        if (!b.text || String(b.text).length < 50)
          return json(env, { error: "text too short" }, 400);
        const { data, model, cacheHit } = await cascadeJSON(
          env,
          P.passagePrompt(
            String(b.text).slice(0, 8000),
            clamp(b.count, 1, 10, 5),
            lang,
            difficulty
          ),
          2000
        );
        return json(env, data, 200, { "X-Model": model, "X-Cache": cacheHit ? "HIT" : "MISS" });
      }

      case "/api/reading/generate": {
        const cat = String(b.category || "");
        if (!["business", "science", "social-science", "arts"].includes(cat))
          return json(env, { error: "category must be business|science|social-science|arts" }, 400);
        const topic = String(b.topic || cat).slice(0, 120);
        const count = clamp(b.count ?? 4, 3, 5, 4);
        // Inject a per-request nonce into the system prompt so the cascade
        // cache key changes every call. The user wants fresh material each
        // request, so we never want to serve a stale passage. The nonce
        // tells the model to ignore it ("ignore prior context") so the
        // output is unaffected.
        const nonce = crypto.randomUUID();
        const basePrompt = P.readingGeneratePrompt(cat, topic, count, lang, difficulty);
        const { data, model } = await cascadeJSON(
          env,
          {
            system: `${basePrompt.system}\nRequest nonce: ${nonce}. Ignore this token; it is only there to keep the response fresh.`,
            user: basePrompt.user,
          },
          3000,
          30000
        );
        return json(env, data, 200, { "X-Model": model, "X-Cache": "BYPASS" });
      }

      case "/api/flashcards": {
        if (!b.topic) return json(env, { error: "topic required" }, 400);
        const { data, model, cacheHit } = await cascadeJSON(
          env,
          P.flashcardPrompt(
            String(b.topic),
            clamp(b.count, 1, 30, 10),
            lang,
            difficulty
          ),
          1800
        );
        return json(env, data, 200, { "X-Model": model, "X-Cache": cacheHit ? "HIT" : "MISS" });
      }

      case "/api/vocab": {
        const { data, model, cacheHit } = await cascadeJSON(
          env,
          P.vocabPrompt(
            String(b.topic || "everyday"),
            typeof b.level === "string" ? b.level : "B1",
            clamp(b.count, 1, 20, 10),
            lang,
            difficulty
          ),
          1800
        );
        return json(env, data, 200, { "X-Model": model, "X-Cache": cacheHit ? "HIT" : "MISS" });
      }

      case "/api/grammar": {
        if (!b.topic) return json(env, { error: "topic required" }, 400);
        const { data, model, cacheHit } = await cascadeJSON(
          env,
          P.grammarPrompt(String(b.topic), typeof b.level === "string" ? b.level : "B1", lang, difficulty),
          2200
        );
        return json(env, data, 200, { "X-Model": model, "X-Cache": cacheHit ? "HIT" : "MISS" });
      }

      case "/api/exam/generate": {
        if (!b.topic) return json(env, { error: "topic required" }, 400);
        const { data, model, cacheHit } = await cascadeJSON(
          env,
          P.mcqPrompt(
            String(b.topic),
            clamp(b.count, 5, 20, 10),
            difficulty,
            lang
          ),
          3000
        );
        return json(env, data, 200, { "X-Model": model, "X-Cache": cacheHit ? "HIT" : "MISS" });
      }

      case "/api/exam/grade": {
        if (!Array.isArray(b.items))
          return json(env, { error: "items required" }, 400);
        const { data, model, cacheHit } = await cascadeJSON(
          env,
          P.gradePrompt((b.items as unknown[]).slice(0, 40), lang),
          1500
        );
        return json(env, data, 200, { "X-Model": model, "X-Cache": cacheHit ? "HIT" : "MISS" });
      }

      default:
        return json(env, { error: "Not found" }, 404);
    }
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error("Server error");
    const tried = isRecord(e) && Array.isArray(e.tried)
      ? e.tried.filter(isTierAttempt)
      : undefined;
    console.error(
      "[quantara] cascade failed for",
      url.pathname,
      tried?.map((t) => `${t.source}:${t.model}:${t.status}:${t.error ?? ""}`).join(" | ")
    );
    return json(
      env,
      {
        error: error.message || "Server error",
        tried: tried?.map((t) => ({
          source: t.source,
          model: t.model,
          status: t.status,
          reason: t.error,
        })),
      },
      503
    );
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return applyCors(req, env, await handle(req, env));
    } catch (e: unknown) {
      console.error("[quantara] unhandled request failure", e);
      const message = e instanceof Error ? e.message : "Server error";
      return applyCors(req, env, json(env, { error: message }, 500));
    }
  },
} satisfies ExportedHandler<Env>;