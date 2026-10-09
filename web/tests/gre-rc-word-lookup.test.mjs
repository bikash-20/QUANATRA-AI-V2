// Unit tests for the RC word lookup.

import assert from "node:assert/strict";
import test from "node:test";
import { lookupWord, normalizeWord, _setWordLookupForTests, _resetWordLookupForTests } from "../lib/rc/word-lookup.ts";

test("normalizeWord: lowercases and strips surrounding punctuation", () => {
  assert.equal(normalizeWord("Hello"), "hello");
  assert.equal(normalizeWord("\"Hello,\""), "hello");
  assert.equal(normalizeWord("(Hello.)"), "hello");
  assert.equal(normalizeWord("a.m."), "a.m");
  // Unicode letters pass through
  assert.equal(normalizeWord("café"), "café");
});

test("lookupWord: returns null when no words are loaded", () => {
  _resetWordLookupForTests();
  assert.equal(lookupWord("ephemeral"), null);
  assert.equal(lookupWord(""), null);
  assert.equal(lookupWord(123), null);
});

test("lookupWord: matches case-insensitively", () => {
  _setWordLookupForTests([
    { id: "v-1", word: "Ephemeral", pos: "adj", tier: 1, definition: "lasting a short time", synonyms: ["fleeting"], antonyms: ["permanent"], example: "an ephemeral joy" },
  ]);
  assert.equal(lookupWord("ephemeral")?.id, "v-1");
  assert.equal(lookupWord("EPHEMERAL")?.id, "v-1");
  assert.equal(lookupWord("\"ephemeral.\"")?.id, "v-1");
  assert.equal(lookupWord("missing"), null);
});