"use client";
// Bootstraps a reading mock. Mirrors features/gre/mock/components/gre-mock-entry.tsx
// but resolves (passageId, questionId) tuples from the IDB state.

import { useEffect, useState } from "react";
import { greProgress, type MockState } from "@/features/gre/progress/repository";
import { GreReadingMockRunner } from "./gre-reading-mock-runner";
import { buildReadingMock, READING_MOCK_SPEC } from "../builder";
import type { RcPassage } from "@/features/gre/content/loader.types";

type FlatItem = { passageId: string; questionId: string };

export function GreReadingMockEntry({
  passages,
  mockId,
}: {
  passages: RcPassage[];
  mockId: string;
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

      // Resume path: only resume if it's a reading mock (i.e. it has at
      // least one question whose id starts with "q-rc-"). Otherwise start
      // a new reading mock and let the quant mock keep its in-progress slot.
      if (active && active.questionIds.some((id) => id.startsWith("q-rc-"))) {
        // Build a lookup of question → passage so we can re-derive the items.
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
            initialRemainingSec: Math.max(0, READING_MOCK_SPEC.durationSec - elapsed),
            initial: active,
          });
          setHydrated(true);
          return;
        }
      }

      // Build a fresh reading mock. Note: the quant mock-entry also reads
      // getActiveMock and resumes it; we always start a *new* mock for
      // reading (different id) so the two don't collide.
      const built = buildReadingMock(Date.now(), passages);
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
        initialRemainingSec: READING_MOCK_SPEC.durationSec,
        initial,
      });
      setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, [mockId, passages]);

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
    />
  );
}
