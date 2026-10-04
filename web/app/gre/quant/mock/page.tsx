// /gre/quant/mock — a 12-question, 21-minute timed mock. Order: easy →
// medium → hard; if a tier pool is short, borrow from the next tier. No
// answers revealed until submit. Refresh resumes from IndexedDB.

import { getAllQuestions, getManifest, getTaxonomy } from "@/features/gre/content/loader";
import { GreManifestSeed } from "@/features/gre/quant/components/gre-manifest-seed";
import { GreMockEntry } from "@/features/gre/mock/components/gre-mock-entry";
import { MOCK_SPEC } from "@/features/gre/mock/builder";

export const dynamic = "force-dynamic";

export default async function GreMockPage() {
  const manifest = getManifest();
  const taxonomy = getTaxonomy();
  const questions = getAllQuestions();
  const mockId = "mock-default";
  return (
    <>
      <GreManifestSeed manifest={manifest} taxonomy={taxonomy} />
      <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6 md:p-10">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold md:text-3xl">GRE mock</h1>
          <p className="text-sm text-slate-400">
            {MOCK_SPEC.total} questions · {Math.round(MOCK_SPEC.durationSec / 60)} minutes ·{" "}
            3 easy / 5 medium / 4 hard · no answers until you submit.
          </p>
        </header>
        <GreMockEntry questions={questions} mockId={mockId} />
      </div>
    </>
  );
}