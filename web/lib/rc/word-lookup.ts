// Local word lookup against the vocab content tree. Returns the
// VocabWord for a given string (case-insensitive, punctuation-stripped)
// or null. The point is to give the word-lookup popover an offline
// fast path for common words; the AI explanation can still fill in for
// anything not in the local list.
//
// The full vocab tree is currently server-only. Commit #9 ships a
// minimal lookup that works for tests (case + punctuation normalization
// exposed via normalizeWord) and a `lookupWord` that returns null until
// the client-side vocab mirror lands. The popover then falls through
// to the AI explainer, which is already wired up.

import type { VocabWord } from "@/features/gre/content/loader.types";

let memo: Map<string, VocabWord> | null = null;

export function normalizeWord(raw: string): string {
  if (typeof raw !== "string") return "";
  return raw.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

export function lookupWord(raw: string): VocabWord | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  if (!memo) return null;
  const w = normalizeWord(raw);
  if (!w) return null;
  return memo.get(w) ?? null;
}

/** Test-only: install a small word list (clears the memo). */
export function _setWordLookupForTests(words: VocabWord[]): void {
  const m = new Map<string, VocabWord>();
  for (const w of words) m.set(w.word.toLowerCase(), w);
  memo = m;
}

export function _resetWordLookupForTests(): void {
  memo = null;
}