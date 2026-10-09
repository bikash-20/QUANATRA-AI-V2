// Pure answer checker for reading-comprehension questions.
//
// Mirrors features/gre/quant/checker.ts but for the two RC question types:
//   - rc-single: correct if choice index matches.
//   - rc-multi:  correct if the *set* of selected indices exactly equals
//                the answer's set (order-insensitive).
//
// All exported helpers are pure functions: no I/O, no globals, safe to
// call from the practice client, the mock runner, and the worker.

import type { ReadingQuestion } from "@/features/gre/content/loader.types";
import type { UserAnswer } from "@/features/gre/progress/repository";

/** Returns true iff the user's answer matches the question's correct answer. */
export function checkAnswer(q: ReadingQuestion, user: UserAnswer): boolean {
  switch (q.type) {
    case "rc-single":
      return user.type === "rc-single" && user.choice === q.answer;
    case "rc-multi": {
      if (user.type !== "rc-multi") return false;
      const a = [...user.choices].sort((x, y) => x - y);
      const b = [...q.answer].sort((x, y) => x - y);
      if (a.length !== b.length) return false;
      return a.every((v, i) => v === b[i]);
    }
  }
}

/** Convert a UserAnswer into a short human-readable string. */
export function formatAnswer(q: ReadingQuestion, ans: UserAnswer | undefined): string {
  if (!ans) return "(no answer)";
  if (q.type === "rc-single" && ans.type === "rc-single") {
    return `${ans.choice + 1}. ${q.choices[ans.choice] ?? "?"}`;
  }
  if (q.type === "rc-multi" && ans.type === "rc-multi") {
    return ans.choices
      .slice()
      .sort((a, b) => a - b)
      .map((i) => `${i + 1}. ${q.choices[i] ?? "?"}`)
      .join("; ");
  }
  return "(invalid)";
}

/** Convert a question's correct answer into a human-readable string. */
export function formatCorrectAnswer(q: ReadingQuestion): string {
  if (q.type === "rc-single") {
    return `${q.answer + 1}. ${q.choices[q.answer] ?? "?"}`;
  }
  return q.answer
    .slice()
    .sort((a, b) => a - b)
    .map((i) => `${i + 1}. ${q.choices[i] ?? "?"}`)
    .join("; ");
}
