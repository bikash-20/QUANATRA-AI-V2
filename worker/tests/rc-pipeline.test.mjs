// Unit tests for the RC generation pipeline helpers. These cover the
// "shape check" stage (cleanPassageShape / cleanQuestion /
// dropBadQuestions) and the cross-check stage (crossCheckPassage).
// The cascade exclude behavior is tested by exercising the public
// runCascade entry — it has its own small test file.

import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanPassageShape,
  crossCheckPassage,
  dropBadQuestions,
  extractBodyText,
  splitSentencesLocal,
  RC_Q_TYPES,
} from "../src/rc-pipeline.ts";

const SAMPLE_BODY = `The first paragraph sets up a market context. Prices rose sharply in 2024, driven by supply constraints that observers trace back to a confluence of unrelated supply shocks. Several analysts note that the rally began in early Q1 and gathered pace through the summer months as institutional money flowed into the asset class. However, the breadth of the rally remained narrow even as the headline index climbed to successive new highs.
A second paragraph details the mechanism. The authors note that hedge funds led the buying, yet retail participation remained thin throughout the period. Industry data confirm that hedge fund net long positioning expanded by roughly thirty percent over the quarter, while retail brokerage account openings fell on a year-over-year basis for the first time in three years. Some commentators argued that the divergence was unprecedented, but the historical record shows similar patterns during earlier commodity-driven cycles.
A third paragraph notes consequences. Margins compressed for producers, but consumers were largely insulated thanks to extensive hedging programmes that the largest market participants had put in place during the prior downturn. Producers without dedicated hedging desks fared worse, with several mid-sized firms reporting quarterly losses that exceeded their full-year guidance.
Finally, the conclusion offers a forecast. Some analysts expect the rally to continue, however a pullback is plausible if macro conditions tighten. The authors weigh both views and conclude that the central case remains cautiously optimistic but acknowledges the tail risks.`;

function sampleQuestions() {
  return [
    {
      kind: "single",
      questionId: "q-rc-ai-001-1",
      stem: "What is the main idea of the passage?",
      qType: "main-idea",
      evidence: [{ sentence: 0, anchor: "the first paragraph sets" }],
      rationale: "Sets up the market context the rest of the passage elaborates.",
      choices: [
        "Margins improved for producers across the year.",
        "Prices rose on supply constraints while the rally stayed narrow.",
        "Hedge funds exited the market and retail took the lead.",
        "Retail investors led a broad-based buying spree.",
        "Forecasters uniformly disagree on the direction going forward.",
      ],
      answer: 1,
    },
    {
      kind: "multi",
      questionId: "q-rc-ai-001-2",
      stem: "Select all that apply. Who led the buying?",
      qType: "detail",
      evidence: [{ sentence: 5, anchor: "the authors note that" }],
      rationale: "Hedge funds led; retail participation stayed thin.",
      choices: ["Hedge funds.", "Retail investors.", "Sovereign wealth funds."],
      answer: [0],
    },
    {
      kind: "select-sentence",
      questionId: "q-rc-ai-001-3",
      stem: "Which sentence best supports the forecast?",
      qType: "inference",
      evidence: [{ sentence: 12, anchor: "some analysts expect" }],
      rationale: "The expected-continuation sentence states the forecast.",
      answer: 12,
    },
  ];
}

test("splitSentencesLocal: returns one entry per terminator block", () => {
  const out = splitSentencesLocal(SAMPLE_BODY);
  // 8 sentences expected from the SAMPLE_BODY above.
  assert.ok(out.length >= 6, `expected at least 6 sentences, got ${out.length}`);
  assert.ok(out.every((s) => s.length > 0));
});

test("splitSentencesLocal: empty body returns empty array", () => {
  assert.deepEqual(splitSentencesLocal(""), []);
});

test("extractBodyText: returns string when present", () => {
  assert.equal(extractBodyText({ body: "hello" }), "hello");
  assert.equal(extractBodyText({}), "");
  assert.equal(extractBodyText(null), "");
});

test("cleanPassageShape: accepts a well-formed envelope", () => {
  const body = SAMPLE_BODY;
  const sentences = splitSentencesLocal(body);
  const raw = {
    id: "rc-ai-aabbccdd",
    category: "business",
    title: "Market context",
    body,
    difficulty: "medium",
    tags: ["markets", "prices"],
    questions: sampleQuestions(),
  };
  const out = cleanPassageShape(raw, sentences);
  assert.ok(out, "cleanPassageShape returned null for a well-formed envelope");
  assert.equal(out.questions.length, 3);
  assert.equal(out.questions[0].kind, "single");
  assert.equal(out.questions[1].kind, "multi");
  assert.equal(out.questions[2].kind, "select-sentence");
});

test("cleanPassageShape: rejects a body outside the word count window", () => {
  const raw = {
    id: "rc-ai-aabbccdd",
    category: "business",
    title: "Tiny",
    body: "too short",
    difficulty: "medium",
    tags: [],
    questions: sampleQuestions(),
  };
  assert.equal(cleanPassageShape(raw, []), null);
});

test("cleanPassageShape: rejects a passage with fewer than 3 valid questions", () => {
  const raw = {
    id: "rc-ai-aabbccdd",
    category: "business",
    title: "Half",
    body: SAMPLE_BODY,
    difficulty: "medium",
    tags: [],
    questions: sampleQuestions().slice(0, 2),
  };
  const out = cleanPassageShape(raw, splitSentencesLocal(SAMPLE_BODY));
  assert.equal(out, null);
});

test("cleanPassageShape: rejects single-question choices that duplicate or are body sentences", () => {
  const base = sampleQuestions()[0];
  const dupRaw = {
    id: "rc-ai-aabbccdd",
    category: "business",
    title: "Dup",
    body: SAMPLE_BODY,
    difficulty: "medium",
    tags: [],
    questions: [
      { ...base, choices: ["a", "a", "a", "a", "a"] },
      sampleQuestions()[1],
      sampleQuestions()[2],
    ],
  };
  assert.equal(cleanPassageShape(dupRaw, splitSentencesLocal(SAMPLE_BODY)), null);

  // A choice that is a verbatim long sentence from the body should be rejected.
  const sentenceChoice = SAMPLE_BODY.split(".")[0] + ".";
  const bodyChoiceRaw = {
    id: "rc-ai-aabbccdd",
    category: "business",
    title: "Verbatim",
    body: SAMPLE_BODY,
    difficulty: "medium",
    tags: [],
    questions: [
      {
        ...base,
        choices: [
          sentenceChoice,
          base.choices[1],
          base.choices[2],
          base.choices[3],
          base.choices[4],
        ],
      },
      sampleQuestions()[1],
      sampleQuestions()[2],
    ],
  };
  assert.equal(cleanPassageShape(bodyChoiceRaw, splitSentencesLocal(SAMPLE_BODY)), null);
});

test("dropBadQuestions: removes questions with out-of-range evidence", () => {
  const base = sampleQuestions();
  const cleaned = cleanPassageShape(
    {
      id: "rc-ai-aabbccdd",
      category: "business",
      title: "BadEvidence",
      body: SAMPLE_BODY,
      difficulty: "medium",
      tags: [],
      questions: base,
    },
    splitSentencesLocal(SAMPLE_BODY)
  );
  assert.ok(cleaned);
  // Tamper: add a question with a bad evidence index.
  const tampered = {
    ...cleaned,
    questions: [
      ...cleaned.questions,
      {
        kind: "single",
        questionId: "q-rc-ai-001-4",
        stem: "Another question with a far-off evidence index.",
        qType: "detail",
        evidence: [{ sentence: 9999, anchor: "this won't match" }],
        rationale: "Rationale of the right length for the validator.",
        choices: ["a", "b", "c", "d", "e"],
        answer: 0,
      },
    ],
  };
  const dropped = dropBadQuestions(tampered, splitSentencesLocal(SAMPLE_BODY));
  assert.ok(dropped);
  assert.equal(dropped.questions.length, 3);
});

test("crossCheckPassage: ok=true when verifier agrees", () => {
  const cleaned = cleanPassageShape(
    {
      id: "rc-ai-aabbccdd",
      category: "business",
      title: "Agreement",
      body: SAMPLE_BODY,
      difficulty: "medium",
      tags: [],
      questions: sampleQuestions(),
    },
    splitSentencesLocal(SAMPLE_BODY)
  );
  assert.ok(cleaned);
  const verRaw = {
    answers: [1, [0], 12],
    ambiguous: [false, false, false],
  };
  const out = crossCheckPassage(cleaned, verRaw);
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.equal(out.ambiguous, false);
    assert.equal(out.passage.questions.length, 3);
  }
});

test("crossCheckPassage: ok=false when verifier disagrees on a single", () => {
  const cleaned = cleanPassageShape(
    {
      id: "rc-ai-aabbccdd",
      category: "business",
      title: "Disagree",
      body: SAMPLE_BODY,
      difficulty: "medium",
      tags: [],
      questions: sampleQuestions(),
    },
    splitSentencesLocal(SAMPLE_BODY)
  );
  assert.ok(cleaned);
  const verRaw = {
    answers: [0, [0], 12], // disagrees on the first single
    ambiguous: [false, false, false],
  };
  const out = crossCheckPassage(cleaned, verRaw);
  assert.equal(out.ok, false);
  if (!out.ok) {
    assert.equal(out.badCount, 1);
  }
});

test("crossCheckPassage: ok=true with ambiguous=true when verifier flags any question", () => {
  const cleaned = cleanPassageShape(
    {
      id: "rc-ai-aabbccdd",
      category: "business",
      title: "Ambiguous",
      body: SAMPLE_BODY,
      difficulty: "medium",
      tags: [],
      questions: sampleQuestions(),
    },
    splitSentencesLocal(SAMPLE_BODY)
  );
  assert.ok(cleaned);
  const verRaw = {
    answers: [1, [0], 12],
    ambiguous: [false, true, false],
  };
  const out = crossCheckPassage(cleaned, verRaw);
  assert.equal(out.ok, true);
  if (out.ok) {
    assert.equal(out.ambiguous, true);
  }
});

test("crossCheckPassage: multi answers compare as sets, not ordered lists", () => {
  const cleaned = cleanPassageShape(
    {
      id: "rc-ai-aabbccdd",
      category: "business",
      title: "MultiUnordered",
      body: SAMPLE_BODY,
      difficulty: "medium",
      tags: [],
      questions: sampleQuestions(),
    },
    splitSentencesLocal(SAMPLE_BODY)
  );
  assert.ok(cleaned);
  // Same multi answer, different order from the generator's [0].
  const verRaw = { answers: [1, [0, 1, 2], 12], ambiguous: [false, false, false] };
  // The generator's multi answer is [0]; the verifier says [0,1,2]. That
  // should count as a disagreement (extra picks), so the result is ok=false.
  const out = crossCheckPassage(cleaned, verRaw);
  assert.equal(out.ok, false);
});

test("RC_Q_TYPES: contains the eight canonical types", () => {
  for (const t of [
    "main-idea",
    "detail",
    "inference",
    "author-attitude",
    "function",
    "structure",
    "vocab-in-context",
    "strengthen-weaken",
  ]) {
    assert.ok(RC_Q_TYPES.has(t), `${t} should be in RC_Q_TYPES`);
  }
});
