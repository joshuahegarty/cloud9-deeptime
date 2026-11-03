'use client';

import {
  changeOwnPinAction,
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
  KeyRound,
  LogOut,
  Menu,
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
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useState } from 'react';

interface AppShellProps {
  user: UserPublic | null;
  children: React.ReactNode;
}

const PRIMARY_DEMO_USERS = [
  { id: '00000000-0000-0000-0000-000000000004', label: '⭐ Mark — Supervisor • Core Warehouse' },
  { id: '00000000-0000-0000-0000-000000000006', label: '⭐ Edna — Supervisor • Core Warehouse' },
  { id: '00000000-0000-0000-0000-000000000001', label: 'Erica — Core Warehouse Operative' },
  { id: '00000000-0000-0000-0000-000000000002', label: 'Sam — Core Warehouse Operative' },
  { id: '00000000-0000-0000-0000-000000000003', label: 'Alex — Core Warehouse Operative' },
  { id: '00000000-0000-0000-0000-000000000007', label: 'Mason — Core Warehouse Operative' },
];

const ADDITIONAL_DEMO_USER_GROUPS = [
  {
    dept: 'CCELL & Warehouse Support',
    users: [
      { id: '00000000-0000-0000-0000-000000000008', label: 'Ben — CCELL Operative' },
      { id: '00000000-0000-0000-0000-000000000009', label: 'Jess — Warehouse Operative' },
      { id: '00000000-0000-0000-0000-000000000010', label: 'Sabine — Warehouse Operative' },
    ],
  },
  {
    dept: 'People & Operations',
    users: [
      { id: '00000000-0000-0000-0000-000000000011', label: 'Dan Igel — Head of People & Operations' },
      { id: '00000000-0000-0000-0000-000000000012', label: 'Billy — Operations' },
    ],
  },
  {
    dept: 'Sales Team',
    users: [
      { id: '00000000-0000-0000-0000-000000000013', label: 'Mike — Sales' },
      { id: '00000000-0000-0000-0000-000000000014', label: 'Ray — Sales • Warehouse Operative' },
    ],
  },
  {
    dept: 'Marketing & Innovations',
    users: [
      { id: '00000000-0000-0000-0000-000000000015', label: 'Adrian — Marketing & Innovations' },
      { id: '00000000-0000-0000-0000-000000000016', label: 'Danny — Marketing & Innovations' },
      { id: '00000000-0000-0000-0000-000000000017', label: 'Ashton — Marketing & Innovations' },
    ],
  },
  {
    dept: 'Executive & Admin',
    users: [
      { id: '00000000-0000-0000-0000-000000000005', label: 'Josh — CEO, Builder & Admin' },
    ],
  },
];

const DEMO_USERS = [
  ...PRIMARY_DEMO_USERS,
  ...ADDITIONAL_DEMO_USER_GROUPS.flatMap((g) => g.users),
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [demoSwitcherUnlocked, setDemoSwitcherUnlocked] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [activePinField, setActivePinField] = useState<'current' | 'new' | 'confirm'>('new');
  const [showPinDigits, setShowPinDigits] = useState(true);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);
  const [pinSaving, setPinSaving] = useState(false);

  const isForcedPinChange = Boolean(user?.must_change_pin);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (user?.must_change_pin) {
      setActivePinField('new');
      setPinModalOpen(true);
    }
  }, [user?.id, user?.must_change_pin]);

  useEffect(() => {
    const onOpenChangePin = () => {
      setPinError(null);
      setPinSuccess(null);
      setCurrentPinInput('');
      setNewPinInput('');
      setConfirmPinInput('');
      setActivePinField('new');
      setPinModalOpen(true);
    };
    window.addEventListener('c9-open-change-pin', onOpenChangePin);
    return () => window.removeEventListener('c9-open-change-pin', onOpenChangePin);
  }, []);

  const handleSavePinChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setPinSuccess(null);
    if (!/^\d{4}$/.test(newPinInput.trim())) {
      setPinError('Your new PIN must be exactly 4 digits.');
      return;
    }
    if (newPinInput.trim() !== confirmPinInput.trim()) {
      setPinError('New PIN and confirmation do not match.');
      return;
    }
    setPinSaving(true);
    try {
      const res = await changeOwnPinAction({
        currentPin: isForcedPinChange ? undefined : currentPinInput.trim() || undefined,
        newPin: newPinInput.trim(),
        confirmPin: confirmPinInput.trim(),
      });
      if (!res.ok) {
        setPinError(res.error || 'Failed to update PIN.');
      } else {
        setPinSuccess('Your 4-digit PIN has been saved!');
        setCurrentPinInput('');
        setNewPinInput('');
        setConfirmPinInput('');
        setTimeout(() => {
          setPinModalOpen(false);
          setPinSuccess(null);
          router.refresh();
        }, 700);
      }
    } catch (err: any) {
      setPinError(err?.message || 'Failed to update PIN.');
    } finally {
      setPinSaving(false);
    }
  };

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
      pathname !== '/guide' &&
      pathname !== '/feedback'
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

          {/* Desktop Navigation Links (>= lg) */}
          <nav className="hidden lg:flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
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
                    href="/feedback"
                    active={pathname === '/feedback'}
                    icon={<Bug className="w-3.5 h-3.5" />}
                  >
                    Feedback &amp; Roadmap
                  </NavLink>
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
              <kbd className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-emerald-300 font-mono text-[10px] font-black">
                F8
              </kbd>
            </button>

            <button
              type="button"
              onClick={toggleTheme}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition"
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

            {/* Desktop User Controls (>= lg) */}
            {user ? (
              <div className="hidden lg:flex items-center gap-1.5">
                {isStaff || demoSwitcherUnlocked ? (
                  <select
                    value={user.id}
                    onChange={(e) => handleQuickSwitchUser(e.target.value)}
                    className="h-9 max-w-[195px] px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-100 border border-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
                    title="Quick-switch user or role (Mark & Edna first, then Core Warehouse, then Additional Staff by Department)"
                  >
                    <optgroup label="⭐ Supervisors (Mark & Edna) & Core Warehouse">
                      {PRIMARY_DEMO_USERS.map((du) => (
                        <option key={du.id} value={du.id}>
                          {du.label}
                        </option>
                      ))}
                    </optgroup>
                    {ADDITIONAL_DEMO_USER_GROUPS.map((grp) => (
                      <optgroup key={grp.dept} label={`Additional Staff — ${grp.dept}`}>
                        {grp.users.map((du) => (
                          <option key={du.id} value={du.id}>
                            {du.label}
                          </option>
                        ))}
                      </optgroup>
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
                      <span>{user.display_name}</span>
                      {user.job_title && (
                        <span className="hidden sm:inline px-1.5 py-0.5 rounded bg-slate-900 text-sky-300 text-[10px]">
                          {user.job_title}
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
                  onClick={() => {
                    setPinError(null);
                    setPinSuccess(null);
                    setCurrentPinInput('');
                    setNewPinInput('');
                    setConfirmPinInput('');
                    setActivePinField('new');
                    setPinModalOpen(true);
                  }}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-bold border transition whitespace-nowrap ${
                    isForcedPinChange
                      ? 'bg-amber-500 text-slate-950 border-amber-400 animate-pulse'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                  title="Change your 4-digit sign-in PIN"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  <span>Change PIN</span>
                </button>

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

            {/* Mobile & Android Expanding Top Menu Button (< lg) */}
            {user && (
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-expanded={mobileMenuOpen}
                aria-label="Toggle mobile navigation menu"
                className={`lg:hidden inline-flex items-center gap-1.5 h-10 px-3 rounded-xl font-black text-xs border transition ${
                  mobileMenuOpen
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                    : 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                }`}
              >
                {mobileMenuOpen ? (
                  <>
                    <X className="w-4 h-4" />
                    <span>Close</span>
                  </>
                ) : (
                  <>
                    <Menu className="w-4 h-4 text-emerald-400" />
                    <span>Menu</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Expanding Mobile & Android Navigation Drawer (< lg) */}
        {mobileMenuOpen && user && (
          <div className="lg:hidden border-t border-slate-800 bg-slate-950/98 px-3.5 py-4 space-y-4 shadow-2xl animate-in slide-in-from-top-2">
            {/* Navigation Grid (Touch-Friendly 48px+ Tiles for Android / Mobile) */}
            <div>
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2 px-1">
                Navigation Menu
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {isKioskDevice ? (
                  <>
                    <Link
                      href="/kiosk"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`min-h-[48px] px-3 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 border transition ${
                        pathname === '/kiosk'
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                          : 'bg-slate-900 text-slate-200 border-slate-800'
                      }`}
                    >
                      <Tablet className="w-4 h-4 shrink-0" />
                      <span>Kiosk Grid</span>
                    </Link>
                    <Link
                      href="/now?kiosk=1"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`min-h-[48px] px-3 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 border transition ${
                        pathname === '/now'
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                          : 'bg-slate-900 text-slate-200 border-slate-800'
                      }`}
                    >
                      <Clock className="w-4 h-4 shrink-0" />
                      <span>Active Timer ({user.display_name.split(' ')[0]})</span>
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href="/now"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`min-h-[48px] px-3 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 border transition ${
                        pathname === '/now'
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                          : 'bg-slate-900 text-slate-200 border-slate-800'
                      }`}
                    >
                      <Clock className="w-4 h-4 shrink-0" />
                      <span>Now (Timer)</span>
                    </Link>
                    <Link
                      href="/kiosk"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`min-h-[48px] px-3 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 border transition ${
                        pathname === '/kiosk'
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                          : 'bg-slate-900 text-slate-200 border-slate-800'
                      }`}
                    >
                      <Tablet className="w-4 h-4 shrink-0" />
                      <span>Kiosk</span>
                    </Link>
                    {isStaff && (
                      <>
                        <Link
                          href="/floor"
                          onClick={() => setMobileMenuOpen(false)}
                          className={`min-h-[48px] px-3 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 border transition ${
                            pathname === '/floor'
                              ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                              : 'bg-slate-900 text-slate-200 border-slate-800'
                          }`}
                        >
                          <Activity className="w-4 h-4 shrink-0" />
                          <span>Floor Live</span>
                        </Link>
                        <Link
                          href="/entries"
                          onClick={() => setMobileMenuOpen(false)}
                          className={`min-h-[48px] px-3 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 border transition ${
                            pathname === '/entries'
                              ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                              : 'bg-slate-900 text-slate-200 border-slate-800'
                          }`}
                        >
                          <ClipboardList className="w-4 h-4 shrink-0" />
                          <span>Entries</span>
                        </Link>
                        <Link
                          href="/reports"
                          onClick={() => setMobileMenuOpen(false)}
                          className={`min-h-[48px] px-3 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 border transition ${
                            pathname === '/reports'
                              ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                              : 'bg-slate-900 text-slate-200 border-slate-800'
                          }`}
                        >
                          <FileSpreadsheet className="w-4 h-4 shrink-0" />
                          <span>Reports</span>
                        </Link>
                        <Link
                          href="/reports/billing"
                          onClick={() => setMobileMenuOpen(false)}
                          className={`min-h-[48px] px-3 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 border transition ${
                            pathname === '/reports/billing'
                              ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                              : 'bg-slate-900 text-slate-200 border-slate-800'
                          }`}
                        >
                          <Receipt className="w-4 h-4 shrink-0" />
                          <span>Billing</span>
                        </Link>
                        <Link
                          href="/setup"
                          onClick={() => setMobileMenuOpen(false)}
                          className={`min-h-[48px] px-3 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 border transition ${
                            pathname.startsWith('/setup')
                              ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                              : 'bg-slate-900 text-slate-200 border-slate-800'
                          }`}
                        >
                          <Settings className="w-4 h-4 shrink-0" />
                          <span>Setup</span>
                        </Link>
                      </>
                    )}
                    <Link
                      href="/feedback"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`min-h-[48px] px-3 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 border transition ${
                        pathname === '/feedback'
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                          : 'bg-slate-900 text-slate-200 border-slate-800'
                      }`}
                    >
                      <Bug className="w-4 h-4 shrink-0" />
                      <span>Feedback Board</span>
                    </Link>
                    <Link
                      href="/guide"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`min-h-[48px] px-3 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 border transition ${
                        pathname === '/guide'
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                          : 'bg-slate-900 text-slate-200 border-slate-800'
                      }`}
                    >
                      <BookOpen className="w-4 h-4 shrink-0" />
                      <span>Guide &amp; Mindmap</span>
                    </Link>
                  </>
                )}
              </div>
            </div>

            {/* Staff / Demo User Switcher & Quick Controls */}
            <div className="pt-3 border-t border-slate-800/80 space-y-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Signed In As ({user.display_name})
                </label>
                {isStaff || demoSwitcherUnlocked ? (
                  <select
                    value={user.id}
                    onChange={(e) => {
                      setMobileMenuOpen(false);
                      handleQuickSwitchUser(e.target.value);
                    }}
                    className="w-full h-11 px-3 rounded-xl bg-slate-900 text-xs font-bold text-slate-100 border border-slate-700"
                  >
                    <optgroup label="⭐ Supervisors (Mark & Edna) & Core Warehouse">
                      {PRIMARY_DEMO_USERS.map((du) => (
                        <option key={du.id} value={du.id}>
                          {du.label}
                        </option>
                      ))}
                    </optgroup>
                    {ADDITIONAL_DEMO_USER_GROUPS.map((grp) => (
                      <optgroup key={grp.dept} label={`Additional Staff — ${grp.dept}`}>
                        {grp.users.map((du) => (
                          <option key={du.id} value={du.id}>
                            {du.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white">
                      {user.display_name} ({user.job_title || user.role})
                    </span>
                    <button
                      type="button"
                      onClick={() => setDemoSwitcherUnlocked(true)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 text-xs font-bold text-amber-300 border border-slate-800"
                    >
                      Unlock Demo Switcher
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setPinError(null);
                    setPinSuccess(null);
                    setCurrentPinInput('');
                    setNewPinInput('');
                    setConfirmPinInput('');
                    setActivePinField('new');
                    setPinModalOpen(true);
                  }}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-amber-300 border border-slate-800 flex items-center justify-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Change PIN</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    setFeedbackOpen(true);
                  }}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-emerald-300 border border-slate-800 flex items-center justify-center gap-1.5"
                >
                  <Bug className="w-3.5 h-3.5" />
                  <span>Report / Idea</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    toggleTheme();
                    setMobileMenuOpen(false);
                  }}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-slate-200 border border-slate-800 flex items-center justify-center gap-1.5"
                >
                  {lightMode ? (
                    <>
                      <Moon className="w-3.5 h-3.5" />
                      <span>Dark Mode</span>
                    </>
                  ) : (
                    <>
                      <Sun className="w-3.5 h-3.5 text-amber-400" />
                      <span>Light Mode</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="min-h-[44px] px-3 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900 text-xs font-bold text-rose-200 border border-rose-500/40 flex items-center justify-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}
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

      {/* Change PIN / First-Login Set Personal PIN Modal */}
      {pinModalOpen && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <KeyRound className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-sm font-black text-white">
                    {isForcedPinChange
                      ? 'Set Your Personal 4-Digit PIN'
                      : 'Change Your 4-Digit PIN'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    {user.display_name} • {user.job_title || user.role}
                  </p>
                </div>
              </div>
              {!isForcedPinChange && (
                <button
                  type="button"
                  onClick={() => setPinModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <form onSubmit={handleSavePinChange} className="p-5 space-y-4">
              {isForcedPinChange && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 leading-relaxed">
                  Welcome to <strong>Cloud9 DeepTime</strong>! Since you signed in with a temporary invite PIN, please choose your own personal 4-digit PIN for fast sign-in going forward.
                </div>
              )}

              {!isForcedPinChange && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Current 4-Digit PIN (Optional if unknown)
                  </label>
                  <input
                    type={showPinDigits ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={4}
                    value={currentPinInput}
                    onFocus={() => setActivePinField('current')}
                    onChange={(e) => setCurrentPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    className={`w-full h-11 px-3 rounded-xl bg-slate-950 border text-white font-mono text-lg tracking-widest focus:outline-none ${
                      activePinField === 'current' ? 'border-emerald-500' : 'border-slate-700'
                    }`}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                    New 4-Digit PIN *
                  </label>
                  <input
                    type={showPinDigits ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={4}
                    required
                    value={newPinInput}
                    onFocus={() => setActivePinField('new')}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setNewPinInput(val);
                      if (val.length === 4) setActivePinField('confirm');
                    }}
                    placeholder="1234"
                    className={`w-full h-12 px-3 rounded-xl bg-slate-950 border text-emerald-300 font-mono text-xl font-black tracking-widest text-center focus:outline-none ${
                      activePinField === 'new'
                        ? 'border-emerald-400 ring-1 ring-emerald-400/50'
                        : 'border-slate-700'
                    }`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1">
                    Confirm New PIN *
                  </label>
                  <input
                    type={showPinDigits ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={4}
                    required
                    value={confirmPinInput}
                    onFocus={() => setActivePinField('confirm')}
                    onChange={(e) => setConfirmPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="1234"
                    className={`w-full h-12 px-3 rounded-xl bg-slate-950 border text-emerald-300 font-mono text-xl font-black tracking-widest text-center focus:outline-none ${
                      activePinField === 'confirm'
                        ? 'border-emerald-400 ring-1 ring-emerald-400/50'
                        : 'border-slate-700'
                    }`}
                  />
                </div>
              </div>

              {/* Touch Keypad for Tablet / Phone PIN Entry */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    Typing into:{' '}
                    <strong className="text-emerald-300 uppercase">
                      {activePinField === 'new'
                        ? 'New 4-Digit PIN'
                        : activePinField === 'confirm'
                        ? 'Confirm New PIN'
                        : 'Current PIN'}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPinDigits((p) => !p)}
                    className="text-sky-400 hover:underline font-bold"
                  >
                    {showPinDigits ? 'Hide Digits' : 'Show Digits'}
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setPinError(null);
                        if (activePinField === 'current') {
                          setCurrentPinInput((prev) => (prev + d).slice(0, 4));
                        } else if (activePinField === 'new') {
                          const next = (newPinInput + d).slice(0, 4);
                          setNewPinInput(next);
                          if (next.length === 4) setActivePinField('confirm');
                        } else {
                          setConfirmPinInput((prev) => (prev + d).slice(0, 4));
                        }
                      }}
                      className="h-11 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-emerald-500 active:text-slate-950 border border-slate-700 text-lg font-black text-white transition"
                    >
                      {d}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setPinError(null);
                      if (activePinField === 'current') setCurrentPinInput('');
                      else if (activePinField === 'new') setNewPinInput('');
                      else setConfirmPinInput('');
                    }}
                    className="h-11 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-400"
                  >
                    CLEAR
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPinError(null);
                      if (activePinField === 'current') {
                        setCurrentPinInput((prev) => (prev + '0').slice(0, 4));
                      } else if (activePinField === 'new') {
                        const next = (newPinInput + '0').slice(0, 4);
                        setNewPinInput(next);
                        if (next.length === 4) setActivePinField('confirm');
                      } else {
                        setConfirmPinInput((prev) => (prev + '0').slice(0, 4));
                      }
                    }}
                    className="h-11 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-emerald-500 active:text-slate-950 border border-slate-700 text-lg font-black text-white transition"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPinError(null);
                      if (activePinField === 'current') {
                        setCurrentPinInput((prev) => prev.slice(0, -1));
                      } else if (activePinField === 'new') {
                        setNewPinInput((prev) => prev.slice(0, -1));
                      } else {
                        setConfirmPinInput((prev) => prev.slice(0, -1));
                      }
                    }}
                    className="h-11 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300"
                  >
                    ⌫ Back
                  </button>
                </div>
              </div>

              {pinError && (
                <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-700 text-xs font-semibold text-rose-200">
                  {pinError}
                </div>
              )}
              {pinSuccess && (
                <div className="p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-700 text-xs font-semibold text-emerald-200">
                  {pinSuccess}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                {!isForcedPinChange && (
                  <button
                    type="button"
                    onClick={() => setPinModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={pinSaving}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-black shadow-lg shadow-emerald-500/20"
                >
                  {pinSaving ? 'Saving PIN...' : 'Save Personal 4-Digit PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
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
