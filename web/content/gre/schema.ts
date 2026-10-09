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

export const ReadingCategory = z.enum(["business", "science", "social-science", "arts"]);
export type ReadingCategory = z.infer<typeof ReadingCategory>;

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

