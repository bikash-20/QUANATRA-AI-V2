'use client';

// Client-only hook that surfaces the browser's PWA install prompt
// (`BeforeInstallPromptEvent`) plus a 7-day localStorage dismiss flag.
//
// Design notes:
//   * No external dependencies — relies on the native `beforeinstallprompt`
//     and `appinstalled` events. The TypeScript shape is a structural subset
//     of the spec; we deliberately do not depend on `@types/dom-stubs`.
//   * O(1) memory: only two event listeners and one localStorage key.
//   * Idempotent across React strict-mode double-invocation of `useEffect`
//     because the listener cleanup runs on each re-run.

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'quantara.install-banner.dismissed';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type UseInstallPromptResult = {
  /** True once the browser has emitted a `beforeinstallprompt` we can show. */
  canInstall: boolean;
  /** True after `appinstalled` fires; the banner never re-appears. */
  installed: boolean;
  /** Trigger the native install dialog. Returns the user's choice. */
  promptInstall: () => Promise<boolean>;
  /** Hide the banner and remember the choice for `DISMISS_TTL_MS`. */
  dismiss: () => void;
};

function isDismissedRecently(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < DISMISS_TTL_MS;
}

function isRunningAsInstalledPwa(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

export function useInstallPrompt(): UseInstallPromptResult {
  const [deferred, setDeferred] = useState<DeferredPrompt | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Skip wiring listeners when the banner is not eligible to show.
    if (isDismissedRecently() || isRunningAsInstalledPwa()) {
      return undefined;
    }

    const onPrompt = (event: Event) => {
      // The browser only fires this once per page-load. Hold the event so
      // we can trigger the native dialog from our own button.
      event.preventDefault();
      setDeferred(event as DeferredPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      window.localStorage.removeItem(DISMISS_KEY);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  async function promptInstall(): Promise<boolean> {
    if (!deferred) return false;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    // Per spec, the prompt can only be used once.
    setDeferred(null);
    return choice.outcome === 'accepted';
  }

  function dismiss(): void {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDeferred(null);
  }

  return {
    canInstall: deferred !== null,
    installed,
    promptInstall,
    dismiss,
  };
}
