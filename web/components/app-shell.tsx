'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BookOpenCheck,
  BookOpenText,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Compass,
  GraduationCap,
  Languages,
  ListChecks,
  Menu,
  MessageCircle,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Sun,
  Trash2,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { authAdapter } from '@/lib/auth';
import { AuthBar } from '@/components/auth-bar';
import { DeveloperCredit } from '@/components/developer-credit';
import { STORAGE_KEYS, writeStorage } from '@/lib/storage';

const welcomeMessages = [
  {
    role: 'assistant' as const,
    content: 'Hello! Ask me about algebra, data structures, or any concept you want to master.',
  },
];

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

// GRE prep is a separate group so it's discoverable but doesn't push the
// existing tutoring nav around.
const greNavigation = [
  { href: '/gre', label: 'GRE hub', icon: BrainCircuit },
  { href: '/gre/quant', label: 'GRE quant', icon: BookOpenCheck },
  { href: '/gre/vocab', label: 'GRE vocab', icon: Languages },
  { href: '/gre/quant/mock', label: 'GRE mock', icon: ListChecks },
  { href: '/gre/roadmap', label: 'Roadmap', icon: Compass },
  { href: '/gre/progress', label: 'GRE progress', icon: Trophy },
];

const noSubscribe = () => () => {};

function getBackHref(pathname: string): string {
  if (pathname.startsWith('/gre/quant/problem/')) return '/gre/quant';
  if (pathname === '/gre/quant/mock') return '/gre/quant';
  if (/^\/gre\/vocab\/[^/]+\/quiz$/.test(pathname)) {
    return pathname.slice(0, -'/quiz'.length);
  }
  if (pathname.startsWith('/gre/vocab/word/')) return '/gre/vocab';
  if (/^\/gre\/(progress|roadmap)$/.test(pathname)) return '/gre';
  if (/^\/gre\/(quant|vocab)\/[^/]+$/.test(pathname)) {
    return pathname.slice(0, pathname.lastIndexOf('/'));
  }
  return '/explore';
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [expanded, setExpanded] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [language, setLanguage] = useState<'en' | 'bn'>('en');
  const [recentTitle, setRecentTitle] = useState('');
  const [recentDisplayTitle, setRecentDisplayTitle] = useState('');
  const drawerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const themeReady = useSyncExternalStore(noSubscribe, () => true, () => false);
  const isDark = !themeReady || resolvedTheme !== 'light';

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setExpanded(window.localStorage.getItem('quantara.sidebar-expanded') !== 'false');
      setLanguage(window.localStorage.getItem('quantara.language') === 'bn' ? 'bn' : 'en');
      setRecentDisplayTitle(window.localStorage.getItem('quantara.chat-title') ?? '');
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
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function updateRecentChat() {
      try {
        const messages: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEYS.chats) ?? '[]');
        if (!Array.isArray(messages)) return;
        const latest = [...messages].reverse().find(
          (message): message is { role: string; content: string } =>
            typeof message === 'object' &&
            message !== null &&
            'role' in message &&
            'content' in message &&
            message.role === 'user' &&
            typeof message.content === 'string',
        );
        setRecentTitle(latest?.content.slice(0, 42) ?? '');
        setRecentDisplayTitle(window.localStorage.getItem('quantara.chat-title') ?? '');
      } catch {
        setRecentTitle('');
        setRecentDisplayTitle('');
      }
    }
    window.addEventListener('quantara:chats-updated', updateRecentChat);
    return () => window.removeEventListener('quantara:chats-updated', updateRecentChat);
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setDrawerOpen(false));
    return () => window.cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const drawer = drawerRef.current;
    const focusable = drawer?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled])',
    );
    const visibleFocusable = Array.from(focusable ?? []).filter((element) => element.getClientRects().length > 0);
    visibleFocusable[0]?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeDrawer();
        return;
      }
      if (event.key !== 'Tab' || !visibleFocusable.length) return;
      const first = visibleFocusable[0];
      const last = visibleFocusable[visibleFocusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
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
  const isExploreHome = pathname === '/' || pathname === '/explore';
  const showAdmin = process.env.NODE_ENV === 'development';

  const [session, setSession] = useState<{ name: string; email: string } | null>(null);
  useEffect(() => {
    if (authAdapter.kind !== 'google') return;
    let active = true;
    void authAdapter.getSession().then((s) => {
      if (active && s) setSession({ name: s.name, email: s.email });
    });
    return () => {
      active = false;
    };
  }, []);

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
      window.dispatchEvent(new Event('quantara:languagechange'));
      return next;
    });
  }

  function createNewChat() {
    writeStorage(STORAGE_KEYS.chats, welcomeMessages);
    window.localStorage.removeItem('quantara.chat-title');
    setRecentTitle('');
    setRecentDisplayTitle('');
    window.dispatchEvent(new Event('quantara:new-chat'));
    window.dispatchEvent(new Event('quantara:chats-updated'));
    router.push('/chat');
  }

  function renameRecentChat() {
    const title = window.prompt('Rename this chat', recentTitle || 'New chat');
    if (title?.trim()) {
      setRecentTitle(title.trim());
      setRecentDisplayTitle(title.trim());
      window.localStorage.setItem('quantara.chat-title', title.trim());
    }
  }

  function deleteRecentChat() {
    writeStorage(STORAGE_KEYS.chats, welcomeMessages);
    setRecentTitle('');
    setRecentDisplayTitle('');
    window.localStorage.removeItem('quantara.chat-title');
    window.dispatchEvent(new Event('quantara:new-chat'));
    window.dispatchEvent(new Event('quantara:chats-updated'));
  }

  async function signOut() {
    await authAdapter.signOut();
    // Notify any active header bars (this tab + cross-tab via storage).
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('quantara:auth-changed'));
      try {
        window.localStorage.setItem('quantara:auth-changed', String(Date.now()));
      } catch {
        // localStorage may be unavailable (private mode); the in-tab event
        // still fires.
      }
    }
    setSession(null);
    if (authAdapter.kind === 'google') {
      // Hard navigate so the server-rendered layout re-evaluates auth.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/login');
      return;
    }
    router.push('/login');
  }

  function goBack() {
    const historyState: unknown = window.history.state;
    if (
      typeof historyState === 'object' &&
      historyState !== null &&
      'idx' in historyState &&
      typeof historyState.idx === 'number' &&
      historyState.idx > 0
    ) {
      router.back();
      return;
    }
    router.push(getBackHref(pathname));
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
        role={drawerOpen ? 'dialog' : undefined}
        aria-modal={drawerOpen || undefined}
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
        <button type="button" onClick={createNewChat} className="new-chat-button" title="New chat">
          <Plus aria-hidden="true" size={18} />
          <span className="sidebar-link-label">New chat</span>
        </button>
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
          <p className="sidebar-section-label">GRE prep</p>
          {greNavigation.map(({ href, label, icon: Icon }) => {
            // The "/gre" hub matches only the exact path; deeper entries
            // light up on exact match or any subroute.
            const isGreHub = href === '/gre';
            const active = isGreHub
              ? pathname === '/gre'
              : pathname === href || pathname.startsWith(href + '/');
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
            <div className="recent-chat-row">
              <Link href="/chat" className="recent-chat-link" title={recentTitle}>
                <span aria-hidden="true" className="recent-chat-dot" />
                <span className="sidebar-link-label">{recentDisplayTitle || recentTitle}</span>
              </Link>
              <div className="recent-chat-actions">
                <button type="button" onClick={renameRecentChat} aria-label="Rename recent chat" title="Rename chat">
                  <Pencil aria-hidden="true" size={14} />
                </button>
                <button type="button" onClick={deleteRecentChat} aria-label="Delete recent chat" title="Delete chat">
                  <Trash2 aria-hidden="true" size={14} />
                </button>
              </div>
            </div>
          ) : (
            <p className="sidebar-empty sidebar-link-label">Your conversations appear here</p>
          )}
        </section>
        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-link sidebar-action"
            onClick={() => setTheme(isDark ? 'light' : 'dark')}
            aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
            title={!expanded ? 'Switch theme' : undefined}
          >
            {isDark ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
            <span className="sidebar-link-label">{isDark ? 'Light theme' : 'Dark theme'}</span>
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
          {session ? (
            <button type="button" className="profile-button" onClick={signOut} title="Sign out">
              <span className="profile-avatar">Q</span>
              <span className="sidebar-link-label">
                <strong>{session.name}</strong>
                <small>{session.email || (authAdapter.kind === 'google' ? 'Signed in with Google' : 'Development account')}</small>
              </span>
              <ChevronLeft className="sidebar-link-label profile-signout" aria-hidden="true" size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="sidebar-link sidebar-action auth-sidebar-signin"
              onClick={async () => {
                await authAdapter.signIn(pathname && pathname.startsWith('/') && !pathname.startsWith('//') ? pathname : '/chat');
                if (authAdapter.kind === 'dev') {
                  // DevAuthAdapter resolves immediately; refresh the session
                  // so the sidebar flips from the sign-in row to the profile row.
                  const next = await authAdapter.getSession();
                  setSession(next);
                }
              }}
              title="Sign in"
            >
              <span className="profile-avatar" aria-hidden="true">Q</span>
              <span className="sidebar-link-label">
                <strong>Sign in</strong>
                <small>Continue with Google</small>
              </span>
            </button>
          )}
          <DeveloperCredit variant="footer" />
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
        <header className="desktop-app-header">
          {!isExploreHome ? (
            <button type="button" className="app-back-button" onClick={goBack}>
              <ArrowLeft aria-hidden="true" size={17} />
              <span>Back</span>
            </button>
          ) : null}
          <div className="desktop-app-header-right">
            <button
              type="button"
              className="theme-toggle desktop-theme-toggle"
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
            >
              {isDark ? <Sun aria-hidden="true" size={17} /> : <Moon aria-hidden="true" size={17} />}
              <span>{isDark ? 'Light mode' : 'Dark mode'}</span>
            </button>
            <AuthBar variant="desktop" />
          </div>
        </header>
        <header className="mobile-app-header">
          <div className="mobile-app-header-left">
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
            {!isExploreHome ? (
              <button type="button" className="sidebar-icon-button mobile-back-button" aria-label="Go back" onClick={goBack}>
                <ArrowLeft aria-hidden="true" size={18} />
              </button>
            ) : null}
          </div>
          <Link href="/explore" className="mobile-brand">Quantara</Link>
          <div className="mobile-app-header-right">
            <button
              type="button"
              className="sidebar-icon-button theme-toggle-mobile"
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              aria-pressed={isDark}
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
            >
              {isDark ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
            </button>
            <AuthBar variant="mobile" />
          </div>
        </header>
        {children}
        <nav
          aria-label="Mobile navigation"
          className="mobile-tabbar glass-surface fixed inset-x-2 bottom-2 grid grid-cols-5 rounded-[1.65rem] px-1.5 pt-1.5 md:hidden"
        >
          {[
            { href: '/chat', label: 'Chat', icon: MessageCircle },
            { href: '/quiz', label: 'Quiz', icon: BookOpenCheck },
            { href: '/vocab', label: 'Vocab', icon: Languages },
            { href: '/grammar', label: 'Grammar', icon: ClipboardList },
            { href: '/gre', label: 'GRE', icon: BrainCircuit },
          ].map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href ||
              (href === '/chat' && pathname === '/') ||
              (href === '/gre' && pathname.startsWith('/gre/'));
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-2xl font-condensed text-[0.66rem] uppercase tracking-[0.06em] ${
                  active ? 'bg-[#4db8d4]/15 text-[#a9eff7]' : 'text-slate-200/70'
                }`}
              >
                <Icon aria-hidden="true" className="h-4 w-4" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      <DeveloperCredit variant="mobile" />
    </div>
  );
}
