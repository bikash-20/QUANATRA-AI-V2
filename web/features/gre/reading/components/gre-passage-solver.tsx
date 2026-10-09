"use client";
// Reading-comprehension solver. Renders the passage (pinned on the left
// for desktop, scrollable panel on mobile) and the questions in sequence.
// Mirrors the UX of gre-problem-solver.tsx but at the passage level.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReadingPassage, ReadingQuestion } from "@/features/gre/content/loader.types";
import { greProgress, type UserAnswer } from "@/features/gre/progress/repository";
import { checkAnswer, formatCorrectAnswer } from "@/features/gre/reading/checker";
import { getExplanation } from "@/lib/explanations";
import { MarkdownContent } from "@/components/markdown-content";

type Props = {
  passage: ReadingPassage;
  source?: "hand" | "ai";
};

export function GrePassageSolver({ passage, source = "hand" }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [showPassage, setShowPassage] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const b = await greProgress.isBookmarked(passage.id);
      if (!cancelled) setBookmarked(b);
    })();
    return () => { cancelled = true; };
  }, [passage.id]);

  async function toggleBookmark() {
    const isOn = await greProgress.toggleBookmark(passage.id, passage.category);
    setBookmarked(isOn);
  }

  const total = passage.questions.length;
  const question = passage.questions[Math.min(activeIndex, total - 1)];

  return (
    <div className="gre-passage-solver flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-400">
            {passage.category.replace("-", " ")} · {passage.difficulty} · {passage.wordCount} words
          </p>
          <h1 className="mt-1 text-2xl font-bold text-cyan-100">{passage.title}</h1>
          <p className="text-xs text-slate-500">{passage.source}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPassage((s) => !s)}
            className="rounded-md border border-slate-200/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60 md:hidden"
            aria-expanded={showPassage}
          >
            {showPassage ? "Hide passage" : "Show passage"}
          </button>
          <button
            type="button"
            onClick={toggleBookmark}
            aria-pressed={bookmarked}
            className={`rounded-md px-2 py-1 text-xs ${bookmarked ? "bg-cyan-400/20 text-cyan-200" : "text-slate-400 hover:bg-slate-800/60"}`}
          >
            {bookmarked ? "★ Bookmarked" : "☆ Bookmark"}
          </button>
        </div>
      </header>

      <div className="gre-passage-grid">
        <aside className={`gre-passage-panel ${showPassage ? "" : "gre-passage-panel--hidden md:!block"}`}>
          <article className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5 text-sm leading-relaxed text-slate-200">
            <MarkdownContent content={passage.body} />
          </article>
        </aside>

        <section className="gre-question-panel flex flex-col gap-4">
          <nav className="flex flex-wrap items-center gap-1.5" aria-label="Questions in this passage">
            {passage.questions.map((q, i) => (
              <button
                key={q.questionId}
                type="button"
                onClick={() => setActiveIndex(i)}
                className={`h-7 min-w-[2rem] rounded-md px-2 text-xs font-medium ${
                  i === activeIndex
                    ? "bg-cyan-400/20 text-cyan-100"
                    : "border border-slate-200/15 text-slate-300 hover:bg-slate-800/60"
                }`}
                aria-current={i === activeIndex ? "step" : undefined}
              >
                {i + 1}
              </button>
            ))}
          </nav>

          <QuestionCard
            key={question.questionId}
            question={question}
            passageId={passage.id}
            category={passage.category}
            difficulty={passage.difficulty}
            source={source}
            passageBody={passage.body}
            onPrev={activeIndex > 0 ? () => setActiveIndex(activeIndex - 1) : null}
            onNext={activeIndex < total - 1 ? () => setActiveIndex(activeIndex + 1) : null}
          />
        </section>
      </div>
    </div>
  );
}

function QuestionCard({
  question, passageId, category, difficulty, source, passageBody, onPrev, onNext,
}: {
  question: ReadingQuestion;
  passageId: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  source: "hand" | "ai";
  passageBody: string;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}) {
  const [choice, setChoice] = useState<number | null>(null);
  const [multiChoices, setMultiChoices] = useState<Set<number>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [showExplain, setShowExplain] = useState(false);
  const [explainText, setExplainText] = useState<string | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState<string | null>(null);
  const startedAt = useRef<number | null>(null);
  const submissionStarted = useRef(false);

  // The parent component already mounts this with `key={question.questionId}`,
  // so we don't need to manually reset state on question change. The
  // startedAt ref is set on mount via the next effect.
  useEffect(() => {
    startedAt.current = Date.now();
  }, [question.questionId]);

  const buildUserAnswer = useCallback((): UserAnswer | null => {
    if (question.type === "rc-single") {
      return choice === null ? null : { type: "rc-single", choice };
    }
    if (question.type === "rc-multi") {
      if (multiChoices.size === 0) return null;
      return { type: "rc-multi", choices: [...multiChoices].sort((a, b) => a - b) };
    }
    return null;
  }, [multiChoices, choice, question.type]);

  const handleSubmit = useCallback(async () => {
    if (submitted || submissionStarted.current) return;
    const ua = buildUserAnswer();
    if (!ua) return;
    submissionStarted.current = true;
    const ok = checkAnswer(question, ua);
    setSubmitted(true);
    setCorrect(ok);
    await greProgress.recordAttempt({
      questionId: question.questionId,
      topic: category,
      subtopic: passageId,
      difficulty,
      questionType: question.type,
      userAnswer: ua,
      correct: ok,
      timeMs: startedAt.current === null ? 0 : Date.now() - startedAt.current,
      at: Date.now(),
      source,
    });
  }, [buildUserAnswer, question, submitted, category, passageId, difficulty, source]);

  async function handleExplain() {
    setShowExplain(true);
    if (explainText || explainLoading) return;
    setExplainLoading(true);
    setExplainError(null);
    try {
      const ua = buildUserAnswer();
      const correctText = formatCorrectAnswer(question);
      const text = await getExplanation({
        kind: "gre-reading",
        questionId: question.questionId,
        question: question.stem,
        options: question.choices,
        correctAnswer: correctText,
        userAnswer: ua ? formatUserAnswer(question, ua) : undefined,
        context: passageBody,
        difficulty,
        lang: window.localStorage.getItem("quantara.language") === "bn" ? "bn" : "en",
      });
      setExplainText(text);
    } catch (e) {
      setExplainError(e instanceof Error ? e.message : "Failed to load explanation");
    } finally {
      setExplainLoading(false);
    }
  }

  async function handleReport() {
    await greProgress.reportQuestion(question.questionId, "user-reported");
    setReportSent(true);
  }

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
      <header className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 uppercase ${
          difficulty === "easy" ? "bg-emerald-500/15 text-emerald-200"
            : difficulty === "medium" ? "bg-amber-500/15 text-amber-200"
            : "bg-rose-500/15 text-rose-200"
        }`}>{difficulty}</span>
        <span className="rounded-md border border-slate-200/15 px-1.5 py-0.5 uppercase text-slate-400">
          {question.type === "rc-single" ? "single answer" : "select all that apply"}
        </span>
        <span className="text-slate-500">id: {question.questionId}</span>
      </header>

      <div className="text-base text-slate-100">
        <MarkdownContent content={question.stem} inline />
      </div>

      <ol className="flex flex-col gap-2">
        {question.choices.map((c, i) => {
          const isUserPick = question.type === "rc-single" ? choice === i : multiChoices.has(i);
          const isCorrect = question.type === "rc-single" ? question.answer === i : question.answer.includes(i);
          const showAsRight = submitted && isCorrect;
          const showAsWrong = submitted && isUserPick && !isCorrect;
          return (
            <li key={i}>
              <label className={`flex w-full cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm transition
                ${showAsRight ? "border-emerald-400/40 bg-emerald-500/10"
                  : showAsWrong ? "border-rose-400/40 bg-rose-500/10"
                  : isUserPick ? "border-cyan-400/40 bg-cyan-500/10"
                  : "border-slate-200/15 hover:bg-slate-800/40"}`}>
                <input
                  type={question.type === "rc-single" ? "radio" : "checkbox"}
                  name={`q-${question.questionId}`}
                  className="mt-1 h-4 w-4"
                  checked={isUserPick}
                  onChange={(e) => {
                    if (question.type === "rc-single") {
                      setChoice(i);
                    } else {
                      const next = new Set(multiChoices);
                      if (e.target.checked) next.add(i); else next.delete(i);
                      setMultiChoices(next);
                    }
                  }}
                  disabled={submitted}
                />
                <span className="font-mono text-xs text-slate-400">{i + 1}.</span>
                <span className="flex-1"><MarkdownContent content={c} inline /></span>
              </label>
            </li>
          );
        })}
      </ol>

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
          <span aria-live="polite" className={`rounded-md px-4 py-2 text-sm font-medium ${
            correct ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"
          }`}>
            {correct ? "Correct" : `Incorrect — answer: ${formatCorrectAnswer(question)}`}
          </span>
        )}
        {submitted ? (
          <div className="flex-1 rounded-md border border-slate-200/15 bg-slate-950/40 p-3 text-sm text-slate-300">
            <p className="text-xs uppercase tracking-wider text-slate-500">Why</p>
            <p className="mt-1"><MarkdownContent content={question.rationale} inline /></p>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => void handleExplain()}
          disabled={explainLoading}
          className="rounded-md border border-slate-200/20 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800/60"
        >
          {explainLoading ? "Loading…" : "AI explain"}
        </button>
        {onPrev ? (
          <button type="button" onClick={onPrev} className="rounded-md border border-slate-200/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60">
            ← Previous
          </button>
        ) : null}
        {onNext ? (
          <button type="button" onClick={onNext} className="rounded-md border border-slate-200/15 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60">
            Next →
          </button>
        ) : null}
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
        <section className="rounded-2xl border border-slate-200/15 bg-slate-950/40 p-4">
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

function formatUserAnswer(q: ReadingQuestion, ua: UserAnswer): string {
  if (ua.type === "rc-single" && q.type === "rc-single") {
    return `${ua.choice + 1}. ${q.choices[ua.choice] ?? "?"}`;
  }
  if (ua.type === "rc-multi" && q.type === "rc-multi") {
    return ua.choices.map((choice) => `${choice + 1}. ${q.choices[choice] ?? "?"}`).join("; ");
  }
  return "";
}
