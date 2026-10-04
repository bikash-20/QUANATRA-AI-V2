'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Moon, SunMedium } from 'lucide-react';
import { useEffect, useState } from 'react';

const navItems = [
  { href: '/explore', label: 'Explore' },
  { href: '/chat', label: 'Chat' },
  { href: '/quiz', label: 'Quiz' },
  { href: '/vocab', label: 'Vocab' },
  { href: '/grammar', label: 'Grammar' },
];

export function Navbar() {
  const pathname = usePathname();
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const saved = window.localStorage.getItem('quantara.theme');
    if (saved) {
      setIsDark(saved === 'dark');
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    window.localStorage.setItem('quantara.theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  return (
    <header className="sticky top-0 z-20 mx-auto flex w-full max-w-6xl items-center justify-between rounded-full border border-white/15 bg-[rgba(12,22,29,0.7)] px-5 py-3 shadow-[0_16px_38px_rgba(8,18,23,0.4)] backdrop-blur-xl">
      <Link href="/explore" className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#8feaf0]/60 bg-[linear-gradient(135deg,rgba(105,216,223,0.24),rgba(255,255,255,0.08))] text-sm font-semibold tracking-[0.22em] text-[#dffcff]">
          Q
        </div>
        <div className="text-[0.68rem] font-medium uppercase tracking-[0.42em] text-slate-200/80">
          Quantara
        </div>
      </Link>

      <nav className="hidden items-center gap-6 text-sm text-slate-200/80 md:flex">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`transition ${pathname === item.href ? 'text-white' : 'hover:text-white'}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setIsDark((value) => !value)}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-slate-100"
          aria-label="Toggle theme"
        >
          {isDark ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/5 text-sm font-medium text-white/90">
          A
        </div>
      </div>
    </header>
  );
}
