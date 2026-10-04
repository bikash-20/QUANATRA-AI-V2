import assert from 'node:assert/strict';
import test from 'node:test';
import { getAnswerState } from '../lib/quiz-answer.ts';

test('only marks the selected wrong option incorrect and reveals the correct answer', () => {
  assert.equal(getAnswerState('A', 'B', null), 'unanswered');
  assert.equal(getAnswerState('A', 'B', 'A'), 'incorrect');
  assert.equal(getAnswerState('B', 'B', 'A'), 'correct');
  assert.equal(getAnswerState('C', 'B', 'A'), 'unanswered');
});

test('marks a selected correct answer correctly', () => {
  assert.equal(getAnswerState('B', 'B', 'B'), 'correct');
});
