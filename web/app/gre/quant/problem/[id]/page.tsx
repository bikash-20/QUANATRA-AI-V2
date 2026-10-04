// /gre/quant/problem/[id] — single problem page. Server-renders the
// question; the answer input + submit + AI explain are a client island.

import { notFound } from "next/navigation";
import {
  getAllQuestions,
  getManifest,
  getQuestion,
  getTaxonomy,
} from "@/features/gre/content/loader";
import { GreManifestSeed } from "@/features/gre/quant/components/gre-manifest-seed";
import { GreProblemSolver } from "@/features/gre/quant/components/gre-problem-solver";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function GreProblemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ topic?: string; from?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const question = getQuestion(id);
  if (!question) notFound();

  const all = getAllQuestions();
  const topicSlug = sp.topic ?? question.topic;
  const sameTopic = all.filter((q) => q.topic === topicSlug);
  const idx = sameTopic.findIndex((q) => q.id === id);
  const prev = sameTopic[idx - 1];
  const next = sameTopic[idx + 1];

  const manifest = getManifest();
  const taxonomy = getTaxonomy();

  return (
    <>
      <GreManifestSeed manifest={manifest} taxonomy={taxonomy} />
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 md:p-10">
        <div className="flex items-center justify-between text-sm text-slate-400">
          <Link href={`/gre/quant/${question.topic}`} className="hover:text-cyan-200">
            ← Back to {question.topic}
          </Link>
          <div className="flex items-center gap-2">
            {prev ? (
              <Link href={`/gre/quant/problem/${prev.id}?topic=${question.topic}`} className="hover:text-cyan-200">← Prev</Link>
            ) : <span className="text-slate-600">← Prev</span>}
            {next ? (
              <Link href={`/gre/quant/problem/${next.id}?topic=${question.topic}`} className="hover:text-cyan-200">Next →</Link>
            ) : <span className="text-slate-600">Next →</span>}
          </div>
        </div>

        <GreProblemSolver
          question={question as any}
          topicSlug={topicSlug}
        />
      </div>
    </>
  );
}