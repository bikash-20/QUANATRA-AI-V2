'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { ArrowRight, BookOpenCheck, BrainCircuit, Moon, Sun } from 'lucide-react';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { authAdapter } from '@/lib/auth';
import { DeveloperCredit } from '@/components/developer-credit';

const noSubscribe = () => () => {};

const benefits = [
  {
    icon: BookOpenCheck,
    title: 'Learn at your pace',
    description: 'Clear explanations that meet you where you are.',
  },
  {
    icon: BrainCircuit,
    title: 'Practice with purpose',
    description: 'Build confidence through focused questions.',
  },
  {
    icon: ArrowRight,
    title: 'Keep making progress',
    description: 'Small steps add up to a stronger understanding.',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const themeReady = useSyncExternalStore(noSubscribe, () => true, () => false);
  const returnTo = useMemo(() => {
    if (typeof window === 'undefined') return '/chat';
    const raw = new URLSearchParams(window.location.search).get('return_to');
    if (!raw) return '/chat';
    if (!raw.startsWith('/') || raw.startsWith('//')) return '/chat';
    return raw;
  }, []);

  const initialError = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const code = new URLSearchParams(window.location.search).get('error');
    if (!code) return null;
    const messages: Record<string, string> = {
      state_mismatch: 'The sign-in session expired. Please try again.',
      exchange_failed: 'Google rejected the sign-in code. Please try again.',
      no_access_token: 'Google did not return an access token. Please try again.',
      profile_failed: 'Could not read your Google profile. Please try again.',
      email_unverified: 'Your Google email is not verified. Verify it and try again.',
      session_signing_failed: 'Internal session error. Please try again.',
      access_denied: 'You cancelled the Google sign-in.',
    };
    return messages[code] ?? 'Sign-in failed. Please try again.';
  }, []);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function continueWithGoogle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const session = await authAdapter.signIn(returnTo);
      // DevAuthAdapter resolves immediately and returns a real session.
      // GoogleAuthAdapter navigates away; if we still have control, the
      // session is the placeholder "Signing in…" entry.
      if (authAdapter.kind === 'dev' && session?.email) {
        router.replace(returnTo);
      } else if (authAdapter.kind === 'google') {
        // Navigation should already be in flight; reset busy so the button
        // can recover if Google fails to redirect.
        setTimeout(() => setBusy(false), 1500);
      } else {
        router.replace(returnTo);
      }
    } catch {
      setError('Sign-in is unavailable right now. Please try again.');
      setBusy(false);
    }
  }

  const isLight = themeReady && resolvedTheme === 'light';

  return (
    <main className="login-page">
      <div className="login-background" aria-hidden="true">
        <Image
          src="/bg-login.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      </div>

      <div className="login-shell">
        <header className="login-header">
          <Link href="/explore" className="login-brand" aria-label="Quantara home">
            <span className="brand-mark">Q</span>
            <span>Quantara</span>
          </Link>
          <button
            type="button"
            className="login-theme-toggle"
            aria-label={`Switch to ${isLight ? 'dark' : 'light'} theme`}
            onClick={() => setTheme(isLight ? 'dark' : 'light')}
          >
            {isLight ? <Moon aria-hidden="true" size={16} /> : <Sun aria-hidden="true" size={16} />}
            <span>{isLight ? 'Dark' : 'Light'}</span>
          </button>
        </header>

        <section className="login-content" aria-labelledby="login-title">
          <div className="login-intro">
            <p className="login-eyebrow">A calmer way to learn</p>
            <h1 id="login-title">
              Make room for
              <br />
              <span>your next idea.</span>
            </h1>
            <p className="login-description">
              Ask what you wonder. Understand what you learn. Keep moving forward,
              one good question at a time.
            </p>

            <ul className="login-benefits">
              {benefits.map(({ icon: Icon, title, description }) => (
                <li key={title}>
                  <span className="login-benefit-icon">
                    <Icon aria-hidden="true" size={18} />
                  </span>
                  <span>
                    <strong>{title}</strong>
                    <small>{description}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="login-card">
            <div className="login-card-mark" aria-hidden="true">
              <span className="brand-mark">Q</span>
            </div>
            <p className="login-card-eyebrow">Your learning space</p>
            <h2>Start with a question.</h2>
            <p className="login-card-copy">
              Sign in to pick up where curiosity takes you.
            </p>
            <button
              type="button"
              className="google-signin-button"
              onClick={continueWithGoogle}
              disabled={busy}
            >
              <GoogleMark />
              <span>{busy ? 'Connecting…' : 'Continue with Google'}</span>
            </button>
            {error ? <p role="alert" className="login-error">{error}</p> : null}
            <p className="login-privacy">
              By continuing, you agree to learn with curiosity and kindness.
            </p>
          </div>
        </section>

        <footer className="login-footer">
          <p>“Every expert was once a beginner who kept asking.”</p>
          <span>Built for curious minds · Quantara</span>
        </footer>
        <DeveloperCredit variant="inline" />
      </div>
    </main>
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
