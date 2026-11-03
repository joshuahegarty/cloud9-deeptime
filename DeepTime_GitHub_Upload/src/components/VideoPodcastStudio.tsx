'use client';

import {
  Award,
  Bug,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FastForward,
  FileSpreadsheet,
  Headphones,
  Layers,
  Mic,
  Pause,
  Play,
  Radio,
  Rewind,
  ShieldCheck,
  Sparkles,
  Tablet,
  Tv,
  Users,
  Volume2,
  VolumeX,
  WifiOff,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

export interface PodcastTurn {
  index: number;
  chapter: number;
  speaker: 'Josh' | 'Host';
  role: string;
  startSec: number;
  endSec: number;
  text: string;
}

export interface PodcastChapter {
  id: number;
  title: string;
  subtitle: string;
  routeBadge: string;
  durationLabel: string;
  startSec: number;
  keyTakeaways: string[];
}

export const PODCAST_CHAPTERS: PodcastChapter[] = [
  {
    id: 0,
    title: '1. Platform Mission & 5 Core Pillars',
    subtitle: 'How Josh designed DeepTime to connect 3PL floor activity to billing',
    routeBadge: 'ECOSYSTEM OVERVIEW',
    durationLabel: '1:26',
    startSec: 0,
    keyTakeaways: [
      'Eliminates the 15% ad-hoc labour leakage common with paper timesheets',
      '1-Tap task switching closes prior timers in a single atomic transaction',
      'Smart unit quantity declaration on close',
      'Upward commercial billing rounding (5m, 6m, 10m, 15m, 30m, 60m)',
    ],
  },
  {
    id: 1,
    title: '2. Shared Kiosk (/kiosk) & Personal Timer (/now)',
    subtitle: 'Touchscreen turnstiles, Goods-In sub-types & bench barcode scanning',
    routeBadge: '/KIOSK & /NOW',
    durationLabel: '1:14',
    startSec: 86.24,
    keyTakeaways: [
      'Colour-coded Kiosk cards: Slate (Off), Sky Blue (Idle), Emerald (Active)',
      'Tapping an off-shift card punches attendance & opens /now?kiosk=1',
      'Standard Order Pick #1 default, Goods-In (Containers/Pallets/Boxes) & Barcode Scan',
      'Touchless auto-return resets the shared tablet for the next operative',
    ],
  },
  {
    id: 2,
    title: '3. Custom Tasks & Smart Quantity Declarations',
    subtitle: 'How bespoke tasks, Goods-In & Pallet Build & Wrap capture output',
    routeBadge: 'QUANTITY GUARDRAIL',
    durationLabel: '0:55',
    startSec: 160.16,
    keyTakeaways: [
      '"Task Not Listed" creates client-scoped bespoke tasks on the fly',
      'Standard Order Pick & Pack close smoothly when Helm WMS tracks orders',
      'Goods-In, Pallet Build & Wrap, and bespoke tasks prompt for quantity completed',
      'Declared quantity saves onto the closing entry before the new task starts',
    ],
  },
  {
    id: 3,
    title: '4. Live Supervisor Floor Board (/floor) & Crew Tasks',
    subtitle: 'Real-time bird’s-eye pacing, multi-operative crews & shift close',
    routeBadge: '/FLOOR CONTROL',
    durationLabel: '0:41',
    startSec: 215.12,
    keyTakeaways: [
      'Live ticking duration counters across all clocked-in warehouse staff',
      'Start Crew Task synchronises multiple operatives under one shared crew_id',
      'Remote Stop / Switch from supervisor desk prompts for quantity completed',
      'Shift-End Close terminates orphaned timers at last physical activity',
    ],
  },
  {
    id: 4,
    title: '5. Timesheets, Audit Trail & 3-Tier Billing (/entries)',
    subtitle: 'AUTO BILLED, NEEDS BILLED, OUR COST & field-level audit logs',
    routeBadge: '/ENTRIES & AUDIT',
    durationLabel: '0:53',
    startSec: 256.11,
    keyTakeaways: [
      'AUTO BILLED: routine transactional contract work (e.g. standard pick/pack)',
      'NEEDS BILLED: ad-hoc, rework & custom tasks routed to Billing Review',
      'OUR COST: internal housekeeping (Replenishment, Sweeping, Cardboard) & unbilled reason',
      'Database triggers record before/after values for every edited field',
    ],
  },
  {
    id: 5,
    title: '6. Analytics & 4-Tab Excel Billing Pack (/reports)',
    subtitle: 'Gross margin, utilisation %, league tables & client backing sheets',
    routeBadge: '/REPORTS & BILLING',
    durationLabel: '0:36',
    startSec: 308.67,
    keyTakeaways: [
      'Compares Raw Stopwatch Hours vs. Upward-Rounded Billable Hours & Margin %',
      'Tracks Operative Utilisation % (productive task time vs. shift attendance)',
      'League Table benchmarks operatives on the same task against target pace',
      'Exports 4-tab .xlsx workbook: Summary, Audit Log, Daily Matrix, Order Refs',
    ],
  },
  {
    id: 6,
    title: '7. Setup, Idle Guardrails & Smart Target Governance',
    subtitle: 'Statistical readiness rules & two-point target approval workflow',
    routeBadge: '/SETUP GOVERNANCE',
    durationLabel: '0:43',
    startSec: 344.56,
    keyTakeaways: [
      '60-min interactive idle check; 75–120m retroactive auto-stop',
      'Customer Baseline Maturity: Learning Phase -> Baseline -> Bossing It',
      'Statistical Readiness requires >= 10 runs, >= 30 mins & >= 2 operatives',
      'Two-Point Approval: Supervisor requests target change -> Admin approves',
    ],
  },
  {
    id: 7,
    title: '8. Offline Resilience & Global F8 Feedback Hub',
    subtitle: 'IndexedDB dead-zone queueing & instant bug/idea reporting',
    routeBadge: 'OFFLINE & F8 HUB',
    durationLabel: '0:42',
    startSec: 387.85,
    keyTakeaways: [
      'IndexedDB queues starts, stops & switches in Wi-Fi dead zones',
      'Chronological auto-sync replays queued actions on reconnection',
      'Press F8 on any screen to open the Bug Report & Feature Request modal',
      'Automatically attaches current screen route, user role & browser context',
    ],
  },
];

export const PODCAST_TURNS: PodcastTurn[] = [
  {
    index: 0,
    chapter: 0,
    speaker: 'Host',
    role: 'Operations Guide',
    startSec: 0,
    endSec: 14.26,
    text: "Welcome to the Cloud9 DeepTime Operations Deep-Dive. Today we're joined by Josh, the Designer and Lead Architect behind Cloud9 DeepTime, to walk through how the platform works from the warehouse floor all the way through to commercial client billing.",
  },
  {
    index: 1,
    chapter: 0,
    speaker: 'Josh',
    role: 'Designer & Architect',
    startSec: 14.26,
    endSec: 45.75,
    text: 'Yah mon... I find a lack of warehouse visibility disturbing. When I designed and architected DeepTime, the vision was irie and clear: in a fast-moving 3PL warehouse, paper timesheets lose up to 15% of billable labour. DeepTime brings the full power of the Force to client billing—every little pallet gonna be alright.',
  },
  {
    index: 2,
    chapter: 0,
    speaker: 'Host',
    role: 'Operations Guide',
    startSec: 45.75,
    endSec: 51.61,
    text: "Let's break down the five core architectural pillars you built into the system before we tour each screen.",
  },
  {
    index: 3,
    chapter: 0,
    speaker: 'Josh',
    role: 'Designer & Architect',
    startSec: 51.61,
    endSec: 86.24,
    text: 'Search your feelings, mon... First is real-time live visibility across handhelds, pack benches, and shared kiosk tablets. Second is one-tap task switching—one love, one atomic transaction. Third is smart unit quantity declaration on close. Fourth is automated 60-minute idle and 7 PM shift protection. And fifth is upward billing rounding—no unbilled minute left behind in Babylon.',
  },
  {
    index: 4,
    chapter: 1,
    speaker: 'Host',
    role: 'Operations Guide',
    startSec: 86.24,
    endSec: 97.74,
    text: "Let's start on the warehouse floor with Module One: the Shared Tablet Kiosk at /kiosk, and the Personal Timer at /now. Walk us through what happens when an operative arrives on shift.",
  },
  {
    index: 5,
    chapter: 1,
    speaker: 'Josh',
    role: 'Designer & Architect',
    startSec: 97.74,
    endSec: 123.01,
    text: "Yah mon, when an operative steps up to the Kiosk tablet, they see colour-coded status cards for the whole empire. Slate means clocked off, Sky Blue means clocked in and chilling, and Emerald Green means the timer is jammin'. Tap your card, punch in, and feel the rhythm of the warehouse floor.",
  },
  {
    index: 6,
    chapter: 1,
    speaker: 'Host',
    role: 'Operations Guide',
    startSec: 123.01,
    endSec: 130.33,
    text: "And once they're on /now, you designed three distinct ways for them to kick off a task depending on where they're working in the warehouse.",
  },
  {
    index: 7,
    chapter: 1,
    speaker: 'Josh',
    role: 'Designer & Architect',
    startSec: 130.33,
    endSec: 160.16,
    text: 'Indeed, young Padawan. Standard Order Pick is ready at the top by default, or for Goods-In they just tap Containers, Pallets, or Boxes. They can also zap a bench barcode like BC-STD-PICK, or tap Recent Tasks Today. On a Kiosk tablet, it flashes green and returns to the grid faster than the Millennium Falcon.',
  },
  {
    index: 8,
    chapter: 2,
    speaker: 'Host',
    role: 'Operations Guide',
    startSec: 160.16,
    endSec: 167.43,
    text: "Now let's talk about handling custom unlisted tasks, and how DeepTime handles quantity declarations when tasks close.",
  },
  {
    index: 9,
    chapter: 2,
    speaker: 'Josh',
    role: 'Designer & Architect',
    startSec: 167.43,
    endSec: 189.8,
    text: "Don't worry about a thing, mon. Clients always ask for bespoke work—rework, relabelling, pallet build and wrap, or custom kitting. Operatives just tap Task Not Listed, type a short name, and stir it up immediately.",
  },
  {
    index: 10,
    chapter: 2,
    speaker: 'Host',
    role: 'Operations Guide',
    startSec: 189.8,
    endSec: 193.35,
    text: 'And what happens the moment a task is closed or switched?',
  },
  {
    index: 11,
    chapter: 2,
    speaker: 'Josh',
    role: 'Designer & Architect',
    startSec: 193.35,
    endSec: 215.12,
    text: 'The Force guides them, bredren. Standard Order Pick and Pack let you close smoothly without blocking if Helm WMS tracks the orders, while Goods-In, Pallet Build and Wrap, and bespoke tasks pop up the quantity prompt asking how many units you conquered.',
  },
  {
    index: 12,
    chapter: 3,
    speaker: 'Host',
    role: 'Operations Guide',
    startSec: 215.12,
    endSec: 224.02,
    text: 'That brings us to Module Two: the Supervisor Live Floor Board at /floor. How did you design this for team leaders managing a busy shift?',
  },
  {
    index: 13,
    chapter: 3,
    speaker: 'Josh',
    role: 'Designer & Architect',
    startSec: 224.02,
    endSec: 246.94,
    text: 'From the command deck at /floor, supervisors see every operative, their role tag, active client, and live ticking timer. And when the crew is unloading a 40-foot container together, tick the squad and click Start Crew Task—one love, one crew, one shared timestamp.',
  },
  {
    index: 14,
    chapter: 3,
    speaker: 'Host',
    role: 'Operations Guide',
    startSec: 246.94,
    endSec: 256.11,
    text: 'Which synchronises the whole team under a shared crew_id at the exact same start second, alongside remote Stop, Switch, and the nightly Shift-End Close.',
  },
  {
    index: 15,
    chapter: 4,
    speaker: 'Josh',
    role: 'Designer & Architect',
    startSec: 256.11,
    endSec: 272.69,
    text: 'Now witness the power of this fully armed timesheet ledger at /entries, mon. Every entry flows into one of three commercial billing tiers: Automatically Billed, Needs Billed, or Our Cost.',
  },
  {
    index: 16,
    chapter: 4,
    speaker: 'Host',
    role: 'Operations Guide',
    startSec: 272.69,
    endSec: 277.06,
    text: "Let's clarify those three tiers for supervisors and billing admins.",
  },
  {
    index: 17,
    chapter: 4,
    speaker: 'Josh',
    role: 'Designer & Architect',
    startSec: 277.06,
    endSec: 308.67,
    text: 'Automatically Billed is standard contract picking and packing. Needs Billed is ad-hoc, rework, and custom work routed to the Billing Hub. And Our Cost is internal Cloud9 housekeeping—like replenishment, warehouse sweeping, and cardboard clean-out. Nobody can downgrade a billable job to Our Cost without a mandatory reason, mon. The Dark Side logs every edit in the audit trail.',
  },
  {
    index: 18,
    chapter: 5,
    speaker: 'Host',
    role: 'Operations Guide',
    startSec: 308.67,
    endSec: 318.44,
    text: 'Once the entries are verified, commercial managers use Module Four: Performance Reports at /reports and the Client Billing Exporter at /reports/billing.',
  },
  {
    index: 19,
    chapter: 5,
    speaker: 'Josh',
    role: 'Designer & Architect',
    startSec: 318.44,
    endSec: 337.26,
    text: 'Yah mon, in Performance Reports you see raw stopwatch hours versus upward-rounded billable hours and gross margin, operative utilisation percentage, and the League Table. Every number is irie and transparent.',
  },
  {
    index: 20,
    chapter: 5,
    speaker: 'Host',
    role: 'Operations Guide',
    startSec: 337.26,
    endSec: 344.56,
    text: 'And in the Billing Exporter, one click generates a four-tab Excel backing pack ready to attach straight to a client invoice.',
  },
  {
    index: 21,
    chapter: 6,
    speaker: 'Josh',
    role: 'Designer & Architect',
    startSec: 344.56,
    endSec: 358.53,
    text: 'In Module Five at /setup, managers configure clients, rounding rules, bench barcodes, and our Smart Target Variance and Two-Point Approval Engine.',
  },
  {
    index: 22,
    chapter: 6,
    speaker: 'Host',
    role: 'Operations Guide',
    startSec: 358.53,
    endSec: 364.31,
    text: 'Why did you architect a statistical guardrail and Two-Point Approval around task target times?',
  },
  {
    index: 23,
    chapter: 6,
    speaker: 'Josh',
    role: 'Designer & Architect',
    startSec: 364.31,
    endSec: 387.85,
    text: 'Because disturbance in the Force must not skew warehouse KPIs, mon. DeepTime locks target changes until a task has at least 10 valid runs, 30 total minutes, and 2 operatives. A supervisor requests the change, and the Admin approves it. Two-point harmony.',
  },
  {
    index: 24,
    chapter: 7,
    speaker: 'Host',
    role: 'Operations Guide',
    startSec: 387.85,
    endSec: 395.82,
    text: "Finally, let's cover Module Six: Wi-Fi dead-zone resilience and the global F8 feedback shortcut you added across every screen.",
  },
  {
    index: 25,
    chapter: 7,
    speaker: 'Josh',
    role: 'Designer & Architect',
    startSec: 395.82,
    endSec: 419.15,
    text: 'Even if the Empire jams your Wi-Fi deep in the racking aisles, DeepTime queues every tap in IndexedDB and syncs automatically when signal returns. And pressing F8 on any screen opens the Feedback Hub. One Love, One Warehouse, and may the Force be with Cloud9, mon.',
  },
  {
    index: 26,
    chapter: 7,
    speaker: 'Host',
    role: 'Operations Guide',
    startSec: 419.15,
    endSec: 429.49,
    text: 'Thanks Josh! Use the interactive chapter controls, visual mindmaps, and downloadable PDF cheat sheets below whenever your team needs a quick reference on the warehouse floor.',
  },
];

const TOTAL_DURATION_SEC = 429.49;

function playVaderMarleyRespirator() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const createBreath = (startTime: number, duration: number, freq: number) => {
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(freq, startTime);
      filter.Q.setValueAtTime(3.2, startTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.01, startTime);
      gain.gain.linearRampToValueAtTime(0.22, startTime + duration * 0.3);
      gain.gain.linearRampToValueAtTime(0.01, startTime + duration);

      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      whiteNoise.start(startTime);
      whiteNoise.stop(startTime + duration);
    };

    createBreath(now, 0.5, 620);
    createBreath(now + 0.55, 0.55, 440);
  } catch {
    // ignore autoplay restrictions
  }
}

function formatSec(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem < 10 ? '0' : ''}${rem}`;
}

export function VideoPodcastStudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isMuted, setIsMuted] = useState(false);
  const [useWebSpeechFallback, setUseWebSpeechFallback] = useState(false);
  const [activeTurnIndex, setActiveTurnIndex] = useState(0);
  const [sidebarTab, setSidebarTab] = useState<'chapters' | 'transcript'>('chapters');

  const currentTurn =
    PODCAST_TURNS.find(
      (t) => currentTime >= t.startSec && currentTime < t.endSec
    ) ||
    PODCAST_TURNS[activeTurnIndex] ||
    PODCAST_TURNS[0];

  const currentChapter =
    PODCAST_CHAPTERS[currentTurn.chapter] || PODCAST_CHAPTERS[0];

  useEffect(() => {
    const matched = PODCAST_TURNS.findIndex(
      (t) => currentTime >= t.startSec && currentTime < t.endSec
    );
    if (matched !== -1 && matched !== activeTurnIndex) {
      setActiveTurnIndex(matched);
      if (isPlaying && !isMuted && PODCAST_TURNS[matched]?.speaker === 'Josh') {
        playVaderMarleyRespirator();
      }
    }
  }, [currentTime, activeTurnIndex, isPlaying, isMuted]);

  useEffect(() => {
    if (!useWebSpeechFallback || !isPlaying) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    const turn = PODCAST_TURNS[activeTurnIndex];
    if (!turn) {
      setIsPlaying(false);
      return;
    }

    window.speechSynthesis.cancel();
    if (turn.speaker === 'Josh' && !isMuted) {
      playVaderMarleyRespirator();
    }
    const utter = new SpeechSynthesisUtterance(turn.text);
    utter.rate = turn.speaker === 'Josh' ? playbackRate * 0.8 : playbackRate;
    utter.pitch = turn.speaker === 'Josh' ? 0.25 : 1.0;
    utter.volume = isMuted ? 0 : 1;

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      if (turn.speaker === 'Josh') {
        const naturalMale =
          voices.find(
            (v) =>
              v.name.includes('Ryan') ||
              (v.name.includes('Natural') && v.lang.includes('en-GB')) ||
              v.name.includes('Google UK English Male')
          ) || voices[0];
        if (naturalMale) utter.voice = naturalMale;
      } else {
        const naturalFemale =
          voices.find(
            (v) =>
              v.name.includes('Sonia') ||
              v.name.includes('Libby') ||
              v.name.includes('Google UK English Female') ||
              (v.name.includes('Natural') && !v.name.includes('Ryan'))
          ) || voices[voices.length > 1 ? 1 : 0];
        if (naturalFemale) utter.voice = naturalFemale;
      }
    }

    utter.onend = () => {
      if (activeTurnIndex + 1 < PODCAST_TURNS.length) {
        const nextTurn = PODCAST_TURNS[activeTurnIndex + 1];
        setActiveTurnIndex(nextTurn.index);
        setCurrentTime(nextTurn.startSec);
      } else {
        setIsPlaying(false);
      }
    };

    window.speechSynthesis.speak(utter);

    return () => {
      window.speechSynthesis.cancel();
    };
  }, [useWebSpeechFallback, isPlaying, activeTurnIndex, playbackRate, isMuted]);

  const togglePlay = () => {
    if (useWebSpeechFallback) {
      setIsPlaying((prev) => !prev);
      return;
    }
    const audio = audioRef.current;
    if (!audio) {
      setUseWebSpeechFallback(true);
      setIsPlaying((prev) => !prev);
      return;
    }
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().catch(() => {
        setUseWebSpeechFallback(true);
        setIsPlaying(true);
      });
      setIsPlaying(true);
    }
  };

  const seekToTurn = (turn: PodcastTurn) => {
    setActiveTurnIndex(turn.index);
    setCurrentTime(turn.startSec + 0.05);
    if (!useWebSpeechFallback && audioRef.current) {
      audioRef.current.currentTime = turn.startSec + 0.05;
      if (!isPlaying) {
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => {
            setUseWebSpeechFallback(true);
            setIsPlaying(true);
          });
      }
    } else {
      setIsPlaying(true);
    }
  };

  const seekToChapter = (chapterId: number) => {
    const firstTurn = PODCAST_TURNS.find((t) => t.chapter === chapterId);
    if (firstTurn) {
      seekToTurn(firstTurn);
    }
  };

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (audioRef.current) {
      audioRef.current.muted = next;
    }
  };

  const stepTurn = (delta: number) => {
    const targetIdx = Math.min(
      PODCAST_TURNS.length - 1,
      Math.max(0, currentTurn.index + delta)
    );
    seekToTurn(PODCAST_TURNS[targetIdx]);
  };

  return (
    <section className="rounded-2xl bg-slate-900/95 border border-slate-800 shadow-2xl overflow-hidden print:hidden">
      {/* Studio Neural MP3 Audio */}
      <audio
        ref={audioRef}
        src="/deeptime-podcast.mp3"
        preload="metadata"
        onTimeUpdate={(e) => {
          if (!useWebSpeechFallback) {
            setCurrentTime(e.currentTarget.currentTime);
          }
        }}
        onEnded={() => setIsPlaying(false)}
        onError={() => setUseWebSpeechFallback(true)}
      />

      {/* Top Studio Header Bar */}
      <div className="bg-slate-950/90 border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-sky-500 flex items-center justify-center text-slate-950 shadow-lg shadow-emerald-500/20">
            <Tv className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                <Radio className="w-3 h-3 animate-pulse" />
                Studio Neural Audio • With Josh (Designer &amp; Architect)
              </span>
              <span className="text-xs font-bold text-slate-400">
                8 Chapters • 6m 54s Full Walkthrough
              </span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-white">
              Cloud9 DeepTime — Architecture &amp; Operations Walkthrough with Josh
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="/deeptime-podcast.mp3"
            download="Cloud9_DeepTime_Podcast_DeepDive.mp3"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-bold text-slate-200 transition"
          >
            <Download className="w-3.5 h-3.5 text-emerald-400" />
            Download Podcast Audio (.MP3)
          </a>
        </div>
      </div>

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12">
        {/* Left 8 Columns: Visual Cinema Stage + Transport Controls */}
        <div className="xl:col-span-8 flex flex-col justify-between border-b xl:border-b-0 xl:border-r border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
          {/* Top Stage Status Bar */}
          <div className="px-6 pt-5 pb-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/70">
            <div className="flex items-center gap-2.5">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-black">
                {currentChapter.routeBadge}
              </span>
              <div>
                <div className="text-sm font-black text-white">
                  {currentChapter.title}
                </div>
                <div className="text-xs text-slate-400">
                  {currentChapter.subtitle}
                </div>
              </div>
            </div>

            {/* Dual Host Live Microphones */}
            <div className="flex items-center gap-2">
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition ${
                  currentTurn.speaker === 'Josh'
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200 shadow-md shadow-emerald-500/10'
                    : 'bg-slate-900/80 border-slate-800 text-slate-500'
                }`}
              >
                <div className="relative">
                  <div className="w-6 h-6 rounded-full bg-emerald-500 text-slate-950 font-black text-xs flex items-center justify-center">
                    J
                  </div>
                  {isPlaying && currentTurn.speaker === 'Josh' && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  )}
                </div>
                <div className="text-left">
                  <div className="text-[11px] font-black leading-tight">
                    Josh
                  </div>
                  <div className="text-[9px] opacity-75 leading-tight">
                    Designer &amp; Architect
                  </div>
                </div>
              </div>

              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition ${
                  currentTurn.speaker === 'Host'
                    ? 'bg-sky-500/15 border-sky-500/50 text-sky-200 shadow-md shadow-sky-500/10'
                    : 'bg-slate-900/80 border-slate-800 text-slate-500'
                }`}
              >
                <div className="relative">
                  <div className="w-6 h-6 rounded-full bg-sky-400 text-slate-950 font-black text-xs flex items-center justify-center">
                    H
                  </div>
                  {isPlaying && currentTurn.speaker === 'Host' && (
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-sky-400 animate-ping" />
                  )}
                </div>
                <div className="text-left">
                  <div className="text-[11px] font-black leading-tight">
                    Host
                  </div>
                  <div className="text-[9px] opacity-75 leading-tight">
                    Operations Guide
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Center Dynamic Visual Slide Stage */}
          <div className="p-6 min-h-[340px] flex flex-col justify-between gap-6 relative overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch">
              {/* Left 7 cols: Interactive Visual Diagram for Current Chapter */}
              <div className="md:col-span-7 rounded-2xl bg-slate-900/90 border border-slate-800 p-4 flex flex-col justify-between space-y-3">
                {currentChapter.id === 0 && (
                  <>
                    <div className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <Layers className="w-4 h-4" />
                      5 Core Commercial &amp; Operational Pillars
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {[
                        {
                          badge: '01',
                          title: 'Live Floor Visibility',
                          desc: 'Real-time timers across Kiosk, Handhelds & Pack Benches',
                          color: 'border-emerald-500/40 bg-emerald-950/20',
                        },
                        {
                          badge: '02',
                          title: '1-Tap Task Switching',
                          desc: 'Starting a new job atomically closes the prior timer',
                          color: 'border-sky-500/40 bg-sky-950/20',
                        },
                        {
                          badge: '03',
                          title: 'Mandatory Quantity Prompt',
                          desc: 'Declares units completed on every general & custom task close',
                          color: 'border-amber-500/40 bg-amber-950/20',
                        },
                        {
                          badge: '04',
                          title: 'Upward Billing Rounding',
                          desc: 'Rounds client billing up (5/6/10/15/30/60m); keeps exact payroll',
                          color: 'border-purple-500/40 bg-purple-950/20',
                        },
                      ].map((p) => (
                        <div
                          key={p.badge}
                          className={`rounded-xl border p-3 ${p.color}`}
                        >
                          <div className="text-[10px] font-black text-slate-400">
                            PILLAR {p.badge}
                          </div>
                          <div className="text-xs font-black text-white mt-0.5">
                            {p.title}
                          </div>
                          <div className="text-[11px] text-slate-300 mt-1">
                            {p.desc}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {currentChapter.id === 1 && (
                  <>
                    <div className="text-xs font-black uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                      <Tablet className="w-4 h-4" />
                      Live Kiosk Status Cards &amp; 3-Way Task Selector
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-center">
                        <span className="inline-block px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-black">
                          SLATE • OFF SHIFT
                        </span>
                        <div className="text-xs font-bold text-white mt-1.5">
                          Tariq Mahmood
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Tap → Clock In + Open /now
                        </div>
                      </div>
                      <div className="rounded-xl border border-sky-500/40 bg-sky-950/20 p-2.5 text-center">
                        <span className="inline-block px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-black">
                          SKY BLUE • IDLE
                        </span>
                        <div className="text-xs font-bold text-white mt-1.5">
                          Chloe Marsh
                        </div>
                        <div className="text-[10px] text-sky-200/80 mt-0.5">
                          On Shift • Ready for Task
                        </div>
                      </div>
                      <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/30 p-2.5 text-center">
                        <span className="inline-block px-2 py-0.5 rounded bg-emerald-500 text-slate-950 text-[10px] font-black">
                          EMERALD • ACTIVE
                        </span>
                        <div className="text-xs font-bold text-white mt-1.5">
                          Liam Grayson
                        </div>
                        <div className="text-[10px] text-emerald-300 mt-0.5 font-mono">
                          Pick &amp; Pack • 01:14:22
                        </div>
                      </div>
                    </div>
                    <div className="rounded-xl bg-slate-950 border border-slate-800 p-2.5 flex items-center justify-around text-[11px] font-bold text-slate-200">
                      <span>🎡 1. 3D Client Wheel</span>
                      <span>•</span>
                      <span>🔫 2. Barcode (BC-STD-PICK)</span>
                      <span>•</span>
                      <span>⚡ 3. 1-Tap Recent Chips</span>
                    </div>
                  </>
                )}

                {currentChapter.id === 2 && (
                  <>
                    <div className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <ClipboardCheck className="w-4 h-4" />
                      Mandatory Quantity Declaration on Every Task Close
                    </div>
                    <div className="rounded-xl border-2 border-amber-500/50 bg-slate-950 p-3.5 space-y-2.5 shadow-lg">
                      <div className="flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-black uppercase">
                          Triggered on Stop • Clock Out • Task Switch • /floor Stop
                        </span>
                        <span className="text-[10px] font-mono text-emerald-400">
                          General + Custom Tasks
                        </span>
                      </div>
                      <div className="text-sm font-black text-white">
                        How many units completed?
                      </div>
                      <div className="text-[11px] text-slate-300">
                        Closing Task:{' '}
                        <strong className="text-white">
                          Bespoke Relabelling &amp; Rework (Custom Task)
                        </strong>
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <div className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-emerald-500/50 text-emerald-300 font-mono text-sm font-black">
                          140 units
                        </div>
                        <div className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-black text-xs">
                          Save &amp; Complete →
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {currentChapter.id === 3 && (
                  <>
                    <div className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <Users className="w-4 h-4" />
                      Supervisor Floor Board (/floor) &amp; Crew Sync
                    </div>
                    <div className="space-y-2">
                      <div className="rounded-xl bg-slate-950 border border-emerald-500/40 p-3 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-black text-white">
                            Crew Batch Start • Container De-Vanning (40ft)
                          </div>
                          <div className="text-[11px] text-slate-400">
                            5 Operatives ticked • Linked via shared{' '}
                            <code className="text-emerald-300">crew_id</code>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-black text-xs">
                          SYNCED 00:42:18
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="rounded-lg bg-slate-950 border border-slate-800 p-2 text-slate-300">
                          <strong className="text-white">Remote Stop/Switch:</strong>{' '}
                          Supervisor declares quantity completed from desk
                        </div>
                        <div className="rounded-lg bg-slate-950 border border-slate-800 p-2 text-slate-300">
                          <strong className="text-white">Shift-End Close:</strong>{' '}
                          Caps orphaned timers at last physical activity
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {currentChapter.id === 4 && (
                  <>
                    <div className="text-xs font-black uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" />
                      3-Tier Billing Classification &amp; Unbill Protection
                    </div>
                    <div className="space-y-2">
                      <div className="rounded-lg bg-emerald-950/30 border border-emerald-500/40 p-2 flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 text-[10px] font-black">
                          AUTO BILLED
                        </span>
                        <span className="text-[11px] text-slate-200">
                          Standard contract work (Pick &amp; Pack, Goods-In)
                        </span>
                      </div>
                      <div className="rounded-lg bg-amber-950/30 border border-amber-500/40 p-2 flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-[10px] font-black">
                          NEEDS BILLED
                        </span>
                        <span className="text-[11px] text-slate-200">
                          Ad-hoc rework &amp; custom tasks → Billing Hub
                        </span>
                      </div>
                      <div className="rounded-lg bg-rose-950/30 border border-rose-500/40 p-2 flex items-center justify-between">
                        <span className="px-2 py-0.5 rounded bg-rose-500 text-white text-[10px] font-black">
                          OUR COST
                        </span>
                        <span className="text-[11px] text-rose-200">
                          Requires Mandatory Unbilled Reason + Audit Log
                        </span>
                      </div>
                    </div>
                  </>
                )}

                {currentChapter.id === 5 && (
                  <>
                    <div className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <FileSpreadsheet className="w-4 h-4" />
                      4-Tab Client Billing Excel Backing Pack (.XLSX)
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {
                          tab: 'Tab 1: Summary by Task',
                          desc: 'Rounded billable hours, £/hr rate & total charge per task',
                        },
                        {
                          tab: 'Tab 2: Itemised Audit Log',
                          desc: 'Chronological shift entries, raw vs rounded mins & notes',
                        },
                        {
                          tab: 'Tab 3: Daily Matrix Pivot',
                          desc: 'Day-by-day hours & revenue matrix across billing period',
                        },
                        {
                          tab: 'Tab 4: Order Ref Breakdown',
                          desc: 'Costs grouped by PO number, Container ID or Job Ref',
                        },
                      ].map((sheet) => (
                        <div
                          key={sheet.tab}
                          className="rounded-xl bg-slate-950 border border-slate-800 p-2.5"
                        >
                          <div className="text-xs font-black text-emerald-300">
                            {sheet.tab}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-1">
                            {sheet.desc}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {currentChapter.id === 6 && (
                  <>
                    <div className="text-xs font-black uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                      <Award className="w-4 h-4" />
                      Smart Target Governance &amp; Two-Point Approval
                    </div>
                    <div className="space-y-2">
                      <div className="rounded-xl bg-slate-950 border border-sky-500/40 p-2.5">
                        <div className="text-[10px] font-black text-sky-400 uppercase">
                          Statistical Readiness Guardrail
                        </div>
                        <div className="text-xs font-bold text-white mt-0.5">
                          Baseline Approved + ≥ 10 Runs + ≥ 30 Mins + ≥ 2 Operatives
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-950 border border-emerald-500/40 p-2.5">
                        <div className="text-[10px] font-black text-emerald-400 uppercase">
                          Two-Point Approval Workflow
                        </div>
                        <div className="text-xs font-bold text-white mt-0.5">
                          1. Supervisor Requests with Notes → 2. Admin Approves
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {currentChapter.id === 7 && (
                  <>
                    <div className="text-xs font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                      <Bug className="w-4 h-4" />
                      Offline IndexedDB Queue &amp; Global F8 Shortcut
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="rounded-xl bg-slate-950 border border-amber-500/40 p-3">
                        <div className="flex items-center gap-1.5 text-xs font-black text-amber-300">
                          <WifiOff className="w-3.5 h-3.5" />
                          Wi-Fi Dead-Zone Queue
                        </div>
                        <p className="text-[11px] text-slate-300 mt-1">
                          Stores task starts, stops &amp; unit declarations in IndexedDB and auto-replays on reconnect.
                        </p>
                      </div>
                      <div className="rounded-xl bg-slate-950 border border-rose-500/40 p-3">
                        <div className="flex items-center gap-1.5 text-xs font-black text-rose-300">
                          <Bug className="w-3.5 h-3.5" />
                          Global F8 Bug / Idea Key
                        </div>
                        <p className="text-[11px] text-slate-300 mt-1">
                          Press{' '}
                          <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-white font-mono">
                            F8
                          </kbd>{' '}
                          anywhere to log bugs or feature requests with route &amp; device metadata.
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Right 5 cols: Chapter Key Takeaways Checklist */}
              <div className="md:col-span-5 rounded-2xl bg-slate-900/70 border border-slate-800 p-4 flex flex-col justify-between">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    Chapter Key Takeaways
                  </div>
                  <ul className="space-y-2">
                    {currentChapter.keyTakeaways.map((item, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 text-xs text-slate-200 leading-snug"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    Turn {currentTurn.index + 1} of {PODCAST_TURNS.length}
                  </span>
                  <span className="font-mono text-emerald-400">
                    Chapter {currentChapter.id + 1} / 8
                  </span>
                </div>
              </div>
            </div>

            {/* Synchronized Cinema Closed-Caption Teleprompter Box */}
            <div className="rounded-2xl bg-slate-950/95 border border-slate-800 p-4 shadow-inner">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                      currentTurn.speaker === 'Josh'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-sky-400 text-slate-950'
                    }`}
                  >
                    {currentTurn.speaker} ({currentTurn.role})
                  </span>
                  {isPlaying && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-bold">
                      <Mic className="w-3 h-3 animate-pulse" />
                      Speaking now...
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  {formatSec(currentTurn.startSec)} – {formatSec(currentTurn.endSec)}
                </span>
              </div>
              <p className="text-sm sm:text-base font-medium text-slate-100 leading-relaxed">
                &ldquo;{currentTurn.text}&rdquo;
              </p>
            </div>
          </div>

          {/* Bottom Video / Podcast Transport Bar */}
          <div className="bg-slate-950 border-t border-slate-800 px-6 py-4 space-y-3">
            {/* Scrubber Timeline */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-emerald-400 w-10">
                {formatSec(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={TOTAL_DURATION_SEC}
                step={0.5}
                value={currentTime}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setCurrentTime(val);
                  if (!useWebSpeechFallback && audioRef.current) {
                    audioRef.current.currentTime = val;
                  } else {
                    const matched = PODCAST_TURNS.find(
                      (t) => val >= t.startSec && val < t.endSec
                    );
                    if (matched) setActiveTurnIndex(matched.index);
                  }
                }}
                className="flex-1 accent-emerald-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
              />
              <span className="text-xs font-mono text-slate-400 w-10 text-right">
                {formatSec(TOTAL_DURATION_SEC)}
              </span>
            </div>

            {/* Buttons Row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 transition"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-4 h-4 fill-current" />
                      Pause Walkthrough
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      Play Video &amp; Podcast
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => stepTurn(-1)}
                  title="Previous Dialogue Turn"
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  <Rewind className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => stepTurn(1)}
                  title="Next Dialogue Turn"
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  <FastForward className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={toggleMute}
                  title={isMuted ? 'Unmute' : 'Mute'}
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  {isMuted ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                  )}
                </button>
              </div>

              {/* Speed & Audio Engine Selector */}
              <div className="flex items-center gap-2">
                <div className="flex items-center rounded-xl bg-slate-900 border border-slate-800 p-1">
                  {[1, 1.25, 1.5].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => changeSpeed(spd)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-black transition ${
                        playbackRate === spd
                          ? 'bg-emerald-500 text-slate-950'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (audioRef.current) audioRef.current.pause();
                    setIsPlaying(false);
                    setUseWebSpeechFallback((prev) => !prev);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-bold text-slate-300 transition"
                >
                  {useWebSpeechFallback
                    ? 'Voice: Browser Neural TTS'
                    : 'Voice: Studio Neural MP3'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right 4 Columns: Clean Tabbed 8-Chapter Selector & Full Transcript */}
        <div className="xl:col-span-4 flex flex-col bg-slate-950/60">
          <div className="p-3 border-b border-slate-800 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarTab('chapters')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 ${
                sidebarTab === 'chapters'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <Headphones className="w-3.5 h-3.5" />
              8 Chapters
            </button>
            <button
              type="button"
              onClick={() => setSidebarTab('transcript')}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 ${
                sidebarTab === 'transcript'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              Full Transcript (27)
            </button>
          </div>

          {sidebarTab === 'chapters' ? (
            <div className="p-3 space-y-2 flex-1">
              {PODCAST_CHAPTERS.map((chap) => {
                const active = currentChapter.id === chap.id;
                return (
                  <button
                    key={chap.id}
                    type="button"
                    onClick={() => seekToChapter(chap.id)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl border transition flex items-center justify-between gap-3 ${
                      active
                        ? 'bg-emerald-500/15 border-emerald-500/60 text-white shadow-sm'
                        : 'bg-slate-900/70 border-slate-800/80 text-slate-300 hover:bg-slate-800/80'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-black truncate">
                        {chap.title}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {chap.subtitle}
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-[11px] font-mono font-bold text-emerald-400 shrink-0">
                      {formatSec(chap.startSec)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="max-h-[520px] overflow-y-auto p-3 space-y-2">
              {PODCAST_TURNS.map((turn) => {
                const isCurrent = turn.index === currentTurn.index;
                return (
                  <button
                    key={turn.index}
                    type="button"
                    onClick={() => seekToTurn(turn)}
                    className={`w-full text-left p-3 rounded-xl border transition ${
                      isCurrent
                        ? 'bg-slate-800/90 border-emerald-500/50 shadow-md'
                        : 'bg-slate-900/40 border-slate-800/60 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span
                        className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded ${
                          turn.speaker === 'Josh'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-sky-500/20 text-sky-300'
                        }`}
                      >
                        {turn.speaker} ({turn.role})
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {formatSec(turn.startSec)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {turn.text}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
