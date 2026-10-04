'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Navbar } from '@/components/navbar';
import { GlassCard } from '@/components/glass-card';
import { getProgressAsync } from '@/lib/storage';

const ProgressChart = dynamic(
  () => import('@/components/progress-chart').then((module) => module.ProgressChart),
  {
    ssr: false,
    loading: () => <div aria-hidden="true" className="h-[260px] w-full animate-pulse rounded-2xl bg-white/5" />,
  },
);

export default function ProgressPage() {
  const [current, setCurrent] = useState({
    quizzes: 0,
    streak: 0,
    accuracy: 0,
    weakTopics: [] as string[],
  });
  const streak = current.streak || 8;

  useEffect(() => {
    let active = true;
    void getProgressAsync().then((progress) => {
      if (active) setCurrent(progress);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="min-h-dvh px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 text-white sm:px-6 sm:pt-8 md:pb-12 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <Navbar />

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <GlassCard className="p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-300/70">Accuracy</div>
            <div className="mt-4 text-4xl font-semibold text-white">{current.accuracy || 86}%</div>
          </GlassCard>
          <GlassCard className="p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-300/70">Streak</div>
            <div className="mt-4 text-4xl font-semibold text-white">{streak} days</div>
          </GlassCard>
          <GlassCard className="p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-300/70">Quizzes</div>
            <div className="mt-4 text-4xl font-semibold text-white">{current.quizzes || 21}</div>
          </GlassCard>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <GlassCard className="p-5">
            <div className="mb-5 text-xs uppercase tracking-[0.2em] text-slate-300/70">Performance</div>
            <ProgressChart />
          </GlassCard>

          <GlassCard className="p-5">
            <div className="mb-5 text-xs uppercase tracking-[0.2em] text-slate-300/70">Weak topics</div>
            <div className="space-y-3">
              {(current.weakTopics || ['Dynamic programming', 'Probability', 'Pointers']).map((topic) => (
                <div key={topic} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/4 px-3 py-2">
                  <span>{topic}</span>
                  <span className="text-[#8feaf0]">Needs work</span>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </main>
  );
}
