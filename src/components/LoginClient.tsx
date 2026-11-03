'use client';

import { loginByPinAction, loginStaffAction } from '@/app/actions';
import {
  ADDITIONAL_GROUP_ORDER,
  getAdditionalStaffGroupLabel,
  getRoleBadgeClass,
  isPrimaryStaffMember,
  sortCoreStaffFirst,
} from '@/lib/roleBadge';
import { UserPublic } from '@/lib/types';
import {
  ArrowRight,
  ChevronDown,
  Delete,
  KeyRound,
  Lock,
  ShieldCheck,
  Tablet,
  UserCheck,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface LoginClientProps {
  operatives: UserPublic[];
}

export function LoginClient({ operatives }: LoginClientProps) {
  const [mode, setMode] = useState<'pin' | 'staff'>('pin');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params?.get('mode') === 'staff') {
        setMode('staff');
      }
    }
  }, []);

  // Separate loading states so PIN and Staff tabs never block each other
  const [pinLoading, setPinLoading] = useState(false);
  const [staffLoading, setStaffLoading] = useState(false);

  // Operative PIN state
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [showOtherLoginStaff, setShowOtherLoginStaff] = useState(false);
  const [openLoginDepts, setOpenLoginDepts] = useState<Record<string, boolean>>({});
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sortedOperatives = React.useMemo(
    () => sortCoreStaffFirst(operatives),
    [operatives]
  );

  // Staff email/password state
  const [email, setEmail] = useState('josh@cloud9fulfilment.co.uk');
  const [password, setPassword] = useState('password123');
  const [launchAsKiosk, setLaunchAsKiosk] = useState(false);

  const submitPin = async (
    pinToSubmit: string,
    userIdOverride?: string,
    oneClickUserId?: string
  ) => {
    if (pinLoading) return;
    if (!oneClickUserId && pinToSubmit.length !== 4) {
      setError('Please enter a 4-digit PIN.');
      return;
    }

    setError(null);
    setPinLoading(true);
    try {
      const res = await loginByPinAction({
        pin: pinToSubmit,
        userId: (userIdOverride ?? selectedUserId) || undefined,
        oneClickUserId,
        clockInIfNeeded: true,
      });

      if (!res.ok) {
        setError(res.error || 'Incorrect PIN');
        setPin('');
        setPinLoading(false);
        return;
      }

      const destination =
        res.user?.role === 'supervisor' || res.user?.role === 'admin'
          ? '/floor'
          : '/now';
      window.location.href = destination;
    } catch (err: any) {
      setError(err?.message || 'Could not sign in with PIN.');
      setPinLoading(false);
    }
  };

  const handleDigit = (digit: string) => {
    if (pinLoading) return;
    setError(null);
    const nextPin = (pin + digit).slice(0, 4);
    setPin(nextPin);
  };

  const handleBackspace = () => {
    if (pinLoading) return;
    setError(null);
    setPin((prev) => prev.slice(0, -1));
  };

  // Allow typing digits and pressing Enter on keyboard when in PIN mode
  useEffect(() => {
    if (mode !== 'pin') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)
      ) {
        return;
      }
      if (/^\d$/.test(e.key)) {
        setPin((prev) => (prev + e.key).slice(0, 4));
        setError(null);
      } else if (e.key === 'Backspace') {
        setPin((prev) => prev.slice(0, -1));
      } else if (e.key === 'Enter' && pin.length === 4) {
        submitPin(pin);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const executeStaffLogin = async (targetEmail: string, targetPassword: string) => {
    if (staffLoading) return;
    setError(null);
    setStaffLoading(true);

    try {
      const res = await loginStaffAction({
        email: targetEmail,
        password: targetPassword,
      });

      if (!res.ok) {
        setError(res.error || 'Sign-in failed');
        setStaffLoading(false);
        return;
      }

      if (launchAsKiosk) {
        window.localStorage.setItem('kiosk', 'true');
        window.dispatchEvent(new CustomEvent('c9-kiosk-changed'));
        window.location.href = '/kiosk';
      } else if (res.user?.role === 'supervisor' || res.user?.role === 'admin') {
        window.location.href = '/floor';
      } else {
        window.location.href = '/now';
      }
    } catch (err: any) {
      setError(err?.message || 'Sign-in failed');
      setStaffLoading(false);
    }
  };

  const handleStaffSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeStaffLogin(email, password);
  };

  return (
    <div className="max-w-md mx-auto py-4 sm:py-8">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-2xl">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-black tracking-tight text-white">
            Cloud9 Fulfilment
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Sheffield 3PL Warehouse Task &amp; Productivity Timer
          </p>
        </div>

        {/* Mode Switcher */}
        <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-950 rounded-xl border border-slate-800 mb-6">
          <button
            type="button"
            onClick={() => {
              setMode('pin');
              setError(null);
              setPinLoading(false);
            }}
            className={`btn-glove rounded-lg text-sm font-bold flex items-center justify-center gap-2 ${
              mode === 'pin'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            Operative PIN
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('staff');
              setError(null);
              setStaffLoading(false);
            }}
            className={`btn-glove rounded-lg text-sm font-bold flex items-center justify-center gap-2 ${
              mode === 'staff'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Supervisor / Admin
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3.5 rounded-xl bg-rose-950/90 border border-rose-500/60 text-rose-200 text-sm font-semibold text-center">
            {error}
          </div>
        )}

        {mode === 'pin' ? (
          <div>
            {/* Optional Operative Name Filter */}
            <div className="mb-4">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Team Member (optional — or enter 4-digit PIN directly)
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                  setPin('');
                  setError(null);
                }}
                className="w-full h-14 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold text-sm focus:outline-none focus:border-emerald-500"
              >
                <option value="">Any User (Match by 4-Digit PIN)</option>
                <optgroup label="⭐ Supervisors (Mark & Edna) & Core Warehouse">
                  {sortedOperatives
                    .filter((op) => isPrimaryStaffMember(op))
                    .map((op) => (
                      <option key={op.id} value={op.id}>
                        {op.display_name} — {op.job_title || op.role}
                      </option>
                    ))}
                </optgroup>
                {ADDITIONAL_GROUP_ORDER.map((deptLabel) => {
                  const deptMembers = sortedOperatives.filter(
                    (op) =>
                      !isPrimaryStaffMember(op) &&
                      getAdditionalStaffGroupLabel(op) === deptLabel
                  );
                  if (deptMembers.length === 0) return null;
                  return (
                    <optgroup key={deptLabel} label={`Additional Staff — ${deptLabel}`}>
                      {deptMembers.map((op) => (
                        <option key={op.id} value={op.id}>
                          {op.display_name} — {op.job_title || op.role}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            {/* 4-Digit PIN Display */}
            <div className="flex justify-center gap-4 my-4">
              {[0, 1, 2, 3].map((idx) => {
                const filled = idx < pin.length;
                return (
                  <div
                    key={idx}
                    className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-black transition ${
                      filled
                        ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                        : 'border-slate-700 bg-slate-950 text-slate-600'
                    }`}
                  >
                    {filled ? pin[idx] : ''}
                  </div>
                );
              })}
            </div>

            {/* Glove-sized Numeric Keypad (min 56px tall) */}
            <div className="grid grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  disabled={pinLoading}
                  onClick={() => handleDigit(digit)}
                  className="btn-glove-lg rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-emerald-500 active:text-slate-950 border border-slate-700 text-2xl font-black text-white"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                disabled={pinLoading}
                onClick={() => {
                  setPin('');
                  setError(null);
                }}
                className="btn-glove-lg rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-sm font-bold text-slate-400"
              >
                CLEAR
              </button>
              <button
                type="button"
                disabled={pinLoading}
                onClick={() => handleDigit('0')}
                className="btn-glove-lg rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-emerald-500 active:text-slate-950 border border-slate-700 text-2xl font-black text-white"
              >
                0
              </button>
              <button
                type="button"
                disabled={pinLoading}
                onClick={handleBackspace}
                className="btn-glove-lg rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 flex items-center justify-center"
                aria-label="Backspace"
              >
                <Delete className="w-6 h-6" />
              </button>
            </div>

            {/* Explicit Sign In with PIN Button */}
            <button
              type="button"
              disabled={pinLoading || pin.length !== 4}
              onClick={() => submitPin(pin)}
              className={`w-full mt-4 btn-glove-lg rounded-xl text-base font-black flex items-center justify-center gap-2 shadow-lg transition ${
                pin.length === 4
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              }`}
            >
              <span>{pinLoading ? 'Signing In...' : 'Sign In with PIN'}</span>
              <ArrowRight className="w-5 h-5" />
            </button>

            {/* Mark & Edna First + Core Warehouse Operatives + Collapsible Additional Staff by Department */}
            <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-400 space-y-2.5">
              <div className="font-bold text-slate-300 uppercase tracking-wider">
                1-Click PIN Sign-In (Mark &amp; Edna + Core Warehouse Team):
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { name: 'Mark', role: 'Supervisor • Core Warehouse', pin: '4444' },
                  { name: 'Edna', role: 'Supervisor • Core Warehouse', pin: '4445' },
                  { name: 'Erica', role: 'Core Warehouse Operative', pin: '1111' },
                  { name: 'Sam', role: 'Core Warehouse Operative', pin: '2222' },
                  { name: 'Alex', role: 'Core Warehouse Operative', pin: '3333' },
                  { name: 'Mason', role: 'Core Warehouse Operative', pin: '1004' },
                ].map((m) => {
                  const matchedOp = sortedOperatives.find(
                    (op) => op.display_name.toLowerCase() === m.name.toLowerCase()
                  );
                  return (
                  <button
                    key={m.pin}
                    type="button"
                    disabled={pinLoading}
                    onClick={() => {
                      setPin(m.pin);
                      submitPin(m.pin, matchedOp?.id, matchedOp?.id);
                    }}
                    className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left transition"
                  >
                    <div className="font-bold text-white text-xs">{m.name}</div>
                    <div className="mt-1 mb-0.5">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded border text-[9px] font-bold truncate max-w-full ${getRoleBadgeClass(
                          m.role
                        )}`}
                      >
                        {m.role}
                      </span>
                    </div>
                    <div className="text-emerald-400 font-mono text-[10px]">PIN: {m.pin}</div>
                  </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setShowOtherLoginStaff((prev) => !prev)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left font-bold text-slate-200 flex items-center justify-between transition"
              >
                <span>
                  {showOtherLoginStaff ? '▾ Hide' : '▸ Show'} Additional Staff Members (11)
                </span>
                <span className="text-[10px] text-sky-400 font-semibold">
                  Grouped by Department / Role
                </span>
              </button>

              {showOtherLoginStaff && (
                <div className="space-y-2 pt-1">
                  {[
                    {
                      dept: 'CCELL & Warehouse Support',
                      members: [
                        { name: 'Ben', role: 'CCELL Operative', pin: '1005' },
                        { name: 'Jess', role: 'Warehouse Operative', pin: '1006' },
                        { name: 'Sabine', role: 'Warehouse Operative', pin: '1007' },
                      ],
                    },
                    {
                      dept: 'People & Operations',
                      members: [
                        { name: 'Dan Igel', role: 'Head of People & Operations', pin: '1008' },
                        { name: 'Billy', role: 'Operations', pin: '1009' },
                      ],
                    },
                    {
                      dept: 'Sales Team',
                      members: [
                        { name: 'Mike', role: 'Sales', pin: '1010' },
                        { name: 'Ray', role: 'Sales • Warehouse Operative', pin: '1011' },
                      ],
                    },
                    {
                      dept: 'Marketing & Innovations',
                      members: [
                        { name: 'Adrian', role: 'Marketing & Innovations', pin: '1012' },
                        { name: 'Danny', role: 'Marketing & Innovations', pin: '1013' },
                        { name: 'Ashton', role: 'Marketing & Innovations', pin: '1014' },
                      ],
                    },
                    {
                      dept: 'Executive & Admin',
                      members: [
                        { name: 'Josh', role: 'CEO, Builder & Admin', pin: '9999' },
                      ],
                    },
                  ].map((group) => {
                    const isOpen = openLoginDepts[group.dept] ?? true;
                    return (
                      <div
                        key={group.dept}
                        className="rounded-xl border border-slate-800 bg-slate-950/80 overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setOpenLoginDepts((prev) => ({
                              ...prev,
                              [group.dept]: !isOpen,
                            }))
                          }
                          className="w-full px-3 py-2 flex items-center justify-between text-left bg-slate-900/70 hover:bg-slate-800/80 transition"
                        >
                          <span className="text-[11px] font-black uppercase tracking-wider text-amber-300">
                            {group.dept} ({group.members.length})
                          </span>
                          <ChevronDown
                            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                              isOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        {isOpen && (
                          <div className="p-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {group.members.map((m) => {
                              const matchedOp = sortedOperatives.find(
                                (op) => op.display_name.toLowerCase() === m.name.toLowerCase()
                              );
                              return (
                              <button
                                key={m.pin}
                                type="button"
                                disabled={pinLoading}
                                onClick={() => {
                                  setPin(m.pin);
                                  submitPin(m.pin, matchedOp?.id, matchedOp?.id);
                                }}
                                className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-left transition"
                              >
                                <div className="font-bold text-white text-xs">{m.name}</div>
                                <div className="mt-1 mb-0.5">
                                  <span
                                    className={`inline-block px-1.5 py-0.5 rounded border text-[9px] font-bold truncate max-w-full ${getRoleBadgeClass(
                                      m.role
                                    )}`}
                                  >
                                    {m.role}
                                  </span>
                                </div>
                                <div className="text-emerald-400 font-mono text-[10px]">
                                  PIN: {m.pin}
                                </div>
                              </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleStaffSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Staff Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="josh@cloud9fulfilment.co.uk"
                className="w-full h-14 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-14 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold focus:outline-none focus:border-emerald-500"
              />
            </div>

            <label className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={launchAsKiosk}
                onChange={(e) => setLaunchAsKiosk(e.target.checked)}
                className="w-5 h-5 rounded accent-emerald-500"
              />
              <div className="text-xs">
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <Tablet className="w-4 h-4 text-amber-400" />
                  Sign this device into Shared Kiosk Mode
                </div>
                <div className="text-slate-400">
                  Locks tablet to the operative name-pick / PIN screen
                </div>
              </div>
            </label>

            <button
              type="submit"
              disabled={staffLoading}
              className="w-full btn-glove rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-base font-black shadow-lg"
            >
              <Lock className="w-5 h-5 mr-2" />
              {staffLoading
                ? 'Signing In...'
                : launchAsKiosk
                ? 'Sign In & Start Kiosk'
                : 'Sign In'}
            </button>

            {/* 1-Click Staff Sign-In Buttons */}
            <div className="mt-5 pt-4 border-t border-slate-800 text-xs text-slate-400 space-y-2">
              <div className="font-bold text-slate-300 uppercase tracking-wider">
                1-Click Supervisor &amp; Admin Sign-In (Password: password123):
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={staffLoading}
                  onClick={() => {
                    setEmail('mark@cloud9fulfilment.co.uk');
                    setPassword('password123');
                    executeStaffLogin('mark@cloud9fulfilment.co.uk', 'password123');
                  }}
                  className="p-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-emerald-500/40 text-left"
                >
                  <div className="font-bold text-white flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    ⭐ Mark
                  </div>
                  <div className="text-[10px] text-emerald-300 font-bold">Supervisor • Core WH</div>
                  <div className="text-[10px] text-slate-400">PIN: 4444</div>
                </button>
                <button
                  type="button"
                  disabled={staffLoading}
                  onClick={() => {
                    setEmail('edna@cloud9fulfilment.co.uk');
                    setPassword('password123');
                    executeStaffLogin('edna@cloud9fulfilment.co.uk', 'password123');
                  }}
                  className="p-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-emerald-500/40 text-left"
                >
                  <div className="font-bold text-white flex items-center gap-1">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    ⭐ Edna
                  </div>
                  <div className="text-[10px] text-emerald-300 font-bold">Supervisor • Core WH</div>
                  <div className="text-[10px] text-slate-400">PIN: 4445</div>
                </button>
                <button
                  type="button"
                  disabled={staffLoading}
                  onClick={() => {
                    setEmail('josh@cloud9fulfilment.co.uk');
                    setPassword('password123');
                    executeStaffLogin('josh@cloud9fulfilment.co.uk', 'password123');
                  }}
                  className="p-2.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-amber-500/40 text-left"
                >
                  <div className="font-bold text-white flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                    Josh
                  </div>
                  <div className="text-[10px] text-amber-300 font-bold">CEO, Builder &amp; Admin</div>
                  <div className="text-[10px] text-slate-400">PIN: 9999</div>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
