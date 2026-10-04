// /gre hub. Server component. Reads manifest + per-topic counts and
// renders a small grid of cards plus the in-progress progress overview
// (hydrated client-side via IDB).

import { getManifest, getTaxonomy, getTopics } from "@/features/gre/content/loader";
import { GreProgressIsland } from "@/features/gre/quant/components/gre-progress-island";
import { GreManifestSeed } from "@/features/gre/quant/components/gre-manifest-seed";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function GreHubPage() {
  const manifest = getManifest();
  const topics = getTopics();
  const taxonomy = getTaxonomy();
  return (
    <>
      <GreManifestSeed manifest={manifest} taxonomy={taxonomy} />
      <div className="mx-auto flex max-w-5xl flex-col gap-8 p-6 md:p-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">GRE prep</h1>
          <p className="text-sm text-slate-400 md:text-base">
            Quant and vocabulary practice. All questions are hand-curated, all
            explanations are AI-generated. Track your progress locally.
          </p>
        </header>

        <GreProgressIsland />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Link
            href="/gre/quant"
            className="rounded-2xl border border-slate-200/20 bg-slate-900/40 p-6 transition hover:border-cyan-400/40 hover:bg-slate-900/60"
          >
            <h2 className="text-xl font-semibold">Quant</h2>
            <p className="mt-1 text-sm text-slate-400">
              {manifest.totals.quant} questions across {topics.length} topics — arithmetic, algebra, geometry, data analysis, word problems.
            </p>
          </Link>
          <Link
            href="/gre/vocab"
            className="rounded-2xl border border-slate-200/20 bg-slate-900/40 p-6 transition hover:border-cyan-400/40 hover:bg-slate-900/60"
          >
            <h2 className="text-xl font-semibold">Vocabulary</h2>
            <p className="mt-1 text-sm text-slate-400">
              {manifest.totals.vocab} hard GRE words across 3 tiers, with SRS and quiz modes.
            </p>
          </Link>
        </div>

        <Link
          href="/gre/roadmap"
          className="rounded-2xl border border-slate-200/20 bg-slate-900/40 p-6 transition hover:border-cyan-400/40 hover:bg-slate-900/60"
        >
          <h2 className="text-xl font-semibold">4-week roadmap</h2>
          <p className="mt-1 text-sm text-slate-400">
            A day-by-day checklist that takes you from foundations to timed mini-mocks.
          </p>
        </Link>

        <Link
          href="/gre/progress"
          className="rounded-2xl border border-slate-200/20 bg-slate-900/40 p-6 transition hover:border-cyan-400/40 hover:bg-slate-900/60"
        >
          <h2 className="text-xl font-semibold">Progress</h2>
          <p className="mt-1 text-sm text-slate-400">
            Accuracy per topic, weak subtopics, vocab status, mock history, and streak.
          </p>
        </Link>

        <Link
          href="/gre/quant/mock"
          className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-6 transition hover:border-amber-300/60"
        >
          <h2 className="text-xl font-semibold text-amber-200">Start a timed mock</h2>
          <p className="mt-1 text-sm text-amber-100/80">
            12 questions, 21 minutes. Mixed topics, easy to hard, no answers until you submit.
          </p>
        </Link>
      </div>
    </>
  );
}