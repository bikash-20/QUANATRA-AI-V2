// Quick helper to check a single vocab set for duplicates against the existing corpus.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = "content/gre/vocab";
const allWords = new Set();
for (const f of readdirSync(root).filter((x) => /^set-\d+\.json$/.test(x))) {
  const list = JSON.parse(readFileSync(join(root, f), "utf8"));
  for (const v of list) allWords.add(v.word.toLowerCase());
}
const target = process.argv[2];
if (!target) { console.error("usage: node scripts/check-vocab-dups.mjs <set-file>"); process.exit(1); }
const list = JSON.parse(readFileSync(join(root, target), "utf8"));
// We want to find cross-dups with the rest of the corpus, so build that set excluding this file.
const corpusWords = new Set();
for (const f of readdirSync(root).filter((x) => /^set-\d+\.json$/.test(x) && x !== target)) {
  const l = JSON.parse(readFileSync(join(root, f), "utf8"));
  for (const v of l) corpusWords.add(v.word.toLowerCase());
}
const dups = [];
for (const v of list) {
  if (corpusWords.has(v.word.toLowerCase())) dups.push(v.word.toLowerCase());
}
const comp = {};
for (const v of list) comp[v.tier] = (comp[v.tier] || 0) + 1;
const pos = {};
for (const v of list) pos[v.pos] = (pos[v.pos] || 0) + 1;
const inSetDups = list.length - new Set(list.map(v => v.word.toLowerCase())).size;
console.log("items:", list.length, "in-set-dups:", inSetDups, "cross-dups:", dups.length);
if (dups.length) console.log("CROSS-DUPS:", dups);
console.log("tiers:", comp);
console.log("pos:", pos);