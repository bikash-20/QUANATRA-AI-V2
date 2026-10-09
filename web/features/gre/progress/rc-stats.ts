// Pure aggregator for reading-comprehension attempt stats. Extracted
// from the progress island so it can be unit-tested without pulling in
// IDB or React. The caller is expected to pass the full list of RC
// attempts; this module groups by qType / category and computes first-
// attempt accuracy per question.

import type { Attempt, RcQType } from "./types";

export type RcQTypeStat = {
  qType: RcQType;
  total: number;
  correct: number;
  percent: number;
  avgAnswerTimeMs: number;
};

export type RcCategoryStat = {
  category: string;
  total: number;
  correct: number;
  percent: number;
};

export type RcTimeStat = {
  /** Average time the learner spent reading the passage before the
   *  first question (ms). 0 if no first-question attempts. */
  avgReadingTimeMs: number;
  /** Average time the learner spent on each individual question (ms). */
  avgAnswerTimeMs: number;
};

export type RcStats = {
  byQType: RcQTypeStat[];        // sorted ascending by accuracy (worst first)
  byCategory: RcCategoryStat[];
  time: RcTimeStat;
  totalAttempts: number;          // raw attempt count (includes re-attempts)
  uniqueQuestions: number;        // first-attempt count
  correctQuestions: number;       // correct first-attempts
};

/**
 * Build the aggregate stats. The `includeAi` flag mirrors the
 * "Include AI-generated attempts" toggle on /gre/progress; when false
 * (the default) we filter out `source === "ai"` attempts.
 */
export function aggregateRcStats(attempts: Attempt[], includeAi = false): RcStats {
  const filtered = includeAi ? attempts : attempts.filter((a) => a.source !== "ai");

  // First-attempt map: per questionId, the first chronologically.
  const sorted = [...filtered].sort((a, b) => a.at - b.at);
  const firstByQ = new Map<string, Attempt>();
  for (const a of sorted) {
    if (!firstByQ.has(a.questionId)) firstByQ.set(a.questionId, a);
  }
  const firsts = [...firstByQ.values()];

  // By qType
  const byQType = new Map<RcQType, { total: number; correct: number; timeMs: number }>();
  for (const a of firsts) {
    if (!a.qType) continue;
    const slot = byQType.get(a.qType) ?? { total: 0, correct: 0, timeMs: 0 };
    slot.total += 1;
    if (a.correct) slot.correct += 1;
    slot.timeMs += a.answerTimeMs ?? a.timeMs;
    byQType.set(a.qType, slot);
  }
  const byQTypeArr: RcQTypeStat[] = [...byQType.entries()]
    .map(([qType, v]) => ({
      qType,
      total: v.total,
      correct: v.correct,
      percent: v.total === 0 ? 0 : Math.round((v.correct / v.total) * 100),
      avgAnswerTimeMs: v.total === 0 ? 0 : Math.round(v.timeMs / v.total),
    }))
    .sort((a, b) => a.percent - b.percent || a.qType.localeCompare(b.qType));

  // By category
  const byCat = new Map<string, { total: number; correct: number }>();
  for (const a of firsts) {
    const slot = byCat.get(a.topic) ?? { total: 0, correct: 0 };
    slot.total += 1;
    if (a.correct) slot.correct += 1;
    byCat.set(a.topic, slot);
  }
  const byCategory: RcCategoryStat[] = [...byCat.entries()]
    .map(([category, v]) => ({
      category,
      total: v.total,
      correct: v.correct,
      percent: v.total === 0 ? 0 : Math.round((v.correct / v.total) * 100),
    }))
    .sort((a, b) => a.category.localeCompare(b.category));

  // Time breakdown. Only the FIRST question for a passage contributes
  // to reading time; subsequent questions on the same passage have
  // readingTimeMs === 0 (we don't double-count).
  let readingSum = 0;
  let readingCount = 0;
  let answerSum = 0;
  let answerCount = 0;
  // We dedupe by passageId — only the first attempt per passage contributes
  // to reading time.
  const seenPassage = new Set<string>();
  for (const a of sorted) {
    const ans = a.answerTimeMs ?? a.timeMs;
    if (Number.isFinite(ans) && ans > 0) {
      answerSum += ans;
      answerCount += 1;
    }
    if (a.passageId && !seenPassage.has(a.passageId) && a.readingTimeMs && a.readingTimeMs > 0) {
      readingSum += a.readingTimeMs;
      readingCount += 1;
      seenPassage.add(a.passageId);
    }
  }

  return {
    byQType: byQTypeArr,
    byCategory,
    time: {
      avgReadingTimeMs: readingCount === 0 ? 0 : Math.round(readingSum / readingCount),
      avgAnswerTimeMs: answerCount === 0 ? 0 : Math.round(answerSum / answerCount),
    },
    totalAttempts: filtered.length,
    uniqueQuestions: firsts.length,
    correctQuestions: firsts.filter((a) => a.correct).length,
  };
}

/** Pretty label for a qType, used by the UI. */
export const QTYPE_LABELS: Record<RcQType, string> = {
  "main-idea": "Main idea",
  "detail": "Detail",
  "inference": "Inference",
  "author-attitude": "Author attitude",
  "function": "Function",
  "structure": "Structure",
  "vocab-in-context": "Vocab in context",
  "strengthen-weaken": "Strengthen / weaken",
};
