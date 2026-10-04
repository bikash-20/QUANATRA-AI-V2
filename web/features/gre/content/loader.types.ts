// Type-only re-exports of the server loader types so client code can
// import them without pulling in server-only code.

export type Difficulty = "easy" | "medium" | "hard";
export type QuestionType = "mcq" | "multi" | "qc" | "numeric";

export type QuantQuestion =
  | { id: string; type: "mcq"; topic: string; subtopic: string; difficulty: Difficulty; tags: string[]; stem: string; choices: string[]; answer: number }
  | { id: string; type: "multi"; topic: string; subtopic: string; difficulty: Difficulty; tags: string[]; stem: string; choices: string[]; answer: number[] }
  | { id: string; type: "qc"; topic: string; subtopic: string; difficulty: Difficulty; tags: string[]; quantityA: string; quantityB: string; common?: string; answer: "A" | "B" | "C" | "D" }
  | { id: string; type: "numeric"; topic: string; subtopic: string; difficulty: Difficulty; tags: string[]; stem: string; answer: number };

export type VocabWord = {
  id: string;
  word: string;
  pos: "n" | "v" | "adj" | "adv";
  tier: 1 | 2 | 3;
  definition: string;
  synonyms: string[];
  antonyms: string[];
  example: string;
};

export type Manifest = {
  generatedAt: string;
  quant: Record<string, { count: number; easy: number; medium: number; hard: number; shards: number }>;
  vocab: Record<string, { count: number }>;
  totals: { quant: number; vocab: number };
};

export type Taxonomy = {
  version: number;
  quant: Array<{ slug: string; title: string; subtopics: string[] }>;
  questionTypes: Record<QuestionType, string>;
  qcChoices: string[];
  difficulty: Difficulty[];
  vocabTiers: Record<"1" | "2" | "3", string>;
};
