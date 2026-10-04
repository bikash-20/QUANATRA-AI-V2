"use client";
// Vocab quiz client island. Server provides the words; the client picks a
// mode, an optional tier filter, an optional "weak words" filter (from
// mistakes in greAttempts), generates items with generateVocabQuiz, and
// walks the user through them.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { generateVocabQuiz, type QuizItem, type QuizMode } from "@/features/gre/vocab/quiz";
import { greProgress } from "@/features/gre/progress/repository";
import type { VocabWord } from "@/features/gre/content/loader.types";

const MODES: { value: QuizMode; label: string; hint: string }[] = [
  { value: "def-to-word", label: "Definition → word", hint: "Pick the word for the definition." },
  { value: "word-to-def", label: "Word → definition", hint: "Pick the definition for the word." },
  { value: "synonym", label: "Synonym", hint: "Pick the closest synonym." },
  { value: "antonym", label: "Antonym", hint: "Pick the closest antonym." },
];

const TIER_OPTIONS: { value: "all" | "1" | "2" | "3"; label: string }[] = [
  { value: "all", label: "All tiers" },
  { value: "1", label: "Tier 1 only" },
  { value: "2", label: "Tier 2 only" },
  { value: "3", label: "Tier 3 only" },
];

export function GreVocabQuiz({
  setId,
  words,
}: {
  setId: string;
  words: VocabWord[];
}) {
  const [mode, setMode] = useState<QuizMode>("def-to-word");
  const [tier, setTier] = useState<"all" | "1" | "2" | "3">("all");
  const [weakOnly, setWeakOnly] = useState(false);
  const [weakIds, setWeakIds] = useState<Set<string> | null>(null);
  const [count, setCount] = useState(10);
  const [items, setItems] = useState<QuizItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState(false);

  // Lazy-load the set of "weak" words (failed attempts) so the user can
  // retest them.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const attempts = await greProgress.listAttempts();
      if (cancelled) return;
      const wrong = new Set<string>();
      for (const a of attempts) {
        if (!a.correct) wrong.add(a.questionId);
      }
      setWeakIds(new Set([...wrong].filter((id) => id.startsWith("vocab:"))));
    })();
    return () => { cancelled = true; };
  }, []);

  function start() {
    const tiers = tier === "all" ? undefined : [Number(tier) as 1 | 2 | 3];
    const skip = weakOnly && weakIds ? weakIds : undefined;
    const next = generateVocabQuiz({
      words,
      mode,
      count,
      seed: Date.now(),
      tiers,
      skipWordIds: skip,
    });
    setItems(next);
    setIdx(0);
    setPicks({});
    setRevealed(false);
  }

  const cur = items[idx];
  const correct = cur ? picks[idx] === cur.correctIndex : false;
  const total = items.length;
  const score = useMemo(() => {
    if (!revealed || !items.length) return 0;
    let s = 0;
    for (let i = 0; i < items.length; i++) {
      if (picks[i] === items[i].correctIndex) s++;
    }
    return s;
  }, [revealed, items, picks]);

  if (!items.length) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
          <h2 className="text-lg font-semibold">Configure quiz</h2>
          <p className="mt-1 text-sm text-slate-400">{words.length} words in {setId}.</p>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Mode
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as QuizMode)}
                className="rounded-md border border-slate-200/20 bg-slate-800/40 px-2 py-1 text-sm text-slate-200"
              >
                {MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label} — {m.hint}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Tiers
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value as "all" | "1" | "2" | "3")}
                className="rounded-md border border-slate-200/20 bg-slate-800/40 px-2 py-1 text-sm text-slate-200"
              >
                {TIER_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Questions
              <input
                type="number"
                min={1}
                max={25}
                value={count}
                onChange={(e) => setCount(Math.min(25, Math.max(1, Number(e.target.value) || 10)))}
                className="rounded-md border border-slate-200/20 bg-slate-800/40 px-2 py-1 text-sm text-slate-200"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input
                type="checkbox"
                checked={weakOnly}
                onChange={(e) => setWeakOnly(e.target.checked)}
              />
              <span>Weak words only{weakIds ? ` (${weakIds.size} found)` : ""}</span>
            </label>
          </div>
          <button
            type="button"
            onClick={start}
            className="mt-4 rounded-md bg-cyan-400/20 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/30"
          >
            Start quiz
          </button>
        </div>
      </div>
    );
  }

  if (revealed) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-6">
          <h2 className="text-2xl font-bold">
            Score: {score} / {total}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {score === total ? "Perfect run!" : score / total >= 0.7 ? "Nice work." : "Keep practicing."}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={start}
              className="rounded-md bg-cyan-400/20 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/30"
            >
              New quiz
            </button>
            <Link
              href={`/gre/vocab/${setId}`}
              className="rounded-md border border-slate-200/20 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800/60"
            >
              Back to words
            </Link>
          </div>
        </div>
        <ol className="flex flex-col gap-2">
          {items.map((it, i) => {
            const p = picks[i];
            const ok = p === it.correctIndex;
            return (
              <li key={i} className={`rounded-xl border p-4 text-sm ${ok ? "border-emerald-400/30 bg-emerald-500/10" : "border-rose-400/30 bg-rose-500/10"}`}>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-xs text-slate-400">Q{i + 1}</span>
                  <span className="font-semibold">{it.prompt}</span>
                </div>
                <p className="mt-1 text-slate-300">
                  Correct: <span className="text-emerald-300">{it.choices[it.correctIndex]}</span>
                </p>
                {p !== undefined && !ok ? (
                  <p className="text-slate-300">Your pick: <span className="text-rose-300">{it.choices[p]}</span></p>
                ) : null}
                <Link href={`/gre/vocab/word/${it.wordId}`} className="mt-1 inline-block text-xs text-cyan-300 hover:underline">
                  See word →
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  // Active question
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>Question {idx + 1} of {total}</span>
        <button
          type="button"
          onClick={() => { setItems([]); setIdx(0); setPicks({}); }}
          className="text-slate-500 hover:text-slate-300"
        >
          Cancel
        </button>
      </div>
      <div className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-6">
        <p className="text-sm uppercase tracking-wider text-slate-500">{MODES.find((m) => m.value === mode)?.label}</p>
        <p className="mt-2 text-xl font-semibold">{cur.prompt}</p>
        <ol className="mt-4 flex flex-col gap-2">
          {cur.choices.map((c, i) => {
            const picked = picks[idx] === i;
            const showRight = revealed && i === cur.correctIndex;
            const showWrong = revealed && picked && i !== cur.correctIndex;
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => setPicks({ ...picks, [idx]: i })}
                  disabled={revealed}
                  className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition
                    ${showRight ? "border-emerald-400/40 bg-emerald-500/10"
                      : showWrong ? "border-rose-400/40 bg-rose-500/10"
                      : picked ? "border-cyan-400/40 bg-cyan-500/10"
                      : "border-slate-200/15 hover:bg-slate-800/40"}`}
                >
                  <span className="font-mono text-xs text-slate-400">{i + 1}.</span>
                  <span>{c}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setIdx(Math.max(0, idx - 1))}
          disabled={idx === 0}
          className="rounded-md border border-slate-200/20 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800/60 disabled:opacity-40"
        >
          ← Previous
        </button>
        {!revealed ? (
          picks[idx] !== undefined ? (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="rounded-md bg-cyan-400/20 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-400/30"
            >
              Check answer
            </button>
          ) : (
            <span className="text-xs text-slate-500">Pick an option to continue.</span>
          )
        ) : null}
        <div className="ml-auto flex gap-2">
          {idx < total - 1 ? (
            <button
              type="button"
              onClick={() => { setIdx(idx + 1); setRevealed(false); }}
              className="rounded-md border border-slate-200/20 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800/60"
            >
              Next →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="rounded-md bg-emerald-400/20 px-4 py-2 text-sm font-medium text-emerald-100 hover:bg-emerald-400/30"
            >
              Finish & grade
            </button>
          )}
        </div>
      </div>
      {revealed ? (
        <div className={`rounded-xl border p-4 text-sm ${correct ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-rose-400/30 bg-rose-500/10 text-rose-100"}`}>
          {correct ? "Correct!" : `Incorrect. Answer: ${cur.choices[cur.correctIndex]}`}
          <Link href={`/gre/vocab/word/${cur.wordId}`} className="ml-3 text-xs underline">View word →</Link>
        </div>
      ) : null}
    </div>
  );
}