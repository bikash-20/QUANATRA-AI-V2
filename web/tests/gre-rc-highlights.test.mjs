// Unit tests for the RC highlights sanitizer.

import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeHighlights } from "../lib/rc/highlights.ts";

test("sanitizeHighlights: clamps to body length", () => {
  const out = sanitizeHighlights(
    [{ start: -5, end: 10, color: "yellow" }, { start: 50, end: 200, color: "green" }],
    100
  );
  assert.equal(out.length, 2);
  assert.equal(out[0].start, 0);
  assert.equal(out[0].end, 10);
  assert.equal(out[1].start, 50);
  assert.equal(out[1].end, 100);
});

test("sanitizeHighlights: drops zero-length and inverted ranges", () => {
  const out = sanitizeHighlights(
    [
      { start: 5, end: 5, color: "yellow" },
      { start: 10, end: 5, color: "green" },
    ],
    100
  );
  assert.equal(out.length, 0);
});

test("sanitizeHighlights: drops unknown colors", () => {
  const out = sanitizeHighlights(
    [{ start: 0, end: 10, color: "pink" }],
    100
  );
  assert.equal(out.length, 0);
});

test("sanitizeHighlights: drops overlapping ranges (first wins)", () => {
  const out = sanitizeHighlights(
    [
      { start: 0, end: 20, color: "yellow" },
      { start: 10, end: 30, color: "green" },
      { start: 25, end: 40, color: "yellow" },
    ],
    100
  );
  assert.equal(out.length, 2);
  assert.equal(out[0].start, 0);
  assert.equal(out[0].end, 20);
  assert.equal(out[1].start, 25);
  assert.equal(out[1].end, 40);
});

test("sanitizeHighlights: sorts by start", () => {
  const out = sanitizeHighlights(
    [
      { start: 50, end: 60, color: "green" },
      { start: 10, end: 20, color: "yellow" },
    ],
    100
  );
  assert.equal(out[0].start, 10);
  assert.equal(out[1].start, 50);
});

test("sanitizeHighlights: handles bad input", () => {
  assert.deepEqual(sanitizeHighlights(null, 100), []);
  assert.deepEqual(sanitizeHighlights([{ start: "x", end: 5, color: "yellow" }], 100), []);
});