// /gre/progress — accuracy / weak topics / vocab status / mock history.
// Everything is computed client-side from IDB so this page is a thin
// shell that mounts a single island.

import { getManifest, getTaxonomy, getTopics } from "@/features/gre/content/loader";
import { GreManifestSeed } from "@/features/gre/quant/components/gre-manifest-seed";
import { GreProgressIsland } from "@/features/gre/progress/components/gre-progress-detail";

export const dynamic = "force-dynamic";

export default function GreProgressPage() {
  const manifest = getManifest();
  const taxonomy = getTaxonomy();
  const topics = getTopics();
  return (
    <>
      <GreManifestSeed manifest={manifest} taxonomy={taxonomy} />
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 md:p-10">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold md:text-3xl">Progress</h1>
          <p className="text-sm text-slate-400">
            Accuracy uses the <em>first</em> attempt per question, per the
            spec. Every attempt is still stored for review.
          </p>
        </header>
        <GreProgressIsland topics={topics} />
      </div>
    </>
  );
}