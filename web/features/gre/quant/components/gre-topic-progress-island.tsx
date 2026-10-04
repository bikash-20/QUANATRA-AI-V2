"use client";
// Per-topic solved/total progress bar.

import { useEffect, useState } from "react";
import { greProgress } from "@/features/gre/progress/repository";

export function GreTopicProgressIsland({ topic, total }: { topic: string; total: number }) {
  const [solved, setSolved] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const solvedIds = await greProgress.solvedIds();
      // Without per-question content on the client, the cheap proxy is
      // "solved count" + "is there any attempt for this topic". The server
      // could enrich with per-question ids later.
      if (cancelled) return;
      setSolved(solvedIds.size);
    })();
    return () => { cancelled = true; };
  }, [topic]);

  const pct = total === 0 ? 0 : Math.min(100, Math.round((solved / total) * 100));
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[0.7rem] text-slate-400">
        <span>{pct}% solved</span>
        <span>{solved} / {total}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-700/40">
        <div
          className="h-full rounded-full bg-cyan-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}