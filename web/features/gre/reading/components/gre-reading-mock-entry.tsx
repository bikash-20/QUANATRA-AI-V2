"use client";
// Bootstraps a reading mock. Mirrors features/gre/mock/components/gre-mock-entry.tsx
// but resolves (passageId, questionId) tuples from the IDB state.
//
// The caller (the preset picker) hands us a MockSpec; the entry builds
// the mock from that spec via buildReadingMock. We resume from IDB only
// if the active mock's first question id starts with "q-rc-" and the
// mockId matches (otherwise the user wants a fresh run with the new spec).

import { useEffect, useState } from "react";
import { greProgress, type MockState } from "@/features/gre/progress/repository";
import { GreReadingMockRunner } from "./gre-reading-mock-runner";
import { buildReadingMock, READING_MOCK_SPEC, type MockSpec } from "../builder";
import type { RcPassage } from "@/features/gre/content/loader.types";

type FlatItem = { passageId: string; questionId: string };

export function GreReadingMockEntry({
  passages,
  mockId,
  spec = READING_MOCK_SPEC,
}: {
  passages: RcPassage[];
  mockId: string;
  spec?: MockSpec;
}) {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<{
    mockId: string;
    items: FlatItem[];
    startedAt: number;
    initialRemainingSec: number;
    initial: MockState | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const active = await greProgress.getActiveMock();
      if (cancelled) return;

      // Resume path: only resume if it's the same mock id and a reading mock
      // (first question id starts with "q-rc-"). Otherwise the user wants
      // a fresh run with a different preset; start a new mock.
      if (active && active.id === mockId && active.questionIds.some((id) => id.startsWith("q-rc-"))) {
        const idx = new Map<string, string>();
        for (const p of passages) for (const q of p.questions) idx.set(q.questionId, p.id);
        const items: FlatItem[] = [];
        for (const qid of active.questionIds) {
          const pid = idx.get(qid);
          if (pid) items.push({ questionId: qid, passageId: pid });
        }
        if (items.length) {
          const elapsed = Math.floor((Date.now() - active.startedAt) / 1000);
          setState({
            mockId: active.id,
            items,
            startedAt: active.startedAt,
            initialRemainingSec: Math.max(0, spec.durationSec - elapsed),
            initial: active,
          });
          setHydrated(true);
          return;
        }
      }

      const built = buildReadingMock(Date.now(), passages, spec);
      if (!built.items.length) {
        setHydrated(true);
        return;
      }
      const startedAt = Date.now();
      const initial: MockState = {
        id: mockId,
        startedAt,
        questionIds: built.items.map((it) => it.questionId),
        answers: {},
        flagged: {},
      };
      await greProgress.saveMock(initial);
      setState({
        mockId,
        items: built.items,
        startedAt,
        initialRemainingSec: spec.durationSec,
        initial,
      });
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [mockId, passages, spec]);

  if (!hydrated || !state) {
    return <p className="text-sm text-slate-400">Loading reading mock…</p>;
  }
  return (
    <GreReadingMockRunner
      mockId={state.mockId}
      passages={passages}
      items={state.items}
      startedAt={state.startedAt}
      initialRemainingSec={state.initialRemainingSec}
      initialState={state.initial}
      spec={spec}
    />
  );
}
