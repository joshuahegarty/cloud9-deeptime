'use client';

import {
  assignTaskToOperativeAction,
  resumeOperativeOnCrewAction,
  reviewBillingEntryAction,
  runIdleAutoStopJobAction,
  runShiftEndJobAction,
  startCrewAction,
  stopCrewAction,
  stopTaskAction,
} from '@/app/actions';
import { formatElapsedHMS, formatLondonTime } from '@/lib/calculations';
import { getRoleBadgeClass } from '@/lib/roleBadge';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import { AppSettings, Attendance, Client, TaskType, TimeEntry, UserPublic } from '@/lib/types';
import {
  Activity,
  AlertTriangle,
  Check,
  Clock,
  Play,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldAlert,
  Square,
  Users,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

interface FloorRow {
  operative: UserPublic;
  attendance: Attendance | null;
  runningEntry: TimeEntry | null;
  lastEndedEntry?: TimeEntry | null;
  todayEntries?: TimeEntry[];
}

interface FloorClientProps {
  initialRows: FloorRow[];
  settings: AppSettings;
  clients: Client[];
  taskTypes: TaskType[];
}

export function FloorClient({
  initialRows,
  settings,
  clients,
  taskTypes,
}: FloorClientProps) {
  const router = useRouter();
  const [rows, setRows] = useState<FloorRow[]>(initialRows);
  const [nowMs, setNowMs] = useState<number>(Date.now());
  const [lastSyncedAt, setLastSyncedAt] = useState<string>(new Date().toISOString());

  // Crew start modal state
  const [showCrewModal, setShowCrewModal] = useState(false);
  const [showShiftEndConfirmModal, setShowShiftEndConfirmModal] = useState(false);
  const [showZoneHeatmap, setShowZoneHeatmap] = useState(true);
  const [selectedOperativeIds, setSelectedOperativeIds] = useState<string[]>([]);
  const [crewClientId, setCrewClientId] = useState<string>(clients[0]?.id ?? '');
  const [crewTaskTypeId, setCrewTaskTypeId] = useState<string>('');
  const [crewOrderRef, setCrewOrderRef] = useState<string>('');
  const [stopModalTarget, setStopModalTarget] = useState<{
    entry: TimeEntry;
    opName: string;
  } | null>(null);
  const [stopModalUnits, setStopModalUnits] = useState<string>('');
  const [stopZeroConfirmTarget, setStopZeroConfirmTarget] = useState<
    | { kind: 'single'; units: number }
    | { kind: 'crew'; crewId: string; units: number }
    | null
  >(null);
  const [stopCrewModalTarget, setStopCrewModalTarget] = useState<{
    crewId: string;
    clientCode: string;
    taskName: string;
    unitLabel: string;
    members: string[];
  } | null>(null);
  const [stopCrewUnits, setStopCrewUnits] = useState<string>('');

  // Assign Task to Operative Modal (Item #7)
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignOperativeId, setAssignOperativeId] = useState<string>(
    initialRows[0]?.operative.id ?? ''
  );
  const [assignClientId, setAssignClientId] = useState<string>(clients[0]?.id ?? '');
  const [assignTaskTypeId, setAssignTaskTypeId] = useState<string>('');
  const [assignOrderRef, setAssignOrderRef] = useState<string>('');
  const [assignPriorityNote, setAssignPriorityNote] = useState<string>('');
  const [assignTargetUnits, setAssignTargetUnits] = useState<string>('');

  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const fetchLatestFloor = useCallback(async () => {
    try {
      const res = await fetch('/api/realtime/floor', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.rows) {
          setRows(data.rows);
          setLastSyncedAt(new Date().toISOString());
        }
      }
    } catch {
      // ignore network blips
    }
  }, []);

  // Tick every second for live elapsed timer + subscribe to Supabase Realtime & poll
  useEffect(() => {
    const tick = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    const poll = setInterval(() => {
      fetchLatestFloor();
    }, 3000);

    // Supabase Realtime subscription when configured
    const sb = getSupabaseBrowserClient();
    let channel: any = null;
    if (sb) {
      channel = sb
        .channel('floor-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'time_entries' },
          () => fetchLatestFloor()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'attendance' },
          () => fetchLatestFloor()
        )
        .subscribe();
    }

    return () => {
      clearInterval(tick);
      clearInterval(poll);
      if (sb && channel) {
        sb.removeChannel(channel);
      }
    };
  }, [fetchLatestFloor]);

  // Filter tasks for crew modal client (both client-specific custom tasks and global standard tasks)
  const crewTasks = useMemo(
    () => taskTypes.filter((t) => t.client_id === crewClientId || t.is_standard),
    [taskTypes, crewClientId]
  );

  useEffect(() => {
    if (crewTasks.length > 0 && !crewTasks.some((t) => t.id === crewTaskTypeId)) {
      setCrewTaskTypeId(crewTasks[0].id);
    }
  }, [crewTasks, crewTaskTypeId]);

  const assignTasks = useMemo(
    () => taskTypes.filter((t) => t.client_id === assignClientId || t.is_standard),
    [taskTypes, assignClientId]
  );

  useEffect(() => {
    if (assignTasks.length > 0 && !assignTasks.some((t) => t.id === assignTaskTypeId)) {
      setAssignTaskTypeId(assignTasks[0].id);
    }
  }, [assignTasks, assignTaskTypeId]);

  // Active crews currently running on the floor
  const activeCrews = useMemo(() => {
    const map = new Map<
      string,
      {
        crewId: string;
        clientId: string;
        clientCode: string;
        taskTypeId: string;
        taskName: string;
        unitLabel: string;
        orderRef: string | null;
        members: string[];
      }
    >();

    for (const r of rows) {
      const e = r.runningEntry;
      if (e && e.crew_id) {
        const existing = map.get(e.crew_id) ?? {
          crewId: e.crew_id,
          clientId: e.client_id,
          clientCode: e.client_code ?? '',
          taskTypeId: e.task_type_id,
          taskName: e.task_name ?? '',
          unitLabel: e.unit_label || 'units',
          orderRef: e.order_ref,
          members: [],
        };
        existing.members.push(r.operative.display_name);
        map.set(e.crew_id, existing);
      }
    }
    return Array.from(map.values());
  }, [rows]);

  // Pending "Our Cost" Supervisor Approval Queue (Item #13)
  const pendingOurCostEntries = useMemo(() => {
    const list: Array<{ opName: string; entry: TimeEntry }> = [];
    for (const r of rows) {
      const entries = r.todayEntries ?? [];
      for (const e of entries) {
        if (
          e.billing_status === 'our_cost' &&
          (e.billing_review_status === 'pending' || !e.billing_review_status)
        ) {
          list.push({ opName: r.operative.display_name, entry: e });
        }
      }
      if (
        r.runningEntry &&
        r.runningEntry.billing_status === 'our_cost' &&
        (r.runningEntry.billing_review_status === 'pending' ||
          !r.runningEntry.billing_review_status) &&
        !list.some((x) => x.entry.id === r.runningEntry?.id)
      ) {
        list.push({ opName: r.operative.display_name, entry: r.runningEntry });
      }
    }
    return list;
  }, [rows]);

  // Compute Single Idle Gap (15m+) and Cumulative Daily Idle Time (30m+) per operative (Item #14)
  const idleMetricsByOperative = useMemo(() => {
    const map = new Map<
      string,
      {
        currentGapMins: number;
        cumulativeIdleMins: number;
        is15mSingleGap: boolean;
        is30mCumulativeIdle: boolean;
      }
    >();

    for (const r of rows) {
      if (!r.attendance) {
        map.set(r.operative.id, {
          currentGapMins: 0,
          cumulativeIdleMins: 0,
          is15mSingleGap: false,
          is30mCumulativeIdle: false,
        });
        continue;
      }

      const clockInMs = new Date(r.attendance.clock_in).getTime();
      const totalClockedInMins = Math.max(0, (nowMs - clockInMs) / 60000);

      let activeTaskMins = 0;
      const entries = r.todayEntries ?? [];
      for (const e of entries) {
        const sMs = Math.max(clockInMs, new Date(e.started_at).getTime());
        const endMs = e.ended_at ? new Date(e.ended_at).getTime() : nowMs;
        if (endMs > sMs) {
          activeTaskMins += (endMs - sMs) / 60000;
        }
      }
      if (
        r.runningEntry &&
        !entries.some((e) => e.id === r.runningEntry?.id)
      ) {
        const sMs = Math.max(clockInMs, new Date(r.runningEntry.started_at).getTime());
        if (nowMs > sMs) {
          activeTaskMins += (nowMs - sMs) / 60000;
        }
      }

      const cumulativeIdleMins = Math.max(
        0,
        Math.round(totalClockedInMins - activeTaskMins)
      );

      let currentGapMins = 0;
      if (!r.runningEntry) {
        const refMs = r.lastEndedEntry?.ended_at
          ? new Date(r.lastEndedEntry.ended_at).getTime()
          : clockInMs;
        currentGapMins = Math.max(0, Math.round((nowMs - refMs) / 60000));
      }

      map.set(r.operative.id, {
        currentGapMins,
        cumulativeIdleMins,
        is15mSingleGap: !r.runningEntry && currentGapMins >= 15,
        is30mCumulativeIdle: cumulativeIdleMins >= 30,
      });
    }
    return map;
  }, [rows, nowMs]);

  const toggleCrewOperative = (opId: string) => {
    setSelectedOperativeIds((prev) =>
      prev.includes(opId) ? prev.filter((id) => id !== opId) : [...prev, opId]
    );
  };

  const handleStartCrew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedOperativeIds.length === 0 || !crewClientId || !crewTaskTypeId) return;
    setBusy(true);
    const res = await startCrewAction({
      operativeIds: selectedOperativeIds,
      clientId: crewClientId,
      taskTypeId: crewTaskTypeId,
      orderRef: crewOrderRef,
    });
    setBusy(false);

    if (res.ok) {
      setShowCrewModal(false);
      setSelectedOperativeIds([]);
      setCrewOrderRef('');
      setBanner(`Started crew task for ${res.count} operatives.`);
      await fetchLatestFloor();
      router.refresh();
    } else {
      setBanner(res.error || 'Failed to start crew');
    }
  };

  const handleStopCrew = (crew: {
    crewId: string;
    clientCode: string;
    taskName: string;
    unitLabel: string;
    members: string[];
  }) => {
    setStopCrewUnits('');
    setStopCrewModalTarget(crew);
  };

  const confirmStopCrewWithUnits = async (units: number | null) => {
    if (!stopCrewModalTarget) return;
    setBusy(true);
    const res = await stopCrewAction({
      crewId: stopCrewModalTarget.crewId,
      units,
    });
    setBusy(false);
    setStopCrewModalTarget(null);
    setStopZeroConfirmTarget(null);
    if (res.ok) {
      setBanner(
        `Stopped crew (${res.stoppedCount} running entries closed${
          units !== null ? ` · ${units} ${stopCrewModalTarget.unitLabel} recorded` : ''
        }).`
      );
      await fetchLatestFloor();
      router.refresh();
    }
  };

  const handleResumeOnCrew = async (params: {
    operativeId: string;
    opName: string;
    crewId: string;
    clientId: string;
    taskTypeId: string;
    taskName: string;
    orderRef?: string | null;
  }) => {
    setBusy(true);
    const res = await resumeOperativeOnCrewAction({
      operativeId: params.operativeId,
      crewId: params.crewId,
      clientId: params.clientId,
      taskTypeId: params.taskTypeId,
      orderRef: params.orderRef,
    });
    setBusy(false);
    if (res.ok) {
      setBanner(`Resumed ${params.opName} back onto Crew (${params.taskName}).`);
      await fetchLatestFloor();
      router.refresh();
    } else {
      setBanner(res.error || 'Failed to resume operative on crew.');
    }
  };

  const handleAssignTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignOperativeId || !assignClientId || !assignTaskTypeId) return;
    setBusy(true);
    const parsedTargetUnits =
      assignTargetUnits.trim() !== '' ? parseInt(assignTargetUnits.trim(), 10) : null;
    const noteParts: string[] = [];
    if (assignPriorityNote.trim()) noteParts.push(assignPriorityNote.trim());
    if (parsedTargetUnits && !Number.isNaN(parsedTargetUnits)) {
      noteParts.push(`Target Qty: ${parsedTargetUnits}`);
    }
    const res = await assignTaskToOperativeAction({
      userId: assignOperativeId === 'OPEN_POOL' ? null : assignOperativeId,
      clientId: assignClientId,
      taskTypeId: assignTaskTypeId,
      orderRef: assignOrderRef.trim() || null,
      note: noteParts.join(' · ') || null,
    });
    setBusy(false);
    if (res.ok) {
      const opName =
        assignOperativeId === 'OPEN_POOL'
          ? 'Open Task Pool (Any Operative Can Grab)'
          : rows.find((r) => r.operative.id === assignOperativeId)?.operative.display_name ||
            'Operative';
      setShowAssignModal(false);
      setAssignOrderRef('');
      setAssignPriorityNote('');
      setAssignTargetUnits('');
      setBanner(`Assigned task to ${opName} — now visible at the top of /now.`);
      router.refresh();
    } else {
      setBanner(res.error || 'Failed to assign task.');
    }
  };

  const handleReviewOurCostEntry = async (
    entryId: string,
    action: 'approve_our_cost' | 'convert_needs_billed'
  ) => {
    setBusy(true);
    if (action === 'approve_our_cost') {
      await reviewBillingEntryAction({
        entryId,
        reviewStatus: 'agreed',
        billingStatus: 'our_cost',
        reviewNote: 'Supervisor authorized Our Cost on Floor View',
      });
      setBanner('Approved Our Cost task.');
    } else {
      await reviewBillingEntryAction({
        entryId,
        reviewStatus: 'agreed',
        billingStatus: 'needs_billed',
        reviewNote: 'Supervisor converted from Our Cost to Needs Billed on Floor View',
      });
      setBanner('Converted task to Needs Billed (Client Billable).');
    }
    setBusy(false);
    await fetchLatestFloor();
    router.refresh();
  };

  const handleStopSingleEntry = (entry: TimeEntry, opName: string) => {
    setStopModalUnits(entry.units ? String(entry.units) : '');
    setStopModalTarget({ entry, opName });
  };

  const confirmStopSingleEntryWithUnits = async (units: number | null | undefined) => {
    if (!stopModalTarget) return;
    setBusy(true);
    await stopTaskAction({
      entryId: stopModalTarget.entry.id,
      units,
    });
    setBusy(false);
    setBanner(
      `Stopped running task for ${stopModalTarget.opName}${
        units !== null && units !== undefined ? ` (${units} ${stopModalTarget.entry.unit_label || 'units'})` : ''
      }.`
    );
    setStopModalTarget(null);
    setStopZeroConfirmTarget(null);
    await fetchLatestFloor();
    router.refresh();
  };

  const handleRunIdleJobNow = async () => {
    setBusy(true);
    const res = await runIdleAutoStopJobAction();
    setBusy(false);
    setBanner(
      res.stoppedEntryIds.length > 0
        ? `Idle auto-stop job stopped ${res.stoppedEntryIds.length} entry(s) at their last activity timestamp.`
        : `Idle auto-stop job ran — no entries exceeded ${settings.idle_stop_minutes} mins idle.`
    );
    await fetchLatestFloor();
    router.refresh();
  };

  const handleRunShiftEndNow = async () => {
    setBusy(true);
    const res = await runShiftEndJobAction();
    setBusy(false);
    setShowShiftEndConfirmModal(false);
    setBanner(
      `Shift-end job closed ${res.closedAttendances} attendance record(s) and auto-stopped ${res.stoppedEntries} running task(s).`
    );
    await fetchLatestFloor();
    router.refresh();
  };

  // Summary counts
  const onTaskCount = rows.filter((r) => Boolean(r.runningEntry)).length;
  const idleClockedInCount = rows.filter((r) => r.attendance && !r.runningEntry).length;
  const clockedOutCount = rows.filter((r) => !r.attendance && !r.runningEntry).length;

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            Live Warehouse Floor · Realtime Channel
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white mt-0.5">
            Floor Operations View
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Idle warning threshold: {settings.idle_prompt_minutes} mins · Auto-stop threshold:{' '}
            {settings.idle_stop_minutes} mins · Synced {formatLondonTime(lastSyncedAt)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowAssignModal(true)}
            className="btn-glove px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-sm font-black shadow-lg flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Assign Task
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedOperativeIds(rows.map((r) => r.operative.id));
              setShowCrewModal(true);
            }}
            className="btn-glove px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-black shadow-lg flex items-center gap-2"
          >
            <Users className="w-4 h-4" />
            Crew Start
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={handleRunIdleJobNow}
            className="btn-glove px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700"
            title="Run the 5-minute scheduled idle auto-stop check now"
          >
            Run Idle Check
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => setShowShiftEndConfirmModal(true)}
            className="btn-glove px-3.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/70 text-rose-200 text-xs font-bold border border-rose-500/40"
            title="Run shift-end auto-close job now"
          >
            Run Shift-End Close
          </button>

          <button
            type="button"
            onClick={fetchLatestFloor}
            className="btn-glove p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            title="Refresh live floor"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {banner && (
        <div className="p-4 rounded-xl bg-slate-900 border border-emerald-500/50 text-emerald-300 text-sm font-bold flex items-center justify-between">
          <span>{banner}</span>
          <button type="button" onClick={() => setBanner(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-slate-900 border border-slate-800 border-l-[3px] border-l-[#22D3EE] rounded-2xl p-4">
          <div className="text-[16px] font-bold uppercase tracking-[1px] text-[#22D3EE]">
            Active on Task
          </div>
          <div className="text-3xl font-black text-white mt-1">{onTaskCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 border-l-[3px] border-l-[#FB923C] rounded-2xl p-4">
          <div className="text-[16px] font-bold uppercase tracking-[1px] text-[#FB923C]">
            Clocked In — Idle
          </div>
          <div className="text-3xl font-black text-white mt-1">{idleClockedInCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 border-l-[3px] border-l-[#888888] rounded-2xl p-4">
          <div className="text-[16px] font-bold uppercase tracking-[1px] text-[#888888]">
            Clocked Out
          </div>
          <div className="text-3xl font-black text-slate-300 mt-1">{clockedOutCount}</div>
        </div>
      </div>

      {/* BACKLOG FEATURE #4: WAREHOUSE WALKING & ZONE HEATMAP OVERLAY (31:58-32:30) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-cyan-400">
              Spatial Floor Telemetry · Walking &amp; Aisle Travel Overlay
            </div>
            <h2 className="text-base sm:text-lg font-black text-white">
              Cloud9 Warehouse Zone &amp; Aisle Travel Heatmap
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowZoneHeatmap((prev) => !prev)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 border border-slate-700"
          >
            {showZoneHeatmap ? 'Hide Zone Heatmap' : 'Show Zone Heatmap'}
          </button>
        </div>

        {showZoneHeatmap && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              {
                id: 'zone-inbound',
                name: 'Zone A · Goods-In Dock & Bays 1–4',
                aisleWalkAvg: '140m avg walk/run',
                matchFn: (code: string, name: string) =>
                  code.includes('GIN') || code.includes('GOODSIN') || name.toLowerCase().includes('goods-in') || name.toLowerCase().includes('container'),
              },
              {
                id: 'zone-pick',
                name: 'Zone B · Pick Tower Aisles A–D',
                aisleWalkAvg: '420m avg aisle walk',
                matchFn: (code: string, name: string) =>
                  code.includes('PICK') || name.toLowerCase().includes('pick'),
              },
              {
                id: 'zone-pack',
                name: 'Zone C · Pack Benches 1–8',
                aisleWalkAvg: '45m bench radius',
                matchFn: (code: string, name: string) =>
                  code.includes('PACK') || name.toLowerCase().includes('pack'),
              },
              {
                id: 'zone-kitting',
                name: 'Zone D · FSDU & Kitting Assembly Bay',
                aisleWalkAvg: '85m component staging',
                matchFn: (code: string, name: string) =>
                  code.includes('KIT') || code.includes('FSDU') || code.includes('FOAM') || code.includes('REWORK') || name.toLowerCase().includes('fsdu') || name.toLowerCase().includes('rework'),
              },
              {
                id: 'zone-dispatch',
                name: 'Zone E · Bulk Racking & Dispatch',
                aisleWalkAvg: '210m forklift/pallet route',
                matchFn: (code: string, name: string) =>
                  code.includes('DISP') || code.includes('WHL') || code.includes('STOCK') || code.includes('CLEAN') || name.toLowerCase().includes('dispatch') || name.toLowerCase().includes('pallet'),
              },
            ].map((zone) => {
              const activeOpsInZone = rows.filter(
                (r) =>
                  r.runningEntry &&
                  zone.matchFn(
                    r.runningEntry.task_code || '',
                    r.runningEntry.task_name || ''
                  )
              );
              const completedZoneMins = rows.reduce((acc, r) => {
                const matching = (r.todayEntries || []).filter((e) =>
                  zone.matchFn(e.task_code || '', e.task_name || '')
                );
                return (
                  acc +
                  matching.reduce(
                    (s, e) =>
                      s +
                      (e.ended_at
                        ? Math.max(
                            0,
                            (new Date(e.ended_at).getTime() -
                              new Date(e.started_at).getTime()) /
                              60000
                          )
                        : 0),
                    0
                  )
                );
              }, 0);
              const isHighTraffic = activeOpsInZone.length >= 2;

              return (
                <div
                  key={zone.id}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2 ${
                    isHighTraffic
                      ? 'bg-amber-950/25 border-amber-500/50'
                      : activeOpsInZone.length === 1
                      ? 'bg-emerald-950/20 border-emerald-500/40'
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                          isHighTraffic
                            ? 'bg-amber-400 text-slate-950'
                            : activeOpsInZone.length === 1
                            ? 'bg-emerald-400 text-slate-950'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {activeOpsInZone.length} Live
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {Math.round(completedZoneMins)}m today
                      </span>
                    </div>
                    <div className="text-xs font-black text-white mt-2 leading-snug">
                      {zone.name}
                    </div>
                    <div className="text-[11px] text-cyan-300/90 font-mono mt-0.5">
                      🚶 {zone.aisleWalkAvg}
                    </div>
                  </div>

                  {activeOpsInZone.length > 0 ? (
                    <div className="pt-2 border-t border-slate-800/80 flex flex-wrap gap-1">
                      {activeOpsInZone.map((r) => (
                        <span
                          key={r.operative.id}
                          className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-bold text-emerald-300"
                        >
                          {r.operative.display_name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-slate-800/80 text-[10px] text-slate-500">
                      Clear · No active timer in zone
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pending "Our Cost" Supervisor Approval Queue (Item #13) */}
      {pendingOurCostEntries.length > 0 && (
        <div className="bg-rose-950/35 border-2 border-rose-500/60 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-black uppercase tracking-wider text-rose-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              Supervisor Approval Queue — Unbilled &ldquo;Our Cost&rdquo; Tasks ({pendingOurCostEntries.length})
            </div>
            <span className="text-[11px] font-bold text-rose-200/80">
              Requires Supervisor Sign-Off or Conversion to Client Billable
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pendingOurCostEntries.map(({ opName, entry }) => (
              <div
                key={entry.id}
                className="p-3.5 rounded-xl bg-slate-950 border border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-black uppercase">
                      Our Cost
                    </span>
                    <span className="font-black text-white text-sm">{opName}</span>
                    <span className="text-xs font-bold text-emerald-400">
                      {entry.client_code} · {entry.task_name}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300">
                    Reason:{' '}
                    <span className="font-semibold text-amber-200">
                      {entry.unbilled_reason || 'Routine unbilled / awaiting supervisor review'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleReviewOurCostEntry(entry.id, 'approve_our_cost')}
                    className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black inline-flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    Approve Our Cost
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleReviewOurCostEntry(entry.id, 'convert_needs_billed')}
                    className="px-3 py-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-black"
                  >
                    Bill Client Instead
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active Crews Strip */}
      {activeCrews.length > 0 && (
        <div className="bg-slate-900 border-2 border-emerald-500/50 rounded-2xl p-4 space-y-3">
          <div className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Running Crews ({activeCrews.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeCrews.map((crew) => (
              <div
                key={crew.crewId}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold">
                      {crew.clientCode}
                    </span>
                    <span className="font-black text-white">{crew.taskName}</span>
                    {crew.orderRef && (
                      <span className="text-xs font-mono text-slate-400">({crew.orderRef})</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Operatives ({crew.members.length}):{' '}
                    <span className="text-slate-200 font-semibold">
                      {crew.members.join(', ')}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleStopCrew(crew)}
                  className="btn-glove px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shrink-0 flex items-center gap-1.5"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  Stop Crew
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live Floor Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[12px] font-bold uppercase tracking-[1px] text-[#E8E8E8]">
                <th className="py-3.5 px-4">Operative</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Client</th>
                <th className="py-3.5 px-4">Current Task</th>
                <th className="py-3.5 px-4">Elapsed</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-[13px]">
              {rows.map(({ operative, attendance, runningEntry, lastEndedEntry }) => {
                const isClockedIn = Boolean(attendance);
                const isRunning = Boolean(runningEntry);
                const idleInfo = idleMetricsByOperative.get(operative.id);

                // Check if operative was stopped from a still-active crew within 30 minutes (Item #8)
                const resumableCrew = (() => {
                  if (isRunning || !lastEndedEntry?.crew_id || !lastEndedEntry.ended_at) {
                    return null;
                  }
                  const minsAgo =
                    (nowMs - new Date(lastEndedEntry.ended_at).getTime()) / 60000;
                  if (minsAgo < 0 || minsAgo > 30) return null;
                  const activeCrew = activeCrews.find(
                    (c) => c.crewId === lastEndedEntry.crew_id
                  );
                  if (!activeCrew) return null;
                  return {
                    ...activeCrew,
                    minutesAgo: Math.max(1, Math.round(minsAgo)),
                  };
                })();

                const elapsedSec = runningEntry
                  ? Math.max(
                      0,
                      Math.floor((nowMs - new Date(runningEntry.started_at).getTime()) / 1000)
                    )
                  : 0;

                const idleSec = runningEntry
                  ? Math.max(
                      0,
                      Math.floor(
                        (nowMs -
                          new Date(
                            runningEntry.last_activity_at || runningEntry.started_at
                          ).getTime()) /
                          1000
                      )
                    )
                  : 0;

                const isOverIdlePrompt =
                  isRunning && idleSec >= settings.idle_prompt_minutes * 60;

                return (
                  <tr
                    key={operative.id}
                    className={`transition border-l-[3px] ${
                      isOverIdlePrompt || idleInfo?.is15mSingleGap
                        ? 'bg-amber-950/25 border-l-[#FB923C]'
                        : isRunning
                        ? 'hover:bg-slate-800/40 border-l-[#22D3EE]'
                        : isClockedIn
                        ? 'bg-amber-950/10 border-l-[#FB923C]'
                        : 'opacity-65 border-l-[#888888]'
                    }`}
                  >
                    <td className="py-4 px-4 font-semibold text-[#E8E8E8] text-[15px]">
                      <div>{operative.display_name}</div>
                      {attendance && (
                        <div className="text-[11px] font-normal text-[#888888] mt-1">
                          In since {formatLondonTime(attendance.clock_in)}
                        </div>
                      )}
                    </td>

                    <td className="py-4 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-xs font-bold ${getRoleBadgeClass(
                          operative.job_title
                        )}`}
                      >
                        {operative.job_title || 'Warehouse Operative'}
                      </span>
                    </td>

                    <td className="py-4 px-4">
                      {isRunning ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black uppercase bg-cyan-500/20 text-[#22D3EE] border border-cyan-500/40">
                            <Play className="w-3 h-3 fill-current" />
                            Active
                          </span>
                          {runningEntry?.crew_id && (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40">
                              Crew
                            </span>
                          )}
                          {isOverIdlePrompt && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black uppercase bg-[#FB923C] text-slate-950">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              Idle &gt; {settings.idle_prompt_minutes}m
                            </span>
                          )}
                          {idleInfo?.is30mCumulativeIdle && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40"
                              title="Cumulative daily time clocked in with no active task exceeds 30 mins"
                            >
                              Daily Idle: {idleInfo.cumulativeIdleMins}m
                            </span>
                          )}
                        </div>
                      ) : isClockedIn ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase bg-orange-500/20 text-[#FB923C] border border-orange-500/40">
                            <Clock className="w-3.5 h-3.5" />
                            Idle ({idleInfo?.currentGapMins ?? 0}m)
                          </span>
                          {idleInfo?.is15mSingleGap && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500 text-slate-950">
                              <AlertTriangle className="w-3 h-3" />
                              15m+ Single Gap
                            </span>
                          )}
                          {idleInfo?.is30mCumulativeIdle && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40">
                              30m+ Daily Idle ({idleInfo.cumulativeIdleMins}m)
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase bg-slate-800 text-[#888888]">
                          Clocked Out
                        </span>
                      )}
                    </td>

                    <td className="py-4 px-4">
                      {runningEntry ? (
                        <div>
                          <span className="px-2 py-0.5 rounded bg-[#10B981] text-slate-950 font-mono text-[10px] font-bold mr-1.5">
                            {runningEntry.client_code}
                          </span>
                          <span className="font-semibold text-[#E8E8E8]">
                            {runningEntry.client_name}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    <td className="py-4 px-4">
                      {runningEntry ? (
                        <div>
                          <div className="font-bold text-white">{runningEntry.task_name}</div>
                          {runningEntry.order_ref && (
                            <div className="text-xs font-mono text-slate-400">
                              Ref: {runningEntry.order_ref}
                            </div>
                          )}
                        </div>
                      ) : isClockedIn ? (
                        <span className="text-amber-400 font-semibold text-xs">
                          Clocked in — awaiting task start
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    <td className="py-4 px-4 font-mono text-base font-black">
                      {runningEntry ? (
                        <span
                          className={
                            isOverIdlePrompt ? 'text-amber-400' : 'text-emerald-400'
                          }
                        >
                          {formatElapsedHMS(elapsedSec)}
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    <td className="py-4 px-4 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        {resumableCrew && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              handleResumeOnCrew({
                                operativeId: operative.id,
                                opName: operative.display_name,
                                crewId: resumableCrew.crewId,
                                clientId: resumableCrew.clientId,
                                taskTypeId: resumableCrew.taskTypeId,
                                taskName: resumableCrew.taskName,
                                orderRef: resumableCrew.orderRef,
                              })
                            }
                            className="px-3 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black inline-flex items-center gap-1 shadow-md"
                            title={`Stopped ${resumableCrew.minutesAgo}m ago — Resume on Crew`}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Resume Crew ({resumableCrew.minutesAgo}m ago)
                          </button>
                        )}
                        {runningEntry && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              handleStopSingleEntry(runningEntry, operative.display_name)
                            }
                            className="px-3 py-2 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-bold inline-flex items-center gap-1"
                          >
                            <Square className="w-3 h-3 fill-current" />
                            Stop
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREW START MODAL */}
      {showCrewModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleStartCrew}
            className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-6 h-6 text-emerald-400" />
                <h3 className="text-xl font-black text-white">Start Crew Task</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCrewModal(false)}
                className="p-2 rounded-lg bg-slate-800 text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                1. Pick Operatives ({selectedOperativeIds.length} selected)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {rows.map(({ operative, runningEntry }) => {
                  const checked = selectedOperativeIds.includes(operative.id);
                  return (
                    <label
                      key={operative.id}
                      className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer ${
                        checked
                          ? 'bg-emerald-500/20 border-emerald-400 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCrewOperative(operative.id)}
                        className="w-5 h-5 rounded accent-emerald-500"
                      />
                      <div>
                        <div className="font-bold text-sm">{operative.display_name}</div>
                        <div className="text-[11px] text-slate-400">
                          {runningEntry
                            ? `Currently on ${runningEntry.client_code} · ${runningEntry.task_name}`
                            : 'Available'}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  2. Client
                </label>
                <select
                  value={crewClientId}
                  onChange={(e) => setCrewClientId(e.target.value)}
                  className="w-full h-12 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  3. Task Type
                </label>
                <select
                  value={crewTaskTypeId}
                  onChange={(e) => setCrewTaskTypeId(e.target.value)}
                  className="w-full h-12 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
                >
                  {crewTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Order / Container Ref (Optional)
              </label>
              <input
                type="text"
                value={crewOrderRef}
                onChange={(e) => setCrewOrderRef(e.target.value)}
                placeholder="e.g. CONT-7721"
                className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCrewModal(false)}
                className="btn-glove px-5 rounded-xl bg-slate-800 text-slate-300 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || selectedOperativeIds.length === 0}
                className="btn-glove px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black"
              >
                Start Crew ({selectedOperativeIds.length})
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SHIFT-END CLOSE CONFIRMATION MODAL */}
      {showShiftEndConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border-2 border-rose-500/80 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-rose-400">
                    Confirm Shift-End Close
                  </div>
                  <h3 className="text-xl font-black text-white mt-0.5">
                    Close All Open Shifts Now?
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShiftEndConfirmModal(false)}
                className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-sm text-slate-300">
              <p>
                This will immediately close today&apos;s shift across the warehouse floor:
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs font-semibold text-slate-200">
                <li>
                  <strong className="text-amber-300">
                    {onTaskCount + idleClockedInCount} open attendance record(s)
                  </strong>{' '}
                  will be clocked out and flagged as auto-closed for review.
                </li>
                <li>
                  <strong className="text-emerald-300">
                    {onTaskCount} running task timer(s)
                  </strong>{' '}
                  will be stopped and flagged as auto-stopped.
                </li>
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowShiftEndConfirmModal(false)}
                className="btn-glove rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center justify-center"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleRunShiftEndNow}
                className="btn-glove rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black shadow-lg flex items-center justify-center gap-2"
              >
                {busy ? 'Closing...' : 'Yes, Close Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DECLARE QUANTITY COMPLETED MODAL ON FLOOR STOP */}
      {stopModalTarget && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const parsed =
                stopModalUnits.trim() !== '' ? parseInt(stopModalUnits.trim(), 10) : 0;
              const num = Number.isNaN(parsed) ? 0 : parsed;
              if (num <= 0) {
                setStopZeroConfirmTarget({ kind: 'single', units: 0 });
                return;
              }
              confirmStopSingleEntryWithUnits(num);
            }}
            className="w-full max-w-md bg-slate-900 border-2 border-emerald-500/80 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-emerald-400">
                  Stopping Task ({stopModalTarget.opName})
                </div>
                <h3 className="text-xl font-black text-white mt-0.5">
                  Declare Quantity Completed ({stopModalTarget.entry.unit_label || 'units'})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {stopModalTarget.entry.client_code} · {stopModalTarget.entry.task_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStopModalTarget(null)}
                className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                How many {stopModalTarget.entry.unit_label || 'units'} were completed? *
              </label>
              <input
                type="number"
                min={0}
                required
                autoFocus
                value={stopModalUnits}
                onChange={(e) => setStopModalUnits(e.target.value)}
                placeholder={`Enter ${stopModalTarget.entry.unit_label || 'units'} count (e.g. 25)`}
                className="w-full h-14 px-4 rounded-xl bg-slate-950 border-2 border-emerald-500/60 text-2xl font-black font-mono text-white focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setStopZeroConfirmTarget({ kind: 'single', units: 0 })}
                className="btn-glove rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center"
              >
                Stop with 0 {stopModalTarget.entry.unit_label || 'units'}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="btn-glove rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center"
              >
                {busy ? 'Saving...' : 'Save Quantity & Stop'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DECLARE QUANTITY COMPLETED MODAL ON CREW STOP (ITEM #12) */}
      {stopCrewModalTarget && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const parsed =
                stopCrewUnits.trim() !== '' ? parseInt(stopCrewUnits.trim(), 10) : 0;
              const num = Number.isNaN(parsed) ? 0 : parsed;
              if (num <= 0) {
                setStopZeroConfirmTarget({
                  kind: 'crew',
                  crewId: stopCrewModalTarget.crewId,
                  units: 0,
                });
                return;
              }
              confirmStopCrewWithUnits(num);
            }}
            className="w-full max-w-md bg-slate-900 border-2 border-emerald-500/80 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-emerald-400">
                  Stopping Crew ({stopCrewModalTarget.members.length} Operatives)
                </div>
                <h3 className="text-xl font-black text-white mt-0.5">
                  Declare Crew Quantity ({stopCrewModalTarget.unitLabel})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {stopCrewModalTarget.clientCode} · {stopCrewModalTarget.taskName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStopCrewModalTarget(null)}
                className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                How many {stopCrewModalTarget.unitLabel} were completed per operative / run? *
              </label>
              <input
                type="number"
                min={0}
                required
                autoFocus
                value={stopCrewUnits}
                onChange={(e) => setStopCrewUnits(e.target.value)}
                placeholder={`Enter ${stopCrewModalTarget.unitLabel} count (e.g. 40)`}
                className="w-full h-14 px-4 rounded-xl bg-slate-950 border-2 border-emerald-500/60 text-2xl font-black font-mono text-white focus:outline-none focus:border-emerald-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  setStopZeroConfirmTarget({
                    kind: 'crew',
                    crewId: stopCrewModalTarget.crewId,
                    units: 0,
                  })
                }
                className="btn-glove rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center justify-center"
              >
                Stop with 0 {stopCrewModalTarget.unitLabel}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="btn-glove rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center"
              >
                {busy ? 'Saving...' : 'Save Quantity & Stop Crew'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* RED WARNING CONFIRMATION FOR ZERO PRODUCTIVITY ON FLOOR / CREW STOP (ITEM #12) */}
      {stopZeroConfirmTarget && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border-2 border-rose-500 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/40">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-rose-400">
                    Zero Productivity Warning
                  </div>
                  <h3 className="text-xl font-black text-white mt-0.5">
                    Confirm 0 units completed?
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStopZeroConfirmTarget(null)}
                className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-950/35 border border-rose-500/40 text-xs text-rose-200 font-semibold leading-relaxed">
              Recording 0 units will exclude this time from pace averages and flag it as a Zero-Productivity run for Manager Review.
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => setStopZeroConfirmTarget(null)}
                className="btn-glove rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center"
              >
                No, Enter Quantity
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (stopZeroConfirmTarget.kind === 'single') {
                    confirmStopSingleEntryWithUnits(0);
                  } else {
                    confirmStopCrewWithUnits(0);
                  }
                }}
                className="btn-glove rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-sm flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                Yes, Confirm Zero
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ASSIGN TASK TO OPERATIVE MODAL (ITEM #7) */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleAssignTaskSubmit}
            className="w-full max-w-lg bg-slate-900 border-2 border-amber-400 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-300 flex items-center justify-center">
                  <Send className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-amber-400">
                    Supervisor Queue Push
                  </div>
                  <h3 className="text-xl font-black text-white">
                    Assign Task to Operative
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  1. Operative
                </label>
                <select
                  value={assignOperativeId}
                  onChange={(e) => setAssignOperativeId(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
                >
                  <option value="OPEN_POOL">
                    📢 OPEN TASK POOL — Any Available Operative Can Grab (Grab App Mode)
                  </option>
                  {rows.map(({ operative }) => (
                    <option key={operative.id} value={operative.id}>
                      {operative.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  2. Client
                </label>
                <select
                  value={assignClientId}
                  onChange={(e) => setAssignClientId(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  3. Task Type
                </label>
                <select
                  value={assignTaskTypeId}
                  onChange={(e) => setAssignTaskTypeId(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
                >
                  {assignTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Order / Batch Ref (Optional)
                </label>
                <input
                  type="text"
                  value={assignOrderRef}
                  onChange={(e) => setAssignOrderRef(e.target.value)}
                  placeholder="e.g. PO-4410"
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Target Quantity (Optional)
                </label>
                <input
                  type="number"
                  min={1}
                  value={assignTargetUnits}
                  onChange={(e) => setAssignTargetUnits(e.target.value)}
                  placeholder="e.g. 120"
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Supervisor Priority Note (Shown on Operative&apos;s Screen)
                </label>
                <input
                  type="text"
                  value={assignPriorityNote}
                  onChange={(e) => setAssignPriorityNote(e.target.value)}
                  placeholder="e.g. Priority 2pm carrier collection — Bench 3"
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="btn-glove px-5 rounded-xl bg-slate-800 text-slate-300 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !assignOperativeId || !assignTaskTypeId}
                className="btn-glove px-6 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black flex items-center gap-1.5"
              >
                <Send className="w-4 h-4" />
                Assign to Operative
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
