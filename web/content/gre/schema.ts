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
