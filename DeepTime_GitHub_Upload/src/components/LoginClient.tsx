'use client';

import { loginByPinAction, loginStaffAction } from '@/app/actions';
import { UserPublic } from '@/lib/types';
import {
  ArrowRight,
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
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Staff email/password state
  const [email, setEmail] = useState('josh@cloud9fulfilment.co.uk');
  const [password, setPassword] = useState('password123');
  const [launchAsKiosk, setLaunchAsKiosk] = useState(false);
  const [teamFilter, setTeamFilter] = useState<string>('all');

  const submitPin = async (pinToSubmit: string, userIdOverride?: string) => {
    if (pinLoading) return;
    if (pinToSubmit.length !== 4) {
      setError('Please enter a 4-digit PIN.');
      return;
    }

    setError(null);
    setPinLoading(true);
    try {
      const res = await loginByPinAction({
        pin: pinToSubmit,
        userId: (userIdOverride ?? selectedUserId) || undefined,
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
            {/* Team Filter Pills */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {[
                { id: 'all', label: `All Staff (${operatives.length})` },
                { id: 'core', label: '⭐ Core Warehouse Team (6)' },
                { id: 'ccell_wh', label: 'CCELL & Warehouse' },
                { id: 'sales_ops', label: 'Sales, Ops & People' },
                { id: 'marketing', label: 'Marketing & Innovations' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTeamFilter(t.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                    teamFilter === t.id
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

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
                {operatives
                  .filter((op) => {
                    if (teamFilter === 'core') return Boolean(op.is_core_warehouse);
                    if (teamFilter === 'ccell_wh')
                      return op.team_name === 'CCELL' || op.team_name === 'Warehouse Team';
                    if (teamFilter === 'sales_ops')
                      return (
                        op.team_name === 'Sales' ||
                        op.team_name === 'Operations' ||
                        op.team_name === 'People & Operations'
                      );
                    if (teamFilter === 'marketing')
                      return op.team_name === 'Marketing & Innovations';
                    return true;
                  })
                  .map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.is_core_warehouse ? '⭐ ' : ''}
                      {op.display_name} — {op.job_title || op.role} ({op.team_name || 'Warehouse'})
                    </option>
                  ))}
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

            {/* Quick Seed PIN Helper for Cloud9 Team */}
            <div className="mt-6 pt-4 border-t border-slate-800 text-xs text-slate-400 space-y-2">
              <div className="font-bold text-emerald-300 uppercase tracking-wider flex items-center justify-between">
                <span>⭐ Core Warehouse Team (1-Click PIN):</span>
                <span className="text-[10px] text-slate-400">Operatives &amp; Supervisors</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: 'Erica', role: 'Operative', team: 'Core Warehouse', pin: '1111' },
                  { name: 'Sam', role: 'Operative', team: 'Core Warehouse', pin: '2222' },
                  { name: 'Alex', role: 'Operative', team: 'Core Warehouse', pin: '3333' },
                  { name: 'Mason', role: 'Operative', team: 'Core Warehouse', pin: '1004' },
                  { name: 'Mark', role: 'Supervisor', team: 'Core Warehouse', pin: '4444' },
                  { name: 'Edna', role: 'Supervisor', team: 'Core Warehouse', pin: '4445' },
                ].map((m) => (
                  <button
                    key={m.pin}
                    type="button"
                    disabled={pinLoading}
                    onClick={() => {
                      setPin(m.pin);
                      submitPin(m.pin);
                    }}
                    className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-emerald-500/30 text-left transition"
                  >
                    <div className="font-black text-white text-xs">⭐ {m.name}</div>
                    <div className="text-[10px] text-slate-400 truncate">{m.role}</div>
                    <div className="text-emerald-400 font-mono text-[11px] font-bold">PIN: {m.pin}</div>
                  </button>
                ))}
              </div>

              <div className="font-bold text-sky-300 uppercase tracking-wider pt-2">
                Cross-Department Warehouse Operatives &amp; Leadership:
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-52 overflow-y-auto pr-1">
                {[
                  { name: 'Josh', role: 'CEO, Builder & Admin', team: 'Executive', pin: '9999' },
                  { name: 'Ben', role: 'CCELL Operative', team: 'CCELL', pin: '1005' },
                  { name: 'Jess', role: 'Warehouse Operative', team: 'Warehouse', pin: '1006' },
                  { name: 'Sabine', role: 'Warehouse Operative', team: 'Warehouse', pin: '1007' },
                  { name: 'Dan Igel', role: 'Head of People & Ops', team: 'People & Ops', pin: '1008' },
                  { name: 'Billy', role: 'Operations', team: 'Operations', pin: '1009' },
                  { name: 'Mike', role: 'Sales', team: 'Sales', pin: '1010' },
                  { name: 'Ray', role: 'Sales (WH Support)', team: 'Sales', pin: '1011' },
                  { name: 'Adrian', role: 'Marketing & Innov.', team: 'Marketing', pin: '1012' },
                  { name: 'Danny', role: 'Marketing & Innov.', team: 'Marketing', pin: '1013' },
                  { name: 'Ashton', role: 'Marketing & Innov.', team: 'Marketing', pin: '1014' },
                ].map((m) => (
                  <button
                    key={m.pin}
                    type="button"
                    disabled={pinLoading}
                    onClick={() => {
                      setPin(m.pin);
                      submitPin(m.pin);
                    }}
                    className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left transition"
                  >
                    <div className="font-bold text-white text-xs">{m.name}</div>
                    <div className="text-[10px] text-sky-300 truncate">{m.role}</div>
                    <div className="text-slate-400 font-mono text-[10px]">PIN: {m.pin}</div>
                  </button>
                ))}
              </div>
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
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
