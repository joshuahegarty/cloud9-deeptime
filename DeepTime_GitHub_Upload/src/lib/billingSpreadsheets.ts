/**
 * Multi-Tab Excel Workbook (SpreadsheetML) and Multi-Section CSV Generators for Kay
 *
 * Produces native multi-tab workbooks (SpreadsheetML XML) that open in Microsoft Excel,
 * Google Sheets, and LibreOffice with real bottom tabs:
 * 1. "Client Summary & Round-Ups"
 * 2. "Task Breakdown by Client"
 * 3. "Detailed Line Items"
 * 4. "Our Cost & Justifications"
 */

import {
  ClientBillingSummary,
  formatHours,
  formatLondonTime,
  getDurationMinutes,
  resolveEffectiveRounding,
  roundDurationMinutes,
} from '@/lib/calculations';
import { TimeEntry } from '@/lib/types';

function escapeXml(str: string | null | undefined): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate native multi-tab Microsoft Excel XML workbook (.xls)
 */
export function generateMultiTabExcelWorkbook(params: {
  startDate: string;
  endDate: string;
  clientSummaries: ClientBillingSummary[];
  billableEntries: TimeEntry[];
  unbilledEntries: TimeEntry[];
}): string {
  const { startDate, endDate, clientSummaries, billableEntries, unbilledEntries } = params;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Title>Cloud9 Client Billing Extract &amp; Reconciliation</Title>
  <Subject>Billing Extract ${escapeXml(startDate)} to ${escapeXml(endDate)}</Subject>
  <Author>Cloud9 DeepTime</Author>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Borders/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#000000"/>
   <Interior/>
   <NumberFormat/>
   <Protection/>
  </Style>
  <Style ss:ID="Header">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="HeaderRight">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="HeaderGreen">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#047857" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="HeaderAmber">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#B45309" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="HeaderRose">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#FFFFFF" ss:Bold="1"/>
   <Interior ss:Color="#BE123C" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
  </Style>
  <Style ss:ID="Bold">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
  </Style>
  <Style ss:ID="Number2Dec">
   <NumberFormat ss:Format="0.00"/>
   <Alignment ss:Horizontal="Right"/>
  </Style>
  <Style ss:ID="NumberInt">
   <NumberFormat ss:Format="#,##0"/>
   <Alignment ss:Horizontal="Right"/>
  </Style>
  <Style ss:ID="Uplift">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#B45309" ss:Bold="1"/>
   <NumberFormat ss:Format="+0.00"/>
   <Alignment ss:Horizontal="Right"/>
  </Style>
  <Style ss:ID="TotalRow">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1"/>
   <Interior ss:Color="#E2E8F0" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1"/>
    <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="2"/>
   </Borders>
   <NumberFormat ss:Format="0.00"/>
   <Alignment ss:Horizontal="Right"/>
  </Style>
  <Style ss:ID="Justification">
   <Font ss:FontName="Calibri" ss:Size="10" ss:Italic="1" ss:Color="#9F1239"/>
   <Alignment ss:WrapText="1" ss:Vertical="Top"/>
  </Style>
 </Styles>
`;

  // ==========================================
  // TAB 1: Client Summary & Round-Ups
  // ==========================================
  xml += ` <Worksheet ss:Name="Client Summary">
  <Table>
   <Column ss:Width="100"/>
   <Column ss:Width="160"/>
   <Column ss:Width="120"/>
   <Column ss:Width="110"/>
   <Column ss:Width="100"/>
   <Column ss:Width="130"/>
   <Column ss:Width="120"/>
   <Column ss:Width="140"/>
   <Column ss:Width="140"/>
   <Column ss:Width="90"/>
   <Column ss:Width="90"/>
   <Column ss:Width="160"/>
   <Row ss:Height="26">
    <Cell ss:StyleID="Header"><Data ss:Type="String">Client Code</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Client Name</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Contract Rounding</Data></Cell>
    <Cell ss:StyleID="HeaderRight"><Data ss:Type="String">Actual Time (Mins)</Data></Cell>
    <Cell ss:StyleID="HeaderRight"><Data ss:Type="String">Actual Hours</Data></Cell>
    <Cell ss:StyleID="HeaderGreen"><Data ss:Type="String">Rounded Time (Mins)</Data></Cell>
    <Cell ss:StyleID="HeaderGreen"><Data ss:Type="String">Rounded Billable Hours</Data></Cell>
    <Cell ss:StyleID="HeaderAmber"><Data ss:Type="String">Round-Up Added (Mins)</Data></Cell>
    <Cell ss:StyleID="HeaderAmber"><Data ss:Type="String">Round-Up Added (Hours)</Data></Cell>
    <Cell ss:StyleID="HeaderRight"><Data ss:Type="String">Uplift %</Data></Cell>
    <Cell ss:StyleID="HeaderRight"><Data ss:Type="String">Tasks Count</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Reconciliation Check</Data></Cell>
   </Row>
`;

  let sumActualMins = 0;
  let sumActualHrs = 0;
  let sumRoundedMins = 0;
  let sumRoundedHrs = 0;
  let sumRoundUpMins = 0;
  let sumRoundUpHrs = 0;
  let sumEntries = 0;

  for (const cs of clientSummaries) {
    sumActualMins += cs.totalActualMinutes;
    sumActualHrs += cs.totalActualHours;
    sumRoundedMins += cs.totalRoundedMinutes;
    sumRoundedHrs += cs.totalRoundedHours;
    sumRoundUpMins += cs.totalRoundUpAddedMinutes;
    sumRoundUpHrs += cs.totalRoundUpAddedHours;
    sumEntries += cs.totalEntries;

    const roundRule =
      cs.clientRoundingMinutes > 0
        ? `Round UP ${cs.clientRoundingMinutes}m`
        : 'Exact (No Rounding)';

    xml += `   <Row ss:Height="20">
    <Cell ss:StyleID="Bold"><Data ss:Type="String">${escapeXml(cs.clientCode)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(cs.clientName)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(roundRule)}</Data></Cell>
    <Cell ss:StyleID="NumberInt"><Data ss:Type="Number">${Math.round(cs.totalActualMinutes)}</Data></Cell>
    <Cell ss:StyleID="Number2Dec"><Data ss:Type="Number">${cs.totalActualHours}</Data></Cell>
    <Cell ss:StyleID="NumberInt"><Data ss:Type="Number">${Math.round(cs.totalRoundedMinutes)}</Data></Cell>
    <Cell ss:StyleID="Number2Dec"><Data ss:Type="Number">${cs.totalRoundedHours}</Data></Cell>
    <Cell ss:StyleID="NumberInt"><Data ss:Type="Number">${Math.round(cs.totalRoundUpAddedMinutes)}</Data></Cell>
    <Cell ss:StyleID="Uplift"><Data ss:Type="Number">${cs.totalRoundUpAddedHours}</Data></Cell>
    <Cell ss:StyleID="Number2Dec"><Data ss:Type="Number">${cs.upliftPercent}</Data></Cell>
    <Cell ss:StyleID="NumberInt"><Data ss:Type="Number">${cs.totalEntries}</Data></Cell>
    <Cell><Data ss:Type="String">${cs.isReconciled ? 'BALANCED: Actual + Round-Up = Billed' : 'CHECK NEEDED'}</Data></Cell>
   </Row>
`;
  }

  // Grand Totals Row
  const totalUpliftPct = sumActualMins > 0 ? Number(((sumRoundUpMins / sumActualMins) * 100).toFixed(1)) : 0;
  xml += `   <Row ss:Height="24">
    <Cell ss:StyleID="TotalRow"><Data ss:Type="String">TOTAL</Data></Cell>
    <Cell ss:StyleID="TotalRow"><Data ss:Type="String">${clientSummaries.length} Clients</Data></Cell>
    <Cell ss:StyleID="TotalRow"><Data ss:Type="String">—</Data></Cell>
    <Cell ss:StyleID="TotalRow"><Data ss:Type="Number">${Math.round(sumActualMins)}</Data></Cell>
    <Cell ss:StyleID="TotalRow"><Data ss:Type="Number">${Number(sumActualHrs.toFixed(2))}</Data></Cell>
    <Cell ss:StyleID="TotalRow"><Data ss:Type="Number">${Math.round(sumRoundedMins)}</Data></Cell>
    <Cell ss:StyleID="TotalRow"><Data ss:Type="Number">${Number(sumRoundedHrs.toFixed(2))}</Data></Cell>
    <Cell ss:StyleID="TotalRow"><Data ss:Type="Number">${Math.round(sumRoundUpMins)}</Data></Cell>
    <Cell ss:StyleID="TotalRow"><Data ss:Type="Number">${Number(sumRoundUpHrs.toFixed(2))}</Data></Cell>
    <Cell ss:StyleID="TotalRow"><Data ss:Type="Number">${totalUpliftPct}</Data></Cell>
    <Cell ss:StyleID="TotalRow"><Data ss:Type="Number">${sumEntries}</Data></Cell>
    <Cell ss:StyleID="TotalRow"><Data ss:Type="String">ALL RECONCILED</Data></Cell>
   </Row>
  </Table>
 </Worksheet>
`;

  // ==========================================
  // TAB 2: Task Breakdown by Client
  // ==========================================
  xml += ` <Worksheet ss:Name="Task Breakdown">
  <Table>
   <Column ss:Width="160"/>
   <Column ss:Width="200"/>
   <Column ss:Width="100"/>
   <Column ss:Width="160"/>
   <Column ss:Width="100"/>
   <Column ss:Width="100"/>
   <Column ss:Width="120"/>
   <Column ss:Width="120"/>
   <Column ss:Width="130"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Row ss:Height="26">
    <Cell ss:StyleID="Header"><Data ss:Type="String">Client</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Task Name</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Task Code</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Rounding Rule Applied</Data></Cell>
    <Cell ss:StyleID="HeaderRight"><Data ss:Type="String">Actual Mins</Data></Cell>
    <Cell ss:StyleID="HeaderRight"><Data ss:Type="String">Actual Hours</Data></Cell>
    <Cell ss:StyleID="HeaderGreen"><Data ss:Type="String">Rounded Mins</Data></Cell>
    <Cell ss:StyleID="HeaderGreen"><Data ss:Type="String">Rounded Hours</Data></Cell>
    <Cell ss:StyleID="HeaderAmber"><Data ss:Type="String">Round-Up Added (Hrs)</Data></Cell>
    <Cell ss:StyleID="HeaderRight"><Data ss:Type="String">Units</Data></Cell>
    <Cell ss:StyleID="HeaderRight"><Data ss:Type="String">Entries</Data></Cell>
   </Row>
`;

  for (const cs of clientSummaries) {
    for (const ts of cs.taskSummaries) {
      xml += `   <Row ss:Height="19">
    <Cell ss:StyleID="Bold"><Data ss:Type="String">${escapeXml(cs.clientName)} (${escapeXml(cs.clientCode)})</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(ts.taskName)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(ts.taskCode)}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(ts.ruleLabel)}</Data></Cell>
    <Cell ss:StyleID="NumberInt"><Data ss:Type="Number">${Math.round(ts.actualMinutes)}</Data></Cell>
    <Cell ss:StyleID="Number2Dec"><Data ss:Type="Number">${ts.actualHours}</Data></Cell>
    <Cell ss:StyleID="NumberInt"><Data ss:Type="Number">${Math.round(ts.roundedMinutes)}</Data></Cell>
    <Cell ss:StyleID="Number2Dec"><Data ss:Type="Number">${ts.roundedHours}</Data></Cell>
    <Cell ss:StyleID="Uplift"><Data ss:Type="Number">${ts.roundUpAddedHours}</Data></Cell>
    <Cell ss:StyleID="NumberInt"><Data ss:Type="Number">${ts.totalUnits}</Data></Cell>
    <Cell ss:StyleID="NumberInt"><Data ss:Type="Number">${ts.entryCount}</Data></Cell>
   </Row>
`;
    }
  }

  xml += `  </Table>
 </Worksheet>
`;

  // ==========================================
  // TAB 3: Detailed Line Items
  // ==========================================
  xml += ` <Worksheet ss:Name="Detailed Line Items">
  <Table>
   <Column ss:Width="110"/>
   <Column ss:Width="130"/>
   <Column ss:Width="140"/>
   <Column ss:Width="180"/>
   <Column ss:Width="90"/>
   <Column ss:Width="80"/>
   <Column ss:Width="80"/>
   <Column ss:Width="140"/>
   <Column ss:Width="80"/>
   <Column ss:Width="90"/>
   <Column ss:Width="120"/>
   <Column ss:Width="100"/>
   <Row ss:Height="26">
    <Cell ss:StyleID="Header"><Data ss:Type="String">Date Time</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Operative</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Client</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Task</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Order Ref</Data></Cell>
    <Cell ss:StyleID="HeaderRight"><Data ss:Type="String">Actual Mins</Data></Cell>
    <Cell ss:StyleID="HeaderRight"><Data ss:Type="String">Actual Hrs</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">Rule</Data></Cell>
    <Cell ss:StyleID="HeaderGreen"><Data ss:Type="String">Billed Mins</Data></Cell>
    <Cell ss:StyleID="HeaderGreen"><Data ss:Type="String">Billed Hrs</Data></Cell>
    <Cell ss:StyleID="HeaderAmber"><Data ss:Type="String">Round-Up Added</Data></Cell>
    <Cell ss:StyleID="Header"><Data ss:Type="String">K Status</Data></Cell>
   </Row>
`;

  for (const e of billableEntries) {
    if (!e.ended_at) continue;
    const durMins = getDurationMinutes(e.started_at, e.ended_at);
    const { roundingMinutes } = resolveEffectiveRounding(
      e.task_rounding_minutes,
      e.client_rounding_minutes
    );
    const roundedMins = roundDurationMinutes(durMins, roundingMinutes);
    const actualHrs = Number((durMins / 60).toFixed(2));
    const roundedHrs = Number((roundedMins / 60).toFixed(2));
    const addedHrs = Number(Math.max(0, roundedHrs - actualHrs).toFixed(2));

    xml += `   <Row ss:Height="18">
    <Cell><Data ss:Type="String">${escapeXml(formatLondonTime(e.started_at))}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(e.user_name || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(e.client_name || '')} (${escapeXml(e.client_code || '')})</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(e.task_name || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(e.order_ref || '—')}</Data></Cell>
    <Cell ss:StyleID="NumberInt"><Data ss:Type="Number">${Math.round(durMins)}</Data></Cell>
    <Cell ss:StyleID="Number2Dec"><Data ss:Type="Number">${actualHrs}</Data></Cell>
    <Cell><Data ss:Type="String">${roundingMinutes > 0 ? `Round UP ${roundingMinutes}m` : 'Exact'}</Data></Cell>
    <Cell ss:StyleID="NumberInt"><Data ss:Type="Number">${Math.round(roundedMins)}</Data></Cell>
    <Cell ss:StyleID="Number2Dec"><Data ss:Type="Number">${roundedHrs}</Data></Cell>
    <Cell ss:StyleID="Uplift"><Data ss:Type="Number">${addedHrs}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(e.billing_review_status === 'agreed' ? 'Agreed' : 'Pending')}</Data></Cell>
   </Row>
`;
  }

  xml += `  </Table>
 </Worksheet>
`;

  // ==========================================
  // TAB 4: Our Cost & Justifications
  // ==========================================
  xml += ` <Worksheet ss:Name="Our Cost &amp; Justifications">
  <Table>
   <Column ss:Width="110"/>
   <Column ss:Width="130"/>
   <Column ss:Width="140"/>
   <Column ss:Width="160"/>
   <Column ss:Width="90"/>
   <Column ss:Width="90"/>
   <Column ss:Width="300"/>
   <Column ss:Width="120"/>
   <Row ss:Height="26">
    <Cell ss:StyleID="HeaderRose"><Data ss:Type="String">Date Time</Data></Cell>
    <Cell ss:StyleID="HeaderRose"><Data ss:Type="String">Operative</Data></Cell>
    <Cell ss:StyleID="HeaderRose"><Data ss:Type="String">Client</Data></Cell>
    <Cell ss:StyleID="HeaderRose"><Data ss:Type="String">Task</Data></Cell>
    <Cell ss:StyleID="HeaderRose"><Data ss:Type="String">Actual Hours</Data></Cell>
    <Cell ss:StyleID="HeaderRose"><Data ss:Type="String">Actual Mins</Data></Cell>
    <Cell ss:StyleID="HeaderRose"><Data ss:Type="String">Mandatory Unbilled Justification</Data></Cell>
    <Cell ss:StyleID="HeaderRose"><Data ss:Type="String">K Sign-Off Status</Data></Cell>
   </Row>
`;

  for (const e of unbilledEntries) {
    const durMins = e.ended_at ? getDurationMinutes(e.started_at, e.ended_at) : 0;
    const actualHrs = Number((durMins / 60).toFixed(2));

    xml += `   <Row ss:Height="30">
    <Cell><Data ss:Type="String">${escapeXml(formatLondonTime(e.started_at))}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(e.user_name || '')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(e.client_name || '')} (${escapeXml(e.client_code || '')})</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(e.task_name || '')}</Data></Cell>
    <Cell ss:StyleID="Number2Dec"><Data ss:Type="Number">${actualHrs}</Data></Cell>
    <Cell ss:StyleID="NumberInt"><Data ss:Type="Number">${Math.round(durMins)}</Data></Cell>
    <Cell ss:StyleID="Justification"><Data ss:Type="String">${escapeXml(e.unbilled_reason || 'No written justification provided.')}</Data></Cell>
    <Cell><Data ss:Type="String">${escapeXml(e.billing_review_status === 'agreed' ? 'Confirmed Absorbed' : 'Pending Review')}</Data></Cell>
   </Row>
`;
  }

  xml += `  </Table>
 </Worksheet>
</Workbook>`;

  return xml;
}

/**
 * Generate a multi-section structured CSV file with:
 * Section 1: Client Executive Summary with Round-up reconciliation
 * Section 2: Task Breakdown by Client
 * Section 3: Unbilled Justification Audits
 */
export function generateMultiSectionBillingCsv(params: {
  startDate: string;
  endDate: string;
  clientSummaries: ClientBillingSummary[];
  billableEntries?: TimeEntry[];
  unbilledEntries: TimeEntry[];
}): string {
  const { startDate, endDate, clientSummaries, unbilledEntries } = params;
  const lines: string[] = [];

  lines.push(`"CLOUD9 FULFILMENT - CLIENT BILLING SUMMARY & RECONCILIATION"`);
  lines.push(`"Billing Period: ${startDate} to ${endDate}"`);
  lines.push('');

  // SECTION 1: CLIENT EXECUTIVE SUMMARY
  lines.push(`"=== SECTION 1: CLIENT EXECUTIVE SUMMARY & ROUND-UP RECONCILIATION ==="`);
  lines.push(
    '"Client Code","Client Name","Contract Rounding","Actual Time (Mins)","Actual Hours","Rounded Billed (Mins)","Rounded Billable Hours","Round-Up Added (Mins)","Round-Up Added (Hours)","Uplift %","Total Tasks","Reconciliation Check"'
  );

  let sumActualMins = 0;
  let sumActualHrs = 0;
  let sumRoundedMins = 0;
  let sumRoundedHrs = 0;
  let sumRoundUpMins = 0;
  let sumRoundUpHrs = 0;
  let sumEntries = 0;

  for (const cs of clientSummaries) {
    sumActualMins += cs.totalActualMinutes;
    sumActualHrs += cs.totalActualHours;
    sumRoundedMins += cs.totalRoundedMinutes;
    sumRoundedHrs += cs.totalRoundedHours;
    sumRoundUpMins += cs.totalRoundUpAddedMinutes;
    sumRoundUpHrs += cs.totalRoundUpAddedHours;
    sumEntries += cs.totalEntries;

    const roundRule =
      cs.clientRoundingMinutes > 0
        ? `Round UP ${cs.clientRoundingMinutes}m`
        : 'Exact (No Rounding)';

    lines.push(
      `"${cs.clientCode}","${cs.clientName}","${roundRule}",${Math.round(
        cs.totalActualMinutes
      )},${cs.totalActualHoursFormatted},${Math.round(
        cs.totalRoundedMinutes
      )},${cs.totalRoundedHoursFormatted},${Math.round(
        cs.totalRoundUpAddedMinutes
      )},+${cs.totalRoundUpAddedFormatted},${cs.upliftPercent}%,${
        cs.totalEntries
      },"${cs.isReconciled ? 'BALANCED' : 'CHECK'}"`
    );
  }

  const totalUpliftPct =
    sumActualMins > 0
      ? Number(((sumRoundUpMins / sumActualMins) * 100).toFixed(1))
      : 0;

  lines.push(
    `"TOTAL","${clientSummaries.length} Clients","—",${Math.round(
      sumActualMins
    )},${sumActualHrs.toFixed(2)},${Math.round(
      sumRoundedMins
    )},${sumRoundedHrs.toFixed(2)},${Math.round(
      sumRoundUpMins
    )},+${sumRoundUpHrs.toFixed(2)},${totalUpliftPct}%,${sumEntries},"ALL BALANCED"`
  );
  lines.push('');

  // SECTION 2: TASK BREAKDOWN BY CLIENT
  lines.push(`"=== SECTION 2: TASK BREAKDOWN BY CLIENT ==="`);
  lines.push(
    '"Client","Task Name","Task Code","Rounding Rule Applied","Actual Mins","Actual Hours","Rounded Billed Mins","Rounded Billable Hours","Round-Up Added (Hours)","Units Handled","Entries"'
  );

  for (const cs of clientSummaries) {
    for (const ts of cs.taskSummaries) {
      lines.push(
        `"${cs.clientName} (${cs.clientCode})","${ts.taskName}","${
          ts.taskCode
        }","${ts.ruleLabel}",${Math.round(
          ts.actualMinutes
        )},${ts.actualHoursFormatted},${Math.round(
          ts.roundedMinutes
        )},${ts.roundedHoursFormatted},+${ts.roundUpAddedFormatted},${
          ts.totalUnits
        },${ts.entryCount}`
      );
    }
  }
  lines.push('');

  // SECTION 3: UNBILLED (OUR COST) AUDITS & JUSTIFICATIONS
  if (unbilledEntries.length > 0) {
    lines.push(`"=== SECTION 3: OUR COST & UNBILLED MANDATORY JUSTIFICATIONS AUDIT ==="`);
    lines.push(
      '"Date","Operative","Client","Task","Actual Hours","Actual Mins","Mandatory Unbilled Justification","K Sign-off Status"'
    );
    for (const e of unbilledEntries) {
      const durMins = e.ended_at ? getDurationMinutes(e.started_at, e.ended_at) : 0;
      const hrs = (durMins / 60).toFixed(2);
      lines.push(
        `"${formatLondonTime(e.started_at)}","${e.user_name || ''}","${
          e.client_name || ''
        } (${e.client_code || ''})","${e.task_name || ''} (${
          e.task_code || ''
        })",${hrs},${Math.round(durMins)},"${(
          e.unbilled_reason || 'No written justification provided'
        ).replace(/"/g, '""')}","${
          e.billing_review_status === 'agreed' ? 'Confirmed Absorbed' : 'Pending'
        }"`
      );
    }
  }

  return lines.join('\n');
}
