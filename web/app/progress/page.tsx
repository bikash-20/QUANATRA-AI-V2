'use client';

import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Navbar } from '@/components/navbar';
import { GlassCard } from '@/components/glass-card';
import { getProgress } from '@/lib/storage';

const chartData = [
  { name: 'Mon', score: 62 },
  { name: 'Tue', score: 68 },
  { name: 'Wed', score: 74 },
  { name: 'Thu', score: 79 },
  { name: 'Fri', score: 86 },
  { name: 'Sat', score: 88 },
  { name: 'Sun', score: 91 },
];

export default function ProgressPage() {
  const current = useMemo(() => getProgress(), []);
  const [streak] = useState(current.streak || 8);

  return (
    <main className="min-h-screen px-4 pb-12 pt-8 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <Navbar />

        <div className="mt-8 grid gap-6 md:grid-cols-3">
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
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="fillColor" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#8feaf0" stopOpacity={0.7} />
                      <stop offset="100%" stopColor="#8feaf0" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="name" stroke="rgba(255,255,255,0.6)" />
                  <YAxis stroke="rgba(255,255,255,0.6)" />
                  <Tooltip />
                  <Area type="monotone" dataKey="score" stroke="#8feaf0" fill="url(#fillColor)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
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
