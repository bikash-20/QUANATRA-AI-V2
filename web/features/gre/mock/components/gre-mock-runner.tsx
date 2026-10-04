"use client";
// The GRE mock runner. Server precomputes the 12-question list and
// passes it down; the runner shows one question at a time, tracks
// answers + flags, persists in-progress state to IndexedDB so a
// refresh resumes, and auto-submits at the timer zero.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { checkAnswer, numericAnswerFromInput, qcText } from "@/features/gre/quant/checker";
import { greProgress, type MockState, type UserAnswer } from "@/features/gre/progress/repository";
import type { QuantQuestion } from "@/features/gre/content/loader.types";

type ClientQuestion = QuantQuestion;

function emptyAnswer(): UserAnswer | undefined {
  return undefined;
}

export function GreMockRunner({
  mockId,
  questions,
  startedAt,
  initialRemainingSec,
  initialState,
}: {
  mockId: string;
  questions: ClientQuestion[];
  startedAt: number;
  initialRemainingSec: number;
  initialState: MockState | null;
}) {
  const router = useRouter();
  const total = questions.length;
  const [answers, setAnswers] = useState<Record<string, UserAnswer | undefined>>(() => initialState?.answers ?? {});
  const [numericDrafts, setNumericDrafts] = useState<Record<string, string>>(() => {
    const drafts: Record<string, string> = {};
    for (const [questionId, answer] of Object.entries(initialState?.answers ?? {})) {
      if (answer?.type === "numeric") drafts[questionId] = String(answer.value);
    }
    return drafts;
  });
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

  // Persist in-progress mock on every change.
  useEffect(() => {
    if (finished) return;
    let cancelled = false;
    (async () => {
      const m: MockState = {
        id: mockId,
        startedAt: startedAtRef.current,
        questionIds: questions.map((q) => q.id),
        answers,
        flagged,
      };
      await greProgress.saveMock(m);
      if (cancelled) return;
      // navigate to dedicated mock page only if needed
    })();
    return () => { cancelled = true; };
  }, [answers, flagged, mockId, questions, finished]);

  const submit = useCallback(
    async (auto = false) => {
      if (finished || submissionLock.current) return;
      submissionLock.current = true;
      setSubmitting(true);
      setSubmitError(null);
      try {
        let correct = 0;
        const timePerQ: number[] = [];
        for (const q of questions) {
          const ua = answers[q.id];
          const ok = ua ? checkAnswer(q, ua) : false;
          if (ok) correct++;
          if (ua) {
            await greProgress.recordAttempt({
              questionId: q.id,
              topic: q.topic,
              subtopic: q.subtopic,
              difficulty: q.difficulty,
              questionType: q.type,
              userAnswer: ua,
              correct: ok,
              timeMs: 0,
              at: Date.now(),
              fromMock: mockId,
            });
          }
          timePerQ.push(0);
        }
        const m: MockState = {
          id: mockId,
          startedAt: startedAtRef.current,
          questionIds: questions.map((q) => q.id),
          answers,
          flagged,
          finishedAt: Date.now(),
          autoSubmitted: auto,
          result: { score: correct, total: questions.length, timePerQ },
        };
        await greProgress.saveMock(m);
        setAutoSubmitted(auto);
        setFinished(true);
        setScore({ correct, total: questions.length });
      } catch (error) {
        submissionLock.current = false;
        setSubmitError(error instanceof Error ? error.message : "Unable to submit this mock.");
      } finally {
        setSubmitting(false);
      }
    },
    [answers, flagged, finished, mockId, questions],
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

  const cur = questions[idx];
  const ua = cur ? answers[cur.id] : undefined;
  const totalAnswered = useMemo(
    () => questions.reduce((acc, q) => acc + (answers[q.id] ? 1 : 0), 0),
    [answers, questions],
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
            onClick={() => router.push("/gre/quant")}
            className="mt-4 rounded-md bg-cyan-400/20 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/30"
          >
            Back to quant
          </button>
        </div>
      </div>
    );
  }
  if (total === 0 || !cur) {
    return <p role="alert" className="rounded-2xl border border-rose-300/20 bg-rose-900/20 p-5 text-sm text-rose-100">This mock does not have any questions available.</p>;
  }

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

      <article className="flex flex-col gap-5 rounded-2xl border border-slate-200/15 bg-slate-900/40 p-6">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className={`rounded-full px-2 py-0.5 uppercase ${cur.difficulty === "easy" ? "bg-emerald-500/15 text-emerald-200" : cur.difficulty === "medium" ? "bg-amber-500/15 text-amber-200" : "bg-rose-500/15 text-rose-200"}`}>
              {cur.difficulty}
            </span>
            <span className="rounded-md border border-slate-200/15 px-1.5 py-0.5 uppercase text-slate-400">{cur.type}</span>
            <span className="text-slate-400">{cur.subtopic}</span>
          </div>
          <button
            type="button"
            onClick={() => setFlagged((f) => {
              const next = { ...f };
              if (next[cur.id]) delete next[cur.id]; else next[cur.id] = true;
              return next;
            })}
            aria-pressed={flagged[cur.id] ?? false}
            className={`rounded-md px-2 py-1 text-xs ${flagged[cur.id] ? "bg-amber-400/20 text-amber-100" : "text-slate-400 hover:bg-slate-800/60"}`}
          >
            {flagged[cur.id] ? "★ Flagged" : "☆ Flag for review"}
          </button>
        </header>
        <MockStem cur={cur} />
        <MockInput
          cur={cur}
          value={ua}
          numericDraft={numericDrafts[cur.id] ?? ""}
          onChange={(value) => setAnswers((current) => ({ ...current, [cur.id]: value }))}
          onNumericDraftChange={(draft) => {
            setNumericDrafts((current) => ({ ...current, [cur.id]: draft }));
            const parsed = numericAnswerFromInput(draft);
            setAnswers((current) => ({ ...current, [cur.id]: parsed ?? undefined }));
          }}
        />
      </article>

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
          {questions.map((q, i) => {
            const answered = Boolean(answers[q.id]);
            const isFlag = Boolean(flagged[q.id]);
            const active = i === idx;
            return (
              <button
                key={q.id}
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
    </div>
  );
}

function fmt(s: number): string {
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function MockStem({ cur }: { cur: ClientQuestion }) {
  if (cur.type === "qc") {
    return (
      <div className="space-y-3">
        <p className="text-base"><span className="font-semibold text-cyan-200">Quantity A:</span> {cur.quantityA}</p>
        <p className="text-base"><span className="font-semibold text-cyan-200">Quantity B:</span> {cur.quantityB}</p>
        {cur.common ? <p className="text-sm text-slate-400">Given: {cur.common}</p> : null}
      </div>
    );
  }
  return <p className="text-base">{cur.stem}</p>;
}

function MockInput({
  cur,
  value,
  numericDraft,
  onChange,
  onNumericDraftChange,
}: {
  cur: ClientQuestion;
  value: UserAnswer | undefined;
  numericDraft: string;
  onChange: (v: UserAnswer | undefined) => void;
  onNumericDraftChange: (draft: string) => void;
}) {
  if (cur.type === "mcq") {
    return (
      <ol className="flex flex-col gap-2">
        {cur.choices.map((c, i) => {
          const picked = value?.type === "mcq" && value.choice === i;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onChange({ type: "mcq", choice: i })}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
                  picked ? "border-cyan-400/40 bg-cyan-500/10" : "border-slate-200/15 hover:bg-slate-800/40"
                }`}
              >
                <span className="font-mono text-xs text-slate-400">{i + 1}.</span>
                <span>{c}</span>
              </button>
            </li>
          );
        })}
      </ol>
    );
  }
  if (cur.type === "multi") {
    const set = new Set(value?.type === "multi" ? value.choices : []);
    return (
      <ul className="flex flex-col gap-2">
        {cur.choices.map((c, i) => {
          const picked = set.has(i);
          return (
            <li key={i}>
              <label className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${picked ? "border-cyan-400/40 bg-cyan-500/10" : "border-slate-200/15"}`}>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={picked}
                  onChange={(e) => {
                    const next = new Set(set);
                    if (e.target.checked) next.add(i); else next.delete(i);
                    onChange(next.size ? { type: "multi", choices: [...next].sort((a, b) => a - b) } : emptyAnswer());
                  }}
                />
                <span className="font-mono text-xs text-slate-400">{i + 1}.</span>
                <span>{c}</span>
              </label>
            </li>
          );
        })}
      </ul>
    );
  }
  if (cur.type === "qc") {
    const letter = value?.type === "qc" ? value.letter : null;
    return (
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {(["A", "B", "C", "D"] as const).map((l) => {
          const picked = letter === l;
          return (
            <button
              key={l}
              type="button"
              onClick={() => onChange({ type: "qc", letter: l })}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm ${
                picked ? "border-cyan-400/40 bg-cyan-500/10" : "border-slate-200/15"
              }`}
            >
              <span className="font-mono text-xs text-slate-400">{l}.</span>
              <span>{qcText(l)}</span>
            </button>
          );
        })}
      </div>
    );
  }
  // numeric
  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-slate-400">Your answer (fractions like 5/36, decimals, integers accepted):</label>
      <input
        type="text"
        inputMode="decimal"
        value={numericDraft}
        onChange={(e) => {
          onNumericDraftChange(e.target.value);
        }}
        className="rounded-md border border-slate-200/20 bg-slate-800/40 px-3 py-2 text-base"
      />
    </div>
  );
}