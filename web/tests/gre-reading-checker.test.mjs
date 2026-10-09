// Tests for the GRE reading-comprehension answer checker. Mirrors the
// quant checker tests, but for the two RC question types.

import assert from 'node:assert/strict';
import test from 'node:test';
import { checkAnswer, formatAnswer, formatCorrectAnswer } from '../features/gre/reading/checker.ts';

const rcSingle = {
  type: 'rc-single',
  questionId: 'q-rc-test-1',
  stem: 'What does the author mainly argue?',
  choices: ['A', 'B', 'C', 'D', 'E'],
  answer: 2,
  rationale: 'See paragraph two.',
};

const rcMulti = {
  type: 'rc-multi',
  questionId: 'q-rc-test-2',
  stem: 'Which of the following are mentioned? Select all that apply.',
  choices: ['A', 'B', 'C', 'D', 'E'],
  answer: [0, 2, 4],
  rationale: 'See paragraphs one and three.',
};

test('checkAnswer: rc-single matches the choice index', () => {
  assert.equal(checkAnswer(rcSingle, { type: 'rc-single', choice: 2 }), true);
  assert.equal(checkAnswer(rcSingle, { type: 'rc-single', choice: 0 }), false);
  assert.equal(checkAnswer(rcSingle, { type: 'rc-multi', choices: [2] }), false);
});

test('checkAnswer: rc-multi set equality is order-insensitive', () => {
  assert.equal(checkAnswer(rcMulti, { type: 'rc-multi', choices: [0, 2, 4] }), true);
  assert.equal(checkAnswer(rcMulti, { type: 'rc-multi', choices: [4, 0, 2] }), true);
  // missing one answer
  assert.equal(checkAnswer(rcMulti, { type: 'rc-multi', choices: [0, 2] }), false);
  // extra wrong answer
  assert.equal(checkAnswer(rcMulti, { type: 'rc-multi', choices: [0, 2, 4, 1] }), false);
  // wrong type
  assert.equal(checkAnswer(rcMulti, { type: 'rc-single', choice: 0 }), false);
});

test('checkAnswer: formatAnswer returns "(no answer)" for undefined', () => {
  // The contract is that callers pass a defined UserAnswer; the mock
  // runner guards with `answers[id] ?` before calling. We only verify
  // the format helper's behavior for the undefined case here.
  assert.equal(formatAnswer(rcSingle, undefined), '(no answer)');
  assert.equal(formatAnswer(rcMulti, undefined), '(no answer)');
});

test('formatAnswer: rc-single renders as "N. text"', () => {
  assert.equal(formatAnswer(rcSingle, { type: 'rc-single', choice: 2 }), '3. C');
  assert.equal(formatAnswer(rcSingle, undefined), '(no answer)');
});

test('formatAnswer: rc-multi renders sorted "N. text; ..."', () => {
  assert.equal(
    formatAnswer(rcMulti, { type: 'rc-multi', choices: [4, 0, 2] }),
    '1. A; 3. C; 5. E',
  );
});

test('formatCorrectAnswer: rc-single returns the correct choice', () => {
  assert.equal(formatCorrectAnswer(rcSingle), '3. C');
});

test('formatCorrectAnswer: rc-multi returns sorted choices', () => {
  assert.equal(formatCorrectAnswer(rcMulti), '1. A; 3. C; 5. E');
});
