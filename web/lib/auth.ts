// Auth seam. Two adapters live here:
//
//   - DevAuthAdapter  → a localStorage-backed mock that mimics the
//                        contract of a real session. Used when
//                        NEXT_PUBLIC_AUTH_ENABLED !== 'true'.
//   - GoogleAuthAdapter → drives the real Google OAuth 2.0 flow against
//                          the /api/auth/* routes when the server is
//                          configured. The session is stored in a signed
//                          HttpOnly cookie; the client only sees the
//                          profile data via GET /api/auth/session.
//
// The exported `authAdapter` is picked at import time based on the
// `NEXT_PUBLIC_AUTH_ENABLED` flag, so callers (login page, app shell,
// admin dashboard) keep using a single symbol.

export type UserRole = "user" | "admin";

export type AuthSession = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  picture?: string;
};

export interface AuthAdapter {
  /** Begin the sign-in flow. For OAuth adapters this redirects; for the dev adapter it returns immediately. */
  signIn(returnTo?: string): Promise<AuthSession>;
  /** End the current session and clear any local/cookie state. */
  signOut(): Promise<void>;
  /** Read the current session, if any. */
  getSession(): Promise<AuthSession | null>;
  /** Whether the adapter expects a real OAuth round-trip. */
  readonly kind: "dev" | "google";
}

// ---------- Dev (localStorage) adapter ----------

const DEV_SESSION_KEY = "quantara.dev-session";

export class DevAuthAdapter implements AuthAdapter {
  readonly kind = "dev" as const;

  async signIn(): Promise<AuthSession> {
    const session: AuthSession = {
      id: "dev-user",
      name: "Quantara learner",
      email: "learner@quantara.local",
      role: "user",
    };
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DEV_SESSION_KEY, JSON.stringify(session));
    }
    return session;
  }

  async signOut(): Promise<void> {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DEV_SESSION_KEY);
    }
  }

  async getSession(): Promise<AuthSession | null> {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(DEV_SESSION_KEY);
      if (!raw) return null;
      const value: unknown = JSON.parse(raw);
      if (
        typeof value === "object" &&
        value !== null &&
        "id" in value &&
        "name" in value &&
        "email" in value &&
        "role" in value &&
        typeof value.id === "string" &&
        typeof value.name === "string" &&
        typeof value.email === "string" &&
        (value.role === "user" || value.role === "admin")
      ) {
        return value as AuthSession;
      }
    } catch {
      return null;
    }
    return null;
  }
}

// ---------- Google OAuth adapter ----------

export class GoogleAuthAdapter implements AuthAdapter {
  readonly kind = "google" as const;

  async signIn(returnTo?: string): Promise<AuthSession> {
    // The sign-in flow is a server-side redirect; we never await a
    // returned session here. Callers should `router.push(returnTo)` after
    // the redirect lands back on the site.
    if (typeof window === "undefined") {
      throw new Error("GoogleAuthAdapter.signIn must be called in the browser");
    }
    const safeReturn = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
      ? returnTo
      : "/chat";
    const target = `/api/auth/google?return_to=${encodeURIComponent(safeReturn)}`;
    // External-style redirect (server returns 302); same-origin so router.push
    // would also work, but window.location keeps state predictable.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(target);
    // Return a placeholder; the page will unmount on navigation.
    return {
      id: "pending",
      name: "Signing in…",
      email: "",
      role: "user",
    };
  }

  async signOut(): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      await fetch("/api/auth/signout", { method: "POST", credentials: "include" });
    } catch {
      // Even if the network call fails, clear any local dev session.
    }
  }

  async getSession(): Promise<AuthSession | null> {
    if (typeof window === "undefined") return null;
    try {
      const res = await fetch("/api/auth/session", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 503) return null;
      if (!res.ok) return null;
      const data = (await res.json()) as { session?: AuthSession | null };
      return data.session ?? null;
    } catch {
      return null;
    }
  }
}

// ---------- Adapter selection ----------

function isGoogleAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";
}

export const authAdapter: AuthAdapter = isGoogleAuthEnabled()
  ? new GoogleAuthAdapter()
  : new DevAuthAdapter();
