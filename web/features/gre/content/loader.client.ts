// Client-safe manifest + taxonomy loader. Reads from window.__greSeed__
// (set by the server-rendered <GreManifestSeed/>) and falls back to a
// fetch from /public/gre-data/ if not present.

import type { Manifest, Taxonomy } from "./loader.types";

declare global {
  interface Window {
    __greSeed__?: { manifest: Manifest; taxonomy: Taxonomy };
  }
}

let manifestCache: Manifest | null = null;
let taxonomyCache: Taxonomy | null = null;

function readSeed(): { manifest: Manifest; taxonomy: Taxonomy } | null {
  if (typeof window === "undefined") return null;
  return window.__greSeed__ ?? null;
}

export function getManifest(): Manifest {
  if (manifestCache) return manifestCache;
  const seed = readSeed();
  if (seed) {
    manifestCache = seed.manifest;
    taxonomyCache = seed.taxonomy;
    return manifestCache;
  }
  return { generatedAt: "", quant: {}, vocab: {}, totals: { quant: 0, vocab: 0 } };
}

export function getTaxonomy(): Taxonomy {
  if (taxonomyCache) return taxonomyCache;
  const seed = readSeed();
  if (seed) {
    manifestCache = seed.manifest;
    taxonomyCache = seed.taxonomy;
    return taxonomyCache;
  }
  return {
    version: 0,
    quant: [],
    questionTypes: {
      mcq: "", multi: "", qc: "", numeric: "",
      "rc-single": "", "rc-multi": "",
      "rc-single-answer": "", "rc-multi-answer": "", "rc-sentence": "",
    },
    qcChoices: [],
    difficulty: ["easy", "medium", "hard"],
    vocabTiers: { "1": "Hard", "2": "Harder", "3": "Hardest" },
    reading: ["business", "science", "social-science", "arts"],
  };
}
