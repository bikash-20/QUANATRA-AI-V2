// Tests for the seeded vocab quiz generator: determinism, distractor
// rules (same pos + nearest tier + no-synonym-overlap), no duplicates.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateVocabQuiz,
  mulberry32,
  seededShuffle,
} from '../features/gre/vocab/quiz.ts';

// ---------------------------------------------------------------------------
// Tiny word pool. Built by hand so the assertions are explicit. We cover
// synonyms (vocab:) and between-word synonym overlap.
// ---------------------------------------------------------------------------

function mkWord(over) {
  return {
    id: over.id,
    word: over.word,
    pos: over.pos ?? 'v',
    tier: over.tier ?? 1,
    definition: over.definition,
    synonyms: over.synonyms ?? [],
    antonyms: over.antonyms ?? [],
    example: 'example.',
  };
}

const WORDS = [
  mkWord({ id: 'v-0001', word: 'ameliorate', pos: 'v', tier: 3, definition: 'make better', synonyms: ['improve', 'enhance'], antonyms: ['worsen'], example: 'We ameliorate the process.' }),
  mkWord({ id: 'v-0002', word: 'mitigate',   pos: 'v', tier: 2, definition: 'make less severe', synonyms: ['alleviate', 'reduce'], antonyms: ['worsen'], example: 'We mitigate the damage.' }),
  mkWord({ id: 'v-0003', word: 'worsen',     pos: 'v', tier: 1, definition: 'make worse', synonyms: ['aggravate'], antonyms: ['improve', 'ameliorate'], example: 'It worsens over time.' }),
  mkWord({ id: 'v-0004', word: 'curtail',    pos: 'v', tier: 2, definition: 'cut short', synonyms: ['shorten', 'reduce'], antonyms: ['extend'], example: 'We curtail the meeting.' }),
  mkWord({ id: 'v-0005', word: 'extend',     pos: 'v', tier: 1, definition: 'make longer', synonyms: ['lengthen', 'prolong'], antonyms: ['curtail'], example: 'We extend the deadline.' }),
  mkWord({ id: 'v-0006', word: 'pulchritude',pos: 'n', tier: 3, definition: 'beauty', synonyms: ['beauty'], antonyms: ['ugliness'], example: 'A face of pulchritude.' }),
  mkWord({ id: 'v-0007', word: 'obfuscate',  pos: 'v', tier: 3, definition: 'confuse', synonyms: ['confuse', 'muddle'], antonyms: ['clarify'], example: 'Do not obfuscate the issue.' }),
  mkWord({ id: 'v-0008', word: 'clarify',    pos: 'v', tier: 1, definition: 'make clear', synonyms: ['elucidate', 'explain'], antonyms: ['obfuscate'], example: 'Please clarify your point.' }),
];

// ---------------------------------------------------------------------------
// mulberry32 + seededShuffle
// ---------------------------------------------------------------------------

test('mulberry32 is deterministic for the same seed', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

test('mulberry32 produces different streams for different seeds', () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  const A = [a(), a(), a(), a()];
  const B = [b(), b(), b(), b()];
  assert.notDeepEqual(A, B);
});

test('seededShuffle preserves length and members', () => {
  const input = [1, 2, 3, 4, 5];
  const out = seededShuffle(input, mulberry32(0));
  assert.equal(out.length, input.length);
  assert.deepEqual([...out].sort(), input);
});

test('seededShuffle is deterministic', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8];
  const a = seededShuffle(input, mulberry32(7));
  const b = seededShuffle(input, mulberry32(7));
  assert.deepEqual(a, b);
});

// ---------------------------------------------------------------------------
// generateVocabQuiz
// ---------------------------------------------------------------------------

test('generateVocabQuiz: same seed + same input -> same output (def-to-word)', () => {
  const A = generateVocabQuiz({ words: WORDS, mode: 'def-to-word', count: 4, seed: 99 });
  const B = generateVocabQuiz({ words: WORDS, mode: 'def-to-word', count: 4, seed: 99 });
  assert.equal(A.length, B.length);
  assert.deepEqual(A.map((x) => x.wordId), B.map((x) => x.wordId));
  assert.deepEqual(A.map((x) => x.choices), B.map((x) => x.choices));
});

test('generateVocabQuiz: def-to-word produces 4 choices and a valid correctIndex', () => {
  const items = generateVocabQuiz({ words: WORDS, mode: 'def-to-word', count: 4, seed: 1 });
  assert.ok(items.length > 0);
  for (const it of items) {
    assert.equal(it.choices.length, 4);
    assert.ok(it.correctIndex >= 0 && it.correctIndex < 4);
    assert.equal(it.choices[it.correctIndex], it.answerText);
    assert.equal(it.prompt, /* definition */ WORDS.find((w) => w.id === it.wordId).definition);
  }
});

test('generateVocabQuiz: distractors share pos with the answer', () => {
  // "ameliorate" is a verb — distractors should be verbs too.
  const items = generateVocabQuiz({ words: WORDS, mode: 'def-to-word', count: 5, seed: 11 });
  const amelo = items.find((i) => i.wordId === 'v-0001');
  assert.ok(amelo, 'ameliorate should appear as an answer');
  const answer = WORDS.find((w) => w.id === amelo.wordId);
  const distractors = amelo.choices.filter((c) => c !== amelo.answerText);
  for (const d of distractors) {
    const dw = WORDS.find((w) => w.word === d);
    assert.ok(dw, `distractor ${d} must be in the word list`);
    assert.equal(dw.pos, answer.pos, `distractor ${d} must share pos with ${answer.word}`);
  }
});

test('generateVocabQuiz: distractors are not synonyms of the answer', () => {
  // "ameliorate" has synonyms "improve" and "enhance". "worsen" is an
  // antonym, not a synonym, so it can appear; but "improve" / "enhance"
  // must not — and there is no word literally called "improve" or
  // "enhance" in this pool, so this is a sanity check.
  const items = generateVocabQuiz({ words: WORDS, mode: 'def-to-word', count: 8, seed: 21 });
  for (const it of items) {
    const ans = WORDS.find((w) => w.id === it.wordId);
    const answerSynSet = new Set(ans.synonyms.map((s) => s.toLowerCase()));
    for (const c of it.choices) {
      if (c === it.answerText) continue;
      const cw = WORDS.find((w) => w.word === c);
      if (!cw) continue;
      // No word whose synonyms overlap with the answer's synonyms.
      const cwSynSet = new Set(cw.synonyms.map((s) => s.toLowerCase()));
      for (const s of cwSynSet) {
        assert.ok(!answerSynSet.has(s), `${c} shares synonym "${s}" with ${ans.word}`);
      }
    }
  }
});

test('generateVocabQuiz: choices never contain duplicates', () => {
  const items = generateVocabQuiz({ words: WORDS, mode: 'def-to-word', count: 8, seed: 33 });
  for (const it of items) {
    const set = new Set(it.choices.map((x) => x.toLowerCase()));
    assert.equal(set.size, it.choices.length, `duplicate choice in ${it.wordId}`);
  }
});

test('generateVocabQuiz: word-to-def mode swaps prompt and choices', () => {
  const items = generateVocabQuiz({ words: WORDS, mode: 'word-to-def', count: 4, seed: 4 });
  assert.ok(items.length > 0);
  for (const it of items) {
    const ans = WORDS.find((w) => w.id === it.wordId);
    assert.equal(it.prompt, ans.word);
    assert.equal(it.choices[it.correctIndex], it.answerText);
    assert.equal(it.choices[it.correctIndex], ans.definition);
  }
});

test('generateVocabQuiz: synonym mode answer is one of the answer word synonyms', () => {
  const items = generateVocabQuiz({ words: WORDS, mode: 'synonym', count: 8, seed: 7 });
  for (const it of items) {
    const ans = WORDS.find((w) => w.id === it.wordId);
    assert.ok(ans.synonyms.includes(it.answerText), `${ans.word} synonym mode answer must be in its synonym list`);
    assert.equal(it.choices.length, 4);
  }
});

test('generateVocabQuiz: antonym mode answer is one of the answer word antonyms', () => {
  const items = generateVocabQuiz({ words: WORDS, mode: 'antonym', count: 8, seed: 8 });
  for (const it of items) {
    const ans = WORDS.find((w) => w.id === it.wordId);
    assert.ok(ans.antonyms.includes(it.answerText), `${ans.word} antonym mode answer must be in its antonym list`);
  }
});

test('generateVocabQuiz: skipWordIds is honored', () => {
  const skip = new Set(['v-0001', 'v-0002']);
  const items = generateVocabQuiz({
    words: WORDS,
    mode: 'def-to-word',
    count: 4,
    seed: 1,
    skipWordIds: skip,
  });
  for (const it of items) {
    assert.ok(!skip.has(it.wordId), `should not pick skipped word ${it.wordId}`);
  }
});