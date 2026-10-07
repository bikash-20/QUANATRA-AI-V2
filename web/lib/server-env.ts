// Server-only environment access for the auth flow. Centralized here so
// that route handlers and middleware can validate config in one place and
// fail loudly (and only server-side) if a required secret is missing.

import "server-only";

export type AuthConfig = {
  googleClientId: string;
  googleClientSecret: string;
  redirectUri: string;
  sessionSecret: string;
  sessionTtlSeconds: number;
  cookieName: string;
  stateCookieName: string;
  /** Comma-separated origins allowed to host the auth callback / start. */
  allowedOrigins: string[];
  /** Roles granted automatically on first sign-in (email-based admin mapping can override). */
  defaultRole: "user" | "admin";
  /** Comma-separated emails that should be promoted to admin on sign-in. */
  adminEmails: string[];
};

function readEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function readNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

export function getAuthConfig(): AuthConfig {
  return {
    googleClientId: readEnv("GOOGLE_CLIENT_ID"),
    googleClientSecret: readEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: readEnv("AUTH_REDIRECT_URI"),
    sessionSecret: readEnv("SESSION_SECRET"),
    sessionTtlSeconds: readNumber("SESSION_TTL_SECONDS", 60 * 60 * 24 * 7),
    cookieName: process.env.AUTH_COOKIE_NAME ?? "quantara.session",
    stateCookieName: process.env.AUTH_STATE_COOKIE_NAME ?? "quantara.oauth-state",
    allowedOrigins: (process.env.AUTH_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    defaultRole: process.env.AUTH_DEFAULT_ROLE === "admin" ? "admin" : "user",
    adminEmails: (process.env.AUTH_ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  };
}

export function isAuthConfigured(): boolean {
  try {
    getAuthConfig();
    return true;
  } catch {
    return false;
  }
}
