import { z } from 'zod';

const text = z.string().trim().min(1);

const generatedQuestionSchema = z
  .object({
    question: text,
    options: z.array(text).length(4),
    answer: text.optional(),
    answerIndex: z.number().int().min(0).max(3).optional(),
    explanation: text,
  })
  .transform((question, context) => {
    const answer =
      question.answer ??
      (question.answerIndex === undefined ? undefined : question.options[question.answerIndex]);
    if (!answer || !question.options.includes(answer)) {
      context.addIssue({
        code: 'custom',
        message: 'The correct answer must match one of the provided options',
      });
      return z.NEVER;
    }
    return {
      question: question.question,
      options: question.options,
      answer,
      explanation: question.explanation,
    };
  });

export const quizResponseSchema = z.object({
  questions: z.array(generatedQuestionSchema).min(1),
});

export const flashcardsResponseSchema = z
  .object({
    flashcards: z.array(z.object({ front: text, back: text })).min(1),
  })
  .transform(({ flashcards }) => ({ flashcards }));

export const vocabResponseSchema = z
  .object({
    vocab: z.array(
      z.object({
        word: text,
        meaning: text,
        bangla: text,
        example: text,
      }),
    ).min(1),
  });

export const grammarResponseSchema = z.object({
  grammar: z.object({
    rule: text,
    explanation: text,
    example: text,
    practice: z.array(
      z.object({
        question: text,
        answer: text,
        explanation: text,
      }),
    ),
  }),
});

export const examGradeResponseSchema = z
  .object({
    verdict: z.enum(['Pass', 'Borderline', 'Fail']),
    score: z.number().finite().min(0),
    total: z.number().int().nonnegative(),
    percent: z.number().finite().min(0).max(100).optional(),
    weak_topics: z.array(text).optional(),
    weakTopics: z.array(text).optional(),
    strengths: z.array(text).optional(),
    feedback: text.optional(),
  })
  .transform((result) => ({
    verdict: result.verdict,
    score: result.score,
    total: result.total,
    weak_topics: result.weak_topics ?? result.weakTopics ?? [],
  }));
