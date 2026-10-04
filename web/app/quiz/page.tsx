'use client';

import { useMemo, useState } from 'react';
import { Check, CheckCircle2, CircleDashed, Loader2, RefreshCcw, TimerReset, X } from 'lucide-react';
import { GlassCard } from '@/components/glass-card';
import { Button } from '@/components/button';
import { DifficultyToggle } from '@/components/difficulty-toggle';
import { apiRequest, type Difficulty } from '@/lib/api';
import { quizResponseSchema } from '@/lib/api-schemas';
import { AIExplanation } from '@/components/ai-explanation';
import { getAnswerState } from '@/lib/quiz-answer';

type McqQuestion = {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
};

type PassageQuestion = {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
};

export default function QuizPage() {
  const [mode, setMode] = useState<'mcq' | 'passage'>('mcq');
  const [topic, setTopic] = useState('Binary trees');
  const [count, setCount] = useState(3);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [passage, setPassage] = useState('A binary tree is a hierarchical data structure where each node has at most two children. In-order traversal visits the left subtree, root, and then the right subtree.');
  const [questions, setQuestions] = useState<Array<McqQuestion | PassageQuestion>>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [loading, setLoading] = useState(false);

  const currentQuestion = questions[currentIndex];

  const progress = useMemo(() => {
    if (!questions.length) return 0;
    return ((currentIndex + 1) / questions.length) * 100;
  }, [currentIndex, questions.length]);

  async function generateQuiz() {
    setLoading(true);
    try {
      const payload =
        mode === 'mcq'
          ? await apiRequest('/api/quiz/mcq', {
              topic,
              count,
              difficulty,
            }, quizResponseSchema)
          : await apiRequest('/api/quiz/passage', {
              text: passage,
              count,
              difficulty,
            }, quizResponseSchema);

      const items = payload.questions ?? [];
      setQuestions(items);
      setCurrentIndex(0);
      setSelected(null);
      setScore(0);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  function submitAnswer(option: string) {
    if (!currentQuestion || selected) return;
    setSelected(option);
    if (option === currentQuestion.answer) {
      setScore((value) => value + 1);
    }
  }

  function nextQuestion() {
    if (currentIndex >= questions.length - 1) {
      setCurrentIndex(questions.length);
      return;
    }
    setCurrentIndex((value) => value + 1);
    setSelected(null);
  }

  const isFinished = currentIndex >= questions.length;
  const total = questions.length;

  return (
    <main className="min-h-dvh px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-5 text-white sm:px-6 sm:pt-8 md:pb-12 lg:px-10">
      <div className="mx-auto max-w-6xl">

        <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr]">
          <GlassCard className="p-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-300/70">Quiz Builder</p>
            <div className="mt-4 flex gap-2 rounded-full border border-white/10 bg-white/4 p-1">
              {(['mcq', 'passage'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setMode(type)}
                  className={`flex-1 rounded-full px-3 py-2 text-xs uppercase tracking-[0.18em] ${
                    mode === type ? 'bg-white/10 text-white' : 'text-slate-300'
                  }`}
                >
                  {type === 'mcq' ? 'MCQ' : 'Passage'}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-300/70">Topic</span>
                <input
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  className="glass-input w-full rounded-2xl px-3 py-2.5 text-sm outline-none"
                />
              </label>

              {mode === 'passage' ? (
                <label className="block">
                  <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-300/70">Passage</span>
                  <textarea
                    rows={5}
                    value={passage}
                    onChange={(event) => setPassage(event.target.value)}
                    className="glass-input w-full resize-none rounded-2xl px-3 py-2.5 text-sm outline-none"
                  />
                </label>
              ) : null}

              <DifficultyToggle
                value={difficulty}
                onChange={setDifficulty}
                label={`Difficulty (${mode === 'passage' ? 'affects inference depth' : 'controls distractor quality'})`}
              />

              <label className="block">
                <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-300/70">Count</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value) || 1)}
                  className="glass-input w-full rounded-2xl px-3 py-2.5 text-sm outline-none"
                />
              </label>

              <Button onClick={generateQuiz} className="w-full gap-2" variant="primary">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                Generate quiz
              </Button>
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            {!questions.length ? (
              <div className="flex h-full min-h-[480px] items-center justify-center text-center text-slate-300/80">
                <div>
                  <CircleDashed className="mx-auto mb-3 h-8 w-8 text-[#8feaf0]" />
                  Choose a topic and generate your first quiz set.
                </div>
              </div>
            ) : isFinished ? (
              <div className="flex h-full min-h-[480px] items-center justify-center">
                <div className="text-center">
                  <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-[#8feaf0]" />
                  <h2 className="text-3xl font-semibold text-white">Score: {score}/{total}</h2>
                  <p className="mt-2 text-slate-300/80">You answered {Math.round((score / total) * 100)}% correctly.</p>
                </div>
              </div>
            ) : currentQuestion ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-300/70">
                  <span>
                    Question {currentIndex + 1}/{total}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/4 px-2 py-1">
                    <TimerReset className="h-3.5 w-3.5 text-[#8feaf0]" /> {Math.round(progress)}%
                  </span>
                </div>

                <div className="h-2.5 rounded-full bg-white/8">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,#59c4df,#a4e3f2)]" style={{ width: `${progress}%` }} />
                </div>

                <h2 className="text-2xl leading-relaxed text-white">{currentQuestion.question}</h2>

                <div className="grid gap-3">
                  {currentQuestion.options.map((option) => {
                    const answerState = getAnswerState(option, currentQuestion.answer, selected);
                    const showCorrect = answerState === 'correct';
                    const showWrong = answerState === 'incorrect';

                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => submitAnswer(option)}
                        disabled={selected !== null}
                        className={[
                          'flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition',
                          showCorrect
                            ? 'answer-option-correct'
                            : showWrong
                              ? 'answer-option-wrong'
                              : selected === option
                                ? 'border-[#8feaf0]/60 bg-[#8feaf0]/10 text-white'
                                : 'border-white/10 bg-white/4 text-slate-200 hover:bg-white/8',
                        ].join(' ')}
                      >
                        {showCorrect ? <Check aria-hidden="true" size={17} /> : null}
                        {showWrong ? <X aria-hidden="true" size={17} /> : null}
                        {option}
                      </button>
                    );
                  })}
                </div>

                <p aria-live="polite" className="sr-only">
                  {selected === null
                    ? ''
                    : selected === currentQuestion.answer
                      ? 'Correct answer.'
                      : `Incorrect. The correct answer is ${currentQuestion.answer}.`}
                </p>

                <AIExplanation
                  input={{
                    kind: mode === 'passage' ? 'passage quiz question' : 'multiple-choice question',
                    question: currentQuestion.question,
                    options: currentQuestion.options,
                    correctAnswer: currentQuestion.answer,
                    userAnswer: selected ?? undefined,
                    context: mode === 'passage' ? passage : topic,
                    difficulty,
                    lang: 'en',
                  }}
                  disabled={selected === null}
                />

                {selected !== null && (
                  <Button onClick={nextQuestion} variant="primary" className="px-5 py-3">
                    {currentIndex === questions.length - 1 ? 'Finish quiz' : 'Next question'}
                  </Button>
                )}
              </div>
            ) : null}
          </GlassCard>
        </div>
      </div>
    </main>
  );
}
