'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BookOpenCheck,
  BookOpenText,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Compass,
  GraduationCap,
  Languages,
  Menu,
  MessageCircle,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { authAdapter } from '@/lib/auth';

const navigation = [
  { href: '/chat', label: 'Chat', icon: MessageCircle },
  { href: '/quiz', label: 'Quiz', icon: BookOpenCheck },
  { href: '/flashcards', label: 'Flashcards', icon: BookOpenText },
  { href: '/vocab', label: 'Vocab', icon: Languages },
  { href: '/grammar', label: 'Grammar', icon: ClipboardList },
  { href: '/exam', label: 'Exam', icon: GraduationCap },
  { href: '/progress', label: 'Progress', icon: Trophy },
  { href: '/admin', label: 'Admin', icon: Users },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [expanded, setExpanded] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [language, setLanguage] = useState<'en' | 'bn'>('en');
  const [recentTitle, setRecentTitle] = useState('');
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    setExpanded(window.localStorage.getItem('quantara.sidebar-expanded') !== 'false');
    setLanguage(window.localStorage.getItem('quantara.language') === 'bn' ? 'bn' : 'en');
    try {
      const messages: unknown = JSON.parse(window.localStorage.getItem('quantara.chats') ?? '[]');
      if (Array.isArray(messages)) {
        const latest = [...messages].reverse().find(
          (message): message is { role: string; content: string } =>
            typeof message === 'object' &&
            message !== null &&
            'role' in message &&
            'content' in message &&
            message.role === 'user' &&
            typeof message.content === 'string',
        );
        if (latest) setRecentTitle(latest.content.slice(0, 42));
      }
    } catch {
      setRecentTitle('');
    }
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const drawer = drawerRef.current;
    const focusable = drawer?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled])',
    );
    focusable?.[0]?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeDrawer();
        return;
      }
      if (event.key !== 'Tab' || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeDrawer, drawerOpen]);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        setExpanded((current) => {
          const next = !current;
          window.localStorage.setItem('quantara.sidebar-expanded', String(next));
          return next;
        });
      }
    }
    document.addEventListener('keydown', onShortcut);
    return () => document.removeEventListener('keydown', onShortcut);
  }, []);

  const isLogin = pathname === '/login';
  const showAdmin = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_AUTH_ENABLED === 'true';
  if (isLogin) return <>{children}</>;

  function toggleExpanded() {
    setExpanded((current) => {
      const next = !current;
      window.localStorage.setItem('quantara.sidebar-expanded', String(next));
      return next;
    });
  }

  function toggleLanguage() {
    setLanguage((current) => {
      const next = current === 'en' ? 'bn' : 'en';
      window.localStorage.setItem('quantara.language', next);
      return next;
    });
  }

  async function signOut() {
    await authAdapter.signOut();
    router.push('/login');
  }

  return (
    <div className={`app-shell ${expanded ? 'sidebar-expanded' : 'sidebar-collapsed'}`}>
      {drawerOpen ? (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={closeDrawer}
        />
      ) : null}
      <aside
        ref={drawerRef}
        id="app-sidebar"
        aria-label="Application sidebar"
        className={`app-sidebar ${drawerOpen ? 'drawer-open' : ''}`}
      >
        <div className="sidebar-brand-row">
          <Link href="/explore" className="sidebar-brand" aria-label="Quantara home">
            <span className="brand-mark">Q</span>
            <span className="sidebar-brand-label">Quantara</span>
          </Link>
          <button
            type="button"
            className="sidebar-icon-button mobile-sidebar-close"
            aria-label="Close navigation"
            onClick={closeDrawer}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <Link href="/chat" className="new-chat-button" title="New chat">
          <MessageCircle aria-hidden="true" size={18} />
          <span className="sidebar-link-label">New chat</span>
        </Link>
        <nav aria-label="Main navigation" className="sidebar-navigation">
          {navigation.filter((item) => item.href !== '/admin' || showAdmin).map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href === '/chat' && pathname === '/');
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                title={!expanded ? label : undefined}
                className={`sidebar-link ${active ? 'sidebar-link-active' : ''}`}
              >
                <Icon aria-hidden="true" size={18} />
                <span className="sidebar-link-label">{label}</span>
              </Link>
            );
          })}
        </nav>
        <section className="recent-chats" aria-label="Recent chats">
          <p className="sidebar-section-label">Recent</p>
          {recentTitle ? (
            <Link href="/chat" className="recent-chat-link" title={recentTitle}>
              <span aria-hidden="true" className="recent-chat-dot" />
              <span className="sidebar-link-label">{recentTitle}</span>
            </Link>
          ) : (
            <p className="sidebar-empty sidebar-link-label">Your conversations appear here</p>
          )}
        </section>
        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-link sidebar-action"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            title={!expanded ? 'Switch theme' : undefined}
          >
            {resolvedTheme === 'dark' ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
            <span className="sidebar-link-label">{resolvedTheme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
          </button>
          <button
            type="button"
            className="sidebar-link sidebar-action"
            onClick={toggleLanguage}
            title={!expanded ? 'Switch language' : undefined}
          >
            <Languages aria-hidden="true" size={18} />
            <span className="sidebar-link-label">{language === 'en' ? 'EN / বাংলা' : 'বাংলা / EN'}</span>
          </button>
          <button type="button" className="profile-button" onClick={signOut} title="Sign out">
            <span className="profile-avatar">Q</span>
            <span className="sidebar-link-label">
              <strong>Quantara learner</strong>
              <small>Development account</small>
            </span>
            <ChevronLeft className="sidebar-link-label profile-signout" aria-hidden="true" size={16} />
          </button>
        </div>
        <button
          type="button"
          className="sidebar-collapse-button"
          aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
          title="Toggle sidebar (Ctrl/⌘ + B)"
          onClick={toggleExpanded}
        >
          {expanded ? <PanelLeftClose aria-hidden="true" size={18} /> : <PanelLeftOpen aria-hidden="true" size={18} />}
          <span className="sidebar-link-label">Collapse</span>
          {expanded ? <ChevronRight aria-hidden="true" className="collapse-chevron" size={16} /> : null}
        </button>
      </aside>
      <div className="app-content">
        <header className="mobile-app-header">
          <button
            ref={menuButtonRef}
            type="button"
            className="sidebar-icon-button"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            aria-controls="app-sidebar"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu aria-hidden="true" size={20} />
          </button>
          <Link href="/explore" className="mobile-brand">Quantara</Link>
          <button
            type="button"
            className="sidebar-icon-button"
            aria-label={resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            {resolvedTheme === 'dark' ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
