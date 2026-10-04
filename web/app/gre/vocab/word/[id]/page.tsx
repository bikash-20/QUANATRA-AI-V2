// /gre/vocab/word/[id] — single word detail with example highlighted.

import { notFound } from "next/navigation";
import { getManifest, getTaxonomy, getWord } from "@/features/gre/content/loader";
import { GreManifestSeed } from "@/features/gre/quant/components/gre-manifest-seed";
import { GreWordDetail } from "@/features/gre/vocab/components/gre-word-detail";

export const dynamic = "force-dynamic";

export default async function GreWordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const word = getWord(id);
  if (!word) notFound();
  const manifest = getManifest();
  const taxonomy = getTaxonomy();
  // Highlight the word in the example.
  const exampleHtml = highlightWord(word.example, word.word);
  return (
    <>
      <GreManifestSeed manifest={manifest} taxonomy={taxonomy} />
      <div className="mx-auto flex max-w-2xl flex-col gap-5 p-6 md:p-10">
        <header className="space-y-1">
          <div className="flex items-baseline gap-2">
            <h1 className="text-3xl font-bold">{word.word}</h1>
            <span className="italic text-slate-400">{word.pos}</span>
            <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-xs uppercase text-rose-200">tier {word.tier}</span>
          </div>
          <p className="text-base text-slate-200">{word.definition}</p>
        </header>
        <GreWordDetail wordId={word.id} />
        <section className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Example</h2>
          <p className="mt-2 text-base leading-relaxed" dangerouslySetInnerHTML={{ __html: exampleHtml }} />
        </section>
        <section className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Synonyms</h2>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {word.synonyms.map((s) => <li key={s} className="rounded-md bg-cyan-400/15 px-2 py-0.5 text-cyan-100">{s}</li>)}
          </ul>
        </section>
        {word.antonyms.length ? (
          <section className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Antonyms</h2>
            <ul className="mt-2 flex flex-wrap gap-2 text-sm">
              {word.antonyms.map((a) => <li key={a} className="rounded-md bg-rose-400/15 px-2 py-0.5 text-rose-100">{a}</li>)}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}

function highlightWord(text: string, word: string): string {
  const escaped = text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  // Highlight a prefix of the word (mirrors the validator's rule).
  const needle = word.slice(0, Math.max(4, word.length - 3));
  const re = new RegExp(`(${escapeRe(needle)})`, "gi");
  return escaped.replace(re, '<mark class="rounded-sm bg-cyan-400/30 px-0.5 text-cyan-50">$1</mark>');
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}