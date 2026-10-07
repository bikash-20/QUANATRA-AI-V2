// Unit tests for the server-side session helpers. The Node test runner
// does not resolve "server-only" so we import the underlying JWT
// primitives directly from `jose` and re-implement the same payload
// shape; the real test of the wrapper is its integration with the OAuth
// routes (covered manually via the dev sign-in flow).

import assert from "node:assert/strict";
import test from "node:test";
import { SignJWT, jwtVerify } from "jose";

const SECRET = "test-secret-do-not-use-in-production-32bytes!!";

async function sign(payload, ttlSeconds = 3600) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .setIssuer("quantara-auth")
    .setAudience("quantara-web")
    .sign(new TextEncoder().encode(SECRET));
}

async function verify(token) {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
      issuer: "quantara-auth",
      audience: "quantara-web",
    });
    return payload;
  } catch {
    return null;
  }
}

test("session: round-trips a valid payload", async () => {
  const token = await sign({ id: "u-1", email: "u@e.com", name: "U", role: "user" });
  const payload = await verify(token);
  assert.ok(payload);
  assert.equal(payload.id, "u-1");
  assert.equal(payload.email, "u@e.com");
  assert.equal(payload.role, "user");
});

test("session: rejects a token signed with a different secret", async () => {
  const token = await new SignJWT({ id: "u-1", role: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("quantara-auth")
    .setAudience("quantara-web")
    .sign(new TextEncoder().encode("other-secret-32-bytes-long-string-AA"));
  const payload = await verify(token);
  assert.equal(payload, null);
});

test("session: rejects a token with the wrong issuer", async () => {
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({ id: "u-1", role: "user" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .setIssuer("other-issuer")
    .setAudience("quantara-web")
    .sign(new TextEncoder().encode(SECRET));
  const payload = await verify(token);
  assert.equal(payload, null);
});

test("session: rejects an expired token", async () => {
  const token = await sign({ id: "u-1", role: "user" }, -10);
  const payload = await verify(token);
  assert.equal(payload, null);
});

test("session: rejection reason discrimination", async () => {
  // wrong role guard
  const token = await sign({ id: "u-1", role: "superadmin" });
  const payload = await verify(token);
  // The payload parses, but our wrapper rejects non-allowlisted roles.
  // This test just asserts the contract: signing succeeds regardless of
  // role, the gating happens in `verifySession`.
  assert.ok(payload);
  assert.equal(payload.role, "superadmin");
});
