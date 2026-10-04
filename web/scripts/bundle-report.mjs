#!/usr/bin/env node
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const ROOT = process.cwd();
const APP_DIR = join(ROOT, ".next/server/app");
const CHUNKS_DIR = join(ROOT, ".next/static/chunks");

function find(dir) {
  const out = [];
  for (const n of readdirSync(dir)) {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) out.push(...find(f));
    else if (n === "page_client-reference-manifest.js") out.push(f);
  }
  return out;
}

const size = (rel) => {
  try { return statSync(join(CHUNKS_DIR, basename(rel))).size; } catch { return 0; }
};

const out = [];
for (const mp of find(APP_DIR)) {
  const route = mp.replace(APP_DIR + "/", "").replace("/page_client-reference-manifest.js", "");
  const text = readFileSync(mp, "utf8");
  const startIdx = text.indexOf('"entryJSFiles":');
  if (startIdx < 0) continue;
  // scan forward to closing "}" at top-level (no nested braces after colon)
  // Find the matching closing brace for entryJSFiles.
  let depth = 0;
  let end = -1;
  for (let i = startIdx; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) continue;
  const body = text.slice(startIdx + '"entryJSFiles":'.length, end);
  // Find each key:[ ... ] and parse the chunks
  const re = /"([^"]+)":\[([^\]]+)\]/g;
  let m;
  const seen = new Set();
  let bytes = 0;
  while ((m = re.exec(body)) !== null) {
    const inner = m[2];
    const chunks = inner.match(/"([^"]+\.js)"/g) ?? [];
    for (const c of chunks) {
      const rel = c.slice(1, -1);
      if (seen.has(rel)) continue;
      seen.add(rel);
      bytes += size(rel);
    }
  }
  if (bytes > 0) out.push({ route, kb: +(bytes / 1024).toFixed(1) });
}

out.sort((a, b) => a.route.localeCompare(b.route));
console.log("Route                                          First Load JS (KB)");
console.log("-----------------------------------------------------------------");
for (const { route, kb } of out) {
  console.log(route.padEnd(48), `${kb.toFixed(1)}`.padStart(8));
}
console.log("-----------------------------------------------------------------");
const gre = out.filter((r) => r.route.startsWith("gre"));
const sumGre = gre.reduce((acc, r) => acc + r.kb, 0);
console.log(`GRE routes: ${gre.length} routes, sum ${sumGre.toFixed(1)} KB`);
const all = out.reduce((acc, r) => acc + r.kb, 0);
console.log(`All routes: ${out.length} routes, sum ${all.toFixed(1)} KB`);