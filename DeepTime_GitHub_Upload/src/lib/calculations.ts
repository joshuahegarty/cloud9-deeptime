import {
  Client,
  TargetChangeRequest,
  TaskTargetAnalysis,
  TaskType,
} from './types';

/**
 * Core duration, billing rounding (ROUND UP), and productivity standard calculations.
 * Timezone convention: store UTC, display Europe/London.
 */

export const APP_TIMEZONE = 'Europe/London';

/**
 * Compute exact unrounded duration in minutes between two timestamps.
 */
export function getDurationMinutes(startedAt: string | Date, endedAt: string | Date): number {
  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(endedAt).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return 0;
  }
  return (endMs - startMs) / 60000;
}

/**
 * Resolve effective billing rounding rule for a time entry:
 * - If the Task Type defines a non-null `rounding_minutes` (0, 5, 10, 15), it supersedes the Client's overall rule.
 * - Otherwise, falls back to the Client's overall `rounding_minutes` (default 0 = exact).
 */
export function resolveEffectiveRounding(
  taskRoundingMinutes: number | null | undefined,
  clientRoundingMinutes: number | null | undefined
): { roundingMinutes: number; isTaskOverride: boolean } {
  if (taskRoundingMinutes !== null && taskRoundingMinutes !== undefined) {
    return {
      roundingMinutes: Math.max(0, Number(taskRoundingMinutes)),
      isTaskOverride: true,
    };
  }
  return {
    roundingMinutes: Math.max(0, Number(clientRoundingMinutes ?? 0)),
    isTaskOverride: false,
  };
}

/**
 * Round a duration in minutes UP (ceiling) to the next `roundingMinutes` increment
 * FOR BILLING PURPOSES ONLY, optionally enforcing a minimum billable charge (`minChargeMinutes`).
 * For example, if `minChargeMinutes` = 15 and `roundingMinutes` = 5, an 8m run bills at 15m,
 * and a 17m run bills at 20m.
 * If `roundingMinutes` <= 0, returns the exact unrounded minutes (or `minChargeMinutes` if higher).
 */
export function roundDurationMinutes(
  durationMinutes: number,
  roundingMinutes: number,
  minChargeMinutes: number | null | undefined = 0
): number {
  if (durationMinutes <= 0) return 0;
  const minFloor = minChargeMinutes && minChargeMinutes > 0 ? Number(minChargeMinutes) : 0;
  const effectiveDuration = minFloor > 0 ? Math.max(durationMinutes, minFloor) : durationMinutes;
  if (!roundingMinutes || roundingMinutes <= 0) {
    return effectiveDuration;
  }
  const ratio = Number((effectiveDuration / roundingMinutes).toFixed(9));
  return Math.ceil(ratio) * roundingMinutes;
}

/**
 * Convert minutes to hours formatted to two decimal places (as numeric value).
 */
export function minutesToHours(minutes: number): number {
  if (minutes <= 0) return 0;
  return Number((minutes / 60).toFixed(2));
}

/**
 * Format hours number to a two-decimal string (e.g., "1.25").
 */
export function formatHours(hours: number): string {
  return (Math.round(hours * 100) / 100).toFixed(2);
}

/**
 * Format minutes as readable hours & minutes (e.g. "1h 15m" or "22m" or "<1m").
 */
export function formatMinutesReadable(minutes: number): string {
  if (minutes <= 0) return '0m';
  const totalSecs = Math.round(minutes * 60);
  if (totalSecs < 60) {
    return `${totalSecs}s`;
  }
  const wholeMins = Math.round(minutes);
  const hrs = Math.floor(wholeMins / 60);
  const mins = wholeMins % 60;
  if (hrs > 0) {
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  return `${mins}m`;
}

/**
 * Calculate both Actual (unrounded) and Rounded (always rounded UP per entry) billing metrics
 * for a collection of entries. Supports per-entry effective rounding (task override > client rule).
 */
export function calculateBillingMetricsForEntries(
  entries: Array<{
    started_at: string | Date;
    ended_at: string | Date | null;
    task_rounding_minutes?: number | null;
    task_min_charge_minutes?: number | null;
    client_rounding_minutes?: number | null;
  }>,
  fallbackRoundingMinutes = 0
): {
  actualMinutes: number;
  actualHours: number;
  roundedMinutes: number;
  roundedHours: number;
} {
  let actualMinutes = 0;
  let roundedMinutes = 0;

  for (const entry of entries) {
    if (!entry.ended_at) continue;
    const rawMinutes = getDurationMinutes(entry.started_at, entry.ended_at);
    const { roundingMinutes } =
      entry.task_rounding_minutes !== undefined || entry.client_rounding_minutes !== undefined
        ? resolveEffectiveRounding(entry.task_rounding_minutes, entry.client_rounding_minutes)
        : { roundingMinutes: fallbackRoundingMinutes };

    actualMinutes += rawMinutes;
    roundedMinutes += roundDurationMinutes(
      rawMinutes,
      roundingMinutes,
      entry.task_min_charge_minutes ?? 0
    );
  }

  return {
    actualMinutes: Number(actualMinutes.toFixed(2)),
    actualHours: minutesToHours(actualMinutes),
    roundedMinutes: Number(roundedMinutes.toFixed(2)),
    roundedHours: minutesToHours(roundedMinutes),
  };
}

/**
 * Calculate billed hours (rounded UP per entry) for a collection of entries.
 */
export function calculateBilledHoursForEntries(
  entries: Array<{
    started_at: string | Date;
    ended_at: string | Date | null;
    task_rounding_minutes?: number | null;
    client_rounding_minutes?: number | null;
  }>,
  roundingMinutes: number
): number {
  return calculateBillingMetricsForEntries(entries, roundingMinutes).roundedHours;
}

/**
 * Calculate Actual vs Standard % = (standard / actual) * 100.
 * Always uses ACTUAL unrounded minutes (never billing rounded minutes).
 */
export function calculateActualVsStandardPercent(params: {
  standardMinutes: number | null | undefined;
  unitLabel: string | null | undefined;
  actualMinutes: number;
  units?: number | null;
  entryCount?: number;
}): number | null {
  const { standardMinutes, unitLabel, actualMinutes, units, entryCount = 1 } = params;

  if (standardMinutes === null || standardMinutes === undefined || standardMinutes <= 0) {
    return null;
  }
  if (actualMinutes <= 0) {
    return null;
  }

  const hasUnitLabel = Boolean(unitLabel && unitLabel.trim().length > 0);

  let expectedStandardMinutes: number;
  if (hasUnitLabel) {
    if (units === null || units === undefined || units <= 0) {
      return null;
    }
    expectedStandardMinutes = standardMinutes * units;
  } else {
    if (entryCount <= 0) return null;
    expectedStandardMinutes = standardMinutes * entryCount;
  }

  const pct = (expectedStandardMinutes / actualMinutes) * 100;
  return Number(pct.toFixed(1));
}

/**
 * Format a UTC timestamp in Europe/London time (HH:mm).
 */
export function formatLondonTime(isoString: string | null | undefined, timeZone = APP_TIMEZONE): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Format a UTC timestamp in Europe/London date + time (dd/MM/yyyy HH:mm).
 */
export function formatLondonDateTime(isoString: string | null | undefined, timeZone = APP_TIMEZONE): string {
  if (!isoString) return '—';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Format elapsed seconds as HH:MM:SS for the active timer display.
 */
export function formatElapsedHMS(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(safeSeconds / 3600);
  const mins = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;
  return [hrs, mins, secs].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * Get YYYY-MM-DD in Europe/London for a given Date.
 */
export function getLondonDateString(date: Date = new Date(), timeZone = APP_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export interface TaskDayAverageSummary {
  taskTypeId: string;
  taskName?: string;
  taskCode?: string;
  unitLabel?: string | null;
  standardMinutes?: number | null;
  totalDurationMinutes: number;
  totalUnits: number;
  completedEntriesCount: number;
  distinctOperativesCount: number;
  operativeUserIds: string[];
  avgMinutesPerUnit: number | null;
  avgUnitsPerHour: number | null;
}

/**
 * Compute the aggregate performance pace and output for each task type across
 * all operatives on a given date.
 */
export function computeDailyTaskAverages(
  entries: Array<{
    task_type_id: string;
    task_name?: string;
    task_code?: string;
    unit_label?: string | null;
    standard_minutes?: number | null;
    user_id: string;
    started_at: string | Date;
    ended_at: string | Date | null;
    units: number | null | undefined;
  }>
): Map<string, TaskDayAverageSummary> {
  const map = new Map<
    string,
    {
      taskTypeId: string;
      taskName?: string;
      taskCode?: string;
      unitLabel?: string | null;
      standardMinutes?: number | null;
      totalDurationMinutes: number;
      totalUnits: number;
      completedEntriesCount: number;
      operativeUserIds: Set<string>;
    }
  >();

  for (const entry of entries) {
    if (!entry.ended_at) continue;
    const duration = getDurationMinutes(entry.started_at, entry.ended_at);
    if (duration <= 0) continue;

    const tid = entry.task_type_id;
    let rec = map.get(tid);
    if (!rec) {
      rec = {
        taskTypeId: tid,
        taskName: entry.task_name,
        taskCode: entry.task_code,
        unitLabel: entry.unit_label,
        standardMinutes: entry.standard_minutes,
        totalDurationMinutes: 0,
        totalUnits: 0,
        completedEntriesCount: 0,
        operativeUserIds: new Set<string>(),
      };
      map.set(tid, rec);
    }

    rec.completedEntriesCount += 1;
    rec.operativeUserIds.add(entry.user_id);

    // Only include entries >= 1 minute in team pace averages so 5-second test taps don't skew the warehouse benchmark
    if (duration >= 1) {
      rec.totalDurationMinutes += duration;
      if (entry.units !== null && entry.units !== undefined && entry.units > 0) {
        rec.totalUnits += entry.units;
      }
    }
  }

  const result = new Map<string, TaskDayAverageSummary>();
  for (const [tid, rec] of Array.from(map.entries())) {
    const avgMinutesPerUnit =
      rec.totalUnits > 0 ? Number((rec.totalDurationMinutes / rec.totalUnits).toFixed(2)) : null;
    const avgUnitsPerHour =
      rec.totalDurationMinutes > 0
        ? Number(((rec.totalUnits / rec.totalDurationMinutes) * 60).toFixed(1))
        : null;

    result.set(tid, {
      taskTypeId: tid,
      taskName: rec.taskName,
      taskCode: rec.taskCode,
      unitLabel: rec.unitLabel,
      standardMinutes: rec.standardMinutes,
      totalDurationMinutes: Number(rec.totalDurationMinutes.toFixed(2)),
      totalUnits: rec.totalUnits,
      completedEntriesCount: rec.completedEntriesCount,
      distinctOperativesCount: rec.operativeUserIds.size,
      operativeUserIds: Array.from(rec.operativeUserIds),
      avgMinutesPerUnit,
      avgUnitsPerHour,
    });
  }

  return result;
}

/**
 * Compare an individual operative's entry pace against the daily team average for that task.
 * Positive percentFaster indicates faster than the daily average.
 * Uses raw unrounded ratios to prevent division-by-zero (+Infinity%) when entry pace < 0.005 min/unit,
 * and requires at least 1 minute of elapsed task time for meaningful rate comparisons.
 */
export function comparePaceWithDayAverage(params: {
  actualMinutes: number;
  actualUnits: number;
  dayAvgMinutesPerUnit: number | null | undefined;
}): {
  entryPaceMinPerUnit: number;
  percentFaster: number | null;
  status: 'faster' | 'slower' | 'equal' | 'no_comparison';
} {
  if (params.actualUnits <= 0 || params.actualMinutes <= 0) {
    return {
      entryPaceMinPerUnit: 0,
      percentFaster: null,
      status: 'no_comparison',
    };
  }

  const rawEntryPace = params.actualMinutes / params.actualUnits;
  const entryPace = Number(rawEntryPace.toFixed(2));

  // Do not compute percentage comparison for sub-minute quick-stop test runs (< 1 min)
  if (
    params.actualMinutes < 1 ||
    rawEntryPace <= 0 ||
    !params.dayAvgMinutesPerUnit ||
    params.dayAvgMinutesPerUnit <= 0
  ) {
    return {
      entryPaceMinPerUnit: entryPace,
      percentFaster: null,
      status: 'no_comparison',
    };
  }

  const ratio = params.dayAvgMinutesPerUnit / rawEntryPace - 1;
  if (!Number.isFinite(ratio)) {
    return {
      entryPaceMinPerUnit: entryPace,
      percentFaster: null,
      status: 'no_comparison',
    };
  }

  const pct = Math.round(ratio * 100);

  let status: 'faster' | 'slower' | 'equal' = 'equal';
  if (pct >= 5) status = 'faster';
  else if (pct <= -5) status = 'slower';

  return {
    entryPaceMinPerUnit: entryPace,
    percentFaster: pct,
    status,
  };
}

// =============================================================================
// Billing Week Ranges & Client-Level Round-Up Reconciliation
// =============================================================================

export interface BillingWeekRange {
  startDate: string;
  endDate: string;
  weekLabel: string;
  weekNumber: number;
}

/**
 * Compute the ISO week (Monday to Sunday) for any reference date,
 * with optional offsetWeeks (e.g. 0 = current week, -1 = last week).
 */
export function getBillingWeekRange(
  referenceDate: Date | string = new Date(),
  offsetWeeks = 0
): BillingWeekRange {
  const ref =
    typeof referenceDate === 'string'
      ? new Date(referenceDate)
      : new Date(referenceDate.getTime());

  if (offsetWeeks !== 0) {
    ref.setDate(ref.getDate() + offsetWeeks * 7);
  }

  // Day of week in local time: 0 is Sunday, 1 is Monday...
  const day = ref.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(ref);
  monday.setDate(ref.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const startDate = getLondonDateString(monday);
  const endDate = getLondonDateString(sunday);

  // ISO Week Number
  const target = new Date(monday.valueOf());
  const dayNr = (monday.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);

  const startFormatted = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
  }).format(monday);
  const endFormatted = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(sunday);

  const prefix =
    offsetWeeks === 0
      ? 'This Week'
      : offsetWeeks === -1
      ? 'Last Week'
      : `Week ${weekNumber}`;
  const weekLabel = `${prefix}: ${startFormatted} – ${endFormatted}`;

  return { startDate, endDate, weekLabel, weekNumber };
}

export interface ClientTaskBillingSummary {
  taskId: string;
  taskName: string;
  taskCode: string;
  roundingMinutes: number;
  isTaskOverride: boolean;
  ruleLabel: string;
  actualMinutes: number;
  actualHours: number;
  actualHoursFormatted: string;
  roundedMinutes: number;
  roundedHours: number;
  roundedHoursFormatted: string;
  roundUpAddedMinutes: number;
  roundUpAddedHours: number;
  roundUpAddedFormatted: string;
  entryCount: number;
  totalUnits: number;
  unitLabel: string | null;
}

export interface ClientBillingSummary {
  clientId: string;
  clientName: string;
  clientCode: string;
  clientRoundingMinutes: number;
  totalActualMinutes: number;
  totalActualHours: number;
  totalActualHoursFormatted: string;
  totalRoundedMinutes: number;
  totalRoundedHours: number;
  totalRoundedHoursFormatted: string;
  totalRoundUpAddedMinutes: number;
  totalRoundUpAddedHours: number;
  totalRoundUpAddedFormatted: string;
  upliftPercent: number;
  totalEntries: number;
  taskSummaries: ClientTaskBillingSummary[];
  isReconciled: boolean;
  agreedEntriesCount: number;
  isAllAgreed: boolean;
}

/**
 * Calculate client-level summaries and round-up reconciliation for Kay.
 * Summarizes:
 * 1. Total actual time for each client
 * 2. Total task time for each client (by task)
 * 3. Total rounded up time for each client
 * 4. Additional time put on because of round-ups (uplift)
 * 5. Sanity reconciliation check (actual + roundup = rounded)
 */
export function calculateClientBillingSummaries(
  billableEntries: Array<{
    id: string;
    client_id: string;
    client_name?: string;
    client_code?: string;
    client_rounding_minutes?: number | null;
    task_type_id: string;
    task_name?: string;
    task_code?: string;
    task_rounding_minutes?: number | null;
    task_min_charge_minutes?: number | null;
    unit_label?: string | null;
    started_at: string | Date;
    ended_at: string | Date | null;
    units?: number | null;
    billing_review_status?: string | null;
  }>
): ClientBillingSummary[] {
  const clientMap = new Map<
    string,
    {
      clientId: string;
      clientName: string;
      clientCode: string;
      clientRoundingMinutes: number;
      taskGroups: Map<
        string,
        {
          taskId: string;
          taskName: string;
          taskCode: string;
          taskRoundingMinutes: number | null | undefined;
          taskMinChargeMinutes: number | null | undefined;
          unitLabel: string | null;
          entries: Array<{
            id: string;
            started_at: string | Date;
            ended_at: string | Date | null;
            units?: number | null;
            billing_review_status?: string | null;
          }>;
        }
      >;
    }
  >();

  for (const e of billableEntries) {
    if (!e.ended_at) continue;
    let clientObj = clientMap.get(e.client_id);
    if (!clientObj) {
      clientObj = {
        clientId: e.client_id,
        clientName: e.client_name ?? '',
        clientCode: e.client_code ?? '',
        clientRoundingMinutes: e.client_rounding_minutes ?? 0,
        taskGroups: new Map(),
      };
      clientMap.set(e.client_id, clientObj);
    }

    let taskGroup = clientObj.taskGroups.get(e.task_type_id);
    if (!taskGroup) {
      taskGroup = {
        taskId: e.task_type_id,
        taskName: e.task_name ?? '',
        taskCode: e.task_code ?? '',
        taskRoundingMinutes: e.task_rounding_minutes,
        taskMinChargeMinutes: e.task_min_charge_minutes,
        unitLabel: e.unit_label ?? null,
        entries: [],
      };
      clientObj.taskGroups.set(e.task_type_id, taskGroup);
    }

    taskGroup.entries.push({
      id: e.id,
      started_at: e.started_at,
      ended_at: e.ended_at,
      units: e.units,
      billing_review_status: e.billing_review_status,
    });
  }

  const results: ClientBillingSummary[] = [];

  for (const client of Array.from(clientMap.values())) {
    let clientActualMins = 0;
    let clientRoundedMins = 0;
    let clientTotalEntries = 0;
    let clientAgreedEntries = 0;
    const taskSummaries: ClientTaskBillingSummary[] = [];

    for (const tg of Array.from(client.taskGroups.values())) {
      const { roundingMinutes, isTaskOverride } = resolveEffectiveRounding(
        tg.taskRoundingMinutes,
        client.clientRoundingMinutes
      );
      const minChargeMinutes = tg.taskMinChargeMinutes ?? 0;

      let taskActualMins = 0;
      let taskRoundedMins = 0;
      let taskTotalUnits = 0;

      for (const ent of tg.entries) {
        if (!ent.ended_at) continue;
        const dur = getDurationMinutes(ent.started_at, ent.ended_at);
        const rounded = roundDurationMinutes(dur, roundingMinutes, minChargeMinutes);
        taskActualMins += dur;
        taskRoundedMins += rounded;
        if (ent.units && ent.units > 0) {
          taskTotalUnits += ent.units;
        }
        if (ent.billing_review_status === 'agreed') {
          clientAgreedEntries += 1;
        }
      }

      clientTotalEntries += tg.entries.length;
      clientActualMins += taskActualMins;
      clientRoundedMins += taskRoundedMins;

      const taskActualHours = minutesToHours(taskActualMins);
      const taskRoundedHours = minutesToHours(taskRoundedMins);
      const taskRoundUpMins = Math.max(0, taskRoundedMins - taskActualMins);
      const taskRoundUpHours = Number(
        Math.max(0, taskRoundedHours - taskActualHours).toFixed(2)
      );

      const minChargeSuffix = minChargeMinutes > 0 ? ` [${minChargeMinutes}m Min]` : '';
      const ruleLabel =
        (roundingMinutes === 0
          ? isTaskOverride
            ? 'Exact (Task Override)'
            : 'Exact (No Rounding)'
          : isTaskOverride
          ? `Round UP ${roundingMinutes}m (Task Override)`
          : `Round UP ${roundingMinutes}m (Customer Rule)`) + minChargeSuffix;

      taskSummaries.push({
        taskId: tg.taskId,
        taskName: tg.taskName,
        taskCode: tg.taskCode,
        roundingMinutes,
        isTaskOverride,
        ruleLabel,
        actualMinutes: Number(taskActualMins.toFixed(1)),
        actualHours: taskActualHours,
        actualHoursFormatted: formatHours(taskActualHours),
        roundedMinutes: Number(taskRoundedMins.toFixed(1)),
        roundedHours: taskRoundedHours,
        roundedHoursFormatted: formatHours(taskRoundedHours),
        roundUpAddedMinutes: Number(taskRoundUpMins.toFixed(1)),
        roundUpAddedHours: taskRoundUpHours,
        roundUpAddedFormatted: formatHours(taskRoundUpHours),
        entryCount: tg.entries.length,
        totalUnits: taskTotalUnits,
        unitLabel: tg.unitLabel,
      });
    }

    // Sort tasks alphabetically by name
    taskSummaries.sort((a, b) => a.taskName.localeCompare(b.taskName));

    const totalActualHours = minutesToHours(clientActualMins);
    const totalRoundedHours = minutesToHours(clientRoundedMins);
    const totalRoundUpAddedMinutes = Math.max(
      0,
      clientRoundedMins - clientActualMins
    );
    const totalRoundUpAddedHours = Number(
      Math.max(0, totalRoundedHours - totalActualHours).toFixed(2)
    );
    const upliftPercent =
      clientActualMins > 0
        ? Number(
            ((totalRoundUpAddedMinutes / clientActualMins) * 100).toFixed(1)
          )
        : 0;

    // Reconciliation check: Actual + RoundUpAdded = Total Rounded
    const isReconciled =
      Math.abs(
        totalActualHours + totalRoundUpAddedHours - totalRoundedHours
      ) < 0.05;

    results.push({
      clientId: client.clientId,
      clientName: client.clientName,
      clientCode: client.clientCode,
      clientRoundingMinutes: client.clientRoundingMinutes,
      totalActualMinutes: Number(clientActualMins.toFixed(1)),
      totalActualHours,
      totalActualHoursFormatted: formatHours(totalActualHours),
      totalRoundedMinutes: Number(clientRoundedMins.toFixed(1)),
      totalRoundedHours,
      totalRoundedHoursFormatted: formatHours(totalRoundedHours),
      totalRoundUpAddedMinutes: Number(totalRoundUpAddedMinutes.toFixed(1)),
      totalRoundUpAddedHours,
      totalRoundUpAddedFormatted: formatHours(totalRoundUpAddedHours),
      upliftPercent,
      totalEntries: clientTotalEntries,
      taskSummaries,
      isReconciled,
      agreedEntriesCount: clientAgreedEntries,
      isAllAgreed:
        clientTotalEntries > 0 && clientAgreedEntries === clientTotalEntries,
    });
  }

  // Sort clients alphabetically
  results.sort((a, b) => a.clientName.localeCompare(b.clientName));
  return results;
}

export interface TargetEngineSummary {
  totalTasksAnalyzed: number;
  varianceAlertsCount: number;
  pendingApprovalsCount: number;
  bossingItClientsCount: number;
  learningClientsCount: number;
}

/**
 * Intelligent Target Variance & Recommendation Engine with Baseline Guardrails.
 *
 * Evaluates observed operative pace vs set target standards:
 * - Flags variances > 10% quicker or > 10% slower.
 * - Protects early ramp-up phases: locks suggestions until customer baseline is signed off ("bossing it")
 *   and statistically sufficient sample size (min runs, units, operatives) is established.
 * - Generates actionable target adjustment recommendations for manager and admin review.
 */
export function analyzeTaskTargetVariances(params: {
  taskTypes: TaskType[];
  entries: Array<{
    id?: string;
    task_type_id: string;
    client_id?: string | null;
    started_at: string | Date;
    ended_at: string | Date | null;
    units?: number | null;
    user_id?: string;
    user_name?: string;
  }>;
  clients: Client[];
  pendingRequests?: TargetChangeRequest[];
  minRunsThreshold?: number;
  minUnitsThreshold?: number;
  minOperativesThreshold?: number;
  varianceThresholdPercent?: number;
}): {
  tasks: TaskTargetAnalysis[];
  summary: TargetEngineSummary;
} {
  const {
    taskTypes,
    entries,
    clients,
    pendingRequests = [],
    minRunsThreshold = 10,
    minUnitsThreshold = 25,
    minOperativesThreshold = 2,
    varianceThresholdPercent = 10.0,
  } = params;

  const clientMap = new Map<string, Client>();
  for (const c of clients) {
    clientMap.set(c.id, c);
  }

  const pendingRequestMap = new Map<string, TargetChangeRequest>();
  for (const r of pendingRequests) {
    if (r.status === 'pending') {
      pendingRequestMap.set(r.task_type_id, r);
    }
  }

  // Group completed entries by task
  const entriesByTask = new Map<
    string,
    Array<{
      durationMinutes: number;
      units: number;
      userId: string;
      userName: string;
    }>
  >();

  for (const entry of entries) {
    if (!entry.ended_at) continue;
    const dur = getDurationMinutes(entry.started_at, entry.ended_at);
    if (dur <= 0) continue;

    const tid = entry.task_type_id;
    let list = entriesByTask.get(tid);
    if (!list) {
      list = [];
      entriesByTask.set(tid, list);
    }

    list.push({
      durationMinutes: dur,
      units: Number(entry.units) || 0,
      userId: entry.user_id ?? 'unknown',
      userName: entry.user_name ?? 'Operative',
    });
  }

  const tasks: TaskTargetAnalysis[] = [];

  for (const task of taskTypes) {
    const client = task.client_id ? clientMap.get(task.client_id) : undefined;
    const clientName = task.is_standard
      ? 'All Clients (Standard)'
      : client?.name ?? task.client_name ?? 'Unknown Client';
    const clientCode = task.is_standard
      ? 'STD'
      : client?.code ?? task.client_code ?? '—';

    // Customer Baseline Maturity
    const isCustomerBaselineApproved = task.is_standard
      ? true
      : Boolean(
          client?.baseline_approved ||
            client?.baseline_status === 'bossing_it' ||
            client?.baseline_status === 'established'
        );
    const customerBaselineStatus = task.is_standard
      ? 'bossing_it'
      : client?.baseline_status ?? 'learning';
    const managerCanDirectEdit = Boolean(client?.manager_target_delegated);

    // Task entry stats
    const taskEntries = entriesByTask.get(task.id) ?? [];
    const validRuns = taskEntries.filter((e) => e.units > 0);
    const sampleRunsCount = validRuns.length;
    const sampleUnitsCount = validRuns.reduce((sum, e) => sum + e.units, 0);
    const sampleMinutesTotal = validRuns.reduce(
      (sum, e) => sum + e.durationMinutes,
      0
    );
    const distinctOps = new Set(validRuns.map((e) => e.userId));
    const distinctOperativesCount = distinctOps.size;

    // Baseline sample checks
    const isTaskSampleSufficient =
      sampleRunsCount >= minRunsThreshold &&
      sampleUnitsCount >= minUnitsThreshold &&
      distinctOperativesCount >= minOperativesThreshold;
    const isBaselineEstablished =
      isCustomerBaselineApproved && isTaskSampleSufficient;

    // Observed Pace & Target
    const observedPace =
      sampleUnitsCount > 0
        ? Number((sampleMinutesTotal / sampleUnitsCount).toFixed(2))
        : null;
    const observedUnitsPerHour =
      observedPace && observedPace > 0
        ? Number((60 / observedPace).toFixed(1))
        : null;

    const currentStandardMinutes =
      task.standard_minutes !== null && task.standard_minutes !== undefined
        ? Number(task.standard_minutes)
        : null;
    const currentTargetUnitsPerHour =
      currentStandardMinutes && currentStandardMinutes > 0
        ? Number((60 / currentStandardMinutes).toFixed(1))
        : null;

    // Calculate Variance %
    let variancePercent: number | null = null;
    let direction: 'quicker' | 'slower' | 'on_target' | 'no_data' = 'no_data';
    let isVarianceSignificant = false;

    if (currentStandardMinutes !== null && observedPace !== null && currentStandardMinutes > 0) {
      // diff = standard - actual. Positive means less time taken (faster). Negative means more time taken (slower).
      const diff = currentStandardMinutes - observedPace;
      variancePercent = Number(((diff / currentStandardMinutes) * 100).toFixed(1));
      isVarianceSignificant = Math.abs(variancePercent) >= varianceThresholdPercent;

      if (variancePercent >= varianceThresholdPercent) {
        direction = 'quicker';
      } else if (variancePercent <= -varianceThresholdPercent) {
        direction = 'slower';
      } else {
        direction = 'on_target';
      }
    }

    // Baseline readiness text
    let baselineReadinessReason = '';
    if (!isCustomerBaselineApproved) {
      baselineReadinessReason =
        'Customer in ramp-up / learning phase. Admin baseline sign-off ("Bossing It") required before target recommendations unlock.';
    } else if (!isTaskSampleSufficient) {
      baselineReadinessReason = `Building baseline: ${sampleRunsCount}/${minRunsThreshold} runs, ${sampleUnitsCount}/${minUnitsThreshold} units, ${distinctOperativesCount}/${minOperativesThreshold} operatives. Target suggestions locked until baseline data is robust.`;
    } else {
      baselineReadinessReason = `Strong baseline established: ${sampleRunsCount} runs recorded across ${distinctOperativesCount} operatives (${sampleUnitsCount} total units).`;
    }

    // Recommendation logic
    let hasRecommendation = false;
    let suggestedStandardMinutes: number | null = null;
    let suggestedUnitsPerHour: number | null = null;
    let recommendationTitle: string | null = null;
    let recommendationDescription: string | null = null;
    let recommendationSeverity:
      | 'high'
      | 'medium'
      | 'healthy'
      | 'baseline_pending' = 'healthy';

    if (!isCustomerBaselineApproved) {
      recommendationSeverity = 'baseline_pending';
      recommendationTitle = 'Ramp-Up: Learning Together';
      recommendationDescription =
        'Operatives & management are dialing in processes for this customer. Recommendations unlock once Admin signs off that we are bossing it for this customer.';
    } else if (!isTaskSampleSufficient) {
      recommendationSeverity = 'baseline_pending';
      recommendationTitle = 'Baseline Collecting';
      recommendationDescription = `Need at least ${minRunsThreshold} runs and ${minOperativesThreshold} operatives to establish a fair target baseline. Currently at ${sampleRunsCount}/${minRunsThreshold} runs.`;
    } else if (isVarianceSignificant && observedPace !== null && currentStandardMinutes !== null) {
      hasRecommendation = true;
      suggestedStandardMinutes = observedPace;
      suggestedUnitsPerHour = observedUnitsPerHour;
      recommendationSeverity =
        Math.abs(variancePercent ?? 0) >= 25.0 ? 'high' : 'medium';

      if (direction === 'quicker') {
        const capacityDelta =
          suggestedUnitsPerHour && currentTargetUnitsPerHour
            ? Number((suggestedUnitsPerHour - currentTargetUnitsPerHour).toFixed(1))
            : null;
        recommendationTitle = `Tighten Target: Team Performing +${variancePercent}% Quicker`;
        recommendationDescription = `Team is consistently beating the ${currentStandardMinutes.toFixed(
          2
        )}m target, achieving ${observedPace.toFixed(
          2
        )} min/unit across ${sampleRunsCount} runs. Suggested target adjustment: tighten standard to ${suggestedStandardMinutes.toFixed(
          2
        )}m (${suggestedUnitsPerHour} units/hr${
          capacityDelta ? `, +${capacityDelta}/hr capacity gain` : ''
        }).`;
      } else {
        const capacityDelta =
          suggestedUnitsPerHour && currentTargetUnitsPerHour
            ? Number((currentTargetUnitsPerHour - suggestedUnitsPerHour).toFixed(1))
            : null;
        recommendationTitle = `Adjust Target: Team Performing ${variancePercent}% Slower`;
        recommendationDescription = `Team is averaging ${observedPace.toFixed(
          2
        )} min/unit across ${sampleRunsCount} runs vs the ${currentStandardMinutes.toFixed(
          2
        )}m target (${Math.abs(variancePercent ?? 0)}% variance). Recommended realistic target: ${suggestedStandardMinutes.toFixed(
          2
        )}m (${suggestedUnitsPerHour} units/hr${
          capacityDelta ? `, -${capacityDelta}/hr realistic expectation` : ''
        }).`;
      }
    } else if (observedPace !== null && currentStandardMinutes !== null) {
      recommendationSeverity = 'healthy';
      recommendationTitle = 'On Target (±10% Tolerance)';
      recommendationDescription = `Observed pace (${observedPace.toFixed(
        2
      )}m) aligns with the ${currentStandardMinutes.toFixed(
        2
      )}m target (${variancePercent && variancePercent > 0 ? '+' : ''}${variancePercent}%). No target adjustment needed.`;
    }

    const pendingReq = pendingRequestMap.get(task.id);

    tasks.push({
      taskTypeId: task.id,
      taskName: task.name,
      taskCode: task.code,
      category: task.category ?? 'Fulfilment',
      clientId: task.client_id,
      clientName,
      clientCode,
      unitLabel: task.unit_label,
      currentStandardMinutes,
      currentTargetUnitsPerHour,
      sampleRunsCount,
      sampleUnitsCount,
      sampleMinutesTotal: Number(sampleMinutesTotal.toFixed(1)),
      distinctOperativesCount,
      isCustomerBaselineApproved,
      customerBaselineStatus,
      isTaskSampleSufficient,
      isBaselineEstablished,
      baselineReadinessReason,
      baselineRunsProgress: Math.min(minRunsThreshold, sampleRunsCount),
      baselineRunsTarget: minRunsThreshold,
      observedPaceMinutesPerUnit: observedPace,
      observedUnitsPerHour,
      variancePercent,
      direction,
      isVarianceSignificant,
      hasRecommendation,
      suggestedStandardMinutes,
      suggestedUnitsPerHour,
      recommendationTitle,
      recommendationDescription,
      recommendationSeverity,
      pendingRequestId: pendingReq?.id,
      pendingRequest: pendingReq,
      managerCanDirectEdit,
    });
  }

  // Sort tasks: high recommendation severity first, then by variance magnitude
  tasks.sort((a, b) => {
    const sevRank = { high: 0, medium: 1, baseline_pending: 2, healthy: 3 };
    const diffSev = sevRank[a.recommendationSeverity] - sevRank[b.recommendationSeverity];
    if (diffSev !== 0) return diffSev;
    const aVar = Math.abs(a.variancePercent ?? 0);
    const bVar = Math.abs(b.variancePercent ?? 0);
    return bVar - aVar;
  });

  const totalTasksAnalyzed = tasks.length;
  const varianceAlertsCount = tasks.filter((t) => t.hasRecommendation).length;
  const pendingApprovalsCount = Array.from(pendingRequestMap.values()).length;
  const bossingItClientsCount = clients.filter(
    (c) =>
      c.baseline_approved ||
      c.baseline_status === 'bossing_it' ||
      c.baseline_status === 'established'
  ).length;
  const learningClientsCount = clients.length - bossingItClientsCount;

  return {
    tasks,
    summary: {
      totalTasksAnalyzed,
      varianceAlertsCount,
      pendingApprovalsCount,
      bossingItClientsCount,
      learningClientsCount,
    },
  };
}

