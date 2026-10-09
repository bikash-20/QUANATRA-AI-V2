// Unit tests for the mock preset validator + getter.

import assert from "node:assert/strict";
import test from "node:test";
import { MOCK_PRESETS, DEFAULT_MOCK_PRESET_ID, getMockPreset, validateMockPreset } from "../content/gre/rc/mock-config.ts";

test("MOCK_PRESETS has at least the default preset", () => {
  assert.ok(MOCK_PRESETS.length >= 1, "MOCK_PRESETS should not be empty");
  assert.equal(typeof DEFAULT_MOCK_PRESET_ID, "string");
  assert.ok(MOCK_PRESETS.some((p) => p.id === DEFAULT_MOCK_PRESET_ID));
});

test("validateMockPreset: every shipped preset is consistent", () => {
  for (const p of MOCK_PRESETS) validateMockPreset(p); // throws on inconsistency
});

test("validateMockPreset: rejects mismatched questionsPerPassage.length vs passages", () => {
  const p = MOCK_PRESETS[0];
  assert.throws(
    () => validateMockPreset({ ...p, questionsPerPassage: p.questionsPerPassage.slice(0, -1) }),
    /questionsPerPassage length/i,
  );
});

test("validateMockPreset: rejects questionsPerPassage sum != totalQuestions", () => {
  const p = MOCK_PRESETS[0];
  assert.throws(
    () => validateMockPreset({ ...p, questionsPerPassage: p.questionsPerPassage.map((n) => n + 1) }),
    /sum.*totalQuestions/i,
  );
});

test("validateMockPreset: rejects byDifficulty sum != totalQuestions", () => {
  const p = MOCK_PRESETS[0];
  assert.throws(
    () => validateMockPreset({ ...p, byDifficulty: { ...p.byDifficulty, easy: p.byDifficulty.easy + 1 } }),
    /byDifficulty sum/i,
  );
});

test("validateMockPreset: rejects non-positive durationSec", () => {
  const p = MOCK_PRESETS[0];
  assert.throws(() => validateMockPreset({ ...p, durationSec: 0 }), /durationSec/);
  assert.throws(() => validateMockPreset({ ...p, durationSec: -10 }), /durationSec/);
});

test("validateMockPreset: rejects missing id or label", () => {
  const p = MOCK_PRESETS[0];
  assert.throws(() => validateMockPreset({ ...p, id: "" }), /id and label/);
  assert.throws(() => validateMockPreset({ ...p, label: "" }), /id and label/);
});

test("validateMockPreset: rejects unknown difficultyRamp", () => {
  const p = MOCK_PRESETS[0];
  assert.throws(
    () => validateMockPreset({ ...p, difficultyRamp: "wibble" }),
    /difficultyRamp/,
  );
});

test("getMockPreset: returns the requested preset", () => {
  const p = getMockPreset(MOCK_PRESETS[0].id);
  assert.equal(p.id, MOCK_PRESETS[0].id);
});

test("getMockPreset: falls back to the first preset for unknown ids", () => {
  const p = getMockPreset("definitely-not-a-real-preset");
  assert.equal(p.id, MOCK_PRESETS[0].id);
});
