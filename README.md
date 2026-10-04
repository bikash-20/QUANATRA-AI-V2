# Quantara (base)

```
quantara/
  worker/          Cloudflare Worker (Workers AI backend) <- multi-model cascade
  web/             Next.js frontend (IndexedDB-backed)
  PUKU_PROMPT.md   Paste into Puku CLI to build the Next.js frontend
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

A small in-memory LRU (200 entries, 10 min TTL) caches identical non-stream
completions per the `X-Cache: HIT|MISS` response header. Visit `/health` on
the worker for the live cascade configuration.

If every tier fails the worker returns `503` with `{ error, tried: [...] }`
so the frontend can show a clean toast and the user can retry.

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