import { Resend } from 'resend';
import {
  calculateActualVsStandardPercent,
  formatHours,
  formatLondonTime,
  getDurationMinutes,
  getLondonDateString,
  minutesToHours,
} from './calculations';
import { withDbSession } from './db';
import { getEntriesForDate, getSettings } from './queries';

export interface DailySummaryResult {
  dateStr: string;
  subject: string;
  html: string;
  recipients: string[];
  sentViaResend: boolean;
  stats: {
    totalHours: string;
    clientCount: number;
    operativeCount: number;
    autoStoppedCount: number;
    autoClosedCount: number;
    idleOver60Count: number;
    belowTargetCount?: number;
    zeroProductivityCount?: number;
    pendingOurCostCount?: number;
  };
}

export async function buildAndSendDailySummary(
  dateStr: string = getLondonDateString(),
  sendEmail = true
): Promise<DailySummaryResult> {
  const settings = await getSettings(null);
  const { entries, attendance } = await getEntriesForDate(dateStr, null);

  // Filter entries that have ended (or compute up to now if still running)
  const nowIso = new Date().toISOString();

  let totalTaskMinutes = 0;
  const byClient = new Map<string, { name: string; code: string; minutes: number }>();
  const byOperative = new Map<
    string,
    { name: string; minutes: number; unitsByLabel: Map<string, number> }
  >();

  const belowTargetRuns: Array<{
    userName: string;
    clientCode: string;
    taskName: string;
    pacePct: number;
    units: number;
    unitLabel: string;
    mins: number;
  }> = [];

  const zeroProductivityRuns: Array<{
    userName: string;
    clientCode: string;
    taskName: string;
    mins: number;
  }> = [];

  const pendingOurCostRuns: Array<{
    userName: string;
    clientCode: string;
    taskName: string;
    reason: string;
    mins: number;
  }> = [];

  for (const entry of entries) {
    const endIso = entry.ended_at ?? nowIso;
    const mins = getDurationMinutes(entry.started_at, endIso);
    totalTaskMinutes += mins;

    const cKey = entry.client_id;
    const existingClient = byClient.get(cKey) ?? {
      name: entry.client_name ?? 'Client',
      code: entry.client_code ?? '',
      minutes: 0,
    };
    existingClient.minutes += mins;
    byClient.set(cKey, existingClient);

    const uKey = entry.user_id;
    const existingOp = byOperative.get(uKey) ?? {
      name: entry.user_name ?? 'Operative',
      minutes: 0,
      unitsByLabel: new Map<string, number>(),
    };
    existingOp.minutes += mins;
    if (entry.units && entry.units > 0) {
      const label = entry.unit_label || 'units';
      existingOp.unitsByLabel.set(label, (existingOp.unitsByLabel.get(label) ?? 0) + entry.units);
    }
    byOperative.set(uKey, existingOp);

    if (entry.ended_at && mins >= 1) {
      if ((entry.units === null || entry.units === undefined || entry.units <= 0) && entry.require_units_on_close !== false) {
        zeroProductivityRuns.push({
          userName: entry.user_name ?? 'Operative',
          clientCode: entry.client_code ?? '',
          taskName: entry.task_name ?? '',
          mins: Math.round(mins),
        });
      } else if (entry.standard_minutes && entry.standard_minutes > 0 && entry.units && entry.units > 0) {
        const pct = calculateActualVsStandardPercent({
          standardMinutes: entry.standard_minutes,
          unitLabel: entry.unit_label || 'units',
          actualMinutes: mins,
          units: entry.units,
        });
        if (pct !== null && pct < 95) {
          belowTargetRuns.push({
            userName: entry.user_name ?? 'Operative',
            clientCode: entry.client_code ?? '',
            taskName: entry.task_name ?? '',
            pacePct: pct,
            units: entry.units,
            unitLabel: entry.unit_label || 'units',
            mins: Math.round(mins),
          });
        }
      }
    }

    if (
      entry.billing_status === 'our_cost' &&
      (!entry.billing_review_status || entry.billing_review_status === 'pending')
    ) {
      pendingOurCostRuns.push({
        userName: entry.user_name ?? 'Operative',
        clientCode: entry.client_code ?? '',
        taskName: entry.task_name ?? '',
        reason: entry.unbilled_reason || 'Routine unbilled / awaiting supervisor sign-off',
        mins: Math.round(mins),
      });
    }
  }

  belowTargetRuns.sort((a, b) => a.pacePct - b.pacePct);

  // Auto-stopped time entries & auto-closed attendance needing review
  const autoStoppedEntries = entries.filter((e) => e.auto_stopped);
  const autoClosedAttendance = attendance.filter((a) => a.auto_closed && !a.reviewed);

  // Anyone clocked in with no task for over 60 minutes total on the day
  const attendanceMinutesByUser = new Map<string, { name: string; attendedMins: number }>();
  for (const att of attendance) {
    const endIso = att.clock_out ?? nowIso;
    const mins = getDurationMinutes(att.clock_in, endIso);
    const prev = attendanceMinutesByUser.get(att.user_id) ?? {
      name: att.user_name ?? 'Operative',
      attendedMins: 0,
    };
    prev.attendedMins += mins;
    attendanceMinutesByUser.set(att.user_id, prev);
  }

  // Also include anyone currently clocked in even if clock_in started slightly earlier
  const openAttRes = await withDbSession(null, async (tx) => {
    return tx.query<{ user_id: string; display_name: string; clock_in: string }>(
      `select a.user_id, u.display_name, a.clock_in::text
       from attendance a
       join users_public u on u.id = a.user_id
       where a.clock_out is null`
    );
  });
  for (const openRow of openAttRes.rows) {
    if (!attendanceMinutesByUser.has(openRow.user_id)) {
      attendanceMinutesByUser.set(openRow.user_id, {
        name: openRow.display_name,
        attendedMins: getDurationMinutes(openRow.clock_in, nowIso),
      });
    }
  }

  const idleOver60List: Array<{ name: string; untrackedMinutes: number }> = [];
  for (const [userId, attInfo] of Array.from(attendanceMinutesByUser.entries())) {
    const taskMins = byOperative.get(userId)?.minutes ?? 0;
    const untracked = Math.max(0, Math.round(attInfo.attendedMins - taskMins));
    if (untracked > 60) {
      idleOver60List.push({ name: attInfo.name, untrackedMinutes: untracked });
    }
  }

  const totalHoursStr = formatHours(minutesToHours(totalTaskMinutes));
  const clientRows = Array.from(byClient.values()).sort((a, b) => b.minutes - a.minutes);
  const operativeRows = Array.from(byOperative.values()).sort((a, b) => b.minutes - a.minutes);

  const html = `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cloud9 Fulfilment — Daily Task Summary (${dateStr})</title>
</head>
<body style="margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f8fafc;color:#0f172a;line-height:1.5;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:20px;">
    <h1 style="margin:0 0 4px 0;font-size:20px;color:#0f172a;">Cloud9 Fulfilment — Daily Summary</h1>
    <p style="margin:0 0 16px 0;font-size:14px;color:#475569;">Date: <strong>${dateStr}</strong> (${settings.timezone})</p>

    <div style="background:#0f172a;color:#ffffff;padding:14px 16px;border-radius:6px;margin-bottom:20px;">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;">Total Hours on Task</div>
      <div style="font-size:28px;font-weight:700;">${totalHoursStr} hrs</div>
    </div>

    <h2 style="font-size:16px;margin:0 0 8px 0;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">Hours by Client</h2>
    ${
      clientRows.length === 0
        ? '<p style="font-size:14px;color:#64748b;">No client hours recorded today.</p>'
        : `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
            <thead>
              <tr style="text-align:left;color:#475569;border-bottom:1px solid #e2e8f0;">
                <th style="padding:6px 4px;">Client</th>
                <th style="padding:6px 4px;text-align:right;">Hours</th>
              </tr>
            </thead>
            <tbody>
              ${clientRows
                .map(
                  (c) => `<tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:6px 4px;"><strong>${c.code}</strong> — ${c.name}</td>
                    <td style="padding:6px 4px;text-align:right;font-weight:600;">${formatHours(minutesToHours(c.minutes))}</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>`
    }

    <h2 style="font-size:16px;margin:0 0 8px 0;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">Hours by Operative</h2>
    ${
      operativeRows.length === 0
        ? '<p style="font-size:14px;color:#64748b;">No operative hours recorded today.</p>'
        : `<table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
            <thead>
              <tr style="text-align:left;color:#475569;border-bottom:1px solid #e2e8f0;">
                <th style="padding:6px 4px;">Operative</th>
                <th style="padding:6px 4px;">Units</th>
                <th style="padding:6px 4px;text-align:right;">Hours</th>
              </tr>
            </thead>
            <tbody>
              ${operativeRows
                .map((op) => {
                  const unitsSummary =
                    op.unitsByLabel.size > 0
                      ? Array.from(op.unitsByLabel.entries())
                          .map(([lbl, cnt]) => `${cnt} ${lbl}`)
                          .join(', ')
                      : '—';
                  return `<tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:6px 4px;font-weight:600;">${op.name}</td>
                    <td style="padding:6px 4px;color:#475569;">${unitsSummary}</td>
                    <td style="padding:6px 4px;text-align:right;font-weight:600;">${formatHours(minutesToHours(op.minutes))}</td>
                  </tr>`;
                })
                .join('')}
            </tbody>
          </table>`
    }

    <h2 style="font-size:16px;margin:0 0 8px 0;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">Auto-Stopped &amp; Auto-Closed Entries Needing Review</h2>
    ${
      autoStoppedEntries.length === 0 && autoClosedAttendance.length === 0
        ? '<p style="font-size:14px;color:#16a34a;">None — all entries and attendance closed cleanly.</p>'
        : `<ul style="font-size:14px;padding-left:18px;margin:0 0 20px 0;">
            ${autoStoppedEntries
              .map(
                (e) =>
                  `<li style="margin-bottom:4px;"><strong>${e.user_name}</strong> — ${e.client_code} / ${e.task_name} (${formatLondonTime(e.started_at)} to ${formatLondonTime(e.ended_at)}) [Auto-stopped]</li>`
              )
              .join('')}
            ${autoClosedAttendance
              .map(
                (a) =>
                  `<li style="margin-bottom:4px;"><strong>${a.user_name}</strong> — Shift clocked in ${formatLondonTime(a.clock_in)}, auto-closed at ${formatLondonTime(a.clock_out)} [Unreviewed attendance]</li>`
              )
              .join('')}
          </ul>`
    }

    <h2 style="font-size:16px;margin:0 0 8px 0;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">Clocked In With No Task (&gt; 60 mins total)</h2>
    ${
      idleOver60List.length === 0
        ? '<p style="font-size:14px;color:#16a34a;">No operatives exceeded 60 minutes of untracked time while clocked in.</p>'
        : `<ul style="font-size:14px;padding-left:18px;margin:0 0 20px 0;">
            ${idleOver60List
              .map(
                (item) =>
                  `<li style="margin-bottom:4px;"><strong>${item.name}</strong> — ${item.untrackedMinutes} mins clocked in without an active task (${formatHours(minutesToHours(item.untrackedMinutes))} hrs)</li>`
              )
              .join('')}
          </ul>`
    }

    <h2 style="font-size:16px;margin:16px 0 8px 0;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">Manager Action Points: Below-Target Runs (&lt; 95% Pace)</h2>
    ${
      belowTargetRuns.length === 0
        ? '<p style="font-size:14px;color:#16a34a;">All target-benchmarked runs met or exceeded 95% pace today.</p>'
        : `<ul style="font-size:14px;padding-left:18px;margin:0 0 20px 0;">
            ${belowTargetRuns
              .map(
                (r) =>
                  `<li style="margin-bottom:4px;color:#b91c1c;"><strong>${r.userName}</strong> — ${r.clientCode} / ${r.taskName}: <strong>${r.pacePct}% pace</strong> (${r.units} ${r.unitLabel} in ${r.mins}m)</li>`
              )
              .join('')}
          </ul>`
    }

    <h2 style="font-size:16px;margin:16px 0 8px 0;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">Zero-Productivity Runs &amp; Pending &ldquo;Our Cost&rdquo; Approvals</h2>
    ${
      zeroProductivityRuns.length === 0 && pendingOurCostRuns.length === 0
        ? '<p style="font-size:14px;color:#16a34a;">No zero-productivity runs or pending Our Cost approvals.</p>'
        : `<ul style="font-size:14px;padding-left:18px;margin:0;">
            ${zeroProductivityRuns
              .map(
                (z) =>
                  `<li style="margin-bottom:4px;color:#d97706;">[Zero Units] <strong>${z.userName}</strong> — ${z.clientCode} / ${z.taskName} (${z.mins}m with 0 units declared)</li>`
              )
              .join('')}
            ${pendingOurCostRuns
              .map(
                (c) =>
                  `<li style="margin-bottom:4px;color:#e11d48;">[Pending Our Cost] <strong>${c.userName}</strong> — ${c.clientCode} / ${c.taskName} (${c.mins}m · Reason: ${c.reason})</li>`
              )
              .join('')}
          </ul>`
    }
  </div>
</body>
</html>`;

  const subject = `Cloud9 Task Timer — Daily Summary (${dateStr})`;
  let sentViaResend = false;

  if (
    sendEmail &&
    process.env.RESEND_API_KEY &&
    settings.summary_recipients &&
    settings.summary_recipients.length > 0
  ) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'Cloud9 Task Timer <noreply@cloud9fulfilment.co.uk>',
        to: settings.summary_recipients,
        subject,
        html,
      });
      sentViaResend = true;
    } catch (err) {
      console.error('Resend delivery failed:', err);
    }
  }

  return {
    dateStr,
    subject,
    html,
    recipients: settings.summary_recipients,
    sentViaResend,
    stats: {
      totalHours: totalHoursStr,
      clientCount: clientRows.length,
      operativeCount: operativeRows.length,
      autoStoppedCount: autoStoppedEntries.length,
      autoClosedCount: autoClosedAttendance.length,
      idleOver60Count: idleOver60List.length,
      belowTargetCount: belowTargetRuns.length,
      zeroProductivityCount: zeroProductivityRuns.length,
      pendingOurCostCount: pendingOurCostRuns.length,
    },
  };
}
