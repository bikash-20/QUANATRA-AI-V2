"use client";
// Lets the user pick a mock preset before starting. The list comes from
// the data-driven presets file (content/gre/rc/mock-config.ts), fetched
// by the RSC page and passed in as a prop. Once started, this component
// hands off to the entry component which builds the actual mock from
// the spec.

import { useState } from "react";
import type { MockSpec } from "@/features/gre/content/loader.types";
import { GreReadingMockEntry } from "./gre-reading-mock-entry";
import type { RcPassage } from "@/features/gre/content/loader.types";

const DEFAULT_MOCK_PRESET_ID = "practice-rc";

type Props = {
  passages: RcPassage[];
  presets: MockSpec[];
  note: string;
  defaultPresetId?: string;
};

export function GreMockPresetPicker({ passages, presets, note, defaultPresetId = DEFAULT_MOCK_PRESET_ID }: Props) {
  const [presetId, setPresetId] = useState<string>(defaultPresetId);
  const [mockSeed, setMockSeed] = useState<number | null>(null);
  // Resolve the current spec (default to the first preset if the chosen
  // id no longer exists).
  const selected = presets.find((p) => p.id === presetId) ?? presets[0];
  if (mockSeed !== null && selected) {
    const mockId = `mock-reading-${selected.id}-${mockSeed}`;
    return <GreReadingMockEntry passages={passages} mockId={mockId} spec={selected} />;
  }
  function startMock() {
    setMockSeed(Date.now());
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-xl border border-amber-300/20 bg-amber-900/20 px-3 py-2 text-xs text-amber-100">
        {note}
      </p>
      <div className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
        <label className="flex flex-col gap-1 text-sm text-slate-200">
          <span className="text-xs uppercase tracking-wider text-slate-500">Preset</span>
          <select
            value={presetId}
            onChange={(e) => setPresetId(e.target.value)}
            className="rounded-md border border-slate-200/20 bg-slate-950/60 px-3 py-2 text-sm text-slate-100"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {selected ? (
          <p className="mt-3 text-sm text-slate-300">{selected.description}</p>
        ) : null}
        {selected ? (
          <ul className="mt-3 flex flex-wrap gap-2 text-xs">
            <li className="rounded-md border border-slate-200/15 px-2 py-0.5 text-slate-300">
              {selected.passages} passages
            </li>
            <li className="rounded-md border border-slate-200/15 px-2 py-0.5 text-slate-300">
              {selected.totalQuestions} questions
            </li>
            <li className="rounded-md border border-slate-200/15 px-2 py-0.5 text-slate-300">
              {Math.round(selected.durationSec / 60)} min
            </li>
            <li className="rounded-md border border-slate-200/15 px-2 py-0.5 text-slate-300">
              {selected.byDifficulty.easy} easy / {selected.byDifficulty.medium} medium /{" "}
              {selected.byDifficulty.hard} hard
            </li>
          </ul>
        ) : null}
        <button
          type="button"
          onClick={startMock}
          disabled={!selected}
          className="mt-4 rounded-md bg-cyan-400/20 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/30 disabled:opacity-50"
        >
          Start mock
        </button>
      </div>
    </div>
  );
}
