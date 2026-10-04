'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpenCheck, Compass, MessageCircle, Moon, SunMedium, Type } from 'lucide-react';
import { useEffect, useState } from 'react';

const navItems = [
  { href: '/explore', label: 'Explore' },
  { href: '/chat', label: 'Chat' },
  { href: '/quiz', label: 'Quiz' },
  { href: '/vocab', label: 'Vocab' },
  { href: '/grammar', label: 'Grammar' },
];

const mobileItems = [
  { href: '/chat', label: 'Chat', icon: MessageCircle },
  { href: '/quiz', label: 'Quiz', icon: BookOpenCheck },
  { href: '/vocab', label: 'Vocab', icon: Type },
  { href: '/grammar', label: 'Grammar', icon: BookOpenCheck },
  { href: '/explore', label: 'Explore', icon: Compass },
];

export function Navbar() {
  const pathname = usePathname();
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem('quantara.theme');
    if (!saved) return;

    const frame = window.requestAnimationFrame(() => setIsDark(saved === 'dark'));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    window.localStorage.setItem('quantara.theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  return (
    <>
      <header className="glass-surface sticky top-3 z-30 mx-auto flex w-full max-w-6xl items-center justify-between rounded-full px-3 py-2.5 sm:px-5">
        <Link href="/explore" className="flex min-h-11 items-center gap-2.5 sm:gap-3" aria-label="Quantara home">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#79d4e7]/55 bg-[linear-gradient(135deg,rgba(77,184,212,0.3),rgba(255,255,255,0.08))] font-serif text-lg text-[#e6faff]">
            Q
          </span>
          <span className="font-condensed text-xs font-medium uppercase tracking-[0.3em] text-slate-200/90 sm:tracking-[0.42em]">
            Quantara
          </span>
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-7 md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? 'page' : undefined}
              className={`min-h-11 content-center font-condensed text-xs uppercase tracking-[0.2em] transition-colors ${
                pathname === item.href ? 'text-white' : 'text-slate-200/75 hover:text-white'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => setIsDark((value) => !value)}
            className="theme-toggle flex items-center gap-2 rounded-full px-3 text-xs font-medium text-slate-100"
            aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
            title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
          >
            {isDark ? <SunMedium className="h-4 w-4 text-[#9be9f4]" /> : <Moon className="h-4 w-4 text-[#327b9c]" />}
            <span className="hidden sm:inline">{isDark ? 'Light' : 'Dark'}</span>
          </button>
          <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-sm font-medium text-white/90">
            A
          </span>
        </div>
      </header>

      <nav
        aria-label="Mobile navigation"
        className="mobile-tabbar glass-surface fixed inset-x-2 bottom-2 z-50 grid grid-cols-5 rounded-[1.65rem] px-1.5 pt-1.5 md:hidden"
      >
        {mobileItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl font-condensed text-[0.58rem] uppercase tracking-[0.12em] ${
                active ? 'bg-[#4db8d4]/15 text-[#a9eff7]' : 'text-slate-200/70'
              }`}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
