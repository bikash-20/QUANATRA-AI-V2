// Unit tests for the reading-comprehension stats aggregator.

import assert from "node:assert/strict";
import test from "node:test";
import { aggregateRcStats, QTYPE_LABELS } from "../features/gre/progress/rc-stats.ts";

function mkAttempt(over = {}) {
  return {
    id: `${over.questionId ?? "q"}-${over.at ?? 0}`,
    questionId: over.questionId ?? "q-rc-biz-001-1",
    topic: over.topic ?? "business",
    subtopic: over.subtopic ?? "rc-biz-001",
    difficulty: over.difficulty ?? "medium",
    questionType: over.questionType ?? "rc-single-answer",
    userAnswer: over.userAnswer ?? { type: "rc-single", choice: 0 },
    correct: over.correct ?? false,
    timeMs: over.timeMs ?? 30000,
    at: over.at ?? 0,
    source: over.source,
    qType: over.qType,
    passageId: over.passageId,
    readingTimeMs: over.readingTimeMs,
    answerTimeMs: over.answerTimeMs,
  };
}

test("aggregateRcStats: empty input returns zeros", () => {
  const s = aggregateRcStats([]);
  assert.equal(s.totalAttempts, 0);
  assert.equal(s.uniqueQuestions, 0);
  assert.equal(s.correctQuestions, 0);
  assert.equal(s.byQType.length, 0);
  assert.equal(s.byCategory.length, 0);
  assert.equal(s.time.avgReadingTimeMs, 0);
  assert.equal(s.time.avgAnswerTimeMs, 0);
});

test("aggregateRcStats: first-attempt dedupe — re-attempts don't inflate accuracy", () => {
  const a = mkAttempt({ questionId: "q1", correct: false, at: 1 });
  const a2 = mkAttempt({ questionId: "q1", correct: true, at: 2 });
  const s = aggregateRcStats([a, a2]);
  assert.equal(s.uniqueQuestions, 1);
  assert.equal(s.correctQuestions, 0, "first attempt (wrong) wins, even though a later attempt was correct");
  assert.equal(s.totalAttempts, 2, "totalAttempts still includes the re-attempt");
});

test("aggregateRcStats: byQType groups by qType, sorts ascending by accuracy", () => {
  const attempts = [
    mkAttempt({ questionId: "q1", qType: "detail", correct: true, at: 1 }),
    mkAttempt({ questionId: "q2", qType: "detail", correct: true, at: 2 }),
    mkAttempt({ questionId: "q3", qType: "inference", correct: false, at: 3 }),
    mkAttempt({ questionId: "q4", qType: "inference", correct: true, at: 4 }),
  ];
  const s = aggregateRcStats(attempts);
  assert.equal(s.byQType.length, 2);
  // Worst first: inference (50%) before detail (100%).
  assert.equal(s.byQType[0].qType, "inference");
  assert.equal(s.byQType[0].percent, 50);
  assert.equal(s.byQType[1].qType, "detail");
  assert.equal(s.byQType[1].percent, 100);
});

test("aggregateRcStats: byQType skips attempts without a qType", () => {
  const attempts = [
    mkAttempt({ questionId: "q1", qType: "detail", correct: true, at: 1 }),
    mkAttempt({ questionId: "q2", qType: undefined, correct: false, at: 2 }),
  ];
  const s = aggregateRcStats(attempts);
  assert.equal(s.byQType.length, 1);
  assert.equal(s.byQType[0].qType, "detail");
});

test("aggregateRcStats: includeAi=true includes AI attempts, default excludes", () => {
  const attempts = [
    mkAttempt({ questionId: "q1", correct: true, at: 1, source: "ai" }),
    mkAttempt({ questionId: "q2", correct: false, at: 2, source: "hand" }),
  ];
  const s1 = aggregateRcStats(attempts);
  assert.equal(s1.uniqueQuestions, 1, "default excludes AI, so only hand is counted");
  assert.equal(s1.correctQuestions, 0);
  const s2 = aggregateRcStats(attempts, true);
  assert.equal(s2.uniqueQuestions, 2);
  assert.equal(s2.correctQuestions, 1);
});

test("aggregateRcStats: byCategory groups by topic and includes accuracy", () => {
  const attempts = [
    mkAttempt({ questionId: "q1", topic: "business", correct: true, at: 1 }),
    mkAttempt({ questionId: "q2", topic: "business", correct: false, at: 2 }),
    mkAttempt({ questionId: "q3", topic: "science", correct: true, at: 3 }),
  ];
  const s = aggregateRcStats(attempts);
  const biz = s.byCategory.find((c) => c.category === "business");
  const sci = s.byCategory.find((c) => c.category === "science");
  assert.equal(biz.total, 2);
  assert.equal(biz.correct, 1);
  assert.equal(biz.percent, 50);
  assert.equal(sci.total, 1);
  assert.equal(sci.percent, 100);
});

test("aggregateRcStats: time breakdown uses answerTimeMs over timeMs", () => {
  const attempts = [
    mkAttempt({ questionId: "q1", at: 1, timeMs: 60000, answerTimeMs: 30000 }),
    mkAttempt({ questionId: "q2", at: 2, timeMs: 90000, answerTimeMs: 45000 }),
  ];
  const s = aggregateRcStats(attempts);
  assert.equal(s.time.avgAnswerTimeMs, 37500);
});

test("aggregateRcStats: time breakdown reading time only counts first question per passage", () => {
  const attempts = [
    // Passage 1: first question with readingTimeMs=60s, second with 0
    mkAttempt({ questionId: "p1q1", at: 1, passageId: "p1", readingTimeMs: 60000, answerTimeMs: 30000 }),
    mkAttempt({ questionId: "p1q2", at: 2, passageId: "p1", readingTimeMs: 0, answerTimeMs: 20000 }),
    // Passage 2: only one question
    mkAttempt({ questionId: "p2q1", at: 3, passageId: "p2", readingTimeMs: 30000, answerTimeMs: 15000 }),
  ];
  const s = aggregateRcStats(attempts);
  // Reading time average = (60000 + 30000) / 2 passages = 45000
  assert.equal(s.time.avgReadingTimeMs, 45000);
  // Answer time average = (30000 + 20000 + 15000) / 3 = 21666.66… → 21667
  assert.equal(s.time.avgAnswerTimeMs, 21667);
});

test("QTYPE_LABELS: covers all 8 qTypes", () => {
  const expected = [
    "main-idea", "detail", "inference", "author-attitude",
    "function", "structure", "vocab-in-context", "strengthen-weaken",
  ];
  for (const q of expected) {
    assert.ok(QTYPE_LABELS[q], `label for ${q} should be defined`);
    assert.ok(QTYPE_LABELS[q].length > 0);
  }
});
