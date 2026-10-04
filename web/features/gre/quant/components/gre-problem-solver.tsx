"use client";
// Single-problem solver. Renders the question, the appropriate input for
// its type, a Submit button, an AI-explain toggle, and a Report button.

import { useEffect, useMemo, useState } from "react";
import type { QuantQuestion } from "@/features/gre/content/loader";
import { greProgress, type UserAnswer } from "@/features/gre/progress/repository";
import { checkAnswer, formatCorrectAnswer, qcText } from "@/features/gre/quant/checker";
import { getExplanation } from "@/lib/explanations";
import { MarkdownContent } from "@/components/markdown-content";

const QC_LABELS = ["A", "B", "C", "D"] as const;
type QCLetter = (typeof QC_LABELS)[number];

export function GreProblemSolver({
  question,
  topicSlug,
}: {
  question: QuantQuestion;
  topicSlug: string;
}) {
  const [choice, setChoice] = useState<number | null>(null);
  const [multiChoices, setMultiChoices] = useState<Set<number>>(new Set());
  const [qcLetter, setQcLetter] = useState<QCLetter | null>(null);
  const [numeric, setNumeric] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [startedAt] = useState(() => Date.now());
  const [showExplain, setShowExplain] = useState(false);
  const [explainText, setExplainText] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [reportSent, setReportSent] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const b = await greProgress.isBookmarked(question.id);
      if (!cancelled) setBookmarked(b);
    })();
    return () => { cancelled = true; };
  }, [question.id]);

  function buildUserAnswer(): UserAnswer | null {
    switch (question.type) {
      case "mcq":
        return choice === null ? null : { type: "mcq", choice };
      case "multi": {
        if (multiChoices.size === 0) return null;
        return { type: "multi", choices: [...multiChoices].sort((a, b) => a - b) };
      }
      case "qc":
        return qcLetter ? { type: "qc", letter: qcLetter } : null;
      case "numeric": {
        if (!numeric.trim()) return null;
        const v = Number(numeric.replace(/,/g, "").trim());
        if (!Number.isFinite(v)) return null;
        return { type: "numeric", value: v };
      }
    }
  }

  async function handleSubmit() {
    const ua = buildUserAnswer();
    if (!ua) return;
    const ok = checkAnswer(question, ua);
    setSubmitted(true);
    setCorrect(ok);
    await greProgress.recordAttempt({
      questionId: question.id,
      topic: question.topic,
      subtopic: question.subtopic,
      difficulty: question.difficulty,
      questionType: question.type,
      userAnswer: ua,
      correct: ok,
      timeMs: Date.now() - startedAt,
      at: Date.now(),
    });
  }

  async function handleExplain() {
    setShowExplain(true);
    if (explainText) return;
    setExplainLoading(true);
    setExplainError(null);
    try {
      const ua = buildUserAnswer() ?? nullAnswer(question);
      const correctText = formatCorrectAnswer(question);
      const text = await getExplanation({
        kind: "gre-quant",
        questionId: question.id,
        question: questionText(question),
        options: question.type === "qc" ? QC_LABELS.map((l) => qcText(l)) : (question as any).choices,
        correctAnswer: correctText,
        userAnswer: ua ? formatUserAnswer(question, ua) : "(no answer)",
        difficulty: question.difficulty,
        lang: "en",
      });
      setExplainText(text);
    } catch (e) {
      setExplainError((e as Error).message || "Failed to load explanation");
    } finally {
      setExplainLoading(false);
    }
  }

  async function handleReport() {
    await greProgress.reportQuestion(question.id, "user-reported");
    setReportSent(true);
  }

  async function toggleBookmark() {
    const isOn = await greProgress.toggleBookmark(question.id, topicSlug);
    setBookmarked(isOn);
  }

  // Keyboard shortcuts: 1-5 select, Enter submit, N next.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (submitted) return;
      if (e.key >= "1" && e.key <= "5") {
        const i = Number(e.key) - 1;
        if (question.type === "mcq" && (question as any).choices[i]) setChoice(i);
        else if (question.type === "qc" && QC_LABELS[i]) setQcLetter(QC_LABELS[i]);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (!submitted) handleSubmit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <article className="flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className={`rounded-full px-2 py-0.5 uppercase ${
            question.difficulty === "easy" ? "bg-emerald-500/15 text-emerald-200"
              : question.difficulty === "medium" ? "bg-amber-500/15 text-amber-200"
              : "bg-rose-500/15 text-rose-200"
          }`}>{question.difficulty}</span>
          <span className="rounded-md border border-slate-200/15 px-1.5 py-0.5 uppercase text-slate-400">{question.type}</span>
          <span className="text-slate-400">{question.subtopic}</span>
        </div>
        <button
          type="button"
          onClick={toggleBookmark}
          aria-pressed={bookmarked}
          className={`rounded-md px-2 py-1 text-xs ${bookmarked ? "bg-cyan-400/20 text-cyan-200" : "text-slate-400 hover:bg-slate-800/60"}`}
        >
          {bookmarked ? "★ Bookmarked" : "☆ Bookmark"}
        </button>
      </header>

      <div className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-6">
        {renderStem(question)}
      </div>

      <AnswerInput
        question={question}
        choice={choice}
        setChoice={setChoice}
        multiChoices={multiChoices}
        setMultiChoices={setMultiChoices}
        qcLetter={qcLetter}
        setQcLetter={(l) => setQcLetter(l)}
        numeric={numeric}
        setNumeric={setNumeric}
        submitted={submitted}
        correct={correct}
        correctIndex={(question.type === "mcq" || question.type === "multi") ? (question as any).answer : null}
      />

      <div className="flex flex-wrap items-center gap-3">
        {!submitted ? (
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-md bg-cyan-400/20 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/30"
          >
            Submit
          </button>
        ) : (
          <span aria-live="polite" className={`rounded-md px-4 py-2 text-sm font-medium ${correct ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"}`}>
            {correct ? "Correct" : `Incorrect — answer: ${formatCorrectAnswer(question)}`}
          </span>
        )}
        <button
          type="button"
          onClick={handleExplain}
          className="rounded-md border border-slate-200/20 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800/60"
        >
          AI explain
        </button>
        <button
          type="button"
          onClick={handleReport}
          disabled={reportSent}
          className="ml-auto rounded-md border border-slate-200/15 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800/60 disabled:opacity-60"
        >
          {reportSent ? "Reported" : "Report a problem"}
        </button>
      </div>

      {showExplain ? (
        <section className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
          {explainLoading ? (
            <p className="text-sm text-slate-400">Loading explanation…</p>
          ) : explainError ? (
            <div className="text-sm text-rose-300">
              {explainError} <button onClick={handleExplain} className="ml-2 underline">Retry</button>
            </div>
          ) : explainText ? (
            <MarkdownContent content={explainText} />
          ) : null}
        </section>
      ) : null}
    </article>
  );
}

function renderStem(q: QuantQuestion) {
  if (q.type === "qc") {
    return (
      <div className="space-y-3">
        <p className="text-base">
          <span className="font-semibold text-cyan-200">Quantity A:</span> <TeX text={(q as any).quantityA} />
        </p>
        <p className="text-base">
          <span className="font-semibold text-cyan-200">Quantity B:</span> <TeX text={(q as any).quantityB} />
        </p>
        {(q as any).common ? (
          <p className="text-sm text-slate-400">Given: <TeX text={(q as any).common} /></p>
        ) : null}
      </div>
    );
  }
  return <p className="text-base"><TeX text={(q as any).stem} /></p>;
}

function TeX({ text }: { text: string }) {
  // The MarkdownContent renderer handles $...$ via remark-math; this is a
  // tiny inline shim. We render the whole stem inside MarkdownContent when
  // we need math, but for the simple stem inline we just pass the text.
  return <span>{text}</span>;
}

function AnswerInput({
  question, choice, setChoice, multiChoices, setMultiChoices, qcLetter, setQcLetter, numeric, setNumeric, submitted, correct, correctIndex,
}: {
  question: QuantQuestion;
  choice: number | null;
  setChoice: (n: number) => void;
  multiChoices: Set<number>;
  setMultiChoices: (s: Set<number>) => void;
  qcLetter: QCLetter | null;
  setQcLetter: (l: QCLetter) => void;
  numeric: string;
  setNumeric: (s: string) => void;
  submitted: boolean;
  correct: boolean;
  correctIndex: number | number[] | null;
}) {
  if (question.type === "mcq") {
    return (
      <ol className="flex flex-col gap-2">
        {(question as any).choices.map((c: string, i: number) => {
          const isUserPick = choice === i;
          const isCorrect = Array.isArray(correctIndex) ? correctIndex.includes(i) : correctIndex === i;
          const showAsRight = submitted && isCorrect;
          const showAsWrong = submitted && isUserPick && !isCorrect;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => !submitted && setChoice(i)}
                disabled={submitted}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition
                  ${showAsRight ? "border-emerald-400/40 bg-emerald-500/10"
                    : showAsWrong ? "border-rose-400/40 bg-rose-500/10"
                    : isUserPick ? "border-cyan-400/40 bg-cyan-500/10"
                    : "border-slate-200/15 hover:bg-slate-800/40"}`}
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
  if (question.type === "multi") {
    return (
      <ul className="flex flex-col gap-2">
        {(question as any).choices.map((c: string, i: number) => {
          const isPicked = multiChoices.has(i);
          const isCorrect = Array.isArray(correctIndex) && correctIndex.includes(i);
          const showAsRight = submitted && isCorrect;
          const showAsWrong = submitted && isPicked && !isCorrect;
          return (
            <li key={i}>
              <label className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm
                ${showAsRight ? "border-emerald-400/40 bg-emerald-500/10"
                  : showAsWrong ? "border-rose-400/40 bg-rose-500/10"
                  : isPicked ? "border-cyan-400/40 bg-cyan-500/10"
                  : "border-slate-200/15"}`}>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={isPicked}
                  onChange={(e) => {
                    const next = new Set(multiChoices);
                    if (e.target.checked) next.add(i); else next.delete(i);
                    setMultiChoices(next);
                  }}
                  disabled={submitted}
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
  if (question.type === "qc") {
    return (
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {QC_LABELS.map((l, i) => {
          const isPicked = qcLetter === l;
          const isCorrect = submitted && (question as any).answer === l;
          return (
            <button
              key={l}
              type="button"
              onClick={() => !submitted && setQcLetter(l)}
              disabled={submitted}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm
                ${isCorrect ? "border-emerald-400/40 bg-emerald-500/10"
                  : submitted && isPicked ? "border-rose-400/40 bg-rose-500/10"
                  : isPicked ? "border-cyan-400/40 bg-cyan-500/10"
                  : "border-slate-200/15"}`}
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
        value={numeric}
        onChange={(e) => setNumeric(e.target.value)}
        disabled={submitted}
        className="rounded-md border border-slate-200/20 bg-slate-800/40 px-3 py-2 text-base"
      />
      {submitted ? (
        <p className="text-sm text-slate-400">Correct answer: <span className="text-emerald-300">{(question as any).answer}</span></p>
      ) : null}
    </div>
  );
}

function questionText(q: QuantQuestion): string {
  if (q.type === "qc") {
    return `Quantity A: ${(q as any).quantityA}\nQuantity B: ${(q as any).quantityB}` + ((q as any).common ? `\nGiven: ${(q as any).common}` : "");
  }
  return (q as any).stem ?? "";
}

function formatUserAnswer(q: QuantQuestion, ua: UserAnswer): string {
  if (ua.type === "mcq") {
    return q.type === "mcq" ? `${ua.choice + 1}. ${(q as any).choices[ua.choice]}` : `choice ${ua.choice}`;
  }
  if (ua.type === "multi") {
    return q.type === "multi" ? ua.choices.map((c) => `${c + 1}. ${(q as any).choices[c]}`).join("; ") : ua.choices.join(",");
  }
  if (ua.type === "qc") return `${ua.letter}. ${qcText(ua.letter)}`;
  return String((ua as any).value);
}

function nullAnswer(q: QuantQuestion): UserAnswer {
  // Synthetic "no answer" payload used by the explain path.
  switch (q.type) {
    case "mcq": return { type: "mcq", choice: -1 };
    case "multi": return { type: "multi", choices: [] };
    case "qc": return { type: "qc", letter: "A" };
    case "numeric": return { type: "numeric", value: NaN as any };
  }
}