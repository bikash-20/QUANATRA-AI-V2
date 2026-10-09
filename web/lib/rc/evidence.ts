// Pure parser for the `EVIDENCE: 3,4` trailer the RC explainer returns.
// Extracted from lib/explanations.ts so it can be unit-tested without
// pulling in the rest of the explanation pipeline (which imports the
// IDB layer and the api client).

/**
 * Pull the `EVIDENCE: 3,4` trailer off an explanation string. Tolerant
 * of whitespace and case; returns [] if the trailer is missing or
 * malformed.
 */
export function parseEvidenceFromText(text: string): number[] {
  if (typeof text !== "string" || !text) return [];
  const match = text.match(/EVIDENCE\s*:\s*([0-9,\s]+)\s*$/im);
  if (!match) return [];
  const out: number[] = [];
  for (const piece of match[1].split(",")) {
    const n = parseInt(piece.trim(), 10);
    if (Number.isFinite(n) && n >= 0 && !out.includes(n)) out.push(n);
  }
  return out;
}