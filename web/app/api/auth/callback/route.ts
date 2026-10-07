// Handles the Google OAuth callback. Verifies the CSRF state, exchanges
// the authorization code for tokens, fetches the user's profile, mints a
// signed session cookie, and redirects to the original destination.

import { NextResponse, type NextRequest } from "next/server";
import { OAuth2Client } from "google-auth-library";
import { getAuthConfig } from "@/lib/server-env";
import {
  buildExpiredStateCookie,
  buildSessionCookie,
  signSession,
  verifySession,
} from "@/lib/server-session";

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
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const origin = safeOrigin(request);
  const loginUrl = new URL("/login", origin);
  const stateCookie = request.cookies.get(config.stateCookieName)?.value;

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

  // Decode the destination from the state payload (third segment).
  const segments = state.split(".");
  const returnTo = segments.length >= 3 && isSafeReturnPath(decodeURIComponent(segments[2]))
    ? decodeURIComponent(segments[2])
    : "/chat";

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
