// Tests for the GRE quant answer checker.
// Verifies the four question types, the numeric parser (fractions,
// decimals, commas, whitespace, scientific), the integer-exact rule,
// the 1e-6 tolerance, and the multi-answer set equality.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkAnswer,
  formatCorrectAnswer,
  formatAnswer,
  numbersClose,
  parseNumericInput,
  qcText,
  NUMERIC_TOLERANCE,
} from '../features/gre/quant/checker.ts';

// ---------------------------------------------------------------------------
// parseNumericInput
// ---------------------------------------------------------------------------

test('parseNumericInput: fractions', () => {
  assert.equal(parseNumericInput('5/36'), 5 / 36);
  assert.equal(parseNumericInput('-5/36'), -5 / 36);
  assert.equal(parseNumericInput(' 5 / 36 '), 5 / 36);
});

test('parseNumericInput: decimals and commas', () => {
  assert.equal(parseNumericInput('0.138888'), 0.138888);
  assert.equal(parseNumericInput('5,000'), 5000);
  assert.equal(parseNumericInput('1,234.56'), 1234.56);
});

test('parseNumericInput: scientific and whitespace', () => {
  assert.equal(parseNumericInput('1e-3'), 0.001);
  assert.equal(parseNumericInput('  -3  '), -3);
});

test('parseNumericInput: rejects bad input', () => {
  assert.equal(parseNumericInput(''), null);
  assert.equal(parseNumericInput('abc'), null);
  assert.equal(parseNumericInput('5/0'), null);
  assert.equal(parseNumericInput(5), null); // not a string
});

// ---------------------------------------------------------------------------
// numbersClose
// ---------------------------------------------------------------------------

test('numbersClose: integers are exact', () => {
  assert.equal(numbersClose(5, 5), true);
  assert.equal(numbersClose(5, 6), false);
});

test('numbersClose: floats within 1e-6', () => {
  assert.equal(numbersClose(0.1 + 0.2, 0.3), true);
  assert.equal(numbersClose(1.0, 1.0001), false); // diff > tolerance
  // Wider tolerance accepted
  assert.equal(numbersClose(1.0, 1.0001, 1e-3), true);
});

test('numbersClose: NaN never matches', () => {
  assert.equal(numbersClose(NaN, 1), false);
  assert.equal(numbersClose(1, NaN), false);
});

// ---------------------------------------------------------------------------
// checkAnswer — by type
// ---------------------------------------------------------------------------

const mcq = {
  id: 'q-mcq-001',
  type: 'mcq',
  topic: 'algebra',
  subtopic: 'linear',
  difficulty: 'easy',
  tags: [],
  stem: '2 + 2 = ?',
  choices: ['3', '4', '5', '6'],
  answer: 1,
};

const multi = {
  id: 'q-multi-001',
  type: 'multi',
  topic: 'algebra',
  subtopic: 'sets',
  difficulty: 'medium',
  tags: [],
  stem: 'Which are even?',
  choices: ['1', '2', '3', '4'],
  answer: [1, 3],
};

const qc = {
  id: 'q-qc-001',
  type: 'qc',
  topic: 'algebra',
  subtopic: 'comparison',
  difficulty: 'easy',
  tags: [],
  quantityA: '3',
  quantityB: '4',
  answer: 'B',
};

const numeric = {
  id: 'q-num-001',
  type: 'numeric',
  topic: 'algebra',
  subtopic: 'eval',
  difficulty: 'medium',
  tags: [],
  stem: '5/36 = ?',
  answer: 5 / 36,
};

test('checkAnswer: mcq correct/wrong', () => {
  assert.equal(checkAnswer(mcq, { type: 'mcq', choice: 1 }), true);
  assert.equal(checkAnswer(mcq, { type: 'mcq', choice: 0 }), false);
});

test('checkAnswer: multi exact-set equality', () => {
  assert.equal(checkAnswer(multi, { type: 'multi', choices: [1, 3] }), true);
  assert.equal(checkAnswer(multi, { type: 'multi', choices: [3, 1] }), true); // order-insensitive
  assert.equal(checkAnswer(multi, { type: 'multi', choices: [1] }), false); // missing
  assert.equal(checkAnswer(multi, { type: 'multi', choices: [1, 2] }), false); // wrong
});

test('checkAnswer: qc letter', () => {
  assert.equal(checkAnswer(qc, { type: 'qc', letter: 'B' }), true);
  assert.equal(checkAnswer(qc, { type: 'qc', letter: 'A' }), false);
});

test('checkAnswer: numeric tolerance', () => {
  assert.equal(checkAnswer(numeric, { type: 'numeric', value: 5 / 36 }), true);
  assert.equal(
    checkAnswer(numeric, { type: 'numeric', value: 5 / 36 + 0.0000005 }),
    true,
    'should be within 1e-6 tolerance',
  );
  assert.equal(checkAnswer(numeric, { type: 'numeric', value: 0.5 }), false);
});

// ---------------------------------------------------------------------------
// qcText
// ---------------------------------------------------------------------------

test('qcText: maps letters to choice text', () => {
  assert.equal(qcText('A'), 'Quantity A is greater');
  assert.equal(qcText('B'), 'Quantity B is greater');
  assert.equal(qcText('C'), 'The two quantities are equal');
  assert.equal(qcText('D'), 'The relationship cannot be determined from the information given');
});

// ---------------------------------------------------------------------------
// formatCorrectAnswer / formatAnswer
// ---------------------------------------------------------------------------

test('formatCorrectAnswer: by type', () => {
  assert.equal(formatCorrectAnswer(mcq), '2. 4');
  assert.equal(formatCorrectAnswer(multi), '2. 2; 4. 4');
  assert.equal(formatCorrectAnswer(qc), `B. ${qcText('B')}`);
  assert.equal(formatCorrectAnswer(numeric), String(5 / 36));
});

test('formatAnswer: undefined or wrong type is "(no answer)" or "(invalid)"', () => {
  assert.equal(formatAnswer(mcq, undefined), '(no answer)');
  assert.equal(formatAnswer(mcq, { type: 'qc', letter: 'A' }), '(invalid)');
});

test('NUMERIC_TOLERANCE matches the spec (1e-6)', () => {
  assert.equal(NUMERIC_TOLERANCE, 1e-6);
});