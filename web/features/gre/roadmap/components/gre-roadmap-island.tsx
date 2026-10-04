"use client";
// 4-week roadmap checklist. Loads/stores tick state in IDB.

import { useEffect, useState } from "react";
import { greProgress } from "@/features/gre/progress/repository";

type Week = { title: string; days: Array<{ day: number; task: string }> };

export function GreRoadmapIsland({ weeks }: { weeks: Week[] }) {
  const [completed, setCompleted] = useState<Record<string, true>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await greProgress.getRoadmap();
      if (cancelled) return;
      setCompleted(r.completed);
      setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, []);

  async function toggle(weekIdx: number, day: number) {
    const key = `${weekIdx + 1}.${day}`;
    const next = { ...completed };
    if (next[key]) delete next[key]; else next[key] = true;
    setCompleted(next);
    await greProgress.setRoadmapDay(weekIdx + 1, day, Boolean(next[key]));
  }

  const totalDays = weeks.reduce((acc, w) => acc + w.days.length, 0);
  const doneCount = Object.keys(completed).length;
  const pct = totalDays ? Math.round((doneCount / totalDays) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-slate-400">Progress</span>
          <span className="text-sm font-mono text-cyan-200">{doneCount} / {totalDays} · {pct}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div className="h-full bg-cyan-400/40" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {weeks.map((w, wi) => {
        const weekDone = w.days.filter((d) => completed[`${wi + 1}.${d.day}`]).length;
        return (
          <section key={wi} className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
            <header className="mb-3 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">{w.title}</h2>
              <span className="text-xs text-slate-400">{weekDone} / {w.days.length}</span>
            </header>
            <ul className="flex flex-col gap-2">
              {w.days.map((d) => {
                const key = `${wi + 1}.${d.day}`;
                const done = Boolean(completed[key]);
                return (
                  <li key={d.day}>
                    <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${done ? "border-emerald-400/30 bg-emerald-500/10" : "border-slate-200/15"}`}>
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => void toggle(wi, d.day)}
                        disabled={!hydrated}
                        className="mt-0.5 h-4 w-4"
                      />
                      <div>
                        <div className="text-xs uppercase tracking-wider text-slate-500">Day {d.day}</div>
                        <div className={done ? "text-slate-300 line-through" : "text-slate-100"}>{d.task}</div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}