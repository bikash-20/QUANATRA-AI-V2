// /gre/quant/[topic] — Learn + Problems tabs. Server-rendered list of
// questions; status icons are hydrated client-side from IDB.

import { notFound } from "next/navigation";
import {
  getManifest,
  getQuestionList,
  getTaxonomy,
  getTopicNotes,
} from "@/features/gre/content/loader";
import { GreManifestSeed } from "@/features/gre/quant/components/gre-manifest-seed";
import { GreProblemList } from "@/features/gre/quant/components/gre-problem-list";
import { MarkdownContent } from "@/components/markdown-content";
import { TopicTabs } from "@/features/gre/quant/components/topic-tabs";
import type { QuantQuestion } from "@/features/gre/content/loader.types";

export const dynamic = "force-dynamic";

export default async function GreTopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ topic: string }>;
  searchParams: Promise<{ tab?: string; difficulty?: string; type?: string; subtopic?: string; status?: string; bookmarked?: string; q?: string; page?: string }>;
}) {
  const { topic } = await params;
  const sp = await searchParams;
  const taxonomy = getTaxonomy();
  const topicMeta = taxonomy.quant.find((t) => t.slug === topic);
  if (!topicMeta) notFound();

  const manifest = getManifest();
  const notes = getTopicNotes(topic);
  const allQuestions = getQuestionList(topic, {}, 1000);

  // Apply filters server-side
  let list = allQuestions;
  if (sp.difficulty && ["easy", "medium", "hard"].includes(sp.difficulty)) {
    list = list.filter((q) => q.difficulty === sp.difficulty);
  }
  if (sp.type && ["mcq", "multi", "qc", "numeric"].includes(sp.type)) {
    list = list.filter((q) => q.type === sp.type);
  }
  if (sp.subtopic) list = list.filter((q) => q.subtopic === sp.subtopic);
  if (sp.q) {
    const needle = sp.q.toLowerCase();
    list = list.filter((question) => questionSearchText(question).includes(needle));
  }
  const page = parsePage(sp.page);
  const pageSize = 25;

  const tab = sp.tab === "learn" ? "learn" : "problems";

  return (
    <>
      <GreManifestSeed manifest={manifest} taxonomy={taxonomy} />
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 md:p-10">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold md:text-3xl">{topicMeta.title}</h1>
          <p className="text-sm text-slate-400">
            {list.length} matching {list.length === 1 ? "question" : "questions"}
            {sp.q ? ` for "${sp.q}"` : ""}
          </p>
        </header>

        <TopicTabs tab={tab} topic={topic} />

        {tab === "learn" ? (
          <article className="prose prose-invert max-w-none">
            {notes ? <MarkdownContent content={notes} /> : <p className="text-slate-400">No notes yet.</p>}
          </article>
        ) : (
          <GreProblemList
            topic={topic}
            questions={list.map((q) => ({
              id: q.id,
              type: q.type,
              difficulty: q.difficulty,
              subtopic: q.subtopic,
              title: questionTitle(q),
            }))}
            page={page}
            pageSize={pageSize}
            filters={{
              difficulty: sp.difficulty ?? "",
              type: sp.type ?? "",
              subtopic: sp.subtopic ?? "",
              status: sp.status ?? "",
              bookmarked: sp.bookmarked ?? "",
              q: sp.q ?? "",
            }}
            subtopics={topicMeta.subtopics}
          />
        )}
      </div>
    </>
  );
}

function questionSearchText(question: QuantQuestion): string {
  if (question.type === "qc") {
    return `${question.quantityA} ${question.quantityB} ${question.common ?? ""}`.toLowerCase();
  }
  return question.stem.toLowerCase();
}

function questionTitle(question: QuantQuestion): string {
  if (question.type === "qc") {
    return `QC: ${question.quantityA} vs ${question.quantityB}`;
  }
  return question.stem;
}

function parsePage(value?: string): number {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  return Math.min(50, Number(value));
}