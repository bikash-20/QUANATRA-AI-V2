// /gre/roadmap — 4-week checklist. Server-renders the weeks/days; the
// client island hydrates with IDB state so checkbox ticks persist.

import { getManifest, getRoadmap, getTaxonomy } from "@/features/gre/content/loader";
import { GreManifestSeed } from "@/features/gre/quant/components/gre-manifest-seed";
import { GreRoadmapIsland } from "@/features/gre/roadmap/components/gre-roadmap-island";

export const dynamic = "force-dynamic";

export default function GreRoadmapPage() {
  const manifest = getManifest();
  const taxonomy = getTaxonomy();
  const roadmap = getRoadmap();
  return (
    <>
      <GreManifestSeed manifest={manifest} taxonomy={taxonomy} />
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 md:p-10">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold md:text-3xl">4-week roadmap</h1>
          <p className="text-sm text-slate-400">
            {roadmap.weeks.length} weeks · {roadmap.weeks.reduce((acc, w) => acc + w.days.length, 0)} days.
            Tick each day as you finish it. Your progress is saved locally.
          </p>
        </header>
        <GreRoadmapIsland weeks={roadmap.weeks} />
      </div>
    </>
  );
}