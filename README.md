# Quantara (base)
live:https://quantara-web-sooty.vercel.app/quiz
<img width="1280" height="715" alt="image" src="https://github.com/user-attachments/assets/2d16089b-b87f-4529-b6c6-b4335338dce7" />

<img width="1162" height="715" alt="image" src="https://github.com/user-attachments/assets/6eb83dfd-c69b-424a-8b0c-6b08bb0d7997" />
<img width="1280" height="715" alt="image" src="https://github.com/user-attachments/assets/8ef8807d-04fd-4839-9511-957ac43a7b41" />



```
quantara/
  worker/          Cloudflare Worker (Workers AI backend) <- multi-model cascade
  web/             Next.js frontend (IndexedDB-backed)
  .private/        Local-only files (PUKU_PROMPT.md, CLAUDE.md) — gitignored
```

## Run the Worker
```bash
cd worker
npm install
npx wrangler login
npm run dev          # http://localhost:8787
npm run deploy
```

Optional: add an OpenRouter fallback key so the cascade keeps working when
Workers AI is degraded:
```bash
npx wrangler secret put OPENROUTER_API_KEY
```

## Run the frontend
```bash
cd web
npm install
NEXT_PUBLIC_API_URL=http://localhost:8787 npm run dev
```

Open http://localhost:3000

For Vercel, set `NEXT_PUBLIC_API_URL` to the deployed Worker origin. The Worker
must allow the exact frontend origin in `ALLOWED_ORIGIN` or the comma-separated
`ALLOWED_ORIGINS` variable. Localhost and loopback origins are permitted for
local development; other origins are not reflected in CORS responses.

## Deploy the frontend to Vercel

This repository keeps the Next.js app in `web/`. Set the Vercel project's
**Root Directory** to `web` (Settings → Build and Deployment → Root Directory)
and leave the framework preset as Next.js. The install and build commands can
use their defaults. If Vercel runs its Next.js build from the repository root,
it will fail because the root does not contain the app's `app/` directory.

## App pages
- /explore
- /chat
- /quiz
- /flashcards
- /vocab
- /grammar
- /exam
- /progress
- /admin

## Background image
The web app uses `web/public/new-bg.jpg` as the source image and serves responsive WebP variants (`new-bg-828.webp` for narrow screens and `new-bg-1920.webp` for larger screens). The desktop variant is enlarged from the supplied source, so a higher-resolution original is recommended for sharper results on large or high-density displays.

## API contract
All backend routes are POST JSON calls to the worker:

- /api/chat (SSE stream)
- /api/quiz/mcq
- /api/quiz/passage
- /api/flashcards
- /api/vocab
- /api/grammar
- /api/exam/generate
- /api/exam/grade

Add `"lang": "bn"` to requests for Bengali responses.
Add `"difficulty": "easy" | "medium" | "hard"` (default `"medium"`) to tune
the generator — easy means recall-level / simple examples, hard means
near-miss distractors and inference depth.

## Multi-model cascade
Every generation request runs through a tiered cascade. If a model 4xx/5xx
or times out (12s), the cascade falls through to the next tier, ending with
OpenRouter if a key is configured.

Default order (configurable via the `MODEL_CASCADE` var in `wrangler.jsonc`):

| Tier | Model                                         | Source     |
|------|-----------------------------------------------|------------|
| 1    | `@cf/meta/llama-3.3-70b-instruct-fp8-fast`    | Workers AI |
| 2    | `@cf/meta/llama-4-scout-17b-16e-instruct`     | Workers AI |
| 3    | `@cf/qwen/qwen2.5-coder-32b-instruct`         | Workers AI |
| 4    | `@cf/openai/gpt-oss-120b`                     | Workers AI |
| 5    | `meta-llama/llama-3.3-70b-instruct:free`      | OpenRouter |
| 6    | `qwen/qwen-2.5-72b-instruct:free`             | OpenRouter |
| 7    | `deepseek/deepseek-chat`                      | OpenRouter |

A small in-memory LRU (200 entries, 10 min TTL) plus a Cloudflare KV
namespace `CACHE` (10 min TTL by default) caches identical non-stream
completions. KV survives isolate restarts and is shared across all
isolates, so a hit on one edge serves every other edge. The response
header `X-Cache: HIT|MISS` tells the frontend whether a model was used
or the cache served the request. Visit `/health` on the worker for the
live cascade + cache configuration.

If every tier fails the worker returns `503` with `{ error, tried: [...] }`
so the frontend can show a clean toast and the user can retry.

## Caching (production)

KV namespace `CACHE` holds the durable cache (`expirationTtl` configurable via
`vars.CACHE_TTL_S`, default `600`). Keys are SHA-256 of the user message +
system prompt length + `jsonMode` + `maxTokens`, so they stay under the 512
byte KV key cap regardless of payload size. Streams are not cached — chunked
output would defeat the point.

The cache key has the form `q:<hex>`. To invalidate a single entry manually:

```bash
npx wrangler kv key delete --namespace-id=<CACHE_ID> "q:<hex>"
```

To see what's currently cached, list keys (note: KV lists keys but never
values for security):

```bash
npx wrangler kv key list --namespace-id=<CACHE_ID> --prefix=q:
```

## Rate limiting

KV namespace `RATE` backs a per-IP fixed-window rate limiter on every
`/api/*` route. Default budget is **60 requests/min + 20 burst = 80
requests/min per IP**. Above that, the worker returns `429` with
`{ error, retryAfterSeconds }` and a `Retry-After` header. The frontend
(`web/lib/api.ts`) surfaces this as a toast and waits `retryAfterSeconds`
before retrying.

The limiter uses a module-scope counter for in-isolate atomicity (single-
threaded JS), with the KV count as a cross-isolate floor. **Caveat:** a
client hammering from a botnet that fans out across Cloudflare's edge
isolates can exceed the per-isolate cap; for true global enforcement,
add Cloudflare's Rate Limiting Rules product or a Durable Object as a
singleton counter. For ordinary user traffic the per-isolate limit holds.

Configure via `wrangler.jsonc`:
```jsonc
"RATE_LIMIT_PER_MIN": "60",
"RATE_BURST": "20"
```

## Provider limits

- **Workers AI free tier**: 10,000 Neurons / day per account. The cascade
  uses multi-model fallback, but every request still costs Neurons — at
  ~5K active users × ~10 generations/day you'll burn through the free
  tier quickly. Upgrade to the **Workers Paid plan ($5/mo)** for higher
  Neuron allocations before public launch, or switch `MODEL` to the
  cheapest cascade (`gpt-oss-120b`) until traffic justifies it.
- **OpenRouter free models** (`*-free`): hard cap of **20 requests/min** per
  IP. The cascade only falls through to free models when all Workers AI
  tiers fail, so this only matters during a Cloudflare outage — but expect
  visible 429s from OpenRouter in that case.
- **OpenRouter paid models** (`deepseek/deepseek-chat` in the cascade):
  pay-per-token, no per-minute cap. The cascade tries free tiers first,
  paid only if all free tiers fail.

## Difficulty system
`easy` / `medium` / `hard` is wired through every generator that benefits
from it:

- **MCQ quiz** — easy: distractors obviously wrong. Medium: plausible with
  subtle error. Hard: near-miss alternatives that need the rule to
  disambiguate.
- **Passage questions** — easy: literal recall. Medium: combine two
  sentences. Hard: inference / author intent.
- **Flashcards** — easy: definition + 1 example. Medium: + antonym / related
  term. Hard: + edge case + common misconception.
- **Vocabulary** — easy: cognate-friendly examples. Medium: typical
  collocations. Hard: idiomatic / nuanced usage.
- **Grammar** — CEFR level still drives the explanation; difficulty tunes
  the practice items (fill-in / error-correction / transformation).
- **Tutor chat** — easy: define every term. Hard: assume domain knowledge.
- **Exam** — same as MCQ quiz.

## Exam page UX
- Choose the timer in minutes (`5, 10, 15, 20, 30, 45, 60`). The choice is
  persisted to localStorage and the countdown reflects it immediately.
- Auto-submit when the timer hits zero.
- The last exam's score, verdict, and weak topics are written to IndexedDB
  so the `/progress` page (and analytics) can read them later.

## Client storage
- **In-memory cache** (`lib/storage.ts`, `lib/db.ts`) — fast first read for
  React state.
- **IndexedDB** (db `quantara`, stores `chats / decks / vocab / grammar /
  exams / progress / meta`) — durable, large-capacity store. Writes are
  serialized per store to avoid IDB deadlocks.
- **localStorage** — synchronous fallback so first paint can show the last
  state before the IDB connection opens. IDB is treated as the source of
  truth on subsequent loads.
- Reads use `readStorage`/`readStorageAsync`; writes use
  `writeStorage`/`writeStorageAsync`. The async variants prefer IDB.
- Graceful degradation: if IndexedDB is unavailable (private mode, very old
  browser), reads return the localStorage value and the user keeps working.
