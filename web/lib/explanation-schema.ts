import { z } from 'zod';

export const explanationResponseSchema = z.object({
  explanation: z.string().min(1).max(12000),
});

export const explanationInputSchema = z.object({
  kind: z.string().min(1).max(40),
  /** Optional client-only id; used to narrow the cache key for gre-quant. */
  questionId: z.string().max(80).optional(),
  question: z.string().min(1).max(4000),
  options: z.array(z.string().min(1).max(1000)).min(1).max(12).optional(),
  correctAnswer: z.string().max(2000).optional(),
  userAnswer: z.string().max(2000).optional(),
  context: z.string().max(8000).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  lang: z.enum(['en', 'bn']),
});

export function parseExplanationResponse(value: unknown): string {
  return explanationResponseSchema.parse(value).explanation;
}
