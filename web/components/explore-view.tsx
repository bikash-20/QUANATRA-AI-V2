'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Calculator,
  Compass,
  FileText,
  MessageSquareText,
  Sparkles,
  SquarePen,
  Trophy,
  Wand2,
} from 'lucide-react';
import { GlassCard } from '@/components/glass-card';
import { Button } from '@/components/button';
import { Navbar } from '@/components/navbar';

const featurePills = [
  { label: 'CS', glow: 'bg-[#8fe9ed]/15 text-[#9feef4] border border-[#9feef4]/30' },
  { label: 'Math', glow: 'bg-[#f5d2cb]/12 text-[#f8cad7] border border-[#f8cad7]/30' },
  { label: 'Physics', glow: 'bg-[#d7f6ef]/12 text-[#baf2db] border border-[#baf2db]/30' },
  { label: 'Code', glow: 'bg-[#d9e7ff]/12 text-[#d9ebff] border border-[#d9ebff]/30' },
];

const capabilities = [
  { title: 'Flashcards', progress: 68, icon: BookOpen, color: 'from-[#f9d8e9] to-[#d2f5ff]' },
  { title: 'MCQ Quiz', progress: 82, icon: BrainCircuit, color: 'from-[#d8f9ff] to-[#a5e2f0]' },
  { title: 'Quiz from Passage', progress: 54, icon: FileText, color: 'from-[#fdd7df] to-[#f5e6d4]' },
  { title: 'Vocabulary', progress: 74, icon: Sparkles, color: 'from-[#d9f5e2] to-[#cdf0ff]' },
  { title: 'Grammar', progress: 61, icon: SquarePen, color: 'from-[#d8dafd] to-[#d2f8ff]' },
  { title: 'Exam', progress: 47, icon: Trophy, color: 'from-[#ffebd3] to-[#f8d9ea]' },
  { title: 'Progress', progress: 91, icon: Compass, color: 'from-[#d3edff] to-[#d8f8f4]' },
  { title: 'Admin', progress: 0, icon: Wand2, color: 'from-[#dfe2ff] to-[#e7ebff]' },
];

export function ExploreView() {
  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 text-white sm:px-6 lg:px-10">
      <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_top,_rgba(100,220,227,0.18),transparent_45%)]" />
      <div className="relative mx-auto max-w-6xl">
        <Navbar />

        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="mx-auto mt-10 max-w-6xl overflow-hidden rounded-[38px] border border-white/15 bg-[linear-gradient(135deg,rgba(20,33,46,0.72),rgba(19,35,42,0.82),rgba(31,53,63,0.7))] p-5 shadow-[0_24px_80px_rgba(2,10,17,0.55)] backdrop-blur-md sm:p-7 lg:p-9"
        >
          <div className="grid gap-8 lg:grid-cols-[1.12fr_0.88fr]">
            <div className="relative">
              <div className="mb-5 flex flex-wrap gap-2">
                {featurePills.map((pill) => (
                  <span
                    key={pill.label}
                    className={`rounded-full px-3 py-1.5 text-[0.58rem] font-medium uppercase tracking-[0.2em] ${pill.glow}`}
                  >
                    {pill.label}
                  </span>
                ))}
              </div>

              <h1 className="max-w-xl text-4xl leading-none text-white sm:text-5xl lg:text-[5rem] lg:leading-[0.9]">
                Explore <span className="italic text-[#dffbff]">Quantara</span>
              </h1>

              <p className="mt-4 max-w-xl text-base leading-7 text-slate-200/80 sm:text-lg">
                An AI tutor for CS, math, physics, and code — turning complex ideas into interactive practice,
                instant explanations, and daily progress.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-4">
                <Link href="/chat">
                  <Button variant="primary" className="gap-2 px-5 py-3">
                    Start chatting <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/quiz">
                  <Button variant="secondary" className="px-5 py-3">
                    See features
                  </Button>
                </Link>
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-4 text-xs uppercase tracking-[0.2em] text-slate-300/75">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/4 px-3 py-2">
                  <MessageSquareText className="h-3.5 w-3.5 text-[#98f0f1]" /> Chat tutor
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/4 px-3 py-2">
                  <Calculator className="h-3.5 w-3.5 text-[#f7d4e0]" /> Math drills
                </span>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, x: 22, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.08 }}
              className="relative"
            >
              <GlassCard className="p-4">
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-[0.7rem] uppercase tracking-[0.28em] text-slate-200/70">Daily focus</div>
                  <div className="rounded-full border border-[#9ceff0]/40 bg-[#9ceff0]/10 px-2 py-1 text-[0.6rem] uppercase tracking-[0.2em] text-[#b7f9ff]">
                    86% accuracy
                  </div>
                </div>

                <div className="rounded-[26px] border border-white/14 bg-[linear-gradient(135deg,rgba(10,18,25,0.8),rgba(18,50,58,0.78),rgba(25,35,55,0.84))] p-4">
                  <div className="mb-5 flex items-center justify-between text-slate-100/80">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[#8ef4ef] shadow-[0_0_10px_rgba(142,244,239,0.8)]" />
                      Live practice
                    </div>
                    <span className="text-[0.7rem] uppercase tracking-[0.22em] text-slate-300/70">7 mins</span>
                  </div>

                  <div className="space-y-3">
                    {[68, 82, 90].map((value, index) => (
                      <div key={value} className="space-y-2">
                        <div className="flex items-center justify-between text-[0.7rem] uppercase tracking-[0.15em] text-slate-300/68">
                          <span>{['CS', 'Math', 'Physics'][index]}</span>
                          <span>{value}%</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-white/6">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#8ceef0,#f7d6e8)]"
                            style={{ width: `${value}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </div>
        </motion.section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {capabilities.map(({ title, progress, icon: Icon, color }, index) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.05 }}
            >
              <GlassCard className="p-4">
                <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-slate-900`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-base font-medium text-white">{title}</span>
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-300/70">{progress}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#9feef4,#f7d7e8)]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </section>
      </div>
    </main>
  );
}
