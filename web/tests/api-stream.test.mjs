import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_API_URL = 'https://worker.example.test';
const { streamChat } = await import('../lib/api.ts');

test('streamChat consumes an event whose final line has no newline', async () => {
  const encoder = new TextEncoder();
  globalThis.fetch = async () => new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"response":"final chunk"}'));
        controller.close();
      },
    }),
  );

  const chunks = [];
  const output = await streamChat({ messages: [{ role: 'user', content: 'hello' }] }, (chunk) => {
    chunks.push(chunk);
  });

  assert.equal(output, 'final chunk');
  assert.deepEqual(chunks, ['final chunk']);
});

test('streamChat decodes split UTF-8 events and ignores the done marker', async () => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode('data: {"response":"বাংলা"}\r\ndata: [DONE]');
  globalThis.fetch = async () => new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 17));
        controller.enqueue(bytes.slice(17));
        controller.close();
      },
    }),
  );

  const chunks = [];
  const output = await streamChat({ messages: [{ role: 'user', content: 'hello' }] }, (chunk) => {
    chunks.push(chunk);
  });

  assert.equal(output, 'বাংলা');
  assert.deepEqual(chunks, ['বাংলা']);
});
