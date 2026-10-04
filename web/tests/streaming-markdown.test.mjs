import assert from 'node:assert/strict';
import test from 'node:test';
import { stabilizeStreamingMarkdown } from '../lib/streaming-markdown.ts';

test('closes an unfinished fenced code block without changing completed blocks', () => {
  assert.equal(stabilizeStreamingMarkdown('```ts\nconst value = 1'), '```ts\nconst value = 1\n```');
  assert.equal(stabilizeStreamingMarkdown('```ts\nconst value = 1\n```'), '```ts\nconst value = 1\n```');
});

test('closes incomplete inline and display math delimiters', () => {
  assert.equal(stabilizeStreamingMarkdown('Value: $x + 1'), 'Value: $x + 1$');
  assert.equal(stabilizeStreamingMarkdown('Solve \\[x + 1'), 'Solve \\[x + 1\\]');
});

test('does not treat escaped dollar signs as math delimiters', () => {
  assert.equal(stabilizeStreamingMarkdown('Price: \\$10'), 'Price: \\$10');
});
