'use client';

// Bottom-left "Install Quantara" toast. Surfaces the browser's
// `beforeinstallprompt` event so users on Android / desktop Chrome can
// install the PWA in one tap. iOS Safari does not fire the event — there
// the user uses the browser's "Add to Home Screen" sheet, so this banner
// simply stays hidden.
//
// Accessibility: the banner is a polite live region, focuses the install
// button on mount, and restores focus to the previous element on unmount
// so screen-reader and keyboard users land where they were.

import { Download, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useInstallPrompt } from '@/lib/pwa-install';

export function InstallBanner() {
  const { canInstall, installed, promptInstall, dismiss } = useInstallPrompt();
  const [visible, setVisible] = useState(false);
  const installBtnRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  // Slide-in animation: defer the `visible` toggle one frame so the CSS
  // transition fires from the initial `opacity: 0` state. Because the
  // hook's `deferred` ref only flips once (per `beforeinstallprompt`
  // spec) and the banner unmounts on dismiss/install, `visible` is a
  // one-way latched boolean — it never needs to go back to false.
  const prevCanInstallRef = useRef<boolean>(false);
  useEffect(() => {
    if (canInstall === prevCanInstallRef.current) return undefined;
    prevCanInstallRef.current = canInstall;
    if (canInstall) {
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }
    return undefined;
  }, [canInstall]);

  // Focus management: capture the previously-focused element when the
  // banner becomes visible, and restore it on hide.
  useEffect(() => {
    if (visible && !prevFocusRef.current) {
      prevFocusRef.current = document.activeElement as HTMLElement | null;
      installBtnRef.current?.focus();
    }
    if (!visible && prevFocusRef.current) {
      prevFocusRef.current.focus?.();
      prevFocusRef.current = null;
    }
  }, [visible]);

  if (installed || !canInstall) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Install Quantara app"
      aria-hidden={!visible}
      className={`install-banner${visible ? ' install-banner--in' : ''}`}
    >
      <div className="install-banner-icon" aria-hidden="true">
        {/* Plain <img> here is intentional: the file is in /public and we
            do not want to pay for next/image's optimization pipeline
            for a 27KB static PNG. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={40} height={40} />
      </div>
      <div className="install-banner-body">
        <p className="install-banner-title">Install Quantara</p>
        <p className="install-banner-sub">Get the full app — fast, offline-ready.</p>
      </div>
      <div className="install-banner-actions">
        <button
          ref={installBtnRef}
          type="button"
          className="install-banner-cta"
          onClick={() => void promptInstall()}
        >
          <Download aria-hidden="true" size={16} />
          Install
        </button>
        <button
          type="button"
          className="install-banner-close"
          onClick={dismiss}
          aria-label="Dismiss install banner"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>
    </div>
  );
}
