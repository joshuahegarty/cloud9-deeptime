'use client';

import {
  deleteReportViewAction,
  requestTargetChangeAction,
  reviewTargetChangeAction,
  saveReportViewAction,
  signOffCustomerBaselineAction,
  triggerDailySummaryEmailAction,
} from '@/app/actions';
import {
  analyzeTaskTargetVariances,
  calculateActualVsStandardPercent,
  formatHours,
  getDurationMinutes,
  minutesToHours,
  resolveEffectiveRounding,
  roundDurationMinutes,
} from '@/lib/calculations';
import {
  Client,
  SavedView,
  TargetChangeRequest,
  TaskTargetAnalysis,
  TaskType,
  TimeEntry,
  UserPublic,
} from '@/lib/types';
import {
  AlertTriangle,
  ArrowRight,
  Bookmark,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  HelpCircle,
  Info,
  Lock,
  Mail,
  Plus,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useMemo, useState } from 'react';

interface ReportsClientProps {
  startDate: string;
  endDate: string;
  clientId: string;
  taskTypeId: string;
  operativeId: string;
  initialTab: 'client_task' | 'operative' | 'league' | 'targets';
  entries: TimeEntry[];
  clients: Client[];
  taskTypes: TaskType[];
  operatives: UserPublic[];
  savedViews: SavedView[];
  targetChangeRequests?: TargetChangeRequest[];
  currentUser?: UserPublic;
}

export function ReportsClient({
  startDate,
  endDate,
  clientId,
  taskTypeId,
  operativeId,
  initialTab,
  entries,
  clients,
  taskTypes,
  operatives,
  savedViews,
  targetChangeRequests = [],
  currentUser,
}: ReportsClientProps) {
  const router = useRouter();

  const [tab, setTab] = useState<'client_task' | 'operative' | 'league' | 'targets'>(
    initialTab
  );
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);
  const [client, setClient] = useState(clientId);
  const [task, setTask] = useState(taskTypeId);
  const [operative, setOperative] = useState(operativeId);

  // Save view state
  const [newViewName, setNewViewName] = useState('');
  const [busy, setBusy] = useState(false);

  // Target Intelligence & Two-Point Governance State
  const [targetFilter, setTargetFilter] = useState<'all' | 'alerts' | 'on_target' | 'baseline'>('all');
  const [targetClientFilter, setTargetClientFilter] = useState<string>('all');
  const [targetFeedback, setTargetFeedback] = useState<string | null>(null);

  // Request Target Change Modal State (Manager / Supervisor)
  const [requestModalTask, setRequestModalTask] = useState<TaskTargetAnalysis | null>(null);
  const [proposedStandard, setProposedStandard] = useState<number>(0);
  const [changeReason, setChangeReason] = useState<string>('');

  // Customer Baseline Sign-Off Modal State (Admin)
  const [baselineModalClient, setBaselineModalClient] = useState<Client | null>(null);
  const [baselineStatusChoice, setBaselineStatusChoice] = useState<'bossing_it' | 'established' | 'learning'>('bossing_it');
  const [baselineNotesInput, setBaselineNotesInput] = useState<string>('');
  const [managerDelegatedChoice, setManagerDelegatedChoice] = useState<boolean>(false);

  // Reject Request Note State (Admin)
  const [rejectModalRequestId, setRejectModalRequestId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState<string>('');

  // Daily Summary Email Modal preview
  const [summaryPreview, setSummaryPreview] = useState<{
    subject: string;
    html: string;
    sentViaResend: boolean;
    recipients: string[];
  } | null>(null);

  const applyFilters = (nextParams?: Partial<{
    start: string;
    end: string;
    client: string;
    task: string;
    operative: string;
    tab: 'client_task' | 'operative' | 'league' | 'targets';
  }>) => {
    const s = nextParams?.start ?? start;
    const e = nextParams?.end ?? end;
    const c = nextParams?.client ?? client;
    const t = nextParams?.task ?? task;
    const o = nextParams?.operative ?? operative;
    const tb = nextParams?.tab ?? tab;

    const qs = new URLSearchParams({
      start: s,
      end: e,
      client: c,
      task: t,
      operative: o,
      tab: tb,
    });
    router.push(`/reports?${qs.toString()}`);
  };

  const isAdmin = currentUser?.role === 'admin';

  // Target Analysis Engine
  const targetAnalysis = useMemo(() => {
    return analyzeTaskTargetVariances({
      taskTypes,
      entries,
      clients,
      pendingRequests: targetChangeRequests,
      minRunsThreshold: 10,
      minUnitsThreshold: 25,
      minOperativesThreshold: 2,
      varianceThresholdPercent: 10.0,
    });
  }, [taskTypes, entries, clients, targetChangeRequests]);

  const filteredTargetTasks = useMemo(() => {
    return targetAnalysis.tasks.filter((t) => {
      if (targetClientFilter !== 'all') {
        if (targetClientFilter === 'standard') {
          if (t.clientId !== null) return false;
        } else {
          if (t.clientId !== targetClientFilter) return false;
        }
      }
      if (targetFilter === 'alerts') return t.hasRecommendation;
      if (targetFilter === 'on_target') return t.direction === 'on_target';
      if (targetFilter === 'baseline') return !t.isBaselineEstablished;
      return true;
    });
  }, [targetAnalysis.tasks, targetClientFilter, targetFilter]);

  // Target Change Request Modal
  const handleOpenRequestModal = (taskItem: TaskTargetAnalysis) => {
    setRequestModalTask(taskItem);
    setProposedStandard(
      taskItem.suggestedStandardMinutes ??
        taskItem.currentStandardMinutes ??
        taskItem.observedPaceMinutesPerUnit ??
        1.5
    );
    setChangeReason(
      taskItem.hasRecommendation
        ? `Observed team pace is ${taskItem.observedPaceMinutesPerUnit?.toFixed(
            2
          )}m across ${taskItem.sampleRunsCount} runs (${taskItem.variancePercent}% variance vs ${taskItem.currentStandardMinutes}m target). Aligning operational target.`
        : ''
    );
  };

  const handleSubmitTargetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestModalTask) return;
    setBusy(true);
    const res = await requestTargetChangeAction({
      taskTypeId: requestModalTask.taskTypeId,
      proposedStandardMinutes: Number(proposedStandard),
      reason: changeReason,
    });
    setBusy(false);
    if (res.ok) {
      setTargetFeedback(`✓ ${res.message ?? 'Target Change Request submitted.'}`);
      setRequestModalTask(null);
      router.refresh();
    } else {
      setTargetFeedback(res.error || 'Failed to submit target change.');
    }
  };

  // Baseline Sign-Off Modal (Admin)
  const handleOpenBaselineModal = (c: Client) => {
    setBaselineModalClient(c);
    setBaselineStatusChoice(c.baseline_status ?? 'bossing_it');
    setBaselineNotesInput(c.baseline_notes ?? '');
    setManagerDelegatedChoice(Boolean(c.manager_target_delegated));
  };

  const handleSaveBaselineSignOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!baselineModalClient) return;
    setBusy(true);
    const res = await signOffCustomerBaselineAction({
      clientId: baselineModalClient.id,
      status: baselineStatusChoice,
      notes: baselineNotesInput,
      managerDelegated: managerDelegatedChoice,
    });
    setBusy(false);
    if (res.ok) {
      setTargetFeedback(
        `✓ Customer baseline updated for ${baselineModalClient.name}: ${
          baselineStatusChoice === 'bossing_it' ? 'Bossing It (Established)' : 'Learning Phase'
        }.`
      );
      setBaselineModalClient(null);
      router.refresh();
    } else {
      setTargetFeedback(res.error || 'Failed to update customer baseline.');
    }
  };

  // Admin Review Pending Request
  const handleReviewRequest = async (
    requestId: string,
    action: 'approve' | 'reject',
    note?: string
  ) => {
    setBusy(true);
    const res = await reviewTargetChangeAction({
      requestId,
      action,
      reviewNote: note,
    });
    setBusy(false);
    if (res.ok) {
      setTargetFeedback(`✓ ${res.message}`);
      setRejectModalRequestId(null);
      setRejectNote('');
      router.refresh();
    } else {
      setTargetFeedback(res.error || 'Failed to review request.');
    }
  };

  // 1. Hours by Client / Task (includes both Actual Hours and Rounded Billing Hours)
  const clientTaskRows = useMemo(() => {
    const map = new Map<
      string,
      {
        clientCode: string;
        clientName: string;
        taskCode: string;
        taskName: string;
        unitLabel: string | null;
        roundingLabel: string;
        entryCount: number;
        totalMinutes: number;
        roundedMinutes: number;
        totalUnits: number;
      }
    >();

    for (const e of entries) {
      if (!e.ended_at) continue;
      const key = `${e.client_id}::${e.task_type_id}`;
      const mins = getDurationMinutes(e.started_at, e.ended_at);
      const { roundingMinutes, isTaskOverride } = resolveEffectiveRounding(
        e.task_rounding_minutes,
        e.client_rounding_minutes
      );
      const entryRoundedMins = e.billable ? roundDurationMinutes(mins, roundingMinutes) : mins;
      const ruleText =
        roundingMinutes === 0
          ? isTaskOverride
            ? 'Exact (Task)'
            : 'Exact'
          : isTaskOverride
          ? `Up ${roundingMinutes}m (Task)`
          : `Up ${roundingMinutes}m (Client)`;

      const curr = map.get(key) ?? {
        clientCode: e.client_code ?? '',
        clientName: e.client_name ?? '',
        taskCode: e.task_code ?? '',
        taskName: e.task_name ?? '',
        unitLabel: e.unit_label ?? null,
        roundingLabel: ruleText,
        entryCount: 0,
        totalMinutes: 0,
        roundedMinutes: 0,
        totalUnits: 0,
      };
      curr.entryCount += 1;
      curr.totalMinutes += mins;
      curr.roundedMinutes += entryRoundedMins;
      curr.totalUnits += e.units ?? 0;
      map.set(key, curr);
    }

    return Array.from(map.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
  }, [entries]);

  // 2. Hours by Operative
  const operativeRows = useMemo(() => {
    const map = new Map<
      string,
      {
        userId: string;
        userName: string;
        entryCount: number;
        billableMinutes: number;
        nonBillableMinutes: number;
        totalMinutes: number;
      }
    >();

    for (const e of entries) {
      if (!e.ended_at) continue;
      const mins = getDurationMinutes(e.started_at, e.ended_at);
      const curr = map.get(e.user_id) ?? {
        userId: e.user_id,
        userName: e.user_name ?? 'Operative',
        entryCount: 0,
        billableMinutes: 0,
        nonBillableMinutes: 0,
        totalMinutes: 0,
      };
      curr.entryCount += 1;
      curr.totalMinutes += mins;
      if (e.billable) curr.billableMinutes += mins;
      else curr.nonBillableMinutes += mins;
      map.set(e.user_id, curr);
    }

    return Array.from(map.values()).sort((a, b) => b.totalMinutes - a.totalMinutes);
  }, [entries]);

  // 3. League Table (Operative + Task: hours on task, units/hour, actual vs standard % where set)
  const leagueRows = useMemo(() => {
    const map = new Map<
      string,
      {
        userName: string;
        clientCode: string;
        taskName: string;
        unitLabel: string | null;
        standardMinutes: number | null;
        entryCount: number;
        totalMinutes: number;
        totalUnits: number;
      }
    >();

    for (const e of entries) {
      if (!e.ended_at) continue;
      const key = `${e.user_id}::${e.task_type_id}`;
      const mins = getDurationMinutes(e.started_at, e.ended_at);
      const curr = map.get(key) ?? {
        userName: e.user_name ?? 'Operative',
        clientCode: e.client_code ?? '',
        taskName: e.task_name ?? '',
        unitLabel: e.unit_label ?? null,
        standardMinutes: e.standard_minutes ?? null,
        entryCount: 0,
        totalMinutes: 0,
        totalUnits: 0,
      };
      curr.entryCount += 1;
      curr.totalMinutes += mins;
      curr.totalUnits += e.units ?? 0;
      map.set(key, curr);
    }

    return Array.from(map.values())
      .map((r) => {
        const hours = minutesToHours(r.totalMinutes);
        const rawHours = r.totalMinutes / 60;
        const unitsPerHour =
          r.unitLabel && r.totalUnits > 0 && r.totalMinutes >= 1
            ? Number((r.totalUnits / rawHours).toFixed(1))
            : null;
        const actualVsStandard =
          r.totalMinutes >= 1
            ? calculateActualVsStandardPercent({
                standardMinutes: r.standardMinutes,
                unitLabel: r.unitLabel,
                actualMinutes: r.totalMinutes,
                units: r.totalUnits,
                entryCount: r.entryCount,
              })
            : null;
        return {
          ...r,
          hours,
          unitsPerHour,
          actualVsStandard,
        };
      })
      .sort((a, b) => (b.actualVsStandard ?? 0) - (a.actualVsStandard ?? 0) || b.hours - a.hours);
  }, [entries]);

  const handleExportCsv = () => {
    let csv = '';
    if (tab === 'client_task') {
      csv = 'Client Code,Client Name,Task Code,Task Name,Entries,Units,Rounding Rule,Actual Hours,Rounded Billing Hours\n';
      for (const r of clientTaskRows) {
        csv += `"${r.clientCode}","${r.clientName}","${r.taskCode}","${r.taskName}",${r.entryCount},"${
          r.unitLabel ? `${r.totalUnits} ${r.unitLabel}` : ''
        }","${r.roundingLabel}",${formatHours(minutesToHours(r.totalMinutes))},${formatHours(
          minutesToHours(r.roundedMinutes)
        )}\n`;
      }
    } else if (tab === 'operative') {
      csv = 'Operative,Entries,Billable Hours,Non-Billable Hours,Total Hours\n';
      for (const r of operativeRows) {
        csv += `"${r.userName}",${r.entryCount},${formatHours(
          minutesToHours(r.billableMinutes)
        )},${formatHours(minutesToHours(r.nonBillableMinutes))},${formatHours(
          minutesToHours(r.totalMinutes)
        )}\n`;
      }
    } else {
      csv = 'Operative,Client,Task,Hours on Task,Units,Units/Hour,Actual vs Standard %\n';
      for (const r of leagueRows) {
        csv += `"${r.userName}","${r.clientCode}","${r.taskName}",${formatHours(r.hours)},"${
          r.unitLabel ? `${r.totalUnits} ${r.unitLabel}` : ''
        }","${r.unitsPerHour ?? ''}","${
          r.actualVsStandard !== null ? `${r.actualVsStandard}%` : ''
        }"\n`;
      }
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cloud9-report-${tab}-${start}-to-${end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveView = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newViewName.trim()) return;
    setBusy(true);
    await saveReportViewAction({
      name: newViewName.trim(),
      filterJson: {
        startDate: start,
        endDate: end,
        clientId: client,
        taskTypeId: task,
        userId: operative,
        tab,
      },
    });
    setNewViewName('');
    setBusy(false);
    router.refresh();
  };

  const handleDeleteView = async (viewId: string) => {
    setBusy(true);
    await deleteReportViewAction({ viewId });
    setBusy(false);
    router.refresh();
  };

  const handleTriggerSummaryEmail = async () => {
    setBusy(true);
    const res = await triggerDailySummaryEmailAction(end);
    setBusy(false);
    if (res.ok && res.summary) {
      setSummaryPreview(res.summary);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
            Productivity &amp; Client Analytics
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white mt-0.5">
            Operations Reports
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={handleTriggerSummaryEmail}
            className="btn-glove px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-2"
          >
            <Mail className="w-4 h-4 text-emerald-400" />
            Daily Summary Email
          </button>

          <Link
            href={`/reports/billing?start=${start}&end=${end}`}
            className="btn-glove px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            WMS Billing Export →
          </Link>

          <button
            type="button"
            onClick={handleExportCsv}
            className="btn-glove px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-2 shadow"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters & Saved Views Bar */}
      <div className="bg-slate-900 border border-slate-800 border-l-[3px] border-l-[#2DD4BF] rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
              To Date
            </label>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
              Client
            </label>
            <select
              value={client}
              onChange={(e) => setClient(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold"
            >
              <option value="all">All Clients</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
              Task Type
            </label>
            <select
              value={task}
              onChange={(e) => setTask(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold"
            >
              <option value="all">All Tasks</option>
              {taskTypes
                .filter((t) => client === 'all' || t.client_id === client)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} — {t.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
              Operative
            </label>
            <select
              value={operative}
              onChange={(e) => setOperative(e.target.value)}
              className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold"
            >
              <option value="all">All Operatives</option>
              {operatives.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.display_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => applyFilters()}
              className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-black"
            >
              Apply Filters
            </button>
          </div>
        </div>

        {/* Saved Views Strip */}
        <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Bookmark className="w-3.5 h-3.5 text-emerald-400" />
              Saved Views:
            </span>
            {savedViews.length === 0 && (
              <span className="text-xs text-slate-500">None saved yet</span>
            )}
            {savedViews.map((sv) => (
              <div
                key={sv.id}
                className="inline-flex items-center rounded-lg bg-slate-950 border border-slate-800 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => {
                    const f = sv.filter_json;
                    const nextStart = f.startDate || start;
                    const nextEnd = f.endDate || end;
                    const nextClient = f.clientId || 'all';
                    const nextTask = f.taskTypeId || 'all';
                    const nextOp = f.userId || 'all';
                    const nextTab = f.tab || 'client_task';
                    setStart(nextStart);
                    setEnd(nextEnd);
                    setClient(nextClient);
                    setTask(nextTask);
                    setOperative(nextOp);
                    setTab(nextTab);
                    applyFilters({
                      start: nextStart,
                      end: nextEnd,
                      client: nextClient,
                      task: nextTask,
                      operative: nextOp,
                      tab: nextTab,
                    });
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-slate-200 hover:text-emerald-400"
                >
                  {sv.name}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteView(sv.id)}
                  className="px-2 py-1.5 text-slate-500 hover:text-rose-400 border-l border-slate-800"
                  title="Delete saved view"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleSaveView} className="flex items-center gap-2">
            <input
              type="text"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              placeholder="Save current filter as..."
              className="h-9 px-3 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
            />
            <button
              type="submit"
              disabled={busy || !newViewName.trim()}
              className="h-9 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-emerald-400 border border-slate-700 inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Save View
            </button>
          </form>
        </div>
      </div>

      {/* Report View Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('client_task')}
          className={`btn-glove px-5 rounded-xl text-sm font-black flex items-center gap-2 border ${
            tab === 'client_task'
              ? 'bg-emerald-500 text-slate-950 border-emerald-400'
              : 'bg-slate-900 text-slate-300 border-slate-800'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          Hours by Client &amp; Task
        </button>

        <button
          type="button"
          onClick={() => setTab('operative')}
          className={`btn-glove px-5 rounded-xl text-sm font-black flex items-center gap-2 border ${
            tab === 'operative'
              ? 'bg-emerald-500 text-slate-950 border-emerald-400'
              : 'bg-slate-900 text-slate-300 border-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          Hours by Operative
        </button>

        <button
          type="button"
          onClick={() => setTab('league')}
          className={`btn-glove px-5 rounded-xl text-sm font-black flex items-center gap-2 border ${
            tab === 'league'
              ? 'bg-emerald-500 text-slate-950 border-emerald-400'
              : 'bg-slate-900 text-slate-300 border-slate-800'
          }`}
        >
          <Trophy className="w-4 h-4" />
          Productivity League Table
        </button>

        <button
          type="button"
          onClick={() => setTab('targets')}
          className={`btn-glove px-5 rounded-xl text-sm font-black flex items-center gap-2 border ${
            tab === 'targets'
              ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-lg shadow-emerald-500/20'
              : 'bg-slate-900 text-slate-300 border-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Target Intelligence &amp; Approvals
          {targetAnalysis.summary.varianceAlertsCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
              {targetAnalysis.summary.varianceAlertsCount} alerts
            </span>
          )}
          {targetAnalysis.summary.pendingApprovalsCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-black bg-sky-500 text-slate-950 animate-pulse">
              {targetAnalysis.summary.pendingApprovalsCount} pending
            </span>
          )}
        </button>
      </div>

      {/* Active Report Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        {tab === 'client_task' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[12px] font-bold uppercase tracking-[1px] text-[#E8E8E8]">
                  <th className="py-3.5 px-4">Client</th>
                  <th className="py-3.5 px-4">Task</th>
                  <th className="py-3.5 px-4">Entries</th>
                  <th className="py-3.5 px-4">Units</th>
                  <th className="py-3.5 px-4">Rounding Rule</th>
                  <th className="py-3.5 px-4 text-right">Actual Hours</th>
                  <th className="py-3.5 px-4 text-right text-emerald-400">
                    Rounded Billing Hours
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-[13px]">
                {clientTaskRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No completed entries match the selected filters.
                    </td>
                  </tr>
                ) : (
                  clientTaskRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40">
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded bg-[#10B981] text-slate-950 font-mono text-[10px] font-bold mr-2">
                          {row.clientCode}
                        </span>
                        <span className="font-bold text-white">{row.clientName}</span>
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-200">
                        {row.taskName}{' '}
                        <span className="text-xs font-mono text-slate-400">
                          ({row.taskCode})
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">{row.entryCount}</td>
                      <td className="py-3.5 px-4 text-slate-300">
                        {row.unitLabel && row.totalUnits > 0
                          ? `${row.totalUnits} ${row.unitLabel}`
                          : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-bold text-slate-300">
                        {row.roundingLabel}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-200">
                        {formatHours(minutesToHours(row.totalMinutes))}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-base font-black text-emerald-400">
                        {formatHours(minutesToHours(row.roundedMinutes))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'operative' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[12px] font-bold uppercase tracking-[1px] text-[#E8E8E8]">
                  <th className="py-3.5 px-4">Operative</th>
                  <th className="py-3.5 px-4">Entries</th>
                  <th className="py-3.5 px-4 text-right">Billable Hours</th>
                  <th className="py-3.5 px-4 text-right">Non-Billable Hours</th>
                  <th className="py-3.5 px-4 text-right">Total Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-[13px]">
                {operativeRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No completed entries match the selected filters.
                    </td>
                  </tr>
                ) : (
                  operativeRows.map((row) => (
                    <tr key={row.userId} className="hover:bg-slate-800/40">
                      <td className="py-3.5 px-4 font-bold text-white text-[15px]">
                        {row.userName}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">{row.entryCount}</td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-200">
                        {formatHours(minutesToHours(row.billableMinutes))}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-400">
                        {formatHours(minutesToHours(row.nonBillableMinutes))}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-base font-black text-emerald-400">
                        {formatHours(minutesToHours(row.totalMinutes))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'league' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-[12px] font-bold uppercase tracking-[1px] text-[#E8E8E8]">
                  <th className="py-3.5 px-4">Operative</th>
                  <th className="py-3.5 px-4">Client / Task</th>
                  <th className="py-3.5 px-4 text-right">Hours on Task</th>
                  <th className="py-3.5 px-4 text-right">Units Completed</th>
                  <th className="py-3.5 px-4 text-right">Units / Hour</th>
                  <th className="py-3.5 px-4 text-right">Actual vs Standard %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-[13px]">
                {leagueRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No completed entries match the selected filters.
                    </td>
                  </tr>
                ) : (
                  leagueRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/40">
                      <td className="py-3.5 px-4 font-bold text-white">
                        {row.userName}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded bg-[#10B981] text-slate-950 font-mono text-[10px] font-bold mr-2">
                          {row.clientCode}
                        </span>
                        <span className="font-semibold text-slate-200">{row.taskName}</span>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-white">
                        {formatHours(row.hours)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-300">
                        {row.unitLabel && row.totalUnits > 0
                          ? `${row.totalUnits} ${row.unitLabel}`
                          : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-200">
                        {row.unitsPerHour !== null
                          ? `${row.unitsPerHour} / hr`
                          : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {row.actualVsStandard !== null ? (
                          <span
                            className={`inline-block px-2.5 py-1 rounded-lg font-mono text-xs font-black ${
                              row.actualVsStandard >= 100
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                            }`}
                          >
                            {row.actualVsStandard}%
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs">No standard</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 4: TARGET INTELLIGENCE & TWO-POINT GOVERNANCE */}
        {tab === 'targets' && (
          <div className="p-6 space-y-6" data-testid="target-intelligence-view">
            {/* Live Target Feedback Alert */}
            {targetFeedback && (
              <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center justify-between gap-3 animate-in fade-in">
                <span>{targetFeedback}</span>
                <button
                  type="button"
                  onClick={() => setTargetFeedback(null)}
                  className="p-1 rounded-lg hover:bg-emerald-900/50 text-emerald-400"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Target Intelligence KPI Ribbon */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Variance Alerts */}
              <div className="bg-slate-950/60 border border-amber-500/30 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
                <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center justify-between">
                  <span>Variance Alerts (&gt;10%)</span>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-3xl font-black font-mono text-amber-300 my-1">
                  {targetAnalysis.summary.varianceAlertsCount}
                </div>
                <div className="text-xs text-slate-400">
                  Tasks outside ±10% target tolerance with baseline
                </div>
              </div>

              {/* Pending Two-Point Approvals */}
              <div className="bg-slate-950/60 border border-sky-500/30 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
                <div className="text-[11px] font-bold uppercase tracking-wider text-sky-400 flex items-center justify-between">
                  <span>Pending Approvals</span>
                  <Scale className="w-4 h-4 text-sky-400" />
                </div>
                <div className="text-3xl font-black font-mono text-sky-300 my-1">
                  {targetAnalysis.summary.pendingApprovalsCount}
                </div>
                <div className="text-xs text-slate-400">
                  Manager requests awaiting Admin two-point sign-off
                </div>
              </div>

              {/* Customer Baselines Established */}
              <div className="bg-slate-950/60 border border-emerald-500/30 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center justify-between">
                  <span>Baselines Established</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-3xl font-black font-mono text-emerald-300 my-1">
                  {targetAnalysis.summary.bossingItClientsCount}{' '}
                  <span className="text-sm font-sans font-normal text-slate-500">
                    / {clients.length} clients
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  Signed off as &ldquo;Bossing It&rdquo; by Admin
                </div>
              </div>

              {/* Monitored Tasks */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-lg">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                  <span>Monitored Tasks</span>
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-3xl font-black font-mono text-white my-1">
                  {targetAnalysis.summary.totalTasksAnalyzed}
                </div>
                <div className="text-xs text-slate-400">
                  Active catalogue tasks tracked against actual pace
                </div>
              </div>
            </div>

            {/* Customer Baseline Maturity & Delegation Strip */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-3xl p-5 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                      Customer Baseline Maturity Guardrail
                    </span>
                    <span className="text-slate-500">·</span>
                    <span className="text-xs text-slate-400 font-semibold">
                      Two-Point Governance
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white">
                    Ramp-Up Learning Phase vs. Established Baseline (&ldquo;Bossing It&rdquo;)
                  </h3>
                  <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
                    Early in customer onboarding, operatives and management dial in processes together. Target adjustment recommendations remain locked until the Admin signs off that we are &ldquo;bossing it&rdquo; for that customer, ensuring target changes are based on seasoned, dependable operational data.
                  </p>
                </div>
              </div>

              {/* Client Status Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                {clients.map((c) => {
                  const isBossingIt =
                    c.baseline_approved ||
                    c.baseline_status === 'bossing_it' ||
                    c.baseline_status === 'established';
                  return (
                    <div
                      key={c.id}
                      className={`p-4 rounded-2xl border transition ${
                        isBossingIt
                          ? 'bg-slate-900 border-emerald-500/30'
                          : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-black text-white text-sm">
                            {c.name}
                          </div>
                          <div className="text-xs font-mono text-slate-400">
                            Code: {c.code}
                          </div>
                        </div>
                        {isBossingIt ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <Trophy className="w-3 h-3 text-emerald-400" />
                            Bossing It
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Ramp-Up
                          </span>
                        )}
                      </div>

                      <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                        <span className="text-slate-400">
                          {c.manager_target_delegated ? (
                            <span className="text-sky-300 font-bold flex items-center gap-1">
                              <Unlock className="w-3 h-3" />
                              Manager Delegated
                            </span>
                          ) : (
                            <span className="text-slate-500 flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              Two-Point Approval
                            </span>
                          )}
                        </span>

                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleOpenBaselineModal(c)}
                            className="text-xs font-bold text-emerald-400 hover:text-emerald-300 hover:underline"
                          >
                            {isBossingIt ? 'Manage Governance' : 'Sign Off Baseline'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pending Two-Point Approvals Section */}
            {targetChangeRequests.some((r) => r.status === 'pending') && (
              <div className="bg-sky-950/30 border-2 border-sky-500/40 rounded-3xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="p-2 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30">
                    <Scale className="w-5 h-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      Two-Point Approval: Target Change Requests Awaiting Admin Sign-Off
                      <span className="px-2 py-0.5 rounded-full text-xs font-black bg-sky-500 text-slate-950">
                        {targetChangeRequests.filter((r) => r.status === 'pending').length} Pending
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Managers observed significant pace variance and submitted proposed targets with operational justifications. Admin sign-off applies changes instantly to warehouse timers.
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-slate-800/80 rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
                  {targetChangeRequests
                    .filter((r) => r.status === 'pending')
                    .map((req) => (
                      <div
                        key={req.id}
                        className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-800/30 transition"
                      >
                        <div className="space-y-1 max-w-2xl">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-black text-white text-sm">
                              {req.task_name}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-800 text-slate-300">
                              {req.task_code}
                            </span>
                            <span className="text-xs text-slate-500">
                              Client: {req.client_name} ({req.client_code})
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
                            <span className="text-slate-400">
                              Current: <strong className="text-white font-mono">{req.current_standard_minutes?.toFixed(2) ?? '—'}m</strong>
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400 font-bold">
                              Proposed: <strong className="font-mono text-sm">{req.proposed_standard_minutes.toFixed(2)}m</strong> ({(60 / req.proposed_standard_minutes).toFixed(1)}/hr)
                            </span>
                            {req.observed_pace && (
                              <span className="text-slate-400">
                                Observed Pace: <span className="font-mono text-slate-200">{req.observed_pace.toFixed(2)}m</span>
                              </span>
                            )}
                            {req.variance_percent !== null && (
                              <span
                                className={`px-2 py-0.5 rounded font-mono text-[10px] font-black ${
                                  req.variance_percent > 0
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-rose-500/20 text-rose-300'
                                }`}
                              >
                                {req.variance_percent > 0 ? '+' : ''}{req.variance_percent}% Variance
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 mt-2">
                            <span className="font-bold text-slate-400">Operational Reason: </span>
                            &ldquo;{req.reason}&rdquo;
                            <div className="text-[10px] text-slate-500 mt-1 font-mono">
                              Requested by {req.requester_name ?? 'Manager'} · Evidence: {req.sample_runs} runs, {req.sample_units} units, {req.operatives_count} operatives
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isAdmin ? (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => handleReviewRequest(req.id, 'approve')}
                                className="btn-glove px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
                              >
                                <Check className="w-4 h-4 stroke-[3]" />
                                Approve Target
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setRejectModalRequestId(req.id)}
                                className="btn-glove px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-rose-950 text-rose-300 border border-slate-700 hover:border-rose-500 text-xs font-bold"
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-bold">
                              <Clock className="w-3.5 h-3.5" />
                              Awaiting Admin Approval
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-950/60 border border-slate-800 p-4 rounded-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTargetFilter('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    targetFilter === 'all'
                      ? 'bg-emerald-500 text-slate-950 font-black'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  All Tasks ({targetAnalysis.tasks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTargetFilter('alerts')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    targetFilter === 'alerts'
                      ? 'bg-amber-500 text-slate-950 font-black'
                      : 'bg-slate-900 text-amber-300 hover:bg-slate-800 border border-amber-500/30'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Variance Alerts &gt;10% ({targetAnalysis.summary.varianceAlertsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setTargetFilter('on_target')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    targetFilter === 'on_target'
                      ? 'bg-emerald-500 text-slate-950 font-black'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  On Target (±10%)
                </button>
                <button
                  type="button"
                  onClick={() => setTargetFilter('baseline')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    targetFilter === 'baseline'
                      ? 'bg-sky-500 text-slate-950 font-black'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  Collecting Baseline
                </button>
              </div>

              {/* Client Selector Filter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 uppercase font-bold">Client:</span>
                <select
                  value={targetClientFilter}
                  onChange={(e) => setTargetClientFilter(e.target.value)}
                  className="h-9 px-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-bold"
                >
                  <option value="all">All Clients</option>
                  <option value="standard">Standard Warehouse Tasks</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Task Recommendation Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredTargetTasks.length === 0 ? (
                <div className="col-span-full py-12 text-center text-slate-400 space-y-2 bg-slate-950/40 rounded-2xl border border-slate-800">
                  <Info className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className="font-bold text-white text-sm">No tasks match this filter criteria.</p>
                  <p className="text-xs text-slate-500">Try selecting &ldquo;All Tasks&rdquo; or changing the client filter above.</p>
                </div>
              ) : (
                filteredTargetTasks.map((t) => (
                  <div
                    key={t.taskTypeId}
                    className={`p-5 rounded-3xl border transition flex flex-col justify-between gap-4 ${
                      t.hasRecommendation
                        ? t.direction === 'quicker'
                          ? 'bg-slate-900/90 border-emerald-500/50 shadow-lg shadow-emerald-500/5'
                          : 'bg-slate-900/90 border-amber-500/50 shadow-lg shadow-amber-500/5'
                        : 'bg-slate-900/50 border-slate-800'
                    }`}
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                              {t.category}
                            </span>
                            <span className="text-xs font-mono text-emerald-400 font-bold">
                              {t.clientCode}
                            </span>
                          </div>
                          <h4 className="font-black text-white text-base mt-1">
                            {t.taskName}
                          </h4>
                          <span className="font-mono text-xs text-slate-400">
                            {t.taskCode}
                          </span>
                        </div>

                        {/* Variance Badge */}
                        <div>
                          {t.variancePercent !== null ? (
                            <span
                              className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-black border ${
                                t.direction === 'quicker'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : t.direction === 'slower'
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                  : 'bg-slate-800 text-slate-300 border-slate-700'
                              }`}
                            >
                              {t.direction === 'quicker' ? (
                                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                              ) : t.direction === 'slower' ? (
                                <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                              ) : null}
                              {t.variancePercent > 0 ? `+${t.variancePercent}% Quicker` : `${t.variancePercent}% Slower`}
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-500">
                              No Runs Yet
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Target vs Observed Metric Tiles */}
                      <div className="grid grid-cols-2 gap-3 my-3">
                        <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
                          <div className="text-[10px] font-bold uppercase text-slate-400">
                            Recommended Target Set
                          </div>
                          <div className="text-lg font-black font-mono text-white mt-0.5">
                            {t.currentStandardMinutes !== null ? `${t.currentStandardMinutes.toFixed(2)}m` : '—'}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">
                            {t.currentTargetUnitsPerHour !== null ? `${t.currentTargetUnitsPerHour} / hr` : 'No set target'}
                          </div>
                        </div>

                        <div className="bg-slate-950/70 p-3 rounded-2xl border border-slate-800">
                          <div className="text-[10px] font-bold uppercase text-slate-400">
                            Observed Operative Pace
                          </div>
                          <div className="text-lg font-black font-mono text-emerald-400 mt-0.5">
                            {t.observedPaceMinutesPerUnit !== null ? `${t.observedPaceMinutesPerUnit.toFixed(2)}m` : '—'}
                          </div>
                          <div className="text-[11px] text-emerald-300/80 font-mono">
                            {t.observedUnitsPerHour !== null ? `${t.observedUnitsPerHour} / hr` : 'Gathering data'}
                          </div>
                        </div>
                      </div>

                      {/* Baseline Evidence & Data Meter */}
                      <div className="p-3 rounded-2xl bg-slate-950/40 border border-slate-800/80 text-xs space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-slate-400 uppercase tracking-wider">
                            Statistical Baseline
                          </span>
                          <span
                            className={`font-black font-mono ${
                              t.isBaselineEstablished ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {t.isBaselineEstablished ? '✓ Strong Baseline' : `${t.baselineRunsProgress}/${t.baselineRunsTarget} Runs`}
                          </span>
                        </div>

                        <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              t.isBaselineEstablished ? 'bg-emerald-500' : 'bg-amber-400'
                            }`}
                            style={{
                              width: `${Math.min(100, Math.round((t.sampleRunsCount / t.baselineRunsTarget) * 100))}%`,
                            }}
                          />
                        </div>

                        <p className="text-[11px] text-slate-400 leading-relaxed pt-0.5">
                          {t.baselineReadinessReason}
                        </p>
                      </div>

                      {/* Engine Suggestion Box */}
                      {t.hasRecommendation && (
                        <div
                          className={`mt-3 p-3.5 rounded-2xl border text-xs space-y-1 ${
                            t.direction === 'quicker'
                              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                              : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                          }`}
                        >
                          <div className="font-black flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-current" />
                            {t.recommendationTitle}
                          </div>
                          <p className="text-[11px] text-slate-300 leading-relaxed">
                            {t.recommendationDescription}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Card Actions */}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      <div className="text-[11px] text-slate-500 font-mono">
                        {t.sampleUnitsCount} {t.unitLabel ?? 'units'} across {t.distinctOperativesCount} operatives
                      </div>

                      <div>
                        {t.pendingRequest ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-bold">
                            <Clock className="w-3.5 h-3.5" />
                            Pending Sign-Off ({t.pendingRequest.proposed_standard_minutes}m)
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenRequestModal(t)}
                            className={`btn-glove px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                              t.hasRecommendation
                                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black shadow-md shadow-emerald-500/20'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                            }`}
                          >
                            <Scale className="w-3.5 h-3.5" />
                            {t.hasRecommendation
                              ? 'Propose Target Adjustment'
                              : 'Request Target Change'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Daily Summary Email Modal Preview */}
      {summaryPreview && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold uppercase text-emerald-400">
                  Daily Summary Email ({summaryPreview.sentViaResend ? 'Sent via Resend' : 'HTML Preview'})
                </div>
                <h3 className="text-lg font-black text-white">{summaryPreview.subject}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSummaryPreview(null)}
                className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto rounded-xl border border-slate-700 bg-white">
              <div dangerouslySetInnerHTML={{ __html: summaryPreview.html }} />
            </div>
          </div>
        </div>
      )}

      {/* Target Change Request Modal (Two-Point Proposal) */}
      {requestModalTask && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          data-testid="target-change-modal"
        >
          <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Two-Point Governance
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {requestModalTask.taskCode}
                  </span>
                </div>
                <h3 className="text-xl font-black text-white">
                  Propose Target Adjustment
                </h3>
                <p className="text-xs text-slate-400">
                  {requestModalTask.taskName} &bull; {requestModalTask.clientName} ({requestModalTask.clientCode})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRequestModalTask(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current vs Observed Pace Comparison */}
            <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-950/70 border border-slate-800">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Current Target
                </span>
                <span className="text-lg font-black font-mono text-white">
                  {requestModalTask.currentStandardMinutes !== null
                    ? `${requestModalTask.currentStandardMinutes.toFixed(2)}m`
                    : 'None'}
                </span>
                <span className="text-xs text-slate-400 block font-mono">
                  {requestModalTask.currentTargetUnitsPerHour !== null
                    ? `${requestModalTask.currentTargetUnitsPerHour} / hr`
                    : 'No pace'}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Observed Operative Pace
                </span>
                <span className="text-lg font-black font-mono text-emerald-400">
                  {requestModalTask.observedPaceMinutesPerUnit !== null
                    ? `${requestModalTask.observedPaceMinutesPerUnit.toFixed(2)}m`
                    : 'None'}
                </span>
                <span className="text-xs text-emerald-300/80 block font-mono">
                  {requestModalTask.observedUnitsPerHour !== null
                    ? `${requestModalTask.observedUnitsPerHour} / hr`
                    : 'No pace'}{' '}
                  ({requestModalTask.sampleRunsCount} runs)
                </span>
              </div>
            </div>

            <form onSubmit={handleSubmitTargetRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Proposed Target Standard (Minutes per {requestModalTask.unitLabel ?? 'Unit'})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={proposedStandard}
                    onChange={(e) => setProposedStandard(parseFloat(e.target.value) || 0)}
                    className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-lg font-bold focus:border-emerald-400 focus:outline-none"
                  />
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                    {proposedStandard > 0
                      ? `~${(60 / proposedStandard).toFixed(1)} units/hr`
                      : ''}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Operational Justification &amp; Evidence *
                </label>
                <textarea
                  rows={3}
                  required
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="Detail operational observations, packing changes, tooling adjustments, or learned efficiencies..."
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:border-emerald-400 focus:outline-none"
                />
              </div>

              <div className="p-3 rounded-xl bg-sky-950/30 border border-sky-500/30 text-xs text-sky-200 flex items-start gap-2">
                <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <span>
                  This proposal follows <strong>Two-Point Approval</strong>. Once submitted, it will be placed in the Admin review queue with your operational evidence and variance metrics.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRequestModalTask(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || proposedStandard <= 0 || !changeReason.trim()}
                  className="btn-glove px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  <Scale className="w-4 h-4" />
                  {busy ? 'Submitting...' : 'Submit Target Proposal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Baseline Maturity Sign-Off Modal (Admin) */}
      {baselineModalClient && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          data-testid="customer-baseline-modal"
        >
          <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Admin Sign-Off
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    Code: {baselineModalClient.code}
                  </span>
                </div>
                <h3 className="text-xl font-black text-white">
                  Customer Baseline Maturity Governance
                </h3>
                <p className="text-xs text-slate-400">
                  {baselineModalClient.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBaselineModalClient(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBaselineSignOff} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Maturity Phase Status
                </label>
                <select
                  value={baselineStatusChoice}
                  onChange={(e) =>
                    setBaselineStatusChoice(
                      e.target.value as 'bossing_it' | 'established' | 'learning'
                    )
                  }
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-bold focus:border-emerald-400 focus:outline-none"
                >
                  <option value="bossing_it">
                    &ldquo;Bossing It&rdquo; (Established Baseline &mdash; Recommendations Unlocked)
                  </option>
                  <option value="learning">
                    Learning Phase (Ramp-Up / Dialing In &mdash; Recommendations Guarded)
                  </option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  Marking as &ldquo;Bossing It&rdquo; confirms the team and customer have stabilized workflows and packaging. Target adjustment suggestions will unlock once sample data is statistically sufficient.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Operational Sign-Off Notes
                </label>
                <textarea
                  rows={3}
                  value={baselineNotesInput}
                  onChange={(e) => setBaselineNotesInput(e.target.value)}
                  placeholder="Notes on customer setup, packaging consistency, barcode scans, or training notes..."
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:border-emerald-400 focus:outline-none"
                />
              </div>

              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={managerDelegatedChoice}
                    onChange={(e) => setManagerDelegatedChoice(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-500 bg-slate-900 border-slate-700 focus:ring-emerald-400"
                  />
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Unlock className="w-3.5 h-3.5 text-sky-400" />
                    Delegate Target Authority to Managers
                  </span>
                </label>
                <p className="text-[11px] text-slate-400 pl-7 leading-relaxed">
                  When enabled, managers can directly update task targets for this client without requiring separate Admin two-point sign-off.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setBaselineModalClient(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="btn-glove px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {busy ? 'Saving...' : 'Save Baseline Governance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Request Note Modal (Admin) */}
      {rejectModalRequestId && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          data-testid="reject-request-modal"
        >
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-white">
                  Reject Target Change Request
                </h3>
                <p className="text-xs text-slate-400">
                  Provide operational feedback explaining why this target change is declined.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRejectModalRequestId(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Review Feedback / Note
                </label>
                <textarea
                  rows={3}
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  placeholder="e.g. Run variance caused by barcode scanner glitch; continue observing for 5 more shifts..."
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:border-rose-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectModalRequestId(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    handleReviewRequest(rejectModalRequestId, 'reject', rejectNote)
                  }
                  className="btn-glove px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-lg shadow-rose-600/20 disabled:opacity-50"
                >
                  {busy ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
