# Authentication integration

The frontend currently uses `DevAuthAdapter`, which stores a local development
session and does not authenticate a real identity. Keep
`NEXT_PUBLIC_AUTH_ENABLED=false` until a production authentication adapter and
server-verifiable sessions are implemented. With auth disabled, the app remains
open; production builds return 404 for `/admin`.

## Google OAuth adapter checklist

1. Create a Google OAuth 2.0 Web application client in Google Cloud Console.
2. Register the deployed origin and callback URL, for example
   `https://app.example.com/auth/callback`, under authorized origins and redirect
   URIs. Register equivalent local development URLs separately.
3. Add server-only `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
   `AUTH_REDIRECT_URI` values. Do not prefix secrets with `NEXT_PUBLIC_`.
4. Add an `/auth/callback` route that validates the OAuth `state`, exchanges the
   authorization code server-side, establishes a secure, HTTP-only session, and
   redirects to the app.
5. Implement a Google-backed `AuthAdapter`, make its session available to
   server route guards, verify role claims server-side, and only then enable
   `NEXT_PUBLIC_AUTH_ENABLED=true`.

The current adapter is a frontend seam, not an authorization boundary. Never
use its local-storage session to protect production APIs or privileged data.
