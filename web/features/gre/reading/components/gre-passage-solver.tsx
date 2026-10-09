"use client";
// Reading-comprehension solver. Renders the passage (pinned on the left
// for desktop, scrollable panel on mobile) and the questions in sequence.
// Mirrors the UX of gre-problem-solver.tsx but at the passage level.

import { useCallback, useEffect, useRef, useState } from "react";
import type { RcPassage, RcQuestion } from "@/features/gre/content/loader.types";
import { greProgress, type UserAnswer } from "@/features/gre/progress/repository";
import { checkAnswer, formatCorrectAnswer, choiceLetter } from "@/features/gre/reading/checker";
import { getExplanation } from "@/lib/explanations";
import { MarkdownContent } from "@/components/markdown-content";
import { GrePassageText } from "./gre-passage-text";

type Props = {
  passage: RcPassage;
  /** Pre-split sentence list (from getPassageWithSentences). When
   * omitted the solver renders the body as a single Markdown block. The
   * highlighter / word-lookup wiring arrives in commit #9 and at that
   * point this prop becomes required. */
  sentences?: string[];
  source?: "hand" | "ai";
};

export function GrePassageSolver({ passage, sentences, source = "hand" }: Props) {
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
            {passage.category.replace("-", " ")} · {passage.difficulty} · {passage.body.trim().split(/\s+/).length} words
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
          <article className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
            <GrePassageText
              passageId={passage.id}
              body={passage.body}
              sentences={sentences ?? []}
              evidence={question.evidence.map((e) => e.sentence)}
            />
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
  question: RcQuestion;
  passageId: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  source: "hand" | "ai";
  passageBody: string;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
}) {
  const isPickable = question.kind === "single" || question.kind === "multi";
  const choices: string[] = isPickable ? (question as Extract<RcQuestion, { kind: "single" | "multi" }>).choices : [];
  const [choice, setChoice] = useState<number | null>(null);
  const [multiChoices, setMultiChoices] = useState<Set<number>>(new Set());
  const [sentencePick, setSentencePick] = useState<number | null>(null);
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
    if (question.kind === "single") {
      return choice === null ? null : { type: "rc-single", choice };
    }
    if (question.kind === "multi") {
      if (multiChoices.size === 0) return null;
      return { type: "rc-multi", choices: [...multiChoices].sort((a, b) => a - b) };
    }
    if (question.kind === "select-sentence") {
      return sentencePick === null ? null : { type: "rc-sentence", sentence: sentencePick };
    }
    return null;
  }, [multiChoices, choice, sentencePick, question.kind]);

  const handleSubmit = useCallback(async () => {
    if (submitted || submissionStarted.current) return;
    const ua = buildUserAnswer();
    if (!ua) return;
    submissionStarted.current = true;
    const ok = checkAnswer(question, ua);
    setSubmitted(true);
    setCorrect(ok);
    const qt = question.kind === "single" ? "rc-single-answer"
      : question.kind === "multi" ? "rc-multi-answer"
      : "rc-sentence";
    await greProgress.recordAttempt({
      questionId: question.questionId,
      topic: category,
      subtopic: passageId,
      difficulty,
      questionType: qt,
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
        options: isPickable ? choices : [],
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
          {question.kind === "single" ? "single answer"
            : question.kind === "multi" ? "select all that apply"
            : "select a sentence"}
        </span>
      </header>

      <div className="text-base text-slate-100">
        <MarkdownContent content={question.stem} inline />
      </div>

      {question.kind === "select-sentence" ? (
        <SelectSentenceInput
          question={question}
          selected={sentencePick}
          onChange={setSentencePick}
          disabled={submitted}
        />
      ) : null}

      <ol className="flex flex-col gap-2">
        {choices.map((c, i) => {
          const isUserPick = question.kind === "single" ? choice === i : multiChoices.has(i);
          const isCorrect =
            question.kind === "single" ? question.answer === i
            : question.kind === "multi" ? question.answer.includes(i)
            : false;
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
                  type={question.kind === "single" ? "radio" : "checkbox"}
                  name={`q-${question.questionId}`}
                  className="mt-1 h-4 w-4"
                  checked={isUserPick}
                  onChange={(e) => {
                    if (question.kind === "single") {
                      setChoice(i);
                    } else {
                      const next = new Set(multiChoices);
                      if (e.target.checked) next.add(i); else next.delete(i);
                      setMultiChoices(next);
                    }
                  }}
                  disabled={submitted}
                />
                <span className="font-mono text-xs text-slate-400">{choiceLetter(i)}.</span>
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
        {submitted ? (
          <button
            type="button"
            onClick={() => void handleExplain()}
            disabled={explainLoading}
            className="rounded-md border border-slate-200/20 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800/60"
          >
            {explainLoading ? "Loading…" : "AI explain"}
          </button>
        ) : (
          <button
            type="button"
            disabled
            title="Submit first to enable the AI explainer."
            className="cursor-not-allowed rounded-md border border-slate-200/20 px-4 py-2 text-sm text-slate-500/70"
          >
            AI explain
          </button>
        )}
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
          className="ml-auto text-xs text-slate-500 underline-offset-2 hover:text-slate-300 hover:underline disabled:opacity-60"
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

function formatUserAnswer(q: RcQuestion, ua: UserAnswer): string {
  if (ua.type === "rc-single" && q.kind === "single") {
    return `${choiceLetter(ua.choice)}. ${q.choices[ua.choice] ?? "?"}`;
  }
  if (ua.type === "rc-multi" && q.kind === "multi") {
    return ua.choices.map((choice) => `${choiceLetter(choice)}. ${q.choices[choice] ?? "?"}`).join("; ");
  }
  if (ua.type === "rc-sentence" && q.kind === "select-sentence") {
    return `Sentence ${ua.sentence + 1}`;
  }
  return "";
}

/**
 * Placeholder for the sentence-selection input. The full
 * sentence-indexed passage renderer (with clickable sentences, evidence
 * highlights, and highlighter integration) arrives in commit #9. For
 * now we just show the chosen sentence index so the user can submit
 * a `select-sentence` question; the data path is in place.
 */
function SelectSentenceInput({
  question,
  selected,
  onChange,
  disabled,
}: {
  question: Extract<RcQuestion, { kind: "select-sentence" }>;
  selected: number | null;
  onChange: (n: number) => void;
  disabled: boolean;
}) {
  // The passage is rendered separately in the parent, so this control
  // is just a numeric stepper. The parent (in commit #9) will also
  // make sentences clickable in the passage itself.
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/15 bg-slate-950/40 p-3 text-sm">
      <span className="text-slate-400">Sentence</span>
      <button
        type="button"
        onClick={() => onChange(Math.max(0, (selected ?? 0) - 1))}
        disabled={disabled || (selected ?? 0) === 0}
        className="rounded-md border border-slate-200/15 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800/60 disabled:opacity-40"
      >
        −
      </button>
      <span className="font-mono text-cyan-200">{(selected ?? 0) + 1}</span>
      <button
        type="button"
        onClick={() => onChange((selected ?? 0) + 1)}
        disabled={disabled}
        className="rounded-md border border-slate-200/15 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800/60 disabled:opacity-40"
      >
        +
      </button>
      <span className="text-xs text-slate-500">
        (The sentence picker will be inline in the passage in commit #9.)
      </span>
    </div>
  );
}
