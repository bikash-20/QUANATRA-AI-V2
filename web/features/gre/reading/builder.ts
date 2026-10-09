// Build a timed GRE reading-comprehension mock from the passage pool.
//
// The mock is described by a MockSpec (data lives in
// content/gre/rc/mock-config.ts; the loader exposes the JSON mirror):
//   - passages: number of passages to draw.
//   - questionsPerPassage[i]: how many questions the i-th passage
//     contributes. Sum MUST equal totalQuestions (validator-enforced).
//   - byDifficulty: total question count by difficulty, used to ramp
//     from easy -> hard across passages.
//   - byCategory: category weight for the passage picker.
//   - difficultyRamp: ordering hint. "easy-to-hard" biases the first
//     passage toward easy and the last toward hard.
//
// Builder rules:
//   - Tier-borrowing: only between adjacent difficulties (never easy
//     -> hard directly).
//   - Every chosen passage contributes at least one question (if the
//     per-passage slot is empty we top up from any remaining question).
//   - Seeded RNG (mulberry32). Same seed + same spec = same mock.

import type { RcPassage, MockSpec } from "../content/loader.types";
import { mulberry32, seededShuffle } from "../vocab/quiz.ts";

export type { MockSpec };

/** Default spec for callers that don't have one in scope yet. The
 *  canonical list lives in content/gre/rc/mock-config.ts. */
export const READING_MOCK_SPEC: MockSpec = {
  id: "practice-rc",
  label: "Practice RC mock",
  description:
    "4 passages · 14 questions · 30 min · 4 easy / 7 medium / 3 hard · mixed categories · easy-to-hard ramp.",
  passages: 4,
  questionsPerPassage: [3, 4, 4, 3],
  totalQuestions: 14,
  durationSec: 30 * 60,
  byDifficulty: { easy: 4, medium: 7, hard: 3 },
  byCategory: { business: 4, science: 4, "social-science": 3, arts: 3 },
  difficultyRamp: "easy-to-hard",
};

export type ReadingMockBuildResult = {
  /** Each entry: { passageId, questionId }. Order is the runner order. */
  items: Array<{ passageId: string; questionId: string }>;
  byTier: { easy: number; medium: number; hard: number; borrowed: number };
  passageIds: string[];
};

type Flat = {
  passageId: string;
  questionId: string;
  difficulty: "easy" | "medium" | "hard";
  category: RcPassage["category"];
};

function flatten(passages: RcPassage[]): Flat[] {
  const out: Flat[] = [];
  for (const p of passages)
    for (const q of p.questions)
      out.push({
        passageId: p.id,
        questionId: q.questionId,
        difficulty: p.difficulty,
        category: p.category,
      });
  return out;
}

/**
 * Pick N passages, weighted by `byCategory`. Categories with weight 0 are
 * excluded; missing categories default to 1 (so they still appear unless
 * the spec explicitly zeros them out).
 */
function pickPassages(pool: RcPassage[], spec: MockSpec, rng: () => number): RcPassage[] {
  if (pool.length <= spec.passages) {
    return seededShuffle([...pool], rng);
  }
  const byCat = new Map<RcPassage["category"], RcPassage[]>();
  for (const p of pool) {
    const arr = byCat.get(p.category) ?? [];
    arr.push(p);
    byCat.set(p.category, arr);
  }
  const totalWeight =
    Object.values(spec.byCategory).reduce((s, n) => s + Math.max(0, n ?? 0), 0) || 1;
  const want: Record<string, number> = {};
  const cats = Array.from(byCat.keys()) as RcPassage["category"][];
  // Pass 1: floor the per-category target.
  let assigned = 0;
  for (const cat of cats) {
    const w = spec.byCategory[cat] ?? 1;
    if (w <= 0) {
      want[cat] = 0;
      continue;
    }
    const target = Math.floor((w / totalWeight) * spec.passages);
    want[cat] = Math.min(target, (byCat.get(cat) ?? []).length);
    assigned += want[cat];
  }
  // Pass 2: top up from the category with the largest fractional remainder.
  while (assigned < spec.passages) {
    const candidates = cats
      .map((cat) => {
        const w = spec.byCategory[cat] ?? 1;
        if (w <= 0) return null;
        const target = (w / totalWeight) * spec.passages;
        const frac = target - Math.floor(target);
        const have = want[cat] ?? 0;
        const pool = byCat.get(cat) ?? [];
        if (have >= pool.length) return null;
        return { cat, frac, pool };
      })
      .filter(
        (x): x is { cat: RcPassage["category"]; frac: number; pool: RcPassage[] } => x !== null
      )
      .sort((a, b) => b.frac - a.frac);
    if (!candidates.length) break;
    const pick = candidates[0];
    want[pick.cat] = (want[pick.cat] ?? 0) + 1;
    assigned++;
  }
  // Pass 3: under-fill — if any category couldn't provide as many as
  // requested, spread the slack to categories that still have headroom
  // AND a non-zero weight. (Weight-0 categories stay excluded.)
  if (assigned < spec.passages) {
    for (const cat of cats) {
      if (assigned >= spec.passages) break;
      const w = spec.byCategory[cat] ?? 1;
      if (w <= 0) continue;
      const have = want[cat] ?? 0;
      const pool = byCat.get(cat) ?? [];
      if (have < pool.length) {
        want[cat] = have + 1;
        assigned++;
      }
    }
  }
  // Take from each category.
  const out: RcPassage[] = [];
  for (const cat of cats) {
    const k = want[cat] ?? 0;
    if (k <= 0) continue;
    const arr = byCat.get(cat) ?? [];
    out.push(...seededShuffle(arr, rng).slice(0, k));
  }
  return out;
}

/**
 * Decide how many of each tier each passage should produce, given the
 * total `byDifficulty` budget, the per-passage slot count, and the
 * difficulty ramp. Returns an array of length `passages.length`; each
 * entry's tier counts sum to `perPassage[i]`.
 */
function rampAllocation(
  passageCount: number,
  want: { easy: number; medium: number; hard: number },
  perPassage: number[],
  ramp: MockSpec["difficultyRamp"]
): Array<{ easy: number; medium: number; hard: number }> {
  const totalSlots = perPassage.reduce((s, n) => s + n, 0) || 1;
  // Per-passage proportional target.
  const target = perPassage.map((slots) => {
    const w = slots / totalSlots;
    return {
      easy: w * want.easy,
      medium: w * want.medium,
      hard: w * want.hard,
    };
  });
  // Largest-remainder rounding so each entry's tier counts sum to its
  // slot count exactly.
  const alloc: Array<{ easy: number; medium: number; hard: number }> = [];
  for (let i = 0; i < passageCount; i++) {
    const slots = perPassage[i];
    const t = target[i];
    // Floor everything.
    const floors = {
      easy: Math.floor(t.easy),
      medium: Math.floor(t.medium),
      hard: Math.floor(t.hard),
    };
    let remaining = slots - (floors.easy + floors.medium + floors.hard);
    if (remaining < 0) remaining = 0;
    // Distribute the remainder to the tiers with the largest fractional part.
    const fracs = [
      { tier: "easy" as const, frac: t.easy - floors.easy },
      { tier: "medium" as const, frac: t.medium - floors.medium },
      { tier: "hard" as const, frac: t.hard - floors.hard },
    ].sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < remaining; k++) {
      floors[fracs[k % fracs.length].tier] += 1;
    }
    alloc.push(floors);
  }
  // Apply ramp: shift at most 1 question per passage from easy to hard
  // (or vice versa) for the easy-to-hard case. We never *break* the
  // per-passage sum invariant because we swap inside one passage.
  if (ramp === "easy-to-hard" && passageCount > 1) {
    for (let i = 0; i < passageCount; i++) {
      const t = i / (passageCount - 1);
      if (t > 0.5 && alloc[i].easy > 0) {
        alloc[i].easy -= 1;
        alloc[i].hard += 1;
      } else if (t <= 0.5 && alloc[i].hard > 0) {
        alloc[i].hard -= 1;
        alloc[i].easy += 1;
      }
    }
  } else if (ramp === "alternating" && passageCount > 0) {
    for (let i = 0; i < passageCount; i++) {
      if (i % 2 === 0 && alloc[i].hard > 0) {
        alloc[i].hard -= 1;
        alloc[i].easy += 1;
      } else if (alloc[i].easy > 0) {
        alloc[i].easy -= 1;
        alloc[i].hard += 1;
      }
    }
  }
  return alloc;
}

/**
 * Build a reading mock honouring the spec. If a difficulty bucket is
 * short for a passage, borrow from the next-adjacent tier (easy <- medium,
 * medium <- hard, hard <- medium <- easy). Never skip directly. Always
 * preserves the seeded RNG so the same seed produces the same mock —
 * important for sharing bug reports.
 */
export function buildReadingMock(
  seed: number,
  pool: RcPassage[],
  spec: MockSpec = READING_MOCK_SPEC
): ReadingMockBuildResult {
  const rng = mulberry32(seed);
  const all = flatten(pool);
  const passages = pickPassages(pool, spec, rng);
  // Build per-passage question-id pools (in-scope = chosen passages).
  const byPassage = new Map<string, Flat[]>();
  for (const it of all) {
    if (!passages.some((p) => p.id === it.passageId)) continue;
    const arr = byPassage.get(it.passageId) ?? [];
    arr.push(it);
    byPassage.set(it.passageId, arr);
  }
  // Determine the per-passage tier allocation.
  const perPassage = spec.questionsPerPassage.slice(0, passages.length);
  while (perPassage.length < passages.length) perPassage.push(0);
  const alloc = rampAllocation(passages.length, spec.byDifficulty, perPassage, spec.difficultyRamp);

  const taken = new Set<string>();
  const items: ReadingMockBuildResult["items"] = [];
  let borrowed = 0;
  const byTier = { easy: 0, medium: 0, hard: 0, borrowed: 0 };

  for (let i = 0; i < passages.length; i++) {
    const p = passages[i];
    const slot = perPassage[i] ?? 0;
    const want = alloc[i] ?? { easy: 0, medium: 0, hard: 0 };
    const pool = (byPassage.get(p.id) ?? []).filter((it) => !taken.has(it.questionId));
    // Pick the easy/medium/hard first, in the tier order so the per-tier
    // totals track the spec. We shuffle within each tier.
    const pick: Flat[] = [];
    function takeFrom(tier: "easy" | "medium" | "hard", wantN: number) {
      const candidates = pool.filter((it) => it.difficulty === tier && !taken.has(it.questionId));
      const k = Math.min(wantN, candidates.length);
      const chosen = seededShuffle(candidates, rng).slice(0, k);
      for (const c of chosen) {
        pick.push(c);
        taken.add(c.questionId);
      }
      return k;
    }
    const e = takeFrom("easy", want.easy);
    let m = takeFrom("medium", want.medium);
    let h = takeFrom("hard", want.hard);
    byTier.easy += e;
    byTier.medium += m;
    byTier.hard += h;
    // Tier-borrowing: if we're short of the per-passage slot count, top
    // up from any remaining questions for this passage. We only borrow
    // from adjacent tiers in the order: medium (for easy), hard (for
    // medium), then any remaining (medium/easy for hard).
    let total = e + m + h;
    if (total < slot) {
      const need = slot - total;
      if (e < want.easy) {
        const n = takeFrom("medium", need);
        m += n;
        byTier.medium += n;
        borrowed += n;
        total += n;
      }
    }
    if (total < slot) {
      const need = slot - total;
      if (m < want.medium) {
        const n = takeFrom("hard", need);
        h += n;
        byTier.hard += n;
        borrowed += n;
        total += n;
      }
    }
    if (total < slot) {
      const need = slot - total;
      const medPool = pool.filter((it) => it.difficulty === "medium" && !taken.has(it.questionId));
      const easyPool = pool.filter((it) => it.difficulty === "easy" && !taken.has(it.questionId));
      const filler = [...seededShuffle(medPool, rng), ...seededShuffle(easyPool, rng)].slice(0, need);
      for (const c of filler) {
        pick.push(c);
        taken.add(c.questionId);
        if (c.difficulty === "easy") byTier.easy++;
        else if (c.difficulty === "medium") byTier.medium++;
        else byTier.hard++;
        borrowed++;
        total++;
      }
    }
    for (const it of pick) items.push({ passageId: it.passageId, questionId: it.questionId });
  }
  byTier.borrowed = borrowed;
  return { items, byTier, passageIds: passages.map((p) => p.id) };
}
