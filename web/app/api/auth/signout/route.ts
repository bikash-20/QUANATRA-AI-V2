// Clears the session cookie and redirects to /login.

import { NextResponse, type NextRequest } from "next/server";
import { getAuthConfig } from "@/lib/server-env";
import { buildExpiredSessionCookie } from "@/lib/server-session";

export async function POST(request: NextRequest): Promise<NextResponse> {
  void request;
  let cookieName = "quantara.session";
  try {
    cookieName = getAuthConfig().cookieName;
  } catch {
    // env not configured; still clear the default cookie below
  }
  const isProduction = process.env.NODE_ENV === "production";
  const response = NextResponse.json({ ok: true, cookie: cookieName });
  response.headers.append("Set-Cookie", buildExpiredSessionCookie(isProduction));
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return POST(request);
}
