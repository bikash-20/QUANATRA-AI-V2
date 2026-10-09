// Floating word-lookup popover. Triggered by double-clicking a word in
// the passage. Shows the local vocab entry if present and offers
// "Add to flashcards" + "Ask AI" actions. The AI branch is wired up
// via the existing /api/explain endpoint with `kind: "gre-rc"` and a
// question phrased against the picked word; it lives in the
// explanations cache like any other AI call.

"use client";

import { useEffect, useState } from "react";
import { lookupWord } from "@/lib/rc/word-lookup";
import { greProgress } from "@/features/gre/progress/repository";
import { getExplanation } from "@/lib/explanations";
import { MarkdownContent } from "@/components/markdown-content";

type Props = {
  x: number;
  y: number;
  word: string;
  onClose: () => void;
};

export function GreWordPopover({ x, y, word, onClose }: Props) {
  const entry = lookupWord(word);
  const [askOpen, setAskOpen] = useState(false);
  const [askLoading, setAskLoading] = useState(false);
  const [askText, setAskText] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("[data-word-popover]")) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  async function addToFlashcards() {
    if (!entry) return;
    await greProgress.setVocabState({
      id: entry.id,
      wordId: entry.id,
      status: "learning",
      interval: 0,
      due: Date.now(),
      reps: 0,
      lapses: 0,
    });
    setAdded(true);
  }

  async function askAI() {
    if (askLoading) return;
    setAskOpen(true);
    setAskLoading(true);
    setAskError(null);
    try {
      const text = await getExplanation({
        kind: "gre-rc",
        questionId: `word-${word.toLowerCase()}`,
        question: `What does "${word}" mean in this context? Use the passage sentence for grounding.`,
        options: [],
        difficulty: "medium",
        lang: window.localStorage.getItem("quantara.language") === "bn" ? "bn" : "en",
      });
      setAskText(text);
    } catch (e) {
      setAskError(e instanceof Error ? e.message : "Failed to ask");
    } finally {
      setAskLoading(false);
    }
  }

  return (
    <div
      data-word-popover
      className="fixed z-50 max-w-xs rounded-xl border border-slate-200/20 bg-slate-900/90 p-3 text-sm shadow-lg backdrop-blur"
      style={{ left: x, top: y, transform: "translate(-50%, calc(-100% - 8px))" }}
    >
      <p className="text-xs uppercase tracking-wider text-slate-400">Word</p>
      <p className="mt-1 text-base font-semibold text-cyan-100">{word}</p>
      {entry ? (
        <>
          <p className="mt-1 text-sm text-slate-200">{entry.definition}</p>
          <p className="mt-1 text-xs text-slate-400">e.g. {entry.example}</p>
        </>
      ) : (
        <p className="mt-1 text-xs text-slate-400">Not in the local vocab list. Ask the AI for an in-context meaning.</p>
      )}
      <div className="mt-3 flex gap-2">
        {entry ? (
          <button
            type="button"
            onClick={addToFlashcards}
            disabled={added}
            className="rounded-md bg-cyan-400/20 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-400/30 disabled:opacity-60"
          >
            {added ? "Added" : "Add to flashcards"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={askAI}
          className="rounded-md border border-slate-200/15 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800/60"
        >
          Ask AI
        </button>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-xs text-slate-400 hover:text-slate-200"
          aria-label="Close word popover"
        >
          ×
        </button>
      </div>
      {askOpen ? (
        <div className="mt-3 rounded-md border border-slate-200/15 bg-slate-950/40 p-2 text-xs text-slate-300">
          {askLoading ? "Loading…" : askError ? askError : askText ? <MarkdownContent content={askText} /> : null}
        </div>
      ) : null}
    </div>
  );
}