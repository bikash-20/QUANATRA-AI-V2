// Dependency-free sentence splitter for the GRE RC module.
//
// Pure function, no I/O, no globals. Used by the content loader to derive
// the sentence index → body offset map for evidence highlighting, by the
// validator to check anchor drift, and by the highlighter to render the
// passage as sentence nodes.
//
// `SPLITTER_VERSION` is exported so the validator can detect drift: when
// the algorithm changes in a way that re-orders sentences, the version
// bumps and downstream consumers know to refresh their evidence anchors.
//
// Algorithm overview:
//   1. Protect known false-positive terminators (abbreviations, decimals,
//      ellipses, mid-sentence list markers) by replacing them with
//      placeholder whitespace runs. This collapses the "is this a
//      terminator?" question to a single regex.
//   2. Split on `[.!?]+` followed by whitespace + an uppercase letter (or
//      end-of-string). Each match is the end of a sentence; the next
//      character is the start of the next.
//   3. Restore the protected content.
//
// Notes:
//   * Quoted sentences like `"Wait." He said.` are split correctly because
//     the terminator is still followed by uppercase + whitespace.
//   * Numbered lists like `1. Item` are protected in step 1.
//   * We do *not* try to detect paragraph breaks as sentence breaks; a
//     paragraph is just whitespace between sentences. If a passage has
//     intentional sentence-long paragraphs the splitter still returns
//     one entry per period.

/**
 * Bump this whenever the algorithm changes in a way that re-orders or
 * re-counts sentences. The validator checks it.
 */
export const SPLITTER_VERSION = "rc-splitter@1";

/** Abbreviations whose trailing period is never a sentence terminator.
 * Each entry is wrapped with `\b` (word boundary) on the left in the
 * protect pattern so `al.` doesn't match `total.`. The trailing
 * period is added by the protect-pattern builder, not here.
 *
 * IMPORTANT: order matters. Longer multi-period entries (e.g. `U.S.A.`)
 * must come before shorter single-period entries (e.g. `U.S.`) so the
 * regex alternation matches the longer one first. JavaScript regex `|`
 * is leftmost-first, not longest-match. */
const ABBREVIATIONS = [
  // Institutional (multi-period first)
  "U\\.S\\.A", "U\\.S", "U\\.K", "U\\.N", "E\\.U",
  "Ph\\.D", "M\\.D", "B\\.A", "M\\.A", "B\\.S", "M\\.S",
  "J\\.D", "LL\\.B", "D\\.C",
  // Time (multi-period first)
  "A\\.M", "P\\.M", "a\\.m", "p\\.m",
  // Titles
  "Mrs", "Mr", "Ms", "Dr", "Prof", "Sr", "Jr", "St", "Mt", "Ft",
  "Lt", "Sgt", "Capt", "Gov", "Sen", "Rep", "Gen", "Col", "Cpl",
  "Pfc", "Adm", "Hon",
  // Latin / scholarly
  "e\\.g", "i\\.e", "cf", "vs", "etc", "viz", "al",
] as const;

/**
 * Build the protect-pattern. Matches a protected token + its trailing
 * period (one or more) and captures the whole thing so we can restore
 * the original (with the period) after splitting.
 */
const PROTECT_PATTERN = new RegExp(
  [
    // Numbered list markers: "1. ", "12. " (digit(s) + period + space + capital)
    "\\b\\d+\\.\\s+[A-Z]",
    // Decimals: digit(s).digit(s) (optionally more dot groups like 2.7.1)
    "\\b\\d+(?:\\.\\d+)+",
    // Ellipses (three periods or unicode)
    "\\.{3}|…",
    // Abbreviations: each entry has a word boundary on the left so
    // `al.` doesn't match `total.`. The trailing `\.` is added here.
    ...ABBREVIATIONS.map((a) => `\\b${a}\\.`),
  ].join("|"),
  "g",
);

/**
 * Replace every protected token with a "neutralized" version that keeps
 * the original character count the same so offsets are preserved, but
 * removes the terminator-period followed by space+uppercase pattern.
 *
 * Concretely: we replace every `.` inside a protected match with a
 * middle-dot `·` (Unicode U+00B7) so:
 *   * the original character count is preserved (offsets survive)
 *   * the split regex (`.` followed by space+uppercase) no longer matches
 *   * the original digits / letters are recoverable by `·` → `.` restore
 */
function protect(s: string): string {
  return s.replace(PROTECT_PATTERN, (match) => match.replace(/\./g, "·"));
}

/** Restore protected tokens by swapping the middle-dot back to period. */
function restore(s: string): string {
  return s.replace(/·/g, ".");
}

/**
 * Split a passage body into sentences. Returns a non-empty array of
 * trimmed strings. Trailing/leading whitespace is stripped per entry.
 *
 * The output order is the same as the input order. The character count
 * of the joined output (after a `"\n".join(sentences)`) is NOT preserved
 * in general, because we trim each entry. If you need character offsets
 * into the original body, use `splitSentencesWithOffsets` instead.
 */
export function splitSentences(body: string): string[] {
  if (!body) return [];
  const protectedBody = protect(body);
  // Variable-width lookbehind: [.!?] alone, or [.!?] followed by an
  // optional closing quote/paren. This covers both "Wait. He" and
  // "Wait." He without consuming the closing quote. The split fires
  // at the whitespace so the previous sentence (including the closing
  // quote) stays intact.
  const parts = protectedBody.split(
    /(?<=[.!?][\]\)\"\'\u201D\u2019]?)\s+(?=[A-Z\"\'\u201C\u2018\(\[])/g,
  );
  return parts
    .map((p) => restore(p).trim())
    .filter((p) => p.length > 0);
}

/**
 * Split + return the (start, end) character offsets into the original
 * body for each sentence. The offset is computed by walking the
 * *protected* body and locating each non-whitespace boundary, then
 * remapping back. We use a simpler approach: split on the protected
 * body, then for each piece find its first occurrence in the original
 * body starting from the previous end. This is O(n²) in the worst case
 * but n is small (≤ 60 sentences per passage).
 */
export function splitSentencesWithOffsets(body: string): Array<{ start: number; end: number; text: string }> {
  const sentences = splitSentences(body);
  if (sentences.length === 0) return [];
  const out: Array<{ start: number; end: number; text: string }> = [];
  let cursor = 0;
  for (const s of sentences) {
    // Find the first occurrence of `s` in `body` at or after `cursor`.
    // We search the trimmed text; the original may have a small amount
    // of leading whitespace inside the slice, but the first non-WS char
    // of `s` will match.
    const head = s.replace(/^\s+/, "");
    const idx = body.indexOf(head, cursor);
    if (idx < 0) {
      // Defensive: should not happen, but if it does, place the sentence
      // at the cursor and advance.
      out.push({ start: cursor, end: cursor + head.length, text: s });
      cursor += head.length;
      continue;
    }
    const start = idx;
    const end = idx + head.length;
    out.push({ start, end, text: s });
    cursor = end;
  }
  return out;
}

/** First N whitespace-separated words of a string, used for anchor
 * generation in the validator. */
export function firstWords(s: string, n = 5): string {
  return s
    .trim()
    .split(/\s+/)
    .slice(0, n)
    .join(" ");
}
