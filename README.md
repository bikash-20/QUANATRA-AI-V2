# Quantara

> **An AI tutor for CS, math, physics, GRE prep, and code — turning complex ideas into interactive practice, instant explanations, and daily progress.**
>
> Live app: <https://quantara-web-sooty.vercel.app/quiz>

<img width="1280" height="715" alt="Quantara home" src="https://github.com/user-attachments/assets/2d16089b-b87f-4529-b6c6-b4335338dce7" />

<img width="1162" height="715" alt="Quantara feature" src="https://github.com/user-attachments/assets/6eb83dfd-c69b-424a-8b0c-6b08bb0d7997" />
<img width="1280" height="715" alt="Quantara feature" src="https://github.com/user-attachments/assets/8ef8807d-04fd-4839-9511-957ac43a7b41" />

---

## Table of contents

1. [What Quantara is](#what-quantara-is)
2. [Why Quantara — benefits for users](#why-quantara--benefits-for-users)
3. [Feature tour](#feature-tour)
   - [GRE prep module](#gre-prep-module-the-big-one)
   - [Tutor chat](#tutor-chat)
   - [MCQ quiz](#mcq-quiz)
   - [Passage quiz](#passage-quiz)
   - [Flashcards](#flashcards)
   - [Vocabulary](#vocabulary)
   - [Grammar](#grammar)
   - [Mock exam](#mock-exam)
   - [Progress dashboard](#progress-dashboard)
   - [Admin panel](#admin-panel)
4. [Content corpus at a glance](#content-corpus-at-a-glance)
5. [Tech stack](#tech-stack)
6. [Repository layout](#repository-layout)
7. [Run the worker](#run-the-worker)
8. [Run the frontend](#run-the-frontend)
9. [Deploy to Vercel](#deploy-to-frontend-on-vercel)
10. [API contract](#api-contract)
11. [Multi-model cascade](#multi-model-cascade)
12. [Caching, rate limits, and provider limits](#caching-rate-limits-and-provider-limits)
13. [Difficulty system](#difficulty-system)
14. [Client storage and offline behaviour](#client-storage-and-offline-behaviour)
15. [GRE content pipeline (validator-driven)](#gre-content-pipeline-validator-driven)
16. [Background image and theming](#background-image-and-theming)

---

## What Quantara is

Quantara is a **multi-subject AI tutoring web app** that combines:

- A **structured, hand-curated GRE prep module** (1,600 quantitative questions + 1,500 vocabulary words, all balanced across difficulty tiers and topics, all rendered with LaTeX math)
- A **conversational tutor** with streaming answers, multi-model fallback, and Bengali support
- A **suite of generative practice tools** (MCQ quiz, passage quiz, flashcards, vocab, grammar, mock exam)
- A **local-first progress dashboard** powered by IndexedDB — every attempt, every mock, every word you tick is yours, on your device

The whole stack is open, deployable on Vercel + Cloudflare, and designed so the **frontend degrades gracefully** when the backend is rate-limited or offline (cached content keeps working; local storage keeps saving).

---

## Why Quantara — benefits for users

Quantara is built around six concrete user benefits:

| Benefit | How Quantara delivers |
|---|---|
| **Practice at scale without repetition** | 1,600 hand-curated quant questions across 5 topics × 15 shards, plus 1,500 vocab words in 60 sets of 25. The corpus is big enough that most learners won't see the same question twice in a single study month. |
| **Hard-GRE realism** | All quant stems are written in actual GRE style — MCQ with 5 options, multi-select, quantitative comparison (Quantity A vs B), and numeric entry — exactly the four formats ETS uses. Vocab is curated from high-frequency GRE word lists across three difficulty tiers. |
| **Math you can actually read** | Every equation, fraction, exponent, and comparison is rendered with KaTeX in the question stem, choices, and explanation. No "x^2" looking like plain text; you see `(x-3)^2 + 4`, `\|x - 5\|`, `2^{x+1}`, real GRE-grade notation. |
| **Progress that doesn't lie to you** | Every attempt is written to IndexedDB. Accuracy on the dashboard uses your **first** attempt per question (per the spec), so review attempts don't artificially inflate your score. Weak subtopics are computed from real data, not vibes. |
| **Resilient to backend outages** | The frontend reads content from a manifest that ships with the app. Mock questions, vocab, the 4-week roadmap, and your prior progress all keep working even when the worker is down. Cached generations stay cached in Cloudflare KV for 10 minutes by default. |
| **Bengali + English** | Every backend route accepts a `"lang": "bn"` field. Chat, quiz, flashcards, vocab, grammar, and exam all switch seamlessly between languages. |

The cumulative effect: **a learner can install the app, work through the 4-week roadmap, finish 200+ problems, learn 200+ words, and review their actual weak spots — all without an account, all without sending their data to anyone.**

---

## Feature tour

### GRE prep module (the big one)

This is the centrepiece. Quantara ships a complete, validator-driven GRE content system.

**For AI coding agents:** before changing GRE routes, content, schemas, quiz/mock logic, progress, or explanations, read the [GRE system and contribution guide](web/docs/GRE-SYSTEM.md).

| | |
|---|---|
| **Quant topics** | Arithmetic & Number Properties, Algebra, Geometry, Data Analysis/Probability/Counting, Word Problems |
| **Subtopics** | 5–6 per topic — percent, ratio, number-properties, exponents, divisibility, primes; linear-equations, quadratics, inequalities, exponents-equations, absolute-value; circles, triangles, area, coordinate-geometry; statistics, probability, counting; rate, work, interest, mixtures, percent-change, average-speed |
| **Question count** | **1,600 total** (arithmetic 325, algebra 300, data-analysis 325, geometry 325, word-problems 325) across 75 shards |
| **Question types** | MCQ (5 choices), multi-select, quantitative comparison (Quantity A vs B), numeric entry — exactly ETS's four formats |
| **Difficulty** | Easy / Medium / Hard — balanced across every shard (~25% / 50% / 25%) |
| **Vocab** | **1,500 words** in 60 sets of 25 across 3 tiers (Hard / Harder / Hardest) |
| **Math rendering** | KaTeX in stems, choices, quantities, and AI explanations |
| **Progress** | First-attempt accuracy per question, weak subtopics, status (new / correct / wrong / bookmarked), vocab status (new / learning / known), mock history, daily streak |

GRE routes:
- `/gre` — hub
- `/gre/quant` — topic grid
- `/gre/quant/[topic]` — Learn notes + filterable problem list (by difficulty, type, subtopic, status, bookmark, free-text search)
- `/gre/quant/problem/[id]` — single problem solver with AI explanation
- `/gre/quant/mock` — 12-question, 21-minute timed mock (3 easy / 5 medium / 4 hard), no answers until submit, refresh resumes from IndexedDB
- `/gre/vocab` — set grid (60 sets)
- `/gre/vocab/[set]` — word table with status toggles and quiz mode
- `/gre/vocab/[set]/quiz` — vocab quiz
- `/gre/vocab/word/[id]` — single word detail
- `/gre/roadmap` — 4-week day-by-day checklist with persistent ticks
- `/gre/progress` — full progress dashboard

### Tutor chat

`/chat` is a streaming, multi-turn tutor conversation.

- Server-Sent Events streaming for instant first-token latency
- Local conversation history (IndexedDB) — your chats survive reload
- **New chat** event resets the conversation
- **Bengali / English** language toggle (also applies to all other generators)
- **Stop / regenerate** via AbortController
- Glassmorphic UI with Framer Motion entrance animations

### MCQ quiz

`/quiz` (mode: **MCQ**) — pick a topic, a count, and a difficulty; the worker generates fresh MCQ questions. Each question shows:

- Stem with KaTeX
- 4 options
- Immediate answer reveal with AI explanation
- First-attempt-correctness tracked to your progress store

### Passage quiz

`/quiz` (mode: **Passage**) — paste or edit a passage (default: a binary-tree explainer), pick a difficulty, get multiple-choice questions that actually test comprehension of *your* passage. AI explanations cite the passage line.

### Flashcards

`/flashcards` — generate a deck of flashcards on any topic, flip to reveal the back. Difficulty controls whether the back is just a definition (easy) or includes an edge case and a common misconception (hard). Decks persist in IndexedDB across reloads.

### Vocabulary

`/vocab` — generate vocab flashcards for any topic. Same persistence and difficulty ladder as flashcards.

### Grammar

`/grammar` — CEFR-driven grammar practice. Difficulty tunes the practice items (fill-in / error-correction / transformation); explanations stay anchored to your CEFR level.

### Mock exam

`/exam` — full timed exam.

- Pick a timer (`5, 10, 15, 20, 30, 45, 60` minutes); choice persists in localStorage
- Auto-submit when the timer hits zero
- Last exam's score, verdict, and weak topics written to IndexedDB so `/progress` can read them

### Progress dashboard

`/progress` — global view of everything you've done. Reads from IndexedDB and shows:

- Accuracy per topic
- Weak subtopics
- Vocab status counts
- Mock history
- Daily streak

### Admin panel

`/admin` — internal tooling for inspecting app caches, KV state, and generation logs.

---

## Content corpus at a glance

| | Count | Where it lives |
|---|---:|---|
| Quant questions | **1,600** | `web/content/gre/quant/<topic>/<topic>-{01..15}.json` (75 shards × 20) |
| Vocab words | **1,500** | `web/content/gre/vocab/set-{01..60}.json` (60 sets × 25) |
| Manifest | auto-generated | `web/content/gre/manifest.json` + mirror at `web/public/gre-data/manifest.json` |
| Roadmap | 4 weeks × 7 days | `web/content/gre/roadmap.json` |
| Notes | per-topic | `web/content/gre/notes/<topic>.md` |
| Schema | source of truth | `web/content/gre/schema.ts` |

Every shard validates against the schema (`webpack/scripts/validate-gre.mjs`) on every build; the manifest is regenerated automatically.

---

## Tech stack

- **Frontend** — Next.js 16 (App Router), React 19, TypeScript strict
- **Styling** — Tailwind CSS, Framer Motion (LazyMotion + domAnimation), `glass-surface` design system
- **Math** — `rehype-katex` + `remark-math`, async-imported so first paint isn't blocked
- **Storage** — IndexedDB (source of truth) + localStorage (synchronous fallback for first paint)
- **State** — per-URL fetch on server components, client islands hydrate from IDB
- **Backend** — Cloudflare Worker (TypeScript) using the Workers AI binding
- **AI** — multi-model cascade: Workers AI tiers → OpenRouter free → OpenRouter paid (see [Multi-model cascade](#multi-model-cascade))
- **Cache** — Cloudflare KV namespace `CACHE` (10 min TTL by default) + per-isolate LRU
- **Rate limit** — per-IP fixed window via KV namespace `RATE` (60 req/min + 20 burst)
- **Hosting** — Vercel (frontend) + Cloudflare Workers (backend)

---

## Repository layout

```
quantara/
  worker/          Cloudflare Worker (Workers AI backend) <- multi-model cascade
  web/             Next.js frontend (IndexedDB-backed)
  web/content/     Static GRE content (manifest, vocab, quant shards, notes, roadmap)
  web/scripts/     validate-gre.mjs — regenerates manifest.json from content shards
  web/public/      Static mirror of the manifest for offline-friendly delivery
  docs/            Project documentation
  .private/        Local-only files — gitignored
  vercel.json      Vercel project config
```

---

## Run the worker

```bash
cd worker
npm install
npx wrangler login
npm run dev          # http://localhost:8787
npm run deploy
```

Optional: add an OpenRouter fallback key so the cascade keeps working when Workers AI is degraded:

```bash
npx wrangler secret put OPENROUTER_API_KEY
```

Visit `/health` on the worker for the live cascade + cache configuration.

---

## Run the frontend

```bash
cd web
npm install
NEXT_PUBLIC_API_URL=http://localhost:8787 npm run dev
```

Open <http://localhost:3000>.

For Vercel, set `NEXT_PUBLIC_API_URL` to the deployed Worker origin. The Worker must allow the exact frontend origin in `ALLOWED_ORIGIN` or the comma-separated `ALLOWED_ORIGINS` variable. Localhost and loopback origins are permitted for local development; other origins are not reflected in CORS responses.

## Auth (Google OAuth)

The frontend ships with two adapters selected at build time:

- `DevAuthAdapter` (default) — a localStorage mock used while you
  develop. The login button creates a fake "Quantara learner"
  session.
- `GoogleAuthAdapter` — drives a real Google OAuth 2.0 flow against
  `/api/auth/google` → Google consent → `/api/auth/callback`. The
  server mints a signed HttpOnly session cookie.

Switch with `NEXT_PUBLIC_AUTH_ENABLED=true` and supply these server-only
env vars (see [`web/.env.example`](web/.env.example) for the full list):

```env
NEXT_PUBLIC_AUTH_ENABLED=true
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
AUTH_REDIRECT_URI=https://your-domain.example/api/auth/callback
SESSION_SECRET=$(openssl rand -hex 32)
# Optional: promote specific Google accounts to admin.
AUTH_ADMIN_EMAILS=you@gmail.com
```

See [`docs/AUTH.md`](docs/AUTH.md) for the full setup checklist,
security notes, and adapter API.

---

## Deploy to frontend on Vercel

This repository keeps the Next.js app in `web/`. Set the Vercel project's **Root Directory** to `web` (Settings → Build and Deployment → Root Directory) and leave the framework preset as Next.js. The install and build commands can use their defaults. If Vercel runs its Next.js build from the repository root, it will fail because the root does not contain the app's `app/` directory.

---

## API contract

All backend routes are POST JSON calls to the worker:

- `/api/chat` (SSE stream)
- `/api/quiz/mcq`
- `/api/quiz/passage`
- `/api/flashcards`
- `/api/vocab`
- `/api/grammar`
- `/api/exam/generate`
- `/api/exam/grade`

Add `"lang": "bn"` to requests for Bengali responses.
Add `"difficulty": "easy" | "medium" | "hard"` (default `"medium"`) to tune the generator — easy means recall-level / simple examples, hard means near-miss distractors and inference depth.

---

## Multi-model cascade

Every generation request runs through a tiered cascade. If a model 4xx/5xx or times out (12s), the cascade falls through to the next tier, ending with OpenRouter if a key is configured.

Default order (configurable via the `MODEL_CASCADE` var in `wrangler.jsonc`):

| Tier | Model | Source |
|---:|---|---|
| 1 | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Workers AI |
| 2 | `@cf/meta/llama-4-scout-17b-16e-instruct` | Workers AI |
| 3 | `@cf/qwen/qwen2.5-coder-32b-instruct` | Workers AI |
| 4 | `@cf/openai/gpt-oss-120b` | Workers AI |
| 5 | `meta-llama/llama-3.3-70b-instruct:free` | OpenRouter |
| 6 | `qwen/qwen-2.5-72b-instruct:free` | OpenRouter |
| 7 | `deepseek/deepseek-chat` | OpenRouter |

A small in-memory LRU (200 entries, 10 min TTL) plus a Cloudflare KV namespace `CACHE` (10 min TTL by default) caches identical non-stream completions. KV survives isolate restarts and is shared across all isolates, so a hit on one edge serves every other edge. The response header `X-Cache: HIT|MISS` tells the frontend whether a model was used or the cache served the request. Visit `/health` on the worker for the live cascade + cache configuration.

If every tier fails the worker returns `503` with `{ error, tried: [...] }` so the frontend can show a clean toast and the user can retry.

---

## Caching, rate limits, and provider limits

### KV cache (production)

KV namespace `CACHE` holds the durable cache (`expirationTtl` configurable via `vars.CACHE_TTL_S`, default `600`). Keys are SHA-256 of the user message + system prompt length + `jsonMode` + `maxTokens`, so they stay under the 512 byte KV key cap regardless of payload size. Streams are not cached — chunked output would defeat the point.

The cache key has the form `q:<hex>`. To invalidate a single entry manually:

```bash
npx wrangler kv key delete --namespace-id=<CACHE_ID> "q:<hex>"
```

To see what's currently cached, list keys (note: KV lists keys but never values for security):

```bash
npx wrangler kv key list --namespace-id=<CACHE_ID> --prefix=q:
```

### Rate limiting

KV namespace `RATE` backs a per-IP fixed-window rate limiter on every `/api/*` route. Default budget is **60 requests/min + 20 burst = 80 requests/min per IP**. Above that, the worker returns `429` with `{ error, retryAfterSeconds }` and a `Retry-After` header. The frontend (`web/lib/api.ts`) surfaces this as a toast and waits `retryAfterSeconds` before retrying.

The limiter uses a module-scope counter for in-isolate atomicity (single-threaded JS), with the KV count as a cross-isolate floor. **Caveat:** a client hammering from a botnet that fans out across Cloudflare's edge isolates can exceed the per-isolate cap; for true global enforcement, add Cloudflare's Rate Limiting Rules product or a Durable Object as a singleton counter. For ordinary user traffic the per-isolate limit holds.

Configure via `wrangler.jsonc`:

```jsonc
"RATE_LIMIT_PER_MIN": "60",
"RATE_BURST": "20"
```

### Provider limits

- **Workers AI free tier**: 10,000 Neurons / day per account. The cascade uses multi-model fallback, but every request still costs Neurons — at ~5K active users × ~10 generations/day you'll burn through the free tier quickly. Upgrade to the **Workers Paid plan ($5/mo)** for higher Neuron allocations before public launch, or switch `MODEL` to the cheapest cascade (`gpt-oss-120b`) until traffic justifies it.
- **OpenRouter free models** (`*-free`): hard cap of **20 requests/min** per IP. The cascade only falls through to free models when all Workers AI tiers fail, so this only matters during a Cloudflare outage — but expect visible 429s from OpenRouter in that case.
- **OpenRouter paid models** (`deepseek/deepseek-chat` in the cascade): pay-per-token, no per-minute cap. The cascade tries free tiers first, paid only if all free tiers fail.

---

## Difficulty system

`easy` / `medium` / `hard` is wired through every generator that benefits from it:

- **MCQ quiz** — easy: distractors obviously wrong. Medium: plausible with subtle error. Hard: near-miss alternatives that need the rule to disambiguate.
- **Passage questions** — easy: literal recall. Medium: combine two sentences. Hard: inference / author intent.
- **Flashcards** — easy: definition + 1 example. Medium: + antonym / related term. Hard: + edge case + common misconception.
- **Vocabulary** — easy: cognate-friendly examples. Medium: typical collocations. Hard: idiomatic / nuanced usage.
- **Grammar** — CEFR level still drives the explanation; difficulty tunes the practice items (fill-in / error-correction / transformation).
- **Tutor chat** — easy: define every term. Hard: assume domain knowledge.
- **Exam** — same as MCQ quiz.

For the GRE module, every question is **hand-curated with a difficulty tag**, and the manifest reports the count at each tier per topic.

---

## Client storage and offline behaviour

- **In-memory cache** (`lib/storage.ts`, `lib/db.ts`) — fast first read for React state.
- **IndexedDB** (db `quantara`, stores `chats / decks / vocab / grammar / exams / progress / meta`) — durable, large-capacity store. Writes are serialized per store to avoid IDB deadlocks.
- **localStorage** — synchronous fallback so first paint can show the last state before the IDB connection opens. IDB is treated as the source of truth on subsequent loads.
- Reads use `readStorage`/`readStorageAsync`; writes use `writeStorage`/`writeStorageAsync`. The async variants prefer IDB.
- Graceful degradation: if IndexedDB is unavailable (private mode, very old browser), reads return the localStorage value and the user keeps working.
- GRE content is bundled with the app, so **the entire GRE module (1,600 questions + 1,500 words + roadmap + notes) works fully offline**. Generative features (chat, AI explanations on quiz answers, dynamic exam generation) need network.

---

## GRE content pipeline (validator-driven)

The GRE module is built around a single invariant: **every question that ships must match `web/content/gre/schema.ts`**, and the manifest is always regenerated from those validated shards.

1. Authoring scripts write per-topic shards (e.g. `algebra-11.json`) of 20 questions each.
2. `npm run gre:validate` (which runs `web/scripts/validate-gre.mjs`) checks:
   - ID format (`q-[a-z]{3}-\d{3,}` for quant, `v-\d{4,}` for vocab)
   - Choice count (MCQ has exactly 5; multi-select has at least 1 valid index)
   - Numeric answers are finite
   - QC answers are `A|B|C|D`
   - Vocab examples contain a recognisable needle of the word
   - No duplicate IDs across shards
   - Per-topic / per-tier counts are sane
3. On success, the validator writes a fresh `web/content/gre/manifest.json` with totals per topic, difficulty breakdown, and shard counts.
4. `web/public/gre-data/manifest.json` is mirrored via `cp` for offline-friendly delivery.
5. The loader (`web/features/gre/content/loader.ts`) reads the manifest at request time; nothing in the app hardcodes shard or set counts.

To add more content: write more shards matching the schema, re-run the validator, mirror the manifest, redeploy. No code changes required.

---

## Background image and theming

The web app uses `web/public/new-bg.jpg` as the source image and serves responsive WebP variants (`new-bg-828.webp` for narrow screens and `new-bg-1920.webp` for larger screens). The desktop variant is enlarged from the supplied source, so a higher-resolution original is recommended for sharper results on large or high-density displays.

---

## License & credits

This is a Quantara project. All curated GRE content (questions, words, examples, notes) is hand-authored; AI is used only to generate explanations on demand, never to author the underlying corpus.