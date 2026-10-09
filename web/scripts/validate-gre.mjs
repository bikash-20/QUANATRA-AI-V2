// Dependency-free content validator + manifest generator.
// Layout:
//   content/gre/quant/<topic>/<topic>-NN.json
//   content/gre/vocab/set-NN.json
//   content/gre/reading/<category>-NNN.json
// Usage: node scripts/validate-gre.mjs   (exit code 1 on any error)
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "content", "gre");
const publicOut = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "gre-data");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const errors = [];
const err = (m) => errors.push(m);
const tax = read("taxonomy.json");
const topics = new Map(tax.quant.map((t) => [t.slug, new Set(t.subtopics)]));
const ids = new Set();
const manifest = { generatedAt: new Date().toISOString(), quant: {}, vocab: {}, reading: {} };

// Walk content/gre/quant/<topic>/<topic>-NN.json
const quantDir = join(root, "quant");
for (const topicSlug of readdirSync(quantDir)) {
  const topicPath = join(quantDir, topicSlug);
  if (!topicPath.endsWith("/") && !readdirSync(topicPath).length) continue;
  const files = readdirSync(topicPath).filter((f) => f.endsWith(".json"));
  if (!files.length) continue;
  manifest.quant[topicSlug] = { count: 0, easy: 0, medium: 0, hard: 0, shards: files.length };
  for (const f of files.sort()) {
    const list = read(`quant/${topicSlug}/${f}`);
    for (const q of list) {
      const w = `quant/${topicSlug}/${f}:${q.id}`;
      if (ids.has(q.id)) err(`${w} duplicate id`);
      ids.add(q.id);
      if (q.topic !== topicSlug) err(`${w} topic mismatch (got ${q.topic})`);
      if (!topics.get(q.topic)?.has(q.subtopic)) err(`${w} unknown subtopic ${q.subtopic}`);
      if (!["easy", "medium", "hard"].includes(q.difficulty)) err(`${w} bad difficulty`);
      else manifest.quant[topicSlug][q.difficulty]++;
      manifest.quant[topicSlug].count++;
      if (q.type === "mcq" || q.type === "multi") {
        if (new Set(q.choices).size !== q.choices.length) err(`${w} duplicate choices`);
        const a = q.type === "mcq" ? [q.answer] : q.answer;
        if (!a.every((i) => Number.isInteger(i) && i >= 0 && i < q.choices.length))
          err(`${w} answer out of range`);
        if (q.type === "mcq" && q.choices.length !== 5) err(`${w} mcq should have 5 choices`);
      } else if (q.type === "qc") {
        if (!"ABCD".includes(q.answer) || !q.quantityA || !q.quantityB) err(`${w} bad qc`);
      } else if (q.type === "numeric") {
        if (typeof q.answer !== "number" || !Number.isFinite(q.answer)) err(`${w} bad numeric`);
      } else err(`${w} unknown type`);
    }
  }
}

const words = new Set();
const vocabDir = join(root, "vocab");
for (const f of readdirSync(vocabDir).filter((x) => /^set-\d+\.json$/.test(x))) {
  const list = read(`vocab/${f}`);
  manifest.vocab[f.replace(".json", "")] = { count: list.length };
  for (const v of list) {
    const w = `vocab/${f}:${v.id}`;
    if (ids.has(v.id)) err(`${w} duplicate id (cross-set)`);
    ids.add(v.id);
    if (words.has(v.word.toLowerCase())) err(`${w} duplicate word ${v.word}`);
    words.add(v.word.toLowerCase());
    if (![1, 2, 3].includes(v.tier)) err(`${w} bad tier`);
    if (!v.definition || !v.example || !v.synonyms?.length) err(`${w} missing fields`);
    // example must actually use the word
    const needle = v.word.slice(0, Math.max(4, v.word.length - 3)).toLowerCase();
    if (!v.example.toLowerCase().includes(needle)) err(`${w} example does not use the word`);
  }
}

// --- reading comprehension -------------------------------------------------
// One passage per file. Layout: content/gre/reading/<category>-NNN.json
const readingDir = join(root, "reading");
const validReadingCats = new Set(tax.reading ?? []);
const seenPassageIds = new Set();
const seenQuestionIds = new Set();

// Pre-seed empty buckets so the manifest always exposes a count per category.
for (const cat of validReadingCats) {
  manifest.reading[cat] = { count: 0, easy: 0, medium: 0, hard: 0, shards: 0, passages: 0 };
}

if (existsSync(readingDir)) {
  const readingFiles = readdirSync(readingDir).filter((f) => f.endsWith(".json")).sort();
  for (const f of readingFiles) {
    const m = /^(business|science|social-science|arts)-\d{3}\.json$/.exec(f);
    if (!m) err(`reading/${f} filename must be <category>-NNN.json with one of business|science|social-science|arts`);
    const category = m?.[1];
    if (!category) continue;
    const raw = read(`reading/${f}`);
    if (!raw || typeof raw !== "object") err(`reading/${f} must be a single passage object`);
    if (raw.category && raw.category !== category) err(`reading/${f} category mismatch (file=${category}, body=${raw.category})`);
    if (!validReadingCats.has(raw.category)) err(`reading/${f} unknown category ${raw.category}`);
    if (!raw.id || seenPassageIds.has(raw.id)) err(`reading/${f} duplicate or missing passage id ${raw.id}`);
    seenPassageIds.add(raw.id);
    if (!/^rc-[a-z]{2,4}-\d{3}$/.test(raw.id)) err(`reading/${f} passage id ${raw.id} must match rc-<cat>-NNN`);
    if (!raw.title || raw.title.length < 8) err(`reading/${f} title too short`);
    if (!raw.source) err(`reading/${f} source required`);
    if (!Number.isInteger(raw.wordCount) || raw.wordCount < 100 || raw.wordCount > 1500) err(`reading/${f} wordCount out of range`);
    if (!raw.body || raw.body.length < 400) err(`reading/${f} body too short`);
    if (!["easy", "medium", "hard"].includes(raw.difficulty)) err(`reading/${f} bad difficulty ${raw.difficulty}`);
    if (!Array.isArray(raw.questions) || raw.questions.length < 3 || raw.questions.length > 5)
      err(`reading/${f} questions must be array of 3-5`);
    const bucket = manifest.reading[raw.category] ?? (manifest.reading[raw.category] = { count: 0, easy: 0, medium: 0, hard: 0, shards: 0, passages: 0 });
    bucket[raw.difficulty] += 1;
    bucket.count += 1;
    bucket.passages += 1;
    for (const q of raw.questions ?? []) {
      if (!q.questionId) err(`reading/${f} question missing id`);
      if (seenQuestionIds.has(q.questionId)) err(`reading/${f} duplicate questionId ${q.questionId}`);
      seenQuestionIds.add(q.questionId);
      if (!q.stem || q.stem.length < 10) err(`reading/${f}:${q.questionId} stem too short`);
      if (!Array.isArray(q.choices) || q.choices.length !== 5) err(`reading/${f}:${q.questionId} must have 5 choices`);
      if (q.choices && new Set(q.choices).size !== q.choices.length) err(`reading/${f}:${q.questionId} duplicate choices`);
      if (!q.rationale || q.rationale.length < 20) err(`reading/${f}:${q.questionId} rationale too short`);
      if (q.type === "rc-single") {
        if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 4) err(`reading/${f}:${q.questionId} rc-single answer out of range`);
      } else if (q.type === "rc-multi") {
        if (!Array.isArray(q.answer) || q.answer.length < 1 || q.answer.length > 3) err(`reading/${f}:${q.questionId} rc-multi must have 1-3 answers`);
        if (!q.answer.every((i) => Number.isInteger(i) && i >= 0 && i < 5)) err(`reading/${f}:${q.questionId} rc-multi answer index out of range`);
        if (new Set(q.answer).size !== q.answer.length) err(`reading/${f}:${q.questionId} rc-multi duplicate answers`);
      } else err(`reading/${f}:${q.questionId} unknown type ${q.type}`);
    }
  }
  for (const cat of validReadingCats) {
    manifest.reading[cat].shards = Object.values(manifest.reading).reduce((s, c) => s + c.passages, 0);
  }
  // The above shards aggregate looks wrong; recompute as total passages across all reading categories.
  const totalPassages = Object.values(manifest.reading).reduce((s, c) => s + c.passages, 0);
  for (const cat of validReadingCats) manifest.reading[cat].shards = totalPassages;
}

manifest.totals = {
  quant: Object.values(manifest.quant).reduce((s, t) => s + t.count, 0),
  vocab: Object.values(manifest.vocab).reduce((s, v) => s + v.count, 0),
  reading: Object.values(manifest.reading).reduce((s, c) => s + c.count, 0),
};

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
mkdirSync(publicOut, { recursive: true });
writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest, null, 1));
writeFileSync(join(publicOut, "manifest.json"), JSON.stringify(manifest, null, 1));
writeFileSync(join(publicOut, "taxonomy.json"), JSON.stringify(tax, null, 1));
console.log("OK", JSON.stringify(manifest.totals), JSON.stringify(manifest.quant), JSON.stringify(manifest.vocab), JSON.stringify(manifest.reading));