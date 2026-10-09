// /gre/reading/[slug]/[passageId] — single passage practice.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getManifest, getPassage, getReadingCategories, getTaxonomy } from "@/features/gre/content/loader";
import { GreManifestSeed } from "@/features/gre/quant/components/gre-manifest-seed";
import { GrePassageSolver } from "@/features/gre/reading/components/gre-passage-solver";

export const dynamic = "force-dynamic";

export default async function GreReadingPassagePage({
  params,
}: {
  params: Promise<{ slug: string; passageId: string }>;
}) {
  const { slug, passageId } = await params;
  if (!getReadingCategories().includes(slug as ReturnType<typeof getReadingCategories>[number])) notFound();
  const passage = getPassage(passageId);
  if (!passage) notFound();
  const manifest = getManifest();
  const taxonomy = getTaxonomy();
  return (
    <>
      <GreManifestSeed manifest={manifest} taxonomy={taxonomy} />
      <div className="mx-auto flex max-w-6xl flex-col gap-5 p-6 md:p-10">
        <div className="flex items-center justify-between text-sm text-slate-400">
          <Link href={`/gre/reading/${slug}`} className="hover:text-cyan-200">
            ← Back to {slug.replace("-", " ")}
          </Link>
        </div>
        <GrePassageSolver passage={passage} source="hand" />
      </div>
    </>
  );
}
