'use client';

import { useState } from 'react';
import { Sparkles, Wand2 } from 'lucide-react';
import { GlassCard } from '@/components/glass-card';
import { Button } from '@/components/button';
import { DifficultyToggle } from '@/components/difficulty-toggle';
import { apiRequest, type Difficulty } from '@/lib/api';

type VocabItem = {
  word: string;
  meaning: string;
  bangla: string;
  example: string;
};

export default function VocabPage() {
  const [topic, setTopic] = useState('daily life');
  const [level, setLevel] = useState('B1');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [items, setItems] = useState<VocabItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function generateVocab() {
    setLoading(true);
    try {
      const response = await apiRequest<{ vocab?: VocabItem[] }>(
        '/api/vocab',
        { topic, level, count: 6, difficulty },
        { retries: 1 },
      );
      setItems(response.vocab ?? []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 text-white sm:px-6 sm:pt-8 md:pb-12 lg:px-10">
      <div className="mx-auto max-w-6xl">

        <div className="mt-8 grid gap-6 lg:grid-cols-[300px_1fr]">
          <GlassCard className="p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-300/70">Vocabulary</p>
            <label className="mt-4 block">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-300/70">Topic</span>
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                className="glass-input w-full rounded-2xl px-3 py-2.5 text-sm outline-none"
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-300/70">CEFR</span>
              <select
                value={level}
                onChange={(event) => setLevel(event.target.value)}
                className="glass-input w-full rounded-2xl px-3 py-2.5 text-sm outline-none"
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
                label="Difficulty (example style)"
              />
            </div>

            <Button onClick={generateVocab} variant="primary" className="mt-5 w-full">
              {loading ? 'Loading...' : 'Generate vocabulary'}
            </Button>
          </GlassCard>

          <div className="card-grid grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.length === 0 ? (
              <GlassCard className="col-span-full flex min-h-[380px] items-center justify-center text-center text-slate-300/70">
                <div>
                  <Sparkles className="mx-auto mb-3 h-8 w-8 text-[#8feaf0]" />
                  Generate a focused vocabulary deck.
                </div>
              </GlassCard>
            ) : (
              items.map((item) => (
                <GlassCard key={item.word} className="p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-2xl font-semibold text-white">{item.word}</div>
                    <Wand2 className="h-4 w-4 text-[#8feaf0]" />
                  </div>
                  <div className="text-sm text-slate-300/90">{item.meaning}</div>
                  <div className="mt-3 text-sm text-[#bde7ff]">বাংলা: {item.bangla}</div>
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/4 p-3 text-sm text-slate-200">
                    “{item.example}”
                  </div>
                  <Button variant="secondary" className="mt-4 w-full">
                    Add to flashcards
                  </Button>
                </GlassCard>
              ))
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
