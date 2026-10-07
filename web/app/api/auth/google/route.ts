// Initiates the Google OAuth flow. Generates a CSRF state, stores it in a
// short-lived HttpOnly cookie, and redirects the user-agent to Google's
// consent screen.
//
// GET /api/auth/google?return_to=/chat
//
// Required env:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_REDIRECT_URI,
//   SESSION_SECRET, AUTH_ALLOWED_ORIGINS (optional)

import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthConfig } from "@/lib/server-env";
import { buildStateCookie } from "@/lib/server-session";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const SCOPES = ["openid", "email", "profile"];

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
  const statePayload = `${state}.${nonce}.${encodeURIComponent(returnTo)}`;

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
  return response;
}
