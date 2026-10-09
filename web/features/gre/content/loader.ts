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
import { join } from "node:path";
import { z } from "zod";
import {
  DEFAULT_CACHE_TTL_MS,
  enforceSizeGuard,
  MapWithTTL,
  MAX_CACHE_ENTRIES,
  TtlSlot,
} from "./cache";

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

// Reading comprehension shapes. Mirrors content/gre/schema.ts. The category
// set is closed at 4 entries — extend `reading` in taxonomy.json first.
//
// The legacy `ReadingQuestion` / `ReadingPassage` shape is kept for the
// migration window (commit #1 introduces the Rc* types but does not
// migrate the data files). After commit #3 the data will use the Rc* shape
// exclusively and this file can drop the legacy shim.
const ReadingCategory = z.enum(["business", "science", "social-science", "arts"]);
const readingBaseShape = {
  id: z.string().regex(/^rc-[a-z]{2,4}-\d{3}$/),
  category: ReadingCategory,
  title: z.string(),
  source: z.string(),
  wordCount: z.number().int(),
  body: z.string(),
  difficulty: Difficulty,
  tags: z.array(z.string()),
};
const ReadingQuestion = z.discriminatedUnion("type", [
  z.object({ questionId: z.string(), stem: z.string(), choices: z.array(z.string()).length(5), rationale: z.string(), type: z.literal("rc-single"), answer: z.number().int().min(0).max(4) }),
  z.object({ questionId: z.string(), stem: z.string(), choices: z.array(z.string()).length(5), rationale: z.string(), type: z.literal("rc-multi"), answer: z.array(z.number().int().min(0).max(4)).min(1).max(3) }),
]);
const ReadingPassage = z.object({ ...readingBaseShape, questions: z.array(ReadingQuestion).min(3).max(5) });

// --- Upgraded RC schema (mirror) ------------------------------------------

const RcSource = z.enum(["original", "ai", "external"]);
const RcQType = z.enum([
  "main-idea", "detail", "inference", "author-attitude",
  "function", "structure", "vocab-in-context", "strengthen-weaken",
]);
const RcQuestionKind = z.enum(["single", "multi", "select-sentence"]);
const RcEvidence = z.object({
  sentence: z.number().int().min(0),
  anchor: z.string().min(8).max(80),
});
const rcBase = {
  questionId: z.string().regex(/^q-rc-[a-z0-9-]+$/),
  stem: z.string().min(10).max(800),
  qType: RcQType,
  evidence: z.array(RcEvidence).min(1).max(4),
  rationale: z.string().min(20).max(800),
};
const RcQuestion = z.discriminatedUnion("kind", [
  z.object({ ...rcBase, kind: z.literal("single"), choices: z.array(z.string().min(1).max(400)).length(5), answer: z.number().int().min(0).max(4) }),
  z.object({ ...rcBase, kind: z.literal("multi"), choices: z.array(z.string().min(1).max(400)).length(3), answer: z.array(z.number().int().min(0).max(2)).min(1).max(3) }),
  z.object({ ...rcBase, kind: z.literal("select-sentence"), answer: z.number().int().min(0) }),
]);
const RcPassage = z.object({
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

export type QuantQuestion = z.infer<typeof QuantQuestion>;
export type VocabWord = z.infer<typeof VocabWord>;
export type ReadingQuestion = z.infer<typeof ReadingQuestion>;
export type ReadingPassage = z.infer<typeof ReadingPassage>;
export type RcSource = z.infer<typeof RcSource>;
export type RcQType = z.infer<typeof RcQType>;
export type RcQuestionKind = z.infer<typeof RcQuestionKind>;
export type RcEvidence = z.infer<typeof RcEvidence>;
export type RcQuestion = z.infer<typeof RcQuestion>;
export type RcPassage = z.infer<typeof RcPassage>;
export type ReadingCategoryType = z.infer<typeof ReadingCategory>;
export type QuestionType = "mcq" | "multi" | "qc" | "numeric" | "rc-single" | "rc-multi" | "rc-single-answer" | "rc-multi-answer" | "rc-sentence";
export type Difficulty = "easy" | "medium" | "hard";

export type Taxonomy = {
  version: number;
  quant: Array<{ slug: string; title: string; subtopics: string[] }>;
  questionTypes: Record<QuestionType, string>;
  qcChoices: string[];
  difficulty: Difficulty[];
  vocabTiers: Record<"1" | "2" | "3", string>;
  reading: ReadingCategoryType[];
};

export type ReadingCategoryBucket = {
  count: number;          // question count (post-migration)
  easy: number;           // easy-question count
  medium: number;
  hard: number;
  shards: number;
  passages: number;
  questions: number;      // explicit question count
  byQType: Partial<Record<string, number>>;
};

export type Manifest = {
  generatedAt: string;
  quant: Record<string, { count: number; easy: number; medium: number; hard: number; shards: number }>;
  vocab: Record<string, { count: number }>;
  reading?: Record<ReadingCategoryType, ReadingCategoryBucket>;
  totals: { quant: number; vocab: number; reading?: number };
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

// TTL primitives live in ./cache.ts so they can be unit-tested without
// pulling in "server-only" or any Node-only deps. See cache.ts for the
// 60s default + 5,000-entry cap rationale.

const taxonomySlot = new TtlSlot<Taxonomy>();
const manifestSlot = new TtlSlot<Manifest>();
const allQuestionsSlot = new TtlSlot<QuantQuestion[]>();
const questionCache = new MapWithTTL<string, QuantQuestion>();
const allQuestionsByTopic = new MapWithTTL<string, QuantQuestion[]>();
const vocabBySet = new MapWithTTL<string, VocabWord[]>();
const wordById = new MapWithTTL<string, VocabWord>();
const passagesByCategory = new MapWithTTL<string, ReadingPassage[]>();
const passageById = new MapWithTTL<string, ReadingPassage>();
const allPassagesSlot = new TtlSlot<ReadingPassage[]>();

function loadTaxonomy(): Taxonomy {
  const cached = taxonomySlot.read();
  if (cached) return cached;
  const value = readJson<Taxonomy>("taxonomy.json");
  taxonomySlot.write(value);
  return value;
}

function loadManifest(): Manifest {
  const cached = manifestSlot.read();
  if (cached) return cached;
  // Validator writes this file. If missing (fresh checkout before build),
  // fall back to scanning the shards directly.
  try {
    const value = readJson<Manifest>("manifest.json");
    manifestSlot.write(value);
    return value;
  } catch {
    // Fallback: scan now.
    const tax = loadTaxonomy();
    const out: Manifest = {
      generatedAt: new Date().toISOString(),
      quant: {},
      vocab: {},
      reading: {} as Record<ReadingCategoryType, ReadingCategoryBucket>,
      totals: { quant: 0, vocab: 0, reading: 0 },
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
      const words = getVocabSet(set);
      out.vocab[set] = { count: words.length };
      out.totals.vocab += words.length;
    }
    // Reading fallback.
    const readingCats: ReadingCategoryType[] = tax.reading ?? ["business", "science", "social-science", "arts"];
    for (const cat of readingCats) {
      const list = getPassageList(cat);
      const questionCount = list.reduce((s, p) => s + (Array.isArray(p.questions) ? p.questions.length : 0), 0);
      out.reading![cat] = {
        count: questionCount,
        easy: list.filter((p) => p.difficulty === "easy").length,
        medium: list.filter((p) => p.difficulty === "medium").length,
        hard: list.filter((p) => p.difficulty === "hard").length,
        shards: 0,
        passages: list.length,
        questions: questionCount,
        byQType: {},
      };
      out.totals.reading = (out.totals.reading ?? 0) + questionCount;
    }
    manifestSlot.write(out);
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
    enforceSizeGuard([questionCache, allQuestionsByTopic, vocabBySet, wordById] as Array<MapWithTTL<unknown, unknown>>, MAX_CACHE_ENTRIES);
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
  const cached = allQuestionsSlot.read();
  if (cached) return cached;
  const out: QuantQuestion[] = [];
  for (const t of loadTaxonomy().quant) out.push(...loadQuestionListByTopic(t.slug, {}, Infinity));
  allQuestionsSlot.write(out);
  return out;
}

export function getQuestion(id: string): QuantQuestion | null {
  const cached = questionCache.get(id);
  if (cached) return cached;
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
  const cached = vocabBySet.get(setId);
  if (cached) return cached;
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
  enforceSizeGuard([questionCache, allQuestionsByTopic, vocabBySet, wordById] as Array<MapWithTTL<unknown, unknown>>, MAX_CACHE_ENTRIES);
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
  const cached = wordById.get(id);
  if (cached) return cached;
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

// --- reading comprehension API --------------------------------------------

export function getReadingCategories(): ReadingCategoryType[] {
  return loadTaxonomy().reading ?? (["business", "science", "social-science", "arts"] as ReadingCategoryType[]);
}

export function listReadingCategoryDirs(): ReadingCategoryType[] {
  // Subset that actually has authored passages on disk. Used to gracefully
  // hide categories that have zero passages (e.g. before any AI fill has run).
  const all = getReadingCategories();
  return all.filter((c) => {
    const dir = join(CONTENT_ROOT, "reading");
    if (!existsSync(dir)) return false;
    const files = readdirSync(dir).filter((f) => f.startsWith(`${c}-`));
    return files.length > 0;
  });
}

function loadReadingCategory(category: ReadingCategoryType): ReadingPassage[] {
  const cached = passagesByCategory.get(category);
  if (cached) return cached;
  const list: ReadingPassage[] = [];
  const dir = join(CONTENT_ROOT, "reading");
  if (existsSync(dir)) {
    const files = readdirSync(dir).filter((f) => f.startsWith(`${category}-`) && f.endsWith(".json")).sort();
    for (const f of files) {
      const raw = readJson<unknown>(`reading/${f}`);
      // After commit #3 the data uses the upgraded RcPassage shape.
      // We try the new schema first; if it fails, fall back to the
      // legacy ReadingPassage schema for any in-flight files that have
      // not been migrated yet.
      const parsed = RcPassage.safeParse(raw);
      if (!parsed.success) {
        const legacy = ReadingPassage.safeParse(raw);
        if (!legacy.success) {
          throw new GreContentError("invalid", `Invalid passage in reading/${f}: ${parsed.error.message}`);
        }
        list.push(legacy.data as unknown as ReadingPassage);
        continue;
      }
      list.push(parsed.data as unknown as ReadingPassage);
    }
  }
  passagesByCategory.set(category, list);
  enforceSizeGuard([questionCache, allQuestionsByTopic, vocabBySet, wordById, passagesByCategory, passageById] as Array<MapWithTTL<unknown, unknown>>, MAX_CACHE_ENTRIES);
  return list;
}

export function getPassageList(category: ReadingCategoryType): ReadingPassage[] {
  return loadReadingCategory(category);
}

export function getPassage(id: string): ReadingPassage | null {
  const cached = passageById.get(id);
  if (cached) return cached;
  for (const cat of getReadingCategories()) {
    for (const p of loadReadingCategory(cat)) {
      passageById.set(p.id, p);
      if (p.id === id) return p;
    }
  }
  return null;
}

export function getAllReadingPassages(): ReadingPassage[] {
  const cached = allPassagesSlot.read();
  if (cached) return cached;
  const out: ReadingPassage[] = [];
  for (const cat of getReadingCategories()) out.push(...loadReadingCategory(cat));
  allPassagesSlot.write(out);
  return out;
}

export function getReadingManifestSlice(): NonNullable<Manifest["reading"]> {
  return (getManifest().reading ?? {}) as NonNullable<Manifest["reading"]>;
}
