"use client";
// Reading-comprehension aggregate stats, mounted on /gre/progress.

import { useEffect, useMemo, useState } from "react";
import { greProgress, type Attempt } from "@/features/gre/progress/repository";
import { getManifest } from "@/features/gre/content/loader.client";

type Cat = "business" | "science" | "social-science" | "arts";

export function GreReadingProgressIsland() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await greProgress.listAttempts();
      if (cancelled) return;
      setAttempts(all);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const rcAttempts = useMemo(() => attempts.filter((a) => a.questionType.startsWith("rc-")), [attempts]);

  // First-attempt per question, so re-attempts don't inflate accuracy.
  const firstMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const a of rcAttempts) if (!m.has(a.questionId)) m.set(a.questionId, a.correct);
    return m;
  }, [rcAttempts]);

  const byCategory = useMemo(() => {
    const out: Record<Cat, { total: number; correct: number; timeMs: number }> = {
      business: { total: 0, correct: 0, timeMs: 0 },
      science: { total: 0, correct: 0, timeMs: 0 },
      "social-science": { total: 0, correct: 0, timeMs: 0 },
      arts: { total: 0, correct: 0, timeMs: 0 },
    };
    // group first-attempts by category (topic)
    const seenQ = new Set<string>();
    for (const a of rcAttempts) {
      const key = a.questionId;
      if (seenQ.has(key)) continue;
      seenQ.add(key);
      const cat = a.topic as Cat;
      if (!out[cat]) continue;
      out[cat].total += 1;
      if (a.correct) out[cat].correct += 1;
      out[cat].timeMs += a.timeMs;
    }
    return out;
  }, [rcAttempts]);

  const overall = useMemo(() => {
    const total = firstMap.size;
    const correct = [...firstMap.values()].filter(Boolean).length;
    const timeSum = rcAttempts.reduce((s, a) => s + a.timeMs, 0);
    const avgMs = rcAttempts.length === 0 ? 0 : Math.round(timeSum / rcAttempts.length);
    return { total, correct, avgMs };
  }, [firstMap, rcAttempts]);

  const manifest = getManifest();
  const totals = manifest.totals;
  const readingTotal = totals.reading ?? 0;

  if (!loaded) {
    return (
      <div className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5 text-sm text-slate-400">
        Loading reading stats…
      </div>
    );
  }

  if (rcAttempts.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5 text-sm text-slate-400">
        No reading attempts yet — try a passage from the Reading section to start tracking accuracy.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Solved" value={`${overall.correct} / ${readingTotal}`} />
        <Card label="Attempted" value={`${overall.total}`} hint="unique questions" />
        <Card label="Accuracy" value={`${overall.total === 0 ? 0 : Math.round((overall.correct / overall.total) * 100)}%`} hint="first attempt only" />
        <Card label="Avg time" value={`${Math.round(overall.avgMs / 1000)}s`} hint="per question" />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {(["business", "science", "social-science", "arts"] as Cat[]).map((cat) => {
          const v = byCategory[cat];
          const pct = v.total === 0 ? 0 : Math.round((v.correct / v.total) * 100);
          return (
            <div key={cat} className="rounded-xl border border-slate-200/15 bg-slate-900/40 p-4">
              <div className="flex items-center justify-between text-xs">
                <span className="uppercase tracking-wider text-slate-400">{cat.replace("-", " ")}</span>
                <span className="text-slate-500">{v.correct}/{v.total}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-700/40">
                <div className="h-full rounded-full bg-cyan-400" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-[0.7rem] text-slate-500">{pct}% accuracy</p>
            </div>
          );
        })}
      </div>
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
