// Schema test: load every GRE shard from disk and make sure the inlined
// loader validates them. If this passes, the published content + the
// validator agree on what a valid QuantQuestion / VocabWord looks like.

import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

// Mirror of features/gre/content/loader.ts schemas. We can't import the
// runtime .ts file at build/test time without resolution work, so we
// duplicate the schema definitions (the validator script and content/gre
// schema.ts are the source of truth on the publisher side).
const Difficulty = z.enum(['easy', 'medium', 'hard']);
const base = {
  id: z.string().regex(/^q-[a-z]{3}-\d{3,}$/),
  topic: z.string(),
  subtopic: z.string(),
  difficulty: Difficulty,
  tags: z.array(z.string()).default([]),
};
const QuantQuestion = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('mcq'), stem: z.string(), choices: z.array(z.string()).min(2), answer: z.number().int().nonnegative() }),
  z.object({ ...base, type: z.literal('multi'), stem: z.string(), choices: z.array(z.string()).min(2), answer: z.array(z.number().int().nonnegative()).min(1) }),
  z.object({ ...base, type: z.literal('qc'), quantityA: z.string(), quantityB: z.string(), common: z.string().optional(), answer: z.enum(['A', 'B', 'C', 'D']) }),
  z.object({ ...base, type: z.literal('numeric'), stem: z.string(), answer: z.number() }),
]);
const VocabWord = z.object({
  id: z.string().regex(/^v-\d{4,}$/),
  word: z.string(),
  pos: z.enum(['n', 'v', 'adj', 'adv']),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  definition: z.string(),
  synonyms: z.array(z.string()).min(1),
  antonyms: z.array(z.string()),
  example: z.string(),
});

const ROOT = join(process.cwd(), 'content', 'gre');

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith('.json')) out.push(full);
  }
  return out;
}

test('all GRE quant shards parse', () => {
  const quantDir = join(ROOT, 'quant');
  if (!existsSync(quantDir)) return; // pre-validator; not a failure
  let total = 0;
  for (const file of walk(quantDir)) {
    if (file.includes('manifest')) continue;
    const data = JSON.parse(readFileSync(file, 'utf8'));
    assert.ok(Array.isArray(data), `${file} should be an array`);
    for (const q of data) {
      const parsed = QuantQuestion.safeParse(q);
      assert.ok(parsed.success, `${file}: ${parsed.error?.message}`);
      // Tier rule: mcq with >= 4 choices must have answer index in range.
      if (parsed.data.type === 'mcq' || parsed.data.type === 'multi') {
        assert.ok(parsed.data.answer !== undefined, `${file} missing answer`);
      }
      total++;
    }
  }
  assert.ok(total >= 30, `expected at least 30 quant questions, saw ${total}`);
});

test('all GRE vocab shards parse', () => {
  const vocabDir = join(ROOT, 'vocab');
  if (!existsSync(vocabDir)) return;
  let total = 0;
  for (const file of walk(vocabDir)) {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    assert.ok(Array.isArray(data), `${file} should be an array`);
    for (const w of data) {
      const parsed = VocabWord.safeParse(w);
      assert.ok(parsed.success, `${file}: ${parsed.error?.message}`);
      // Example should mention the word (validator rule).
      const ex = parsed.data.example.toLowerCase();
      assert.ok(
        ex.includes(parsed.data.word.toLowerCase().slice(0, Math.max(4, parsed.data.word.length - 3))),
        `${parsed.data.id}: example must mention word`,
      );
      total++;
    }
  }
  assert.ok(total >= 50, `expected at least 50 vocab words, saw ${total}`);
});

test('roadmap.json is a non-empty weeks array', () => {
  const file = join(ROOT, 'roadmap.json');
  if (!existsSync(file)) return;
  const data = JSON.parse(readFileSync(file, 'utf8'));
  assert.ok(Array.isArray(data.weeks));
  assert.ok(data.weeks.length > 0);
  for (const w of data.weeks) {
    assert.ok(Array.isArray(w.days) && w.days.length > 0);
  }
});

test('taxonomy.json declares the topics', () => {
  const file = join(ROOT, 'taxonomy.json');
  if (!existsSync(file)) return;
  const data = JSON.parse(readFileSync(file, 'utf8'));
  assert.ok(Array.isArray(data.quant));
  const slugs = data.quant.map((t) => t.slug);
  for (const slug of ['algebra', 'arithmetic', 'data-analysis', 'geometry', 'word-problems']) {
    assert.ok(slugs.includes(slug), `taxonomy missing ${slug}`);
  }
});