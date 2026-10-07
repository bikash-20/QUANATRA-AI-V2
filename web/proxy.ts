// Next.js 16 "proxy" (formerly middleware). Gates /admin in production
// regardless of auth state, and additionally enforces a valid session
// when NEXT_PUBLIC_AUTH_ENABLED is true.
//
// Behavior matrix:
//
//   NEXT_PUBLIC_AUTH_ENABLED=false (default)
//     - /admin in dev: pass through
//     - /admin in production: 404
//     - everything else: pass through
//
//   NEXT_PUBLIC_AUTH_ENABLED=true
//     - /admin: require a valid signed session cookie
//     - everything else: pass through (the login page can render the
//       "Continue with Google" button)

import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? "quantara.session";
const STATE_COOKIE_NAME = process.env.AUTH_STATE_COOKIE_NAME ?? "quantara.oauth-state";
const SESSION_SECRET = process.env.SESSION_SECRET;

function isAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";
}

function redirectToLogin(request: NextRequest): NextResponse {
  const url = request.nextUrl.clone();
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  url.pathname = "/login";
  url.search = `?return_to=${encodeURIComponent(returnTo)}`;
  const response = NextResponse.redirect(url);
  response.cookies.delete(STATE_COOKIE_NAME);
  return response;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // /admin: 404 in production when auth is not enabled (legacy behavior).
  if (pathname.startsWith("/admin") && process.env.NODE_ENV !== "development" && !isAuthEnabled()) {
    return new NextResponse(null, { status: 404 });
  }

  // /admin: require a valid signed session when auth is enabled.
  if (pathname.startsWith("/admin") && isAuthEnabled()) {
    if (!SESSION_SECRET) {
      return NextResponse.json(
        { error: "Auth is enabled but SESSION_SECRET is not set." },
        { status: 500 },
      );
    }
    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) return redirectToLogin(request);
    try {
      await jwtVerify(token, new TextEncoder().encode(SESSION_SECRET), {
        issuer: "quantara-auth",
        audience: "quantara-web",
      });
    } catch {
      return redirectToLogin(request);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
