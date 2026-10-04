// /gre/quant — topic grid. Server component, client island for progress %.

import { getManifest, getTaxonomy } from "@/features/gre/content/loader";
import { GreManifestSeed } from "@/features/gre/quant/components/gre-manifest-seed";
import { GreTopicProgressIsland } from "@/features/gre/quant/components/gre-topic-progress-island";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function GreQuantIndexPage() {
  const manifest = getManifest();
  const taxonomy = getTaxonomy();
  return (
    <>
      <GreManifestSeed manifest={manifest} taxonomy={taxonomy} />
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 md:p-10">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold md:text-3xl">Quant topics</h1>
          <p className="text-sm text-slate-400">
            Pick a topic to see its notes, problems, and your progress.
          </p>
        </header>
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {taxonomy.quant.map((t) => {
            const m = manifest.quant[t.slug] ?? { count: 0, easy: 0, medium: 0, hard: 0, shards: 0 };
            return (
              <li key={t.slug}>
                <Link
                  href={`/gre/quant/${t.slug}`}
                  className="block rounded-2xl border border-slate-200/20 bg-slate-900/40 p-5 transition hover:border-cyan-400/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold">{t.title}</h2>
                    <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-xs text-cyan-200">
                      {m.count} q
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {m.easy} easy · {m.medium} medium · {m.hard} hard
                  </p>
                  <GreTopicProgressIsland topic={t.slug} total={m.count} />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}