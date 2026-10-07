// Server-side session store. JWT-signed cookie session using `jose` so we
// do not need a database. The cookie is HttpOnly + Secure (in production)
// + SameSite=Lax, so the browser sends it on the OAuth callback redirect.
//
// The session payload is intentionally small (id, email, name, role, iat,
// exp). It does NOT contain tokens or PII the user did not consent to.

import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { getAuthConfig, type AuthConfig } from "@/lib/server-env";

export type ServerSession = {
  id: string;
  email: string;
  name: string;
  picture?: string;
  role: "user" | "admin";
  iat: number;
  exp: number;
};

function secretKey(config: AuthConfig): Uint8Array {
  return new TextEncoder().encode(config.sessionSecret);
}

export async function signSession(
  payload: Omit<ServerSession, "iat" | "exp">,
): Promise<string> {
  const config = getAuthConfig();
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    id: payload.id,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + config.sessionTtlSeconds)
    .setIssuer("quantara-auth")
    .setAudience("quantara-web")
    .sign(secretKey(config));
  return token;
}

export async function verifySession(token: string): Promise<ServerSession | null> {
  const config = getAuthConfig();
  try {
    const { payload } = await jwtVerify(token, secretKey(config), {
      issuer: "quantara-auth",
      audience: "quantara-web",
    });
    if (
      typeof payload.id !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.name !== "string" ||
      (payload.role !== "user" && payload.role !== "admin")
    ) {
      return null;
    }
    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      picture: typeof payload.picture === "string" ? payload.picture : undefined,
      role: payload.role,
      iat: Number(payload.iat ?? 0),
      exp: Number(payload.exp ?? 0),
    };
  } catch {
    return null;
  }
}

export function buildSessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  const config = getAuthConfig();
  const parts = [
    `${config.cookieName}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildExpiredSessionCookie(secure: boolean): string {
  const config = getAuthConfig();
  const parts = [
    `${config.cookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildStateCookie(state: string, maxAgeSeconds = 600, secure: boolean): string {
  const config = getAuthConfig();
  const parts = [
    `${config.stateCookieName}=${state}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildExpiredStateCookie(secure: boolean): string {
  const config = getAuthConfig();
  const parts = [
    `${config.stateCookieName}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
