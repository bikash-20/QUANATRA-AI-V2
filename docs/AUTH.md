# Authentication integration

Quantara ships a pluggable auth seam. Two adapters are bundled:

- `DevAuthAdapter` (default) — a localStorage-backed mock used while you
  develop. The login page creates a fake "Quantara learner" session
  with the `user` role.
- `GoogleAuthAdapter` — drives a real Google OAuth 2.0 flow through
  `/api/auth/google` → Google consent → `/api/auth/callback`. The server
  signs an HttpOnly session cookie that the rest of the app uses for
  role checks.

Selection is driven by `NEXT_PUBLIC_AUTH_ENABLED`:

- `NEXT_PUBLIC_AUTH_ENABLED=false` (default) → `DevAuthAdapter`.
- `NEXT_PUBLIC_AUTH_ENABLED=true` → `GoogleAuthAdapter`.

With auth disabled, the app remains open; production builds return
`404` for `/admin`.

## Google OAuth adapter checklist

1. Create a Google OAuth 2.0 Web application client in
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Register the deployed origin and callback URL — for example
   `https://quantara-web-sooty.vercel.app/api/auth/callback` — under
   *Authorized JavaScript origins* and *Authorized redirect URIs*.
   Register equivalent local development URLs separately
   (`http://localhost:3000/api/auth/callback`).
3. Add the following server-only env vars (copy
   [`web/.env.example`](../web/.env.example) into `.env.local` for local
   dev; add the same vars to your Vercel project settings):

   ```env
   NEXT_PUBLIC_AUTH_ENABLED=true
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   AUTH_REDIRECT_URI=https://quantara-web-sooty.vercel.app/api/auth/callback
   SESSION_SECRET=$(openssl rand -hex 32)
   ```

   Never prefix `GOOGLE_CLIENT_SECRET` or `SESSION_SECRET` with
   `NEXT_PUBLIC_`.
4. (Optional) promote specific emails to admin on sign-in:

   ```env
   AUTH_ADMIN_EMAILS=you@gmail.com,teammate@gmail.com
   ```
5. Sign in: visit `/login`, click *Continue with Google*. The browser
   bounces to Google, comes back to `/api/auth/callback`, and lands on
   the original destination (default `/chat`) with a signed session
   cookie.

## What the adapter stores

- `quantara.session` — HttpOnly + SameSite=Lax JWT (HS256, signed with
  `SESSION_SECRET`, 7 day TTL by default). Carries `id`, `email`, `name`,
  `picture`, `role`, `iat`, `exp`.
- `quantara.oauth-state` — short-lived (10 min) CSRF state used during
  the OAuth redirect. Cleared on success and on any callback failure.

The session payload is verified with the same `SESSION_SECRET` in
`proxy.ts` (which gates `/admin`) and in any server component that
calls `getServerSession()`.

## Server-side helpers

- `lib/server-env.ts` — typed env reader; throws if a required secret is
  missing. Use this in route handlers and server components.
- `lib/server-session.ts` — JWT signing/verification + cookie builders.
- `lib/session.ts` — `getServerSession()` + `toPublicSession()` for use
  in server components.
- `proxy.ts` — gates `/admin` (404 in prod when auth is disabled, redirect
  to `/login` with `return_to` when auth is enabled).

## Client-side API

`authAdapter` (from `lib/auth.ts`) exposes the same interface either
way:

```ts
await authAdapter.signIn(returnTo);   // returns void for google, immediate session for dev
await authAdapter.signOut();          // clears cookie or localStorage
const session = await authAdapter.getSession();
```

The login page surfaces OAuth errors from the query string
(`/login?error=state_mismatch`, etc.).

## Security notes

- The session cookie is `HttpOnly` so client JS cannot read it.
- `Secure` is enabled automatically in production.
- CSRF is mitigated by the `state` cookie + signed JWT. The state
  value is verified in the callback before any token exchange.
- The adapter never stores a Google access/refresh token in the client
  or the session JWT; we only keep the user profile.
- Never use the dev adapter's localStorage session to protect
  production APIs — it is a frontend seam, not an authorization
  boundary.
