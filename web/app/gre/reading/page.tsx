// /gre/reading — category grid. Mirrors /gre/quant.

import Link from "next/link";
import { getManifest, getReadingCategories, getTaxonomy } from "@/features/gre/content/loader";
import { GreManifestSeed } from "@/features/gre/quant/components/gre-manifest-seed";

export const dynamic = "force-dynamic";

const TITLES: Record<string, string> = {
  business: "Business",
  science: "Science",
  "social-science": "Social Science",
  arts: "Arts & Humanities",
};

export default function GreReadingIndexPage() {
  const manifest = getManifest();
  const taxonomy = getTaxonomy();
  const cats = getReadingCategories();

  return (
    <>
      <GreManifestSeed manifest={manifest} taxonomy={taxonomy} />
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 md:p-10">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold md:text-3xl">Reading Comprehension</h1>
          <p className="text-sm text-slate-400">
            Pick a category. Each passage includes 3–5 questions modeled on the real GRE.
            Use the AI-fill button on a category page to generate fresh practice material.
          </p>
          <div className="pt-2">
            <Link
              href="/gre/reading/mock"
              className="inline-flex rounded-md bg-cyan-400/20 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/30"
            >
              Start a timed reading mock (4 passages, 30 min) →
            </Link>
          </div>
        </header>

        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {cats.map((cat) => {
            const m = manifest.reading?.[cat] ?? { count: 0, easy: 0, medium: 0, hard: 0, shards: 0, passages: 0, questions: 0 };
            return (
              <li key={cat}>
                <Link
                  href={`/gre/reading/${cat}`}
                  className="block rounded-2xl border border-slate-200/20 bg-slate-900/40 p-5 transition hover:border-cyan-400/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold">{TITLES[cat] ?? cat}</h2>
                    <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-xs text-cyan-200">
                      {m.passages} passages
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {m.questions} questions · {m.passages} passages
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
