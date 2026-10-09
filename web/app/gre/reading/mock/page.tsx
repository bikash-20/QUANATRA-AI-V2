// /gre/reading/mock — a timed reading-comprehension mock. The user picks
// a preset from the data-driven list (content/gre/rc/mock-config.ts),
// the picker hands off to the entry component which builds the mock
// from the spec. No answers until submit. Refresh resumes from IDB.

import { getAllReadingPassages, getManifest, getMockConfig, getTaxonomy } from "@/features/gre/content/loader";
import { GreManifestSeed } from "@/features/gre/quant/components/gre-manifest-seed";
import { GreMockPresetPicker } from "@/features/gre/reading/components/gre-mock-preset-picker";

export const dynamic = "force-dynamic";

export default async function GreReadingMockPage() {
  const manifest = getManifest();
  const taxonomy = getTaxonomy();
  const passages = getAllReadingPassages();
  const mockCfg = getMockConfig();
  const defaultSpec = mockCfg.presets.find((p) => p.id === mockCfg.defaultPresetId) ?? mockCfg.presets[0];
  return (
    <>
      <GreManifestSeed manifest={manifest} taxonomy={taxonomy} />
      <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 md:p-10">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold md:text-3xl">Reading mock</h1>
          <p className="text-sm text-slate-400">
            {defaultSpec ? `${defaultSpec.totalQuestions} questions across ${defaultSpec.passages} passages · ${Math.round(defaultSpec.durationSec / 60)} min · ${defaultSpec.byDifficulty.easy} easy / ${defaultSpec.byDifficulty.medium} medium / ${defaultSpec.byDifficulty.hard} hard · no answers until you submit.` : "Pick a preset to start."}
          </p>
        </header>
        <GreMockPresetPicker passages={passages} presets={mockCfg.presets} note={mockCfg.note} />
      </div>
    </>
  );
}
