'use client';

import {
  createManualEntryAction,
  markAttendanceReviewedAction,
  stopTaskAction,
  syncHelmWmsOrdersAction,
  updateTimeEntryAction,
} from '@/app/actions';
import {
  calculateActualVsStandardPercent,
  comparePaceWithDayAverage,
  computeDailyTaskAverages,
  formatHours,
  formatLondonDateTime,
  formatLondonTime,
  formatMinutesReadable,
  getDurationMinutes,
  minutesToHours,
} from '@/lib/calculations';
import { getTaskHueStyle, resolveHueFamilyKey, TaskHueStyle } from '@/lib/taskColors';
import {
  BillingStatus,
  getBillingStatusConfig,
  isTaskDecreedUnbilled,
  resolveBillingStatus,
} from '@/lib/billingStatus';
import {
  Attendance,
  AuditEvent,
  Client,
  TaskType,
  TimeEntry,
  UserPublic,
} from '@/lib/types';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  EyeOff,
  Filter,
  History,
  Layers,
  Package,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Square,
  Target,
  User,
  Users,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, { useMemo, useState } from 'react';

interface EntriesClientProps {
  dateStr: string;
  entries: TimeEntry[];
  auditsByEntry: Record<string, AuditEvent[]>;
  attendance: Attendance[];
  clients: Client[];
  taskTypes: TaskType[];
  operatives: UserPublic[];
  currentUser?: UserPublic | null;
}

function toDatetimeLocalValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function EntriesClient({
  dateStr,
  entries,
  auditsByEntry,
  attendance,
  clients,
  taskTypes,
  operatives,
  currentUser,
}: EntriesClientProps) {
  const router = useRouter();

  // Role verification: is user supervisor or admin?
  const isSupervisorOrAbove = currentUser
    ? currentUser.role === 'supervisor' || currentUser.role === 'admin'
    : true;

  // View role toggle: allows supervisor/admin to preview how operatives see the screen (day average hidden)
  const [viewRoleMode, setViewRoleMode] = useState<'supervisor' | 'operative'>(
    isSupervisorOrAbove ? 'supervisor' : 'operative'
  );

  // Grouping mode: by operative (default) or compare side-by-side by task
  const [groupingMode, setGroupingMode] = useState<'operative' | 'task'>('operative');

  // Hue category filter: 'ALL' or specific hue family
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Text search query: filter by task title, code, client, or operative
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Quick Filter & Sort for Below Target (Most Urgent First) — Item #15
  const [belowTargetUrgentOnly, setBelowTargetUrgentOnly] = useState<boolean>(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedAuditId, setExpandedAuditId] = useState<string | null>(null);

  // Inline edit form state
  const [editClientId, setEditClientId] = useState('');
  const [editTaskTypeId, setEditTaskTypeId] = useState('');
  const [editOrderRef, setEditOrderRef] = useState('');
  const [editStartedAt, setEditStartedAt] = useState('');
  const [editEndedAt, setEditEndedAt] = useState('');
  const [editUnits, setEditUnits] = useState('');
  const [editBillingStatus, setEditBillingStatus] = useState<BillingStatus>('needs_billed');
  const [editNote, setEditNote] = useState('');

  // Manual entry modal state
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualUserId, setManualUserId] = useState(operatives[0]?.id ?? '');
  const [manualClientId, setManualClientId] = useState(clients[0]?.id ?? '');
  const [manualTaskTypeId, setManualTaskTypeId] = useState(taskTypes[0]?.id ?? '');
  const [manualOrderRef, setManualOrderRef] = useState('');
  const [manualStartedAt, setManualStartedAt] = useState(`${dateStr}T09:00`);
  const [manualEndedAt, setManualEndedAt] = useState(`${dateStr}T10:30`);
  const [manualUnits, setManualUnits] = useState('');
  const [manualBillingStatus, setManualBillingStatus] = useState<BillingStatus>('needs_billed');
  const [manualNote, setManualNote] = useState('');

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [zeroConfirmAction, setZeroConfirmAction] = useState<(() => Promise<void>) | null>(
    null
  );

  // Mandatory justification state for unbilled tasks ("Our Cost")
  const [unbillJustification, setUnbillJustification] = useState('');
  const [editUnbilledReason, setEditUnbilledReason] = useState('');
  const [manualUnbilledReason, setManualUnbilledReason] = useState('');

  // Supervisor authorization modal for unbilled tasks ("Our Cost")
  const [unbillAuthModal, setUnbillAuthModal] = useState<{
    taskTitle: string;
    onConfirm: (justification: string) => void;
  } | null>(null);

  // Enforce role restriction: only show day average when user is supervisor/admin AND not in preview operative mode
  const showDayAverage = isSupervisorOrAbove && viewRoleMode === 'supervisor';

  // Compute daily task averages across all operatives on this date
  const dailyTaskAverages = useMemo(() => {
    return computeDailyTaskAverages(entries);
  }, [entries]);

  // Map task types by ID for rapid lookup of category and standards
  const taskTypeMap = useMemo(() => {
    const map = new Map<string, TaskType>();
    for (const t of taskTypes) {
      map.set(t.id, t);
    }
    return map;
  }, [taskTypes]);

  // Compute count of entries per hue category for filter pills
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: entries.length,
      amber_orange: 0,
      electric_blue: 0,
      turquoise_emerald: 0,
      radiant_violet: 0,
      rose_crimson: 0,
    };
    for (const entry of entries) {
      const task = taskTypeMap.get(entry.task_type_id);
      const fam = resolveHueFamilyKey({
        category: task?.category,
        code: entry.task_code,
        name: entry.task_name,
        clientId: entry.client_id,
      });
      counts[fam] = (counts[fam] || 0) + 1;
    }
    return counts;
  }, [entries, taskTypeMap]);

  // Filter entries based on the active hue category filter and search query
  const filteredEntries = useMemo(() => {
    let list = entries;

    // 1. Hue Category filter
    if (categoryFilter !== 'ALL') {
      list = list.filter((entry) => {
        const task = taskTypeMap.get(entry.task_type_id);
        const fam = resolveHueFamilyKey({
          category: task?.category,
          code: entry.task_code,
          name: entry.task_name,
          clientId: entry.client_id,
        });
        return fam === categoryFilter;
      });
    }

    // 2. Search query filter (matches task title, task code, client code/name, operative name, order ref)
    const query = searchQuery.trim().toLowerCase();
    if (query) {
      list = list.filter((entry) => {
        const task = taskTypeMap.get(entry.task_type_id);
        const taskTitle = (entry.task_name || task?.name || '').toLowerCase();
        const taskCode = (entry.task_code || task?.code || '').toLowerCase();
        const clientCode = (entry.client_code || task?.client_code || '').toLowerCase();
        const clientName = (entry.client_name || task?.client_name || '').toLowerCase();
        const userName = (entry.user_name || '').toLowerCase();
        const orderRef = (entry.order_ref || '').toLowerCase();
        const note = (entry.note || '').toLowerCase();
        const category = (task?.category || '').toLowerCase();

        return (
          taskTitle.includes(query) ||
          taskCode.includes(query) ||
          clientCode.includes(query) ||
          clientName.includes(query) ||
          userName.includes(query) ||
          orderRef.includes(query) ||
          note.includes(query) ||
          category.includes(query)
        );
      });
    }

    // 3. Below Target (Most Urgent First) filter & sort (Item #15)
    if (belowTargetUrgentOnly) {
      const getPacePctForEntry = (entry: TimeEntry): number => {
        if (!entry.ended_at) return 999;
        const dur = getDurationMinutes(entry.started_at, entry.ended_at);
        if (dur < 1) return 999;
        const task = taskTypeMap.get(entry.task_type_id);
        const std = entry.standard_minutes ?? task?.standard_minutes ?? null;
        if (!std || std <= 0) return 999;
        if (!entry.units || entry.units <= 0) return 0; // Zero productivity is most urgent (0%)
        const pct = calculateActualVsStandardPercent({
          standardMinutes: std,
          unitLabel: entry.unit_label || task?.unit_label || 'units',
          actualMinutes: dur,
          units: entry.units,
        });
        return pct ?? 999;
      };

      list = list
        .filter((e) => getPacePctForEntry(e) < 95)
        .sort((a, b) => getPacePctForEntry(a) - getPacePctForEntry(b));
    }

    return list;
  }, [entries, categoryFilter, searchQuery, belowTargetUrgentOnly, taskTypeMap]);

  // Group entries by operative
  const groupedByOperative = useMemo(() => {
    const map = new Map<
      string,
      { userId: string; userName: string; entries: TimeEntry[] }
    >();

    for (const entry of filteredEntries) {
      const group = map.get(entry.user_id) ?? {
        userId: entry.user_id,
        userName: entry.user_name ?? 'Operative',
        entries: [],
      };
      group.entries.push(entry);
      map.set(entry.user_id, group);
    }
    return Array.from(map.values());
  }, [filteredEntries]);

  // Group entries by task for side-by-side cross-operative comparison
  const groupedByTask = useMemo(() => {
    const map = new Map<
      string,
      {
        taskId: string;
        taskName: string;
        taskCode: string;
        clientCode: string;
        category?: string;
        standardMinutes: number | null;
        unitLabel: string | null;
        entries: TimeEntry[];
        totalDurationMins: number;
        totalUnits: number;
        distinctOperatives: Set<string>;
      }
    >();

    for (const entry of filteredEntries) {
      const tid = entry.task_type_id;
      const task = taskTypeMap.get(tid);
      let group = map.get(tid);
      if (!group) {
        group = {
          taskId: tid,
          taskName: entry.task_name || task?.name || 'Task',
          taskCode: entry.task_code || task?.code || 'TSK',
          clientCode: entry.client_code || task?.client_code || 'CLNT',
          category: task?.category,
          standardMinutes: entry.standard_minutes ?? task?.standard_minutes ?? null,
          unitLabel: entry.unit_label ?? task?.unit_label ?? null,
          entries: [],
          totalDurationMins: 0,
          totalUnits: 0,
          distinctOperatives: new Set<string>(),
        };
        map.set(tid, group);
      }
      group.entries.push(entry);
      if (entry.ended_at) {
        group.totalDurationMins += getDurationMinutes(entry.started_at, entry.ended_at);
      }
      if (entry.units && entry.units > 0) {
        group.totalUnits += entry.units;
      }
      group.distinctOperatives.add(entry.user_id);
    }
    return Array.from(map.values());
  }, [filteredEntries, taskTypeMap]);

  const unreviewedAttendance = useMemo(
    () => attendance.filter((a) => a.auto_closed && !a.reviewed),
    [attendance]
  );

  const handleSelectOurCost = (mode: 'edit' | 'manual', taskTypeId: string) => {
    const task = taskTypeMap.get(taskTypeId);
    const decreed = isTaskDecreedUnbilled({
      category: task?.category,
      taskCode: task?.code,
      taskName: task?.name,
      defaultBillingStatus: task?.billing_status,
      billable: task?.billable,
    });

    const existingReason = mode === 'edit' ? editUnbilledReason : manualUnbilledReason;
    const initialJustification =
      existingReason ||
      (decreed
        ? `Routine warehouse ${task?.category || 'maintenance'} (standard decree)`
        : '');
    setUnbillJustification(initialJustification);

    setUnbillAuthModal({
      taskTitle: task?.name || 'this task',
      onConfirm: (justification: string) => {
        if (mode === 'edit') {
          setEditBillingStatus('our_cost');
          setEditUnbilledReason(justification);
        } else {
          setManualBillingStatus('our_cost');
          setManualUnbilledReason(justification);
        }
        setUnbillAuthModal(null);
      },
    });
  };

  const beginInlineEdit = (entry: TimeEntry) => {
    setEditingId(entry.id);
    setEditClientId(entry.client_id);
    setEditTaskTypeId(entry.task_type_id);
    setEditOrderRef(entry.order_ref ?? '');
    setEditStartedAt(toDatetimeLocalValue(entry.started_at));
    setEditEndedAt(toDatetimeLocalValue(entry.ended_at));
    setEditUnits(entry.units !== null && entry.units !== undefined ? String(entry.units) : '');
    setEditUnbilledReason(entry.unbilled_reason ?? '');
    const currentStatus = resolveBillingStatus({
      billingStatus: entry.billing_status,
      billable: entry.billable,
      category: taskTypeMap.get(entry.task_type_id)?.category,
      taskCode: entry.task_code,
      taskName: entry.task_name,
    });
    setEditBillingStatus(currentStatus);
    setEditNote(entry.note ?? '');
  };

  const executeSaveInlineEdit = async (entryId: string, parsedUnits: number | null) => {
    if (editBillingStatus === 'our_cost' && !editUnbilledReason.trim()) {
      setMessage('A mandatory justification is required when marking a task as Our Cost.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await updateTimeEntryAction({
      entryId,
      clientId: editClientId,
      taskTypeId: editTaskTypeId,
      orderRef: editOrderRef || null,
      startedAt: new Date(editStartedAt).toISOString(),
      endedAt: editEndedAt ? new Date(editEndedAt).toISOString() : null,
      units: parsedUnits,
      billingStatus: editBillingStatus,
      unbilledReason: editBillingStatus === 'our_cost' ? editUnbilledReason.trim() : null,
      note: editNote || null,
    });
    setBusy(false);

    if (res.ok) {
      setEditingId(null);
      setExpandedAuditId(entryId);
      setMessage('Time entry updated and change written to audit trail.');
      router.refresh();
    } else {
      setMessage(res.error || 'Could not update entry');
    }
  };

  const handleSaveInlineEdit = async (entryId: string) => {
    const parsedUnits =
      editUnits.trim() !== '' ? parseInt(editUnits.trim(), 10) : null;
    if (parsedUnits !== null && !Number.isNaN(parsedUnits) && parsedUnits <= 0) {
      setZeroConfirmAction(() => () => executeSaveInlineEdit(entryId, parsedUnits));
      return;
    }
    await executeSaveInlineEdit(entryId, parsedUnits);
  };

  const handleStopEntry = async (entryId: string) => {
    setBusy(true);
    await stopTaskAction({ entryId });
    setBusy(false);
    setMessage('Running entry stopped.');
    router.refresh();
  };

  const executeCreateManual = async (parsedUnits: number | null) => {
    if (manualBillingStatus === 'our_cost' && !manualUnbilledReason.trim()) {
      setMessage('A mandatory justification is required when marking a task as Our Cost.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await createManualEntryAction({
      userId: manualUserId,
      clientId: manualClientId,
      taskTypeId: manualTaskTypeId,
      orderRef: manualOrderRef || null,
      startedAt: new Date(manualStartedAt).toISOString(),
      endedAt: manualEndedAt ? new Date(manualEndedAt).toISOString() : null,
      units: parsedUnits,
      billingStatus: manualBillingStatus,
      unbilledReason: manualBillingStatus === 'our_cost' ? manualUnbilledReason.trim() : null,
      billable: manualBillingStatus !== 'our_cost',
      note: manualNote || null,
    });
    setBusy(false);

    if (res.ok) {
      setShowManualModal(false);
      setMessage('Manual time entry added.');
      router.refresh();
    } else {
      setMessage(res.error || 'Could not add manual entry');
    }
  };

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedUnits =
      manualUnits.trim() !== '' ? parseInt(manualUnits.trim(), 10) : null;
    if (parsedUnits !== null && !Number.isNaN(parsedUnits) && parsedUnits <= 0) {
      setZeroConfirmAction(() => () => executeCreateManual(parsedUnits));
      return;
    }
    await executeCreateManual(parsedUnits);
  };

  const handleMarkAttendanceReviewed = async (attendanceId: string) => {
    setBusy(true);
    await markAttendanceReviewedAction({ attendanceId });
    setBusy(false);
    router.refresh();
  };

  const handleSyncHelmOrders = async () => {
    setBusy(true);
    setMessage(null);
    const res = await syncHelmWmsOrdersAction({ dateStr });
    setBusy(false);
    if (res.ok) {
      setMessage(
        `Helm / DespatchCloud WMS Sync complete: ${res.syncedCount ?? 0} Pick & Pack sessions verified (${res.totalOrdersSynced ?? 0} orders overlaid).`
      );
      router.refresh();
    } else {
      setMessage(res.error || 'Failed to sync Helm / DespatchCloud WMS orders.');
    }
  };

  /**
   * Render an individual Time Entry Card with:
   * - Deterministic Task Hue & Shade styling
   * - Highlighted Station 1: Production Output (Units & Actual Pace)
   * - Highlighted Station 2: Target Standard (Expected Units & Standard Pace)
   * - Highlighted Station 3: Today's Task Avg (Supervisor & Above Only)
   */
  const renderEntryCard = (entry: TimeEntry, showOperativeHeader = false) => {
    const isEditing = editingId === entry.id;
    const isExpanded = expandedAuditId === entry.id;
    const audits = auditsByEntry[entry.id] || [];
    const isRunning = !entry.ended_at;

    const task = taskTypeMap.get(entry.task_type_id);
    const taskHue = getTaskHueStyle({
      taskId: entry.task_type_id,
      category: task?.category,
      code: entry.task_code || task?.code,
      name: entry.task_name || task?.name,
      clientId: entry.client_id,
    });

    const durationMinutes = entry.ended_at
      ? getDurationMinutes(entry.started_at, entry.ended_at)
      : Math.max(0, (Date.now() - new Date(entry.started_at).getTime()) / 60000);

    const isShortRun = Boolean(entry.ended_at && durationMinutes < 1);
    const durationReadable = formatMinutesReadable(durationMinutes);
    const durationHrsText = entry.ended_at
      ? `${durationReadable} (${formatHours(minutesToHours(durationMinutes))} hrs)`
      : 'Running';

    const unitLabel = entry.unit_label || task?.unit_label || 'units';
    const standardMinutes = entry.standard_minutes ?? task?.standard_minutes ?? null;

    // Actual pace calculation (only compute hourly/per-unit extrapolated rates when run >= 1 min)
    const hasUnits = entry.units !== null && entry.units !== undefined && entry.units > 0;
    const actualPaceMinPerUnit =
      hasUnits && durationMinutes >= 1 ? durationMinutes / (entry.units as number) : null;
    const actualUnitsPerHour =
      hasUnits && durationMinutes >= 1 ? ((entry.units as number) / durationMinutes) * 60 : null;

    // Target benchmark calculations
    const expectedUnits =
      standardMinutes && standardMinutes > 0 && durationMinutes >= 1
        ? Number((durationMinutes / standardMinutes).toFixed(1))
        : null;

    const pacePercent =
      standardMinutes && hasUnits && durationMinutes >= 1
        ? calculateActualVsStandardPercent({
            standardMinutes,
            unitLabel,
            actualMinutes: durationMinutes,
            units: entry.units,
          })
        : null;

    // Day Average calculation (Supervisor & Above Only)
    const dayAvgSummary = dailyTaskAverages.get(entry.task_type_id);
    const dayComparison = comparePaceWithDayAverage({
      actualMinutes: durationMinutes,
      actualUnits: entry.units ?? 0,
      dayAvgMinutesPerUnit: dayAvgSummary?.avgMinutesPerUnit,
    });

    const filteredTasksForEdit = taskTypes.filter(
      (t) => t.client_id === editClientId || t.is_standard
    );

    return (
      <div
        key={entry.id}
        style={{
          borderLeftColor: entry.auto_stopped ? '#EF4444' : taskHue.borderLeftHex,
          borderLeftWidth: '5px',
          backgroundColor: taskHue.cardBgHex,
          borderColor: taskHue.cardBorderHex,
        }}
        className={`p-4 transition border rounded-2xl relative shadow-sm ${
          entry.auto_stopped ? 'bg-rose-950/20' : ''
        }`}
      >
        {isEditing ? (
          <div className="space-y-4 bg-slate-950 p-4 rounded-xl border border-emerald-500/60 shadow-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                Editing Entry — {entry.user_name}
              </span>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Client
                </label>
                <select
                  value={editClientId}
                  onChange={(e) => {
                    const nextClient = e.target.value;
                    setEditClientId(nextClient);
                    const firstTask = taskTypes.find((t) => t.client_id === nextClient);
                    if (firstTask) {
                      setEditTaskTypeId(firstTask.id);
                      setEditBillingStatus(
                        resolveBillingStatus({
                          billingStatus: firstTask.billing_status,
                          billable: firstTask.billable,
                          category: firstTask.category,
                          taskCode: firstTask.code,
                          taskName: firstTask.name,
                        })
                      );
                    }
                  }}
                  className="w-full h-10 px-3 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm font-semibold"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Task
                </label>
                <select
                  value={editTaskTypeId}
                  onChange={(e) => setEditTaskTypeId(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm font-semibold"
                >
                  {filteredTasksForEdit.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} — {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Started At
                </label>
                <input
                  type="datetime-local"
                  value={editStartedAt}
                  onChange={(e) => setEditStartedAt(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Ended At (blank = running)
                </label>
                <input
                  type="datetime-local"
                  value={editEndedAt}
                  onChange={(e) => setEditEndedAt(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Units
                </label>
                <input
                  type="number"
                  value={editUnits}
                  onChange={(e) => setEditUnits(e.target.value)}
                  placeholder="Optional"
                  className="w-full h-10 px-3 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Order Ref
                </label>
                <input
                  type="text"
                  value={editOrderRef}
                  onChange={(e) => setEditOrderRef(e.target.value)}
                  placeholder="Optional"
                  className="w-full h-10 px-3 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                  Note
                </label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  placeholder="Supervisor note..."
                  className="w-full h-10 px-3 rounded-lg bg-slate-900 border border-slate-700 text-white text-sm"
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-4">
                <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1.5">
                  Billing Status
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditBillingStatus('automatically_billed')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                      editBillingStatus === 'automatically_billed'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md font-black'
                        : 'bg-slate-900 text-emerald-300 border-emerald-500/30 hover:bg-emerald-950/30'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Automatically Billed
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditBillingStatus('needs_billed')}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                      editBillingStatus === 'needs_billed'
                        ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-md font-black'
                        : 'bg-slate-900 text-sky-300 border-sky-500/30 hover:bg-sky-950/30'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Needs to be Billed
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (editBillingStatus === 'our_cost') return;
                      handleSelectOurCost('edit', editTaskTypeId);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                      editBillingStatus === 'our_cost'
                        ? 'bg-rose-600 text-white border-rose-500 shadow-md font-black ring-2 ring-rose-500/50'
                        : 'bg-slate-900 text-rose-400 border-rose-500/40 hover:bg-rose-950/40'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Our Cost
                  </button>
                </div>
                {editBillingStatus === 'our_cost' && (
                  <div className="mt-2.5 p-3 rounded-xl bg-rose-950/40 border border-rose-500/50 space-y-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-rose-300">
                      Why is this unbilled? (Mandatory Justification for K & Finance)*
                    </label>
                    <input
                      type="text"
                      required
                      value={editUnbilledReason}
                      onChange={(e) => setEditUnbilledReason(e.target.value)}
                      placeholder="e.g. Supplier defect rework, warehouse housekeeping, authorized training..."
                      className="w-full h-10 px-3 rounded-lg bg-slate-950 border border-rose-500/60 text-white text-xs font-semibold focus:outline-none focus:border-rose-400"
                    />
                    {!editUnbilledReason.trim() && (
                      <p className="text-[10px] text-rose-400 font-bold">
                        * Required: Explain why Cloud9 is absorbing this labor expense.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleSaveInlineEdit(entry.id)}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                Save Changes
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Top Bar: Operative Name (if in task comparison view), Task Hue Tag & Badges */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                {showOperativeHeader && (
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-950 border border-slate-700/80 text-white font-bold text-sm shadow-inner">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>{entry.user_name || 'Operative'}</span>
                  </div>
                )}

                {/* Client Tag */}
                <span className="px-2.5 py-0.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] font-black text-white shadow-sm">
                  {entry.client_code}
                </span>

                {/* Task Hue & Shade Badge */}
                <span
                  style={{
                    backgroundColor: taskHue.badgeBgHex,
                    color: taskHue.badgeTextHex,
                    borderColor: taskHue.badgeBorderHex,
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-mono font-bold shadow-sm"
                >
                  <span className={`w-2 h-2 rounded-full ${taskHue.dotClass}`} />
                  {entry.task_code || 'TASK'}
                </span>

                {/* Task Name */}
                <span className="text-sm font-bold text-slate-100">
                  {entry.task_name}
                </span>

                {/* Shade Label Tag */}
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-950/70 text-slate-300 border border-slate-800/80">
                  {taskHue.shadeName}
                </span>

                {/* 3-State Billing Status Pill */}
                {(() => {
                  const status = resolveBillingStatus({
                    billingStatus: entry.billing_status,
                    billable: entry.billable,
                    category: task?.category,
                    taskCode: entry.task_code,
                    taskName: entry.task_name,
                  });
                  const config = getBillingStatusConfig(status);

                  return (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase shadow-sm ${config.badgeClass}`}
                      title={config.description}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
                      {config.label}
                    </span>
                  );
                })()}

                {(() => {
                  const status = resolveBillingStatus({
                    billingStatus: entry.billing_status,
                    billable: entry.billable,
                    category: task?.category,
                    taskCode: entry.task_code,
                    taskName: entry.task_name,
                  });
                  if (status === 'our_cost' && entry.unbilled_reason) {
                    return (
                      <span
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/70 border border-rose-500/50 text-rose-300 shadow-sm max-w-[320px] truncate"
                        title={`Unbill Justification: ${entry.unbilled_reason}`}
                      >
                        <span className="text-rose-400 font-black uppercase text-[9px]">
                          Justification:
                        </span>{' '}
                        &ldquo;{entry.unbilled_reason}&rdquo;
                      </span>
                    );
                  }
                  return null;
                })()}

                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 text-[10px] font-mono">
                  {entry.source}
                </span>

                {entry.auto_stopped && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white shadow-sm">
                    <AlertTriangle className="w-3 h-3" />
                    Auto-Stopped
                  </span>
                )}
              </div>

              {/* Time Window & Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
                <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-950/90 border border-slate-800 text-xs font-mono">
                  <span className="text-slate-300 font-bold">
                    {formatLondonTime(entry.started_at)} →{' '}
                    {isRunning ? (
                      <span className="text-[#22D3EE] font-black animate-pulse">Running</span>
                    ) : (
                      formatLondonTime(entry.ended_at)
                    )}
                  </span>
                  <span className="text-slate-500">|</span>
                  <span
                    className={`font-black ${
                      isRunning ? 'text-cyan-300' : 'text-emerald-400'
                    }`}
                  >
                    {durationHrsText}
                  </span>
                </div>

                {isRunning && isSupervisorOrAbove && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleStopEntry(entry.id)}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold inline-flex items-center gap-1 shadow-sm"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    Stop
                  </button>
                )}

                {isSupervisorOrAbove && (
                  <button
                    type="button"
                    onClick={() => beginInlineEdit(entry)}
                    className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-bold inline-flex items-center gap-1 border border-slate-700"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setExpandedAuditId(isExpanded ? null : entry.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 border ${
                    audits.length > 0
                      ? 'bg-slate-900 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  <History className="w-3.5 h-3.5" />
                  Audit ({audits.length})
                  {isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* THREE HIGHLIGHTED STATIONS: PRODUCTION, TARGET, TODAY'S AVG */}
            <div
              className={`grid grid-cols-1 sm:grid-cols-2 ${
                showDayAverage ? 'lg:grid-cols-3' : ''
              } gap-3 pt-1`}
            >
              {/* STATION 1: HIGHLIGHTED PRODUCTION OUTPUT */}
              <div className="rounded-xl p-3.5 bg-slate-950/90 border border-emerald-500/30 hover:border-emerald-500/50 shadow-md transition space-y-1">
                <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-400">
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <Package className="w-3.5 h-3.5 stroke-[2.5]" />
                    Production Output
                  </span>
                  {hasUnits && actualUnitsPerHour !== null && (
                    <span className="text-[10px] font-mono font-bold text-emerald-300 px-1.5 py-0.2 rounded bg-emerald-500/15 border border-emerald-500/30">
                      {actualUnitsPerHour.toFixed(1)} / hr
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-2 pt-0.5">
                  <span className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
                    {entry.units !== null && entry.units !== undefined
                      ? entry.units.toLocaleString()
                      : isRunning
                      ? '—'
                      : '0'}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {unitLabel}
                  </span>
                </div>

                <div className="text-[11px] font-mono text-slate-300 pt-0.5">
                  {hasUnits && actualPaceMinPerUnit !== null ? (
                    <span>
                      ⚡ Actual Pace:{' '}
                      <strong className="text-white">
                        {actualPaceMinPerUnit.toFixed(2)} min / {unitLabel}
                      </strong>
                    </span>
                  ) : hasUnits && isShortRun ? (
                    <span className="text-amber-300">
                      ⚡ Logged in {durationReadable} (&lt;1m — rate not extrapolated)
                    </span>
                  ) : isRunning ? (
                    <span className="text-cyan-400 font-bold">
                      ⚡ In progress ({formatMinutesReadable(durationMinutes)} elapsed)
                    </span>
                  ) : (
                    <span className="text-slate-500">0 output units recorded</span>
                  )}
                </div>
              </div>

              {/* STATION 2: HIGHLIGHTED TARGET STANDARD */}
              <div className="rounded-xl p-3.5 bg-slate-950/90 border border-sky-500/30 hover:border-sky-500/50 shadow-md transition space-y-1">
                <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-slate-400">
                  <span className="flex items-center gap-1.5 text-sky-400">
                    <Target className="w-3.5 h-3.5 stroke-[2.5]" />
                    Target Standard
                  </span>
                  {pacePercent !== null && (
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full border ${
                        pacePercent >= 105
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : pacePercent >= 95
                          ? 'bg-teal-500/20 text-teal-300 border-teal-500/40'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}
                    >
                      {pacePercent >= 105 ? (
                        <ArrowUpRight className="w-3 h-3 stroke-[3]" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3 stroke-[3]" />
                      )}
                      {pacePercent}% pace
                    </span>
                  )}
                </div>

                <div className="flex items-baseline gap-2 pt-0.5">
                  <span className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
                    {standardMinutes ? standardMinutes.toFixed(2) : '—'}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {standardMinutes ? `min / ${unitLabel}` : 'Not set'}
                  </span>
                </div>

                <div className="text-[11px] font-mono text-slate-300 pt-0.5">
                  {standardMinutes ? (
                    isShortRun ? (
                      <span className="text-slate-400">
                        🎯 Standard rate: <strong className="text-white">{(60 / standardMinutes).toFixed(1)} {unitLabel}/hr</strong> (run &lt;1m)
                      </span>
                    ) : (
                      <span>
                        🎯 Expected in {durationReadable}:{' '}
                        <strong className="text-white">
                          {expectedUnits ?? 0} {unitLabel}
                        </strong>{' '}
                        ({(60 / standardMinutes).toFixed(1)}/hr)
                      </span>
                    )
                  ) : (
                    <span className="text-slate-500">Ad-hoc task (no SOP benchmark)</span>
                  )}
                </div>
              </div>

              {/* STATION 3: HIGHLIGHTED TODAY'S AVERAGE (Supervisor & Above Only) */}
              {showDayAverage && (
                <div className="rounded-xl p-3.5 bg-slate-950/90 border border-amber-500/40 hover:border-amber-500/60 shadow-md transition space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-amber-400">
                    <span className="flex items-center gap-1.5">
                      <BarChart2 className="w-3.5 h-3.5 stroke-[2.5]" />
                      Today&apos;s Task Avg
                    </span>
                    <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 uppercase">
                      Supervisor
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2 pt-0.5">
                    <span className="text-2xl sm:text-3xl font-black text-amber-300 font-mono tracking-tight">
                      {dayAvgSummary?.avgMinutesPerUnit
                        ? dayAvgSummary.avgMinutesPerUnit.toFixed(2)
                        : '—'}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-amber-400/80">
                      {dayAvgSummary?.avgMinutesPerUnit
                        ? `min / ${unitLabel}`
                        : 'Awaiting data'}
                    </span>
                  </div>

                  <div className="text-[11px] font-mono text-slate-300 pt-0.5 flex flex-wrap items-center justify-between gap-1">
                    {dayComparison.status !== 'no_comparison' ? (
                      <span
                        className={`font-bold ${
                          dayComparison.status === 'faster'
                            ? 'text-emerald-400'
                            : dayComparison.status === 'slower'
                            ? 'text-rose-400'
                            : 'text-slate-300'
                        }`}
                      >
                        {dayComparison.status === 'faster' &&
                          `▲ +${dayComparison.percentFaster}% faster than team today`}
                        {dayComparison.status === 'slower' &&
                          `▼ ${dayComparison.percentFaster}% slower than team today`}
                        {dayComparison.status === 'equal' &&
                          `≈ On team avg today`}
                      </span>
                    ) : isShortRun && hasUnits ? (
                      <span className="text-slate-500">
                        Run &lt;1m excluded from pace %
                      </span>
                    ) : null}
                    {dayAvgSummary && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        {dayAvgSummary.distinctOperativesCount} op
                        {dayAvgSummary.distinctOperativesCount === 1 ? '' : 's'} (
                        {dayAvgSummary.completedEntriesCount} entries)
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Meta Bar: Reference, Notes */}
            {(entry.order_ref || entry.note) && (
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-slate-400">
                {entry.order_ref && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 font-mono font-bold">
                    Ref: {entry.order_ref}
                  </span>
                )}
                {entry.note && (
                  <span className="italic text-slate-300 font-medium">
                    &ldquo;{entry.note}&rdquo;
                  </span>
                )}
              </div>
            )}

            {/* Expanded Audit Trail */}
            {isExpanded && (
              <div className="mt-3 pt-3 border-t border-slate-800 bg-slate-950/80 rounded-xl p-3 shadow-inner">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Audit Trail ({audits.length} field changes)
                </div>
                {audits.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No edits recorded since this entry was created.
                  </p>
                ) : (
                  <div className="space-y-1.5 text-xs">
                    {audits.map((a) => (
                      <div
                        key={a.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-1 border-b border-slate-900"
                      >
                        <div>
                          <span className="font-mono font-bold text-emerald-400">
                            {a.field}
                          </span>
                          :{' '}
                          <span className="line-through text-rose-400 mr-1.5">
                            {a.old_value ?? 'null'}
                          </span>
                          →{' '}
                          <span className="font-semibold text-white ml-1">
                            {a.new_value ?? 'null'}
                          </span>
                        </div>
                        <div className="text-slate-400">
                          by{' '}
                          <span className="text-slate-200 font-semibold">
                            {a.changed_by_name || 'System'}
                          </span>{' '}
                          at {formatLondonDateTime(a.changed_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
              Warehouse Productivity &amp; Output Ledger
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-bold text-slate-400">
              Europe/London
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white mt-0.5">
            Time Entries
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Visual task hue grouping with highlighted production output, SOP target benchmarks,
            and daily team pace averages.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Supervisor / Operative Privacy Preview Toggle */}
          {isSupervisorOrAbove && (
            <div className="flex items-center bg-slate-950 border border-slate-700/80 rounded-2xl p-1 shadow-inner">
              <button
                type="button"
                onClick={() => setViewRoleMode('supervisor')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition ${
                  viewRoleMode === 'supervisor'
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Full Supervisor View showing highlighted day average pace"
              >
                <Eye className="w-3.5 h-3.5" />
                Supervisor View
              </button>
              <button
                type="button"
                onClick={() => setViewRoleMode('operative')}
                className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition ${
                  viewRoleMode === 'operative'
                    ? 'bg-emerald-500 text-slate-950 shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="Operative View Preview (Day Average strictly hidden)"
              >
                <EyeOff className="w-3.5 h-3.5" />
                Operative View
              </button>
            </div>
          )}

          {/* Grouping Mode Switch: By Operative vs Compare by Task */}
          <div className="flex items-center bg-slate-950 border border-slate-700/80 rounded-2xl p-1 shadow-inner">
            <button
              type="button"
              onClick={() => setGroupingMode('operative')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition ${
                groupingMode === 'operative'
                  ? 'bg-sky-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              By Operative
            </button>
            <button
              type="button"
              onClick={() => setGroupingMode('task')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition ${
                groupingMode === 'task'
                  ? 'bg-sky-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Compare by Task
            </button>
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-700/80 rounded-2xl px-3.5 h-11">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <input
              type="date"
              value={dateStr}
              onChange={(e) => {
                if (e.target.value) {
                  router.push(`/entries?date=${e.target.value}`);
                }
              }}
              className="bg-transparent text-white font-bold text-sm focus:outline-none"
            />
          </div>

          {/* Helm WMS Order Sync + Add Manual Entry Buttons */}
          {isSupervisorOrAbove && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={handleSyncHelmOrders}
                className="btn-glove px-3.5 h-11 rounded-2xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-black flex items-center gap-1.5 transition"
                title="Sync verified order & item counts from Helm / DespatchCloud WMS onto Pick & Pack stopwatch runs"
              >
                <Sparkles className="w-4 h-4 text-cyan-400" />
                Sync Helm WMS Orders
              </button>
              <button
                type="button"
                onClick={() => {
                  const firstClient = clients[0]?.id ?? '';
                  const firstTask =
                    taskTypes.find((t) => t.client_id === firstClient) ?? taskTypes[0];
                  setManualClientId(firstClient);
                  setManualTaskTypeId(firstTask?.id ?? '');
                  setManualBillingStatus(
                    resolveBillingStatus({
                      billingStatus: firstTask?.billing_status,
                      billable: firstTask?.billable,
                      category: firstTask?.category,
                      taskCode: firstTask?.code,
                      taskName: firstTask?.name,
                    })
                  );
                  setManualStartedAt(`${dateStr}T09:00`);
                  setManualEndedAt(`${dateStr}T10:30`);
                  setShowManualModal(true);
                }}
                className="btn-glove px-4 h-11 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-2 shadow-lg"
              >
                <Plus className="w-4 h-4 stroke-[3]" />
                Add Manual Entry
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search Bar & Task Filter Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl space-y-4">
        {/* Search Bar Input */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-emerald-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks by title, code (e.g. FSD, SOP-PICK), client, or operative..."
              className="w-full h-12 pl-10 pr-10 rounded-2xl bg-slate-950 border border-slate-700/80 text-white placeholder-slate-500 text-sm font-semibold focus:outline-none focus:border-emerald-500 transition shadow-inner"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-white"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {searchQuery && (
            <div className="flex items-center gap-2 px-3.5 h-12 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-xs font-mono text-emerald-300 shrink-0">
              <span>Filter:</span>
              <strong className="text-white">&ldquo;{searchQuery}&rdquo;</strong>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 font-bold">
                {filteredEntries.length} {filteredEntries.length === 1 ? 'entry' : 'entries'}
              </span>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="ml-1 p-0.5 rounded hover:bg-emerald-500/20 text-emerald-400 hover:text-white"
                title="Clear"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Task Hue Palette Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80">
          <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mr-2">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            Hue Category:
          </span>

          <button
            type="button"
            onClick={() => setBelowTargetUrgentOnly((prev) => !prev)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 border-2 ${
              belowTargetUrgentOnly
                ? 'bg-rose-600 text-white border-rose-400 shadow-lg shadow-rose-600/30'
                : 'bg-rose-950/30 text-rose-300 border-rose-500/50 hover:bg-rose-950/60'
            }`}
            title="Show only runs below 95% target pace or 0 productivity, sorted worst variance first"
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Below Target (Most Urgent First)</span>
          </button>

          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              categoryFilter === 'ALL'
                ? 'bg-slate-100 text-slate-950 shadow-sm'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <span>All Tasks</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300 text-[10px] font-mono">
              {categoryCounts.ALL}
            </span>
          </button>

          {/* 1. Amber/Orange: Pick & Pack */}
          <button
            type="button"
            onClick={() => setCategoryFilter('amber_orange')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
              categoryFilter === 'amber_orange'
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                : 'bg-amber-950/20 text-amber-300 border-amber-500/30 hover:bg-amber-950/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>Pick &amp; Pack / Dispatch</span>
            <span className="px-1.5 py-0.2 rounded-full bg-amber-950/60 text-amber-200 text-[10px] font-mono">
              {categoryCounts.amber_orange}
            </span>
          </button>

          {/* 2. Electric Blue: Inbound */}
          <button
            type="button"
            onClick={() => setCategoryFilter('electric_blue')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
              categoryFilter === 'electric_blue'
                ? 'bg-blue-500 text-slate-950 border-blue-400 shadow-md'
                : 'bg-blue-950/20 text-blue-300 border-blue-500/30 hover:bg-blue-950/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-400" />
            <span>Inbound &amp; Storage</span>
            <span className="px-1.5 py-0.2 rounded-full bg-blue-950/60 text-blue-200 text-[10px] font-mono">
              {categoryCounts.electric_blue}
            </span>
          </button>

          {/* 3. Turquoise/Emerald: Kitting */}
          <button
            type="button"
            onClick={() => setCategoryFilter('turquoise_emerald')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
              categoryFilter === 'turquoise_emerald'
                ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md'
                : 'bg-emerald-950/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-950/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Kitting &amp; Production</span>
            <span className="px-1.5 py-0.2 rounded-full bg-emerald-950/60 text-emerald-200 text-[10px] font-mono">
              {categoryCounts.turquoise_emerald}
            </span>
          </button>

          {/* 4. Radiant Violet: Returns & QC */}
          <button
            type="button"
            onClick={() => setCategoryFilter('radiant_violet')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
              categoryFilter === 'radiant_violet'
                ? 'bg-purple-500 text-slate-950 border-purple-400 shadow-md'
                : 'bg-purple-950/20 text-purple-300 border-purple-500/30 hover:bg-purple-950/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-purple-400" />
            <span>Returns &amp; QC</span>
            <span className="px-1.5 py-0.2 rounded-full bg-purple-950/60 text-purple-200 text-[10px] font-mono">
              {categoryCounts.radiant_violet}
            </span>
          </button>

          {/* 5. Rose/Crimson: Facilities */}
          <button
            type="button"
            onClick={() => setCategoryFilter('rose_crimson')}
            className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
              categoryFilter === 'rose_crimson'
                ? 'bg-rose-500 text-slate-950 border-rose-400 shadow-md'
                : 'bg-rose-950/20 text-rose-300 border-rose-500/30 hover:bg-rose-950/40'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-rose-400" />
            <span>Facilities &amp; Audit</span>
            <span className="px-1.5 py-0.2 rounded-full bg-rose-950/60 text-rose-200 text-[10px] font-mono">
              {categoryCounts.rose_crimson}
            </span>
          </button>
        </div>
      </div>

      {message && (
        <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/50 text-emerald-300 text-sm font-bold flex items-center justify-between shadow-lg">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Unreviewed Auto-Closed Attendance Alert */}
      {unreviewedAttendance.length > 0 && isSupervisorOrAbove && (
        <div className="bg-amber-950/30 border-2 border-amber-500/60 rounded-3xl p-5 space-y-3 shadow-xl">
          <div className="text-xs font-black uppercase tracking-wider text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Auto-Closed Shift Attendance Needing Review ({unreviewedAttendance.length})
          </div>
          <div className="space-y-2">
            {unreviewedAttendance.map((att) => (
              <div
                key={att.id}
                className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950 border border-amber-500/40 text-sm"
              >
                <div>
                  <span className="font-bold text-white">{att.user_name}</span> — Clocked in{' '}
                  {formatLondonTime(att.clock_in)}, auto-closed at{' '}
                  {formatLondonTime(att.clock_out)}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleMarkAttendanceReviewed(att.id)}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-md transition"
                >
                  Mark Reviewed
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ENTRIES DISPLAY: GROUPED BY OPERATIVE OR GROUPED BY TASK */}
      {filteredEntries.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-12 text-center text-slate-400 space-y-4">
          <Sparkles className="w-8 h-8 text-slate-500 mx-auto" />
          <h3 className="text-lg font-bold text-slate-200">No matching time entries found</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            {searchQuery
              ? `No entries matched your search query "${searchQuery}".`
              : `No entries recorded on ${dateStr}${
                  categoryFilter !== 'ALL' ? ' matching the selected category.' : '.'
                }`}
          </p>
          {(searchQuery || categoryFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('ALL');
              }}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition inline-flex items-center gap-2 shadow-md"
            >
              <X className="w-3.5 h-3.5" />
              Clear Filters &amp; Search
            </button>
          )}
        </div>
      ) : groupingMode === 'operative' ? (
        /* MODE A: GROUPED BY OPERATIVE (WITH TASK HUES & SHADES) */
        <div className="space-y-6">
          {groupedByOperative.map((group) => {
            const totalMins = group.entries.reduce((acc, e) => {
              if (!e.ended_at) return acc;
              return acc + getDurationMinutes(e.started_at, e.ended_at);
            }, 0);

            const totalUnits = group.entries.reduce((acc, e) => {
              return acc + (e.units && e.units > 0 ? e.units : 0);
            }, 0);

            return (
              <div
                key={group.userId}
                className="bg-slate-950/60 border border-slate-800 rounded-3xl overflow-hidden shadow-xl"
              >
                {/* Operative Header */}
                <div className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-sm border border-emerald-500/30">
                      {group.userName[0]}
                    </div>
                    <div>
                      <h2 className="text-base font-black uppercase tracking-wide text-white">
                        {group.userName}
                      </h2>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>
                          {group.entries.length}{' '}
                          {group.entries.length === 1 ? 'task run' : 'task runs'}
                        </span>
                        <span>•</span>
                        <span className="text-emerald-400 font-semibold">
                          {totalUnits.toLocaleString()} units logged
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-xs font-mono font-bold text-slate-300 px-3 py-1 rounded-xl bg-slate-950 border border-slate-800">
                      Total Time:{' '}
                      <span className="text-white font-black">
                        {formatMinutesReadable(totalMins)}
                      </span>{' '}
                      <span className="text-slate-400">
                        ({formatHours(minutesToHours(totalMins))} hrs)
                      </span>
                    </div>
                  </div>
                </div>

                {/* List of Entries for Operative */}
                <div className="p-4 sm:p-5 space-y-4">
                  {group.entries.map((entry) => renderEntryCard(entry, false))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* MODE B: GROUPED BY TASK (SIDE-BY-SIDE CROSS-OPERATIVE COMPARISON) */
        <div className="space-y-6">
          {groupedByTask.map((taskGroup) => {
            const taskHue = getTaskHueStyle({
              taskId: taskGroup.taskId,
              category: taskGroup.category,
              code: taskGroup.taskCode,
              name: taskGroup.taskName,
            });

            const dayAvg = dailyTaskAverages.get(taskGroup.taskId);
            const unitLabel = taskGroup.unitLabel || 'units';

            return (
              <div
                key={taskGroup.taskId}
                style={{
                  borderColor: taskHue.cardBorderHex,
                }}
                className="bg-slate-950/60 border rounded-3xl overflow-hidden shadow-xl"
              >
                {/* Task Header Banner */}
                <div
                  style={{
                    backgroundColor: taskHue.cardHoverBgHex,
                    borderBottomColor: taskHue.cardBorderHex,
                  }}
                  className="px-6 py-4 border-b flex flex-wrap items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <span
                      style={{
                        backgroundColor: taskHue.badgeBgHex,
                        color: taskHue.badgeTextHex,
                        borderColor: taskHue.badgeBorderHex,
                      }}
                      className="px-3 py-1 rounded-xl font-mono text-xs font-black border shadow-sm"
                    >
                      {taskGroup.taskCode}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-400">
                          [{taskGroup.clientCode}]
                        </span>
                        <h2 className="text-lg font-black text-white">
                          {taskGroup.taskName}
                        </h2>
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <span className="text-slate-300 font-medium">
                          {taskHue.familyName}
                        </span>
                        <span>•</span>
                        <span className="text-slate-400">{taskHue.shadeName}</span>
                        <span>•</span>
                        <span className="font-bold text-white">
                          {taskGroup.entries.length} run
                          {taskGroup.entries.length === 1 ? '' : 's'} across{' '}
                          {taskGroup.distinctOperatives.size} operative
                          {taskGroup.distinctOperatives.size === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Task Standard & Day Average Benchmarks */}
                  <div className="flex flex-wrap items-center gap-3">
                    {taskGroup.standardMinutes && (
                      <div className="px-3.5 py-1.5 rounded-xl bg-slate-950/90 border border-sky-500/40 text-xs font-mono">
                        <span className="text-sky-400 font-bold">🎯 SOP Target: </span>
                        <span className="text-white font-black">
                          {taskGroup.standardMinutes.toFixed(2)} min / {unitLabel}
                        </span>{' '}
                        <span className="text-slate-400">
                          ({(60 / taskGroup.standardMinutes).toFixed(1)}/hr)
                        </span>
                      </div>
                    )}

                    {showDayAverage && dayAvg?.avgMinutesPerUnit && (
                      <div className="px-3.5 py-1.5 rounded-xl bg-slate-950/90 border border-amber-500/40 text-xs font-mono">
                        <span className="text-amber-400 font-bold">📊 Today&apos;s Avg: </span>
                        <span className="text-amber-200 font-black">
                          {dayAvg.avgMinutesPerUnit.toFixed(2)} min / {unitLabel}
                        </span>{' '}
                        <span className="text-amber-400/80">
                          ({dayAvg.avgUnitsPerHour?.toFixed(1)}/hr)
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* List of Operative Entries for this Task */}
                <div className="p-4 sm:p-5 space-y-4">
                  {taskGroup.entries.map((entry) => renderEntryCard(entry, true))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ADD MANUAL ENTRY MODAL (SCROLLABLE ON MOBILE — ITEM #18) */}
      {showManualModal && isSupervisorOrAbove && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateManual}
            className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                  Manual Entry
                </span>
                <h3 className="text-xl font-black text-white mt-0.5">
                  Add Time Entry
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Operative
                </label>
                <select
                  value={manualUserId}
                  onChange={(e) => setManualUserId(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold text-sm"
                >
                  {operatives.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.display_name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Client
                </label>
                <select
                  value={manualClientId}
                  onChange={(e) => {
                    const nextC = e.target.value;
                    setManualClientId(nextC);
                    const firstT = taskTypes.find((t) => t.client_id === nextC);
                    if (firstT) {
                      setManualTaskTypeId(firstT.id);
                      setManualBillingStatus(
                        resolveBillingStatus({
                          billingStatus: firstT.billing_status,
                          billable: firstT.billable,
                          category: firstT.category,
                          taskCode: firstT.code,
                          taskName: firstT.name,
                        })
                      );
                    }
                  }}
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold text-sm"
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Task Type
                </label>
                <select
                  value={manualTaskTypeId}
                  onChange={(e) => {
                    const tid = e.target.value;
                    setManualTaskTypeId(tid);
                    const selectedT = taskTypes.find((t) => t.id === tid);
                    if (selectedT) {
                      setManualBillingStatus(
                        resolveBillingStatus({
                          billingStatus: selectedT.billing_status,
                          billable: selectedT.billable,
                          category: selectedT.category,
                          taskCode: selectedT.code,
                          taskName: selectedT.name,
                        })
                      );
                    }
                  }}
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold text-sm"
                >
                  {taskTypes
                    .filter((t) => t.client_id === manualClientId || t.is_standard)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.is_standard ? `[Standard] ${t.name}` : `${t.code} — ${t.name}`}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Start Time
                </label>
                <input
                  type="datetime-local"
                  required
                  value={manualStartedAt}
                  onChange={(e) => setManualStartedAt(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  End Time
                </label>
                <input
                  type="datetime-local"
                  value={manualEndedAt}
                  onChange={(e) => setManualEndedAt(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Units (Optional)
                </label>
                <input
                  type="number"
                  value={manualUnits}
                  onChange={(e) => setManualUnits(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Order Ref (Optional)
                </label>
                <input
                  type="text"
                  value={manualOrderRef}
                  onChange={(e) => setManualOrderRef(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Note (Optional)
                </label>
                <input
                  type="text"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="Reason for manual entry..."
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">
                  Billing Status
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setManualBillingStatus('automatically_billed')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                      manualBillingStatus === 'automatically_billed'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md font-black'
                        : 'bg-slate-950 text-emerald-300 border-emerald-500/30 hover:bg-emerald-950/30'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Automatically Billed
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualBillingStatus('needs_billed')}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                      manualBillingStatus === 'needs_billed'
                        ? 'bg-sky-500 text-slate-950 border-sky-400 shadow-md font-black'
                        : 'bg-slate-950 text-sky-300 border-sky-500/30 hover:bg-sky-950/30'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Needs to be Billed
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (manualBillingStatus === 'our_cost') return;
                      handleSelectOurCost('manual', manualTaskTypeId);
                    }}
                    className={`px-3 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                      manualBillingStatus === 'our_cost'
                        ? 'bg-rose-600 text-white border-rose-500 shadow-md font-black ring-2 ring-rose-500/50'
                        : 'bg-slate-950 text-rose-400 border-rose-500/40 hover:bg-rose-950/40'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Our Cost
                  </button>
                </div>
                {manualBillingStatus === 'our_cost' && (
                  <div className="mt-2.5 p-3 rounded-xl bg-rose-950/40 border border-rose-500/50 space-y-1">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-rose-300">
                      Why is this unbilled? (Mandatory Justification for K & Finance)*
                    </label>
                    <input
                      type="text"
                      required
                      value={manualUnbilledReason}
                      onChange={(e) => setManualUnbilledReason(e.target.value)}
                      placeholder="e.g. Supplier defect rework, warehouse housekeeping, authorized training..."
                      className="w-full h-10 px-3 rounded-lg bg-slate-950 border border-rose-500/60 text-white text-xs font-semibold focus:outline-none focus:border-rose-400"
                    />
                    {!manualUnbilledReason.trim() && (
                      <p className="text-[10px] text-rose-400 font-bold">
                        * Required: Explain why Cloud9 is absorbing this labor expense.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowManualModal(false)}
                className="btn-glove px-5 rounded-2xl bg-slate-800 text-slate-300 font-bold text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="btn-glove px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm shadow-lg"
              >
                Save Manual Entry
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CONFIRM ZERO ACTIVITY MODAL */}
      {zeroConfirmAction && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border-2 border-amber-500 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-amber-400">
                    Zero Productivity Check
                  </div>
                  <h3 className="text-xl font-black text-white mt-0.5 leading-snug">
                    Are you sure you want to enter zero activity for this time?
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setZeroConfirmAction(null)}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => setZeroConfirmAction(null)}
                className="btn-glove rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center"
              >
                No, Go Back
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const fn = zeroConfirmAction;
                  setZeroConfirmAction(null);
                  await fn();
                }}
                className="btn-glove rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm flex items-center justify-center gap-1.5 shadow-lg"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                Yes, Enter Zero
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUPERVISOR AUTHORIZATION FOR UNBILLED TASKS MODAL */}
      {unbillAuthModal && (
        <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border-2 border-rose-500 rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/40">
                  <ShieldAlert className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-rose-400">
                    Supervisor Authorization Required
                  </div>
                  <h3 className="text-lg font-black text-white mt-0.5 leading-snug">
                    Have you got authorization from a supervisor that this is an unbilled task?
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUnbillAuthModal(null)}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-xs text-slate-300 leading-relaxed space-y-1">
              <div>
                Task: <strong className="text-white">&ldquo;{unbillAuthModal.taskTitle}&rdquo;</strong>
              </div>
              <div>
                Marking this as <span className="text-rose-400 font-bold uppercase">Our Cost</span> means Cloud9 absorbs the labor expense and this time will <strong>NOT</strong> be billed to the client.
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-rose-300 mb-1.5">
                Why is this unbilled? (Mandatory Justification for K & Finance)*
              </label>
              <textarea
                required
                rows={3}
                value={unbillJustification}
                onChange={(e) => setUnbillJustification(e.target.value)}
                placeholder="Explain why Cloud9 absorbs this cost (e.g., supplier packaging defect rework, internal stock reorganization, authorized training)..."
                className="w-full p-3 rounded-xl bg-slate-950 border border-rose-500/60 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400 font-medium"
              />
              {!unbillJustification.trim() ? (
                <div className="text-[11px] text-rose-400 font-semibold mt-1">
                  * A typed justification is required to unbill this task.
                </div>
              ) : (
                <div className="text-[11px] text-emerald-400 font-semibold mt-1 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Justification recorded for K & billing audit.
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setUnbillAuthModal(null)}
                className="btn-glove rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center"
              >
                No, Go Back
              </button>
              <button
                type="button"
                disabled={!unbillJustification.trim()}
                onClick={() => unbillAuthModal.onConfirm(unbillJustification.trim())}
                className="btn-glove rounded-2xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:hover:bg-rose-600 text-white font-black text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/30"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                Yes, Authorized as Our Cost
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
