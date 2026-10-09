"use client";
// Per-passage solved / total progress bar.

import { useEffect, useState } from "react";
import { greProgress } from "@/features/gre/progress/repository";

export function GrePassageProgressIsland({ passageId, total }: { passageId: string; total: number }) {
  const [solved, setSolved] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await greProgress.listAttempts();
      // count distinct question ids under this passage that have at least one correct attempt
      const seen = new Set<string>();
      let count = 0;
      for (const a of all) {
        if (a.subtopic !== passageId) continue;
        if (a.correct && !seen.has(a.questionId)) {
          seen.add(a.questionId);
          count += 1;
        }
      }
      if (cancelled) return;
      setSolved(count);
    })();
    return () => { cancelled = true; };
  }, [passageId]);

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
