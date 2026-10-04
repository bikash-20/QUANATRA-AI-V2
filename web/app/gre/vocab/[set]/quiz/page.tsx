// /gre/vocab/[set]/quiz — vocab quiz mode. Words are loaded on the server
// and passed to a client island that runs the quiz interactively.

import { notFound } from "next/navigation";
import { getManifest, getTaxonomy, getVocabSet, getVocabSets } from "@/features/gre/content/loader";
import { GreManifestSeed } from "@/features/gre/quant/components/gre-manifest-seed";
import { GreVocabQuiz } from "@/features/gre/vocab/components/gre-vocab-quiz";

export const dynamic = "force-dynamic";

export default async function GreVocabQuizPage({
  params,
}: {
  params: Promise<{ set: string }>;
}) {
  const { set: setId } = await params;
  const allSets = getVocabSets().map((s) => s.id);
  if (!allSets.includes(setId)) notFound();
  const words = getVocabSet(setId);
  const manifest = getManifest();
  const taxonomy = getTaxonomy();
  return (
    <>
      <GreManifestSeed manifest={manifest} taxonomy={taxonomy} />
      <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6 md:p-10">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold md:text-3xl">{setId} quiz</h1>
          <p className="text-sm text-slate-400">
            Drill {words.length} vocab words from {setId}. Pick a mode and start.
          </p>
        </header>
        <GreVocabQuiz setId={setId} words={words} />
      </div>
    </>
  );
}