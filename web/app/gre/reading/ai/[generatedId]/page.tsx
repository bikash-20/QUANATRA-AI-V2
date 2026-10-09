// /gre/reading/ai/[generatedId] — client-rendered page that hydrates a
// passage from sessionStorage (set by the AI-fill panel on the category
// page) and mounts the same solver component. Falls back to a friendly
// notice if the passage is missing (e.g. user opened the URL in a new
// tab).

import Link from "next/link";
import { getManifest, getTaxonomy } from "@/features/gre/content/loader";
import { GreManifestSeed } from "@/features/gre/quant/components/gre-manifest-seed";
import { GreAiPassageSolver } from "@/features/gre/reading/components/gre-ai-passage-solver";

export const dynamic = "force-dynamic";

export default async function GreAiPassagePage({ params }: { params: Promise<{ generatedId: string }> }) {
  const { generatedId } = await params;
  const manifest = getManifest();
  const taxonomy = getTaxonomy();
  return (
    <>
      <GreManifestSeed manifest={manifest} taxonomy={taxonomy} />
      <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6 md:p-10">
        <div className="flex items-center justify-between text-sm text-slate-400">
          <Link href="/gre/reading" className="hover:text-cyan-200">
            ← Back to reading
          </Link>
          <span className="rounded-md border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-xs text-cyan-200">
            AI-generated practice
          </span>
        </div>
        <GreAiPassageSolver passageId={decodeURIComponent(generatedId)} />
      </div>
    </>
  );
}
