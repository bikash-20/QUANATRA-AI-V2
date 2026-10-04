// Pure, seeded vocab quiz generator. Deterministic given (words, mode, count, seed).
// Modes:
//   def-to-word     show definition, four word choices (correct + 3 distractors)
//   word-to-def     show word, four definition choices
//   synonym         show word, four synonym choices
//   antonym         show word, four antonym choices
//
// Distractor rules:
//   - Must come from the same pos as the answer (when there are enough words of that pos).
//   - Must be from the same tier when possible (preferred), else nearest tier.
//   - Must NOT be a synonym of the answer (any mode) — keeps distractors
//     from accidentally being correct.
//   - Must NOT be the answer word itself (obviously).
//   - Must NOT be a duplicate.
//   - Shuffled with a seeded RNG so the same seed produces the same quiz.

import type { VocabWord } from "../content/loader";

export type QuizMode = "def-to-word" | "word-to-def" | "synonym" | "antonym";

export type QuizItem = {
  prompt: string;            // what the user sees as the question
  choices: string[];         // displayed choice strings, in shuffled order
  correctIndex: number;      // index into choices
  /** The id of the source word so the result can be tied back. */
  wordId: string;
  /** Raw answer text for grading + AI explain. */
  answerText: string;
};

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32). Deterministic across JS engines.
// ---------------------------------------------------------------------------

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shuffle a copy of arr using the provided RNG. */
export function seededShuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Distractor pool
// ---------------------------------------------------------------------------

function sameSynonym(w: VocabWord, cand: VocabWord): boolean {
  // "any of cand's synonyms matches any of w's synonyms (case-insensitive)"
  const wSyn = new Set(w.synonyms.map((s) => s.toLowerCase()));
  return cand.synonyms.some((s) => wSyn.has(s.toLowerCase()));
}

function nearTier(cand: VocabWord, target: number): number {
  return Math.abs(cand.tier - target);
}

function poolFor(words: VocabWord[], answer: VocabWord, exclude: Set<string>): VocabWord[] {
  return words.filter((w) => w.id !== answer.id && !exclude.has(w.id));
}

function pickDistractors(
  words: VocabWord[],
  answer: VocabWord,
  rng: () => number,
  n: number,
): VocabWord[] {
  // Step 1: same pos + nearest tier, no synonym overlap.
  const candidates = words.filter((w) => {
    if (w.id === answer.id) return false;
    if (w.pos !== answer.pos) return false;
    if (sameSynonym(w, answer)) return false;
    return true;
  });
  // Sort by tier distance then shuffle within groups.
  candidates.sort((a, b) => {
    const d = nearTier(a, answer.tier) - nearTier(b, answer.tier);
    return d !== 0 ? d : rng() - 0.5;
  });
  const out: VocabWord[] = [];
  const used = new Set<string>();
  for (const c of candidates) {
    if (out.length >= n) break;
    if (used.has(c.id)) continue;
    out.push(c);
    used.add(c.id);
  }
  // Step 2: backfill from other-pos candidates if we're short.
  if (out.length < n) {
    const fallback = poolFor(words, answer, used).filter((w) => !sameSynonym(w, answer));
    for (const c of seededShuffle(fallback, rng)) {
      if (out.length >= n) break;
      out.push(c);
      used.add(c.id);
    }
  }
  return out.slice(0, n);
}

// ---------------------------------------------------------------------------
// Quiz builders per mode
// ---------------------------------------------------------------------------

function buildDefToWord(words: VocabWord[], answer: VocabWord, rng: () => number): QuizItem {
  const distractors = pickDistractors(words, answer, rng, 3);
  const choiceStrs = seededShuffle(
    [answer, ...distractors].map((w) => w.word),
    rng,
  );
  const correctIndex = choiceStrs.indexOf(answer.word);
  return {
    prompt: answer.definition,
    choices: choiceStrs,
    correctIndex,
    wordId: answer.id,
    answerText: answer.word,
  };
}

function buildWordToDef(words: VocabWord[], answer: VocabWord, rng: () => number): QuizItem {
  const distractors = pickDistractors(words, answer, rng, 3);
  const choiceStrs = seededShuffle(
    [answer, ...distractors].map((w) => w.definition),
    rng,
  );
  const correctIndex = choiceStrs.indexOf(answer.definition);
  return {
    prompt: answer.word,
    choices: choiceStrs,
    correctIndex,
    wordId: answer.id,
    answerText: answer.definition,
  };
}

function buildSynonym(words: VocabWord[], answer: VocabWord, rng: () => number): QuizItem {
  // The first correct synonym, or if none, the first synonym anyway.
  const correctSynonym = answer.synonyms[0];
  // Distractor pool excludes any word whose synonyms overlap with the answer's synonyms.
  const pool = words.filter((w) => {
    if (w.id === answer.id) return false;
    if (!w.synonyms.length) return false;
    if (sameSynonym(w, answer)) return false;
    return true;
  });
  // Pick distractors that have a synonym string of their own; pull one synonym from each.
  const dSynonyms: string[] = [];
  const used = new Set<string>([correctSynonym.toLowerCase()]);
  const shuffled = seededShuffle(pool, rng);
  for (const c of shuffled) {
    if (dSynonyms.length >= 3) break;
    const syn = c.synonyms[0];
    if (!syn) continue;
    if (used.has(syn.toLowerCase())) continue;
    dSynonyms.push(syn);
    used.add(syn.toLowerCase());
  }
  const choiceStrs = seededShuffle([correctSynonym, ...dSynonyms], rng);
  const correctIndex = choiceStrs.indexOf(correctSynonym);
  return {
    prompt: answer.word,
    choices: choiceStrs,
    correctIndex: correctIndex >= 0 ? correctIndex : 0,
    wordId: answer.id,
    answerText: correctSynonym,
  };
}

function buildAntonym(words: VocabWord[], answer: VocabWord, rng: () => number): QuizItem {
  // For antonym mode the answer is hard if the word has no antonym — skip
  // those (caller filters them out).
  const correctAntonym = answer.antonyms[0];
  const pool = words.filter((w) => {
    if (w.id === answer.id) return false;
    if (!w.antonyms.length) return false;
    if (sameSynonym(w, answer)) return false;
    return true;
  });
  const dAntonyms: string[] = [];
  const used = new Set<string>([correctAntonym.toLowerCase()]);
  for (const c of seededShuffle(pool, rng)) {
    if (dAntonyms.length >= 3) break;
    const ant = c.antonyms[0];
    if (!ant) continue;
    if (used.has(ant.toLowerCase())) continue;
    dAntonyms.push(ant);
    used.add(ant.toLowerCase());
  }
  const choiceStrs = seededShuffle([correctAntonym, ...dAntonyms], rng);
  const correctIndex = choiceStrs.indexOf(correctAntonym);
  return {
    prompt: answer.word,
    choices: choiceStrs,
    correctIndex: correctIndex >= 0 ? correctIndex : 0,
    wordId: answer.id,
    answerText: correctAntonym,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type GenerateOptions = {
  /** Words to draw from and to test against. */
  words: VocabWord[];
  mode: QuizMode;
  /** Number of items in the quiz. */
  count: number;
  /** Seed for the RNG. Same seed + same input -> same quiz. */
  seed: number;
  /** Restrict to words of these tiers. Default = all. */
  tiers?: Array<1 | 2 | 3>;
  /** Skip words that the caller flagged as "weak" or "known". Default = no filter. */
  skipWordIds?: Set<string>;
};

/**
 * Generate a quiz with the given options. Pure function.
 *
 * If the answer pool is too small (e.g. antonym mode with very few words
 * that have antonyms), the function returns as many items as possible —
 * possibly zero. Callers should check the array length.
 */
export function generateVocabQuiz(opts: GenerateOptions): QuizItem[] {
  const { words, mode, count, seed, tiers, skipWordIds } = opts;
  const rng = mulberry32(seed);
  // Eligible words for ANSWERS (tier + skip filter).
  const eligible = words.filter((w) => {
    if (tiers && !tiers.includes(w.tier)) return false;
    if (skipWordIds?.has(w.id)) return false;
    if (mode === "antonym" && !w.antonyms.length) return false;
    return true;
  });
  if (eligible.length < 1) return [];
  // Unique answers (don't repeat a word).
  const shuffledAnswers = seededShuffle(eligible, rng);
  const out: QuizItem[] = [];
  const seen = new Set<string>();
  for (const w of shuffledAnswers) {
    if (out.length >= count) break;
    if (seen.has(w.id)) continue;
    seen.add(w.id);
    const builder =
      mode === "def-to-word" ? buildDefToWord :
      mode === "word-to-def" ? buildWordToDef :
      mode === "synonym" ? buildSynonym :
      buildAntonym;
    out.push(builder(words, w, rng));
  }
  return out;
}