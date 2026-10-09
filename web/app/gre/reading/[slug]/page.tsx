// /gre/reading/[slug] — passage grid for a single category. The AI-fill
// panel mounts a client island that hits /api/reading/generate.

import Link from "next/link";
import { notFound } from "next/navigation";
import { getManifest, getPassageList, getReadingCategories, getTaxonomy } from "@/features/gre/content/loader";
import { GreManifestSeed } from "@/features/gre/quant/components/gre-manifest-seed";
import { GrePassageList } from "@/features/gre/reading/components/gre-passage-list";
import { GreAiFillPanel } from "@/features/gre/reading/components/gre-ai-fill-panel";

export const dynamic = "force-dynamic";

const TITLES: Record<string, string> = {
  business: "Business",
  science: "Science",
  "social-science": "Social Science",
  arts: "Arts & Humanities",
};

export default async function GreReadingCategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!getReadingCategories().includes(slug as ReturnType<typeof getReadingCategories>[number])) notFound();
  const passages = getPassageList(slug as Parameters<typeof getPassageList>[0]);
  const manifest = getManifest();
  const taxonomy = getTaxonomy();
  const m = manifest.reading?.[slug as keyof typeof manifest.reading];
  return (
    <>
      <GreManifestSeed manifest={manifest} taxonomy={taxonomy} />
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 md:p-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-400">Reading</p>
            <h1 className="text-2xl font-bold md:text-3xl">{TITLES[slug] ?? slug}</h1>
            <p className="text-sm text-slate-400">
              {m ? `${m.passages} passages · ${m.questions} questions · ${m.easy} easy / ${m.medium} medium / ${m.hard} hard` : "—"}
            </p>
          </div>
          <Link
            href="/gre/reading"
            className="rounded-md border border-slate-200/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60"
          >
            ← All categories
          </Link>
        </div>

        <GreAiFillPanel category={slug as Parameters<typeof getPassageList>[0]} />

        <GrePassageList
          category={slug as Parameters<typeof getPassageList>[0]}
          passages={passages}
        />
      </div>
    </>
  );
}
