"use client";
// Word detail island: shows the current SRS status and lets the user
// mark the word as new / learning / known. State is stored in IDB via
// the same repository the vocab table uses.

import { useEffect, useState } from "react";
import {
  createVocabStatusUpdate,
  greProgress,
  type VocabStatus,
  type VocabState,
} from "@/features/gre/progress/repository";

export function GreWordDetail({ wordId }: { wordId: string }) {
  const [state, setState] = useState<VocabState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await greProgress.getVocabState(wordId);
      if (cancelled) return;
      setState(s);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [wordId]);

  async function setStatus(status: VocabStatus) {
    const next = createVocabStatusUpdate(wordId, status, state ?? undefined);
    await greProgress.setVocabState(next);
    setState(next);
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Your status</h2>
      <div className="flex flex-wrap items-center gap-2">
        {(["new", "learning", "known"] as VocabStatus[]).map((s) => {
          const active = (state?.status ?? "new") === s;
          const label = s === "new" ? "New" : s === "learning" ? "Learning" : "Known";
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              aria-pressed={active}
              disabled={loading}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                active
                  ? s === "known"
                    ? "bg-emerald-500/20 text-emerald-200"
                    : s === "learning"
                    ? "bg-amber-500/20 text-amber-200"
                    : "bg-slate-700/40 text-slate-200"
                  : "text-slate-400 hover:bg-slate-800/60"
              } disabled:opacity-50`}
            >
              {label}
            </button>
          );
        })}
        {state?.lastReviewed ? (
          <span className="ml-auto text-xs text-slate-500">
            Last reviewed {new Date(state.lastReviewed).toLocaleString()}
          </span>
        ) : null}
      </div>
    </section>
  );
}
