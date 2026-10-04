// Type-only re-exports of the server loader types so client code can
// import them without pulling in server-only code.

export type Difficulty = "easy" | "medium" | "hard";
export type QuestionType = "mcq" | "multi" | "qc" | "numeric";

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
