export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type Difficulty = 'easy' | 'medium' | 'hard';

export type RequestBody = Record<string, unknown>;

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787';

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
  opts: { retries?: number; signal?: AbortSignal } = {},
): Promise<T> {
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
        const msg =
          typeof payload === 'object' && payload && 'error' in payload
            ? String((payload as { error?: string }).error)
            : `Request failed with status ${response.status}`;
        throw new ApiError(msg, response.status);
      }

      return payload as T;
    } catch (e) {
      lastErr = e;
      // Retry on transient failures (5xx, 429, network). Don't retry 4xx.
      const status = (e as ApiError)?.status ?? 0;
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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (!trimmed.startsWith('data:')) continue;

      const raw = trimmed.slice(5).trim();
      if (!raw || raw === '[DONE]') continue;

      try {
        const parsed = JSON.parse(raw) as { response?: string; content?: string };
        const chunk = parsed.response ?? parsed.content ?? '';
        if (chunk) {
          output += chunk;
          onChunk(chunk);
        }
      } catch {
        if (raw.startsWith('{') || raw.startsWith('[')) {
          continue;
        }
        output += raw;
        onChunk(raw);
      }
    }
  }

  return output;
}
