// /gre/reading/mock — a 4-passage, 14-question, 30-minute timed reading
// mock. No answers until submit. Refresh resumes from IndexedDB.

import { getAllReadingPassages, getManifest, getTaxonomy } from "@/features/gre/content/loader";
import { GreManifestSeed } from "@/features/gre/quant/components/gre-manifest-seed";
import { GreReadingMockEntry } from "@/features/gre/reading/components/gre-reading-mock-entry";
import { READING_MOCK_SPEC } from "@/features/gre/reading/builder";

export const dynamic = "force-dynamic";

export default async function GreReadingMockPage() {
  const manifest = getManifest();
  const taxonomy = getTaxonomy();
  const passages = getAllReadingPassages();
  const mockId = "mock-reading-default";
  return (
    <>
      <GreManifestSeed manifest={manifest} taxonomy={taxonomy} />
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 md:p-10">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold md:text-3xl">Reading mock</h1>
          <p className="text-sm text-slate-400">
            {READING_MOCK_SPEC.totalQuestions} questions across {READING_MOCK_SPEC.passages} passages ·{" "}
            {Math.round(READING_MOCK_SPEC.durationSec / 60)} minutes · 4 easy / 7 medium / 3 hard · no
            answers until you submit.
          </p>
        </header>
        <GreReadingMockEntry passages={passages} mockId={mockId} />
      </div>
    </>
  );
}
