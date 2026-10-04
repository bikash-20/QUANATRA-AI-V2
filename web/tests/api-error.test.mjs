import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';

process.env.NEXT_PUBLIC_API_URL = 'https://worker.test';
const { apiRequest } = await import('../lib/api.ts');

test('API 404 explains that the configured Worker is missing the route', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: 'Not found' }),
    { status: 404, headers: { 'Content-Type': 'application/json' } },
  );

  try {
    await assert.rejects(
      apiRequest('/api/explain', {}, z.object({ explanation: z.string() }), { retries: 0 }),
      /configured API service does not provide \/api\/explain/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
