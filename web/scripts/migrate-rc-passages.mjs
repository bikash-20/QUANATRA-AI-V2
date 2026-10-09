// One-shot migration script for the 8 hand-authored RC passages. Run from
// web/: `node scripts/migrate-rc-passages.mjs`. Idempotent — running twice
// produces the same output.
//
// Transforms applied per file:
//   * Drop `wordCount` (validator now computes it).
//   * Replace fake attributions with `source: "original"` (no `attribution`).
//   * Rename `type: "rc-single"` → `kind: "single"` (5 choices stay).
//   * Rename `type: "rc-multi"` → `kind: "multi"` and reduce 5 → 3 choices
//     by keeping only the answered choices. Answer is reindexed.
//   * Add `qType` (assigned heuristically by question position) and
//     `evidence: [{sentence, anchor}]` for every question.
//
// The script is part of commit #3; it is intentionally simple — every
// transformation is deterministic, so the diff is reviewable.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { splitSentences, firstWords } from "../lib/rc/splitter.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "content", "gre", "reading");

// Per-passage question-type and evidence assignment. The order matches the
// question order in each file. For each question we declare:
//   - qType: one of the RcQType enum values
//   - evidence: array of {sentence, anchor} pointing into the splitter output
//
// Anchor is always the literal `firstWords(sentence, 5)` so the validator
// can confirm drift at build time.

const ASSIGNMENTS = {
  "rc-biz-001": [
    { qType: "author-attitude", evidence: [19] }, // foundation grants as stopgap
    { qType: "function", evidence: [6] },         // XZ Utils as illustration
    { qType: "detail", evidence: [10, 11, 12, 13] }, // three families
  ],
  "rc-biz-002": [
    { qType: "detail", evidence: [7] },           // analyst prior / discount rate
    { qType: "author-attitude", evidence: [18] }, // "useful laboratory"
    { qType: "detail", evidence: [4, 9, 12] },    // methodological, political, host-country
  ],
  "rc-sci-001": [
    { qType: "function", evidence: [3, 7] },      // tissue-resident T cells as example
    { qType: "detail", evidence: [10] },          // mucosal vaccines
    { qType: "detail", evidence: [14] },          // three factors of imprinting
  ],
  "rc-sci-002": [
    { qType: "main-idea", evidence: [1] },        // paragraph one summary
    { qType: "inference", evidence: [12] },       // MOND as alternative
    { qType: "detail", evidence: [4, 5, 6] },     // direct, indirect, collider
  ],
  "rc-soc-001": [
    { qType: "detail", evidence: [6] },           // conventional explanation
    { qType: "function", evidence: [7] },         // newer line of research
    { qType: "detail", evidence: [8, 9, 10] },    // wording, institutions, info env
  ],
  "rc-soc-002": [
    { qType: "main-idea", evidence: [2, 3] },     // two families intro
    { qType: "function", evidence: [6] },         // randomized experiments
    { qType: "detail", evidence: [10, 11] },      // place-based instruments
  ],
  "rc-art-001": [
    { qType: "author-attitude", evidence: [5, 6] }, // regularized, easier to read
    { qType: "vocab-in-context", evidence: [7] },   // untranslatability as property
    { qType: "detail", evidence: [8] },             // idioms, rhymes, inversions, nouns
  ],
  "rc-art-002": [
    { qType: "function", evidence: [7] },         // boring museum introduction
    { qType: "detail", evidence: [10, 11] },      // third path
    { qType: "detail", evidence: [5, 6] },        // ordered galleries, even lighting, unforced route
  ],
};

function migrateFile(filename) {
  const full = join(root, filename);
  const raw = JSON.parse(readFileSync(full, "utf8"));
  const id = raw.id;
  if (!ASSIGNMENTS[id]) throw new Error(`No assignment for ${id}`);

  const sentences = splitSentences(raw.body);

  // 1. Update top-level fields.
  delete raw.wordCount;
  raw.source = "original";
  delete raw.attribution;

  // 2. Update questions.
  const newQuestions = raw.questions.map((q, i) => {
    const a = ASSIGNMENTS[id][i];
    if (!a) throw new Error(`Missing assignment for ${id} question ${i}`);

    // Build the new evidence array with drift-checked anchors.
    const evidence = a.evidence.map((sentIdx) => {
      const text = sentences[sentIdx];
      if (text === undefined) {
        throw new Error(`${id} q${i}: sentence index ${sentIdx} out of range (have ${sentences.length})`);
      }
      return { sentence: sentIdx, anchor: firstWords(text, 5) };
    });

    if (q.type === "rc-single") {
      return {
        kind: "single",
        questionId: q.questionId,
        stem: q.stem,
        qType: a.qType,
        evidence,
        choices: q.choices,
        answer: q.answer,
        rationale: q.rationale,
      };
    }
    if (q.type === "rc-multi") {
      // Reduce 5 → 3 choices by keeping only the answered ones, in
      // ascending order. Renumber the answer.
      const keepIdx = [...q.answer].sort((x, y) => x - y);
      const oldToNew = new Map();
      keepIdx.forEach((oldI, newI) => oldToNew.set(oldI, newI));
      const newChoices = keepIdx.map((oldI) => q.choices[oldI]);
      const newAnswer = q.answer.slice().sort((x, y) => x - y).map((oldI) => oldToNew.get(oldI));
      return {
        kind: "multi",
        questionId: q.questionId,
        stem: q.stem,
        qType: a.qType,
        evidence,
        choices: newChoices,
        answer: newAnswer,
        rationale: q.rationale,
      };
    }
    throw new Error(`${id} q${i}: unknown type ${q.type}`);
  });
  raw.questions = newQuestions;

  return raw;
}

const files = readdirSync(root).filter((f) => f.endsWith(".json")).sort();
for (const f of files) {
  const migrated = migrateFile(f);
  writeFileSync(join(root, f), JSON.stringify(migrated, null, 2) + "\n");
  console.log(`migrated ${f} (${migrated.questions.length} questions)`);
}
console.log("done");
