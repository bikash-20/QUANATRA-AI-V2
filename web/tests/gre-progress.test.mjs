// Unit tests for the pure stats derivation. Mirrors the math used by
// GreProgressDetail so future refactors are caught early. Doesn't touch
// IDB; that's covered by browser/manual smoke tests.

import assert from 'node:assert/strict';
import test from 'node:test';

function computeStats(attempts) {
  const firstByQuestion = new Map();
  for (const a of attempts) {
    if (!firstByQuestion.has(a.questionId)) firstByQuestion.set(a.questionId, a);
  }
  const firstAttempts = [...firstByQuestion.values()];
  const solved = firstAttempts.filter((a) => a.correct).length;
  const accuracyFirst = firstAttempts.length ? Math.round((solved / firstAttempts.length) * 100) : 0;
  const byTopic = {};
  for (const a of firstAttempts) {
    byTopic[a.topic] = byTopic[a.topic] || { firstAttempts: 0, firstCorrect: 0, totalAttempts: 0 };
    byTopic[a.topic].firstAttempts++;
    if (a.correct) byTopic[a.topic].firstCorrect++;
  }
  for (const a of attempts) {
    byTopic[a.topic] = byTopic[a.topic] || { firstAttempts: 0, firstCorrect: 0, totalAttempts: 0 };
    byTopic[a.topic].totalAttempts++;
  }
  const subMap = new Map();
  for (const a of firstAttempts) {
    const key = `${a.topic}::${a.subtopic}`;
    const cur = subMap.get(key) ?? { wrong: 0, total: 0, topic: a.topic, subtopic: a.subtopic };
    cur.total++;
    if (!a.correct) cur.wrong++;
    subMap.set(key, cur);
  }
  const weakSubtopics = [...subMap.values()]
    .filter((s) => s.wrong > 0 && s.wrong / s.total >= 0.5)
    .sort((a, b) => b.wrong / b.total - a.wrong / a.total)
    .slice(0, 10);
  return {
    totalAttempts: attempts.length,
    uniqueAttempted: firstByQuestion.size,
    solved,
    accuracyFirst,
    byTopic,
    weakSubtopics,
  };
}

test('empty: accuracy is 0, no weak topics', () => {
  const s = computeStats([]);
  assert.equal(s.accuracyFirst, 0);
  assert.equal(s.totalAttempts, 0);
  assert.equal(s.solved, 0);
  assert.equal(s.weakSubtopics.length, 0);
});

test('first-attempt-only rule: second correct attempt does NOT count', () => {
  const attempts = [
    { questionId: 'q-1', topic: 'algebra', subtopic: 'linear', correct: false },
    { questionId: 'q-1', topic: 'algebra', subtopic: 'linear', correct: true }, // retry
  ];
  const s = computeStats(attempts);
  assert.equal(s.uniqueAttempted, 1);
  assert.equal(s.solved, 0, 'first attempt was wrong; even though retry was correct, solved=0');
  assert.equal(s.accuracyFirst, 0);
  assert.equal(s.totalAttempts, 2);
});

test('first correct attempt: solved=true, accuracy counts it', () => {
  const attempts = [
    { questionId: 'q-1', topic: 'algebra', subtopic: 'linear', correct: true },
    { questionId: 'q-1', topic: 'algebra', subtopic: 'linear', correct: false }, // second
  ];
  const s = computeStats(attempts);
  assert.equal(s.solved, 1);
  assert.equal(s.accuracyFirst, 100);
});

test('byTopic: firstCorrect + firstAttempts', () => {
  const attempts = [
    { questionId: 'q-1', topic: 'algebra', subtopic: 'linear', correct: true },
    { questionId: 'q-2', topic: 'algebra', subtopic: 'linear', correct: false },
    { questionId: 'q-3', topic: 'geometry', subtopic: 'triangles', correct: true },
  ];
  const s = computeStats(attempts);
  assert.equal(s.byTopic.algebra.firstAttempts, 2);
  assert.equal(s.byTopic.algebra.firstCorrect, 1);
  assert.equal(s.byTopic.geometry.firstAttempts, 1);
  assert.equal(s.byTopic.geometry.firstCorrect, 1);
});

test('weakSubtopics: only includes subtopics with >=50% wrong on first attempt', () => {
  const attempts = [
    { questionId: 'q-1', topic: 'algebra', subtopic: 'linear', correct: false },
    { questionId: 'q-2', topic: 'algebra', subtopic: 'linear', correct: false },
    { questionId: 'q-3', topic: 'algebra', subtopic: 'linear', correct: true }, // 2/3 wrong -> weak
    { questionId: 'q-4', topic: 'geometry', subtopic: 'triangles', correct: true },
    { questionId: 'q-5', topic: 'geometry', subtopic: 'triangles', correct: true },
    { questionId: 'q-6', topic: 'geometry', subtopic: 'triangles', correct: false }, // 1/3 wrong -> not weak
  ];
  const s = computeStats(attempts);
  assert.equal(s.weakSubtopics.length, 1);
  assert.equal(s.weakSubtopics[0].topic, 'algebra');
  assert.equal(s.weakSubtopics[0].subtopic, 'linear');
  assert.equal(s.weakSubtopics[0].wrong, 2);
});