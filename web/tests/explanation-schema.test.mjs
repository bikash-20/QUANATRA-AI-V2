import assert from 'node:assert/strict';
import test from 'node:test';
import { parseExplanationResponse } from '../lib/explanation-schema.ts';

test('accepts a valid explanation response', () => {
  assert.equal(parseExplanationResponse({ explanation: 'A concise explanation.' }), 'A concise explanation.');
});

test('rejects malformed explanation responses', () => {
  assert.throws(() => parseExplanationResponse({ explanation: 42 }));
  assert.throws(() => parseExplanationResponse({ explanation: '' }));
  assert.throws(() => parseExplanationResponse(null));
});
