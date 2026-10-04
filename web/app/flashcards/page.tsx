'use client';

import { useEffect, useState } from 'react';
import { BrainCircuit, Loader2, RefreshCw } from 'lucide-react';
import { Navbar } from '@/components/navbar';
import { GlassCard } from '@/components/glass-card';
import { Button } from '@/components/button';
import { DifficultyToggle } from '@/components/difficulty-toggle';
import { apiRequest, type Difficulty } from '@/lib/api';
import { readStorage, STORAGE_KEYS, writeStorageAsync } from '@/lib/storage';

type Flashcard = {
  front: string;
  back: string;
  topic?: string;
};

export default function FlashcardsPage() {
  const [topic, setTopic] = useState('Data structures');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const saved = readStorage<Flashcard[]>(STORAGE_KEYS.flashcards, []);
      if (saved.length) setCards(saved);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    void writeStorageAsync(STORAGE_KEYS.flashcards, cards);
  }, [cards]);

  async function generateCards() {
    setLoading(true);
    try {
      const response = await apiRequest<{ flashcards?: Flashcard[] }>(
        '/api/flashcards',
        { topic, count: 6, difficulty },
        { retries: 1 },
      );
      const nextCards = response.flashcards ?? [];
      setCards(nextCards);
      setIndex(0);
      setFlipped(false);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  const currentCard = cards[index];

  return (
    <main className="min-h-dvh px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 text-white sm:px-6 sm:pt-8 md:pb-12 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <Navbar />

        <div className="mt-8 grid gap-6 lg:grid-cols-[300px_1fr]">
          <GlassCard className="p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-300/70">Deck</p>
            <label className="mt-4 block">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-300/70">Topic</span>
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                className="glass-input w-full rounded-2xl px-3 py-2.5 text-sm outline-none"
              />
            </label>

            <div className="mt-4">
              <DifficultyToggle value={difficulty} onChange={setDifficulty} />
            </div>

            <Button onClick={generateCards} variant="primary" className="mt-4 w-full gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Generate deck
            </Button>
          </GlassCard>

          <GlassCard className="p-6">
            {!currentCard ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center text-slate-300/70">
                <BrainCircuit className="mb-3 h-8 w-8 text-[#8feaf0]" />
                Generate a flashcard deck to start practicing.
              </div>
            ) : (
              <div className="flex min-h-[420px] flex-col justify-between">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-300/70">
                  <span>Card {index + 1}/{cards.length}</span>
                  <span>Spaced repetition</span>
                </div>

                <div
                  className="group relative mt-5 h-[300px] cursor-pointer [perspective:1000px]"
                  onClick={() => setFlipped((state) => !state)}
                >
                  <div
                    className={`relative h-full w-full rounded-[28px] border border-white/10 bg-[linear-gradient(135deg,rgba(10,20,25,0.7),rgba(20,33,42,0.75))] duration-500 [transform-style:preserve-3d] ${
                      flipped ? '[transform:rotateY(180deg)]' : ''
                    }`}
                    style={{ transition: 'transform 0.6s' }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center rounded-[28px] p-8 [backface-visibility:hidden]">
                      <div className="text-center text-2xl font-medium text-white">{currentCard.front}</div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center rounded-[28px] p-8 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                      <div className="text-center text-lg leading-8 text-slate-100">{currentCard.back}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <Button variant="ghost" onClick={() => setIndex((value) => (value + 1) % cards.length)}>
                    Skip
                  </Button>
                  <Button variant="secondary" onClick={() => setFlipped((state) => !state)}>
                    Flip
                  </Button>
                  <Button variant="primary" onClick={() => setIndex((value) => (value + 1) % cards.length)}>
                    Next
                  </Button>
                </div>
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </main>
  );
}
