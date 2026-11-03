'use client';

import { kioskTapOperativeAction, loginByPinAction } from '@/app/actions';
import { formatElapsedHMS, formatLondonTime } from '@/lib/calculations';
import {
  ADDITIONAL_GROUP_ORDER,
  getAdditionalStaffGroupLabel,
  getRoleBadgeClass,
  getStaffPriorityRank,
  isPrimaryStaffMember,
} from '@/lib/roleBadge';
import { Attendance, TimeEntry, UserPublic } from '@/lib/types';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  Delete,
  KeyRound,
  Play,
  ShieldCheck,
  Tablet,
  Users,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useEffect, useState } from 'react';

interface KioskRow {
  operative: UserPublic;
  attendance: Attendance | null;
  runningEntry: TimeEntry | null;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

export function KioskClient({ rows }: { rows: KioskRow[] }) {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<'grid' | 'pin'>('grid');
  const [showOtherKioskStaff, setShowOtherKioskStaff] = useState(false);
  const [expandedKioskDepts, setExpandedKioskDepts] = useState<Record<string, boolean>>({});
  const [requirePinOnTap, setRequirePinOnTap] = useState(false);
  const [pinModalUser, setPinModalUser] = useState<UserPublic | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleTapOperative = async (op: UserPublic) => {
    setError(null);
    if (requirePinOnTap) {
      setPinModalUser(op);
      setPin('');
      return;
    }

    setLoadingId(op.id);
    const res = await kioskTapOperativeAction({ userId: op.id });
    setLoadingId(null);

    if (!res.ok) {
      setError(res.error || 'Could not select operative');
      return;
    }

    router.push('/now?kiosk=1');
    router.refresh();
  };

  const handlePinDigit = async (digit: string) => {
    setError(null);
    const nextPin = (pin + digit).slice(0, 4);
    setPin(nextPin);

    if (nextPin.length === 4) {
      setLoadingId('pin');
      const res = await loginByPinAction({
        pin: nextPin,
        userId: pinModalUser?.id,
        clockInIfNeeded: true,
      });
      setLoadingId(null);

      if (!res.ok) {
        setError(res.error || 'Incorrect PIN');
        setPin('');
        return;
      }

      setPinModalUser(null);
      router.push('/now?kiosk=1');
      router.refresh();
    }
  };

  const onTaskCount = rows.filter((r) => Boolean(r.runningEntry)).length;
  const clockedInCount = rows.filter((r) => Boolean(r.attendance)).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-10">
      {/* Kiosk Hero Header */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-xs font-black uppercase tracking-wider text-amber-300 mb-2.5">
              <Tablet className="w-3.5 h-3.5" />
              Warehouse Shared Kiosk
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              Tap Your Name to Clock In or Manage Task
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Select your profile card below to start, switch, or stop your warehouse task timer.
            </p>
          </div>

          {/* Unified Single-Row Toolbar */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div className="inline-flex items-center p-1.5 rounded-2xl bg-slate-950 border border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setViewMode('grid');
                  setPinModalUser(null);
                  setPin('');
                  setError(null);
                }}
                className={`h-11 px-4 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition ${
                  viewMode === 'grid'
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-4 h-4" />
                Name Grid
              </button>

              <button
                type="button"
                onClick={() => {
                  setViewMode('pin');
                  setPinModalUser(null);
                  setPin('');
                  setError(null);
                }}
                className={`h-11 px-4 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 transition ${
                  viewMode === 'pin'
                    ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <KeyRound className="w-4 h-4" />
                PIN Pad
              </button>
            </div>

            {viewMode === 'grid' && (
              <label
                className={`h-14 px-4 rounded-2xl border text-xs font-bold flex items-center gap-2.5 cursor-pointer select-none transition ${
                  requirePinOnTap
                    ? 'bg-emerald-950/50 border-emerald-500/60 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <input
                  type="checkbox"
                  checked={requirePinOnTap}
                  onChange={(e) => setRequirePinOnTap(e.target.checked)}
                  className="w-4 h-4 rounded accent-emerald-500"
                />
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Require PIN on tap</span>
              </label>
            )}
          </div>
        </div>

        {/* Quick Status Strip inside Header */}
        <div className="grid grid-cols-3 gap-3 mt-6 pt-5 border-t border-slate-800/80">
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-950/70 border border-slate-800/80">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Active on Task
              </div>
              <div className="text-lg font-black text-white">
                {onTaskCount} <span className="text-xs font-normal text-slate-400">of {rows.length}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-950/70 border border-slate-800/80">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Clocked In Today
              </div>
              <div className="text-lg font-black text-white">
                {clockedInCount} <span className="text-xs font-normal text-slate-400">staff</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-slate-950/70 border border-slate-800/80">
            <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Warehouse Time
              </div>
              <div className="text-lg font-black font-mono text-white">
                {formatLondonTime(new Date(nowMs).toISOString())}
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-950/90 border border-rose-500 text-rose-200 font-bold text-center shadow-lg">
          {error}
        </div>
      )}

      {viewMode === 'grid' ? (
        <div className="space-y-5">
          {(() => {
            const sortedRows = [...rows].sort((a, b) => {
              const pa = getStaffPriorityRank(a.operative);
              const pb = getStaffPriorityRank(b.operative);
              if (pa !== pb) return pa - pb;
              return a.operative.display_name.localeCompare(b.operative.display_name);
            });
            const primaryRows = sortedRows.filter(
              (r) =>
                isPrimaryStaffMember(r.operative) ||
                Boolean(r.attendance) ||
                Boolean(r.runningEntry)
            );
            const otherRows = sortedRows.filter(
              (r) =>
                !isPrimaryStaffMember(r.operative) &&
                !r.attendance &&
                !r.runningEntry
            );

            const renderKioskCard = ({ operative, attendance, runningEntry }: KioskRow) => {
              const isClockedIn = Boolean(attendance);
              const isRunning = Boolean(runningEntry);
              const isBusy = loadingId === operative.id;
              const elapsedSec = runningEntry
                ? Math.max(
                    0,
                    Math.floor((nowMs - new Date(runningEntry.started_at).getTime()) / 1000)
                  )
                : 0;

              return (
                <button
                  key={operative.id}
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleTapOperative(operative)}
                  className={`group text-left p-6 rounded-3xl border transition-all duration-150 active:scale-[0.99] flex flex-col justify-between min-h-[215px] shadow-xl card-interactive border-l-[3px] ${
                    isRunning
                      ? 'bg-gradient-to-b from-cyan-950/35 to-slate-900 border-[#22D3EE]/70 border-l-[#22D3EE] shadow-[0_0_20px_rgba(34,211,238,0.15)]'
                      : isClockedIn
                      ? 'bg-gradient-to-b from-amber-950/25 to-slate-900 border-[#FB923C]/60 border-l-[#FB923C]'
                      : 'bg-slate-900 border-slate-800 border-l-[#888888] opacity-85 hover:opacity-100'
                  }`}
                >
                  {/* Card Top: Avatar + Name + Role Tag + Status Pill */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-base tracking-tight shrink-0 border ${
                          isRunning
                            ? 'bg-[#22D3EE] text-slate-950 border-cyan-300 shadow-md shadow-cyan-500/20'
                            : isClockedIn
                            ? 'bg-orange-500/20 text-[#FB923C] border-orange-500/40'
                            : 'bg-slate-800 text-slate-200 border-slate-700 group-hover:border-cyan-500/40 group-hover:text-[#22D3EE]'
                        }`}
                      >
                        {getInitials(operative.display_name)}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[18px] font-semibold text-[#E8E8E8] tracking-tight group-hover:text-white transition">
                            {operative.display_name}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded border text-[10px] font-bold ${getRoleBadgeClass(
                              operative.job_title
                            )}`}
                          >
                            {operative.job_title || 'Warehouse Operative'}
                          </span>
                        </div>
                        <div className="text-[12px] font-normal text-[#888888] mt-0.5">
                          {isClockedIn && attendance
                            ? `Clocked in at ${formatLondonTime(attendance.clock_in)}`
                            : 'Ready to start shift'}
                        </div>
                      </div>
                    </div>

                    {isRunning ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase bg-[#22D3EE] text-slate-950 shrink-0 shadow">
                        <Play className="w-3 h-3 fill-current" />
                        On Task
                      </span>
                    ) : isClockedIn ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase bg-[#FB923C] text-slate-950 shrink-0">
                        <Clock className="w-3 h-3" />
                        Idle
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase bg-slate-950 text-[#888888] border border-slate-800 shrink-0">
                        Clocked Out
                      </span>
                    )}
                  </div>

                  {/* Middle: Active Task Box or Idle Notice */}
                  <div className="my-4">
                    {isRunning && runningEntry ? (
                      <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-[#22D3EE]/30 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-[#10B981] text-slate-950 font-mono text-[10px] font-bold">
                              {runningEntry.client_code}
                            </span>
                            <span className="text-[12px] text-[#888888] truncate">
                              {runningEntry.client_name}
                            </span>
                          </div>
                          <div className="font-semibold text-[#E8E8E8] text-[15px] mt-1 truncate">
                            {runningEntry.task_name}
                          </div>
                        </div>
                        <div className="font-mono text-base font-black text-[#22D3EE] shrink-0">
                          {formatElapsedHMS(elapsedSec)}
                        </div>
                      </div>
                    ) : isClockedIn ? (
                      <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-[#FB923C]/25 text-xs font-semibold text-[#FB923C]">
                        Clocked in — no active task running right now
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800/80 text-[12px] text-[#888888]">
                        Tap card to clock in for today&apos;s shift &amp; pick your first task
                      </div>
                    )}
                  </div>

                  {/* Card Footer CTA */}
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-sm font-black">
                    {isRunning ? (
                      <>
                        <span className="text-[#22D3EE]">Manage or Stop Task</span>
                        <ArrowRight className="w-4 h-4 text-[#22D3EE] group-hover:translate-x-1 transition-transform" />
                      </>
                    ) : isClockedIn ? (
                      <>
                        <span className="text-[#FB923C]">Select a Task to Start</span>
                        <ArrowRight className="w-4 h-4 text-[#FB923C] group-hover:translate-x-1 transition-transform" />
                      </>
                    ) : (
                      <>
                        <span className="flex items-center gap-2 text-slate-200 group-hover:text-[#22D3EE] transition">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          Tap to Clock In &amp; Start
                        </span>
                        <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#22D3EE] group-hover:translate-x-1 transition-all" />
                      </>
                    )}
                  </div>
                </button>
              );
            };

            return (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {primaryRows.map(renderKioskCard)}
                </div>

                {otherRows.length > 0 && (
                  <div className="rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowOtherKioskStaff((prev) => !prev)}
                      className="w-full px-5 py-4 flex flex-wrap items-center justify-between gap-2 text-left hover:bg-slate-800/60 transition"
                    >
                      <span className="text-sm font-black uppercase tracking-wider text-slate-200">
                        {showOtherKioskStaff ? '▾ Hide' : '▸ Show'} Additional Staff Members ({otherRows.length})
                      </span>
                      <span className="text-xs text-sky-400 font-semibold">
                        Grouped by Department / Job Title
                      </span>
                    </button>
                    {showOtherKioskStaff && (
                      <div className="p-5 pt-2 border-t border-slate-800 space-y-4">
                        {ADDITIONAL_GROUP_ORDER.map((deptLabel) => {
                          const deptRows = otherRows.filter(
                            (r) => getAdditionalStaffGroupLabel(r.operative) === deptLabel
                          );
                          if (deptRows.length === 0) return null;
                          const isDeptOpen = expandedKioskDepts[deptLabel] ?? true;

                          return (
                            <div
                              key={deptLabel}
                              className="rounded-2xl border border-slate-800 bg-slate-950/60 overflow-hidden"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedKioskDepts((prev) => ({
                                    ...prev,
                                    [deptLabel]: !isDeptOpen,
                                  }))
                                }
                                className="w-full px-4 py-3 bg-slate-900/80 flex items-center justify-between text-left hover:bg-slate-800 transition"
                              >
                                <span className="text-xs font-black uppercase tracking-wider text-amber-300">
                                  {deptLabel} ({deptRows.length})
                                </span>
                                <ChevronDown
                                  className={`w-4 h-4 text-slate-400 transition-transform ${
                                    isDeptOpen ? 'rotate-180' : ''
                                  }`}
                                />
                              </button>
                              {isDeptOpen && (
                                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {deptRows.map(renderKioskCard)}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ) : (
        <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-7 shadow-2xl">
          <h2 className="text-2xl font-black text-center text-white mb-1">
            Enter 4-Digit Operative PIN
          </h2>
          <p className="text-xs text-center text-slate-400 mb-5">
            Automatically clocks you in if you are not yet clocked in today
          </p>

          <div className="flex justify-center gap-4 my-5">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center text-2xl font-black transition ${
                  idx < pin.length
                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                    : 'border-slate-700 bg-slate-950 text-slate-600'
                }`}
              >
                {idx < pin.length ? '•' : ''}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => handlePinDigit(d)}
                className="btn-glove-lg rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-emerald-500 active:text-slate-950 border border-slate-700 text-2xl font-black text-white flex items-center justify-center"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPin('')}
              className="btn-glove-lg rounded-2xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-400 flex items-center justify-center"
            >
              CLEAR
            </button>
            <button
              type="button"
              onClick={() => handlePinDigit('0')}
              className="btn-glove-lg rounded-2xl bg-slate-800 hover:bg-slate-700 active:bg-emerald-500 active:text-slate-950 border border-slate-700 text-2xl font-black text-white flex items-center justify-center"
            >
              0
            </button>
            <button
              type="button"
              onClick={() => setPin((p) => p.slice(0, -1))}
              className="btn-glove-lg rounded-2xl bg-slate-950 border border-slate-800 text-slate-300 flex items-center justify-center"
            >
              <Delete className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {/* Modal PIN Prompt when "Require PIN on tap" is enabled */}
      {pinModalUser && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-xs font-bold uppercase text-emerald-400">Confirm PIN</div>
                <h3 className="text-xl font-black text-white">{pinModalUser.display_name}</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPinModalUser(null);
                  setPin('');
                }}
                className="p-2 rounded-xl bg-slate-800 text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex justify-center gap-4 my-4">
              {[0, 1, 2, 3].map((idx) => (
                <div
                  key={idx}
                  className={`w-14 h-14 rounded-2xl border-2 flex items-center justify-center text-2xl font-black ${
                    idx < pin.length
                      ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                      : 'border-slate-700 bg-slate-950 text-slate-600'
                  }`}
                >
                  {idx < pin.length ? '•' : ''}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handlePinDigit(d)}
                  className="btn-glove-lg rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-2xl font-black text-white flex items-center justify-center"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPin('')}
                className="btn-glove-lg rounded-2xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-400 flex items-center justify-center"
              >
                CLEAR
              </button>
              <button
                type="button"
                onClick={() => handlePinDigit('0')}
                className="btn-glove-lg rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-2xl font-black text-white flex items-center justify-center"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setPin((p) => p.slice(0, -1))}
                className="btn-glove-lg rounded-2xl bg-slate-950 border border-slate-800 text-slate-300 flex items-center justify-center"
              >
                <Delete className="w-6 h-6" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
