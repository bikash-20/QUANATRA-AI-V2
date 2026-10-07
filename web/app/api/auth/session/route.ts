// Returns the current session for client components. Used by the
// GoogleAuthAdapter to read the cookie-based session on mount so the
// client knows whether the user is signed in.

import { NextResponse, type NextRequest } from "next/server";
import { getAuthConfig, isAuthConfigured } from "@/lib/server-env";
import { verifySession } from "@/lib/server-session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { error: "auth_not_configured", session: null },
      { status: 503 },
    );
  }
  const config = getAuthConfig();
  const token = request.cookies.get(config.cookieName)?.value;
  if (!token) {
    return NextResponse.json({ session: null });
  }
  const session = await verifySession(token);
  if (!session) {
    return NextResponse.json({ session: null });
  }
  return NextResponse.json({
    session: {
      id: session.id,
      name: session.name,
      email: session.email,
      role: session.role,
      picture: session.picture,
    },
  });
}
