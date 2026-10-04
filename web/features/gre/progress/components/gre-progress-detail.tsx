"use client";
// Detailed progress island: per-topic accuracy, per-subtopic weak list,
// vocab status counts, mock history, daily streak.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { greProgress, type Attempt, type StreakState, type VocabState, type MockState } from "@/features/gre/progress/repository";

type Topic = { slug: string; title: string; subtopics: string[] };

export function GreProgressIsland({ topics }: { topics: Topic[] }) {
  const [hydrated, setHydrated] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [vocab, setVocab] = useState<VocabState[]>([]);
  const [streak, setStreak] = useState<StreakState | null>(null);
  const [mocks, setMocks] = useState<MockState[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [a, v, s, m] = await Promise.all([
        greProgress.listAttempts(),
        greProgress.listVocabStates(),
        greProgress.getStreak(),
        greProgress.listMocks(),
      ]);
      if (cancelled) return;
      setAttempts(a);
      setVocab(v);
      setStreak(s);
      setMocks(m);
      setHydrated(true);
    })();
    return () => { cancelled = true; };
  }, []);

  const stats = useMemo(() => computeStats(attempts), [attempts]);
  const vocabCounts = useMemo(() => {
    const out = { new: 0, learning: 0, known: 0 };
    for (const v of vocab) out[v.status]++;
    return out;
  }, [vocab]);

  if (!hydrated) {
    return <p className="text-sm text-slate-400">Loading progress…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total attempts" value={String(stats.totalAttempts)} />
        <Stat label="Unique questions" value={String(stats.uniqueAttempted)} />
        <Stat label="Solved" value={String(stats.solved)} />
        <Stat label="Accuracy (1st)" value={`${stats.accuracyFirst}%`} accent={stats.accuracyFirst >= 70 ? "good" : stats.accuracyFirst >= 50 ? "mid" : "bad"} />
      </section>

      <section className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
        <h2 className="text-lg font-semibold">Streak</h2>
        <div className="mt-3 flex items-baseline gap-3 text-sm">
          <span className="text-3xl font-mono text-cyan-200">{streak?.currentStreak ?? 0}</span>
          <span className="text-slate-400">current day streak (longest {streak?.longestStreak ?? 0})</span>
        </div>
        {streak?.recentDays.length ? (
          <div className="mt-4 flex gap-1">
            {streak.recentDays.map((d) => {
              const pct = d.total > 0 ? d.correct / d.total : 0;
              return (
                <div
                  key={d.day}
                  title={`${d.day}: ${d.correct}/${d.total}`}
                  className="h-8 flex-1 rounded-sm"
                  style={{
                    background: `rgba(34,211,238,${0.15 + pct * 0.7})`,
                  }}
                />
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
        <h2 className="text-lg font-semibold">Accuracy by topic</h2>
        <p className="mt-1 text-xs text-slate-500">First attempt only.</p>
        <ul className="mt-3 flex flex-col gap-3">
          {topics.map((t) => {
            const ts = stats.byTopic[t.slug];
            if (!ts) return (
              <li key={t.slug} className="flex items-center justify-between text-sm text-slate-500">
                <Link href={`/gre/quant/${t.slug}`} className="hover:text-slate-300">{t.title}</Link>
                <span>no attempts yet</span>
              </li>
            );
            const pct = ts.firstAttempts > 0 ? Math.round((ts.firstCorrect / ts.firstAttempts) * 100) : 0;
            return (
              <li key={t.slug} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between text-sm">
                  <Link href={`/gre/quant/${t.slug}`} className="font-medium hover:text-cyan-300">{t.title}</Link>
                  <span className="text-slate-400">{ts.firstCorrect}/{ts.firstAttempts} ({pct}%)</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div className={`h-full ${pct >= 70 ? "bg-emerald-400/60" : pct >= 50 ? "bg-amber-400/60" : "bg-rose-400/60"}`} style={{ width: `${pct}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
        <h2 className="text-lg font-semibold">Weak topics (first-attempt wrong)</h2>
        {stats.weakSubtopics.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No weak subtopics yet — start practicing.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {stats.weakSubtopics.map((w) => (
              <li key={`${w.topic}.${w.subtopic}`} className="flex items-baseline justify-between">
                <Link href={`/gre/quant/${w.topic}`} className="hover:text-cyan-300">
                  {w.topic} · {w.subtopic}
                </Link>
                <span className="text-rose-300">{w.wrong}/{w.total}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
        <h2 className="text-lg font-semibold">Vocab status</h2>
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <Stat label="New" value={String(vocabCounts.new)} />
          <Stat label="Learning" value={String(vocabCounts.learning)} />
          <Stat label="Known" value={String(vocabCounts.known)} accent="good" />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/15 bg-slate-900/40 p-5">
        <h2 className="text-lg font-semibold">Mock history</h2>
        {mocks.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No mocks finished yet. Try <Link href="/gre/quant/mock" className="text-cyan-300 hover:underline">/gre/quant/mock</Link>.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {mocks.map((m) => (
              <li key={m.id} className="flex items-baseline justify-between rounded-md border border-slate-200/10 px-3 py-2">
                <span className="text-slate-300">{new Date(m.finishedAt ?? m.startedAt).toLocaleString()}</span>
                <span className="font-mono">
                  <span className={m.result && m.result.score / m.result.total >= 0.7 ? "text-emerald-300" : "text-amber-300"}>
                    {m.result?.score ?? 0}/{m.result?.total ?? m.questionIds.length}
                  </span>
                  {m.result ? <span className="ml-2 text-slate-400">({Math.round((m.result.score / m.result.total) * 100)}%)</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: "good" | "mid" | "bad" }) {
  const c = accent === "good" ? "text-emerald-300" : accent === "mid" ? "text-amber-300" : accent === "bad" ? "text-rose-300" : "text-slate-200";
  return (
    <div className="rounded-xl border border-slate-200/15 bg-slate-900/40 p-3">
      <div className="text-xs uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${c}`}>{value}</div>
    </div>
  );
}

type TopicStats = {
  totalAttempts: number;
  uniqueAttempted: number;
  solved: number;
  accuracyFirst: number;
  byTopic: Record<string, { firstAttempts: number; firstCorrect: number; totalAttempts: number }>;
  weakSubtopics: Array<{ topic: string; subtopic: string; wrong: number; total: number }>;
};

function computeStats(attempts: Attempt[]): TopicStats {
  // First attempt per question only.
  const firstByQuestion = new Map<string, Attempt>();
  for (const a of attempts) {
    if (!firstByQuestion.has(a.questionId)) firstByQuestion.set(a.questionId, a);
  }
  const firstAttempts = [...firstByQuestion.values()];
  const solved = firstAttempts.filter((a) => a.correct).length;
  const accuracyFirst = firstAttempts.length ? Math.round((solved / firstAttempts.length) * 100) : 0;

  const byTopic: Record<string, { firstAttempts: number; firstCorrect: number; totalAttempts: number }> = {};
  for (const a of firstAttempts) {
    byTopic[a.topic] = byTopic[a.topic] || { firstAttempts: 0, firstCorrect: 0, totalAttempts: 0 };
    byTopic[a.topic].firstAttempts++;
    if (a.correct) byTopic[a.topic].firstCorrect++;
  }
  for (const a of attempts) {
    byTopic[a.topic] = byTopic[a.topic] || { firstAttempts: 0, firstCorrect: 0, totalAttempts: 0 };
    byTopic[a.topic].totalAttempts++;
  }

  // Weak subtopics: first attempts where wrong, ordered by ratio.
  const subMap = new Map<string, { wrong: number; total: number; topic: string; subtopic: string }>();
  for (const a of firstAttempts) {
    const key = `${a.topic}::${a.subtopic}`;
    const cur = subMap.get(key) ?? { wrong: 0, total: 0, topic: a.topic, subtopic: a.subtopic };
    cur.total++;
    if (!a.correct) cur.wrong++;
    subMap.set(key, cur);
  }
  const weakSubtopics = [...subMap.values()]
    .filter((s) => s.wrong > 0 && s.wrong / s.total >= 0.5)
    .sort((a, b) => b.wrong / b.total - a.wrong / a.total)
    .slice(0, 10);

  return {
    totalAttempts: attempts.length,
    uniqueAttempted: firstByQuestion.size,
    solved,
    accuracyFirst,
    byTopic,
    weakSubtopics,
  };
}