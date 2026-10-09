// Admin-only: draft new AI-generated RC passages for review.
//
// Run from web/:
//   npm run gre:draft-passages -- --category=business --topic="venture capital"
//   npm run gre:draft-passages -- --category=science --count=3 --difficulty=hard
//
// Each invocation POSTs to /api/gre/generate-passage on the configured
// `NEXT_PUBLIC_API_URL` (default http://localhost:8787) and writes the
// returned envelope to `content/gre/rc/_drafts/<category>-<timestamp>.json`.
// The drafts directory is in .gitignore and is never served — these are
// review material only. The loader explicitly excludes it.
//
// This is not the path the user takes to generate practice passages; the
// in-app /gre/reading/[slug] panel writes its results to the user's
// IndexedDB. This script is for admins / authors who want to draft new
// candidates that might eventually be promoted into the committed
// content/gre/reading/ tree.

import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const draftsDir = join(here, "..", "content", "gre", "rc", "_drafts");

// ----------------------------------------------------------------------------
// CLI parsing
// ----------------------------------------------------------------------------

const VALID_CATEGORIES = ["business", "science", "social-science", "arts"];
const VALID_DIFFICULTIES = ["easy", "medium", "hard"];

function parseArgs(argv) {
  const out = {
    category: null,
    topic: null,
    difficulty: "medium",
    count: 4,
    kindsMix: null,
    apiUrl: null,
    help: false,
  };
  for (const arg of argv.slice(2)) {
    if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg.startsWith("--category=")) out.category = arg.slice("--category=".length);
    else if (arg.startsWith("--topic=")) out.topic = arg.slice("--topic=".length);
    else if (arg.startsWith("--difficulty=")) out.difficulty = arg.slice("--difficulty=".length);
    else if (arg.startsWith("--count=")) out.count = Number(arg.slice("--count=".length));
    else if (arg.startsWith("--kindsMix=")) {
      try {
        out.kindsMix = JSON.parse(arg.slice("--kindsMix=".length));
      } catch {
        throw new Error(`--kindsMix must be a JSON object (got: ${arg})`);
      }
    } else if (arg.startsWith("--api=")) out.apiUrl = arg.slice("--api=".length);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return out;
}

function usage() {
  return [
    "Usage: npm run gre:draft-passages -- [flags]",
    "",
    "Flags:",
    `  --category=<one of ${VALID_CATEGORIES.join("|")}>   (required)`,
    "  --topic=<string>            Free-form topic; defaults to the category name.",
    `  --difficulty=<${VALID_DIFFICULTIES.join("|")}>      Defaults to medium.`,
    "  --count=<3|4|5>              Questions per passage. Defaults to 4.",
    "  --kindsMix=<json>            Optional object of qType → count (e.g. '{\"inference\":2}').",
    "  --api=<url>                  Worker URL. Defaults to NEXT_PUBLIC_API_URL or http://localhost:8787.",
    "  --help, -h                   Show this help.",
    "",
    "Output: <web>/content/gre/rc/_drafts/<category>-<timestamp>.json (gitignored).",
  ].join("\n");
}

// ----------------------------------------------------------------------------
// API call
// ----------------------------------------------------------------------------

function resolveApiUrl(cliUrl) {
  if (cliUrl) return cliUrl;
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl.length > 0) return envUrl;
  return "http://localhost:8787";
}

async function generateOne({ apiUrl, category, topic, difficulty, count, kindsMix }) {
  const url = `${apiUrl.replace(/\/$/, "")}/api/gre/generate-passage`;
  const body = {
    category,
    topic: topic ?? category,
    difficulty,
    count,
    lang: "en",
  };
  if (kindsMix) body.kindsMix = kindsMix;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 240)}`);
  }
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response: ${text.slice(0, 240)}`);
  }
  if (json.error) throw new Error(`worker error: ${json.error}`);
  return json;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help || !opts.category) {
    console.log(usage());
    process.exit(opts.help ? 0 : 1);
  }
  if (!VALID_CATEGORIES.includes(opts.category)) {
    throw new Error(
      `category must be one of ${VALID_CATEGORIES.join("|")} (got: ${opts.category})`
    );
  }
  if (!VALID_DIFFICULTIES.includes(opts.difficulty)) {
    throw new Error(
      `difficulty must be one of ${VALID_DIFFICULTIES.join("|")} (got: ${opts.difficulty})`
    );
  }
  if (!Number.isInteger(opts.count) || opts.count < 3 || opts.count > 5) {
    throw new Error(`count must be 3, 4, or 5 (got: ${opts.count})`);
  }

  const apiUrl = resolveApiUrl(opts.apiUrl);
  console.log(`[draft-passages] POST ${apiUrl}/api/gre/generate-passage`);
  console.log(
    `[draft-passages] category=${opts.category} topic=${opts.topic ?? opts.category} ` +
      `difficulty=${opts.difficulty} count=${opts.count}`
  );

  const start = Date.now();
  const passage = await generateOne({ apiUrl, ...opts });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(
    `[draft-passages] received passage in ${elapsed}s — ` +
      `source=${passage.source ?? "?"} verification=${passage.verification ?? "?"} ` +
      `generator=${passage.generatorModel ?? "?"} verifier=${passage.verifierModel ?? "(none)"}`
  );

  mkdirSync(draftsDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${opts.category}-${ts}.json`;
  const outPath = join(draftsDir, filename);
  writeFileSync(outPath, JSON.stringify(passage, null, 2) + "\n", "utf8");
  console.log(`[draft-passages] wrote ${outPath}`);
}

main().catch((err) => {
  console.error(`[draft-passages] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});