import { dbGet, dbPut } from '@/lib/db';
import { apiRequest, type Difficulty } from '@/lib/api';
import {
  explanationInputSchema,
  explanationResponseSchema,
  parseExplanationResponse,
} from '@/lib/explanation-schema';

export type ExplanationInput = {
  kind: string;
  /** Question id when known (e.g. "gre-quant" passes this). The client
   *  cache key for gre-quant uses this together with userAnswer + lang. */
  questionId?: string;
  question: string;
  options?: string[];
  correctAnswer?: string;
  userAnswer?: string;
  context?: string;
  difficulty: Difficulty;
  lang: 'en' | 'bn';
};

type CachedExplanation = {
  id: string;
  explanation: string;
};

async function sha256(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function cacheKey(input: ExplanationInput): Promise<string> {
  // Per spec, the cache key for gre-quant and gre-reading is questionId +
  // userAnswer + lang. Other kinds keep the full-payload key so behavior
  // is unchanged.
  if (input.kind === 'gre-quant' && input.questionId) {
    return `explain:gre-quant:${await sha256(`${input.questionId}|${input.userAnswer ?? ''}|${input.lang}`)}`;
  }
  if (input.kind === 'gre-reading' && input.questionId) {
    return `explain:gre-reading:${await sha256(`${input.questionId}|${input.userAnswer ?? ''}|${input.lang}`)}`;
  }
  const bytes = new TextEncoder().encode(JSON.stringify(input));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `explain:${hex}`;
}

export async function getExplanation(input: ExplanationInput, signal?: AbortSignal): Promise<string> {
  const validatedInput = explanationInputSchema.parse(input);
  const id = await cacheKey(validatedInput);
  const cached = await dbGet<CachedExplanation>('explanations', id);
  if (cached && typeof cached.explanation === 'string') return cached.explanation;

  // questionId is client-only and used to scope the cache key — strip it
  // before sending to the worker.
  const { questionId: _questionId, ...payload } = validatedInput;
  void _questionId;
  const response = await apiRequest(
    '/api/explain',
    payload,
    explanationResponseSchema,
    { signal },
  );
  const explanation = parseExplanationResponse(response);
  await dbPut<CachedExplanation>('explanations', {
    id,
    explanation,
  });
  return explanation;
}
