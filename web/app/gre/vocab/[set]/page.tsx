// /gre/vocab/[set] — list of words with status, tier filter, and quiz button.

import { notFound } from "next/navigation";
import { getManifest, getTaxonomy, getVocabSet, getVocabSets } from "@/features/gre/content/loader";
import { GreManifestSeed } from "@/features/gre/quant/components/gre-manifest-seed";
import { GreVocabTable } from "@/features/gre/vocab/components/gre-vocab-table";

export const dynamic = "force-dynamic";

export default async function GreVocabSetPage({
  params,
  searchParams,
}: {
  params: Promise<{ set: string }>;
  searchParams: Promise<{ tier?: string; status?: string; q?: string }>;
}) {
  const { set: setId } = await params;
  const sp = await searchParams;
  const allSets = getVocabSets().map((s) => s.id);
  if (!allSets.includes(setId)) notFound();
  let words = getVocabSet(setId);
  if (sp.tier) {
    const t = Number(sp.tier);
    if ([1, 2, 3].includes(t)) words = words.filter((w) => w.tier === t);
  }
  if (sp.q) {
    const needle = sp.q.toLowerCase();
    words = words.filter((w) => w.word.toLowerCase().includes(needle) || w.definition.toLowerCase().includes(needle));
  }

  const manifest = getManifest();
  const taxonomy = getTaxonomy();
  return (
    <>
      <GreManifestSeed manifest={manifest} taxonomy={taxonomy} />
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 md:p-10">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold md:text-3xl">{setId}</h1>
          <p className="text-sm text-slate-400">{words.length} word{words.length === 1 ? "" : "s"} shown.</p>
        </header>
        <GreVocabTable
          setId={setId}
          words={words.map((w) => ({
            id: w.id,
            word: w.word,
            pos: w.pos,
            tier: w.tier,
            definition: w.definition,
          }))}
          filters={{ tier: sp.tier ?? "", status: sp.status ?? "", q: sp.q ?? "" }}
        />
      </div>
    </>
  );
}