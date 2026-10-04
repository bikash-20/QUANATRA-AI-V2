// Build a 12-question GRE mock from the question pool.
//
// Rules (per user spec):
//   - Total: 12 questions.
//   - Mix: 3 easy / 5 medium / 4 hard.
//   - Order: easy → medium → hard.
//   - If a tier's pool is short, BORROW from the next-higher tier so the
//     total still hits 12 (per spec: "if a pool is short, borrow from the
//     next level").
//   - Within a tier, randomly sample (seeded) from across all topics so
//     the mock isn't dominated by one topic.
//   - Returns just the question ids; the page resolves them on render.

import { getAllQuestions, type QuantQuestion } from "@/features/gre/content/loader";
import { mulberry32, seededShuffle } from "@/features/gre/vocab/quiz";

export type MockSpec = {
  total: number;
  byDifficulty: { easy: number; medium: number; hard: number };
  durationSec: number;
};

export const MOCK_SPEC: MockSpec = {
  total: 12,
  byDifficulty: { easy: 3, medium: 5, hard: 4 },
  durationSec: 21 * 60, // 21 minutes
};

export type MockBuildResult = {
  ids: string[];
  byTier: { easy: number; medium: number; hard: number; borrowed: number };
};

function pickByDifficulty(pool: QuantQuestion[], tier: "easy" | "medium" | "hard", n: number, rng: () => number): QuantQuestion[] {
  const tierList = pool.filter((q) => q.difficulty === tier);
  return seededShuffle(tierList, rng).slice(0, n);
}

/**
 * Build a mock. If a difficulty bucket is short, borrow from the next tier
 * (medium borrows from hard, hard can't borrow from easy — easy is the
 * floor).
 */
export function buildMock(seed: number, pool?: QuantQuestion[]): MockBuildResult {
  const src = pool ?? getAllQuestions();
  const rng = mulberry32(seed);
  const want = MOCK_SPEC.byDifficulty;
  const easy = pickByDifficulty(src, "easy", want.easy, rng);
  const medium = pickByDifficulty(src, "medium", want.medium, rng);
  const hard = pickByDifficulty(src, "hard", want.hard, rng);

  let borrowed = 0;
  // If easy short, borrow from medium (the next-higher tier).
  if (easy.length < want.easy) {
    const need = want.easy - easy.length;
    const filler = seededShuffle(src.filter((q) => q.difficulty === "medium" && !medium.includes(q)), rng).slice(0, need);
    easy.push(...filler);
    borrowed += filler.length;
  }
  // If medium short, borrow from hard.
  if (medium.length < want.medium) {
    const need = want.medium - medium.length;
    const filler = seededShuffle(src.filter((q) => q.difficulty === "hard" && !hard.includes(q)), rng).slice(0, need);
    medium.push(...filler);
    borrowed += filler.length;
  }
  // If hard short, borrow from medium — but medium is already full per the
  // spec, so the borrow goes one step up the chain from the easy side.
  if (hard.length < want.hard) {
    const need = want.hard - hard.length;
    // try medium first, then easy
    const medPool = src.filter((q) => q.difficulty === "medium" && !medium.includes(q));
    const easyPool = src.filter((q) => q.difficulty === "easy" && !easy.includes(q));
    const filler = [...seededShuffle(medPool, rng), ...seededShuffle(easyPool, rng)].slice(0, need);
    hard.push(...filler);
    borrowed += filler.length;
  }
  // If easy's borrow from medium left medium short, top it up from hard
  // (rare edge case when the pool is tiny).
  if (medium.length < want.medium) {
    const need = want.medium - medium.length;
    const filler = seededShuffle(src.filter((q) => q.difficulty === "hard" && !hard.includes(q)), rng).slice(0, need);
    medium.push(...filler);
    borrowed += filler.length;
  }

  const ordered = [...easy, ...medium, ...hard].slice(0, MOCK_SPEC.total);
  return {
    ids: ordered.map((q) => q.id),
    byTier: {
      easy: easy.length,
      medium: medium.length,
      hard: hard.length,
      borrowed,
    },
  };
}