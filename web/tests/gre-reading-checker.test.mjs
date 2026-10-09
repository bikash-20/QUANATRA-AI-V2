// Tests for the GRE reading-comprehension answer checker. Mirrors the
// quant checker tests, but for the upgraded RC question types
// (single / multi / select-sentence).

import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAnswer, formatAnswer, formatCorrectAnswer, choiceLetter } from '../features/gre/reading/checker.ts';

const rcSingle = {
  kind: 'single',
  questionId: 'q-rc-test-1',
  qType: 'main-idea',
  evidence: [{ sentence: 0, anchor: 'What does the author mainly argue' }],
  stem: 'What does the author mainly argue?',
  choices: ['A', 'B', 'C', 'D', 'E'],
  answer: 2,
  rationale: 'See paragraph two.',
};

const rcMulti = {
  kind: 'multi',
  questionId: 'q-rc-test-2',
  qType: 'detail',
  evidence: [{ sentence: 0, anchor: 'Which of the following are mentioned' }],
  stem: 'Which of the following are mentioned? Select all that apply.',
  choices: ['A', 'B', 'C'],
  answer: [0, 2],
  rationale: 'See paragraphs one and three.',
};

const rcSelectSentence = {
  kind: 'select-sentence',
  questionId: 'q-rc-test-3',
  qType: 'function',
  evidence: [{ sentence: 2, anchor: 'In this sentence the author' }],
  stem: 'Select the sentence that functions as a transition.',
  answer: 2,
  rationale: 'Sentence 3 introduces the second half of the argument.',
};

test('checkAnswer: rc-single matches the choice index', () => {
  assert.equal(checkAnswer(rcSingle, { type: 'rc-single', choice: 2 }), true);
  assert.equal(checkAnswer(rcSingle, { type: 'rc-single', choice: 0 }), false);
  assert.equal(checkAnswer(rcSingle, { type: 'rc-multi', choices: [2] }), false);
});

test('checkAnswer: rc-multi set equality is order-insensitive', () => {
  assert.equal(checkAnswer(rcMulti, { type: 'rc-multi', choices: [0, 2] }), true);
  assert.equal(checkAnswer(rcMulti, { type: 'rc-multi', choices: [2, 0] }), true);
  // missing one answer
  assert.equal(checkAnswer(rcMulti, { type: 'rc-multi', choices: [0] }), false);
  // extra wrong answer
  assert.equal(checkAnswer(rcMulti, { type: 'rc-multi', choices: [0, 1, 2] }), false);
  // wrong type
  assert.equal(checkAnswer(rcMulti, { type: 'rc-single', choice: 0 }), false);
});

test('checkAnswer: rc-select-sentence matches the sentence index', () => {
  assert.equal(checkAnswer(rcSelectSentence, { type: 'rc-sentence', sentence: 2 }), true);
  assert.equal(checkAnswer(rcSelectSentence, { type: 'rc-sentence', sentence: 1 }), false);
  // wrong type
  assert.equal(checkAnswer(rcSelectSentence, { type: 'rc-single', choice: 0 }), false);
});

test('checkAnswer: formatAnswer returns "(no answer)" for undefined', () => {
  assert.equal(formatAnswer(rcSingle, undefined), '(no answer)');
  assert.equal(formatAnswer(rcMulti, undefined), '(no answer)');
  assert.equal(formatAnswer(rcSelectSentence, undefined), '(no answer)');
});

test('formatAnswer: rc-single renders as "L. text" using A-E letters', () => {
  assert.equal(formatAnswer(rcSingle, { type: 'rc-single', choice: 2 }), 'C. C');
  assert.equal(formatAnswer(rcSingle, { type: 'rc-single', choice: 0 }), 'A. A');
  assert.equal(formatAnswer(rcSingle, { type: 'rc-single', choice: 4 }), 'E. E');
});

test('formatAnswer: rc-multi renders sorted "L. text; ..."', () => {
  assert.equal(
    formatAnswer(rcMulti, { type: 'rc-multi', choices: [2, 0] }),
    'A. A; C. C',
  );
});

test('formatAnswer: rc-select-sentence renders as "Sentence N"', () => {
  assert.equal(
    formatAnswer(rcSelectSentence, { type: 'rc-sentence', sentence: 2 }),
    'Sentence 3',
  );
});

test('formatCorrectAnswer: rc-single returns the correct A-E choice', () => {
  assert.equal(formatCorrectAnswer(rcSingle), 'C. C');
});

test('formatCorrectAnswer: rc-multi returns sorted A-E choices', () => {
  assert.equal(formatCorrectAnswer(rcMulti), 'A. A; C. C');
});

test('formatCorrectAnswer: rc-select-sentence returns "Sentence N"', () => {
  assert.equal(formatCorrectAnswer(rcSelectSentence), 'Sentence 3');
});

test('choiceLetter: maps 0→A through 25→Z', () => {
  assert.equal(choiceLetter(0), 'A');
  assert.equal(choiceLetter(4), 'E');
  assert.equal(choiceLetter(25), 'Z');
  // out-of-range falls back to 1-based
  assert.equal(choiceLetter(-1), '0');
  assert.equal(choiceLetter(26), '27');
});
