# GRE system guide for coding agents

Read this guide before changing GRE routes, content, schemas, quizzes, mocks, or progress. It describes the current implementation; treat the code and package scripts as the source of truth when they differ from this guide.

## System map

The GRE module is a static, hand-curated study system. Questions, vocabulary, topic notes, and roadmap content are stored in `content/gre/`. The Next.js app reads this content locally; normal GRE practice does not require the Worker. AI is used for on-demand explanations through the shared explanation client and Worker cascade. Do not use AI to generate or silently replace the source corpus.

| Concern | Implementation |
| --- | --- |
| Routes | `app/gre/` |
| Canonical content shapes and types | `content/gre/schema.ts`, `features/gre/content/loader.types.ts` |
| Server content reader and validation | `features/gre/content/loader.ts` |
| Browser manifest/taxonomy seed | `features/gre/quant/components/gre-manifest-seed.tsx`, `features/gre/content/loader.client.ts` |
| Quant answer rules | `features/gre/quant/checker.ts` |
| Vocabulary quiz creation | `features/gre/vocab/quiz.ts` |
| Timed mock assembly | `features/gre/mock/builder.ts` |
| Local progress persistence | `features/gre/progress/repository.ts`, backed by `lib/db.ts` |
| On-demand explanations | `lib/explanations.ts`, `lib/explanation-schema.ts`, Worker `POST /api/explain` |
| Content validation and manifest generation | `scripts/validate-gre.mjs` |

### Request and data flow

1. A route in `app/gre/` calls the server-only content loader.
2. The loader reads JSON/Markdown from `content/gre/`, validates question and word records with Zod, and memoizes parsed content in process memory.
3. The server renders route data. Routes that need the browser-side manifest or taxonomy render `GreManifestSeed`, which assigns them to `window.__greSeed__`.
4. Interactive client components hydrate and read/write progress through the `greProgress` repository. Progress is local to the browser's IndexedDB; it is not automatically synced to an account or server.
5. An explanation is requested only when the user opens an explain control. `getExplanation` validates the request, checks the local explanation cache, calls the shared `/api/explain` client on a miss, validates the response, and caches the result.

`loader.client.ts` currently reads the injected seed and otherwise returns empty defaults. Its comment mentions a static-file fetch fallback, but the implementation does not perform that fetch. Keep the server-rendered seed path intact; verify the implementation before relying on a fallback.

## Routes and ownership

- `/gre`: hub and progress summary.
- `/gre/quant`: quantitative topic index.
- `/gre/quant/[topic]`: topic notes, server-filtered problem list, pagination, and status filters.
- `/gre/quant/problem/[id]`: server-loaded problem plus the interactive solver, answer checking, bookmarks, reporting, and explain control.
- `/gre/quant/mock`: timed mock entry/resume and runner.
- `/gre/vocab`: vocabulary set index.
- `/gre/vocab/[set]`: set table, tier/status/search filters, and quiz entry.
- `/gre/vocab/[set]/quiz`: generated vocabulary quiz.
- `/gre/vocab/word/[id]`: individual word detail and review.
- `/gre/roadmap`: roadmap checklist.
- `/gre/progress`: attempts, first-attempt accuracy, weak subtopics, vocabulary status, streak, and mock history.

Prefer keeping server-rendered content selection in route/server code and browser interactions in the existing feature components. Reuse `greProgress` for progress operations rather than accessing IndexedDB from a page component.

## Content format and editing

### Quantitative questions

Files are grouped as `content/gre/quant/<topic>/<topic>-NN.json`. Each shard is a JSON array. Supported discriminated question types are:

- `mcq`: `stem`, `choices`, one zero-based integer `answer`.
- `multi`: `stem`, `choices`, an array of zero-based integer answer indices.
- `qc`: `quantityA`, `quantityB`, optional `common`, and answer `"A" | "B" | "C" | "D"`.
- `numeric`: `stem` and numeric `answer`.

All records share `id`, `topic`, `subtopic`, `difficulty`, and `tags`. Question IDs match `q-<three lowercase letters>-<at least three digits>`. Keep topic and subtopic slugs aligned with `content/gre/taxonomy.json`. Math may be authored as LaTeX in stems, choices, notes, and explanations; preserve valid delimiters and escape JSON strings correctly.

### Vocabulary

Files are `content/gre/vocab/set-NN.json`, each containing an array of words. A word has `id`, `word`, `pos` (`n`, `v`, `adj`, `adv`), `tier` (`1`, `2`, `3`), `definition`, `synonyms`, `antonyms`, and `example`. IDs match `v-<at least four digits>`. The validator requires globally unique IDs, unique words (case-insensitive), a valid tier, a non-empty definition/example/synonyms, and an example that uses the headword.

### Schema and manifest changes

`content/gre/schema.ts`, the Zod schemas in `features/gre/content/loader.ts`, and the mirrored schemas in `tests/gre-content-schema.test.mjs` currently repeat shape definitions. If changing a record shape, update and verify all three, plus the relevant validation rules in `scripts/validate-gre.mjs`. The test file explicitly documents this duplication; do not assume one schema edit updates the others.

`npm run gre:validate` reads the taxonomy and all content shards, checks cross-record constraints, and writes `content/gre/manifest.json`. It calculates counts; do not hardcode question totals, vocabulary set counts, or shard counts in pages. The repository also contains `public/gre-data/manifest.json` and `public/gre-data/taxonomy.json`; the current validator does not synchronize those files. The route pages use the server loader and `GreManifestSeed`, so inspect actual consumers before changing or adding mirror behavior.

## Interactive behavior and persistence

- Quant answer correctness is centralized in `features/gre/quant/checker.ts`. Multi-select grading is set/order-insensitive. Numeric input accepts supported number/fraction forms and applies the defined tolerance; update its tests if changing parsing or comparison rules.
- The problem solver records attempts, elapsed time, bookmark state, and reports through `greProgress`. Every attempt is retained. Progress accuracy and weak-subtopic calculations use only the first attempt per question; solved status can reflect any correct attempt.
- Vocabulary quiz generation in `features/gre/vocab/quiz.ts` is deterministic for a given seed and uses seeded shuffling plus constrained distractor selection. Preserve answer indices when shuffling and avoid distractors that could also be correct.
- The mock specification is in `features/gre/mock/builder.ts`: 12 questions, 3 easy / 5 medium / 4 hard, ordered by difficulty, with a 21-minute timer. The mock entry resumes an active attempt from IndexedDB; the runner persists answers and flags, records attempts on submission, and auto-submits at zero.
- The roadmap, streak, bookmark, attempt, vocabulary-review, mock, and report records are all persisted locally through `features/gre/progress/repository.ts`. Keep persistence behind the repository interface.

## Performance and algorithm choices

- The first load of a topic parses its shards and caches the validated topic list. Filtering a topic list is linear in that topic's question count; avoid re-reading or re-filtering it repeatedly in a render loop.
- `getAllQuestions()` loads and caches the full corpus. `getQuestion(id)` currently searches that list linearly on a cache miss, so keep bulk lookup out of repeated per-item work.
- Mock construction partitions and shuffles question pools, with work proportional to the question pool (and temporary arrays proportional to the pool). Vocabulary distractor selection filters candidates and sorts them, so its dominant step is `O(W log W)` for `W` words in the supplied pool.
- Progress views load attempts from IndexedDB and derive aggregate stats in memory. Keep derivation linear where possible; if data volume grows enough to require indexing or pagination, preserve the first-attempt accuracy rule and test its semantics.

## Safe contribution workflow

1. Identify the relevant route, feature component, pure logic module, and tests before editing. Keep new GRE-specific code under `features/gre/` unless it is clearly shared by another feature.
2. For content-only changes, edit the appropriate shard/taxonomy/notes, then run `npm run gre:validate`. Review the generated manifest diff and confirm totals and per-topic/per-set counts match the intended edits.
3. Run focused GRE tests while iterating, then run the full `npm run test:unit`, `npm run lint`, and `npx tsc --noEmit` from `web/` for code changes. `npm run build` is the production build check; its `prebuild` hook runs the validator and rewrites the generated content manifest.
4. Finish with `git diff --check` and inspect `git status --short` and the complete diff. Keep generated manifest changes that are expected from content updates; separate pre-existing user changes from your own.
5. For behavior changes, test both first-use and persisted/resume cases where applicable. For IndexedDB behavior, include a browser check or a test at the repository/logic boundary.

Useful commands, run from `web/`:

```sh
npm run gre:validate
npm run test:unit
npm run lint
npx tsc --noEmit
npm run build
git diff --check
```

The build validator writes a generated file. Before running it in a dirty worktree, inspect the existing manifest diff so a pre-existing edit is not accidentally mistaken for generated output. Documentation-only edits do not require a Next.js build.
