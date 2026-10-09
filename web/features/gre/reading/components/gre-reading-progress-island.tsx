"use client";
// Reading-comprehension aggregate stats, mounted on /gre/progress.
// Uses the pure `aggregateRcStats` aggregator so the same numbers can be
// unit-tested without IDB. The "Include AI-generated attempts" toggle
// is persisted to localStorage so the choice survives reloads.

import { useEffect, useMemo, useState } from "react";
import { greProgress, type Attempt } from "@/features/gre/progress/repository";
import { getManifest } from "@/features/gre/content/loader.client";
import {
  aggregateRcStats,
  QTYPE_LABELS,
} from "@/features/gre/progress/rc-stats";

const INCLUDE_AI_KEY = "quantara.rc.includeAI";

export function GreReadingProgressIsland() {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [includeAi, setIncludeAi] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(INCLUDE_AI_KEY) === "1";
  });

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

  const rcAttempts = useMemo(
    () => attempts.filter((a) => a.questionType.startsWith("rc-")),
    [attempts]
  );

  const stats = useMemo(
    () => aggregateRcStats(rcAttempts, includeAi),
    [rcAttempts, includeAi]
  );

  const manifest = getManifest();
  const readingTotal = manifest.totals.reading ?? 0;

  if (!loaded) {
    return (
      <div className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5 text-sm text-slate-400">
        Loading reading stats…
      </div>
    );
  }

  if (rcAttempts.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <IncludeAiToggle value={includeAi} onChange={setIncludeAi} />
        <div className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5 text-sm text-slate-400">
          No reading attempts yet — try a passage from the Reading section to start tracking accuracy.
        </div>
      </div>
    );
  }

  const accuracyPct = stats.uniqueQuestions === 0
    ? 0
    : Math.round((stats.correctQuestions / stats.uniqueQuestions) * 100);
  const avgAnsSec = Math.round(stats.time.avgAnswerTimeMs / 1000);
  const avgReadSec = Math.round(stats.time.avgReadingTimeMs / 1000);

  return (
    <div className="flex flex-col gap-5">
      <IncludeAiToggle value={includeAi} onChange={setIncludeAi} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Solved" value={`${stats.correctQuestions} / ${readingTotal}`} />
        <Card
          label="Attempted"
          value={`${stats.uniqueQuestions}`}
          hint={`${stats.totalAttempts} raw attempts`}
        />
        <Card
          label="Accuracy"
          value={`${accuracyPct}%`}
          hint="first attempt only"
        />
        <Card
          label="Avg time"
          value={`${avgAnsSec}s`}
          hint={avgReadSec > 0 ? `read ${avgReadSec}s · answer ${avgAnsSec}s` : "per question"}
        />
      </div>

      {stats.byQType.length > 0 ? (
        <div className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-cyan-100">By question type</h3>
            <span className="text-xs text-slate-500">worst first</span>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {stats.byQType.map((row) => (
              <li key={row.qType} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-200">{QTYPE_LABELS[row.qType] ?? row.qType}</span>
                  <span className="text-slate-500">
                    {row.correct}/{row.total} · {row.percent}%
                    {row.avgAnswerTimeMs > 0 ? ` · ${Math.round(row.avgAnswerTimeMs / 1000)}s` : ""}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700/40">
                  <div
                    className={`h-full rounded-full ${row.percent < 50 ? "bg-rose-400" : row.percent < 75 ? "bg-amber-300" : "bg-emerald-400"}`}
                    style={{ width: `${row.percent}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {stats.byCategory.map((cat) => (
          <div key={cat.category} className="rounded-xl border border-slate-200/15 bg-slate-900/40 p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="uppercase tracking-wider text-slate-400">{cat.category.replace("-", " ")}</span>
              <span className="text-slate-500">{cat.correct}/{cat.total}</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-700/40">
              <div className="h-full rounded-full bg-cyan-400" style={{ width: `${cat.percent}%` }} />
            </div>
            <p className="mt-2 text-[0.7rem] text-slate-500">{cat.percent}% accuracy</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function IncludeAiToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 self-end text-xs text-slate-300">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => {
          onChange(e.target.checked);
          if (typeof window !== "undefined") {
            window.localStorage.setItem(INCLUDE_AI_KEY, e.target.checked ? "1" : "0");
          }
        }}
        className="h-3.5 w-3.5"
      />
      Include AI-generated attempts
    </label>
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
