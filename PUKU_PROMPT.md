# Prompt for Puku agent

You are building the frontend for **Quantara**, an AI tutor app (CS, math, physics, code + English vocab/grammar). The backend already exists in `./worker` (Cloudflare Worker + Workers AI). Read `./worker/src/index.ts` and `./README.md` first and do NOT rewrite the worker unless a bug is found; report any backend change you need.

## Stack
Next.js (App Router, TypeScript), Tailwind, Framer Motion, lucide-react. Create it in `./web`. Env: `NEXT_PUBLIC_API_URL` (default http://localhost:8787). No auth for now.

## Design
Dark teal/ocean glassmorphism: deep navy background with subtle wave texture, rounded-3xl translucent cards, teal (#4db8d4-ish) accent, condensed uppercase headings, serif display font for hero title (Playfair Display), Poppins for body. Floating pill navbar: logo "QUANTARA", links Chat · Quiz · Vocab · Grammar · Explore, Light/Dark toggle, avatar placeholder. Framer Motion: page fade/slide, staggered card entrance, hover lift, streaming text cursor. Fully responsive.

## Pages
1. **/explore** – hero ("Explore Quantara", "An AI tutor for CS, math, physics, and code.", Start chatting button) + grid of cards: Flashcards (shows % progress), MCQ Quiz, Quiz from Passage, Vocabulary, Grammar, Exam, Progress, Admin (placeholder).
2. **/chat** – streaming chat via POST /api/chat (parse SSE `data: {"response":"..."}` chunks, stop at `[DONE]`). Markdown + code blocks with copy button, KaTeX for math, subject selector, EN/বাংলা toggle (sends `lang`), stop-generating, conversations saved in localStorage.
3. **/quiz** – MCQ quiz (topic, count, difficulty) via /api/quiz/mcq; one question at a time, instant feedback + explanation, final score screen. Tab for "Quiz from passage" (/api/quiz/passage).
4. **/flashcards** – generate via /api/flashcards, flip animation, spaced repetition (SM-2 simple: Again/Hard/Good/Easy), decks and due counts in localStorage.
5. **/vocab** – /api/vocab with CEFR level picker; word cards with meaning, Bangla meaning, example, "add to flashcards".
6. **/grammar** – /api/grammar by CEFR level; rules, correct/incorrect examples, practice questions with reveal.
7. **/exam** – /api/exam/generate, countdown timer, no feedback until submit, then /api/exam/grade for verdict, weak topics.
8. **/progress** – accuracy, streaks, weak topics from localStorage (chart with recharts).
9. **/admin** – placeholder page (feature flags UI later).

## Rules
- Central `lib/api.ts` with typed fetch helpers + SSE reader; loading skeletons and error toasts (the model can occasionally return a 500, add Retry).
- Persist everything in localStorage behind a small `lib/storage.ts` so it can later move to D1/KV.
- Clean folder structure, reusable `GlassCard`, `Button`, `Navbar`, `Toast`.
- Build page by page, run `npm run build` after each, commit per page. Finish with README additions on how to run both worker and web.
