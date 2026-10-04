// Server-only content loader for the GRE module. Reads content/gre/* at
// runtime in the Node process, validates with zod, and caches results in
// module scope so each request does not re-parse the entire corpus.
//
// Manifest and taxonomy are also exposed to the client via /public/gre-data
// generated at build time, so list/count views don't need to touch shards.
//
// All public functions throw a typed `GreContentError` on missing/invalid
// data so callers can render a clean error boundary.

import "server-only";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { z } from "zod";

// Mirror of content/gre/schema.ts (we cannot import .ts from runtime
// directly in a Next build, so duplicate the schemas here; the validator
// script checks the .ts file independently).
const Difficulty = z.enum(["easy", "medium", "hard"]);
const base = {
  id: z.string().regex(/^q-[a-z]{3}-\d{3,}$/),
  topic: z.string(),
  subtopic: z.string(),
  difficulty: Difficulty,
  tags: z.array(z.string()).default([]),
};
const QuantQuestion = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("mcq"), stem: z.string(), choices: z.array(z.string()).min(2), answer: z.number().int().nonnegative() }),
  z.object({ ...base, type: z.literal("multi"), stem: z.string(), choices: z.array(z.string()).min(2), answer: z.array(z.number().int().nonnegative()).min(1) }),
  z.object({ ...base, type: z.literal("qc"), quantityA: z.string(), quantityB: z.string(), common: z.string().optional(), answer: z.enum(["A", "B", "C", "D"]) }),
  z.object({ ...base, type: z.literal("numeric"), stem: z.string(), answer: z.number() }),
]);
const VocabWord = z.object({
  id: z.string().regex(/^v-\d{4,}$/),
  word: z.string(),
  pos: z.enum(["n", "v", "adj", "adv"]),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  definition: z.string(),
  synonyms: z.array(z.string()).min(1),
  antonyms: z.array(z.string()),
  example: z.string(),
});

export type QuantQuestion = z.infer<typeof QuantQuestion>;
export type VocabWord = z.infer<typeof VocabWord>;
export type QuestionType = "mcq" | "multi" | "qc" | "numeric";
export type Difficulty = "easy" | "medium" | "hard";

export type Taxonomy = {
  version: number;
  quant: Array<{ slug: string; title: string; subtopics: string[] }>;
  questionTypes: Record<QuestionType, string>;
  qcChoices: string[];
  difficulty: Difficulty[];
  vocabTiers: Record<"1" | "2" | "3", string>;
};

export type Manifest = {
  generatedAt: string;
  quant: Record<string, { count: number; easy: number; medium: number; hard: number; shards: number }>;
  vocab: Record<string, { count: number }>;
  totals: { quant: number; vocab: number };
};

export class GreContentError extends Error {
  code: "not_found" | "invalid";
  constructor(code: "not_found" | "invalid", message: string) {
    super(message);
    this.name = "GreContentError";
    this.code = code;
  }
}

// --- path helpers ---------------------------------------------------------

// In dev, content lives at <repo>/web/content/gre. process.cwd() at request
// time is the web/ root.
const CONTENT_ROOT = join(process.cwd(), "content", "gre");

function readJson<T>(rel: string): T {
  const full = join(CONTENT_ROOT, rel);
  if (!existsSync(full)) throw new GreContentError("not_found", `Missing content: ${rel}`);
  try {
    return JSON.parse(readFileSync(full, "utf8")) as T;
  } catch (e) {
    throw new GreContentError("invalid", `Cannot parse ${rel}: ${(e as Error).message}`);
  }
}

// --- caches ---------------------------------------------------------------

let taxonomyCache: Taxonomy | null = null;
let manifestCache: Manifest | null = null;
const questionCache = new Map<string, QuantQuestion>();
const allQuestionsByTopic: Map<string, QuantQuestion[]> = new Map();
let allQuestions: QuantQuestion[] | null = null;
const vocabBySet: Map<string, VocabWord[]> = new Map();
const wordById: Map<string, VocabWord> = new Map();

function loadTaxonomy(): Taxonomy {
  if (taxonomyCache) return taxonomyCache;
  taxonomyCache = readJson<Taxonomy>("taxonomy.json");
  return taxonomyCache;
}

function loadManifest(): Manifest {
  if (manifestCache) return manifestCache;
  // Validator writes this file. If missing (fresh checkout before build),
  // fall back to scanning the shards directly.
  try {
    manifestCache = readJson<Manifest>("manifest.json");
    return manifestCache;
  } catch {
    // Fallback: scan now.
    const tax = loadTaxonomy();
    const out: Manifest = {
      generatedAt: new Date().toISOString(),
      quant: {},
      vocab: {},
      totals: { quant: 0, vocab: 0 },
    };
    for (const t of tax.quant) {
      const list = loadQuestionListByTopic(t.slug, {}, Infinity);
      out.quant[t.slug] = {
        count: list.length,
        easy: list.filter((q) => q.difficulty === "easy").length,
        medium: list.filter((q) => q.difficulty === "medium").length,
        hard: list.filter((q) => q.difficulty === "hard").length,
        shards: 0,
      };
      out.totals.quant += list.length;
    }
    for (const set of listVocabSets()) {
      const words = loadVocabSet(set);
      out.vocab[set] = { count: words.length };
      out.totals.vocab += words.length;
    }
    manifestCache = out;
    return out;
  }
}

function loadQuestionListByTopic(slug: string, filters: QuestionFilters, pageSize: number): QuantQuestion[] {
  // Per-topic cache; build once on first access.
  let list = allQuestionsByTopic.get(slug);
  if (!list) {
    list = [];
    const dir = join(CONTENT_ROOT, "quant", slug);
    if (existsSync(dir)) {
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
        const raw = readJson<unknown[]>(`quant/${slug}/${f}`);
        for (const item of raw) {
          const parsed = QuantQuestion.safeParse(item);
          if (!parsed.success) {
            throw new GreContentError("invalid", `Invalid question in ${slug}/${f}: ${parsed.error.message}`);
          }
          list.push(parsed.data);
        }
      }
    }
    allQuestionsByTopic.set(slug, list);
  }
  let filtered = list;
  if (filters.difficulty) filtered = filtered.filter((q) => q.difficulty === filters.difficulty);
  if (filters.type) filtered = filtered.filter((q) => q.type === filters.type);
  if (filters.subtopic) filtered = filtered.filter((q) => q.subtopic === filters.subtopic);
  return pageSize === Infinity ? filtered : filtered.slice(0, pageSize);
}

// --- public API -----------------------------------------------------------

export type QuestionFilters = {
  difficulty?: Difficulty;
  type?: QuestionType;
  subtopic?: string;
};

export function getTopics() {
  return loadTaxonomy().quant.map((t) => ({ slug: t.slug, title: t.title, subtopics: t.subtopics }));
}

export function getTaxonomy(): Taxonomy {
  return loadTaxonomy();
}

export function getManifest(): Manifest {
  return loadManifest();
}

export function getQuestionList(topic: string, filters: QuestionFilters = {}, page = 25) {
  return loadQuestionListByTopic(topic, filters, page);
}

export function getAllQuestions(): QuantQuestion[] {
  if (allQuestions) return allQuestions;
  const out: QuantQuestion[] = [];
  for (const t of loadTaxonomy().quant) out.push(...loadQuestionListByTopic(t.slug, {}, Infinity));
  allQuestions = out;
  return out;
}

export function getQuestion(id: string): QuantQuestion | null {
  if (questionCache.has(id)) return questionCache.get(id)!;
  for (const q of getAllQuestions()) {
    questionCache.set(q.id, q);
    if (q.id === id) return q;
  }
  return null;
}

export function getVocabSets(): { id: string; count: number }[] {
  return Object.entries(loadManifest().vocab).map(([id, v]) => ({ id, count: v.count }));
}

export function getVocabSet(setId: string): VocabWord[] {
  if (vocabBySet.has(setId)) return vocabBySet.get(setId)!;
  const list = readJson<unknown[]>(`vocab/${setId}.json`);
  const out: VocabWord[] = [];
  for (const item of list) {
    const parsed = VocabWord.safeParse(item);
    if (!parsed.success) {
      throw new GreContentError("invalid", `Invalid word in ${setId}: ${parsed.error.message}`);
    }
    out.push(parsed.data);
    wordById.set(parsed.data.id, parsed.data);
  }
  vocabBySet.set(setId, out);
  return out;
}

export function listVocabSets(): string[] {
  const dir = join(CONTENT_ROOT, "vocab");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^set-\d+\.json$/.test(f))
    .map((f) => f.replace(".json", ""))
    .sort();
}

export function getWord(id: string): VocabWord | null {
  if (wordById.has(id)) return wordById.get(id)!;
  for (const set of listVocabSets()) {
    for (const w of getVocabSet(set)) {
      if (w.id === id) return w;
    }
  }
  return null;
}

export function getRoadmap(): { version: number; weeks: Array<{ title: string; days: Array<{ day: number; task: string }> }> } {
  return readJson("roadmap.json");
}

export function getTopicNotes(topic: string): string {
  // notes are markdown files; loaded as raw text and rendered server-side.
  const path = join(CONTENT_ROOT, "notes", `${topic}.md`);
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
}
