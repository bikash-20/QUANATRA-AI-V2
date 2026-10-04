// Dependency-free content validator + manifest generator.
// Layout: content/gre/quant/<topic>/<topic>-NN.json, content/gre/vocab/set-NN.json
// Usage: node scripts/validate-gre.mjs   (exit code 1 on any error)
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "content", "gre");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));
const errors = [];
const err = (m) => errors.push(m);
const tax = read("taxonomy.json");
const topics = new Map(tax.quant.map((t) => [t.slug, new Set(t.subtopics)]));
const ids = new Set();
const manifest = { generatedAt: new Date().toISOString(), quant: {}, vocab: {} };

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

manifest.totals = {
  quant: Object.values(manifest.quant).reduce((s, t) => s + t.count, 0),
  vocab: Object.values(manifest.vocab).reduce((s, v) => s + v.count, 0),
};

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
writeFileSync(join(root, "manifest.json"), JSON.stringify(manifest, null, 1));
console.log("OK", JSON.stringify(manifest.totals), JSON.stringify(manifest.quant), JSON.stringify(manifest.vocab));