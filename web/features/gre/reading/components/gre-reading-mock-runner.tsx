"use client";
// Reading-comprehension mock runner. Mirrors gre-mock-runner.tsx but
// the side panel pins the current passage and the questions cycle
// through the precomputed list.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { checkAnswer } from "@/features/gre/reading/checker";
import { greProgress, type MockState, type UserAnswer } from "@/features/gre/progress/repository";
import type { ReadingPassage, ReadingQuestion } from "@/features/gre/content/loader.types";
import { MarkdownContent } from "@/components/markdown-content";

type FlatItem = { passageId: string; questionId: string };

export function GreReadingMockRunner({
  mockId,
  passages,
  items,
  startedAt,
  initialRemainingSec,
  initialState,
}: {
  mockId: string;
  passages: ReadingPassage[];
  items: FlatItem[];
  startedAt: number;
  initialRemainingSec: number;
  initialState: MockState | null;
}) {
  const router = useRouter();
  const total = items.length;
  const passageById = useMemo(() => {
    const m = new Map<string, ReadingPassage>();
    for (const p of passages) m.set(p.id, p);
    return m;
  }, [passages]);
  const questionById = useMemo(() => {
    const m = new Map<string, ReadingQuestion>();
    for (const p of passages) for (const q of p.questions) m.set(q.questionId, q);
    return m;
  }, [passages]);

  const [answers, setAnswers] = useState<Record<string, UserAnswer | undefined>>(() => initialState?.answers ?? {});
  const [flagged, setFlagged] = useState<Record<string, true | undefined>>(() => {
    const out: Record<string, true | undefined> = {};
    if (initialState?.flagged) for (const k of Object.keys(initialState.flagged)) out[k] = true;
    return out;
  });
  const [idx, setIdx] = useState(0);
  const [remainingSec, setRemainingSec] = useState(initialRemainingSec);
  const [finished, setFinished] = useState<boolean>(Boolean(initialState?.finishedAt));
  const [autoSubmitted, setAutoSubmitted] = useState(Boolean(initialState?.autoSubmitted));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [score, setScore] = useState<{ correct: number; total: number }>(() => {
    if (!initialState?.result) return { correct: 0, total: 0 };
    return { correct: initialState.result.score, total: initialState.result.total };
  });
  const startedAtRef = useRef<number>(initialState?.startedAt ?? startedAt);
  const submissionLock = useRef(false);
  const submitRef = useRef<(auto?: boolean) => Promise<void>>(async () => {});
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (finished) return;
    let cancelled = false;
    (async () => {
      const m: MockState = {
        id: mockId,
        startedAt: startedAtRef.current,
        questionIds: items.map((it) => it.questionId),
        answers,
        flagged,
      };
      await greProgress.saveMock(m);
      if (cancelled) return;
    })();
    return () => { cancelled = true; };
  }, [answers, flagged, mockId, items, finished]);

  const submit = useCallback(
    async (auto = false) => {
      if (finished || submissionLock.current) return;
      submissionLock.current = true;
      setSubmitting(true);
      setSubmitError(null);
      try {
        let correct = 0;
        const timePerQ: number[] = [];
        for (const it of items) {
          const q = questionById.get(it.questionId);
          const p = passageById.get(it.passageId);
          const ua = answers[it.questionId];
          if (!q || !p) continue;
          const ok = ua ? checkAnswer(q, ua) : false;
          if (ok) correct++;
          if (ua) {
            await greProgress.recordAttempt({
              questionId: q.questionId,
              topic: p.category,
              subtopic: p.id,
              difficulty: p.difficulty,
              questionType: q.type,
              userAnswer: ua,
              correct: ok,
              timeMs: 0,
              at: Date.now(),
              fromReadingMock: mockId,
              source: "hand",
            });
          }
          timePerQ.push(0);
        }
        const m: MockState = {
          id: mockId,
          startedAt: startedAtRef.current,
          questionIds: items.map((x) => x.questionId),
          answers,
          flagged,
          finishedAt: Date.now(),
          autoSubmitted: auto,
          result: { score: correct, total: items.length, timePerQ },
        };
        await greProgress.saveMock(m);
        setAutoSubmitted(auto);
        setFinished(true);
        setScore({ correct, total: items.length });
      } catch (error) {
        submissionLock.current = false;
        setSubmitError(error instanceof Error ? error.message : "Unable to submit this mock.");
      } finally {
        setSubmitting(false);
      }
    },
    [answers, flagged, finished, mockId, items, passageById, questionById],
  );

  useEffect(() => { submitRef.current = submit; }, [submit]);

  useEffect(() => {
    if (remainingSec !== 0) return;
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!finished) void submitRef.current(true);
  }, [finished, remainingSec]);

  useEffect(() => {
    if (finished || initialRemainingSec === 0) return;
    timerRef.current = window.setInterval(() => {
      setRemainingSec((previous) => Math.max(0, previous - 1));
    }, 1000);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [finished, initialRemainingSec]);

  const totalAnswered = useMemo(
    () => items.reduce((acc, it) => acc + (answers[it.questionId] ? 1 : 0), 0),
    [answers, items],
  );
  const totalFlagged = useMemo(
    () => Object.values(flagged).filter((v) => Boolean(v)).length,
    [flagged],
  );

  if (finished) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-6">
          <h2 className="text-2xl font-bold">Mock complete</h2>
          <p className="mt-1 text-sm text-slate-400">
            Score: <span className="text-emerald-300">{score.correct}</span> / {score.total}
            {" · "}
            {score.total > 0 ? Math.round((score.correct / score.total) * 100) : 0}%
          </p>
          <p className="mt-1 text-xs text-slate-500">{autoSubmitted ? "Auto-submitted at zero time." : "Submitted manually."}</p>
          <button
            type="button"
            onClick={() => router.push("/gre/reading")}
            className="mt-4 rounded-md bg-cyan-400/20 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/30"
          >
            Back to reading
          </button>
        </div>
      </div>
    );
  }
  if (total === 0) {
    return <p role="alert" className="rounded-2xl border border-rose-300/20 bg-rose-900/20 p-5 text-sm text-rose-100">This mock does not have any questions available.</p>;
  }

  const cur = items[Math.min(idx, total - 1)];
  const curQ = cur ? questionById.get(cur.questionId) : undefined;
  const curP = cur ? passageById.get(cur.passageId) : undefined;
  const curAns = cur ? answers[cur.questionId] : undefined;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between rounded-2xl border border-slate-200/15 bg-slate-900/40 p-4">
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span>Q {idx + 1} / {total}</span>
          <span>Answered: <span className="text-emerald-300">{totalAnswered}</span></span>
          <span>Flagged: <span className="text-amber-300">{totalFlagged}</span></span>
        </div>
        <div className={`font-mono text-2xl ${remainingSec < 60 ? "text-rose-300" : "text-cyan-200"}`}>
          {fmt(remainingSec)}
        </div>
      </header>

      <div className="gre-passage-grid">
        {curP ? (
          <aside className="gre-passage-panel">
            <article className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5 text-sm leading-relaxed text-slate-200">
              <p className="mb-3 text-xs uppercase tracking-wider text-slate-500">{curP.source}</p>
              <MarkdownContent content={curP.body} />
            </article>
          </aside>
        ) : null}
        <section className="gre-question-panel flex flex-col gap-4">
          {curP && curQ ? (
            <article className="flex flex-col gap-4 rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
              <header className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 uppercase ${
                  curP.difficulty === "easy" ? "bg-emerald-500/15 text-emerald-200"
                    : curP.difficulty === "medium" ? "bg-amber-500/15 text-amber-200"
                    : "bg-rose-500/15 text-rose-200"
                }`}>{curP.difficulty}</span>
                <span className="rounded-md border border-slate-200/15 px-1.5 py-0.5 uppercase text-slate-400">
                  {curQ.type === "rc-single" ? "single answer" : "select all that apply"}
                </span>
                <button
                  type="button"
                  onClick={() => setFlagged((f) => {
                    const next = { ...f };
                    if (next[curQ.questionId]) delete next[curQ.questionId]; else next[curQ.questionId] = true;
                    return next;
                  })}
                  aria-pressed={flagged[curQ.questionId] ?? false}
                  className={`ml-auto rounded-md px-2 py-1 text-xs ${flagged[curQ.questionId] ? "bg-amber-400/20 text-amber-100" : "text-slate-400 hover:bg-slate-800/60"}`}
                >
                  {flagged[curQ.questionId] ? "★ Flagged" : "☆ Flag for review"}
                </button>
              </header>
              <p className="text-base text-slate-100"><MarkdownContent content={curQ.stem} inline /></p>
              <ol className="flex flex-col gap-2">
                {curQ.choices.map((c, i) => {
                  const picked = curQ.type === "rc-single"
                    ? curAns?.type === "rc-single" && curAns.choice === i
                    : curAns?.type === "rc-multi" && curAns.choices.includes(i);
                  return (
                    <li key={i}>
                      <label className={`flex w-full cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm ${picked ? "border-cyan-400/40 bg-cyan-500/10" : "border-slate-200/15 hover:bg-slate-800/40"}`}>
                        <input
                          type={curQ.type === "rc-single" ? "radio" : "checkbox"}
                          name={`m-${curQ.questionId}`}
                          className="mt-1 h-4 w-4"
                          checked={Boolean(picked)}
                          onChange={(e) => {
                            if (curQ.type === "rc-single") {
                              setAnswers((current) => ({ ...current, [curQ.questionId]: { type: "rc-single", choice: i } }));
                            } else {
                              const prev = curAns?.type === "rc-multi" ? new Set(curAns.choices) : new Set<number>();
                              if (e.target.checked) prev.add(i); else prev.delete(i);
                              setAnswers((current) => ({
                                ...current,
                                [curQ.questionId]: prev.size ? { type: "rc-multi", choices: [...prev].sort((a, b) => a - b) } : undefined,
                              }));
                            }
                          }}
                        />
                        <span className="font-mono text-xs text-slate-400">{i + 1}.</span>
                        <span className="flex-1"><MarkdownContent content={c} inline /></span>
                      </label>
                    </li>
                  );
                })}
              </ol>
            </article>
          ) : null}

          <nav className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/15 bg-slate-900/40 p-3">
            <button
              type="button"
              onClick={() => setIdx(Math.max(0, idx - 1))}
              disabled={idx === 0}
              className="rounded-md border border-slate-200/20 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800/60 disabled:opacity-40"
            >
              ← Previous
            </button>
            <div className="mx-2 flex flex-wrap gap-1">
              {items.map((it, i) => {
                const answered = Boolean(answers[it.questionId]);
                const isFlag = Boolean(flagged[it.questionId]);
                const active = i === idx;
                return (
                  <button
                    key={it.questionId}
                    type="button"
                    onClick={() => setIdx(i)}
                    aria-label={`Question ${i + 1}${answered ? " (answered)" : ""}${isFlag ? " (flagged)" : ""}`}
                    className={`h-8 w-8 rounded-md border text-xs font-mono ${
                      active
                        ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-100"
                        : answered
                          ? isFlag ? "border-amber-400/40 bg-amber-500/15 text-amber-100"
                          : "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                          : isFlag ? "border-amber-400/30 text-amber-200"
                          : "border-slate-200/20 text-slate-400 hover:bg-slate-800/40"
                    }`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className="ml-auto flex gap-2">
              {idx < total - 1 ? (
                <button
                  type="button"
                  onClick={() => setIdx(idx + 1)}
                  className="rounded-md border border-slate-200/20 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800/60"
                >
                  Next →
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void submit(false)}
                disabled={submitting}
                className="rounded-md bg-emerald-400/20 px-4 py-1.5 text-sm font-medium text-emerald-100 hover:bg-emerald-400/30 disabled:cursor-wait disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </div>
          </nav>
          {submitError ? <p role="alert" className="text-sm text-rose-200">{submitError}</p> : null}
        </section>
      </div>
    </div>
  );
}

function fmt(s: number): string {
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}
