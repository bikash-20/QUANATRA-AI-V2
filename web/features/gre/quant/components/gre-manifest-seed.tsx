// Tiny server component that injects the manifest + taxonomy into
// window.__greSeed__ so client islands can read them synchronously
// without a fetch. Avoids the round trip on first paint.

import type { Manifest, Taxonomy } from "@/features/gre/content/loader.types";

export function GreManifestSeed({ manifest, taxonomy }: { manifest: Manifest; taxonomy: Taxonomy }) {
  const json = JSON.stringify({ manifest, taxonomy });
  // Use a self-invoking function in a script tag so the data is set before
  // any island runs.
  const script = `window.__greSeed__=${json};`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}