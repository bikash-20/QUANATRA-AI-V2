'use client';

import Link from 'next/link';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
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

const featurePills = [
  { label: 'CS', glow: 'border border-[#59c4df]/35 bg-[#59c4df]/12 text-[#a5edfa]' },
  { label: 'Math', glow: 'border border-[#7fbbe8]/35 bg-[#7fbbe8]/12 text-[#c1e5ff]' },
  { label: 'Physics', glow: 'border border-[#67d0db]/35 bg-[#67d0db]/12 text-[#b9f3f5]' },
  { label: 'Code', glow: 'border border-[#8fc9ef]/35 bg-[#8fc9ef]/12 text-[#cdeaff]' },
];

const capabilities = [
  { title: 'Flashcards', progress: 68, icon: BookOpen, color: 'from-[#b4eafa] to-[#86c8e8]' },
  { title: 'MCQ Quiz', progress: 82, icon: BrainCircuit, color: 'from-[#a7e9f3] to-[#7abbdc]' },
  { title: 'Quiz from Passage', progress: 54, icon: FileText, color: 'from-[#b8dcf8] to-[#86c7e7]' },
  { title: 'Vocabulary', progress: 74, icon: Sparkles, color: 'from-[#a9e7e8] to-[#76c4d5]' },
  { title: 'Grammar', progress: 61, icon: SquarePen, color: 'from-[#bddcf3] to-[#8bc9e3]' },
  { title: 'Exam', progress: 47, icon: Trophy, color: 'from-[#b4e7ef] to-[#7bbbdc]' },
  { title: 'Progress', progress: 91, icon: Compass, color: 'from-[#b5e2fb] to-[#78c4e7]' },
  { title: 'Admin', progress: 0, icon: Wand2, color: 'from-[#c3e6f4] to-[#8cc5e1]' },
];

export function ExploreView() {
  const reduceMotion = useReducedMotion();

  return (
    <main className="relative min-h-dvh px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 text-white sm:px-6 sm:pt-8 md:pb-12 lg:px-10">
      <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_top,_rgba(100,220,227,0.18),transparent_45%)]" />
      <div className="relative mx-auto max-w-6xl">

        <LazyMotion features={domAnimation}>
          <m.section
            initial={reduceMotion ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="glass-surface mx-auto mt-7 max-w-6xl overflow-hidden rounded-[2rem] p-5 sm:mt-10 sm:p-7 lg:p-9"
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
                  Explore <span className="italic text-[#59c4df]">Quantara</span>
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
                    <Calculator className="h-3.5 w-3.5 text-[#83d8ed]" /> Math drills
                  </span>
                </div>
              </div>

              <m.div
                initial={reduceMotion ? false : { opacity: 0, x: 22, scale: 0.98 }}
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

                  <div className="daily-practice-panel rounded-[26px] border border-white/14 p-4">
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
                              className="h-full rounded-full bg-[linear-gradient(90deg,#59c4df,#a4e3f2)]"
                              style={{ width: `${value}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </GlassCard>
              </m.div>
            </div>
          </m.section>

          <section className="card-grid mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(({ title, progress, icon: Icon, color }, index) => (
              <m.div
                key={title}
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.05 }}
              >
                <GlassCard className="p-4">
                  <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${color} text-slate-900`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-condensed text-base font-medium uppercase tracking-[0.06em] text-white">{title}</span>
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-300/70">{progress}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-white/8">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#59c4df,#a4e3f2)]"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </GlassCard>
              </m.div>
            ))}
          </section>
        </LazyMotion>
      </div>
    </main>
  );
}
