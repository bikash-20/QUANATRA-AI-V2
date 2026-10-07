// Next.js 16 "proxy" (formerly middleware). Gates routes based on auth
// state.
//
// Behavior matrix:
//
//   NEXT_PUBLIC_AUTH_ENABLED=false (default; legacy behaviour)
//     - /admin in dev: pass through
//     - /admin in production: 404
//     - everything else: pass through
//
//   NEXT_PUBLIC_AUTH_ENABLED=true
//     - /login and /api/auth/*: always pass through (otherwise the
//       sign-in flow would redirect back on itself)
//     - /_next/*, file-extension assets, /favicon.ico: excluded by the
//       matcher; never gated
//     - everything else: require a valid signed `quantara.session`
//       cookie. Missing / invalid → 302 to /login?return_to=<path>
//     - /admin still requires the same session, with no extra role check
//       (admin role is enforced inside the admin dashboard component)

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
  const response = NextResponse.redirect(url, { status: 302 });
  // The OAuth state cookie is now invalid; drop it so a subsequent
  // sign-in doesn't carry a stale CSRF token.
  response.cookies.delete(STATE_COOKIE_NAME);
  return response;
}

async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  if (!SESSION_SECRET) {
    // Auth is enabled but the secret is missing. Fail closed.
    return false;
  }
  try {
    await jwtVerify(token, new TextEncoder().encode(SESSION_SECRET), {
      issuer: "quantara-auth",
      audience: "quantara-web",
    });
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Auth-off: keep the legacy /admin behaviour for backwards
  // compatibility; everything else is public.
  if (!isAuthEnabled()) {
    if (pathname.startsWith("/admin") && process.env.NODE_ENV !== "development") {
      return new NextResponse(null, { status: 404 });
    }
    return NextResponse.next();
  }

  // Auth-on: /login and /api/auth/* are always reachable so the OAuth
  // flow can complete.
  if (pathname === "/login" || pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Everything else requires a valid signed session.
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!(await isValidSession(token))) {
    return redirectToLogin(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Exclude:
    //   - /api/auth/* (the OAuth start/callback/session/signout endpoints)
    //   - /_next/static/* and /_next/image/* (Next.js assets)
    //   - /favicon.ico (root favicon)
    //   - any path with a file extension (assets in /public like
    //     /bg-login.jpg, /new-bg.jpg, manifest.json, robots.txt, etc.)
    //
    // The negative lookahead `(?!...)` makes the matcher fire on every
    // other request — which is what the proxy uses to gate the app.
    "/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+).*)",
  ],
};