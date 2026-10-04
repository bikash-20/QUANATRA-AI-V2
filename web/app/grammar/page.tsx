'use client';

import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Navbar } from '@/components/navbar';
import { GlassCard } from '@/components/glass-card';
import { Button } from '@/components/button';
import { DifficultyToggle } from '@/components/difficulty-toggle';
import { apiRequest, type Difficulty } from '@/lib/api';

type GrammarRule = {
  rule: string;
  example: string;
  explanation: string;
  practice: Array<{ question: string; answer: string; explanation: string }>;
};

export default function GrammarPage() {
  const [topic, setTopic] = useState('Sentence structure');
  const [level, setLevel] = useState('B1');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [grammar, setGrammar] = useState<GrammarRule | null>(null);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);

  async function generateGrammar() {
    setLoading(true);
    try {
      const response = await apiRequest<{ grammar?: GrammarRule }>(
        '/api/grammar',
        { topic, level, difficulty },
        { retries: 1 },
      );
      setGrammar(response.grammar ?? null);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-4 pb-12 pt-8 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <Navbar />

        <div className="mt-8 grid gap-6 lg:grid-cols-[300px_1fr]">
          <GlassCard className="p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-300/70">Grammar</p>
            <label className="mt-4 block">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-300/70">Topic</span>
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/4 px-3 py-2.5 text-sm text-white outline-none"
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-300/70">CEFR</span>
              <select
                value={level}
                onChange={(event) => setLevel(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/4 px-3 py-2.5 text-sm text-white outline-none"
              >
                <option className="bg-slate-900">A1</option>
                <option className="bg-slate-900">A2</option>
                <option className="bg-slate-900">B1</option>
                <option className="bg-slate-900">B2</option>
              </select>
            </label>

            <div className="mt-4">
              <DifficultyToggle
                value={difficulty}
                onChange={setDifficulty}
                label="Practice difficulty"
              />
            </div>

            <Button onClick={generateGrammar} variant="primary" className="mt-5 w-full">
              {loading ? 'Loading...' : 'Generate rule set'}
            </Button>
          </GlassCard>

          <GlassCard className="p-5">
            {!grammar ? (
              <div className="flex min-h-[420px] items-center justify-center text-center text-slate-300/70">
                <div>
                  <BookOpen className="mx-auto mb-3 h-8 w-8 text-[#8feaf0]" />
                  Study a grammar rule and quick practice examples.
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-2xl border border-white/10 bg-white/4 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#9feef4]">Rule</p>
                  <h2 className="mt-2 text-2xl text-white">{grammar.rule}</h2>
                  <p className="mt-3 text-slate-200/90">{grammar.explanation}</p>
                  <div className="mt-4 rounded-2xl border border-[#8feaf0]/20 bg-[#8feaf0]/5 p-3 text-sm text-slate-100">
                    Example: {grammar.example}
                  </div>
                </div>

                {grammar.practice.map((item, index) => (
                  <div key={item.question} className="rounded-2xl border border-white/10 bg-white/4 p-4">
                    <div className="mb-2 text-sm text-slate-300/78">Practice {index + 1}</div>
                    <div className="text-lg text-white">{item.question}</div>
                    <Button
                      variant="secondary"
                      className="mt-3"
                      onClick={() => setRevealed((state) => ({ ...state, [index]: !state[index] }))}
                    >
                      {revealed[index] ? 'Hide answer' : 'Reveal answer'}
                    </Button>
                    {revealed[index] && (
                      <div className="mt-3 rounded-2xl border border-emerald-400/25 bg-emerald-500/8 p-3 text-sm text-emerald-100">
                        {item.answer}
                        <div className="mt-2 text-emerald-50/80">{item.explanation}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </main>
  );
}
