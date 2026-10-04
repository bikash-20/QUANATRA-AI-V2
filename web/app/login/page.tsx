'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authAdapter } from '@/lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueWithGoogle() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await authAdapter.signIn();
      router.replace('/chat');
    } catch {
      setError('Sign-in is unavailable right now. Please try again.');
      setBusy(false);
    }
  }

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
      <section className="login-card" aria-labelledby="login-title">
        <a href="/explore" className="login-brand" aria-label="Quantara">
          <span className="brand-mark">Q</span>
          <span>Quantara</span>
        </a>
        <h1 id="login-title">A little clarity goes a long way.</h1>
        <p>Learn one good question at a time.</p>
        <button
          type="button"
          className="google-signin-button"
          onClick={continueWithGoogle}
          disabled={busy}
        >
          <GoogleMark />
          {busy ? 'Connecting…' : 'Continue with Google'}
        </button>
        {error ? <p role="alert" className="login-error">{error}</p> : null}
      </section>
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
