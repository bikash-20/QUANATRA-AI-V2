// Handles the Google OAuth callback. Verifies the CSRF state, exchanges
// the authorization code for tokens, fetches the user's profile, mints a
// signed session cookie, and redirects to the original destination.

import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { getAuthConfig } from "@/lib/server-env";
import {
  buildExpiredStateCookie,
  buildSessionCookie,
  signSession,
  verifySession,
} from "@/lib/server-session";

// Pin to Node + dynamic so Vercel does not statically optimize or hand
// the handler to the edge cache; on the edge, request.cookies can be
// empty even when the browser sent the cookie, which surfaces as a
// false `state_mismatch`.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GoogleTokenResponse = {
  access_token?: string;
  id_token?: string;
};

type GoogleUserInfo = {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

function isSafeReturnPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

function safeOrigin(request: NextRequest): URL {
  // Use the request URL (host header) for relative redirects. AUTH_REDIRECT_URI
  // is validated to be on the same host during the Google exchange, so the
  // browser can only land on this handler through the configured domain.
  return new URL(request.url);
}

// TEMP: state-cookie diagnostic — remove after the production
// `state_mismatch` is resolved.
function shortHash(value: string | undefined): string {
  if (!value) return "<none>";
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

/**
 * Pull the raw `state` value from the query string without going through
 * `URLSearchParams.get()`. The latter URL-decodes the value, which would
 * break byte-for-byte equality with the cookie (which is stored as the
 * raw `statePayload`). The browser re-encodes the value as
 * `key=<percentEncoded>` when it issues the redirect; we decode it the
 * same way.
 */
function readRawState(search: string): string | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  for (const pair of raw.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq < 0) {
      if (pair === "state") return "";
      continue;
    }
    const key = pair.slice(0, eq);
    if (key !== "state") continue;
    const encoded = pair.slice(eq + 1);
    try {
      return decodeURIComponent(encoded.replace(/\+/g, " "));
    } catch {
      return encoded;
    }
  }
  return null;
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

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = readRawState(url.search);
  const errorParam = url.searchParams.get("error");

  const origin = safeOrigin(request);
  const loginUrl = new URL("/login", origin);
  const stateCookie = request.cookies.get(config.stateCookieName)?.value;

  // TEMP: state-cookie diagnostic — remove after production is fixed.
  console.info(
    "[auth/callback] cookie=%s cookieHash=%s state=%s stateHash=%s equal=%s code=%s reqUrl=%s search=%s",
    stateCookie ? "yes" : "no",
    shortHash(stateCookie),
    state ? state.slice(0, 16) : "<none>",
    shortHash(state ?? undefined),
    state && stateCookie && state === stateCookie ? "yes" : "no",
    code ? "yes" : "no",
    request.url,
    url.search,
  );

  if (errorParam) {
    loginUrl.searchParams.set("error", errorParam);
    const response = NextResponse.redirect(loginUrl, { status: 302 });
    response.headers.append(
      "Set-Cookie",
      buildExpiredStateCookie(process.env.NODE_ENV === "production"),
    );
    return response;
  }

  if (!code || !state || !stateCookie || state !== stateCookie) {
    loginUrl.searchParams.set("error", "state_mismatch");
    const response = NextResponse.redirect(loginUrl, { status: 302 });
    response.headers.append(
      "Set-Cookie",
      buildExpiredStateCookie(process.env.NODE_ENV === "production"),
    );
    return response;
  }

  // Decode the destination from the state payload (third segment). The
  // segment is base64url-encoded by the start route so the payload only
  // contains cookie- and URL-safe characters; we invert that here.
  const segments = state.split(".");
  const returnTo = (() => {
    if (segments.length < 3 || !segments[2]) return "/chat";
    try {
      const decoded = Buffer.from(segments[2], "base64url").toString("utf8");
      return isSafeReturnPath(decoded) ? decoded : "/chat";
    } catch {
      return "/chat";
    }
  })();

  const client = new OAuth2Client(config.googleClientId, config.googleClientSecret, config.redirectUri);
  let tokens: GoogleTokenResponse;
  try {
    const res = await client.getToken({ code, redirect_uri: config.redirectUri });
    tokens = {
      access_token: res.tokens.access_token ?? undefined,
      id_token: res.tokens.id_token ?? undefined,
    };
  } catch (error) {
    loginUrl.searchParams.set("error", "exchange_failed");
    if (process.env.NODE_ENV !== "production") {
      loginUrl.searchParams.set("detail", error instanceof Error ? error.message : "exchange");
    }
    const response = NextResponse.redirect(loginUrl, { status: 302 });
    response.headers.append(
      "Set-Cookie",
      buildExpiredStateCookie(process.env.NODE_ENV === "production"),
    );
    return response;
  }

  if (!tokens.access_token) {
    loginUrl.searchParams.set("error", "no_access_token");
    const response = NextResponse.redirect(loginUrl, { status: 302 });
    response.headers.append(
      "Set-Cookie",
      buildExpiredStateCookie(process.env.NODE_ENV === "production"),
    );
    return response;
  }

  // Fetch the user profile. We could trust the id_token, but a small HTTP
  // call to the userinfo endpoint keeps things simple and authoritative.
  let profile: GoogleUserInfo;
  try {
    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`userinfo ${res.status}`);
    }
    profile = (await res.json()) as GoogleUserInfo;
  } catch (error) {
    loginUrl.searchParams.set("error", "profile_failed");
    if (process.env.NODE_ENV !== "production") {
      loginUrl.searchParams.set("detail", error instanceof Error ? error.message : "profile");
    }
    const response = NextResponse.redirect(loginUrl, { status: 302 });
    response.headers.append(
      "Set-Cookie",
      buildExpiredStateCookie(process.env.NODE_ENV === "production"),
    );
    return response;
  }

  if (!profile.email || profile.email_verified === false) {
    loginUrl.searchParams.set("error", "email_unverified");
    const response = NextResponse.redirect(loginUrl, { status: 302 });
    response.headers.append(
      "Set-Cookie",
      buildExpiredStateCookie(process.env.NODE_ENV === "production"),
    );
    return response;
  }

  const role: "user" | "admin" = config.adminEmails.includes(profile.email.toLowerCase())
    ? "admin"
    : config.defaultRole;

  const sessionToken = await signSession({
    id: profile.sub,
    email: profile.email,
    name: profile.name ?? profile.email,
    picture: profile.picture,
    role,
  });

  // Re-verify the token we just minted; the type system + jose both keep
  // us honest, but this is the simplest "did signing succeed?" check.
  const verified = await verifySession(sessionToken);
  if (!verified) {
    loginUrl.searchParams.set("error", "session_signing_failed");
    const response = NextResponse.redirect(loginUrl, { status: 302 });
    response.headers.append(
      "Set-Cookie",
      buildExpiredStateCookie(process.env.NODE_ENV === "production"),
    );
    return response;
  }

  const destination = new URL(returnTo, origin);
  const response = NextResponse.redirect(destination, { status: 302 });
  response.headers.append(
    "Set-Cookie",
    buildSessionCookie(sessionToken, config.sessionTtlSeconds, process.env.NODE_ENV === "production"),
  );
  response.headers.append(
    "Set-Cookie",
    buildExpiredStateCookie(process.env.NODE_ENV === "production"),
  );
  return response;
}
