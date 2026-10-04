import * as P from "./prompts";
import type { Difficulty, Lang } from "./prompts";
import { cascadeHealth, runCascade } from "./cascade";
import type { CascadeMsg, TierAttempt } from "./cascade";

export interface Env {
  AI: Ai;
  MODEL: string;
  MODEL_CASCADE?: string;
  OPENROUTER_API_KEY?: string;
  MAX_TOKENS?: string;
  CASCADE_TIMEOUT_MS?: string;
  ALLOWED_ORIGIN: string;
}

const cors = (env: Env) => ({
  "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});

const json = (
  env: Env,
  data: unknown,
  status = 200,
  extra: Record<string, string> = {}
) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors(env), ...extra },
  });

const clamp = (n: unknown, min: number, max: number, d: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : d;
};

const pickDifficulty = (b: any): Difficulty =>
  b?.difficulty === "easy" || b?.difficulty === "hard" ? b.difficulty : "medium";

const pickLang = (b: any): Lang => (b?.lang === "bn" ? "bn" : "en");

// Try the cascade; on success return parsed JSON, on failure throw.
async function cascadeJSON(
  env: Env,
  prompt: { system: string; user: string },
  maxTokens: number
): Promise<unknown> {
  const messages: CascadeMsg[] = [
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await runCascade(env, {
      messages,
      jsonMode: true,
      maxTokens,
    });
    const text = typeof res.text === "string" ? res.text : "";
    const parsed = extractJSON(text);
    if (parsed !== null) return parsed;
  }
  throw new Error("Model did not return valid JSON after retry");
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
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(env) });

  // Health endpoint exposes the cascade config so we can verify it from the browser.
  if (url.pathname === "/" || url.pathname === "/health") {
    return json(env, {
      ok: true,
      service: "quantara-worker",
      primary: env.MODEL,
      ...cascadeHealth(env),
    });
  }
  if (req.method !== "POST") return json(env, { error: "Use POST" }, 405);

  const b: any = await req.json().catch(() => ({}));
  const lang = pickLang(b);
  const difficulty = pickDifficulty(b);

  try {
    switch (url.pathname) {
      // ---- Streaming chat ----
      case "/api/chat": {
        const history: CascadeMsg[] = Array.isArray(b.messages)
          ? b.messages
              .filter((m: any) => m && m.content && m.role !== "system")
              .slice(-20)
          : [];
        if (!history.length) return json(env, { error: "messages required" }, 400);
        const messages: CascadeMsg[] = [
          { role: "system", content: P.tutorSystem(lang, b.subject, difficulty) },
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
            ...cors(env),
          },
        });
      }

      case "/api/quiz/mcq": {
        if (!b.topic) return json(env, { error: "topic required" }, 400);
        const data = await cascadeJSON(
          env,
          P.mcqPrompt(String(b.topic), clamp(b.count, 1, 15, 5), difficulty, lang),
          2000
        );
        return json(env, data);
      }

      case "/api/quiz/passage": {
        if (!b.text || String(b.text).length < 50)
          return json(env, { error: "text too short" }, 400);
        const data = await cascadeJSON(
          env,
          P.passagePrompt(
            String(b.text).slice(0, 8000),
            clamp(b.count, 1, 10, 5),
            lang,
            difficulty
          ),
          2000
        );
        return json(env, data);
      }

      case "/api/flashcards": {
        if (!b.topic) return json(env, { error: "topic required" }, 400);
        const data = await cascadeJSON(
          env,
          P.flashcardPrompt(
            String(b.topic),
            clamp(b.count, 1, 30, 10),
            lang,
            difficulty
          ),
          1800
        );
        return json(env, data);
      }

      case "/api/vocab": {
        const data = await cascadeJSON(
          env,
          P.vocabPrompt(
            String(b.topic || "everyday"),
            b.level || "B1",
            clamp(b.count, 1, 20, 10),
            lang,
            difficulty
          ),
          1800
        );
        return json(env, data);
      }

      case "/api/grammar": {
        if (!b.topic) return json(env, { error: "topic required" }, 400);
        const data = await cascadeJSON(
          env,
          P.grammarPrompt(String(b.topic), b.level || "B1", lang, difficulty),
          2200
        );
        return json(env, data);
      }

      case "/api/exam/generate": {
        if (!b.topic) return json(env, { error: "topic required" }, 400);
        const data = await cascadeJSON(
          env,
          P.mcqPrompt(
            String(b.topic),
            clamp(b.count, 5, 20, 10),
            difficulty,
            lang
          ),
          3000
        );
        return json(env, data);
      }

      case "/api/exam/grade": {
        if (!Array.isArray(b.items))
          return json(env, { error: "items required" }, 400);
        const data = await cascadeJSON(
          env,
          P.gradePrompt(b.items.slice(0, 40), lang),
          1500
        );
        return json(env, data);
      }

      default:
        return json(env, { error: "Not found" }, 404);
    }
  } catch (e: any) {
    const tried: TierAttempt[] | undefined = e?.tried;
    return json(
      env,
      {
        error: e?.message || "Server error",
        tried: tried?.map((t) => `${t.source}:${t.model}:${t.status}`),
      },
      503
    );
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await handle(req, env);
    } catch (e: any) {
      return json(env, { error: e?.message || "Server error" }, 500);
    }
  },
} satisfies ExportedHandler<Env>;