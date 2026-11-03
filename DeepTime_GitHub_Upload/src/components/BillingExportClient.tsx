'use client';

import {
  bulkReviewBillingEntriesAction,
  reviewBillingEntryAction,
} from '@/app/actions';
import {
  calculateBillingMetricsForEntries,
  calculateClientBillingSummaries,
  ClientBillingSummary,
  ClientTaskBillingSummary,
  formatHours,
  formatMinutesReadable,
  formatLondonTime,
  getBillingWeekRange,
  getDurationMinutes,
  resolveEffectiveRounding,
} from '@/lib/calculations';
import {
  generateMultiSectionBillingCsv,
  generateMultiTabExcelWorkbook,
} from '@/lib/billingSpreadsheets';
import {
  BillingStatus,
  getBillingStatusConfig,
  resolveBillingStatus,
} from '@/lib/billingStatus';
import { TimeEntry, UserPublic } from '@/lib/types';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileSpreadsheet,
  HelpCircle,
  Info,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useMemo, useState } from 'react';

interface BillingExportClientProps {
  startDate: string;
  endDate: string;
  entries: TimeEntry[];
  currentUser?: UserPublic;
}

type BillingTab = 'client_summary' | 'summary' | 'unbilled_audit' | 'anomalies' | 'all_entries';

export function BillingExportClient({
  startDate,
  endDate,
  entries,
  currentUser,
}: BillingExportClientProps) {
  const router = useRouter();
  const [start, setStart] = useState(startDate);
  const [end, setEnd] = useState(endDate);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<BillingTab>('client_summary');
  const [searchQuery, setSearchQuery] = useState('');
  const [ledgerAuditFilter, setLedgerAuditFilter] = useState<
    'all' | 'high_rounding' | 'missing_po' | 'manual_source'
  >('all');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Modal state for K to dispute or add notes when flipping/querying an entry
  const [queryModalEntry, setQueryModalEntry] = useState<TimeEntry | null>(null);
  const [queryNote, setQueryNote] = useState('');

  // Track collapsed clients in Client Summary tab (default all expanded for immediate review)
  const [collapsedClientIds, setCollapsedClientIds] = useState<Record<string, boolean>>({});

  const isClientExpanded = (clientId: string) => !collapsedClientIds[clientId];

  const toggleClientExpand = (clientId: string) => {
    setCollapsedClientIds((prev) => ({
      ...prev,
      [clientId]: !prev[clientId],
    }));
  };

  const handleExpandAll = () => {
    setCollapsedClientIds({});
  };

  const handleCollapseAll = () => {
    const allCollapsed: Record<string, boolean> = {};
    for (const c of clientSummaries) {
      allCollapsed[c.clientId] = true;
    }
    setCollapsedClientIds(allCollapsed);
  };

  // 1. Separate billable completed entries vs unbilled "Our Cost" entries
  const { billableEntries, unbilledEntries, autoBilledEntries, pendingEntries } = useMemo(() => {
    const billable: TimeEntry[] = [];
    const unbilled: TimeEntry[] = [];
    const autoBilled: TimeEntry[] = [];
    const pending: TimeEntry[] = [];

    for (const e of entries) {
      if (!e.ended_at) continue;
      const status = resolveBillingStatus({
        billingStatus: e.billing_status,
        billable: e.billable,
        category: undefined,
        taskCode: e.task_code,
        taskName: e.task_name,
      });

      if (status === 'our_cost') {
        unbilled.push(e);
      } else {
        billable.push(e);
        if (status === 'automatically_billed') {
          autoBilled.push(e);
        }
      }

      if (!e.billing_review_status || e.billing_review_status === 'pending') {
        pending.push(e);
      }
    }

    return { billableEntries: billable, unbilledEntries: unbilled, autoBilledEntries: autoBilled, pendingEntries: pending };
  }, [entries]);

  // 2. Group billable entries by Client + Task and apply ROUND UP per entry
  const billingRows = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        clientId: string;
        taskTypeId: string;
        clientName: string;
        clientCode: string;
        clientRoundingMinutes: number;
        taskName: string;
        taskCode: string;
        taskRoundingMinutes: number | null | undefined;
        entryCount: number;
        entries: TimeEntry[];
      }
    >();

    for (const e of billableEntries) {
      const key = `${e.client_id}::${e.task_type_id}`;
      const existing = groups.get(key) ?? {
        key,
        clientId: e.client_id,
        taskTypeId: e.task_type_id,
        clientName: e.client_name ?? '',
        clientCode: e.client_code ?? '',
        clientRoundingMinutes: e.client_rounding_minutes ?? 0,
        taskName: e.task_name ?? '',
        taskCode: e.task_code ?? '',
        taskRoundingMinutes: e.task_rounding_minutes,
        entryCount: 0,
        entries: [],
      };
      existing.entryCount += 1;
      existing.entries.push(e);
      groups.set(key, existing);
    }

    return Array.from(groups.values())
      .map((g) => {
        const { roundingMinutes, isTaskOverride } = resolveEffectiveRounding(
          g.taskRoundingMinutes,
          g.clientRoundingMinutes
        );
        const metrics = calculateBillingMetricsForEntries(
          g.entries.map((e) => ({
            started_at: e.started_at,
            ended_at: e.ended_at,
            task_rounding_minutes: e.task_rounding_minutes,
            client_rounding_minutes: e.client_rounding_minutes ?? 0,
          })),
          roundingMinutes
        );

        const ruleLabel =
          roundingMinutes === 0
            ? isTaskOverride
              ? 'Exact (Task Override)'
              : 'Exact (No Rounding)'
            : isTaskOverride
            ? `Round UP ${roundingMinutes}m (Task Override)`
            : `Round UP ${roundingMinutes}m (Customer Rule)`;

        // Agreement status for this group: all agreed, all disputed, or pending review
        const agreedCount = g.entries.filter((e) => e.billing_review_status === 'agreed').length;
        const disputedCount = g.entries.filter((e) => e.billing_review_status === 'disputed').length;
        const isAllAgreed = agreedCount === g.entries.length;
        const isPartiallyAgreed = agreedCount > 0 && !isAllAgreed;
        const hasDisputes = disputedCount > 0;

        return {
          key: g.key,
          clientId: g.clientId,
          taskTypeId: g.taskTypeId,
          clientDisplay: `${g.clientName} (${g.clientCode})`,
          taskDisplay: `${g.taskName} (${g.taskCode})`,
          entryCount: g.entryCount,
          entries: g.entries,
          roundingMinutes,
          isTaskOverride,
          ruleLabel,
          actualMinutes: metrics.actualMinutes,
          actualHours: metrics.actualHours,
          actualHoursFormatted: formatHours(metrics.actualHours),
          roundedMinutes: metrics.roundedMinutes,
          roundedHours: metrics.roundedHours,
          roundedHoursFormatted: formatHours(metrics.roundedHours),
          upliftHours: Math.max(0, metrics.roundedHours - metrics.actualHours),
          isAllAgreed,
          isPartiallyAgreed,
          hasDisputes,
          agreedCount,
        };
      })
      .sort(
        (a, b) =>
          a.clientDisplay.localeCompare(b.clientDisplay) ||
          a.taskDisplay.localeCompare(b.taskDisplay)
      );
  }, [billableEntries]);

  // 3. Totals for Billed and Unbilled
  const totals = useMemo(() => {
    const actualMins = billingRows.reduce((acc, r) => acc + r.actualMinutes, 0);
    const roundedMins = billingRows.reduce((acc, r) => acc + r.roundedMinutes, 0);
    const actualHrs = Number((actualMins / 60).toFixed(2));
    const roundedHrs = Number((roundedMins / 60).toFixed(2));

    const unbilledMins = unbilledEntries.reduce((acc, e) => {
      return acc + (e.ended_at ? getDurationMinutes(e.started_at, e.ended_at) : 0);
    }, 0);
    const unbilledHrs = Number((unbilledMins / 60).toFixed(2));

    const agreedGroupsCount = billingRows.filter((r) => r.isAllAgreed).length;
    const reviewReadinessPct =
      billingRows.length > 0
        ? Math.round((agreedGroupsCount / billingRows.length) * 100)
        : 100;

    return {
      actualMins,
      roundedMins,
      actualHrsFormatted: formatHours(actualHrs),
      roundedHrsFormatted: formatHours(roundedHrs),
      upliftHrsFormatted: formatHours(Math.max(0, roundedHrs - actualHrs)),
      unbilledMins,
      unbilledHrsFormatted: formatHours(unbilledHrs),
      unbilledCount: unbilledEntries.length,
      agreedGroupsCount,
      totalGroups: billingRows.length,
      reviewReadinessPct,
    };
  }, [billingRows, unbilledEntries]);

  // 4. Intelligent Flags / Pre-Flight Audit Checks for K
  const anomalyFlags = useMemo(() => {
    const list: Array<{
      id: string;
      level: 'warning' | 'info' | 'critical';
      title: string;
      description: string;
      affectedCount: number;
      sampleEntries: TimeEntry[];
    }> = [];

    // Flag A: Unbilled tasks on active commercial clients (Absorbed Our Cost)
    if (unbilledEntries.length > 0) {
      list.push({
        id: 'unbilled_commercial',
        level: 'critical',
        title: `${unbilledEntries.length} Tasks Unbilled ("Our Cost")`,
        description:
          'Cloud9 is absorbing labor expense for these items. Every unbilled job requires a mandatory justification.',
        affectedCount: unbilledEntries.length,
        sampleEntries: unbilledEntries.slice(0, 5),
      });
    }

    // Flag B: High Rounding Uplift (>100% inflation)
    const highUpliftRows = billingRows.filter(
      (r) => r.roundedMinutes >= 15 && r.actualMinutes <= 7.5
    );
    if (highUpliftRows.length > 0) {
      const affected = highUpliftRows.flatMap((r) => r.entries);
      list.push({
        id: 'high_rounding',
        level: 'warning',
        title: 'High Rounding Uplift (>100% Increase)',
        description: `${highUpliftRows.length} task groups have rounded billing over double the actual work time. Verify client minimum contract.`,
        affectedCount: affected.length,
        sampleEntries: affected.slice(0, 4),
      });
    }

    // Flag C: Custom / Bespoke tasks missing Order / PO Reference
    const missingRefEntries = billableEntries.filter(
      (e) => !e.order_ref && !e.task_code?.includes('STD-')
    );
    if (missingRefEntries.length > 0) {
      list.push({
        id: 'missing_po',
        level: 'warning',
        title: `${missingRefEntries.length} Custom Jobs Missing Order / PO Ref`,
        description:
          'Client accounts often query custom invoice lines without an order or batch reference.',
        affectedCount: missingRefEntries.length,
        sampleEntries: missingRefEntries.slice(0, 5),
      });
    }

    // Flag D: Manual time entries created by supervisor
    const manualEntries = entries.filter((e) => e.source === 'manual');
    if (manualEntries.length > 0) {
      list.push({
        id: 'manual_source',
        level: 'info',
        title: `${manualEntries.length} Manually Entered Records`,
        description:
          'These records were manually entered rather than live timed on the floor.',
        affectedCount: manualEntries.length,
        sampleEntries: manualEntries.slice(0, 4),
      });
    }

    return list;
  }, [unbilledEntries, billingRows, billableEntries, entries]);

  // 5. Filtered entries for granular ledger search
  const filteredEntries = useMemo(() => {
    let list = entries;
    if (ledgerAuditFilter === 'high_rounding') {
      const highUpliftIds = new Set(
        billingRows
          .filter((r) => r.roundedMinutes >= 15 && r.actualMinutes <= 7.5)
          .flatMap((r) => r.entries.map((e) => e.id))
      );
      list = list.filter((e) => highUpliftIds.has(e.id));
    } else if (ledgerAuditFilter === 'missing_po') {
      list = list.filter(
        (e) =>
          e.ended_at &&
          e.billing_status !== 'our_cost' &&
          !e.order_ref &&
          !e.task_code?.includes('STD-')
      );
    } else if (ledgerAuditFilter === 'manual_source') {
      list = list.filter((e) => e.source === 'manual');
    }

    const q = searchQuery.toLowerCase().trim();
    if (!q) return list;
    return list.filter(
      (e) =>
        e.task_name?.toLowerCase().includes(q) ||
        e.task_code?.toLowerCase().includes(q) ||
        e.client_name?.toLowerCase().includes(q) ||
        e.client_code?.toLowerCase().includes(q) ||
        e.user_name?.toLowerCase().includes(q) ||
        e.order_ref?.toLowerCase().includes(q) ||
        e.unbilled_reason?.toLowerCase().includes(q)
    );
  }, [entries, searchQuery, ledgerAuditFilter, billingRows]);

  // Quick Action: K One-Click "Agree All Auto-Billed"
  const handleQuickAgreeAutoBilled = async () => {
    if (autoBilledEntries.length === 0) return;
    setBusy(true);
    setFeedback(null);
    const unapprovedIds = autoBilledEntries
      .filter((e) => e.billing_review_status !== 'agreed')
      .map((e) => e.id);

    if (unapprovedIds.length === 0) {
      setFeedback('All automated tasks are already marked as Agreed.');
      setBusy(false);
      return;
    }

    const res = await bulkReviewBillingEntriesAction({
      entryIds: unapprovedIds,
      reviewStatus: 'agreed',
    });
    setBusy(false);

    if (res.ok) {
      setFeedback(
        `✓ Intelligent Quick-Agree: Approved ${res.count ?? unapprovedIds.length} standard picking/packing entries.`
      );
      router.refresh();
    } else {
      setFeedback(res.error || 'Could not bulk approve tasks.');
    }
  };

  // K Quick Action: Agree entire Task Group
  const handleAgreeGroup = async (groupEntries: TimeEntry[]) => {
    setBusy(true);
    const ids = groupEntries.map((e) => e.id);
    const res = await bulkReviewBillingEntriesAction({
      entryIds: ids,
      reviewStatus: 'agreed',
    });
    setBusy(false);
    if (res.ok) {
      setFeedback(`✓ Agreed ${groupEntries.length} entries for this task group.`);
      router.refresh();
    } else {
      setFeedback(res.error || 'Could not approve entries.');
    }
  };

  // K Action: Agree single unbilled entry as Our Cost
  const handleAgreeUnbilledEntry = async (entry: TimeEntry) => {
    setBusy(true);
    const res = await reviewBillingEntryAction({
      entryId: entry.id,
      reviewStatus: 'agreed',
      billingStatus: 'our_cost',
      reviewNote: 'Confirmed as internal warehouse expense (Our Cost) by Finance/K.',
    });
    setBusy(false);
    if (res.ok) {
      setFeedback(`✓ Confirmed Our Cost absorption for "${entry.task_name}".`);
      router.refresh();
    } else {
      setFeedback(res.error || 'Failed to update review status.');
    }
  };

  // K Action: Disagree with Unbilled -> FLIP TO BILLABLE (Moves to Client Invoice Extract)
  const handleFlipToBillable = async (entry: TimeEntry) => {
    setBusy(true);
    const res = await reviewBillingEntryAction({
      entryId: entry.id,
      reviewStatus: 'disputed',
      billingStatus: 'needs_billed',
      reviewNote: 'Reclassified to Billable by Finance/K (Disagreed with internal cost absorption).',
    });
    setBusy(false);
    if (res.ok) {
      setFeedback(
        `✓ Flipped "${entry.task_name}" to Billable! This job is now included in the Client Billing Extract.`
      );
      router.refresh();
    } else {
      setFeedback(res.error || 'Failed to flip entry to billable.');
    }
  };

  // Client-Level Summaries and Round-Up Reconciliation for Kay
  const clientSummaries = useMemo(() => {
    return calculateClientBillingSummaries(billableEntries);
  }, [billableEntries]);

  // Aggregated totals across all clients
  const clientTotals = useMemo(() => {
    let actualMins = 0;
    let actualHrs = 0;
    let roundedMins = 0;
    let roundedHrs = 0;
    let roundUpMins = 0;
    let roundUpHrs = 0;
    let totalEntriesCount = 0;
    let allBalanced = true;

    for (const c of clientSummaries) {
      actualMins += c.totalActualMinutes;
      actualHrs += c.totalActualHours;
      roundedMins += c.totalRoundedMinutes;
      roundedHrs += c.totalRoundedHours;
      roundUpMins += c.totalRoundUpAddedMinutes;
      roundUpHrs += c.totalRoundUpAddedHours;
      totalEntriesCount += c.totalEntries;
      if (!c.isReconciled) allBalanced = false;
    }

    const totalUpliftPct =
      actualMins > 0 ? Number(((roundUpMins / actualMins) * 100).toFixed(1)) : 0;

    return {
      actualMins,
      actualHrs: Number(actualHrs.toFixed(2)),
      actualHrsFormatted: formatHours(actualHrs),
      roundedMins,
      roundedHrs: Number(roundedHrs.toFixed(2)),
      roundedHrsFormatted: formatHours(roundedHrs),
      roundUpMins,
      roundUpHrs: Number(roundUpHrs.toFixed(2)),
      roundUpHrsFormatted: formatHours(roundUpHrs),
      totalUpliftPct,
      totalEntriesCount,
      allBalanced,
    };
  }, [clientSummaries]);

  // Agree all entries for an entire client
  const handleAgreeClient = async (client: ClientBillingSummary) => {
    setBusy(true);
    const clientEntryIds = billableEntries
      .filter((e) => e.client_id === client.clientId)
      .map((e) => e.id);
    const res = await bulkReviewBillingEntriesAction({
      entryIds: clientEntryIds,
      reviewStatus: 'agreed',
    });
    setBusy(false);
    if (res.ok) {
      setFeedback(`✓ Agreed all ${clientEntryIds.length} entries for ${client.clientName}.`);
      router.refresh();
    } else {
      setFeedback(res.error || 'Could not approve client entries.');
    }
  };

  // Week Switcher Helpers
  const currentWeekInfo = useMemo(() => {
    try {
      const d = new Date(start + 'T00:00:00Z');
      return getBillingWeekRange(d, 0);
    } catch {
      return getBillingWeekRange(new Date(), 0);
    }
  }, [start]);

  const handleShiftWeek = (direction: -1 | 1) => {
    try {
      const d = new Date(start + 'T00:00:00Z');
      d.setDate(d.getDate() + direction * 7);
      const range = getBillingWeekRange(d, 0);
      setStart(range.startDate);
      setEnd(range.endDate);
      router.push(`/reports/billing?start=${range.startDate}&end=${range.endDate}`);
    } catch {
      const range = getBillingWeekRange(new Date(), direction);
      setStart(range.startDate);
      setEnd(range.endDate);
      router.push(`/reports/billing?start=${range.startDate}&end=${range.endDate}`);
    }
  };

  const handleSelectPresetWeek = (preset: 'this' | 'last') => {
    const range = getBillingWeekRange(new Date(), preset === 'this' ? 0 : -1);
    setStart(range.startDate);
    setEnd(range.endDate);
    router.push(`/reports/billing?start=${range.startDate}&end=${range.endDate}`);
  };

  const handleApplyRange = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/reports/billing?start=${start}&end=${end}`);
  };

  const handleCopyClipboard = async () => {
    const lines = [
      'Client\tTask\tRounding Rule\tActual Time (Mins)\tActual Hours\tRounded Time (Mins)\tRounded Billable Hours\tK Review Status',
      ...billingRows.map(
        (r) =>
          `${r.clientDisplay}\t${r.taskDisplay}\t${r.ruleLabel}\t${Math.round(
            r.actualMinutes
          )}\t${r.actualHoursFormatted}\t${Math.round(r.roundedMinutes)}\t${
            r.roundedHoursFormatted
          }\t${r.isAllAgreed ? 'Agreed' : 'Pending Review'}`
      ),
    ];
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Multi-Tab Excel Workbook Download (.xls with 4 native worksheet tabs)
  const handleDownloadMultiTabExcel = () => {
    const xml = generateMultiTabExcelWorkbook({
      startDate: start,
      endDate: end,
      clientSummaries,
      billableEntries,
      unbilledEntries,
    });
    const blob = new Blob([xml], {
      type: 'application/vnd.ms-excel;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cloud9-billing-extract-${start}-to-${end}.xls`;
    link.click();
    URL.revokeObjectURL(url);
    setFeedback('✓ Downloaded Multi-Tab Excel Workbook (.xls) with 4 sheets for Kay.');
  };

  // Multi-Section Billing CSV Download with Client Summary reconciliation
  const handleDownloadMultiSectionCsv = () => {
    const csv = generateMultiSectionBillingCsv({
      startDate: start,
      endDate: end,
      clientSummaries,
      billableEntries,
      unbilledEntries,
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cloud9-billing-summary-${start}-to-${end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setFeedback('✓ Downloaded Summary CSV with Client Reconciliation.');
  };

  // Copy Client Reconciliation Summary to clipboard
  const handleCopyClientSummary = async () => {
    const lines = [
      'Client Code\tClient Name\tContract Rounding\tActual Time (Mins)\tActual Hours\tRounded Billed (Mins)\tRounded Billable Hours\tRound-Up Added (Mins)\tRound-Up Added (Hours)\tUplift %\tTotal Tasks\tReconciliation Check',
      ...clientSummaries.map((cs) => {
        const roundRule =
          cs.clientRoundingMinutes > 0
            ? `Round UP ${cs.clientRoundingMinutes}m`
            : 'Exact (No Rounding)';
        return `${cs.clientCode}\t${cs.clientName}\t${roundRule}\t${Math.round(
          cs.totalActualMinutes
        )}\t${cs.totalActualHoursFormatted}\t${Math.round(
          cs.totalRoundedMinutes
        )}\t${cs.totalRoundedHoursFormatted}\t${Math.round(
          cs.totalRoundUpAddedMinutes
        )}\t+${cs.totalRoundUpAddedFormatted}\t${cs.upliftPercent}%\t${
          cs.taskSummaries.length
        }\t${cs.isReconciled ? 'BALANCED' : 'CHECK'}`;
      }),
    ];
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    setFeedback('✓ Copied Client Reconciliation Summary table to clipboard.');
  };

  const handleDownloadCsv = () => {
    const lines = [
      'Client,Task,Entries,Rounding Rule,Actual Minutes,Actual Hours,Rounded Minutes,Rounded Billable Hours,K Review Status',
      ...billingRows.map(
        (r) =>
          `"${r.clientDisplay}","${r.taskDisplay}",${r.entryCount},"${
            r.ruleLabel
          }",${r.actualMinutes.toFixed(1)},${r.actualHoursFormatted},${r.roundedMinutes.toFixed(
            1
          )},${r.roundedHoursFormatted},"${r.isAllAgreed ? 'Agreed' : 'Pending Review'}"`
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cloud9-billing-extract-${start}-to-${end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadUnbilledAuditCsv = () => {
    const lines = [
      'Date,Operative,Client,Task,Hours (Exact),Minutes,Mandatory Unbill Justification,K Sign-off Status,Review Note',
      ...unbilledEntries.map((e) => {
        const durationMins = e.ended_at ? getDurationMinutes(e.started_at, e.ended_at) : 0;
        const hrs = (durationMins / 60).toFixed(2);
        return `"${formatLondonTime(e.started_at)}","${e.user_name || ''}","${
          e.client_name || ''
        } (${e.client_code || ''})","${e.task_name || ''} (${e.task_code || ''})",${hrs},${durationMins.toFixed(
          1
        )},"${(e.unbilled_reason || 'No justification provided').replace(/"/g, '""')}","${
          e.billing_review_status === 'agreed' ? 'Confirmed Absorbed' : 'Pending Review'
        }","${(e.billing_review_note || '').replace(/"/g, '""')}"`;
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cloud9-unbilled-justifications-audit-${start}-to-${end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Header with K Review Hub Identity */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Link
              href={`/reports?start=${start}&end=${end}`}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-emerald-400 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Reports
            </Link>
            <span className="text-slate-600">·</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
              <Sparkles className="w-3 h-3" />
              Intelligent Billing Hub
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-3">
            Client Billing &amp; Invoicing Review
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Intelligent pre-invoice audit for K &amp; Finance: Review automated billings, audit mandatory unbilled justifications, and quickly sign off on client charges before invoicing.
          </p>
        </div>

        {/* Action Controls for K */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            disabled={busy || autoBilledEntries.length === 0}
            onClick={handleQuickAgreeAutoBilled}
            className="btn-glove px-4 h-11 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 text-xs font-black flex items-center gap-2 shadow-lg shadow-emerald-500/20"
            title="Automatically agree all routine system pick & pack jobs in one click"
          >
            <Sparkles className="w-4 h-4 fill-current" />
            Quick-Agree Auto-Billed
          </button>

          <button
            type="button"
            onClick={handleDownloadMultiTabExcel}
            className="btn-glove px-4 h-11 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black border border-emerald-500/40 flex items-center gap-2 shadow-lg shadow-emerald-600/20"
            title="Download native multi-tab Microsoft Excel workbook with 4 sheets for Kay"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Multi-Tab Excel (.xls)
          </button>

          <button
            type="button"
            onClick={handleDownloadMultiSectionCsv}
            className="btn-glove px-4 h-11 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-black border border-slate-700 flex items-center gap-2"
            title="Download multi-section summary CSV with client reconciliation"
          >
            <Download className="w-4 h-4" />
            Summary CSV
          </button>

          <button
            type="button"
            onClick={handleCopyClipboard}
            className="btn-glove px-4 h-11 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-black border border-slate-700 flex items-center gap-2"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                Copied Extract
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-emerald-400" />
                Copy Table
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live Feedback Banner */}
      {feedback && (
        <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs font-bold flex items-center justify-between gap-3 animate-in fade-in">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="p-1 rounded-lg hover:bg-emerald-900/50 text-emerald-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Date Filter & Executive Summary KPI Ribbon */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <form
          onSubmit={handleApplyRange}
          className="lg:col-span-5 bg-slate-900 border border-slate-800 border-l-4 border-l-emerald-500 rounded-3xl p-5 flex flex-col gap-3 shadow-lg"
        >
          {/* Week Quick Switcher */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 border-b border-slate-800">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-400" />
              Billing Week
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleShiftWeek(-1)}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                title="Go back one week"
              >
                ‹ Prev
              </button>
              <button
                type="button"
                onClick={() => handleSelectPresetWeek('this')}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition"
              >
                This Week
              </button>
              <button
                type="button"
                onClick={() => handleSelectPresetWeek('last')}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
              >
                Last Week
              </button>
              <button
                type="button"
                onClick={() => handleShiftWeek(1)}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition"
                title="Go forward one week"
              >
                Next ›
              </button>
            </div>
          </div>
          <div className="text-xs text-emerald-400/90 font-mono font-bold">
            {currentWeekInfo.weekLabel}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[110px]">
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Billing From
              </label>
              <input
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-bold"
              />
            </div>
            <div className="flex-1 min-w-[110px]">
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Billing To
              </label>
              <input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-bold"
              />
            </div>
            <button
              type="submit"
              className="h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-black border border-slate-700"
            >
              Filter
            </button>
          </div>
        </form>

        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Billable Rounded Hours */}
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl p-4 shadow-lg flex flex-col justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              Billable Hours
            </div>
            <div className="text-2xl font-black font-mono text-emerald-400 my-1">
              {totals.roundedHrsFormatted}{' '}
              <span className="text-xs font-sans font-semibold text-emerald-300/80">
                hrs
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              {formatMinutesReadable(totals.roundedMins)} to invoice
            </div>
          </div>

          {/* Rounding Uplift */}
          <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-4 shadow-lg flex flex-col justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
              Rounding Uplift
            </div>
            <div className="text-2xl font-black font-mono text-amber-300 my-1">
              +{totals.upliftHrsFormatted}{' '}
              <span className="text-xs font-sans font-semibold text-amber-300/80">
                hrs
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Contract minimum gains
            </div>
          </div>

          {/* Absorbed Our Cost (Mandatory Audits) */}
          <div className="bg-slate-900 border-2 border-rose-500/50 rounded-3xl p-4 shadow-lg flex flex-col justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wider text-rose-400 flex items-center justify-between">
              <span>Our Cost</span>
              <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px]">
                {totals.unbilledCount} jobs
              </span>
            </div>
            <div className="text-2xl font-black font-mono text-rose-400 my-1">
              {totals.unbilledHrsFormatted}{' '}
              <span className="text-xs font-sans font-semibold text-rose-300/80">
                hrs
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Cloud9 absorbed labor
            </div>
          </div>

          {/* Review Readiness Progress */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-lg flex flex-col justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
              K Sign-Off
            </div>
            <div className="text-2xl font-black font-mono text-sky-300 my-1">
              {totals.reviewReadinessPct}%
            </div>
            <div className="text-[11px] text-slate-400">
              {totals.agreedGroupsCount} of {totals.totalGroups} groups agreed
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs for K */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('client_summary')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black transition flex items-center gap-2 ${
              activeTab === 'client_summary'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Client Summary &amp; Uplift
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-950/40 text-current">
              {clientSummaries.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('summary')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black transition flex items-center gap-2 ${
              activeTab === 'summary'
                ? 'bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Invoice Extract (Grouped)
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-950/40 text-current">
              {billingRows.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('unbilled_audit')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black transition flex items-center gap-2 border ${
              activeTab === 'unbilled_audit'
                ? 'bg-rose-600 text-white border-rose-500 shadow-lg shadow-rose-600/30'
                : 'bg-slate-900 text-rose-300 hover:bg-slate-800 border-rose-500/40'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            Our Cost &amp; Justifications
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-black/40 text-white">
              {unbilledEntries.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('anomalies')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black transition flex items-center gap-2 ${
              activeTab === 'anomalies'
                ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                : 'bg-slate-900 text-amber-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Pre-Flight Audit Flags
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-950/40 text-current">
              {anomalyFlags.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('all_entries')}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black transition flex items-center gap-2 ${
              activeTab === 'all_entries'
                ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/20'
                : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
            }`}
          >
            Detailed Ledger
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] bg-slate-950/40 text-current">
              {entries.length}
            </span>
          </button>
        </div>

        {activeTab === 'client_summary' && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadMultiTabExcel}
              className="btn-glove px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg shadow-emerald-600/20 flex items-center gap-1.5"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Download Excel (.xls)
            </button>
            <button
              type="button"
              onClick={handleDownloadMultiSectionCsv}
              className="btn-glove px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Summary CSV
            </button>
          </div>
        )}

        {activeTab === 'unbilled_audit' && unbilledEntries.length > 0 && (
          <button
            type="button"
            onClick={handleDownloadUnbilledAuditCsv}
            className="btn-glove px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-300 border border-rose-500/40 text-xs font-bold flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Download Justifications Audit CSV
          </button>
        )}
      </div>

      {/* TAB 0: CLIENT SUMMARY & CONTRACT ROUND-UP RECONCILIATION */}
      {activeTab === 'client_summary' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                  Kay&apos;s Weekly Client Summary
                </span>
                <span className="text-slate-500">·</span>
                <span className="text-xs font-semibold text-slate-400">
                  {clientSummaries.length} Active Clients
                </span>
              </div>
              <h2 className="text-xl font-black text-white">
                Client Summary &amp; Contract Round-Up Reconciliation
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
                Review summarized billable time for each client, per-task breakdowns, actual hours vs rounded billable hours, and the additional time put on from contract round-ups. All figures balance before billing.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={Object.keys(collapsedClientIds).length === 0 ? handleCollapseAll : handleExpandAll}
                className="btn-glove px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 flex items-center gap-1.5"
              >
                {Object.keys(collapsedClientIds).length === 0 ? (
                  <>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                    Collapse All Tasks
                  </>
                ) : (
                  <>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    Expand All Tasks
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCopyClientSummary}
                className="btn-glove px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold border border-slate-700 flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5 text-emerald-400" />
                Copy Summary Table
              </button>

              <button
                type="button"
                onClick={handleDownloadMultiTabExcel}
                className="btn-glove px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-lg shadow-emerald-600/20 flex items-center gap-1.5"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Download Excel (.xls)
              </button>
            </div>
          </div>

          {/* Client Summary Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse" data-testid="client-summary-table">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="py-3.5 px-5">Client &amp; Code</th>
                    <th className="py-3.5 px-4">Contract Rounding</th>
                    <th className="py-3.5 px-5 text-right">Actual Recorded Time</th>
                    <th className="py-3.5 px-5 text-right text-emerald-400">Rounded Billable Time</th>
                    <th className="py-3.5 px-5 text-right text-amber-300">Round-Up Added (Uplift)</th>
                    <th className="py-3.5 px-4 text-center">Tasks</th>
                    <th className="py-3.5 px-5 text-center">Reconciliation Check</th>
                    <th className="py-3.5 px-5 text-right">K Sign-Off</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-[13px]">
                  {clientSummaries.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400 space-y-2">
                        <Info className="w-8 h-8 text-slate-500 mx-auto" />
                        <p className="font-bold text-white text-sm">No billable client entries in this period.</p>
                        <p className="text-xs text-slate-500">Use the week switcher or select another date range above.</p>
                      </td>
                    </tr>
                  ) : (
                    clientSummaries.map((cs) => {
                      const expanded = isClientExpanded(cs.clientId);
                      return (
                        <React.Fragment key={cs.clientId}>
                          {/* Client Header Row */}
                          <tr
                            className="bg-slate-900/90 hover:bg-slate-800/60 transition cursor-pointer select-none"
                            onClick={() => toggleClientExpand(cs.clientId)}
                          >
                            <td className="py-4 px-5">
                              <div className="flex items-center gap-2">
                                <span className="p-1 rounded-md bg-slate-800 text-slate-400">
                                  {expanded ? (
                                    <ChevronDown className="w-4 h-4 text-emerald-400" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4" />
                                  )}
                                </span>
                                <div>
                                  <div className="font-black text-white text-sm">
                                    {cs.clientName}
                                  </div>
                                  <div className="text-[11px] font-mono text-slate-400">
                                    Code: {cs.clientCode} · {cs.totalEntries} entries
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="py-4 px-4">
                              <span
                                className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${
                                  cs.clientRoundingMinutes > 0
                                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                                    : 'bg-slate-800 text-slate-400 border-slate-700'
                                }`}
                              >
                                {cs.clientRoundingMinutes > 0
                                  ? `Round UP ${cs.clientRoundingMinutes}m`
                                  : 'Exact (No Rounding)'}
                              </span>
                            </td>

                            <td className="py-4 px-5 text-right">
                              <div className="font-mono text-base font-bold text-slate-200">
                                {cs.totalActualHoursFormatted} hrs
                              </div>
                              <div className="font-mono text-xs text-slate-400">
                                {formatMinutesReadable(cs.totalActualMinutes)}
                              </div>
                            </td>

                            <td className="py-4 px-5 text-right">
                              <div className="font-mono text-base font-black text-emerald-400">
                                {cs.totalRoundedHoursFormatted} hrs
                              </div>
                              <div className="font-mono text-xs text-emerald-300/70">
                                {formatMinutesReadable(cs.totalRoundedMinutes)}
                              </div>
                            </td>

                            <td className="py-4 px-5 text-right">
                              <div className="font-mono text-base font-black text-amber-300">
                                +{cs.totalRoundUpAddedFormatted} hrs
                              </div>
                              <div className="font-mono text-xs text-amber-300/70">
                                +{formatMinutesReadable(cs.totalRoundUpAddedMinutes)} (+{cs.upliftPercent}%)
                              </div>
                            </td>

                            <td className="py-4 px-4 text-center font-bold text-slate-300">
                              {cs.taskSummaries.length} {cs.taskSummaries.length === 1 ? 'task' : 'tasks'}
                            </td>

                            <td className="py-4 px-5 text-center">
                              {cs.isReconciled ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" title="Actual + Round-Up Added = Rounded Billable Hours">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  BALANCED
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                                  CHECK
                                </span>
                              )}
                            </td>

                            <td className="py-4 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                              {cs.isAllAgreed ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                                  <Check className="w-3.5 h-3.5" />
                                  Agreed by K
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleAgreeClient(cs)}
                                  className="btn-glove px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 transition"
                                >
                                  Agree Client
                                </button>
                              )}
                            </td>
                          </tr>

                          {/* Expanded Task Breakdown for this Client */}
                          {expanded && (
                            <tr className="bg-slate-950/70">
                              <td colSpan={8} className="p-0">
                                <div className="p-4 pl-12 pr-6 border-y border-slate-800/80 bg-slate-950/50">
                                  <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
                                    <span>{`Task Breakdown for ${cs.clientName}`}</span>
                                    <span className="text-[11px] font-normal normal-case text-slate-500">
                                      Actual + Round-Up = Rounded Invoiced
                                    </span>
                                  </div>

                                  <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                      <tr className="border-b border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        <th className="py-2 px-3">Task Name &amp; Code</th>
                                        <th className="py-2 px-3">Rounding Applied</th>
                                        <th className="py-2 px-3 text-right">Actual Time</th>
                                        <th className="py-2 px-3 text-right text-emerald-400">Rounded Time</th>
                                        <th className="py-2 px-3 text-right text-amber-300">Round-Up Added</th>
                                        <th className="py-2 px-3 text-right">Units Handled</th>
                                        <th className="py-2 px-3 text-right">Entries</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60">
                                      {cs.taskSummaries.map((ts) => (
                                        <tr key={ts.taskId} className="hover:bg-slate-800/30 transition">
                                          <td className="py-2.5 px-3 font-semibold text-slate-200">
                                            <div>{ts.taskName}</div>
                                            <div className="font-mono text-[10px] text-slate-500">{ts.taskCode}</div>
                                          </td>
                                          <td className="py-2.5 px-3">
                                            <span className="text-[11px] text-slate-400">
                                              {ts.ruleLabel}
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                                            {ts.actualHoursFormatted} hrs
                                            <span className="text-[10px] text-slate-500 block">
                                              {Math.round(ts.actualMinutes)}m
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-400">
                                            {ts.roundedHoursFormatted} hrs
                                            <span className="text-[10px] text-emerald-400/60 block">
                                              {Math.round(ts.roundedMinutes)}m
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-300">
                                            +{ts.roundUpAddedFormatted} hrs
                                            <span className="text-[10px] text-amber-300/60 block">
                                              +{Math.round(ts.roundUpAddedMinutes)}m
                                            </span>
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                                            {ts.totalUnits > 0 ? `${ts.totalUnits} ${ts.unitLabel ?? 'units'}` : '—'}
                                          </td>
                                          <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                                            {ts.entryCount}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>

                {clientSummaries.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-700 bg-slate-950 text-sm font-black">
                      <td colSpan={2} className="py-4 px-5 text-slate-200 uppercase text-xs tracking-wider">
                        Total All Clients ({clientSummaries.length})
                      </td>
                      <td className="py-4 px-5 text-right font-mono text-slate-200">
                        {clientTotals.actualHrsFormatted} hrs
                        <div className="text-xs font-normal text-slate-400">
                          {formatMinutesReadable(clientTotals.actualMins)}
                        </div>
                      </td>
                      <td className="py-4 px-5 text-right font-mono text-emerald-400 text-base">
                        {clientTotals.roundedHrsFormatted} hrs
                        <div className="text-xs font-normal text-emerald-300/80">
                          {formatMinutesReadable(clientTotals.roundedMins)}
                        </div>
                      </td>
                      <td className="py-4 px-5 text-right font-mono text-amber-300 text-base">
                        +{clientTotals.roundUpHrsFormatted} hrs
                        <div className="text-xs font-normal text-amber-300/80">
                          +{formatMinutesReadable(clientTotals.roundUpMins)} (+{clientTotals.totalUpliftPct}%)
                        </div>
                      </td>
                      <td colSpan={3} className="py-4 px-5 text-right">
                        {clientTotals.allBalanced ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            100% RECONCILED (Actual + Added = Billed)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            Check Rounding Anomalies
                          </span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: INVOICE EXTRACT TABLE (GROUPED) */}
      {activeTab === 'summary' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl space-y-4">
          <div className="p-5 pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-white">Client Invoice Extract</h2>
              <p className="text-xs text-slate-400">
                Ready for client billing: Each task groups entries, rounds UP according to contract rules, and reflects K agreement.
              </p>
            </div>
            <div className="text-xs font-semibold text-slate-400">
              Showing {billingRows.length} billable task groupings
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse" data-testid="billing-export-table">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3.5 px-5">Client</th>
                  <th className="py-3.5 px-5">Task</th>
                  <th className="py-3.5 px-4">Rounding Rule</th>
                  <th className="py-3.5 px-5 text-right">Actual Time</th>
                  <th className="py-3.5 px-5 text-right text-emerald-400">
                    Rounded Time (Billed)
                  </th>
                  <th className="py-3.5 px-5 text-center">K Agreement Status</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-[13px]">
                {billingRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400 space-y-2">
                      <Info className="w-8 h-8 text-slate-500 mx-auto" />
                      <p className="font-bold text-white text-sm">No billable completed entries in this date range.</p>
                      <p className="text-xs text-slate-500">Check the &ldquo;Our Cost &amp; Justifications&rdquo; tab if all recorded work was unbilled.</p>
                    </td>
                  </tr>
                ) : (
                  billingRows.map((row) => (
                    <tr key={row.key} className="hover:bg-slate-800/40 transition">
                      <td className="py-4 px-5 font-bold text-white">
                        {row.clientDisplay}
                      </td>
                      <td className="py-4 px-5">
                        <div className="font-semibold text-slate-200">
                          {row.taskDisplay}
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.entryCount} {row.entryCount === 1 ? 'entry' : 'entries'}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border ${
                            row.isTaskOverride
                              ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                              : row.roundingMinutes > 0
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {row.ruleLabel}
                        </span>
                      </td>
                      <td className="py-4 px-5 text-right">
                        <div className="font-mono text-base font-bold text-slate-200">
                          {row.actualHoursFormatted} hrs
                        </div>
                        <div className="font-mono text-xs text-slate-400">
                          {formatMinutesReadable(row.actualMinutes)}
                        </div>
                      </td>
                      <td className="py-4 px-5 text-right">
                        <div className="font-mono text-base font-black text-emerald-400">
                          {row.roundedHoursFormatted} hrs
                        </div>
                        <div className="font-mono text-xs text-emerald-300/70">
                          {formatMinutesReadable(row.roundedMinutes)}
                        </div>
                      </td>
                      <td className="py-4 px-5 text-center">
                        {row.isAllAgreed ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                            Agreed by K
                          </span>
                        ) : row.hasDisputes ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                            Disputed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            <HelpCircle className="w-3.5 h-3.5 text-amber-400" />
                            Pending Review
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-5 text-right">
                        {!row.isAllAgreed && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleAgreeGroup(row.entries)}
                            className="btn-glove px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-600 text-slate-200 hover:text-white text-xs font-bold border border-slate-700 transition"
                          >
                            Mark Agreed
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {billingRows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-700 bg-slate-950/90 text-sm font-black">
                    <td colSpan={3} className="py-4 px-5 text-slate-300 uppercase text-xs tracking-wider">
                      Total Billable Extract
                    </td>
                    <td className="py-4 px-5 text-right font-mono text-slate-200">
                      {totals.actualHrsFormatted} hrs
                      <div className="text-xs font-normal text-slate-400">
                        {formatMinutesReadable(totals.actualMins)}
                      </div>
                    </td>
                    <td className="py-4 px-5 text-right font-mono text-emerald-400 text-base">
                      {totals.roundedHrsFormatted} hrs
                      <div className="text-xs font-normal text-emerald-300/80">
                        {formatMinutesReadable(totals.roundedMins)}
                      </div>
                    </td>
                    <td colSpan={2} className="py-4 px-5 text-right text-xs text-slate-400 font-semibold">
                      +{totals.upliftHrsFormatted} hrs uplift applied
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: OUR COST & MANDATORY UNBILLED JUSTIFICATIONS AUDIT */}
      {activeTab === 'unbilled_audit' && (
        <div className="bg-slate-900 border-2 border-rose-500/40 rounded-3xl p-6 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                  <ShieldAlert className="w-5 h-5" />
                </span>
                <h2 className="text-xl font-black text-white">
                  Our Cost &amp; Mandatory Unbilled Justifications
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Every task here is currently absorbed as an internal expense to Cloud9. Review the mandatory written justification provided by the floor. If you agree, confirm it. If you disagree, flip it to Billable in one click!
              </p>
            </div>

            <div className="px-4 py-2 rounded-2xl bg-rose-950/60 border border-rose-500/50 text-right">
              <div className="text-[10px] uppercase font-bold text-rose-300">Total Absorbed</div>
              <div className="text-xl font-black font-mono text-rose-400">
                {totals.unbilledHrsFormatted} hrs ({totals.unbilledCount} tasks)
              </div>
            </div>
          </div>

          {unbilledEntries.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2 bg-slate-950/50 rounded-2xl border border-slate-800">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <p className="font-bold text-white text-base">No unbilled tasks in this date range.</p>
              <p className="text-xs text-slate-500">All recorded labor has been classified into billable customer extracts.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {unbilledEntries.map((entry) => {
                const durationMins = entry.ended_at
                  ? getDurationMinutes(entry.started_at, entry.ended_at)
                  : 0;
                const hrs = (durationMins / 60).toFixed(2);
                const isAgreed = entry.billing_review_status === 'agreed';

                return (
                  <div
                    key={entry.id}
                    className="p-5 rounded-2xl bg-slate-950 border border-rose-500/30 hover:border-rose-500/60 transition space-y-4 shadow-lg"
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/25 text-rose-300 border border-rose-500">
                            Our Cost (Unbilled)
                          </span>
                          <span className="font-bold text-sm text-white">
                            {entry.client_name} ({entry.client_code})
                          </span>
                          <span className="text-slate-600">·</span>
                          <span className="text-xs font-semibold text-slate-300">
                            {entry.task_name} ({entry.task_code})
                          </span>
                          {entry.order_ref && (
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-400">
                              Ref: {entry.order_ref}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                          <span className="flex items-center gap-1 text-slate-300 font-semibold">
                            <User className="w-3.5 h-3.5 text-slate-500" />
                            {entry.user_name || 'Operative'}
                          </span>
                          <span>·</span>
                          <span>{formatLondonTime(entry.started_at)}</span>
                          <span>·</span>
                          <span className="font-mono font-bold text-rose-300">
                            {hrs} hrs ({Math.round(durationMins)} mins)
                          </span>
                        </div>
                      </div>

                      {/* K's Direct Decision Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {isAgreed ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-black">
                            <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                            Confirmed Absorbed
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleAgreeUnbilledEntry(entry)}
                            className="btn-glove px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-emerald-200 border border-emerald-500/40 text-xs font-black flex items-center gap-1.5 transition"
                            title="Confirm this cost should be absorbed by Cloud9"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                            Agree: Absorbed
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleFlipToBillable(entry)}
                          className="btn-glove px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-sky-600/30 transition"
                          title="Disagree with absorbing this: Move this task directly to Client Billable Extract"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          Disagree: Flip to Billable
                        </button>
                      </div>
                    </div>

                    {/* Prominent Mandatory Justification Callout */}
                    <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200 flex items-start gap-2.5">
                      <span className="font-black uppercase text-[10px] text-rose-400 shrink-0 mt-0.5">
                        Mandatory Justification:
                      </span>
                      <div className="font-semibold italic text-white flex-1">
                        &ldquo;{entry.unbilled_reason || 'No written justification provided on file.'}&rdquo;
                      </div>
                    </div>

                    {entry.billing_review_note && (
                      <div className="text-[11px] text-slate-400 italic">
                        Note from Finance: {entry.billing_review_note}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: INTELLIGENT PRE-FLIGHT AUDIT FLAGS */}
      {activeTab === 'anomalies' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <AlertTriangle className="w-5 h-5" />
              </span>
              <h2 className="text-xl font-black text-white">Intelligent Pre-Flight Audit Flags</h2>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Automated heuristics check for issues that frequently cause invoice disputes with clients or profit loss for Cloud9.
            </p>
          </div>

          {anomalyFlags.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2 bg-slate-950 rounded-2xl border border-slate-800">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <p className="font-bold text-white text-sm">All pre-flight checks clear!</p>
              <p className="text-xs text-slate-500">No rounding discrepancies or missing PO references detected.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {anomalyFlags.map((flag) => (
                <div
                  key={flag.id}
                  className={`p-5 rounded-2xl border flex flex-col justify-between space-y-3 ${
                    flag.level === 'critical'
                      ? 'bg-rose-950/20 border-rose-500/50'
                      : flag.level === 'warning'
                      ? 'bg-amber-950/20 border-amber-500/40'
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span
                        className={`text-xs font-black uppercase tracking-wider ${
                          flag.level === 'critical'
                            ? 'text-rose-400'
                            : flag.level === 'warning'
                            ? 'text-amber-300'
                            : 'text-sky-300'
                        }`}
                      >
                        {flag.title}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-900 border border-slate-800 text-slate-300">
                        {flag.affectedCount} affected
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {flag.description}
                    </p>
                  </div>

                  {flag.id === 'unbilled_commercial' ? (
                    <button
                      type="button"
                      onClick={() => setActiveTab('unbilled_audit')}
                      className="btn-glove px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold self-start flex items-center gap-1.5 shadow"
                    >
                      Audit Justifications Now →
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setLedgerAuditFilter(
                          flag.id as 'high_rounding' | 'missing_po' | 'manual_source'
                        );
                        setActiveTab('all_entries');
                      }}
                      className="btn-glove px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black self-start flex items-center gap-1.5 shadow"
                    >
                      Filter &amp; Inspect {flag.affectedCount} Matching Rows →
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: DETAILED ENTRY LEDGER */}
      {activeTab === 'all_entries' && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-white">Granular Entry Ledger</h2>
              <p className="text-xs text-slate-400">
                Search and review individual time entries across all clients, tasks, and operatives.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {ledgerAuditFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setLedgerAuditFilter('all')}
                  className="px-3 py-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-black inline-flex items-center gap-1.5"
                >
                  <span>Audit Filter: {ledgerAuditFilter.replace('_', ' ').toUpperCase()}</span>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <div className="relative min-w-[260px]">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search task, client, operative, order ref..."
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4">Date / Time</th>
                  <th className="py-3 px-4">Operative</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Task</th>
                  <th className="py-3 px-4">Billing Status</th>
                  <th className="py-3 px-4 text-right">Actual Duration</th>
                  <th className="py-3 px-4 text-center">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-[12px]">
                {filteredEntries.map((e) => {
                  const durationMins = e.ended_at
                    ? getDurationMinutes(e.started_at, e.ended_at)
                    : 0;
                  const status = resolveBillingStatus({
                    billingStatus: e.billing_status,
                    billable: e.billable,
                    taskCode: e.task_code,
                    taskName: e.task_name,
                  });
                  const config = getBillingStatusConfig(status);

                  return (
                    <tr key={e.id} className="hover:bg-slate-800/40">
                      <td className="py-3 px-4 font-mono text-slate-300">
                        {formatLondonTime(e.started_at)}
                      </td>
                      <td className="py-3 px-4 font-semibold text-white">
                        {e.user_name || 'Operative'}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-200">
                        {e.client_name} ({e.client_code})
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-200">{e.task_name}</div>
                        {e.order_ref && (
                          <div className="text-[10px] text-slate-500 font-mono">
                            Ref: {e.order_ref}
                          </div>
                        )}
                        {status === 'our_cost' && e.unbilled_reason && (
                          <div className="text-[10px] text-rose-400 font-medium italic mt-0.5">
                            Why: &ldquo;{e.unbilled_reason}&rdquo;
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${config.badgeClass}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`} />
                          {config.label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-200">
                        {formatMinutesReadable(durationMins)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {e.billing_review_status === 'agreed' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                            <Check className="w-3.5 h-3.5 stroke-[3]" /> Agreed
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-semibold">
                            Pending
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
