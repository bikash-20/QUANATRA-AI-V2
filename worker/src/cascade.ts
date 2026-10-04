// Multi-model cascade with an in-memory LRU cache backed by Cloudflare KV.
// Tries models in order until one returns text. Used for every generation
// endpoint so a single model outage can't take down a feature.

import { openRouterComplete, openRouterStream } from "./openrouter";
import { cacheGetJSON, cachePutJSON } from "./kv";

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
// Tiny LRU cache, isolate-scoped, backed by Cloudflare KV (durable).
//   - Memory is the first hit (zero-latency).
//   - KV is the second hit (cross-isolate, survives restarts).
//   - Writes populate both layers.
// ----------------------------------------------------------------------------

type CacheEntry = { value: string; expires: number };
const CACHE_MAX = 200;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, CacheEntry>();

function memGet(key: string): string | null {
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

function memPut(key: string, value: string): void {
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

async function cacheRead(env: WorkerEnv, key: string): Promise<string | null> {
  const mem = memGet(key);
  if (mem !== null) return mem;
  const kvHit = await cacheGetJSON(env.CACHE, key);
  if (kvHit !== null) {
    memPut(key, kvHit); // warm memory for next time
  }
  return kvHit;
}

async function cacheWrite(env: WorkerEnv, key: string, value: string): Promise<void> {
  memPut(key, value);
  const ttlS = Number(env.CACHE_TTL_S) || 600;
  await cachePutJSON(env.CACHE, key, value, ttlS);
}

export async function cacheKey(opts: CascadeOpts): Promise<string> {
  // Stable hash of the inputs that affect output. For streaming we skip the
  // cache — chunks would defeat the point.
  const lastUser = [...opts.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const systemSize = opts.messages.find((m) => m.role === "system")?.content.length ?? 0;
  const raw = [
    opts.jsonMode ? "json" : "txt",
    String(opts.maxTokens ?? 1500),
    lastUser,
    String(systemSize),
  ].join("|");
  // KV caps keys at 512 bytes; messages can run longer. Hash to a fixed-size
  // hex string so the key stays well under the limit everywhere.
  return `q:${await sha256Hex(raw)}`;
}

// Tiny FNV-1a 64-bit hash + hex. Workers don't ship crypto.subtle cheaply on
// every call, and we only need a stable opaque key. Use the global crypto
// (SubtleCrypto) for proper SHA-256 when available; FNV-1a is a robust,
// dependency-free fallback for the in-memory LRU and for environments without it.
async function sha256Hex(s: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    const bytes = new Uint8Array(buf);
    let out = "";
    for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
    return out;
  } catch {
    // FNV-1a fallback
    let h = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    for (let i = 0; i < s.length; i++) {
      h ^= BigInt(s.charCodeAt(i));
      h = (h * prime) & 0xffffffffffffffffn;
    }
    return h.toString(16).padStart(16, "0");
  }
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
  CACHE?: KVNamespace;
  CACHE_TTL_S?: string;
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

  const out = (await env.AI.run(model, input)) as Record<string, unknown> | undefined;
  if (!out) throw new Error(`cf ${model} returned undefined`);

  // Workers AI native shape: { response: string }
  const nativeResp = (out as { response?: unknown }).response;
  if (typeof nativeResp === "string" && nativeResp.length > 0) return nativeResp;

  // OpenAI-compatible shape: { choices: [{ message: { content: string } }] }
  const choices = (out as { choices?: unknown }).choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as { message?: { content?: unknown } };
    const content = first?.message?.content;
    if (typeof content === "string" && content.length > 0) return content;
  }

  const keys = Object.keys(out).join(",");
  throw new Error(`cf ${model} returned no response (keys=[${keys}])`);
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
    cacheK = await cacheKey(opts);
    const hit = await cacheRead(env, cacheK);
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
        if (cacheK) await cacheWrite(env, cacheK, text);
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
      const message = (err as Error)?.message?.slice(0, 200) ?? String(err);
      console.error(`[quantara] cascade cf tier failed: ${model}: ${message}`);
      tried.push({
        model,
        source: "cf",
        status,
        error: message,
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
          if (cacheK) await cacheWrite(env, cacheK, text);
          return { text, model, source: "openrouter", cacheHit: false };
        }
      } catch (err) {
        clearTimeout(timer);
        const status = (err as Error)?.name === "AbortError" ? "timeout" : "error";
        const message = (err as Error)?.message?.slice(0, 200) ?? String(err);
        console.error(`[quantara] cascade openrouter tier failed: ${model}: ${message}`);
        tried.push({
          model,
          source: "openrouter",
          status,
          error: message,
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
    kvCache: Boolean(env.CACHE),
  };
}