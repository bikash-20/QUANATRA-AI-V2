import type { ZodType } from 'zod';

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type Difficulty = 'easy' | 'medium' | 'hard';

export type RequestBody = Record<string, unknown>;

export const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ??
  (process.env.NODE_ENV === 'development' ? 'http://localhost:8787' : '')
).replace(/\/+$/, '');

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiRequest<T>(
  path: string,
  body: RequestBody = {},
  schema: ZodType<T>,
  opts: { retries?: number; signal?: AbortSignal } = {},
): Promise<T> {
  if (!API_URL) {
    throw new ApiError('API URL is not configured. Set NEXT_PUBLIC_API_URL.', 0);
  }
  const retries = opts.retries ?? 1;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: opts.signal,
      });

      const text = await response.text();
      let payload: unknown = null;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        throw new ApiError(text || 'Request failed', response.status);
      }

      if (!response.ok) {
        if (response.status === 404) {
          throw new ApiError(
            `The configured API service does not provide ${path}. Update or deploy the Worker with this endpoint.`,
            404,
          );
        }
        const msg =
          typeof payload === 'object' && payload && 'error' in payload
            ? String((payload as { error?: string }).error)
            : `Request failed with status ${response.status}`;
        throw new ApiError(msg, response.status);
      }

      const result = schema.safeParse(payload);
      if (!result.success) {
        const detail = result.error.issues[0]?.message ?? 'Response did not match the expected schema';
        throw new ApiError(`Invalid API response: ${detail}`, 502);
      }
      return result.data;
    } catch (e) {
      lastErr = e;
      // Retry on transient failures (5xx, 429, network). Don't retry 4xx.
      const status = e instanceof ApiError ? e.status : 0;
      if (e instanceof Error && e.name === 'AbortError') break;
      const retriable = status === 0 || status >= 500 || status === 429;
      if (!retriable || attempt === retries) break;
      // small exponential backoff
      await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Request failed');
}

export async function streamChat(
  payload: { messages: ChatMessage[]; subject?: string; lang?: 'en' | 'bn'; difficulty?: Difficulty },
  onChunk: (chunk: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (!API_URL) {
    throw new ApiError('API URL is not configured. Set NEXT_PUBLIC_API_URL.', 0);
  }
  const response = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || 'Unable to reach the tutor');
  }

  if (!response.body) {
    throw new Error('No response stream received');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';

  function consumeLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith('data:')) return;

    const raw = trimmed.slice(5).trim();
    if (!raw || raw === '[DONE]') return;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return;
      const candidate = parsed as { response?: unknown; content?: unknown };
      const chunk =
        typeof candidate.response === 'string'
          ? candidate.response
          : typeof candidate.content === 'string'
            ? candidate.content
            : '';
      if (!chunk) return;
      output += chunk;
      onChunk(chunk);
    } catch {
      if (raw.startsWith('{') || raw.startsWith('[')) return;
      output += raw;
      onChunk(raw);
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      if (buffer) consumeLine(buffer);
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) consumeLine(line);
  }

  return output;
}
