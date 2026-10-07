'use client';

// Header chip that surfaces sign-in / sign-out. Reads the session from
// `authAdapter.getSession()` on mount, then re-reads it whenever the
// `quantara:auth-changed` custom event fires (or another tab updates the
// session cookie via the `storage` event). Two variants:
//
//   - desktop: signed-out → "Continue with Google" pill CTA
//              signed-in   → profile chip + popover with "Sign out"
//   - mobile:  signed-out → compact "Sign in" pill
//              signed-in   → avatar button (tap → sign out)

import { LogOut, UserCircle2 } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { authAdapter, type AuthSession } from '@/lib/auth';

type Variant = 'desktop' | 'mobile';

export function AuthBar({ variant }: { variant: Variant }) {
  const pathname = usePathname();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await authAdapter.getSession();
      setSession(next);
    } catch {
      setSession(null);
    }
  }, []);

  useEffect(() => {
    let active = true;
    // Defer to a microtask so we don't trip the "synchronous setState in
    // an effect body" lint; the state update happens after the effect
    // returns and only when the listener resolves.
    queueMicrotask(() => {
      if (!active) return;
      void refresh();
    });
    function onAuthChanged() {
      void refresh();
    }
    function onStorage(event: StorageEvent) {
      // Cross-tab sign-out: the session cookie can't be observed from JS,
      // so listen for the custom event we dispatch on sign-out.
      if (event.key === 'quantara:auth-changed') void refresh();
    }
    window.addEventListener('quantara:auth-changed', onAuthChanged);
    window.addEventListener('storage', onStorage);
    return () => {
      active = false;
      window.removeEventListener('quantara:auth-changed', onAuthChanged);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh]);

  // Close the desktop popover on outside click / Escape / route change.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        chipRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Close the popover when the route changes. The outside-pointer handler
// already closes it on the next mouse interaction; for keyboard navigation
// (Enter on a sidebar link) we listen for the focus event moving out of
// the chip container and close asynchronously.
  useEffect(() => {
    if (!open) return;
    function onFocusIn(event: FocusEvent) {
      if (!containerRef.current) return;
      const target = event.target as Node | null;
      if (target && !containerRef.current.contains(target)) {
        queueMicrotask(() => setOpen(false));
      }
    }
    document.addEventListener('focusin', onFocusIn);
    return () => document.removeEventListener('focusin', onFocusIn);
  }, [open]);

  const returnTo = pathname && pathname.startsWith('/') && !pathname.startsWith('//')
    ? pathname
    : '/chat';

  async function signIn() {
    if (busy) return;
    setBusy(true);
    try {
      await authAdapter.signIn(returnTo);
      // GoogleAuthAdapter navigates away; DevAuthAdapter resolves here.
      if (authAdapter.kind === 'dev') {
        await refresh();
      }
    } catch {
      // surfaced via /login?error=... for Google; nothing to do for dev.
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await authAdapter.signOut();
    } catch {
      // ignore; we still want to clear local UI state below
    }
    setOpen(false);
    setSession(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('quantara:auth-changed'));
      // Hard navigate so the server-rendered layout re-evaluates auth.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/login');
    }
  }

  if (variant === 'mobile') {
    if (!session) {
      return (
        <button
          type="button"
          className="auth-signin-pill auth-signin-pill-mobile"
          onClick={signIn}
          disabled={busy}
          aria-label="Sign in with Google"
        >
          <span aria-hidden="true" className="auth-signin-dot" />
          <span>{busy ? 'Signing in…' : 'Sign in'}</span>
        </button>
      );
    }
    return (
      <button
        type="button"
        className="sidebar-icon-button mobile-profile"
        aria-label={`Sign out, ${session.name}`}
        onClick={signOut}
        disabled={busy}
      >
        <SessionAvatar session={session} />
      </button>
    );
  }

  // Desktop variant.
  if (!session) {
    return (
      <button
        type="button"
        className="auth-signin-pill"
        onClick={signIn}
        disabled={busy}
      >
        <GoogleMark />
        <span>{busy ? 'Connecting…' : 'Continue with Google'}</span>
      </button>
    );
  }

  return (
    <div className="auth-bar-desktop" ref={containerRef}>
      <button
        ref={chipRef}
        type="button"
        className="auth-chip"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${session.name}`}
        onClick={() => setOpen((value) => !value)}
      >
        <SessionAvatar session={session} />
        <span className="auth-chip-label">
          <strong>{session.name}</strong>
          <small>{session.email || (authAdapter.kind === 'google' ? 'Signed in with Google' : 'Development account')}</small>
        </span>
        <span aria-hidden="true" className={`auth-chip-chevron ${open ? 'open' : ''}`} />
      </button>
      {open ? (
        <div className="auth-popover" role="menu" aria-label="Account menu">
          <div className="auth-popover-summary">
            <SessionAvatar session={session} />
            <div>
              <strong>{session.name}</strong>
              <small>{session.email}</small>
            </div>
          </div>
          <div className="auth-popover-divider" aria-hidden="true" />
          <div className="auth-popover-meta" aria-hidden="true">
            <UserCircle2 size={14} />
            <span>Signed in{authAdapter.kind === 'google' ? ' with Google' : ' (dev session)'}</span>
          </div>
          <button
            type="button"
            role="menuitem"
            className="auth-popover-signout"
            onClick={signOut}
            disabled={busy}
          >
            <LogOut aria-hidden="true" size={16} />
            <span>{busy ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SessionAvatar({ session }: { session: AuthSession }) {
  if (session.picture) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="auth-chip-avatar auth-chip-avatar-image" src={session.picture} alt="" />;
  }
  const initial = session.name?.trim().charAt(0).toUpperCase() || 'Q';
  return (
    <span className="profile-avatar auth-chip-avatar" aria-hidden="true">
      {initial}
    </span>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="google-mark">
      <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5h6.6c3.9-3.6 6.1-8.9 6.1-14.9Z" />
      <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.6-5c-1.8 1.2-4.1 2-6.9 2-5.3 0-9.8-3.6-11.4-8.4H5.8v5.2A20 20 0 0 0 24 44Z" />
      <path fill="#FBBC05" d="M12.6 27.7a12 12 0 0 1 0-7.4v-5.2H5.8a20 20 0 0 0 0 17.8l6.8-5.2Z" />
      <path fill="#EA4335" d="M24 12c3 0 5.6 1 7.7 3l5.8-5.8A19.4 19.4 0 0 0 24 4 20 20 0 0 0 5.8 15.1l6.8 5.2C14.2 15.6 18.7 12 24 12Z" />
    </svg>
  );
}