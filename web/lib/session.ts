// Server-side helpers for reading the current session in route handlers,
// server components, and middleware. The cookie is HttpOnly + signed so
// the browser never sees the JWT; we verify it here and return the
// `ServerSession` payload (or null).

import "server-only";
import { cookies } from "next/headers";
import { getAuthConfig, isAuthConfigured } from "@/lib/server-env";
import { verifySession, type ServerSession } from "@/lib/server-session";

export async function getServerSession(): Promise<ServerSession | null> {
  if (!isAuthConfigured()) return null;
  const config = getAuthConfig();
  const store = await cookies();
  const token = store.get(config.cookieName)?.value;
  if (!token) return null;
  return verifySession(token);
}

export type PublicSession = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  picture?: string;
};

export function toPublicSession(session: ServerSession): PublicSession {
  return {
    id: session.id,
    name: session.name,
    email: session.email,
    role: session.role,
    picture: session.picture,
  };
}
