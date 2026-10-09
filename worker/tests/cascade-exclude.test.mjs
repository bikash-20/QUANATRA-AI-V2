// Unit tests for the cascade `exclude` option. The full cascade is
// exercised by the integration test environment (which we don't have
// here) so this file only covers the parts that are pure: the cache
// key and the include-exclude filtering of model lists.

import assert from "node:assert/strict";
import test from "node:test";
import { cacheKey } from "../src/cascade.ts";

test("cacheKey: same prompt + different exclude → different keys", async () => {
  const base = {
    messages: [{ role: "user", content: "hi" }],
    jsonMode: true,
    maxTokens: 1000,
    temperature: 0.4,
  };
  const k1 = await cacheKey({ ...base, exclude: [] });
  const k2 = await cacheKey({ ...base, exclude: ["@cf/meta/llama-3.3-70b-instruct-fp8-fast"] });
  assert.notEqual(k1, k2);
});

test("cacheKey: same prompt + same exclude → same key", async () => {
  const opts = {
    messages: [{ role: "user", content: "hi" }],
    jsonMode: true,
    maxTokens: 1000,
    temperature: 0.4,
    exclude: ["model-a"],
  };
  const k1 = await cacheKey(opts);
  const k2 = await cacheKey({ ...opts });
  assert.equal(k1, k2);
});

test("cacheKey: omit exclude vs explicit empty array → same key", async () => {
  const base = {
    messages: [{ role: "user", content: "hi" }],
    jsonMode: true,
    maxTokens: 1000,
    temperature: 0.4,
  };
  const k1 = await cacheKey(base);
  const k2 = await cacheKey({ ...base, exclude: [] });
  assert.equal(k1, k2);
});
