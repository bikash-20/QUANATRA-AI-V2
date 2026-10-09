// Unit tests for the EVIDENCE trailer parser.

import assert from "node:assert/strict";
import test from "node:test";
import { parseEvidenceFromText } from "../lib/rc/evidence.ts";

test("parseEvidenceFromText: extracts indices from the trailer", () => {
  assert.deepEqual(parseEvidenceFromText("Long explanation.\nEVIDENCE: 3,4\n"), [3, 4]);
  assert.deepEqual(parseEvidenceFromText("EVIDENCE: 0"), [0]);
  assert.deepEqual(parseEvidenceFromText("EVIDENCE: 5, 5, 6"), [5, 6]);
});

test("parseEvidenceFromText: tolerant of case + whitespace", () => {
  assert.deepEqual(parseEvidenceFromText("text\n  evidence:  2 ,  3  \n"), [2, 3]);
});

test("parseEvidenceFromText: returns [] when missing", () => {
  assert.deepEqual(parseEvidenceFromText(""), []);
  assert.deepEqual(parseEvidenceFromText("no trailer here"), []);
  assert.deepEqual(parseEvidenceFromText(null), []);
});

test("parseEvidenceFromText: ignores non-numeric pieces", () => {
  // The trailer regex requires [0-9,\s]+, so "two" disqualifies the
  // whole line and we return [] (the model was asked to keep the
  // trailer numeric anyway).
  assert.deepEqual(parseEvidenceFromText("EVIDENCE: 1, two, 3"), []);
  assert.deepEqual(parseEvidenceFromText("EVIDENCE: 1, 3"), [1, 3]);
});

test("parseEvidenceFromText: drops negative (regex disallows `-`)", () => {
  // The trailer regex only accepts [0-9,\s], so a leading `-` makes
  // the whole line fail to match.
  assert.deepEqual(parseEvidenceFromText("EVIDENCE: -1, 2"), []);
  assert.deepEqual(parseEvidenceFromText("EVIDENCE: 0, 2"), [0, 2]);
});