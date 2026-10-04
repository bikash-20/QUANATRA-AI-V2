import assert from 'node:assert/strict';
import test from 'node:test';
import { corsHeaders } from '../src/cors.ts';

const env = {
  ALLOWED_ORIGIN: 'https://quantara-web-sooty.vercel.app',
  ALLOWED_ORIGINS: 'https://preview.quantara.example',
};

test('allows the configured production origin', () => {
  const headers = corsHeaders(
    new Request('https://worker.example/health', {
      headers: { Origin: 'https://quantara-web-sooty.vercel.app' },
    }),
    env,
  );

  assert.equal(headers.get('Access-Control-Allow-Origin'), 'https://quantara-web-sooty.vercel.app');
});

test('allows local development origins without weakening other origins', () => {
  const local = corsHeaders(
    new Request('http://localhost:3100/api/explain', {
      headers: { Origin: 'http://localhost:3100' },
    }),
    env,
  );
  const untrusted = corsHeaders(
    new Request('https://worker.example/api/explain', {
      headers: { Origin: 'https://attacker.example' },
    }),
    env,
  );
  const localOriginOnProductionWorker = corsHeaders(
    new Request('https://worker.example/api/explain', {
      headers: { Origin: 'http://localhost:3100' },
    }),
    env,
  );

  assert.equal(local.get('Access-Control-Allow-Origin'), 'http://localhost:3100');
  assert.equal(untrusted.has('Access-Control-Allow-Origin'), false);
  assert.equal(localOriginOnProductionWorker.has('Access-Control-Allow-Origin'), false);
});

test('supports additional exact origins from ALLOWED_ORIGINS', () => {
  const headers = corsHeaders(
    new Request('https://worker.example/health', {
      headers: { Origin: 'https://preview.quantara.example' },
    }),
    env,
  );

  assert.equal(headers.get('Access-Control-Allow-Origin'), 'https://preview.quantara.example');
});
