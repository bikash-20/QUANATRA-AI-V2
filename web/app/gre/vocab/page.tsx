// /gre/vocab — list of vocab sets with progress.

import { getManifest, getTaxonomy } from "@/features/gre/content/loader";
import { GreManifestSeed } from "@/features/gre/quant/components/gre-manifest-seed";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function GreVocabIndexPage() {
  const manifest = getManifest();
  const taxonomy = getTaxonomy();
  return (
    <>
      <GreManifestSeed manifest={manifest} taxonomy={taxonomy} />
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 md:p-10">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold md:text-3xl">Vocabulary</h1>
          <p className="text-sm text-slate-400">
            {manifest.totals.vocab} hard GRE words across 3 tiers, in 2 sets of 25.
          </p>
        </header>

        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Object.entries(manifest.vocab).map(([set, v]) => (
            <li key={set}>
              <Link
                href={`/gre/vocab/${set}`}
                className="block rounded-2xl border border-slate-200/20 bg-slate-900/40 p-5 transition hover:border-cyan-400/40"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">{set}</h2>
                  <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-xs text-cyan-200">
                    {v.count} words
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">Click to see words, mark status, or take a quiz.</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}