'use client';

import {
  logoutAction,
  quickSwitchUserAction,
  replayOfflineQueueAction,
  runShiftEndJobAction,
} from '@/app/actions';
import { clearOfflineQueueItems, getOfflineQueueItems } from '@/lib/offline-queue';
import { UserPublic } from '@/lib/types';
import { FeedbackModal } from '@/components/FeedbackModal';
import {
  Activity,
  BookOpen,
  Bug,
  ClipboardList,
  Clock,
  FileSpreadsheet,
  LogOut,
  MonitorSmartphone,
  Moon,
  Receipt,
  RefreshCw,
  Settings,
  Sun,
  Tablet,
  Unlock,
  Wifi,
  WifiOff,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';

interface AppShellProps {
  user: UserPublic | null;
  children: React.ReactNode;
}

const DEMO_USERS = [
  { id: '00000000-0000-0000-0000-000000000005', label: '👑 Josh — CEO, Builder & Admin' },
  { id: '00000000-0000-0000-0000-000000000004', label: '⭐ Mark — Supervisor (Core Warehouse)' },
  { id: '00000000-0000-0000-0000-000000000006', label: '⭐ Edna — Supervisor (Core Warehouse)' },
  { id: '00000000-0000-0000-0000-000000000001', label: '⭐ Erica — Operative (Core Warehouse)' },
  { id: '00000000-0000-0000-0000-000000000002', label: '⭐ Sam — Operative (Core Warehouse)' },
  { id: '00000000-0000-0000-0000-000000000003', label: '⭐ Alex — Operative (Core Warehouse)' },
  { id: '00000000-0000-0000-0000-000000000007', label: '⭐ Mason — Operative (Core Warehouse)' },
  { id: '00000000-0000-0000-0000-000000000008', label: 'Ben — CCELL Operative (CCELL)' },
  { id: '00000000-0000-0000-0000-000000000009', label: 'Jess — Warehouse Operative' },
  { id: '00000000-0000-0000-0000-000000000010', label: 'Sabine — Warehouse Operative' },
  { id: '00000000-0000-0000-0000-000000000011', label: 'Dan Igel — Head of People & Ops' },
  { id: '00000000-0000-0000-0000-000000000012', label: 'Billy — Operations' },
  { id: '00000000-0000-0000-0000-000000000013', label: 'Mike — Sales' },
  { id: '00000000-0000-0000-0000-000000000014', label: 'Ray — Sales (Warehouse Support)' },
  { id: '00000000-0000-0000-0000-000000000015', label: 'Adrian — Marketing & Innovations' },
  { id: '00000000-0000-0000-0000-000000000016', label: 'Danny — Marketing & Innovations' },
  { id: '00000000-0000-0000-0000-000000000017', label: 'Ashton — Marketing & Innovations' },
];

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [isKioskDevice, setIsKioskDevice] = useState(false);
  const [lightMode, setLightMode] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [demoSwitcherUnlocked, setDemoSwitcherUnlocked] = useState(false);

  // Automatic 7:00 PM (19:00 Europe/London) End-of-Shift Auto-Close & Auto-Logout (Item #19)
  useEffect(() => {
    if (!user || user.role !== 'operative') return;
    const checkAfter7pm = async () => {
      try {
        const londonHourStr = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/London',
          hour: '2-digit',
          hour12: false,
        }).format(new Date());
        const londonDateStr = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Europe/London',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date());
        const hour = parseInt(londonHourStr, 10);
        if (hour >= 19) {
          const guardKey = `c9_auto_shift_close_${londonDateStr}_${user.id}`;
          if (window.sessionStorage.getItem(guardKey) !== 'done') {
            window.sessionStorage.setItem(guardKey, 'done');
            await runShiftEndJobAction();
            await logoutAction();
            router.push(isKioskDevice ? '/kiosk' : '/login');
            router.refresh();
          }
        }
      } catch {
        // ignore
      }
    };
    const interval = setInterval(checkAfter7pm, 60000);
    return () => clearInterval(interval);
  }, [user, isKioskDevice, router]);

  // Global F8 shortcut listener: opens/toggles Bug Report & Feature Request modal from any screen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F8') {
        e.preventDefault();
        setFeedbackOpen((prev) => !prev);
      } else if (e.key === 'Escape' && feedbackOpen) {
        setFeedbackOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [feedbackOpen]);

  const refreshQueueCount = useCallback(async () => {
    const items = await getOfflineQueueItems();
    setPendingCount(items.length);
  }, []);

  const syncOfflineQueue = useCallback(async () => {
    if (syncing) return;
    const items = await getOfflineQueueItems();
    if (items.length === 0) {
      setPendingCount(0);
      return;
    }
    setSyncing(true);
    try {
      const res = await replayOfflineQueueAction(items);
      if (res.ok) {
        await clearOfflineQueueItems(items.map((i) => i.id));
        setPendingCount(0);
        router.refresh();
      }
    } catch {
      // Still offline
    } finally {
      setSyncing(false);
    }
  }, [router, syncing]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    const checkKioskState = () => {
      const fromStorage = window.localStorage.getItem('kiosk') === 'true';
      const fromQuery = window.location.search.includes('kiosk=1');
      setIsKioskDevice(fromStorage || fromQuery);
    };

    checkKioskState();

    const savedTheme = window.localStorage.getItem('c9_theme');
    if (savedTheme === 'light') {
      setLightMode(true);
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      setLightMode(false);
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }

    setIsOnline(navigator.onLine);
    refreshQueueCount();

    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineQueue();
    };
    const handleOffline = () => setIsOnline(false);
    const handleQueueChange = () => {
      refreshQueueCount();
    };
    const handleKioskChange = () => {
      checkKioskState();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('c9-offline-queue-changed', handleQueueChange);
    window.addEventListener('c9-kiosk-changed', handleKioskChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('c9-offline-queue-changed', handleQueueChange);
      window.removeEventListener('c9-kiosk-changed', handleKioskChange);
    };
  }, [pathname, refreshQueueCount, syncOfflineQueue]);

  // Enforce kiosk lock: if device is locked into kiosk mode, keep navigation on /kiosk, /now, or /login
  useEffect(() => {
    const lockedInStorage =
      typeof window !== 'undefined' && window.localStorage.getItem('kiosk') === 'true';
    if (
      lockedInStorage &&
      pathname !== '/kiosk' &&
      pathname !== '/now' &&
      pathname !== '/login' &&
      pathname !== '/guide'
    ) {
      router.replace('/kiosk');
    }
  }, [isKioskDevice, pathname, router]);

  const toggleTheme = () => {
    const nextLight = !lightMode;
    setLightMode(nextLight);
    if (nextLight) {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      window.localStorage.setItem('c9_theme', 'light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
      window.localStorage.setItem('c9_theme', 'dark');
    }
  };

  const enableKioskMode = () => {
    window.localStorage.setItem('kiosk', 'true');
    setIsKioskDevice(true);
    window.dispatchEvent(new CustomEvent('c9-kiosk-changed'));
    router.push('/kiosk');
  };

  const exitKioskMode = () => {
    window.localStorage.removeItem('kiosk');
    setIsKioskDevice(false);
    window.dispatchEvent(new CustomEvent('c9-kiosk-changed'));
    if (pathname === '/now') {
      router.replace('/now');
    }
    router.refresh();
  };

  const handleQuickSwitchUser = async (targetUserId: string) => {
    if (!targetUserId) return;
    window.localStorage.removeItem('kiosk');
    setIsKioskDevice(false);
    window.dispatchEvent(new CustomEvent('c9-kiosk-changed'));
    const res = await quickSwitchUserAction({ userId: targetUserId });
    if (res.ok && res.user) {
      if (res.user.role === 'operative') {
        window.location.href = '/now';
      } else {
        router.refresh();
      }
    }
  };

  const handleLogout = async () => {
    await logoutAction();
    if (isKioskDevice) {
      router.push('/kiosk');
    } else {
      router.push('/login');
    }
    router.refresh();
  };

  const isStaff = user && (user.role === 'supervisor' || user.role === 'admin');

  return (
    <div className="c9-shell min-h-screen flex flex-col bg-slate-950 text-slate-50 transition-colors duration-150">
      {/* Top Bar */}
      <header className="nav-bar sticky top-0 z-40 border-b border-slate-800/40 bg-slate-900/95 backdrop-blur-md shadow-lg">
        <div className="max-w-7xl mx-auto px-3 sm:px-5 h-16 flex items-center justify-between gap-2">
          {/* Brand Logo — Single Line, Never Wraps */}
          <Link
            href={isKioskDevice ? '/kiosk' : user ? '/now' : '/login'}
            className="flex items-center gap-2.5 shrink-0 group"
          >
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-slate-950 flex items-center justify-center font-black text-sm shadow-md shadow-emerald-500/20 group-hover:scale-105 transition">
              C9
            </span>
            <div className="whitespace-nowrap leading-none">
              <span className="font-black text-base tracking-tight text-white">
                Cloud9
              </span>
              <span className="hidden xl:inline-block ml-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
                Task Timer
              </span>
            </div>
          </Link>

          {/* Navigation Links — Clean Single Row with No Scrollbar */}
          <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
            {isKioskDevice ? (
              <>
                <NavLink
                  href="/kiosk"
                  active={pathname === '/kiosk'}
                  icon={<Tablet className="w-3.5 h-3.5" />}
                >
                  Kiosk Grid
                </NavLink>
                {user && (
                  <NavLink
                    href="/now?kiosk=1"
                    active={pathname === '/now'}
                    icon={<Clock className="w-3.5 h-3.5" />}
                  >
                    Active Timer ({user.display_name.split(' ')[0]})
                  </NavLink>
                )}
              </>
            ) : (
              user && (
                <>
                  <NavLink
                    href="/now"
                    active={pathname === '/now'}
                    icon={<Clock className="w-3.5 h-3.5" />}
                  >
                    Now
                  </NavLink>
                  <NavLink
                    href="/kiosk"
                    active={pathname === '/kiosk'}
                    icon={<Tablet className="w-3.5 h-3.5" />}
                  >
                    Kiosk
                  </NavLink>
                  {isStaff && (
                    <>
                      <NavLink
                        href="/floor"
                        active={pathname === '/floor'}
                        icon={<Activity className="w-3.5 h-3.5" />}
                      >
                        Floor
                      </NavLink>
                      <NavLink
                        href="/entries"
                        active={pathname === '/entries'}
                        icon={<ClipboardList className="w-3.5 h-3.5" />}
                      >
                        Entries
                      </NavLink>
                      <NavLink
                        href="/reports"
                        active={pathname === '/reports'}
                        icon={<FileSpreadsheet className="w-3.5 h-3.5" />}
                      >
                        Reports
                      </NavLink>
                      <NavLink
                        href="/reports/billing"
                        active={pathname === '/reports/billing'}
                        icon={<Receipt className="w-3.5 h-3.5" />}
                      >
                        Billing
                      </NavLink>
                      <NavLink
                        href="/setup"
                        active={pathname.startsWith('/setup')}
                        icon={<Settings className="w-3.5 h-3.5" />}
                      >
                        Setup
                      </NavLink>
                    </>
                  )}
                  <NavLink
                    href="/guide"
                    active={pathname === '/guide'}
                    icon={<BookOpen className="w-3.5 h-3.5" />}
                  >
                    Guide &amp; Mindmap
                  </NavLink>
                </>
              )
            )}
          </nav>

          {/* Status & User Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Offline / Pending Sync Indicator */}
            {(!isOnline || pendingCount > 0) && (
              <button
                type="button"
                onClick={syncOfflineQueue}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold border whitespace-nowrap ${
                  !isOnline
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                    : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                }`}
                title="Pending offline actions"
              >
                {!isOnline ? (
                  <WifiOff className="w-3.5 h-3.5" />
                ) : (
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                )}
                <span>
                  {!isOnline ? 'Offline' : 'Sync'}
                  {pendingCount > 0 ? ` (${pendingCount})` : ''}
                </span>
              </button>
            )}

            {isOnline && pendingCount === 0 && (
              <span
                className="hidden xl:inline-flex items-center gap-1 text-[11px] text-emerald-400 font-semibold px-2 py-1 rounded-md bg-emerald-950/60 border border-emerald-800/50 whitespace-nowrap"
                title="Connected"
              >
                <Wifi className="w-3 h-3" />
                Online
              </span>
            )}

            {!isKioskDevice ? (
              <button
                type="button"
                onClick={enableKioskMode}
                className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 whitespace-nowrap transition"
                title="Lock this tablet into shared floor Kiosk mode"
              >
                <MonitorSmartphone className="w-3.5 h-3.5 text-amber-400" />
                Lock Kiosk
              </button>
            ) : (
              <button
                type="button"
                onClick={exitKioskMode}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 shadow whitespace-nowrap transition"
                title="Exit Kiosk Mode and restore full navigation"
              >
                <Unlock className="w-3.5 h-3.5" />
                Exit Kiosk
              </button>
            )}

            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition whitespace-nowrap"
              title="Submit a Bug Report or Feature Request (Shortcut: F8)"
            >
              <Bug className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden md:inline">Report / Idea</span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-emerald-300 font-mono text-[10px] font-black">
                F8
              </kbd>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition"
              title={lightMode ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              aria-label="Toggle theme"
            >
              {lightMode ? (
                <>
                  <Moon className="w-4 h-4 text-slate-600" />
                  <span className="hidden xl:inline">Dark</span>
                </>
              ) : (
                <>
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span className="hidden xl:inline">Light</span>
                </>
              )}
            </button>

            {user ? (
              <div className="flex items-center gap-1.5">
                {isStaff || demoSwitcherUnlocked ? (
                  <select
                    value={user.id}
                    onChange={(e) => handleQuickSwitchUser(e.target.value)}
                    className="h-9 max-w-[195px] px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-100 border border-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
                    title="Quick-switch user or role (Operative / Supervisor / Admin)"
                  >
                    {DEMO_USERS.map((du) => (
                      <option key={du.id} value={du.id}>
                        {du.label}
                      </option>
                    ))}
                    {!DEMO_USERS.some((du) => du.id === user.id) && (
                      <option value={user.id}>
                        {user.display_name} ({user.role})
                      </option>
                    )}
                  </select>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="h-9 px-3 rounded-lg bg-slate-800 text-xs font-bold text-slate-100 border border-slate-700 inline-flex items-center gap-1.5">
                      <span>{user.is_core_warehouse ? '⭐ ' : ''}{user.display_name}</span>
                      {user.job_title && (
                        <span className="hidden sm:inline px-1.5 py-0.5 rounded bg-slate-900 text-sky-300 text-[10px]">
                          {user.job_title}
                        </span>
                      )}
                      {user.team_name && (
                        <span className="hidden lg:inline px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 text-[10px]">
                          {user.team_name}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDemoSwitcherUnlocked(true)}
                      className="h-9 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-[10px] font-bold text-slate-400 hover:text-amber-300 border border-slate-800 transition"
                      title="Unlock Demo Role Switcher (For testing / walkthrough)"
                    >
                      Demo
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleLogout}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-rose-950/80 hover:text-rose-300 text-slate-300 border border-slate-700 transition"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              pathname !== '/login' && (
                <Link
                  href="/login"
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 whitespace-nowrap"
                >
                  Sign In
                </Link>
              )
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">{children}</main>

      {/* Global F8 Bug Report & Feature Request Modal */}
      <FeedbackModal
        isOpen={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        user={user}
        currentPath={pathname}
      />
    </div>
  );
}

function NavLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
        active
          ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/20'
          : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
      }`}
    >
      {icon}
      <span>{children}</span>
    </Link>
  );
}
