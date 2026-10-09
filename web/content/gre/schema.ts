import { z } from "zod";

export const Difficulty = z.enum(["easy", "medium", "hard"]);
const base = {
  id: z.string().regex(/^q-[a-z]{3}-\d{3,}$/),
  topic: z.string(),
  subtopic: z.string(),
  difficulty: Difficulty,
  tags: z.array(z.string()).default([]),
};

export const QuantQuestion = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("mcq"), stem: z.string(), choices: z.array(z.string()).min(2), answer: z.number().int().nonnegative() }),
  z.object({ ...base, type: z.literal("multi"), stem: z.string(), choices: z.array(z.string()).min(2), answer: z.array(z.number().int().nonnegative()).min(1) }),
  z.object({ ...base, type: z.literal("qc"), quantityA: z.string(), quantityB: z.string(), common: z.string().optional(), answer: z.enum(["A", "B", "C", "D"]) }),
  z.object({ ...base, type: z.literal("numeric"), stem: z.string(), answer: z.number() }),
]);
export type QuantQuestion = z.infer<typeof QuantQuestion>;

export const VocabWord = z.object({
  id: z.string().regex(/^v-\d{4,}$/),
  word: z.string(),
  pos: z.enum(["n", "v", "adj", "adv"]),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  definition: z.string(),
  synonyms: z.array(z.string()).min(1),
  antonyms: z.array(z.string()),
  example: z.string(),
});
export type VocabWord = z.infer<typeof VocabWord>;

// --- Reading Comprehension -------------------------------------------------
// Hand-authored passages live in content/gre/reading/<category>-NNN.json.
// AI-generated passages share the same shape and flow through the same
// solver component, so we keep the schema unified.
//
// Two parallel shapes are exported:
//   * `ReadingQuestion` / `ReadingPassage` — the legacy `type: rc-single | rc-multi`
//     shape. Still accepted by the loader so existing content files keep
//     validating during the migration window. New code should prefer the
//     `Rc*` types below.
//   * `RcSource` / `RcQType` / `RcQuestionKind` / `RcQuestion` / `RcPassage` —
//     the upgraded schema: closed `source` enum, qType taxonomy,
//     `kind: "single" | "multi" | "select-sentence"`, and `evidence: [{sentence,
//     anchor}]` per question. The 3-choice rule for `multi`, the
//     `select-sentence` no-choices rule, and the 5-choice rule for
//     `single` mirror the real GRE RC format.

export const ReadingCategory = z.enum(["business", "science", "social-science", "arts"]);
export type ReadingCategory = z.infer<typeof ReadingCategory>;

// --- Upgraded RC schema ---------------------------------------------------

/**
 * Closed source enum. Real hand-authored passages use "original" (we wrote
 * them); AI-generated passages use "ai" (Worker pipeline).
 * "external" is reserved for the future case where we have explicit
 * permission to republish a real citation — when used, `attribution`
 * must also be present.
 */
export const RcSource = z.enum(["original", "ai", "external"]);
export type RcSource = z.infer<typeof RcSource>;

/**
 * GRE-style question type taxonomy. Stored per question so the progress
 * island can compute weak-spot panels.
 */
export const RcQType = z.enum([
  "main-idea",
  "detail",
  "inference",
  "author-attitude",
  "function",
  "structure",
  "vocab-in-context",
  "strengthen-weaken",
]);
export type RcQType = z.infer<typeof RcQType>;

/**
 * Question interaction kind. Discriminator for the RcQuestion union.
 *   * "single"           — radio, 1 correct of 5 choices.
 *   * "multi"            — checkbox, 1+ correct of 3 choices (real GRE format).
 *   * "select-sentence"  — click a sentence in the passage; 0 choices.
 */
export const RcQuestionKind = z.enum(["single", "multi", "select-sentence"]);
export type RcQuestionKind = z.infer<typeof RcQuestionKind>;

/**
 * Evidence anchor. The validator verifies that
 * `bodySentences[evidence[i].sentence]` starts (case-insensitive,
 * whitespace-trimmed) with `anchor`, which is the first ~5 words of that
 * sentence. If it doesn't, the build fails — guards against drift when
 * the passage body is edited.
 */
export const RcEvidence = z.object({
  sentence: z.number().int().min(0),
  anchor: z.string().min(8).max(80),
});
export type RcEvidence = z.infer<typeof RcEvidence>;

const rcBase = {
  questionId: z.string().regex(/^q-rc-[a-z0-9-]+$/),
  stem: z.string().min(10).max(800),
  qType: RcQType,
  evidence: z.array(RcEvidence).min(1).max(4),
  rationale: z.string().min(20).max(800),
};

export const RcQuestion = z.discriminatedUnion("kind", [
  z.object({
    ...rcBase,
    kind: z.literal("single"),
    choices: z.array(z.string().min(1).max(400)).length(5),
    answer: z.number().int().min(0).max(4),
  }),
  z.object({
    ...rcBase,
    kind: z.literal("multi"),
    choices: z.array(z.string().min(1).max(400)).length(3),
    answer: z.array(z.number().int().min(0).max(2)).min(1).max(3),
  }),
  z.object({
    ...rcBase,
    kind: z.literal("select-sentence"),
    answer: z.number().int().min(0),
  }),
]);
export type RcQuestion = z.infer<typeof RcQuestion>;

/**
 * New passage shape. `wordCount` is computed by the validator, never
 * hand-typed. `sentences` is an optional override; the splitter handles
 * the vast majority of cases, but we allow it for tricky prose.
 */
export const RcPassage = z.object({
  id: z.string().regex(/^rc-[a-z]{2,4}-\d{3}$/),
  category: ReadingCategory,
  title: z.string().min(8).max(160),
  source: RcSource,
  attribution: z.string().max(200).optional(),
  body: z.string().min(800).max(4500),
  difficulty: Difficulty,
  tags: z.array(z.string()).default([]),
  sentences: z.array(z.string().min(1).max(600)).min(3).max(60).optional(),
  questions: z.array(RcQuestion).min(3).max(5),
});
export type RcPassage = z.infer<typeof RcPassage>;

// --- Legacy shape (still accepted during the migration window) -------------

const readingPassageBase = {
  id: z.string().regex(/^rc-[a-z]{2,4}-\d{3}$/),
  category: ReadingCategory,
  title: z.string().min(8).max(160),
  source: z.string().min(2).max(120),
  wordCount: z.number().int().min(200).max(600),
  body: z.string().min(800).max(4500),
  difficulty: Difficulty,
  tags: z.array(z.string()).default([]),
};

const readingQuestionBase = {
  questionId: z.string().regex(/^q-rc-[a-z0-9-]+$/),
  stem: z.string().min(10).max(800),
  choices: z.array(z.string().min(1).max(400)).length(5),
  rationale: z.string().min(20).max(800),
};

export const ReadingQuestion = z.discriminatedUnion("type", [
  z.object({ ...readingQuestionBase, type: z.literal("rc-single"), answer: z.number().int().min(0).max(4) }),
  z.object({ ...readingQuestionBase, type: z.literal("rc-multi"), answer: z.array(z.number().int().min(0).max(4)).min(1).max(3) }),
]);
export type ReadingQuestion = z.infer<typeof ReadingQuestion>;

export const ReadingPassage = z.object({
  ...readingPassageBase,
  questions: z.array(ReadingQuestion).min(3).max(5),
});
export type ReadingPassage = z.infer<typeof ReadingPassage>;

