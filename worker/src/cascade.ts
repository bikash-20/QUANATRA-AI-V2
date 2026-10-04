// Multi-model cascade with an in-memory LRU cache.
// Tries models in order until one returns text. Used for every generation
// endpoint so a single model outage can't take down a feature.

import { openRouterComplete, openRouterStream } from "./openrouter";

export type CascadeMsg = { role: "system" | "user" | "assistant"; content: string };

export type CascadeOpts = {
  messages: CascadeMsg[];
  jsonMode?: boolean;
  stream?: boolean;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** OpenRouter API key. Optional — if absent, OpenRouter tiers are skipped. */
  openRouterKey?: string;
};

export type CascadeResult = {
  text: string | ReadableStream<Uint8Array>;
  model: string;
  source: "cf" | "openrouter";
  cacheHit: boolean;
};

export type TierAttempt = {
  model: string;
  source: "cf" | "openrouter";
  status: "ok" | "error" | "timeout";
  error?: string;
  durationMs: number;
};

// Default CF cascade. Order matters: fastest / most reliable first.
export const DEFAULT_CF_CASCADE = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",     // primary
  "@cf/meta/llama-4-scout-17b-16e-instruct",      // fast multimodal
  "@cf/qwen/qwen2.5-coder-32b-instruct",          // JSON-strong
  "@cf/openai/gpt-oss-120b",                      // last CF fallback
];

export const DEFAULT_OPENROUTER_CASCADE = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen-2.5-72b-instruct:free",
  "deepseek/deepseek-chat",
];

// ----------------------------------------------------------------------------
// Tiny LRU cache, isolate-scoped.
// ----------------------------------------------------------------------------

type CacheEntry = { value: string; expires: number };
const CACHE_MAX = 200;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, CacheEntry>();

function cacheGet(key: string): string | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  // refresh LRU position
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
}

function cachePut(key: string, value: string): void {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

export function cacheKey(opts: CascadeOpts): string {
  // Stable hash of the inputs that affect output. For streaming we skip the
  // cache — chunks would defeat the point.
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const systemSize = opts.messages.find((m) => m.role === "system")?.content.length ?? 0;
  return [
    opts.jsonMode ? "json" : "txt",
    opts.maxTokens ?? 1500,
    lastUser,
    systemSize,
  ].join("|");
}

// ----------------------------------------------------------------------------
// Workers AI invocation. Single model, one shot.
// ----------------------------------------------------------------------------

type WorkerEnv = {
  AI: Ai;
  MODEL: string;
  MODEL_CASCADE?: string;
  OPENROUTER_API_KEY?: string;
  MAX_TOKENS?: string;
  CASCADE_TIMEOUT_MS?: string;
};

declare global {
  // Cloudflare Workers types (re-declared here so the file compiles without
  // importing @cloudflare/workers-types)
  interface Ai {
    run(
      model: string,
      input: Record<string, unknown>
    ): Promise<unknown>;
  }
}

function cfModels(env: WorkerEnv): string[] {
  // env.MODEL is the primary. The cascade env var (if set) overrides the rest.
  if (env.MODEL_CASCADE) {
    try {
      const parsed = JSON.parse(env.MODEL_CASCADE) as unknown;
      if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
        return parsed as string[];
      }
    } catch {
      // fall through to defaults
    }
  }
  const primary = env.MODEL || DEFAULT_CF_CASCADE[0];
  return [primary, ...DEFAULT_CF_CASCADE.filter((m) => m !== primary)];
}

async function callCf(
  env: WorkerEnv,
  model: string,
  opts: CascadeOpts,
  signal: AbortSignal
): Promise<string> {
  const input: Record<string, unknown> = {
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? (Number(env.MAX_TOKENS) || 1500),
    temperature: opts.temperature ?? 0.4,
  };
  if (opts.jsonMode) input.response_format = { type: "json_object" };

  const out = (await env.AI.run(model, input)) as { response?: string };
  if (typeof out?.response === "string") return out.response;
  throw new Error(`cf ${model} returned no response field`);
}

async function callCfStream(
  env: WorkerEnv,
  model: string,
  opts: CascadeOpts,
  signal: AbortSignal
): Promise<ReadableStream<Uint8Array>> {
  // Workers AI streams return a ReadableStream of SSE `data: {...}` chunks.
  // The frontend already knows how to parse that shape, so we pass it through.
  const input: Record<string, unknown> = {
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? (Number(env.MAX_TOKENS) || 1500),
    temperature: opts.temperature ?? 0.4,
    stream: true,
  };
  const stream = (await env.AI.run(model, input)) as ReadableStream<Uint8Array>;
  return stream;
}

// ----------------------------------------------------------------------------
// Cascade runner
// ----------------------------------------------------------------------------

export async function runCascade(
  env: WorkerEnv,
  opts: CascadeOpts
): Promise<CascadeResult> {
  const timeoutMs = opts.timeoutMs ?? (Number(env.CASCADE_TIMEOUT_MS) || 12000);
  const tried: TierAttempt[] = [];

  // Cache only matters for non-streaming JSON/text completions
  let cacheK: string | null = null;
  if (!opts.stream) {
    cacheK = cacheKey(opts);
    const hit = cacheGet(cacheK);
    if (hit !== null) return { text: hit, model: "cache", source: "cf", cacheHit: true };
  }

  // 1. CF cascade
  for (const model of cfModels(env)) {
    const start = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const text = opts.stream
        ? "" // streaming handled separately below
        : await callCf(env, model, opts, ctrl.signal);
      clearTimeout(timer);
      if (!opts.stream) {
        tried.push({ model, source: "cf", status: "ok", durationMs: Date.now() - start });
        if (cacheK) cachePut(cacheK, text);
        return { text, model, source: "cf", cacheHit: false };
      }
      // streaming path
      const stream = await callCfStream(env, model, opts, ctrl.signal);
      clearTimeout(timer);
      tried.push({ model, source: "cf", status: "ok", durationMs: Date.now() - start });
      return { text: stream, model, source: "cf", cacheHit: false };
    } catch (err) {
      clearTimeout(timer);
      const status = (err as Error)?.name === "AbortError" ? "timeout" : "error";
      tried.push({
        model,
        source: "cf",
        status,
        error: (err as Error)?.message?.slice(0, 120),
        durationMs: Date.now() - start,
      });
      // continue to next model
    }
  }

  // 2. OpenRouter cascade (if key is configured)
  if (env.OPENROUTER_API_KEY) {
    for (const model of DEFAULT_OPENROUTER_CASCADE) {
      const start = Date.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        if (opts.stream) {
          const stream = await openRouterStream({
            apiKey: env.OPENROUTER_API_KEY,
            model,
            messages: opts.messages,
            jsonMode: opts.jsonMode,
            maxTokens: opts.maxTokens,
            temperature: opts.temperature,
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          tried.push({ model, source: "openrouter", status: "ok", durationMs: Date.now() - start });
          return { text: stream, model, source: "openrouter", cacheHit: false };
        } else {
          const text = await openRouterComplete({
            apiKey: env.OPENROUTER_API_KEY,
            model,
            messages: opts.messages,
            jsonMode: opts.jsonMode,
            maxTokens: opts.maxTokens,
            temperature: opts.temperature,
            signal: ctrl.signal,
          });
          clearTimeout(timer);
          if (!text) throw new Error("empty response");
          tried.push({ model, source: "openrouter", status: "ok", durationMs: Date.now() - start });
          if (cacheK) cachePut(cacheK, text);
          return { text, model, source: "openrouter", cacheHit: false };
        }
      } catch (err) {
        clearTimeout(timer);
        const status = (err as Error)?.name === "AbortError" ? "timeout" : "error";
        tried.push({
          model,
          source: "openrouter",
          status,
          error: (err as Error)?.message?.slice(0, 120),
          durationMs: Date.now() - start,
        });
      }
    }
  }

  const err = new Error(
    `All cascade tiers failed: ${tried.map((t) => `${t.model}(${t.status})`).join(", ")}`
  );
  (err as Error & { tried?: TierAttempt[] }).tried = tried;
  throw err;
}

export function cascadeHealth(env: WorkerEnv) {
  return {
    cf: cfModels(env),
    openrouter: Boolean(env.OPENROUTER_API_KEY),
    openrouterModels: DEFAULT_OPENROUTER_CASCADE,
    cacheSize: cache.size,
  };
}