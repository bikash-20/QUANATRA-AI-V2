"use client";
// Hydrated progress overview for /gre hub. Reads from the IDB repository
// and renders solved/total + accuracy + streak. Updates on focus.

import { useEffect, useState } from "react";
import { greProgress } from "@/features/gre/progress/repository";
import { getManifest } from "@/features/gre/content/loader.client";

export function GreProgressIsland() {
  const [solved, setSolved] = useState(0);
  const [attempted, setAttempted] = useState(0);
  const [streak, setStreak] = useState(0);
  const [accuracy, setAccuracy] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const solvedIds = await greProgress.solvedIds();
      const attemptedIds = await greProgress.attemptedIds();
      const attempts = await greProgress.listAttempts();
      const firstAttempts = new Map<string, boolean>();
      for (const a of attempts) {
        if (!firstAttempts.has(a.questionId)) firstAttempts.set(a.questionId, a.correct);
      }
      const totalFirst = firstAttempts.size;
      const correctFirst = [...firstAttempts.values()].filter(Boolean).length;
      const s = await greProgress.getStreak();
      if (cancelled) return;
      setSolved(solvedIds.size);
      setAttempted(attemptedIds.size);
      setStreak(s.currentStreak);
      setAccuracy(totalFirst === 0 ? 0 : Math.round((correctFirst / totalFirst) * 100));
    }
    refresh();
    return () => { cancelled = true; };
  }, []);

  const manifest = getManifest();
  const totals = manifest.totals;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Card label="Solved" value={`${solved} / ${totals.quant}`} />
      <Card label="Attempted" value={`${attempted} / ${totals.quant}`} />
      <Card label="Accuracy" value={`${accuracy}%`} hint="first attempt only" />
      <Card label="Streak" value={`${streak}d`} />
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200/15 bg-slate-900/40 p-4">
      <p className="text-xs uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-cyan-200">{value}</p>
      {hint ? <p className="mt-1 text-[0.7rem] text-slate-500">{hint}</p> : null}
    </div>
  );
}