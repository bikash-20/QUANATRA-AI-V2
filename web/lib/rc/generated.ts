// Per-user IDB store for AI-generated RC passages. Each passage is
// stored with its frozen `sentences[]` (so the splitter-version used
// at generation time survives across sessions) and the metadata the
// worker returns: generator / verifier model ids, verification tier,
// creation timestamp, and category.

import { dbDelete, dbGet, dbList, dbPut } from "../db.ts";

export type GeneratedVerification = "cross-checked" | "weak" | "single-model";

export type GeneratedPassageRecord = {
  id: string;             // rc-ai-<8-hex>
  passage: unknown;       // full RcPassage envelope (untyped here so we
                          // don't pull the loader into this module)
  sentences: string[];
  generatorModel: string;
  verifierModel: string | null;
  verification: GeneratedVerification;
  createdAt: number;
  category: string;
  /** Optional: topic string the user typed when generating. */
  topic?: string;
};

const STORE = "rcGenerated" as const;

export async function saveGenerated(rec: GeneratedPassageRecord): Promise<void> {
  await dbPut(STORE, rec);
}

export async function listGenerated(category?: string): Promise<GeneratedPassageRecord[]> {
  const all = await dbList<GeneratedPassageRecord>(STORE);
  const filtered = category ? all.filter((r) => r.category === category) : all;
  // Newest first.
  filtered.sort((a, b) => b.createdAt - a.createdAt);
  return filtered;
}

export async function getGenerated(id: string): Promise<GeneratedPassageRecord | null> {
  return dbGet<GeneratedPassageRecord>(STORE, id);
}

export async function deleteGenerated(id: string): Promise<void> {
  await dbDelete(STORE, id);
}
