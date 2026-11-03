'use client';

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Bug,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  FileSpreadsheet,
  GitBranch,
  HelpCircle,
  Layers,
  Network,
  Play,
  Printer,
  QrCode,
  Receipt,
  Settings,
  Share2,
  ShieldCheck,
  Sparkles,
  Tablet,
  Tv,
  Users,
  WifiOff,
} from 'lucide-react';
import React, { useState } from 'react';
import { VideoPodcastStudio } from './VideoPodcastStudio';

type GuideSection =
  | 'all'
  | 'podcast'
  | 'mindmap'
  | 'flowcharts'
  | 'manual'
  | 'playbooks'
  | 'cheatsheets'
  | 'faq';

export function GuideClient() {
  const [activeSection, setActiveSection] = useState<GuideSection>('all');
  const [copiedLink, setCopiedLink] = useState(false);

  const handlePrint = () => {
    setActiveSection('all');
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const handleCopyShareLink = () => {
    if (typeof window !== 'undefined') {
      const shareUrl = `${window.location.origin}/guide`;
      navigator.clipboard?.writeText(shareUrl).catch(() => {});
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const show = (sec: GuideSection) =>
    activeSection === 'all' || activeSection === sec;

  return (
    <div className="space-y-8 pb-16 print:space-y-6 print:pb-0">
      {/* Top Hero & Print Controls */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/60 border border-slate-800 p-6 sm:p-8 shadow-xl print:border-slate-300 print:bg-white print:text-slate-950 print:shadow-none space-y-5">
        <div className="space-y-2.5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-black uppercase tracking-wider print:border-emerald-700 print:text-emerald-800">
            <BookOpen className="w-3.5 h-3.5 shrink-0" />
            <span>Cloud9 3PL Warehouse Operations • Designed &amp; Architected by Josh</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight print:text-slate-950">
            DeepTime — Simple User Guide, Process Trees &amp; Studio Walkthrough
          </h1>
          <p className="text-sm text-slate-300 max-w-4xl leading-relaxed print:text-slate-700">
            Plain-English training guide, visual branching Process Trees, and a 7-minute natural neural voice walkthrough hosted with <strong>Josh (Designer &amp; Lead Architect)</strong>.
          </p>
        </div>

        {/* Download & Share Action Bar */}
        <div className="flex flex-wrap items-center gap-2.5 print:hidden">
          <a
            href="/Cloud9_DeepTime_Complete_Training_Guide.pdf"
            download="Cloud9_DeepTime_Complete_Training_Guide.pdf"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 transition"
          >
            <Download className="w-4 h-4" />
            Download PDF Manual (.PDF)
          </a>

          <a
            href="/Cloud9_DeepTime_Process_Tree.pdf"
            download="Cloud9_DeepTime_Process_Tree.pdf"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition"
          >
            <GitBranch className="w-4 h-4" />
            Download Process Tree Poster (.PDF)
          </a>

          <a
            href="/Cloud9_DeepTime_Interactive_Video_and_Guide.html"
            download="Cloud9_DeepTime_Interactive_Video_and_Guide.html"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs shadow-lg shadow-sky-500/20 transition"
          >
            <Download className="w-4 h-4" />
            Download Interactive Guide (.HTML)
          </a>

          <a
            href="/Cloud9_DeepTime_Shareable_Training_Pack.zip"
            download="Cloud9_DeepTime_Shareable_Training_Pack.zip"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-black text-xs transition"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            Download Full Pack (.ZIP)
          </a>

          <button
            type="button"
            onClick={handleCopyShareLink}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition"
          >
            <Share2 className="w-4 h-4 text-emerald-400" />
            {copiedLink ? 'Copied Link!' : 'Copy Link'}
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition"
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>

        {/* Section Filter Pills (Wrapped cleanly so nothing is cut off) */}
        <div className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-2 print:hidden">
          {(
            [
              { id: 'all', label: 'Show Full Pack (All Sections)', icon: Layers },
              { id: 'podcast', label: '🎥 Video & Podcast Deep-Dive', icon: Tv },
              { id: 'mindmap', label: '1. Visual Process Tree', icon: Network },
              { id: 'flowcharts', label: '2. Decision Process Trees', icon: GitBranch },
              { id: 'manual', label: '3. Simple Role Guide', icon: BookOpen },
              { id: 'playbooks', label: '4. Everyday Scenarios', icon: Play },
              { id: 'cheatsheets', label: '5. Printable Bench Cards', icon: Tablet },
              { id: 'faq', label: '6. Plain-English FAQ', icon: HelpCircle },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                  activeSection === tab.id
                    ? 'bg-emerald-500 text-slate-950 shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/70'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
          FEATURED: INTERACTIVE VIDEO & PODCAST WALKTHROUGH STUDIO
         ===================================================================== */}
      {show('podcast') && <VideoPodcastStudio />}

      {/* =====================================================================
          SECTION 1: VISUAL MASTER SYSTEM PROCESS TREE
         ===================================================================== */}
      {show('mindmap') && (
        <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 sm:p-8 space-y-6 print:border-slate-300 print:bg-white print:text-slate-950">
          <div className="flex items-center justify-between gap-4 border-b border-slate-800 pb-4 print:border-slate-300">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <Network className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400">
                  Section 1 of 6 • Branching Visual Process Tree
                </span>
                <h2 className="text-xl font-black text-white print:text-slate-950">
                  Master System Process Tree (Roles, Screens &amp; Daily Outcomes)
                </h2>
              </div>
            </div>
          </div>

          {/* True Left-to-Right Branching SVG Process Tree (Symmetrically Aligned 5 Lanes) */}
          <div className="rounded-2xl bg-slate-950 border border-slate-800 p-5 overflow-x-auto print:bg-slate-50 print:border-slate-300">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                Process Tree A: Left-to-Right Master System Process Tree
              </span>
              <span className="text-[11px] text-slate-400 font-semibold">
                Root Hub → 5 Role Branches → 13 Daily Actions
              </span>
            </div>
            <svg viewBox="0 0 1120 736" className="w-full h-auto min-w-[780px] block">
              <defs>
                <marker id="arr-em" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
                </marker>
                <marker id="arr-sky" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
                </marker>
                <marker id="arr-amb" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
                </marker>
                <marker id="arr-pur" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#a855f7" />
                </marker>
                <marker id="arr-ros" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#fb7185" />
                </marker>
              </defs>

              {/* Subtle Horizontal Lane Dividers */}
              <line x1="340" y1="182" x2="1105" y2="182" stroke="#1e293b" strokeWidth="1.5" strokeDasharray="6 6" />
              <line x1="340" y1="306" x2="1105" y2="306" stroke="#1e293b" strokeWidth="1.5" strokeDasharray="6 6" />
              <line x1="340" y1="482" x2="1105" y2="482" stroke="#1e293b" strokeWidth="1.5" strokeDasharray="6 6" />
              <line x1="340" y1="606" x2="1105" y2="606" stroke="#1e293b" strokeWidth="1.5" strokeDasharray="6 6" />

              {/* Root Node Centered at Y=394 */}
              <rect x="16" y="344" width="215" height="100" rx="16" fill="#065f46" stroke="#34d399" strokeWidth="2.5" />
              <text x="123" y="374" textAnchor="middle" fill="#a7f3d0" fontSize="10" fontWeight="800">ROOT PLATFORM HUB</text>
              <text x="123" y="397" textAnchor="middle" fill="#ffffff" fontSize="16" fontWeight="900">Cloud9 DeepTime</text>
              <text x="123" y="416" textAnchor="middle" fill="#d1fae5" fontSize="10" fontWeight="600">3PL Time &amp; Billing System</text>
              <text x="123" y="432" textAnchor="middle" fill="#6ee7b7" fontSize="9.5" fontWeight="700">Designed &amp; Architected by Josh</text>

              {/* Symmetric Curved Connectors: Root (Y=394) -> 5 Role Branches (Y=94, 244, 394, 544, 668) */}
              <path d="M 231 366 C 295 366, 285 94, 355 94" fill="none" stroke="#10b981" strokeWidth="2.5" markerEnd="url(#arr-em)" />
              <path d="M 231 380 C 290 380, 290 244, 355 244" fill="none" stroke="#38bdf8" strokeWidth="2.5" markerEnd="url(#arr-sky)" />
              <line x1="231" y1="394" x2="355" y2="394" stroke="#f59e0b" strokeWidth="2.5" markerEnd="url(#arr-amb)" />
              <path d="M 231 408 C 290 408, 290 544, 355 544" fill="none" stroke="#a855f7" strokeWidth="2.5" markerEnd="url(#arr-pur)" />
              <path d="M 231 422 C 295 422, 285 668, 355 668" fill="none" stroke="#fb7185" strokeWidth="2.5" markerEnd="url(#arr-ros)" />

              {/* LANE 1: Warehouse Operative (Centered at Y=94) */}
              <rect x="355" y="60" width="225" height="68" rx="12" fill="#0f172a" stroke="#10b981" strokeWidth="2" />
              <text x="467" y="82" textAnchor="middle" fill="#34d399" fontSize="10" fontWeight="800">BRANCH 1 • FLOOR STAFF</text>
              <text x="467" y="101" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="900">Warehouse Operative</text>
              <text x="467" y="117" textAnchor="middle" fill="#94a3b8" fontSize="10">Screens: /kiosk &amp; /now</text>

              <path d="M 580 78 C 630 78, 630 42, 680 42" fill="none" stroke="#10b981" strokeWidth="1.8" markerEnd="url(#arr-em)" />
              <line x1="580" y1="94" x2="680" y2="94" stroke="#10b981" strokeWidth="1.8" markerEnd="url(#arr-em)" />
              <path d="M 580 110 C 630 110, 630 146, 680 146" fill="none" stroke="#10b981" strokeWidth="1.8" markerEnd="url(#arr-em)" />

              <rect x="680" y="20" width="420" height="44" rx="9" fill="#064e3b" stroke="#10b981" strokeWidth="1.5" />
              <text x="696" y="39" fill="#ffffff" fontSize="11.5" fontWeight="800">1A. Shared Tablet Kiosk (/kiosk)</text>
              <text x="696" y="54" fill="#a7f3d0" fontSize="10">Tap your name card → clocks in automatically → returns to Kiosk in 1.5s</text>

              <rect x="680" y="72" width="420" height="44" rx="9" fill="#064e3b" stroke="#10b981" strokeWidth="1.5" />
              <text x="696" y="91" fill="#ffffff" fontSize="11.5" fontWeight="800">1B. Start Job: #1 Default Standard Order Pick, Goods-In (Cont/Pal/Box) or Scan</text>
              <text x="696" y="106" fill="#a7f3d0" fontSize="10">Top Quick Bar (Assigned/Recent/Favs), Goods-In Sub-Buttons, Projects &amp; Internal Housekeeping</text>

              <rect x="680" y="124" width="420" height="44" rx="9" fill="#064e3b" stroke="#10b981" strokeWidth="1.5" />
              <text x="696" y="143" fill="#ffffff" fontSize="11.5" fontWeight="800">1C. Live Tally (+1/+5/+10), Wrong-Task Swap &amp; Smart Close Prompt</text>
              <text x="696" y="158" fill="#a7f3d0" fontSize="10">Standard Pick/Pack closes optionally; Bespoke/Goods-In/Pallet tasks prompt for units</text>

              {/* LANE 2: Floor Supervisor (Centered at Y=244) */}
              <rect x="355" y="210" width="225" height="68" rx="12" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
              <text x="467" y="232" textAnchor="middle" fill="#38bdf8" fontSize="10" fontWeight="800">BRANCH 2 • TEAM CONTROL</text>
              <text x="467" y="251" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="900">Floor Supervisor</text>
              <text x="467" y="267" textAnchor="middle" fill="#94a3b8" fontSize="10">Screens: /floor &amp; /entries</text>

              <path d="M 580 232 C 630 232, 630 218, 680 218" fill="none" stroke="#38bdf8" strokeWidth="1.8" markerEnd="url(#arr-sky)" />
              <path d="M 580 256 C 630 256, 630 270, 680 270" fill="none" stroke="#38bdf8" strokeWidth="1.8" markerEnd="url(#arr-sky)" />

              <rect x="680" y="196" width="420" height="44" rx="9" fill="#0c4a6e" stroke="#38bdf8" strokeWidth="1.5" />
              <text x="696" y="215" fill="#ffffff" fontSize="11.5" fontWeight="800">2A. Live Floor, Task Assignment, Open Pool &amp; Zone Heatmap (/floor)</text>
              <text x="696" y="230" fill="#bae6fd" fontSize="10">15m/30m Idle Alerts, Our Cost Approval Queue, Crew Stop Qty &amp; Travel Heatmap</text>

              <rect x="680" y="248" width="420" height="44" rx="9" fill="#0c4a6e" stroke="#38bdf8" strokeWidth="1.5" />
              <text x="696" y="267" fill="#ffffff" fontSize="11.5" fontWeight="800">2B. Timesheet Edits, Urgent Below-Target Filter &amp; 19:00 Auto-Close (/entries)</text>
              <text x="696" y="282" fill="#bae6fd" fontSize="10">Helm WMS Order Sync, Zero-Productivity Alerts &amp; 19:00 Auto Shift-End Logout</text>

              {/* LANE 3: Billing & Finance (Centered at Y=394) */}
              <rect x="355" y="360" width="225" height="68" rx="12" fill="#0f172a" stroke="#f59e0b" strokeWidth="2" />
              <text x="467" y="382" textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="800">BRANCH 3 • COMMERCIAL</text>
              <text x="467" y="401" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="900">Billing &amp; Finance</text>
              <text x="467" y="417" textAnchor="middle" fill="#94a3b8" fontSize="10">Screens: /entries &amp; /reports</text>

              <path d="M 580 378 C 630 378, 630 342, 680 342" fill="none" stroke="#f59e0b" strokeWidth="1.8" markerEnd="url(#arr-amb)" />
              <line x1="580" y1="394" x2="680" y2="394" stroke="#f59e0b" strokeWidth="1.8" markerEnd="url(#arr-amb)" />
              <path d="M 580 410 C 630 410, 630 446, 680 446" fill="none" stroke="#f59e0b" strokeWidth="1.8" markerEnd="url(#arr-amb)" />

              <rect x="680" y="320" width="420" height="44" rx="9" fill="#78350f" stroke="#f59e0b" strokeWidth="1.5" />
              <text x="696" y="339" fill="#ffffff" fontSize="11.5" fontWeight="800">3A. 3-Tier Billing &amp; Mandatory Unbill Protection</text>
              <text x="696" y="354" fill="#fde68a" fontSize="10">Auto Billed • Needs Billed (Agree/Dispute) • Our Cost (Requires Reason)</text>

              <rect x="680" y="372" width="420" height="44" rx="9" fill="#78350f" stroke="#f59e0b" strokeWidth="1.5" />
              <text x="696" y="391" fill="#ffffff" fontSize="11.5" fontWeight="800">3B. Upward Billing Rounding &amp; Margin Reports (/reports)</text>
              <text x="696" y="406" fill="#fde68a" fontSize="10">Rounds client time up (5m/6m/15m/30m/60m) while keeping exact payroll time</text>

              <rect x="680" y="424" width="420" height="44" rx="9" fill="#78350f" stroke="#f59e0b" strokeWidth="1.5" />
              <text x="696" y="443" fill="#ffffff" fontSize="11.5" fontWeight="800">3C. 1-Click Excel &amp; CSV Client Invoice Sheets (/reports/billing)</text>
              <text x="696" y="458" fill="#fde68a" fontSize="10">Export Task Summary, Itemised Audit Log, Daily Matrix, or PO Breakdown</text>

              {/* LANE 4: Admin & Governance (Centered at Y=544) */}
              <rect x="355" y="510" width="225" height="68" rx="12" fill="#0f172a" stroke="#a855f7" strokeWidth="2" />
              <text x="467" y="532" textAnchor="middle" fill="#c084fc" fontSize="10" fontWeight="800">BRANCH 4 • GOVERNANCE</text>
              <text x="467" y="551" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="900">Setup &amp; Smart Targets</text>
              <text x="467" y="567" textAnchor="middle" fill="#94a3b8" fontSize="10">Screens: /setup/*</text>

              <path d="M 580 532 C 630 532, 630 518, 680 518" fill="none" stroke="#a855f7" strokeWidth="1.8" markerEnd="url(#arr-pur)" />
              <path d="M 580 556 C 630 556, 630 570, 680 570" fill="none" stroke="#a855f7" strokeWidth="1.8" markerEnd="url(#arr-pur)" />

              <rect x="680" y="496" width="420" height="44" rx="9" fill="#4c1d95" stroke="#a855f7" strokeWidth="1.5" />
              <text x="696" y="515" fill="#ffffff" fontSize="11.5" fontWeight="800">4A. Clients, Tasks, Users &amp; Printable Bench Barcodes</text>
              <text x="696" y="530" fill="#e9d5ff" fontSize="10">Set client billing rules, customer maturity stages &amp; print barcode sheets</text>

              <rect x="680" y="548" width="420" height="44" rx="9" fill="#4c1d95" stroke="#a855f7" strokeWidth="1.5" />
              <text x="696" y="567" fill="#ffffff" fontSize="11.5" fontWeight="800">4B. Smart Target Variance &amp; 2-Step Approval (/setup/targets)</text>
              <text x="696" y="582" fill="#e9d5ff" fontSize="10">Unlocks after 10 runs, 30 mins &amp; 2 staff → Manager requests → Admin approves</text>

              {/* LANE 5: Safety & F8 (Centered at Y=668) */}
              <rect x="355" y="634" width="225" height="68" rx="12" fill="#0f172a" stroke="#fb7185" strokeWidth="2" />
              <text x="467" y="656" textAnchor="middle" fill="#fda4af" fontSize="10" fontWeight="800">BRANCH 5 • ALWAYS-ON</text>
              <text x="467" y="675" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="900">Safety Nets &amp; Global F8</text>
              <text x="467" y="691" textAnchor="middle" fill="#94a3b8" fontSize="10">Works Across Every Screen</text>

              <path d="M 580 656 C 630 656, 630 642, 680 642" fill="none" stroke="#fb7185" strokeWidth="1.8" markerEnd="url(#arr-ros)" />
              <path d="M 580 680 C 630 680, 630 694, 680 694" fill="none" stroke="#fb7185" strokeWidth="1.8" markerEnd="url(#arr-ros)" />

              <rect x="680" y="620" width="420" height="44" rx="9" fill="#881337" stroke="#fb7185" strokeWidth="1.5" />
              <text x="696" y="639" fill="#ffffff" fontSize="11.5" fontWeight="800">5A. Idle Timer Protection &amp; Wi-Fi Dead-Zone Queue</text>
              <text x="696" y="654" fill="#fecdd3" fontSize="10">60m check-in prompt, 120m retroactive auto-stop &amp; automatic offline sync</text>

              <rect x="680" y="672" width="420" height="44" rx="9" fill="#881337" stroke="#fb7185" strokeWidth="1.5" />
              <text x="696" y="691" fill="#ffffff" fontSize="11.5" fontWeight="800">5B. Press F8 Anywhere: Instant Bug Report or Idea</text>
              <text x="696" y="706" fill="#fecdd3" fontSize="10">Captures screen &amp; user automatically → tracked from Open to Resolved</text>
            </svg>
          </div>
        </section>
      )}

      {/* =====================================================================
          SECTION 2: VISUAL OPERATIONAL DECISION PROCESS TREES
         ===================================================================== */}
      {show('flowcharts') && (
        <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 sm:p-8 space-y-6 print:border-slate-300 print:bg-white print:text-slate-950">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4 print:border-slate-300">
            <div className="w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-sky-400">
                Section 2 of 6 • Step-by-Step Decision Process Trees
              </span>
              <h2 className="text-xl font-black text-white print:text-slate-950">
                Visual Decision Process Trees (Operative Flow, Billing &amp; Targets)
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Process Tree B: Top-to-Bottom Operative Decision Tree */}
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-5 space-y-3 overflow-x-auto print:bg-slate-50 print:border-slate-300">
              <h3 className="text-sm font-black uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Process Tree B: Operative Shift &amp; Task Decision Tree
              </h3>
              <svg viewBox="0 0 540 500" className="w-full h-auto min-w-[440px] block">
                {/* Start */}
                <rect x="170" y="12" width="200" height="40" rx="20" fill="#065f46" stroke="#10b981" strokeWidth="2" />
                <text x="270" y="36" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="900">Operative Arrives for Shift</text>

                <line x1="270" y1="52" x2="270" y2="75" stroke="#10b981" strokeWidth="2" />

                {/* Diamond: Which Device? */}
                <polygon points="270,75 365,110 270,145 175,110" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
                <text x="270" y="107" textAnchor="middle" fill="#38bdf8" fontSize="10" fontWeight="800">DECISION</text>
                <text x="270" y="121" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="800">Which Device?</text>

                <path d="M 175 110 L 115 110 L 115 155" fill="none" stroke="#10b981" strokeWidth="2" />
                <path d="M 365 110 L 425 110 L 425 155" fill="none" stroke="#38bdf8" strokeWidth="2" />

                <rect x="25" y="155" width="180" height="48" rx="10" fill="#064e3b" stroke="#10b981" strokeWidth="1.5" />
                <text x="115" y="175" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="800">Shared Tablet (/kiosk)</text>
                <text x="115" y="191" textAnchor="middle" fill="#a7f3d0" fontSize="9.5">Tap Name Card → Auto Clock-In</text>

                <rect x="335" y="155" width="180" height="48" rx="10" fill="#0c4a6e" stroke="#38bdf8" strokeWidth="1.5" />
                <text x="425" y="175" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="800">Personal Handheld (/login)</text>
                <text x="425" y="191" textAnchor="middle" fill="#bae6fd" fontSize="9.5">Enter 4-Digit PIN → Tap Clock In</text>

                <path d="M 115 203 L 115 225 L 270 225 L 270 242" fill="none" stroke="#94a3b8" strokeWidth="2" />
                <path d="M 425 203 L 425 225 L 270 225" fill="none" stroke="#94a3b8" strokeWidth="2" />

                {/* Diamond: How to Start Task? */}
                <polygon points="270,242 385,278 270,314 155,278" fill="#0f172a" stroke="#f59e0b" strokeWidth="2" />
                <text x="270" y="274" textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="800">HOW DO YOU START?</text>
                <text x="270" y="289" textAnchor="middle" fill="#ffffff" fontSize="10.5" fontWeight="800">4 Ways on /now</text>

                <line x1="70" y1="314" x2="470" y2="314" stroke="#64748b" strokeWidth="1.5" />
                <line x1="70" y1="314" x2="70" y2="334" stroke="#10b981" strokeWidth="1.8" />
                <line x1="203" y1="314" x2="203" y2="334" stroke="#38bdf8" strokeWidth="1.8" />
                <line x1="336" y1="314" x2="336" y2="334" stroke="#a855f7" strokeWidth="1.8" />
                <line x1="470" y1="314" x2="470" y2="334" stroke="#f59e0b" strokeWidth="1.8" />

                <rect x="12" y="334" width="116" height="46" rx="8" fill="#0f172a" stroke="#10b981" strokeWidth="1.5" />
                <text x="70" y="354" textAnchor="middle" fill="#34d399" fontSize="10" fontWeight="800">1. 3D Reel Wheel</text>
                <text x="70" y="369" textAnchor="middle" fill="#cbd5e1" fontSize="9">Spin Client &amp; Task</text>

                <rect x="145" y="334" width="116" height="46" rx="8" fill="#0f172a" stroke="#38bdf8" strokeWidth="1.5" />
                <text x="203" y="354" textAnchor="middle" fill="#38bdf8" fontSize="10" fontWeight="800">2. Scan Barcode</text>
                <text x="203" y="369" textAnchor="middle" fill="#cbd5e1" fontSize="9">Scan Bench Sheet</text>

                <rect x="278" y="334" width="116" height="46" rx="8" fill="#0f172a" stroke="#a855f7" strokeWidth="1.5" />
                <text x="336" y="354" textAnchor="middle" fill="#c084fc" fontSize="10" fontWeight="800">3. Recent Chip</text>
                <text x="336" y="369" textAnchor="middle" fill="#cbd5e1" fontSize="9">1-Tap Resume</text>

                <rect x="412" y="334" width="116" height="46" rx="8" fill="#0f172a" stroke="#f59e0b" strokeWidth="1.5" />
                <text x="470" y="354" textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="800">4. Custom Task</text>
                <text x="470" y="369" textAnchor="middle" fill="#cbd5e1" fontSize="9">&quot;Task Not Listed&quot;</text>

                <line x1="70" y1="380" x2="70" y2="398" stroke="#64748b" strokeWidth="1.5" />
                <line x1="203" y1="380" x2="203" y2="398" stroke="#64748b" strokeWidth="1.5" />
                <line x1="336" y1="380" x2="336" y2="398" stroke="#64748b" strokeWidth="1.5" />
                <line x1="470" y1="380" x2="470" y2="398" stroke="#64748b" strokeWidth="1.5" />
                <line x1="70" y1="398" x2="470" y2="398" stroke="#64748b" strokeWidth="1.5" />
                <line x1="270" y1="398" x2="270" y2="418" stroke="#f59e0b" strokeWidth="2.2" />

                {/* Mandatory Units Prompt */}
                <rect x="45" y="418" width="450" height="66" rx="12" fill="#78350f" stroke="#fbbf24" strokeWidth="2.2" />
                <text x="270" y="440" textAnchor="middle" fill="#fde68a" fontSize="10.5" fontWeight="900">WHEN TASK CLOSES (STOP, SWITCH, CLOCK OUT, OR SUPERVISOR STOP)</text>
                <text x="270" y="459" textAnchor="middle" fill="#ffffff" fontSize="13" fontWeight="900">Mandatory Prompt: &quot;How many units completed?&quot;</text>
                <text x="270" y="475" textAnchor="middle" fill="#fef3c7" fontSize="10" fontWeight="700">Applies to BOTH General Standard Tasks AND Custom (&quot;Task Not Listed&quot;) Tasks</text>
              </svg>
            </div>

            {/* Process Tree C: Commercial Billing Decision Tree */}
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-5 space-y-3 overflow-x-auto print:bg-slate-50 print:border-slate-300">
              <h3 className="text-sm font-black uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <Receipt className="w-4 h-4" />
                Process Tree C: 3-Tier Commercial Billing Decision Tree
              </h3>
              <svg viewBox="0 0 540 500" className="w-full h-auto min-w-[440px] block">
                <rect x="145" y="12" width="250" height="44" rx="12" fill="#0f172a" stroke="#38bdf8" strokeWidth="2" />
                <text x="270" y="32" textAnchor="middle" fill="#ffffff" fontSize="12" fontWeight="900">Time Entry &amp; Units Saved</text>
                <text x="270" y="47" textAnchor="middle" fill="#94a3b8" fontSize="9.5">Inherits default billing tier from Task</text>

                <line x1="270" y1="56" x2="270" y2="82" stroke="#38bdf8" strokeWidth="2" />

                {/* Decision Diamond */}
                <polygon points="270,82 390,122 270,162 150,122" fill="#0f172a" stroke="#f59e0b" strokeWidth="2" />
                <text x="270" y="118" textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="800">BILLING TIER?</text>
                <text x="270" y="133" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="800">3 Commercial Paths</text>

                <path d="M 150 122 L 90 122 L 90 185" fill="none" stroke="#10b981" strokeWidth="2" />
                <line x1="270" y1="162" x2="270" y2="185" stroke="#f59e0b" strokeWidth="2" />
                <path d="M 390 122 L 450 122 L 450 185" fill="none" stroke="#fb7185" strokeWidth="2" />

                {/* Tier 1: Auto Billed */}
                <rect x="14" y="185" width="152" height="95" rx="10" fill="#064e3b" stroke="#10b981" strokeWidth="1.8" />
                <text x="90" y="207" textAnchor="middle" fill="#6ee7b7" fontSize="10" fontWeight="900">1. AUTO BILLED</text>
                <text x="90" y="225" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="800">Standard Contract</text>
                <text x="90" y="243" textAnchor="middle" fill="#d1fae5" fontSize="9.5">Covered by WMS</text>
                <text x="90" y="257" textAnchor="middle" fill="#d1fae5" fontSize="9.5">pick/pack contract</text>

                {/* Tier 2: Needs Billed */}
                <rect x="194" y="185" width="152" height="95" rx="10" fill="#78350f" stroke="#f59e0b" strokeWidth="1.8" />
                <text x="270" y="207" textAnchor="middle" fill="#fde68a" fontSize="10" fontWeight="900">2. NEEDS BILLED</text>
                <text x="270" y="225" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="800">Ad-Hoc / Rework</text>
                <text x="270" y="243" textAnchor="middle" fill="#fef3c7" fontSize="9.5">Queues in Billing Hub</text>
                <text x="270" y="257" textAnchor="middle" fill="#fef3c7" fontSize="9.5">Click Agree / Dispute</text>

                {/* Tier 3: Our Cost */}
                <rect x="374" y="185" width="152" height="95" rx="10" fill="#881337" stroke="#fb7185" strokeWidth="1.8" />
                <text x="450" y="207" textAnchor="middle" fill="#fda4af" fontSize="10" fontWeight="900">3. OUR COST</text>
                <text x="450" y="225" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="800">Internal Overhead</text>
                <text x="450" y="243" textAnchor="middle" fill="#fecdd3" fontSize="9.5">Downgrades require</text>
                <text x="450" y="257" textAnchor="middle" fill="#fecdd3" fontSize="9.5">Mandatory Reason</text>

                <line x1="90" y1="280" x2="90" y2="325" stroke="#10b981" strokeWidth="2" />
                <line x1="270" y1="280" x2="270" y2="325" stroke="#f59e0b" strokeWidth="2" />
                <line x1="450" y1="280" x2="450" y2="325" stroke="#fb7185" strokeWidth="2" />

                {/* Upward Rounding Engine */}
                <rect x="14" y="325" width="332" height="68" rx="10" fill="#0f172a" stroke="#10b981" strokeWidth="1.8" />
                <text x="180" y="348" textAnchor="middle" fill="#34d399" fontSize="11" fontWeight="900">Upward Client Rounding Rule Applied</text>
                <text x="180" y="365" textAnchor="middle" fill="#ffffff" fontSize="10.5" fontWeight="700">Rounds billable time UP (5m, 6m, 15m, 30m, or 60m)</text>
                <text x="180" y="381" textAnchor="middle" fill="#94a3b8" fontSize="9.5">Example: 17 mins worked on a 15m rule → Billed as 30 mins</text>

                <rect x="374" y="325" width="152" height="68" rx="10" fill="#0f172a" stroke="#fb7185" strokeWidth="1.8" />
                <text x="450" y="348" textAnchor="middle" fill="#fda4af" fontSize="10.5" fontWeight="900">Excluded from Invoice</text>
                <text x="450" y="365" textAnchor="middle" fill="#cbd5e1" fontSize="9.5">Kept in staff pace &amp;</text>
                <text x="450" y="380" textAnchor="middle" fill="#cbd5e1" fontSize="9.5">audit history only</text>

                <line x1="180" y1="393" x2="180" y2="420" stroke="#10b981" strokeWidth="2" />

                <rect x="14" y="420" width="512" height="64" rx="12" fill="#065f46" stroke="#34d399" strokeWidth="2" />
                <text x="270" y="443" textAnchor="middle" fill="#a7f3d0" fontSize="10.5" fontWeight="900">READY FOR CLIENT INVOICING (/reports/billing)</text>
                <text x="270" y="462" textAnchor="middle" fill="#ffffff" fontSize="12.5" fontWeight="900">1-Click Excel (.xlsx) &amp; CSV Backing Sheets in 4 Formats</text>
                <text x="270" y="477" textAnchor="middle" fill="#d1fae5" fontSize="10">1. Summary by Task • 2. Itemised Log • 3. Daily Matrix • 4. Order / PO Breakdown</text>
              </svg>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          SECTION 3: COMPLETE ROLE-BY-ROLE TRAINING MANUAL
         ===================================================================== */}
      {show('manual') && (
        <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 sm:p-8 space-y-6 print:border-slate-300 print:bg-white print:text-slate-950">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4 print:border-slate-300">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-400">
                Section 3 of 6 • Deep-Dive Curriculum
              </span>
              <h2 className="text-xl font-black text-white print:text-slate-950">
                Role-by-Role Training Manual &amp; Demo Credentials
              </h2>
            </div>
          </div>

          {/* Cloud9 Team Directory & Credentials Table */}
          <div className="overflow-x-auto rounded-xl border border-slate-800 print:border-slate-300">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-300 uppercase text-[11px] font-black print:bg-slate-100 print:text-slate-800">
                <tr>
                  <th className="py-3 px-4">Access Role</th>
                  <th className="py-3 px-4">Team Member</th>
                  <th className="py-3 px-4">Role Tag / Job Title</th>
                  <th className="py-3 px-4">Team / Department</th>
                  <th className="py-3 px-4">4-Digit PIN</th>
                  <th className="py-3 px-4">Staff Email &amp; Password</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900/60 print:bg-white print:divide-slate-200">
                {[
                  { access: 'Admin', color: 'text-amber-400', name: '👑 Josh', title: 'CEO, Builder & Admin', team: 'Executive & Leadership', core: false, pin: '9999', email: 'josh@cloud9fulfilment.co.uk (password123)' },
                  { access: 'Supervisor', color: 'text-sky-400', name: '⭐ Mark', title: 'Warehouse Supervisor', team: 'Core Warehouse Team', core: true, pin: '4444', email: 'mark@cloud9fulfilment.co.uk (password123)' },
                  { access: 'Supervisor', color: 'text-sky-400', name: '⭐ Edna', title: 'Warehouse Supervisor', team: 'Core Warehouse Team', core: true, pin: '4445', email: 'edna@cloud9fulfilment.co.uk (password123)' },
                  { access: 'Operative', color: 'text-emerald-400', name: '⭐ Erica', title: 'Warehouse Operative', team: 'Core Warehouse Team', core: true, pin: '1111', email: 'PIN / Kiosk Tap' },
                  { access: 'Operative', color: 'text-emerald-400', name: '⭐ Sam', title: 'Warehouse Operative', team: 'Core Warehouse Team', core: true, pin: '2222', email: 'PIN / Kiosk Tap' },
                  { access: 'Operative', color: 'text-emerald-400', name: '⭐ Alex', title: 'Warehouse Operative', team: 'Core Warehouse Team', core: true, pin: '3333', email: 'PIN / Kiosk Tap' },
                  { access: 'Operative', color: 'text-emerald-400', name: '⭐ Mason', title: 'Warehouse Operative', team: 'Core Warehouse Team', core: true, pin: '1004', email: 'PIN / Kiosk Tap' },
                  { access: 'Operative', color: 'text-emerald-400', name: 'Ben', title: 'CCELL Operative', team: 'CCELL', core: false, pin: '1005', email: 'PIN / Kiosk Tap' },
                  { access: 'Operative', color: 'text-emerald-400', name: 'Jess', title: 'Warehouse Operative', team: 'Warehouse Team', core: false, pin: '1006', email: 'PIN / Kiosk Tap' },
                  { access: 'Operative', color: 'text-emerald-400', name: 'Sabine', title: 'Warehouse Operative', team: 'Warehouse Team', core: false, pin: '1007', email: 'PIN / Kiosk Tap' },
                  { access: 'Operative', color: 'text-emerald-400', name: 'Dan Igel', title: 'Head of People & Operations', team: 'People & Operations', core: false, pin: '1008', email: 'PIN / Kiosk Tap' },
                  { access: 'Operative', color: 'text-emerald-400', name: 'Billy', title: 'Operations', team: 'Operations', core: false, pin: '1009', email: 'PIN / Kiosk Tap' },
                  { access: 'Operative', color: 'text-emerald-400', name: 'Mike', title: 'Sales', team: 'Sales', core: false, pin: '1010', email: 'PIN / Kiosk Tap' },
                  { access: 'Operative', color: 'text-emerald-400', name: 'Ray', title: 'Sales (Warehouse Support)', team: 'Sales', core: false, pin: '1011', email: 'PIN / Kiosk Tap' },
                  { access: 'Operative', color: 'text-emerald-400', name: 'Adrian', title: 'Marketing & Innovations', team: 'Marketing & Innovations', core: false, pin: '1012', email: 'PIN / Kiosk Tap' },
                  { access: 'Operative', color: 'text-emerald-400', name: 'Danny', title: 'Marketing & Innovations', team: 'Marketing & Innovations', core: false, pin: '1013', email: 'PIN / Kiosk Tap' },
                  { access: 'Operative', color: 'text-emerald-400', name: 'Ashton', title: 'Marketing & Innovations', team: 'Marketing & Innovations', core: false, pin: '1014', email: 'PIN / Kiosk Tap' },
                ].map((m) => (
                  <tr key={m.pin}>
                    <td className={`py-2.5 px-4 font-bold ${m.color}`}>{m.access}</td>
                    <td className="py-2.5 px-4 font-bold text-white print:text-slate-950">{m.name}</td>
                    <td className="py-2.5 px-4 text-sky-300 font-semibold print:text-slate-700">{m.title}</td>
                    <td className="py-2.5 px-4">
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${m.core ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-purple-300'}`}>
                        {m.team}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono font-bold text-emerald-300">{m.pin}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-300">{m.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 4 Detailed Training Modules */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-5 space-y-3 print:bg-white print:border-slate-300">
              <div className="flex items-center gap-2 text-emerald-400 font-black text-sm">
                <Tablet className="w-4 h-4" />
                Module A: Operative Training (/kiosk &amp; /now)
              </div>
              <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside leading-relaxed print:text-slate-700">
                <li>
                  <strong>3-Way Top Quick Bar &amp; 30-Min Resume</strong>: At the very top of <code className="text-emerald-300">/now</code>, jump straight into <strong>Assigned to You / Open Pool</strong> tasks, your <strong>Last 4 Recent Tasks</strong>, or your starred <strong>Favourites</strong>. Any task stopped within the last 30 minutes has a 1-tap <strong>Resume Last Task</strong> button.
                </li>
                <li>
                  <strong>#1 Default Task (<code className="text-emerald-300">Standard Order Pick</code>) &amp; <code className="text-emerald-300">Standard Order Pack</code></strong>: <strong>Standard Order Pick</strong> (<code className="text-emerald-300">STD-PICK</code>) is always pinned #1 in Universal Standard Warehouse Tasks, followed by <strong>Standard Order Pack</strong> (<code className="text-emerald-300">STD-PACK</code>). Both close cleanly without forcing a mandatory unit count (since Helm WMS tracks order counts).
                </li>
                <li>
                  <strong>Goods-In Intake Type (<code className="text-emerald-300">Containers</code> | <code className="text-emerald-300">Pallets</code> | <code className="text-emerald-300">Boxes</code>)</strong>: On the <strong>Goods-In</strong> card, tap <strong>📦 Containers</strong> (<code className="text-emerald-300">STD-GIN-CONT</code>), <strong>🪵 Pallets</strong> (<code className="text-emerald-300">STD-GIN-PAL</code>), or <strong>📫 Boxes</strong> (<code className="text-emerald-300">STD-GIN-BOX</code>) to record the exact intake type and unit measure automatically.
                </li>
                <li>
                  <strong>Live Tally (<code className="text-emerald-300">+1 / +5 / +10</code>), Wrong-Task Swap &amp; Voice Mode</strong>: Increment units live while working, swap a wrongly chosen task mid-run without losing elapsed time, tick <em>&ldquo;Accidental start / mistake&rdquo;</em> if needed, or use <strong>Hands-Free Voice Mode</strong>.
                </li>
              </ol>
            </div>

            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-5 space-y-3 print:bg-white print:border-slate-300">
              <div className="flex items-center gap-2 text-sky-400 font-black text-sm">
                <Users className="w-4 h-4" />
                Module B: Supervisor Floor &amp; Timesheet Control (/floor &amp; /entries)
              </div>
              <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside leading-relaxed print:text-slate-700">
                <li>
                  <strong>Pre-Assign Queue, Open Pool Broadcast &amp; Crew Start</strong>: Push next tasks to specific operatives, broadcast an <strong>Open Pool Task</strong> (e.g. <em>&ldquo;Need 2 staff for Bay 3 Unload&rdquo;</em>), or tick multiple staff to start/stop a <strong>Crew Task</strong> together (with mandatory crew stop quantity &amp; red zero-productivity warning).
                </li>
                <li>
                  <strong>Dual Idle Alerts (<code className="text-sky-300">15m / 30m</code>) &amp; Zone Travel Heatmap</strong>: Spot operatives with no active task for 15+ mins or no pulse for 30+ mins, and view the live <strong>Warehouse Zone &amp; Aisle Heatmap</strong> (`Zones A–D`, `Pack Bench`, `Goods-In Bay`, `Dispatch`).
                </li>
                <li>
                  <strong>Supervisor Approval Queue for <code className="text-sky-300">Our Cost</code></strong>: Whenever an operative starts a Cloud9 Internal / Housekeeping task (Replenishment, Sweeping, Cardboard Clean-Out), it appears in the <code className="text-sky-300">/floor</code> approval banner for 1-click Supervisor sign-off.
                </li>
                <li>
                  <strong>Below-Target Urgent Filter, Helm WMS Sync &amp; 19:00 Auto-Close</strong>: Filter <code className="text-sky-300">/entries</code> to show only <code className="text-rose-300">&lt;85%</code> pace rows, sync daily order counts via <strong>Helm WMS CSV</strong>, and rely on automatic <strong>19:00 Shift-End Close &amp; Logout</strong>.
                </li>
              </ol>
            </div>

            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-5 space-y-3 print:bg-white print:border-slate-300">
              <div className="flex items-center gap-2 text-amber-400 font-black text-sm">
                <FileSpreadsheet className="w-4 h-4" />
                Module C: Commercial Billing &amp; Reports (/reports &amp; /reports/billing)
              </div>
              <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside leading-relaxed print:text-slate-700">
                <li>
                  <strong>Intelligent Billing Review Hub &amp; Clickable Audit Flags</strong>: At the top of <code className="text-amber-300">/entries</code>, review all <strong>Needs Billed</strong> items. In <code className="text-amber-300">/reports/billing</code>, click any amber/red audit flag badge to jump straight to those entries for instant editing.
                </li>
                <li>
                  <strong>Upward Rounding Including <code className="text-amber-300">15m Min + 5m Increment</code></strong>: Supports exact time, upward rounding (`5m`, `6m`, `15m`, `30m`, `60m`), and the 3PL special rule: <strong>15m Minimum Charge, then +5m increments</strong> (`15m_min_5m_inc`).
                </li>
                <li>
                  <strong>Operative Utilisation &amp; League Table</strong>: Use Tab 2 (<em>By Operative</em>) to track productive task time vs. clocked attendance, and Tab 3 (<em>League Table</em>) to benchmark operatives on identical tasks.
                </li>
                <li>
                  <strong>4-Format Invoice Exporter</strong>: In <code className="text-amber-300">/reports/billing</code>, export client backing sheets in <em>Summary by Task</em>, <em>Itemised Audit Log</em>, <em>Daily Matrix</em>, or <em>Order Reference Breakdown</em> (<code className="text-amber-300">.xlsx</code> / <code className="text-amber-300">.csv</code>).
                </li>
              </ol>
            </div>

            <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-5 space-y-3 print:bg-white print:border-slate-300">
              <div className="flex items-center gap-2 text-purple-400 font-black text-sm">
                <Settings className="w-4 h-4" />
                Module D: Admin Setup &amp; Task Architecture (/setup/*)
              </div>
              <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside leading-relaxed print:text-slate-700">
                <li>
                  <strong>Separated Task Architecture (2A / 2B / 2C / 2E)</strong>: Section 2A holds <em>Client-Specific Bespoke Tasks</em>, Section 2B holds <em>Universal Standard 3PL Tasks</em> (never cluttered with internal cleaning), Section 2C holds <em>Collapsible Colour-Coded Bespoke Projects</em>, and Section 2E holds <em>Cloud9 Internal / Housekeeping</em>.
                </li>
                <li>
                  <strong>Client Rounding &amp; Baseline Maturity</strong>: In <code className="text-purple-300">/setup/clients</code>, set client rounding intervals (including `15m Min + 5m Inc`) and promote clients from <em>Learning Phase</em> to <em>Baseline Established</em> or <em>Bossing It</em>.
                </li>
                <li>
                  <strong>Smart Target Variance Governance</strong>: In <code className="text-purple-300">/setup/targets</code>, review tasks where observed pace differs from standard by ≥10% (after ≥10 runs, ≥30 mins, ≥2 operatives). Managers request changes; Admins approve or reject.
                </li>
                <li>
                  <strong>Global F8 Triage</strong>: Press <strong>F8</strong> → open the <strong>Submitted Log</strong> tab to triage floor bug reports and feature requests (<code className="text-purple-300">Open → In Progress → Resolved</code>).
                </li>
              </ol>
            </div>
          </div>

          {/* Complete Standard 3PL Tasks vs Cloud9 Internal Housekeeping Reference Table */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 pt-2">
            <div className="rounded-xl bg-slate-950/90 border border-emerald-500/30 p-5 space-y-3 print:bg-white print:border-slate-300">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                    SECTION 2B • BILLABLE / CLIENT CONTRACT
                  </span>
                  <h3 className="text-sm font-black text-white print:text-slate-950">
                    Universal Standard 3PL Warehouse Tasks
                  </h3>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-black">
                  No Housekeeping Clutter
                </span>
              </div>
              <ul className="space-y-1.5 text-xs text-slate-300 print:text-slate-700">
                <li>• <strong>#1 Default: Standard Order Pick</strong> (<code className="text-emerald-300">STD-PICK</code>) — 1.2m / order • Auto Billed (Optional units on close)</li>
                <li>• <strong>#2 Default: Standard Order Pack</strong> (<code className="text-emerald-300">STD-PACK</code>) — 1.0m / order • Auto Billed (Optional units on close)</li>
                <li>• <strong>Goods-In (Containers / Pallets / Boxes)</strong> (<code className="text-emerald-300">STD-GOODSIN</code>) with inline 1-tap sub-buttons:
                  <div className="pl-4 pt-1 space-y-1 text-[11px] text-amber-300">
                    <div>↳ <strong>📦 Containers:</strong> Container Unload / De-Vanning (<code className="text-amber-200">STD-GIN-CONT</code>, 90m / container)</div>
                    <div>↳ <strong>🪵 Pallets:</strong> Pallet Receiving &amp; Check-In (<code className="text-amber-200">STD-GIN-PAL</code>, 10m / pallet)</div>
                    <div>↳ <strong>📫 Boxes:</strong> Boxes &amp; Carton Receiving (<code className="text-amber-200">STD-GIN-BOX</code>, 1.5m / box)</div>
                  </div>
                </li>
                <li>• <strong>Inbound Putaway to Racking / Pick Face</strong> (<code className="text-emerald-300">STD-PUTAWAY</code>) — 6m / pallet</li>
                <li>• <strong>B2B / Wholesale Case &amp; Master Carton Pick</strong> (<code className="text-emerald-300">STD-B2B-PICK</code>) — 1.0m / case</li>
                <li>• <strong>Pallet Build &amp; Wrap</strong> (<code className="text-emerald-300">STD-PALLET-BW</code>) — 8m / pallet • Needs Billed</li>
                <li>• <strong>Pallet Wrap &amp; Carrier Dispatch</strong> (<code className="text-emerald-300">STD-DISPATCH</code>) — 5m / pallet • Auto Billed</li>
                <li>• <strong>Container / Wagon Loading &amp; Carrier Handover</strong> (<code className="text-emerald-300">STD-LOAD</code>) — 6m / pallet</li>
                <li>• <strong>Rework, Relabelling &amp; Barcoding</strong> (<code className="text-emerald-300">STD-REWORK</code>) — 0.5m / unit • Needs Billed</li>
                <li>• <strong>Kitting, Bundling &amp; Multi-Pack Assembly</strong> (<code className="text-emerald-300">STD-KITTING</code>) — 1.2m / kit • Needs Billed</li>
                <li>• <strong>Customer Returns Processing &amp; Grading (RMA)</strong> (<code className="text-emerald-300">STD-RETURNS</code>) — 2.5m / return • Needs Billed</li>
                <li>• <strong>Quality Control (QC) &amp; Batch Inspection</strong> (<code className="text-emerald-300">STD-QC</code>) — 1.0m / unit • Needs Billed</li>
                <li>• <strong>Stock Take &amp; Cycle Count</strong> (<code className="text-emerald-300">STD-STOCK</code>) — 0.25m / location • Needs Billed</li>
              </ul>
            </div>

            <div className="rounded-xl bg-slate-950/90 border border-teal-500/30 p-5 space-y-3 print:bg-white print:border-slate-300">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-teal-400">
                    SECTION 2E • CLOUD9 INTERNAL OVERHEAD (OUR COST)
                  </span>
                  <h3 className="text-sm font-black text-white print:text-slate-950">
                    Cloud9 Internal / Housekeeping Tasks
                  </h3>
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-300 text-[10px] font-black">
                  Supervisor Sign-Off Queue
                </span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed print:text-slate-600">
                Internal warehouse tasks are completely removed from Universal Standard Warehouse Tasks and live in their own collapsible <strong>Cloud9 Internal / Housekeeping</strong> section at the bottom of <code className="text-teal-300">/now</code>:
              </p>
              <ul className="space-y-2 text-xs text-slate-300 print:text-slate-700">
                <li>• <strong>1. Replenishment (Pick-Face &amp; Forward Locations)</strong> (<code className="text-teal-300">INT-REPLEN</code>) — 6m / pallet • Restocking forward pick bins from bulk racking</li>
                <li>• <strong>2. Warehouse Sweeping &amp; Aisle Cleaning</strong> (<code className="text-teal-300">STD-CLEAN</code>) — 15m / aisle • Floor sweeping, aisle hygiene &amp; bay cleaning</li>
                <li>• <strong>3. Cardboard Clean-Out &amp; Baler Crushing</strong> (<code className="text-teal-300">INT-CARDBOARD</code>) — 15m / bale • Clearing empty cartons from pick aisles and loading the baler</li>
                <li>• <strong>4. Packing Bench Consumables Restock (Boxes, Tape, Void Fill)</strong> (<code className="text-teal-300">INT-CONSUMABLES</code>) — 5m / bench</li>
                <li>• <strong>5. Empty Pallet Sorting &amp; Loading Bay Clear-Down</strong> (<code className="text-teal-300">INT-PALLETS</code>) — 10m / stack</li>
                <li>• <strong>6. Forklift / MHE Daily Safety Check &amp; Battery Swap</strong> (<code className="text-teal-300">INT-MHE</code>) — 10m / check</li>
                <li>• <strong>7. Team Briefing, Shift Handover &amp; Training</strong> (<code className="text-teal-300">INT-BRIEFING</code>) — 15m / session</li>
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          SECTION 4: 6 REAL-WORLD WAREHOUSE SCENARIO PLAYBOOKS
         ===================================================================== */}
      {show('playbooks') && (
        <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 sm:p-8 space-y-6 print:border-slate-300 print:bg-white print:text-slate-950">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4 print:border-slate-300">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Play className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-400">
                Section 4 of 6 • Practical Floor Playbooks
              </span>
              <h2 className="text-xl font-black text-white print:text-slate-950">
                6 Real-World Warehouse Scenarios (&ldquo;How Do I...?&rdquo;)
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                num: 'Playbook 1',
                title: '4-Person Container Unload (Crew Start)',
                scenario: 'A 40ft container for Apex Logistics arrives at Bay 2 and 4 operatives need to unload it together.',
                steps: [
                  'Supervisor opens /floor.',
                  'Ticks Liam, Chloe, Tariq, and Sam on the live grid.',
                  'Selects Client: Apex Logistics, Task: Goods-In Container / Pallet Receiving, Order Ref: CONT-9921.',
                  'Clicks Start Crew Task — all 4 timers start simultaneously as one team.',
                ],
              },
              {
                num: 'Playbook 2',
                title: 'Urgent Ad-Hoc Rework (Needs Billed)',
                scenario: 'CCELL Direct asks the warehouse to relabel 500 units due to a supplier barcode misprint.',
                steps: [
                  'Operative selects CCELL Direct -> Rework, Relabelling & Barcoding (or scans BC-STD-RWK) and enters Order Ref: RWK-500.',
                  'Upon completion, operative stops task and enters 500 units.',
                  'Entry is automatically flagged as Needs Billed in /entries.',
                  'Billing Admin clicks Agree in the Billing Review Hub and exports the Order Ref Breakdown Excel sheet.',
                ],
              },
              {
                num: 'Playbook 3',
                title: 'Internal Picking Error (Downgrade to Our Cost)',
                scenario: 'An operative spent 45 minutes repacking an order caused by an internal warehouse picking mistake.',
                steps: [
                  'Supervisor opens /entries and locates the 45-minute entry.',
                  'Changes Billing Status from Needs Billed to Our Cost.',
                  'DeepTime prompts for a Mandatory Unbilled Reason -> Supervisor selects "Warehouse Error / Internal Rework".',
                  'Time remains in operative productivity stats but is excluded from the client invoice.',
                ],
              },
              {
                num: 'Playbook 4',
                title: 'Operative Forgot to Stop Timer at Lunch',
                scenario: 'An operative walked out to lunch at 12:30 leaving their Pick & Pack timer running.',
                steps: [
                  'Option A (Immediate): Supervisor spots the timer on /floor and clicks Stop, or edits the finish time to 12:30 in /entries.',
                  'Option B (Automated): At 60m of inactivity, /now shows an Idle Check prompt. At 120m, DeepTime auto-stops the timer back at 12:30 (their last real activity).',
                ],
              },
              {
                num: 'Playbook 5',
                title: 'Wi-Fi Drops in Racking Aisle 14',
                scenario: 'An operative on a handheld scanner switches tasks in a Wi-Fi dead spot at the back of the warehouse.',
                steps: [
                  'Top bar automatically shows an amber "Offline (1)" badge.',
                  'Task start/stop is safely stored on the device with the exact time.',
                  'As soon as the operative walks back into Wi-Fi range, DeepTime syncs the saved actions automatically.',
                ],
              },
              {
                num: 'Playbook 6',
                title: 'Calibrating an Outdated Task Target',
                scenario: 'Standard Order Pick target is set to 1.50 mins/order, but after new bench layouts the team averages 1.10 mins/order (+27% faster).',
                steps: [
                  'Once ≥10 runs, ≥30 mins, and ≥2 operatives are logged, /setup/targets highlights a High Variance recommendation.',
                  'Warehouse Manager clicks Request Target Change (proposing 1.15m) with note "New packing bench layout".',
                  'Admin reviews the pending request in /setup/targets and clicks Approve.',
                ],
              },
            ].map((pb) => (
              <div
                key={pb.num}
                className="rounded-xl bg-slate-950/70 border border-slate-800 p-4 flex flex-col justify-between space-y-3 print:bg-white print:border-slate-300"
              >
                <div className="space-y-1.5">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                    {pb.num}
                  </span>
                  <h3 className="text-sm font-black text-white print:text-slate-950">
                    {pb.title}
                  </h3>
                  <p className="text-xs text-slate-400 italic print:text-slate-600">
                    &ldquo;{pb.scenario}&rdquo;
                  </p>
                </div>
                <ol className="space-y-1.5 text-xs text-slate-300 list-decimal list-inside pt-2 border-t border-slate-800/80 print:text-slate-700">
                  {pb.steps.map((s, i) => (
                    <li key={i} className="leading-snug">
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* =====================================================================
          SECTION 5: PRINTABLE 1-PAGE BENCH & DESK CHEAT SHEETS
         ===================================================================== */}
      {show('cheatsheets') && (
        <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 sm:p-8 space-y-6 print:border-slate-300 print:bg-white print:text-slate-950">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4 print:border-slate-300">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-purple-400">
                Section 5 of 6 • Laminated Quick-Reference Cards
              </span>
              <h2 className="text-xl font-black text-white print:text-slate-950">
                Printable Packing Bench &amp; Supervisor Desk Cheat Sheets
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Card 1: Packing Bench Card */}
            <div className="rounded-2xl border-2 border-dashed border-emerald-500/50 bg-slate-950 p-5 space-y-3 print:bg-white print:border-emerald-700">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                  ✂ LAMINATE FOR PACKING BENCHES
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 text-[10px] font-black">
                  OPERATIVE CARD
                </span>
              </div>
              <h3 className="text-base font-black text-white print:text-slate-950">
                Operative 4-Step Golden Rules
              </h3>
              <ul className="space-y-2 text-xs text-slate-300 print:text-slate-800">
                <li>
                  <strong>1. TAP IN FIRST THING:</strong> Tap your name on <code className="text-emerald-300">/kiosk</code> (or enter your 4-digit PIN on <code className="text-emerald-300">/login</code>).
                </li>
                <li>
                  <strong>2. NEVER WORK UNTRACKED:</strong> Pick the Client on the A–Z Wheel (or <em>Multi-Client</em>), pick the Task (or scan the bench barcode), and tap <strong>Start Task</strong>.
                </li>
                <li>
                  <strong>3. JUST START THE NEXT JOB:</strong> Moving to a new task? Just select or scan the new task! DeepTime stops your old timer automatically and asks for your <strong>Units Completed</strong>.
                </li>
                <li>
                  <strong>4. CLOCK OUT AT SHIFT END:</strong> Tap <strong>Clock Out</strong> before leaving the floor.
                </li>
                <li className="pt-1 text-emerald-300 font-bold print:text-emerald-800">
                  💡 Spot an issue or have an idea? Press <strong>F8</strong> anytime!
                </li>
              </ul>
            </div>

            {/* Card 2: Supervisor Daily Cadence */}
            <div className="rounded-2xl border-2 border-dashed border-sky-500/50 bg-slate-950 p-5 space-y-3 print:bg-white print:border-sky-700">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="text-xs font-black uppercase tracking-wider text-sky-400">
                  ✂ LAMINATE FOR FLOOR DESK
                </span>
                <span className="px-2 py-0.5 rounded bg-sky-500 text-slate-950 text-[10px] font-black">
                  SUPERVISOR CARD
                </span>
              </div>
              <h3 className="text-base font-black text-white print:text-slate-950">
                Supervisor Daily Floor Routine
              </h3>
              <ul className="space-y-2 text-xs text-slate-300 print:text-slate-800">
                <li>
                  <strong>• START OF SHIFT (08:00):</strong> Open <code className="text-sky-300">/floor</code>. Confirm all operatives are clocked in and assigned to an active client/task.
                </li>
                <li>
                  <strong>• CONTAINER / TEAM JOBS:</strong> Tick multiple operatives on <code className="text-sky-300">/floor</code> → click <strong>Start Crew Task</strong>.
                </li>
                <li>
                  <strong>• MID-SHIFT CHECK (13:00):</strong> Check <code className="text-sky-300">/floor</code> for idle warnings (&gt;60m) or missing order references.
                </li>
                <li>
                  <strong>• EXCEPTION REVIEW (17:00):</strong> Open <code className="text-sky-300">/entries</code>. Verify any <em>Our Cost</em> downgrades have a valid Unbilled Reason.
                </li>
                <li>
                  <strong>• END OF SHIFT (18:00):</strong> Click <strong>Run Shift-End Close</strong> on <code className="text-sky-300">/floor</code> to close open timers and send the Daily Summary.
                </li>
              </ul>
            </div>

            {/* Card 3: Finance & Billing Weekly Checklist */}
            <div className="rounded-2xl border-2 border-dashed border-amber-500/50 bg-slate-950 p-5 space-y-3 print:bg-white print:border-amber-700">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                  ✂ LAMINATE FOR COMMERCIAL TEAM
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-black">
                  BILLING CARD
                </span>
              </div>
              <h3 className="text-base font-black text-white print:text-slate-950">
                Weekly Client Invoicing Checklist
              </h3>
              <ul className="space-y-2 text-xs text-slate-300 print:text-slate-800">
                <li>
                  <strong>1. REVIEW &lsquo;NEEDS BILLED&rsquo; QUEUE:</strong> Open <code className="text-amber-300">/entries</code> and review the <strong>Intelligent Billing Review Hub</strong> at the top.
                </li>
                <li>
                  <strong>2. AGREE OR DISPUTE:</strong> Click <strong>Agree</strong> on verified ad-hoc/rework entries or <strong>Dispute</strong> with a note if units/hours need supervisor clarification.
                </li>
                <li>
                  <strong>3. CHECK GROSS MARGIN:</strong> Open <code className="text-amber-300">/reports</code> (<em>By Client &amp; Task</em>) to verify Rounded Billable Hours vs. Labour Cost.
                </li>
                <li>
                  <strong>4. EXPORT INVOICE BACKING SHEET:</strong> Open <code className="text-amber-300">/reports/billing</code>, select the Client &amp; Date Range, and download the <strong>.xlsx</strong> backing sheet.
                </li>
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* =====================================================================
          SECTION 6: TROUBLESHOOTING & FAQ DIRECTORY
         ===================================================================== */}
      {show('faq') && (
        <section className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 sm:p-8 space-y-6 print:border-slate-300 print:bg-white print:text-slate-950">
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4 print:border-slate-300">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-rose-400">
                Section 6 of 6 • Support &amp; Edge Cases
              </span>
              <h2 className="text-xl font-black text-white print:text-slate-950">
                Troubleshooting &amp; Frequently Asked Questions
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              {
                q: 'Why does a 10-second test tap not show a "/ hr" pace or team average %?',
                a: 'DeepTime intentionally suppresses "/ hr" and "% faster/slower than team" calculations on entries shorter than 1 full minute (< 1m). This prevents accidental 2-second test taps from extrapolating impossible numbers (like 25,000 units/hr) or distorting the team daily average.',
              },
              {
                q: 'How do I unlock a tablet that is locked in Kiosk Mode?',
                a: 'Click the amber "Exit Kiosk" button in the top-right navigation bar. That restores the full navigation header (/floor, /entries, /reports, /setup).',
              },
              {
                q: 'Why can Operatives see their own Target pace but not the Team Daily Average?',
                a: 'By design, Operatives see their own Production rate and the Task Target, while comparative Team Daily Averages and League Tables are restricted to Supervisors and Admins.',
              },
              {
                q: 'Why is the "Request Target Change" button locked on a task in /setup/targets?',
                a: 'Smart Target governance requires two conditions before unlocking target changes: (1) the Client baseline must be approved in /setup/clients, and (2) the task must have at least 10 valid runs, 30 total minutes, and 2 distinct operatives.',
              },
              {
                q: 'What happens if an operative scans a client-specific barcode while another client is selected?',
                a: 'DeepTime automatically switches the active Client to match the scanned barcode’s owner (or keeps the selected client if scanning a Universal Standard task barcode like BC-STD-PICK).',
              },
              {
                q: 'How do I report a bug or request a new feature during live floor testing?',
                a: 'Press F8 on your keyboard at any time (or click the "Report / Idea [F8]" button in the top bar). Your current screen path and user name are attached automatically, and Admins can track and resolve items in the Submitted Log tab.',
              },
            ].map((faq, i) => (
              <div
                key={i}
                className="rounded-xl bg-slate-950/70 border border-slate-800 p-4 space-y-1.5 print:bg-white print:border-slate-300"
              >
                <div className="text-xs font-black text-white flex items-start gap-2 print:text-slate-950">
                  <span className="text-emerald-400">Q:</span>
                  <span>{faq.q}</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed pl-5 print:text-slate-700">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
