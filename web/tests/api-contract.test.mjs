import assert from 'node:assert/strict';
import test from 'node:test';

import {
  examGradeResponseSchema,
  flashcardsResponseSchema,
  grammarResponseSchema,
  quizResponseSchema,
  vocabResponseSchema,
} from '../lib/api-schemas.ts';

test('quiz response normalizes answer indexes and rejects answers outside the options', () => {
  const parsed = quizResponseSchema.parse({
    questions: [{
      question: 'Which structure is FIFO?',
      options: ['Stack', 'Queue', 'Tree', 'Graph'],
      answerIndex: 1,
      explanation: 'A queue is first in, first out.',
    }],
  });
  assert.equal(parsed.questions[0].answer, 'Queue');
  assert.throws(() => quizResponseSchema.parse({
    questions: [{
      question: 'Which structure is FIFO?',
      options: ['Stack', 'Queue', 'Tree', 'Graph'],
      answer: 'List',
      explanation: 'Not a valid option.',
    }],
  }));
});

test('learning endpoint schemas require the UI contract before accepting generated data', () => {
  assert.equal(
    flashcardsResponseSchema.parse({ flashcards: [{ front: 'Term', back: 'Definition' }] }).flashcards.length,
    1,
  );
  assert.equal(
    vocabResponseSchema.parse({
      vocab: [{ word: 'lucid', meaning: 'clear', bangla: 'স্পষ্ট', example: 'A lucid answer.' }],
    }).vocab[0].word,
    'lucid',
  );
  assert.equal(
    grammarResponseSchema.parse({
      grammar: {
        rule: 'Past simple',
        explanation: 'Use it for a completed past event.',
        example: 'She walked home.',
        practice: [{ question: 'They ___ home.', answer: 'walked', explanation: 'The event is complete.' }],
      },
    }).grammar.practice.length,
    1,
  );
});

test('exam grade response normalizes weak-topic casing', () => {
  const result = examGradeResponseSchema.parse({
    verdict: 'Pass',
    score: 4,
    total: 5,
    weakTopics: ['Fractions'],
  });
  assert.deepEqual(result.weak_topics, ['Fractions']);
});
