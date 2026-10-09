// Unit tests for the dependency-free RC sentence splitter. The splitter is
// the foundation for evidence highlighting, sentence-clicking UX, and
// anchor validation, so the cases here are real GRE-shaped prose.

import assert from 'node:assert/strict';
import test from 'node:test';
import { splitSentences, splitSentencesWithOffsets, firstWords, SPLITTER_VERSION } from '../lib/rc/splitter.ts';

test('SPLITTER_VERSION is exported as a string', () => {
  assert.equal(typeof SPLITTER_VERSION, 'string');
  assert.ok(SPLITTER_VERSION.length > 0);
});

test('splitSentences: simple two-sentence body', () => {
  const out = splitSentences('Smith went home. He was tired.');
  assert.deepEqual(out, ['Smith went home.', 'He was tired.']);
});

test('splitSentences: handles multiple punctuation marks', () => {
  const out = splitSentences('Wait! Are you sure? Yes.');
  assert.deepEqual(out, ['Wait!', 'Are you sure?', 'Yes.']);
});

test('splitSentences: keeps abbreviations intact', () => {
  const out = splitSentences('Dr. Smith left. Mr. Jones arrived.');
  assert.deepEqual(out, ['Dr. Smith left.', 'Mr. Jones arrived.']);
});

test('splitSentences: Latin abbreviations e.g. and i.e. do not split', () => {
  const out = splitSentences('There are many options, e.g. a, b, and c. Choose wisely.');
  assert.deepEqual(out, ['There are many options, e.g. a, b, and c.', 'Choose wisely.']);
});

test('splitSentences: U.S. and U.K. institutional abbreviations are preserved', () => {
  const out = splitSentences('He moved to the U.S. last year. Then he visited the U.K.');
  assert.deepEqual(out, ['He moved to the U.S. last year.', 'Then he visited the U.K.']);
});

test('splitSentences: U.S.A. multi-period abbreviation matches longest', () => {
  const out = splitSentences('He represented the U.S.A. abroad. He returned home.');
  assert.deepEqual(out, ['He represented the U.S.A. abroad.', 'He returned home.']);
});

test('splitSentences: decimal numbers do not split', () => {
  const out = splitSentences('Pi is about 3.14 in value. It is irrational.');
  assert.deepEqual(out, ['Pi is about 3.14 in value.', 'It is irrational.']);
});

test('splitSentences: version-like decimals 2.7.1 do not split', () => {
  const out = splitSentences('We upgraded to version 2.7.1 last week. The release notes are clear.');
  assert.deepEqual(out, ['We upgraded to version 2.7.1 last week.', 'The release notes are clear.']);
});

test('splitSentences: ellipsis (three dots) does not split', () => {
  const out = splitSentences('He thought... and then decided. The decision was final.');
  assert.deepEqual(out, ['He thought... and then decided.', 'The decision was final.']);
});

test('splitSentences: unicode ellipsis does not split', () => {
  const out = splitSentences('He thought… and then decided. The decision was final.');
  assert.deepEqual(out, ['He thought… and then decided.', 'The decision was final.']);
});

test('splitSentences: numbered list markers do not split mid-list', () => {
  const out = splitSentences('The steps are: 1. First, set up. 2. Then, run the build. Done.');
  // We do not require exact splitting here because the "Done." terminator
  // is the unambiguous break. What we DO require is that the numbered
  // list items (1. and 2.) are not split into their own "sentences".
  for (const s of out) {
    assert.ok(!/^\d+\.\s/.test(s), `unexpected bare-list-item sentence: ${s}`);
  }
  assert.ok(out.length >= 2, 'should produce at least 2 sentences');
});

test('splitSentences: quoted sentence is split when followed by uppercase', () => {
  const out = splitSentences('She said "Wait." He left without another word.');
  assert.deepEqual(out, ['She said "Wait."', 'He left without another word.']);
});

test('splitSentences: opening parenthesis does not break the regex', () => {
  const out = splitSentences('The result (see Figure 2) was surprising. The team celebrated.');
  assert.deepEqual(out, ['The result (see Figure 2) was surprising.', 'The team celebrated.']);
});

test('splitSentences: paragraph breaks become whitespace and do not split', () => {
  const body = 'First sentence of paragraph one. Second sentence of paragraph one.\n\nFirst sentence of paragraph two.';
  const out = splitSentences(body);
  assert.equal(out.length, 3);
  assert.equal(out[0], 'First sentence of paragraph one.');
  assert.equal(out[1], 'Second sentence of paragraph one.');
  assert.equal(out[2], 'First sentence of paragraph two.');
});

test('splitSentences: empty / whitespace-only input returns empty array', () => {
  assert.deepEqual(splitSentences(''), []);
  assert.deepEqual(splitSentences('   '), []);
});

test('splitSentencesWithOffsets: offsets are increasing and within body length', () => {
  const body = 'First sentence here. Second sentence here. Third sentence here.';
  const out = splitSentencesWithOffsets(body);
  assert.equal(out.length, 3);
  for (const o of out) {
    assert.ok(o.start >= 0 && o.end <= body.length, `out of range: ${o}`);
    assert.ok(o.end > o.start, `end <= start: ${o}`);
  }
  // Offsets strictly increase.
  for (let i = 1; i < out.length; i++) {
    assert.ok(out[i].start >= out[i - 1].end, `non-monotonic offsets at ${i}`);
  }
});

test('splitSentencesWithOffsets: each text snippet appears in body at its offset', () => {
  const body = 'Dr. Smith left at noon. Mr. Jones arrived at one. The meeting began.';
  const out = splitSentencesWithOffsets(body);
  for (const o of out) {
    assert.equal(body.substring(o.start, o.end), o.text, `offset text mismatch: ${o}`);
  }
});

test('firstWords: returns the first N whitespace-separated words', () => {
  assert.equal(firstWords('The quick brown fox jumps', 5), 'The quick brown fox jumps');
  assert.equal(firstWords('The quick brown fox jumps', 3), 'The quick brown');
  assert.equal(firstWords('  one   two  ', 5), 'one two');
  assert.equal(firstWords('', 5), '');
});

test('firstWords: trims leading and trailing whitespace before counting', () => {
  assert.equal(firstWords('\n\n  Hello world  \n', 1), 'Hello');
});

test('splitSentences: a.m. and p.m. do not split', () => {
  const out = splitSentences('We met at 10 a.m. sharp. The talk was long.');
  assert.deepEqual(out, ['We met at 10 a.m. sharp.', 'The talk was long.']);
});

test('splitSentences: total sentences count is sane for a real-shaped body', () => {
  const body = `When a critical vulnerability is disclosed in a widely used open-source library, the response is usually swift and public: a patch lands within hours, a CVE is filed, and downstream projects rebuild their releases. What is rarely discussed is the asymmetry that produced the crisis in the first place. A small number of unpaid maintainers, often working in their spare hours, support software that runs inside billions of dollars of enterprise infrastructure. The maintainers' reward is reputational, not financial; the enterprises' gain is operational, not editorial. Both sides have learned to live with this arrangement because, for most of the last two decades, the math has roughly worked out.`;
  const out = splitSentences(body);
  assert.ok(out.length >= 4 && out.length <= 6, `unexpected sentence count ${out.length} for a 5-sentence body`);
});
