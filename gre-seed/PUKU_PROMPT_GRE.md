# Task: add a GRE Prep module to Quantara (./web)

I am preparing for the GRE. Add GRE Quant and GRE Vocabulary practice to Quantara.
Core rule: **all questions and vocabulary come from static files in the codebase. AI is used ONLY for the "AI explain" toggle** (via the existing `/api/explain` and model cascade). No auth work. Reuse the existing design system, sidebar, theme, Markdown/KaTeX renderer, IndexedDB layer and Query setup. Keep the UI minimal.

Seed content is in `content/gre/` (copy this folder into `./web/content/gre/` and `scripts/validate-gre.mjs` into `./web/scripts/`). Read `schema.ts`, `taxonomy.json` and a sample of each file first. Do NOT edit the seed answers.

Content budget: design for **5,000 to 10,000 total items** (roughly 3,000+ vocab words and 2,000-6,000 quant questions) added over time. The seed has only 30 quant questions and 50 words, so everything must scale without code changes.

## 1. Content layer (the part that must scale)
- Files are the source of truth. Shard by topic and size: quant in `content/gre/quant/<topic>/<topic>-<nn>.json` (max about 200 items or 100 KB per file; move the 5 seed files into `<topic>/<topic>-01.json`), vocab in `content/gre/vocab/set-<nn>.json` (50 words per set, ordered easy to hard within the tier system). Update the validator paths accordingly.
- Never import content JSON into client components. Read it on the server only (`import "server-only"`, `fs` at build time/ISR, or generate static JSON under `public/gre-data/` and fetch lazily). The client receives only the shard/page it needs. Verify with the bundle report that content does not enter any First Load JS.
- A typed loader module `src/features/gre/content/` with: `getTopics()`, `getQuestionList(topic, filters, page)`, `getQuestion(id)`, `getVocabSets()`, `getVocabSet(n)`, `getWord(id)`. Parse with the zod schemas from `schema.ts` at load time on the server, cache results in memory per process, and fail the build on invalid content.
- `npm run gre:validate` (runs `scripts/validate-gre.mjs`) must run in `prebuild` and CI. It also writes `manifest.json` (counts per topic/difficulty/set), which powers progress percentages and list totals without reading every shard. Extend the validator if you add fields (also check that `answer` indexes are valid, ids are unique across shards, no duplicate words).
- Question ids are stable forever (progress is keyed by id). Never renumber.
- Math is LaTeX in `$...$`. Render with the existing renderer. Quantitative comparison (`type: "qc"`) uses the four fixed choices in `taxonomy.json` (`qcChoices`). Question types: `mcq`, `multi` (select all that apply), `qc`, `numeric` (accept numeric input; also accept simple fractions like `5/36` and decimals; compare with a small tolerance).

## 2. Routes and UX (GeeksforGeeks-style practice system)
- `/gre` hub: two big cards (Quant, Vocabulary), a roadmap card, overall progress (solved/total, accuracy), streak and a "continue where you left off" button.
- `/gre/quant`: topic cards with progress bars (solved/total from manifest + local progress). `/gre/quant/[topic]`: tabs **Learn** (render `content/gre/notes/<topic>.md` as an article) and **Problems**.
- Problems tab = GfG-style problem table: status icon (unsolved / attempted / solved), title (first line of the stem, rendered as plain text), type badge, difficulty badge (easy/medium/hard), subtopic. Filters: difficulty, type, subtopic, status, bookmarked, text search. Sort, pagination (server-driven, 25 per page), URL search params for all filters so links are shareable. Bookmark toggle per row. On mobile the table becomes stacked cards.
- `/gre/quant/problem/[id]`: question page with prev/next within the current filtered list, a timer (count up, optional), the question, the input for its type, **Submit**. After submit: the selected wrong option turns red, the correct option turns green (icons plus aria-live text, not color only); for `multi` mark each option; for `numeric` show the correct value. Always show the "AI explain" collapsible below (see 4). Save the attempt.
- `/gre/quant/mock`: timed mini-mock, 12 questions in 21 minutes, mixed topics, difficulty ramp, no feedback until the end, then a result screen (score, time per question, weak topics, review list with AI explain per question).
- `/gre/vocab`: sets list with progress. `/gre/vocab/[set]`: word list table (word, pos, tier badge, status: new / learning / known), filter by tier and status, search. `/gre/vocab/word/[id]`: definition, example (word highlighted), synonyms, antonyms, status buttons.
- Vocab practice modes (all generated locally, NO AI): **Flashcards** (reuse the existing SM-2 logic and storage), **Quiz** with modes definition-to-word, word-to-definition, synonym, antonym. Build the quiz generator as a pure function `generateVocabQuiz({words, mode, count, seed})`: distractors come from the same pos and ideally the same tier, never contain a synonym of the answer, shuffle with a seeded RNG so a quiz can be reproduced and unit-tested. Include a "hardest tier only" option and a "weak words" option (from the user's mistakes).
- `/gre/roadmap`: render `roadmap.json` as a 4-week checklist; each day is checkable and persisted; link tasks to the relevant page where obvious.
- `/gre/progress` (or a section of the existing Progress page): accuracy per topic and subtopic, solved by difficulty, weak topics, vocab known/learning/new, daily activity and streak. Charts lazy-loaded.
- Sidebar: add a "GRE" group (Quant, Vocab, Roadmap). Mobile-first, wide on desktop, same glass style, theme-aware. Loading skeletons, empty states, error boundaries per route.

## 3. Progress storage
- Use the existing IndexedDB layer with a schema version bump and a migration. Stores: `greAttempts` ({questionId, correct, selected, timeMs, at}), `greBookmarks`, `greVocab` ({wordId, status, srs fields}), `greRoadmap`, `greStreak`. Define a `GreProgressRepository` interface with an IndexedDB implementation now, so a server-backed implementation can be added when auth/DB arrives, without touching components.
- Derive "attempted/solved" status from attempts (solved = latest or any correct attempt; choose one rule, document it). Keep reads batched; never query per row.

## 4. AI explain (the only AI use)
- Reuse `POST /api/explain` through the cascade; add a `kind: "gre-quant"` (and `"gre-vocab"` if you add an explain for words, optional) with style rules in `worker/src/prompts.ts`: concise, step by step, show the key idea first, verify the arithmetic, name the trap if there is one, and for `qc` explain how to compare the two quantities. Output Markdown + LaTeX.
- IMPORTANT: send the **answer key from our file** (`correctAnswer` as text) and the user's answer in the request, and instruct the model to explain why that key is correct and not to re-derive a different answer; if it cannot reach the key it must say so instead of inventing a path. Cache by `questionId + userAnswer + lang`.
- Explanation loads only when the user opens the toggle; skeleton, error with retry, client + server cache. Works for both right and wrong answers; for wrong answers also explain why the user's choice fails.
- Add a small "Report a problem with this question" button that stores the question id locally (and later can send to the server); answer keys can be wrong and this is how I will find them.

## 5. Engineering requirements
- Structure: `src/features/gre/{content,quant,vocab,roadmap,progress,shared}/` each with `components/`, `hooks/`, `lib/`, `types.ts`. Pages stay thin. No file over about 200 lines.
- Pure logic in testable modules with unit tests (Vitest): answer checker for all four types (incl. numeric parsing and tolerance, multi-select exactness), vocab quiz generator (determinism with a seed, no duplicate/synonym distractors), status derivation, filter/sort/pagination, roadmap progress. Add a test that loads every shard and validates it with the zod schema.
- Performance: server components for lists, pagination instead of rendering thousands of rows, no content in the client bundle, lazy-load KaTeX/charts, memoize rows, prefetch the next question. Report First Load JS for the new routes.
- Resilience: if a shard fails to load show an error state, never crash the shell. IndexedDB unavailable: fall back gracefully with a notice.
- Accessibility and mobile: keyboard shortcuts on the problem page (1-5 select, Enter submit, N next), 44px targets, `dvh`, no horizontal scroll (math and tables scroll inside their container).
- Content authoring docs: write `content/gre/README.md` explaining the schema, id rules, how to add a shard, how to run the validator, and a rule that every new quant item must have a verified answer (note if it was solver-checked). Do not scrape or copy text from ETS, Magoosh, Barron's or similar books; all content must be original.

## Deliver
Do not deploy. Summarize routes added, files/structure, tests passing, bundle sizes, and any assumption you made (especially the solved-status rule). List what you need from me.
