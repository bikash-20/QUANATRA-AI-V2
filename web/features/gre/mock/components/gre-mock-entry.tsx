"use client";
// Bootstraps the mock entry: if an in-progress mock exists in IDB, resume
// it; otherwise start a new one with buildMock(Date.now()). The questions
// themselves are loaded server-side and passed down by the page.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { greProgress, type MockState } from "@/features/gre/progress/repository";
import { GreMockRunner } from "@/features/gre/mock/components/gre-mock-runner";
import { buildMock } from "@/features/gre/mock/builder";
import type { QuantQuestion } from "@/features/gre/content/loader.types";

export function GreMockEntry({
  questions,
  mockId,
}: {
  questions: QuantQuestion[];
  mockId: string;
}) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<{ mockId: string; questions: QuantQuestion[]; startedAt: number; initial: MockState | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const active = await greProgress.getActiveMock();
      if (cancelled) return;
      if (active) {
        const qs: QuantQuestion[] = [];
        for (const id of active.questionIds) {
          const q = questions.find((x) => x.id === id) ?? null;
          if (q) qs.push(q);
        }
        if (qs.length) {
          setState({ mockId: active.id, questions: qs, startedAt: active.startedAt, initial: active });
          setHydrated(true);
          return;
        }
      }
      // No resume: build a new mock, pick fresh ids from the questions list.
      const built = buildMock(Date.now(), questions);
      const qs = built.ids
        .map((id) => questions.find((q) => q.id === id))
        .filter((q): q is QuantQuestion => Boolean(q));
      if (!qs.length) {
        setHydrated(true);
        return;
      }
      const startedAt = Date.now();
      const initial: MockState = {
        id: mockId,
        startedAt,
        questionIds: qs.map((q) => q.id),
        answers: {},
        flagged: {},
      };
      await greProgress.saveMock(initial);
      setState({ mockId, questions: qs, startedAt, initial });
      setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, [mockId, questions]);

  if (!hydrated || !state) {
    return <p className="text-sm text-slate-400">Loading mock…</p>;
  }
  return (
    <GreMockRunner
      mockId={state.mockId}
      questions={state.questions}
      startedAt={state.startedAt}
      initialState={state.initial}
    />
  );
}