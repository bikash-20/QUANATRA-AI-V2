// Server-rendered list of passages for a single category. Includes a
// small per-passage progress island so the page renders without waiting
// on the IDB query.

import Link from "next/link";
import type { ReadingPassage, ReadingCategory } from "@/features/gre/content/loader.types";
import { GrePassageProgressIsland } from "./gre-passage-progress-island";

export function GrePassageList({
  category,
  passages,
}: {
  category: ReadingCategory;
  passages: ReadingPassage[];
}) {
  if (passages.length === 0) {
    return (
      <p className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-6 text-sm text-slate-400">
        No passages authored in this category yet. Use the AI-fill button above to generate practice material on demand.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {passages.map((p) => (
        <li key={p.id}>
          <Link
            href={`/gre/reading/${category}/${p.id}`}
            className="block rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5 transition hover:border-cyan-400/30 hover:bg-slate-900/60"
          >
            <header className="flex items-center justify-between gap-2">
              <span className={`rounded-full px-2 py-0.5 text-xs uppercase ${
                p.difficulty === "easy" ? "bg-emerald-500/15 text-emerald-200"
                  : p.difficulty === "medium" ? "bg-amber-500/15 text-amber-200"
                  : "bg-rose-500/15 text-rose-200"
              }`}>{p.difficulty}</span>
              <span className="text-xs text-slate-500">{p.wordCount} words · {p.questions.length} questions</span>
            </header>
            <h3 className="mt-2 text-lg font-semibold text-cyan-100">{p.title}</h3>
            <p className="mt-1 text-xs text-slate-500">{p.source}</p>
            <GrePassageProgressIsland passageId={p.id} total={p.questions.length} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
