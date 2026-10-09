// Mock presets for the GRE reading-comprehension practice mock.
//
// Not the official ETS format. Verify the current format on ets.org before
// relabeling anything here as "the real test". These presets model practice
// pacing; the user is responsible for confirming official timings.
//
// This file is the single source of truth for the mock presets. It is
// imported by the content validator (scripts/validate-gre.mjs) at build
// time; the validator validates each preset and writes a JSON mirror to
// public/gre-data/rc-mock-config.json so the client bundle doesn't need
// to import a .ts file from the content tree. The loader (loader.ts)
// reads the JSON mirror.
//
// IMPORTANT: this file uses the @/ alias for ReadingCategory because
// tsconfig.json registers it. The content validator (which runs under
// node --experimental-strip-types, no alias resolution) imports this
// module with a relative .ts path; the import still resolves at runtime
// because the loader.types.ts file is at the same path the alias maps to
// in the project.

import type { ReadingCategory } from "@/features/gre/content/loader.types";

export type { ReadingCategory };

export type MockCategoryWeight = Partial<Record<ReadingCategory, number>>;

export type MockDifficultyRamp = "flat" | "easy-to-hard" | "alternating";

export type MockPreset = {
  id: string;
  /** Shown in the UI; never "official". */
  label: string;
  description: string;
  passages: number;
  /** Variable questions per passage. Sum MUST equal totalQuestions.
   *  Real RC passages vary in length; this is the real way the test works. */
  questionsPerPassage: number[];
  totalQuestions: number;
  /** Explicit duration, never computed. */
  durationSec: number;
  byDifficulty: { easy: number; medium: number; hard: number };
  byCategory: MockCategoryWeight;
  /** Display-only ordering hint. Higher = later in the mock. */
  difficultyRamp: MockDifficultyRamp;
};

export const MOCK_PRESETS: readonly MockPreset[] = [
  {
    id: "practice-rc",
    label: "Practice RC mock",
    description:
      "4 passages · 14 questions · 30 min · 4 easy / 7 medium / 3 hard. " +
      "Mixed categories. Easy-to-hard ramp.",
    passages: 4,
    questionsPerPassage: [3, 4, 4, 3], // sum = 14
    totalQuestions: 14,
    durationSec: 30 * 60,
    byDifficulty: { easy: 4, medium: 7, hard: 3 },
    byCategory: { business: 4, science: 4, "social-science": 3, arts: 3 },
    difficultyRamp: "easy-to-hard",
  },
  {
    id: "official-pace",
    label: "Official pacing (14q, 21 min)",
    description:
      "Same 14 questions as practice-rc but compressed to 1.5 min/question " +
      "for test-pace reps. NOT the official ETS section — only the per-question pace.",
    passages: 4,
    questionsPerPassage: [3, 4, 4, 3],
    totalQuestions: 14,
    durationSec: Math.round(14 * 1.5 * 60), // 21 min
    byDifficulty: { easy: 4, medium: 7, hard: 3 },
    byCategory: { business: 4, science: 4, "social-science": 3, arts: 3 },
    difficultyRamp: "easy-to-hard",
  },
] as const;

export const DEFAULT_MOCK_PRESET_ID = "practice-rc";

/** The user has *not* verified the official ETS format. We surface that fact. */
export const MOCK_CONFIG_NOTE =
  "These are practice presets, not the official ETS format. " +
  "Verify the current RC section structure on ets.org before labelling any preset as 'official'.";

export function getMockPreset(id: string): MockPreset {
  return MOCK_PRESETS.find((p) => p.id === id) ?? MOCK_PRESETS[0];
}

/** Throws if the preset is internally inconsistent. Called by the validator. */
export function validateMockPreset(p: MockPreset): void {
  if (p.questionsPerPassage.length !== p.passages)
    throw new Error(
      `mock preset ${p.id}: questionsPerPassage length (${p.questionsPerPassage.length}) must equal passages (${p.passages})`
    );
  const sum = p.questionsPerPassage.reduce((s, n) => s + n, 0);
  if (sum !== p.totalQuestions)
    throw new Error(
      `mock preset ${p.id}: questionsPerPassage sum (${sum}) must equal totalQuestions (${p.totalQuestions})`
    );
  const byDiffSum = p.byDifficulty.easy + p.byDifficulty.medium + p.byDifficulty.hard;
  if (byDiffSum !== p.totalQuestions)
    throw new Error(
      `mock preset ${p.id}: byDifficulty sum (${byDiffSum}) must equal totalQuestions (${p.totalQuestions})`
    );
  if (p.durationSec <= 0)
    throw new Error(`mock preset ${p.id}: durationSec must be positive`);
  if (!p.id || !p.label)
    throw new Error(`mock preset ${p.id}: id and label are required`);
  const ramp: MockDifficultyRamp[] = ["flat", "easy-to-hard", "alternating"];
  if (!ramp.includes(p.difficultyRamp))
    throw new Error(`mock preset ${p.id}: difficultyRamp must be one of ${ramp.join("|")}`);
}
