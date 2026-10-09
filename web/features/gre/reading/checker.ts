// Pure answer checker for reading-comprehension questions.
//
// Handles both the legacy shape (`type: "rc-single" | "rc-multi"`) and the
// upgraded shape (`kind: "single" | "multi" | "select-sentence"`) during
// the migration window. The legacy shape is expected to be retired in a
// later commit.
//
// Mirrors features/gre/quant/checker.ts but for the RC question types:
//   - single:  correct if choice index matches.
//   - multi:   correct if the *set* of selected indices exactly equals
//              the answer's set (order-insensitive).
//   - select-sentence: correct if the chosen sentence index matches.
//
// All exported helpers are pure functions: no I/O, no globals, safe to
// call from the practice client, the mock runner, and the worker.

import type { ReadingQuestion, RcQuestion } from "@/features/gre/content/loader.types";
import type { UserAnswer } from "@/features/gre/progress/repository";

/** Internal normalized view: a question with a discriminator `shape` we
 * can switch on. Both legacy and new shapes are accepted. */
type AnyQuestion = (ReadingQuestion | RcQuestion) & { _shape?: "legacy" | "upgraded" };

function normalize(q: AnyQuestion): {
  shape: "legacy" | "upgraded";
  kind: "single" | "multi" | "select-sentence";
  choices: readonly string[];
  answer: number | readonly number[];
} {
  if ("kind" in q) {
    return {
      shape: "upgraded",
      kind: q.kind,
      choices: (q as RcQuestion).kind === "select-sentence" ? [] : (q as Extract<RcQuestion, { kind: "single" | "multi" }>).choices,
      answer: (q as RcQuestion).answer as number | readonly number[],
    };
  }
  return {
    shape: "legacy",
    kind: q.type === "rc-single" ? "single" : "multi",
    choices: q.choices,
    answer: q.answer as number | readonly number[],
  };
}

/** Returns true iff the user's answer matches the question's correct answer. */
export function checkAnswer(q: ReadingQuestion | RcQuestion, user: UserAnswer): boolean {
  const n = normalize(q as AnyQuestion);
  switch (n.kind) {
    case "single":
      if (n.shape === "upgraded") {
        return user.type === "rc-single" && user.choice === (n.answer as number);
      }
      return user.type === "rc-single" && user.choice === (n.answer as number);
    case "multi": {
      if (user.type !== "rc-multi") return false;
      const a = [...user.choices].sort((x, y) => x - y);
      const b = [...(n.answer as readonly number[])].sort((x, y) => x - y);
      if (a.length !== b.length) return false;
      return a.every((v, i) => v === b[i]);
    }
    case "select-sentence": {
      if (user.type !== "rc-sentence") return false;
      return user.sentence === (n.answer as number);
    }
  }
}

/** Convert a UserAnswer into a short human-readable string. */
export function formatAnswer(q: ReadingQuestion | RcQuestion, ans: UserAnswer | undefined): string {
  if (!ans) return "(no answer)";
  const n = normalize(q as AnyQuestion);
  if (n.kind === "single" && ans.type === "rc-single") {
    return `${ans.choice + 1}. ${n.choices[ans.choice] ?? "?"}`;
  }
  if (n.kind === "multi" && ans.type === "rc-multi") {
    return ans.choices
      .slice()
      .sort((a, b) => a - b)
      .map((i) => `${i + 1}. ${n.choices[i] ?? "?"}`)
      .join("; ");
  }
  if (n.kind === "select-sentence" && ans.type === "rc-sentence") {
    return `Sentence ${ans.sentence + 1}`;
  }
  return "(invalid)";
}

/** Convert a question's correct answer into a human-readable string. */
export function formatCorrectAnswer(q: ReadingQuestion | RcQuestion): string {
  const n = normalize(q as AnyQuestion);
  if (n.kind === "single") {
    return `${(n.answer as number) + 1}. ${n.choices[n.answer as number] ?? "?"}`;
  }
  if (n.kind === "multi") {
    return [...(n.answer as readonly number[])]
      .sort((a, b) => a - b)
      .map((i) => `${i + 1}. ${n.choices[i] ?? "?"}`)
      .join("; ");
  }
  return `Sentence ${(n.answer as number) + 1}`;
}
