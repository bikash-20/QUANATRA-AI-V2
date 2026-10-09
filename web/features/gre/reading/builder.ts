// Build a timed GRE reading-comprehension mock from the passage pool.
//
// Spec (mirrors the quant mock builder, but at passage granularity):
//   - Total: 14 questions across ~4 passages.
//   - Difficulty mix: 4 easy / 7 medium / 3 hard (questions, not passages).
//   - Always include ≥1 question per selected passage so the side panel
//     stays useful as the runner advances.
//   - Seeded shuffle so the same seed reproduces the same mock.
//   - If a difficulty bucket is short, borrow from the next-higher tier.

import type { RcPassage } from "@/features/gre/content/loader.types";
import { mulberry32, seededShuffle } from "@/features/gre/vocab/quiz";

export type ReadingMockSpec = {
  totalQuestions: number;
  byDifficulty: { easy: number; medium: number; hard: number };
  passages: number;
  durationSec: number;
};

export const READING_MOCK_SPEC: ReadingMockSpec = {
  totalQuestions: 14,
  byDifficulty: { easy: 4, medium: 7, hard: 3 },
  passages: 4,
  durationSec: 30 * 60, // 30 minutes
};

export type ReadingMockBuildResult = {
  // Each entry: { passageId, questionId }. Order is the runner order.
  items: Array<{ passageId: string; questionId: string }>;
  byTier: { easy: number; medium: number; hard: number; borrowed: number };
  passageIds: string[];
};

type Flat = { passageId: string; questionId: string; difficulty: "easy" | "medium" | "hard" };

function flatten(passages: RcPassage[]): Flat[] {
  const out: Flat[] = [];
  for (const p of passages) for (const q of p.questions) out.push({ passageId: p.id, questionId: q.questionId, difficulty: p.difficulty });
  return out;
}

function pickTier(items: Flat[], tier: "easy" | "medium" | "hard", n: number, rng: () => number): Flat[] {
  const list = items.filter((it) => it.difficulty === tier);
  return seededShuffle(list, rng).slice(0, n);
}

/**
 * Build a reading mock. If a difficulty bucket is short, borrow from the
 * next-higher tier. Always preserves the seeded RNG so the same seed
 * produces the same mock — important for sharing bug reports.
 */
export function buildReadingMock(seed: number, pool: RcPassage[]): ReadingMockBuildResult {
  const rng = mulberry32(seed);
  const want = READING_MOCK_SPEC.byDifficulty;
  const all = flatten(pool);
  // Pick passages first (mixed categories / difficulties).
  const passages = seededShuffle(pool, rng).slice(0, READING_MOCK_SPEC.passages);
  const inScope = all.filter((it) => passages.some((p) => p.id === it.passageId));

  const easy = pickTier(inScope, "easy", want.easy, rng);
  const medium = pickTier(inScope, "medium", want.medium, rng);
  const hard = pickTier(inScope, "hard", want.hard, rng);

  let borrowed = 0;
  if (easy.length < want.easy) {
    const need = want.easy - easy.length;
    const filler = seededShuffle(inScope.filter((it) => it.difficulty === "medium" && !medium.includes(it)), rng).slice(0, need);
    easy.push(...filler);
    borrowed += filler.length;
  }
  if (medium.length < want.medium) {
    const need = want.medium - medium.length;
    const filler = seededShuffle(inScope.filter((it) => it.difficulty === "hard" && !hard.includes(it)), rng).slice(0, need);
    medium.push(...filler);
    borrowed += filler.length;
  }
  if (hard.length < want.hard) {
    const need = want.hard - hard.length;
    const medPool = inScope.filter((it) => it.difficulty === "medium" && !medium.includes(it));
    const easyPool = inScope.filter((it) => it.difficulty === "easy" && !easy.includes(it));
    const filler = [...seededShuffle(medPool, rng), ...seededShuffle(easyPool, rng)].slice(0, need);
    hard.push(...filler);
    borrowed += filler.length;
  }

  // Ensure every chosen passage contributes at least one question. If any
  // passage is empty, top it up from the remaining pool (preserving difficulty
  // mix if possible — otherwise any tier is fine).
  const seen = new Set<string>();
  for (const it of [...easy, ...medium, ...hard]) {
    seen.add(it.questionId);
  }
  for (const p of passages) {
    const hasQ = [easy, medium, hard].some((arr) => arr.some((it) => it.passageId === p.id));
    if (hasQ) continue;
    // top up from any tier — take the first not-yet-seen question for this passage
    const candidate = inScope.find((it) => it.passageId === p.id && !seen.has(it.questionId));
    if (candidate) {
      // try to push into its own tier first, then any other
      const ownTier = candidate.difficulty;
      if (ownTier === "easy" && easy.length < want.easy) easy.push(candidate);
      else if (ownTier === "medium" && medium.length < want.medium) medium.push(candidate);
      else if (ownTier === "hard" && hard.length < want.hard) hard.push(candidate);
      else medium.push(candidate); // any tier as last resort
      seen.add(candidate.questionId);
    }
  }

  const ordered = [...easy, ...medium, ...hard].slice(0, READING_MOCK_SPEC.totalQuestions);
  return {
    items: ordered.map((it) => ({ passageId: it.passageId, questionId: it.questionId })),
    byTier: {
      easy: easy.length,
      medium: medium.length,
      hard: hard.length,
      borrowed,
    },
    passageIds: passages.map((p) => p.id),
  };
}
