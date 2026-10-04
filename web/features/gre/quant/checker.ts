// Pure answer checker for the four GRE quant question types.
//
// Rules (per user spec):
//   - mcq:    correct if choice index matches.
//   - multi:  correct if the *set* of selected indices exactly equals the
//             answer's set (order-insensitive).
//   - qc:     correct if letter matches.
//   - numeric: correct if user input parses to a finite number and the
//              absolute difference is within tolerance. Integers are
//              exact (no tolerance). Accepts fractions "5/36", decimals,
//              commas, whitespace, and an optional leading minus.

import type { QuantQuestion } from "../content/loader";
import type { UserAnswer } from "../progress/repository";

export const NUMERIC_TOLERANCE = 1e-6;

/**
 * Parse a free-form numeric string.
 * Accepts: "5/36", "0.138888", "5,000", "  -3 ", "1e-3", etc.
 * Returns null if the string is not a parseable number.
 */
export function parseNumericInput(raw: string): number | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/,/g, "").replace(/\s+/g, "");
  if (!s) return null;

  // Fractions: a/b where both parts are parseable numbers.
  if (/^-?\d+\s*\/\s*-?\d+(\.\d+)?$/.test(s)) {
    const [num, den] = s.split("/").map((x) => Number(x.trim()));
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
    return num / den;
  }
  // Plain number.
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Compare two numbers under the integer-exact / float-tolerance rule.
 *  - If both numbers are safe integers (Number.isSafeInteger), require exact match.
 *  - Otherwise, |a-b| <= tolerance.
 */
export function numbersClose(a: number, b: number, tolerance = NUMERIC_TOLERANCE): boolean {
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  if (Number.isSafeInteger(a) && Number.isSafeInteger(b)) return a === b;
  return Math.abs(a - b) <= tolerance;
}

/** Returns true iff the user's answer matches the question's correct answer. */
export function checkAnswer(q: QuantQuestion, user: UserAnswer): boolean {
  switch (q.type) {
    case "mcq":
      return user.type === "mcq" && user.choice === q.answer;
    case "multi": {
      if (user.type !== "multi") return false;
      const a = [...user.choices].sort((x, y) => x - y);
      const b = [...q.answer].sort((x, y) => x - y);
      if (a.length !== b.length) return false;
      return a.every((v, i) => v === b[i]);
    }
    case "qc":
      return user.type === "qc" && user.letter === q.answer;
    case "numeric": {
      if (user.type !== "numeric") return false;
      return numbersClose(user.value, q.answer);
    }
  }
}

/** Convert a UserAnswer into a short human-readable string. */
export function formatAnswer(q: QuantQuestion, ans: UserAnswer | undefined): string {
  if (!ans) return "(no answer)";
  switch (q.type) {
    case "mcq":
      return ans.type === "mcq" && q.type === "mcq"
        ? `${ans.choice + 1}. ${q.choices[ans.choice] ?? "?"}`
        : "(invalid)";
    case "multi":
      if (ans.type !== "multi" || q.type !== "multi") return "(invalid)";
      return ans.choices
        .slice()
        .sort((a: number, b: number) => a - b)
        .map((i: number) => `${i + 1}. ${q.choices[i] ?? "?"}`)
        .join("; ");
    case "qc":
      return ans.type === "qc" ? `${ans.letter}. ${qcText(ans.letter)}` : "(invalid)";
    case "numeric":
      return ans.type === "numeric" ? String(ans.value) : "(invalid)";
  }
}

/** Convert a question's correct answer into a human-readable string. */
export function formatCorrectAnswer(q: QuantQuestion): string {
  switch (q.type) {
    case "mcq":
      return `${q.answer + 1}. ${q.choices[q.answer] ?? "?"}`;
    case "multi":
      return q.answer
        .slice()
        .sort((a, b) => a - b)
        .map((i) => `${i + 1}. ${q.choices[i] ?? "?"}`)
        .join("; ");
    case "qc":
      return `${q.answer}. ${qcText(q.answer)}`;
    case "numeric":
      return String(q.answer);
  }
}

const QC_LABELS = [
  "Quantity A is greater",
  "Quantity B is greater",
  "The two quantities are equal",
  "The relationship cannot be determined from the information given",
];

export function qcText(letter: "A" | "B" | "C" | "D"): string {
  const idx = "ABCD".indexOf(letter);
  return QC_LABELS[idx] ?? letter;
}

/** Convert a free-text numeric input from the user into a UserAnswer of type "numeric". */
export function numericAnswerFromInput(raw: string): UserAnswer | null {
  const v = parseNumericInput(raw);
  if (v === null) return null;
  return { type: "numeric", value: v };
}