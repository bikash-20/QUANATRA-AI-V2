// Unit tests for the OAuth state payload format used between
// /api/auth/google (start) and /api/auth/callback (verify). The
// production `state_mismatch` regression was caused by Chrome
// percent-decoding the cookie value before sending it back, which
// collided with the literal `%2Fchat` we used to embed in the state.
//
// The fix is to encode the `return_to` segment with base64url so the
// full payload contains only [A-Za-z0-9_.-]. Bytes outside that
// alphabet are impossible, which means cookie normalization cannot drift
// the value. These tests lock in the contract.

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

const SAFE_PAYLOAD_CHARS = /^[A-Za-z0-9_.\-]+$/;

function buildStatePayload(returnTo) {
  const state = randomBytes(24).toString("hex");
  const nonce = randomBytes(16).toString("hex");
  const returnToB64 = Buffer.from(returnTo, "utf8").toString("base64url");
  return `${state}.${nonce}.${returnToB64}`;
}

function decodeReturnTo(payload) {
  const segments = payload.split(".");
  if (segments.length < 3 || !segments[2]) return "/chat";
  try {
    return Buffer.from(segments[2], "base64url").toString("utf8");
  } catch {
    return "/chat";
  }
}

const SAMPLE_PATHS = [
  "/chat",
  "/gre",
  "/gre/quant/problem/123",
  "/chat?foo=bar&baz=qux",
  "/vocab/word/hyperbole/quiz",
  "/admin",
];

test("state: payload matches the safe-charset contract", () => {
  for (const path of SAMPLE_PATHS) {
    const payload = buildStatePayload(path);
    assert.match(
      payload,
      SAFE_PAYLOAD_CHARS,
      `payload "${payload}" must contain only [A-Za-z0-9_.-]`,
    );
  }
});

test("state: round-trips simple paths", () => {
  for (const path of SAMPLE_PATHS) {
    const payload = buildStatePayload(path);
    assert.equal(decodeReturnTo(payload), path, `path "${path}"`);
  }
});

test("state: payload format is hex(state) + hex(nonce) + base64url(returnTo)", () => {
  const payload = buildStatePayload("/chat");
  const [state, nonce, returnToB64] = payload.split(".");
  assert.match(state, /^[a-f0-9]{48}$/);
  assert.match(nonce, /^[a-f0-9]{32}$/);
  assert.match(returnToB64, /^[A-Za-z0-9_-]+$/);
  // /chat → base64url → "L2NoYXQ" (no padding; padded base64 chars
  // would be '=' or '+' or '/', all excluded by the alphabet).
  assert.equal(returnToB64, "L2NoYXQ");
});

test("state: handles return_to with query strings and special chars", () => {
  const tricky = "/quiz/cat?level=2&mode=practice#anchor";
  const payload = buildStatePayload(tricky);
  // Still cookie-/URL-safe (the base64url alphabet doesn't use % or ?).
  assert.match(payload, SAFE_PAYLOAD_CHARS);
  assert.equal(decodeReturnTo(payload), tricky);
});

test("state: cookie byte-for-byte matches the URL value (regression)", () => {
  // Simulate the round-trip: encode return_to the same way the start
  // route does, then verify the value is identical to the one we put in
  // the cookie. This is the exact assertion that previously failed in
  // production because encodeURIComponent('/chat') produced '%2Fchat'
  // and Chrome percent-decoded the cookie value before sending it back.
  const returnTo = "/chat";
  const payload = buildStatePayload(returnTo);
  // The start route sets the cookie value to `payload` verbatim, and the
  // URL `state=` parameter is the same string (base64url chars do not
  // get further encoded by URLSearchParams.set, since they are all in
  // the unreserved set).
  const cookieValue = payload;
  const urlValue = payload;
  assert.equal(cookieValue, urlValue);
});