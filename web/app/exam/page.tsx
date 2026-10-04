'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock3, Loader2, ShieldCheck } from 'lucide-react';
import { GlassCard } from '@/components/glass-card';
import { Button } from '@/components/button';
import { DifficultyToggle } from '@/components/difficulty-toggle';
import { AIExplanation } from '@/components/ai-explanation';
import { ApiErrorNotice } from '@/components/api-error-notice';
import { apiRequest, type Difficulty } from '@/lib/api';
import { examGradeResponseSchema, quizResponseSchema } from '@/lib/api-schemas';
import {
  getExamTimerMinutes,
  saveExamTimerMinutes,
  saveProgressAsync,
} from '@/lib/storage';

type ExamQuestion = {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
};

const TIMER_OPTIONS = [5, 10, 15, 20, 30, 45, 60] as const;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function ExamPage() {
  const [topic, setTopic] = useState('Operating systems');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [timerMinutes, setTimerMinutes] = useState<number>(() => getExamTimerMinutes(10));
  const [timeLeft, setTimeLeft] = useState(timerMinutes * 60);
  const [loading, setLoading] = useState(false);
  const [grading, setGrading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<{
    verdict?: string;
    weak_topics?: string[];
    score?: number;
    total?: number;
  } | null>(null);
  const tickerRef = useRef<number | null>(null);

  // Tick down once a second while an exam is active.
  useEffect(() => {
    if (!questions.length || submitted) return;
    tickerRef.current = window.setInterval(() => {
      setTimeLeft((value) => Math.max(0, value - 1));
    }, 1000);
    return () => {
      if (tickerRef.current !== null) window.clearInterval(tickerRef.current);
    };
  }, [questions.length, submitted]);

  // Auto-submit when the timer hits zero.
  useEffect(() => {
    if (questions.length && !submitted && timeLeft === 0) {
      void submitExam();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, submitted, questions.length]);

  function pickTimerMinutes(minutes: number) {
    setTimerMinutes(minutes);
    if (!questions.length) setTimeLeft(minutes * 60);
    saveExamTimerMinutes(minutes);
  }

  async function generateExam() {
    if (loading) return;
    setRequestError(null);
    setLoading(true);
    try {
      const response = await apiRequest(
        '/api/exam/generate',
        { topic, count: 5, difficulty },
        quizResponseSchema,
        { retries: 1 },
      );
      setQuestions(response.questions);
      setCurrentIndex(0);
      setAnswers({});
      setSubmitted(false);
      setResult(null);
      setTimeLeft(timerMinutes * 60);
    } catch (error) {
      console.error(error);
      setRequestError(error instanceof Error ? error.message : 'The exam could not be generated.');
    } finally {
      setLoading(false);
    }
  }

  async function submitExam() {
    if (!questions.length || grading) return;
    setRequestError(null);
    setGrading(true);
    const items = questions.map((question, index) => ({
      question: question.question,
      correct: question.answer,
      answer: answers[index] ?? '',
    }));

    try {
      const resultData = await apiRequest(
        '/api/exam/grade',
        { items },
        examGradeResponseSchema,
      );
      setResult(resultData);
      setSubmitted(true);

      // Persist progress to IDB (and LS mirror) so /progress and analytics update.
      await saveProgressAsync({
        lastTopic: topic,
        lastDifficulty: difficulty,
        lastScore: resultData.score,
        lastTotal: resultData.total,
        lastVerdict: resultData.verdict,
        weakTopics: resultData.weak_topics ?? [],
        lastTakenAt: Date.now(),
      });
    } catch (e) {
      console.error(e);
      setRequestError(e instanceof Error ? e.message : 'The exam could not be graded.');
    } finally {
      setGrading(false);
    }
  }

  const currentQuestion = questions[currentIndex];

  if (submitted && result) {
    return (
      <main className="min-h-dvh px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 text-white sm:px-6 sm:pt-8 md:pb-12 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="mt-8 space-y-4">
            <GlassCard className="p-6">
              <div className="flex items-center gap-3 text-[#8feaf0]">
                <ShieldCheck className="h-6 w-6" />
                <span className="text-xs uppercase tracking-[0.2em]">Exam result</span>
              </div>
              <h2 className="mt-4 text-3xl font-semibold text-white">{result.verdict ?? 'Completed'}</h2>
              {typeof result.score === 'number' && typeof result.total === 'number' ? (
                <p className="mt-2 text-slate-300/80">
                  Score: {result.score}/{result.total}
                </p>
              ) : null}
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/4 p-4 text-slate-200">
                <div className="text-xs uppercase tracking-[0.2em] text-slate-300/70">Weak topics</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(result.weak_topics ?? ['None detected']).map((item) => (
                    <span key={item} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </GlassCard>
            <GlassCard className="divide-y divide-white/10 p-4 sm:p-6">
              <h2 className="mb-4 text-xl text-white">Question review</h2>
              {questions.map((question, index) => (
                <article key={`${index}-${question.question}`} className="space-y-3 py-4">
                  <p className="font-medium text-white">{index + 1}. {question.question}</p>
                  <p className="text-sm text-slate-200">
                    Your answer: {answers[index] || 'Not answered'}
                  </p>
                  <p className="text-sm text-emerald-100">
                    Correct answer: {question.answer}
                  </p>
                  <AIExplanation
                    input={{
                      kind: 'exam question review',
                      question: question.question,
                      options: question.options,
                      correctAnswer: question.answer,
                      userAnswer: answers[index],
                      context: topic,
                      difficulty,
                      lang: 'en',
                    }}
                  />
                </article>
              ))}
            </GlassCard>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-dvh px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 text-white sm:px-6 sm:pt-8 md:pb-12 lg:px-10">
      <div className="mx-auto max-w-6xl">

        <div className="mt-8 grid gap-6 lg:grid-cols-[300px_1fr]">
          <GlassCard className="p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-300/70">Exam</p>
            <label className="mt-4 block">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-300/70">Topic</span>
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                className="glass-input w-full rounded-2xl px-3 py-2.5 text-sm outline-none"
              />
            </label>

            <DifficultyToggle
              value={difficulty}
              onChange={setDifficulty}
              className="mt-4"
            />

            <div className="mt-4">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-300/70">
                Timer
              </span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Exam timer">
                {TIMER_OPTIONS.map((minutes) => {
                  const active = timerMinutes === minutes;
                  return (
                    <button
                      key={minutes}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => pickTimerMinutes(minutes)}
                      className={`rounded-full px-3 py-1.5 text-xs uppercase tracking-[0.18em] transition ${
                        active
                          ? 'border border-[#8feaf0]/50 bg-[#8feaf0]/15 text-[#c9fbff]'
                          : 'border border-white/10 bg-white/5 text-slate-300/80 hover:bg-white/10'
                      }`}
                    >
                      {minutes}m
                    </button>
                  );
                })}
              </div>
            </div>

            <Button onClick={generateExam} variant="primary" className="mt-5 w-full gap-2" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Generate exam
            </Button>
            {requestError ? <ApiErrorNotice message={requestError} onRetry={() => void generateExam()} /> : null}
          </GlassCard>

          <GlassCard className="p-5">
            {!currentQuestion ? (
              <div className="flex min-h-[420px] items-center justify-center text-center text-slate-300/70">
                <div>
                  <Clock3 className="mx-auto mb-3 h-8 w-8 text-[#8feaf0]" />
                  Build an exam and start the timed practice round.
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-slate-300/70">
                  <span>
                    Question {currentIndex + 1}/{questions.length}
                  </span>
                  <span
                    className={`inline-flex items-center gap-2 rounded-full border px-2 py-1 ${
                      timeLeft <= 30
                        ? 'border-red-400/40 bg-red-500/10 text-red-100'
                        : 'border-white/10 bg-white/4 text-slate-100'
                    }`}
                  >
                    <Clock3 className="h-3.5 w-3.5 text-[#8feaf0]" /> {formatTime(Math.max(0, timeLeft))}
                  </span>
                </div>

                <h2 className="text-2xl text-white">{currentQuestion.question}</h2>
                <div className="grid gap-3">
                  {currentQuestion.options.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setAnswers((state) => ({ ...state, [currentIndex]: option }))}
                      className={`rounded-2xl border px-4 py-3 text-left text-sm ${
                        answers[currentIndex] === option
                          ? 'border-[#8feaf0]/60 bg-[#8feaf0]/10 text-white'
                          : 'border-white/10 bg-white/4 text-slate-200 hover:bg-white/8'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button variant="ghost" onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}>
                    Previous
                  </Button>
                  {currentIndex < questions.length - 1 ? (
                    <Button variant="primary" onClick={() => setCurrentIndex((value) => value + 1)}>
                      Next
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={submitExam} disabled={grading}>
                      {grading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {grading ? 'Grading…' : 'Submit exam'}
                    </Button>
                  )}
                </div>
                {requestError ? (
                  <ApiErrorNotice
                    message={requestError}
                    onRetry={() => void (questions.length ? submitExam() : generateExam())}
                  />
                ) : null}
              </div>
            )}
          </GlassCard>
        </div>
      </div>
    </main>
  );
}