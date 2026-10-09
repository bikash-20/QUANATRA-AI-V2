"use client";
// Reading-comprehension mock runner. Mirrors gre-mock-runner.tsx but
// the side panel pins the current passage and the questions cycle
// through the precomputed list. After submit, the runner switches to
// a review view that shows the original passage (sentence-indexed, with
// evidence highlights) and per-question state.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { checkAnswer, choiceLetter } from "@/features/gre/reading/checker";
import { greProgress, type MockState, type UserAnswer } from "@/features/gre/progress/repository";
import type { RcPassage, RcQuestion } from "@/features/gre/content/loader.types";
import { GrePassageText } from "./gre-passage-text";
import { GreQTypeBadge } from "./gre-qtype-badge";
import { READING_MOCK_SPEC, type MockSpec } from "../builder";

type FlatItem = { passageId: string; questionId: string };

export function GreReadingMockRunner({
  mockId,
  passages,
  items,
  startedAt,
  initialRemainingSec,
  initialState,
  spec = READING_MOCK_SPEC,
}: {
  mockId: string;
  passages: RcPassage[];
  items: FlatItem[];
  startedAt: number;
  initialRemainingSec: number;
  initialState: MockState | null;
  spec?: MockSpec;
}) {
  const router = useRouter();
  void spec; // accepted for API symmetry with the picker; duration flows through initialRemainingSec
  const total = items.length;
  const passageById = useMemo(() => {
    const m = new Map<string, RcPassage>();
    for (const p of passages) m.set(p.id, p);
    return m;
  }, [passages]);
  const questionById = useMemo(() => {
    const m = new Map<string, RcQuestion>();
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
  // Per-passage mount time so we can attribute reading vs answer time
  // for the first question of each passage in the mock.
  const passageMountedAtRef = useRef<Record<string, number>>({});
  // Per-question mount time — used for `answerTimeMs` of answered
  // questions at submit. Indexed by questionId.
  const questionMountedAtRef = useRef<Record<string, number>>({});
  const submissionLock = useRef(false);
  const submitRef = useRef<(auto?: boolean) => Promise<void>>(async () => {});
  const timerRef = useRef<number | null>(null);

  // Track the timestamp when each question / passage card is first shown
  // in this session. This is independent of state, so it runs as a render
  // side-effect via the key. We avoid setting state — the refs are enough.
  useEffect(() => {
    const cur = items[Math.min(idx, items.length - 1)];
    if (!cur) return;
    if (passageMountedAtRef.current[cur.passageId] === undefined) {
      passageMountedAtRef.current[cur.passageId] = Date.now();
    }
    if (questionMountedAtRef.current[cur.questionId] === undefined) {
      questionMountedAtRef.current[cur.questionId] = Date.now();
    }
  }, [idx, items]);

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
    return () => {
      cancelled = true;
    };
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
        const seenPassage = new Set<string>();
        const submitStamp = Date.now();
        for (const it of items) {
          const q = questionById.get(it.questionId);
          const p = passageById.get(it.passageId);
          const ua = answers[it.questionId];
          if (!q || !p) continue;
          const ok = ua ? checkAnswer(q, ua) : false;
          if (ok) correct++;
          // First question in this passage gets a reading-time slice;
          // subsequent questions in the same passage do not.
          const isFirstInPassage = !seenPassage.has(it.passageId);
          if (isFirstInPassage) seenPassage.add(it.passageId);
          const qStart = questionMountedAtRef.current[it.questionId] ?? submitStamp;
          const pStart = passageMountedAtRef.current[it.passageId] ?? qStart;
          const totalMs = Math.max(0, submitStamp - qStart);
          const readingMs = isFirstInPassage ? Math.max(0, qStart - pStart) : 0;
          const answerMs = Math.max(0, totalMs - readingMs);
          if (ua) {
            await greProgress.recordAttempt({
              questionId: q.questionId,
              topic: p.category,
              subtopic: p.id,
              difficulty: p.difficulty,
              questionType: q.kind === "single" ? "rc-single-answer" : q.kind === "multi" ? "rc-multi-answer" : "rc-sentence",
              userAnswer: ua,
              correct: ok,
              timeMs: totalMs,
              at: submitStamp,
              fromReadingMock: mockId,
              source: "hand",
              qType: q.qType,
              passageId: it.passageId,
              readingTimeMs: isFirstInPassage ? readingMs : undefined,
              answerTimeMs: answerMs > 0 ? answerMs : undefined,
            });
          }
          timePerQ.push(totalMs);
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

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

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
      <ReviewView
        score={score}
        autoSubmitted={autoSubmitted}
        items={items}
        passageById={passageById}
        questionById={questionById}
        answers={answers}
        onBack={() => router.push("/gre/reading")}
      />
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
            <article className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
              <GrePassageText
                passageId={curP.id}
                body={curP.body}
                sentences={[]}
                evidence={[]}
              />
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
                  {curQ.kind === "single" ? "single answer"
                    : curQ.kind === "multi" ? "select all that apply"
                    : "select a sentence"}
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
              <p className="text-base text-slate-100">{curQ.stem}</p>
              {(curQ.kind === "single" || curQ.kind === "multi") ? (
                <ol className="flex flex-col gap-2">
                  {curQ.choices.map((c, i) => {
                    const picked = curQ.kind === "single"
                      ? curAns?.type === "rc-single" && curAns.choice === i
                      : curAns?.type === "rc-multi" && curAns.choices.includes(i);
                    return (
                      <li key={i}>
                        <label className={`flex w-full cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm ${picked ? "border-cyan-400/40 bg-cyan-500/10" : "border-slate-200/15 hover:bg-slate-800/40"}`}>
                          <input
                            type={curQ.kind === "single" ? "radio" : "checkbox"}
                            name={`m-${curQ.questionId}`}
                            className="mt-1 h-4 w-4"
                            checked={Boolean(picked)}
                            onChange={(e) => {
                              if (curQ.kind === "single") {
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
                          <span className="font-mono text-xs text-slate-400">{choiceLetter(i)}.</span>
                          <span className="flex-1">{c}</span>
                        </label>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="rounded-xl border border-slate-200/15 bg-slate-950/40 p-3 text-xs text-slate-400">
                  Sentence-selection in mocks is read-only; the runner will reveal the right sentence after submit.
                </p>
              )}
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

function ReviewView({
  score,
  autoSubmitted,
  items,
  passageById,
  questionById,
  answers,
  onBack,
}: {
  score: { correct: number; total: number };
  autoSubmitted: boolean;
  items: FlatItem[];
  passageById: Map<string, RcPassage>;
  questionById: Map<string, RcQuestion>;
  answers: Record<string, UserAnswer | undefined>;
  onBack: () => void;
}) {
  const [reviewIdx, setReviewIdx] = useState(0);
  const total = items.length;
  const cur = items[Math.min(reviewIdx, total - 1)];
  const curQ = cur ? questionById.get(cur.questionId) : undefined;
  const curP = cur ? passageById.get(cur.passageId) : undefined;
  const curAns = cur ? answers[cur.questionId] : undefined;
  const curCorrect = curQ && curAns ? checkAnswer(curQ, curAns) : false;

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
          onClick={onBack}
          className="mt-4 rounded-md bg-cyan-400/20 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/30"
        >
          Back to reading
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-4">
        <nav className="flex flex-wrap gap-1" aria-label="Review questions">
          {items.map((it, i) => {
            const q = questionById.get(it.questionId);
            const ua = answers[it.questionId];
            const ok = q && ua ? checkAnswer(q, ua) : false;
            const active = i === reviewIdx;
            return (
              <button
                key={it.questionId}
                type="button"
                onClick={() => setReviewIdx(i)}
                aria-label={`Review question ${i + 1}${ok ? " (correct)" : " (incorrect)"}`}
                className={`h-8 w-8 rounded-md border text-xs font-mono ${
                  active
                    ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-100"
                    : ok
                      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                      : ua
                        ? "border-rose-400/40 bg-rose-500/15 text-rose-100"
                        : "border-slate-200/20 text-slate-400"
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </nav>
      </div>

      {curP && curQ ? (
        <div className="gre-passage-grid">
          <aside className="gre-passage-panel">
            <article className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
              <GrePassageText
                passageId={curP.id}
                body={curP.body}
                sentences={[]}
                evidence={curQ.evidence.map((e) => e.sentence)}
              />
            </article>
          </aside>
          <section className="gre-question-panel flex flex-col gap-4">
            <article className="flex flex-col gap-4 rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
              <header className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 uppercase ${
                  curP.difficulty === "easy" ? "bg-emerald-500/15 text-emerald-200"
                    : curP.difficulty === "medium" ? "bg-amber-500/15 text-amber-200"
                    : "bg-rose-500/15 text-rose-200"
                }`}>{curP.difficulty}</span>
                <span className="rounded-md border border-slate-200/15 px-1.5 py-0.5 uppercase text-slate-400">
                  {curQ.kind === "single" ? "single answer"
                    : curQ.kind === "multi" ? "select all that apply"
                    : "select a sentence"}
                </span>
                <GreQTypeBadge qType={curQ.qType} />
                <span
                  className={`ml-auto rounded-md px-2 py-1 text-xs ${
                    curCorrect ? "bg-emerald-500/15 text-emerald-200" : "bg-rose-500/15 text-rose-200"
                  }`}
                >
                  {curCorrect ? "Correct" : "Incorrect"}
                </span>
              </header>
              <p className="text-base text-slate-100">{curQ.stem}</p>
              {(curQ.kind === "single" || curQ.kind === "multi") ? (
                <ol className="flex flex-col gap-2">
                  {curQ.choices.map((c, i) => {
                    const isCorrectChoice =
                      curQ.kind === "single" ? curQ.answer === i
                        : curQ.kind === "multi" ? curQ.answer.includes(i)
                        : false;
                    const isUserPick =
                      curQ.kind === "single"
                        ? curAns?.type === "rc-single" && curAns.choice === i
                        : curAns?.type === "rc-multi" && curAns.choices.includes(i);
                    const showAsRight = isCorrectChoice;
                    const showAsWrong = isUserPick && !isCorrectChoice;
                    return (
                      <li key={i}>
                        <div
                          className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm ${
                            showAsRight
                              ? "border-emerald-400/40 bg-emerald-500/10"
                              : showAsWrong
                                ? "border-rose-400/40 bg-rose-500/10"
                                : "border-slate-200/15 bg-slate-950/40"
                          }`}
                        >
                          <span className="font-mono text-xs text-slate-400">{choiceLetter(i)}.</span>
                          <span className="flex-1">{c}</span>
                          {showAsRight ? <span className="text-xs text-emerald-200">✓</span> : null}
                          {showAsWrong ? <span className="text-xs text-rose-200">✗</span> : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : null}
              <div className="rounded-md border border-slate-200/15 bg-slate-950/40 p-3 text-sm text-slate-300">
                <p className="text-xs uppercase tracking-wider text-slate-500">Rationale</p>
                <p className="mt-1">{curQ.rationale}</p>
              </div>
            </article>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setReviewIdx(Math.max(0, reviewIdx - 1))}
                disabled={reviewIdx === 0}
                className="rounded-md border border-slate-200/20 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60 disabled:opacity-40"
              >
                ← Previous
              </button>
              <button
                type="button"
                onClick={() => setReviewIdx(Math.min(total - 1, reviewIdx + 1))}
                disabled={reviewIdx >= total - 1}
                className="rounded-md border border-slate-200/20 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
