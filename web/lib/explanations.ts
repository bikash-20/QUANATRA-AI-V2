import { dbGet, dbPut } from '@/lib/db';
import { apiRequest, type Difficulty } from '@/lib/api';
import { explanationInputSchema, parseExplanationResponse } from '@/lib/explanation-schema';

export type ExplanationInput = {
  kind: string;
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

async function cacheKey(input: ExplanationInput): Promise<string> {
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

  const response: unknown = await apiRequest<unknown>('/api/explain', validatedInput, { signal });
  const explanation = parseExplanationResponse(response);
  await dbPut<CachedExplanation>('explanations', {
    id,
    explanation,
  });
  return explanation;
}
