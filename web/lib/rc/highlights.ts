// Per-passage highlights + note, persisted in IndexedDB.
//
// Highlights are character-offset ranges into the passage body. The
// solver snapshots `body` once and computes sentence boundaries; the
// highlighter never reaches into the rendered DOM — offsets are
// converted to display spans at render time by gre-passage-text.tsx
// (added in commit #9). For now this module exposes the storage and
// sanitization helpers; the toolbar component lands in the same commit.

import { dbDelete, dbGet, dbPut } from "../db.ts";

export type HighlightColor = "yellow" | "green";

export type RcHighlight = {
  start: number;
  end: number;
  color: HighlightColor;
};

export type RcPassageNotes = {
  id: string;            // passageId
  passageId: string;
  highlights: RcHighlight[];
  note?: string;
  updatedAt: number;
};

const STORE = "rcHighlights" as const;

/**
 * Clamp highlights to the body length, drop overlaps (keeping the
 * first one in array order), and sort ascending by start. Pure
 * function so we can unit-test it without IDB.
 */
export function sanitizeHighlights(
  ranges: readonly RcHighlight[],
  bodyLength: number
): RcHighlight[] {
  if (!Array.isArray(ranges)) return [];
  const cleaned: RcHighlight[] = [];
  for (const r of ranges) {
    if (!r || typeof r.start !== "number" || typeof r.end !== "number") continue;
    if (r.color !== "yellow" && r.color !== "green") continue;
    if (r.end <= r.start) continue;
    const start = Math.max(0, Math.min(r.start, bodyLength));
    const end = Math.max(0, Math.min(r.end, bodyLength));
    if (end <= start) continue;
    cleaned.push({ start, end, color: r.color });
  }
  cleaned.sort((a, b) => a.start - b.start || a.end - b.end);
  // Drop overlaps: if A.end > B.start (where A precedes B), clip B.
  const out: RcHighlight[] = [];
  for (const r of cleaned) {
    const last = out[out.length - 1];
    if (last && r.start < last.end) {
      // Skip overlapping; first write wins.
      continue;
    }
    out.push(r);
  }
  return out;
}

/**
 * Replace the highlights + note for a passage. If `bodyLength` is given,
 * the input ranges are sanitized first. Pass undefined to clear.
 */
export async function saveHighlights(
  passageId: string,
  highlights: readonly RcHighlight[],
  note: string | undefined,
  bodyLength?: number
): Promise<RcPassageNotes> {
  const cleaned = typeof bodyLength === "number"
    ? sanitizeHighlights(highlights, bodyLength)
    : sanitizeHighlights(highlights, Number.MAX_SAFE_INTEGER);
  const record: RcPassageNotes = {
    id: passageId,
    passageId,
    highlights: cleaned,
    note,
    updatedAt: Date.now(),
  };
  await dbPut(STORE, record);
  return record;
}

export async function getHighlights(passageId: string): Promise<RcPassageNotes | null> {
  return dbGet<RcPassageNotes>(STORE, passageId);
}

export async function clearHighlights(passageId: string): Promise<void> {
  await dbDelete(STORE, passageId);
}