// Initiates the Google OAuth flow. Generates a CSRF state, stores it in a
// short-lived HttpOnly cookie, and redirects the user-agent to Google's
// consent screen.
//
// GET /api/auth/google?return_to=/chat
//
// Required env:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_REDIRECT_URI,
//   SESSION_SECRET, AUTH_ALLOWED_ORIGINS (optional)

import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthConfig } from "@/lib/server-env";
import { buildStateCookie } from "@/lib/server-session";

// Pin to Node + dynamic so Vercel does not statically optimize or hand
// the handler to the edge cache (both would risk stripping Set-Cookie or
// returning a stale redirect).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = ["openid", "email", "profile"];

// TEMP: state-cookie diagnostic — remove after the production
// `state_mismatch` is resolved. Hashes the cookie value with SHA-256
// and logs only the first 10 hex chars; never the raw value.
function shortHash(value: string | undefined): string {
  if (!value) return "<none>";
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function isSafeReturnPath(value: string | null): value is string {
  if (!value) return false;
  return value.startsWith("/") && !value.startsWith("//");
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  let config;
  try {
    config = getAuthConfig();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Auth not configured" },
      { status: 500 },
    );
  }

  const returnTo = isSafeReturnPath(request.nextUrl.searchParams.get("return_to"))
    ? (request.nextUrl.searchParams.get("return_to") as string)
    : "/chat";

  const state = randomBytes(24).toString("hex");
  const nonce = randomBytes(16).toString("hex");
  // base64url uses only [A-Za-z0-9_-]; browsers do not re-percent-encode or
  // decode these characters, so the value stored in the
  // `quantara.oauth-state` cookie and the value Google echoes back in the
  // `state=` query parameter remain byte-for-byte identical regardless of
  // browser cookie-value normalization quirks.
  const returnToB64 = Buffer.from(returnTo, "utf8").toString("base64url");
  const statePayload = `${state}.${nonce}.${returnToB64}`;

  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", config.googleClientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", statePayload);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");

  const response = NextResponse.redirect(url, { status: 302 });
  const isProduction = process.env.NODE_ENV === "production";
  response.headers.append(
    "Set-Cookie",
    buildStateCookie(statePayload, 600, isProduction),
  );

  // TEMP: log the cookie we're about to send so we can correlate with the
  // callback log on Vercel. Raw cookie value is never logged.
  console.info(
    "[auth/google] state=%s hash=%s returnTo=%s secure=%s path=%s maxAge=%d",
    statePayload.slice(0, 16),
    shortHash(statePayload),
    returnTo,
    isProduction ? "yes" : "no",
    "/",
    600,
  );

  return response;
}
