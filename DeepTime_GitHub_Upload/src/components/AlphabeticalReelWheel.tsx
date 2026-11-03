'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { Client } from '@/lib/types';

export const REEL_LETTERS = [
  'ALL',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
  '#',
] as const;

export type ReelLetter = (typeof REEL_LETTERS)[number];

interface AlphabeticalReelWheelProps {
  selectedLetter: ReelLetter;
  onSelectLetter: (letter: ReelLetter) => void;
  clients: Client[];
  className?: string;
}

const TOTAL_LETTERS = REEL_LETTERS.length;
const SLOT_HEIGHT = 44; // height in px of each slot

// Web Audio API mechanical ratchet tick for analog fruit machine reel feel
let sharedAudioCtx: AudioContext | null = null;
function playRatchetTick(isMajor = false) {
  try {
    if (typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume();
    }

    const osc = sharedAudioCtx.createOscillator();
    const gain = sharedAudioCtx.createGain();

    osc.type = isMajor ? 'square' : 'triangle';
    const now = sharedAudioCtx.currentTime;
    osc.frequency.setValueAtTime(isMajor ? 880 : 540, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.018);

    gain.gain.setValueAtTime(isMajor ? 0.08 : 0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);

    osc.connect(gain);
    gain.connect(sharedAudioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.022);
  } catch {
    // Audio may fail if user hasn't interacted yet; ignore gracefully
  }
}

function triggerHaptic(durationMs = 6) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(durationMs);
    }
  } catch {
    // Ignore unsupported haptic environments
  }
}

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export function AlphabeticalReelWheel({
  selectedLetter,
  onSelectLetter,
  clients,
  className = '',
}: AlphabeticalReelWheelProps) {
  // Count clients per letter for badge indicators
  const clientCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: clients.length, '#': 0 };
    for (const letter of REEL_LETTERS) {
      if (letter !== 'ALL' && letter !== '#') {
        counts[letter] = 0;
      }
    }
    for (const c of clients) {
      const firstChar = (c.name || '').trim().charAt(0).toUpperCase();
      if (firstChar >= 'A' && firstChar <= 'Z') {
        counts[firstChar] = (counts[firstChar] || 0) + 1;
      } else {
        counts['#'] = (counts['#'] || 0) + 1;
      }
    }
    return counts;
  }, [clients]);

  // Find index of incoming selected letter
  const selectedIndex = useMemo(() => {
    const idx = REEL_LETTERS.indexOf(selectedLetter);
    return idx >= 0 ? idx : 0;
  }, [selectedLetter]);

  // Current continuous float position along the reel
  const [reelPosition, setReelPosition] = useState<number>(selectedIndex);

  // References for drag & physics animation loop
  const posRef = useRef<number>(selectedIndex);
  const animFrameRef = useRef<number | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartYRef = useRef<number>(0);
  const dragStartPosRef = useRef<number>(selectedIndex);
  const velocitySamplesRef = useRef<{ y: number; time: number }[]>([]);
  const lastTickSlotRef = useRef<number>(selectedIndex);

  // Right-hand scrubber references
  const scrubberRef = useRef<HTMLDivElement | null>(null);
  const [isScrubbing, setIsScrubbing] = useState<boolean>(false);
  const [scrubPreview, setScrubPreview] = useState<{
    letter: ReelLetter;
    topPx: number;
    count: number;
  } | null>(null);

  // Synchronize internal position if parent selectedLetter changes externally
  useEffect(() => {
    if (!isDraggingRef.current && !isScrubbing) {
      // Find shortest circular delta to new index
      const curr = posRef.current;
      const target = selectedIndex;
      const directDiff = target - mod(curr, TOTAL_LETTERS);
      let circularDiff = directDiff;
      if (directDiff > TOTAL_LETTERS / 2) {
        circularDiff -= TOTAL_LETTERS;
      } else if (directDiff < -TOTAL_LETTERS / 2) {
        circularDiff += TOTAL_LETTERS;
      }
      const newPos = curr + circularDiff;

      // Animate smoothly to new position
      let startTime: number | null = null;
      const fromPos = curr;
      const duration = 280;

      const animateStep = (now: number) => {
        if (startTime === null) startTime = now;
        const progress = Math.min((now - startTime) / duration, 1);
        // Ease-out cubic
        const ease = 1 - Math.pow(1 - progress, 3);
        const nextPos = fromPos + (newPos - fromPos) * ease;
        posRef.current = nextPos;
        setReelPosition(nextPos);

        const currentSlot = Math.round(nextPos);
        if (currentSlot !== lastTickSlotRef.current) {
          lastTickSlotRef.current = currentSlot;
          playRatchetTick(false);
          triggerHaptic(4);
        }

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(animateStep);
        } else {
          posRef.current = target;
          setReelPosition(target);
          lastTickSlotRef.current = target;
        }
      };

      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = requestAnimationFrame(animateStep);
    }
  }, [selectedIndex, isScrubbing]);

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Helper to commit a settled index to parent
  const commitSettledIndex = useCallback(
    (index: number) => {
      const wrapped = mod(index, TOTAL_LETTERS);
      const chosen = REEL_LETTERS[wrapped];
      onSelectLetter(chosen);
      playRatchetTick(true);
      triggerHaptic(10);
    },
    [onSelectLetter]
  );

  // Physics animation: inertia decay + magnetic spring snap
  const startPhysicsSpin = useCallback(
    (initialVelocity: number) => {
      // initialVelocity in slots per millisecond
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

      let velocity = initialVelocity;
      let lastTime = performance.now();
      const friction = 0.0035; // velocity decay factor per ms

      const physicsLoop = (currentTime: number) => {
        const dt = Math.min(currentTime - lastTime, 48); // clamp frame delta
        lastTime = currentTime;

        if (Math.abs(velocity) > 0.0006) {
          // Inertia phase: update position and decay velocity
          posRef.current += velocity * dt;
          setReelPosition(posRef.current);

          const currentSlot = Math.round(posRef.current);
          if (currentSlot !== lastTickSlotRef.current) {
            lastTickSlotRef.current = currentSlot;
            playRatchetTick(false);
            triggerHaptic(5);
          }

          // Exponential friction decay
          velocity *= Math.max(0, 1 - friction * dt);
          animFrameRef.current = requestAnimationFrame(physicsLoop);
        } else {
          // Switch to magnetic spring settle to nearest slot
          const targetSlot = Math.round(posRef.current);
          let springPos = posRef.current;
          let springVel = velocity;
          const springTension = 0.018;
          const springDamping = 0.16;

          const springStep = (springTime: number) => {
            const sdt = Math.min(springTime - lastTime, 48);
            lastTime = springTime;

            const displacement = springPos - targetSlot;
            const force = -springTension * displacement;
            springVel = (springVel + force * sdt) * (1 - springDamping);
            springPos += springVel * sdt;

            posRef.current = springPos;
            setReelPosition(springPos);

            if (Math.abs(displacement) < 0.005 && Math.abs(springVel) < 0.0005) {
              // Settled!
              posRef.current = targetSlot;
              setReelPosition(targetSlot);
              lastTickSlotRef.current = targetSlot;
              commitSettledIndex(targetSlot);
            } else {
              animFrameRef.current = requestAnimationFrame(springStep);
            }
          };

          animFrameRef.current = requestAnimationFrame(springStep);
        }
      };

      animFrameRef.current = requestAnimationFrame(physicsLoop);
    },
    [commitSettledIndex]
  );

  // Wheel interaction (mouse scroll)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    const deltaSlots = (e.deltaY / 120) * 0.8;
    const newPos = posRef.current + deltaSlots;
    posRef.current = newPos;
    setReelPosition(newPos);

    const currentSlot = Math.round(newPos);
    if (currentSlot !== lastTickSlotRef.current) {
      lastTickSlotRef.current = currentSlot;
      playRatchetTick(false);
      triggerHaptic(5);
    }

    // Launch gentle spring snap
    startPhysicsSpin(deltaSlots * 0.004);
  };

  // Drag interaction on the reel wheel
  const handlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    isDraggingRef.current = true;
    dragStartYRef.current = e.clientY;
    dragStartPosRef.current = posRef.current;
    velocitySamplesRef.current = [{ y: e.clientY, time: performance.now() }];

    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const now = performance.now();
    const deltaY = e.clientY - dragStartYRef.current;
    // Drag down moves reel down (decreases index), drag up moves reel up (increases index)
    const newPos = dragStartPosRef.current - deltaY / SLOT_HEIGHT;

    posRef.current = newPos;
    setReelPosition(newPos);

    const currentSlot = Math.round(newPos);
    if (currentSlot !== lastTickSlotRef.current) {
      lastTickSlotRef.current = currentSlot;
      playRatchetTick(false);
      triggerHaptic(5);
    }

    // Record sample for velocity estimation
    velocitySamplesRef.current.push({ y: e.clientY, time: now });
    if (velocitySamplesRef.current.length > 5) {
      velocitySamplesRef.current.shift();
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }

    // Calculate release velocity
    const samples = velocitySamplesRef.current;
    let releaseVelocity = 0;
    if (samples.length >= 2) {
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = last.time - first.time;
      if (dt > 8) {
        // px per millisecond -> slots per millisecond
        const pxPerMs = (last.y - first.y) / dt;
        // Flick up (negative deltaY) moves reel forward (positive slots)
        releaseVelocity = -pxPerMs / SLOT_HEIGHT;
      }
    }

    // Clamp max velocity
    const maxVelocity = 0.05; // ~50 slots per sec maximum
    const clampedVelocity = Math.max(
      -maxVelocity,
      Math.min(maxVelocity, releaseVelocity)
    );

    startPhysicsSpin(clampedVelocity);
  };

  // Nudge buttons (+1 / -1)
  const nudgeReel = (direction: -1 | 1) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    const targetSlot = Math.round(posRef.current) + direction;
    startPhysicsSpin(direction * 0.008);
  };

  // Click on a specific slot directly
  const handleSlotClick = (slotOffset: number) => {
    if (slotOffset === 0) return;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    const targetSlot = Math.round(posRef.current) + slotOffset;
    startPhysicsSpin(slotOffset * 0.006);
  };

  // Vertical phone-style A-Z scrubber handlers
  const handleScrubberInteract = (clientY: number) => {
    if (!scrubberRef.current) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const clampedY = Math.max(0, Math.min(relativeY, rect.height - 1));
    const ratio = clampedY / rect.height;
    const letterIndex = Math.min(
      Math.floor(ratio * TOTAL_LETTERS),
      TOTAL_LETTERS - 1
    );
    const targetLetter = REEL_LETTERS[letterIndex];

    setIsScrubbing(true);
    setScrubPreview({
      letter: targetLetter,
      topPx: clampedY,
      count: clientCounts[targetLetter] || 0,
    });

    if (targetLetter !== selectedLetter) {
      onSelectLetter(targetLetter);
      playRatchetTick(false);
      triggerHaptic(5);
    }
  };

  const handleScrubberPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    handleScrubberInteract(e.clientY);
  };

  const handleScrubberPointerMove = (e: React.PointerEvent) => {
    if (!isScrubbing) return;
    handleScrubberInteract(e.clientY);
  };

  const handleScrubberPointerUp = (e: React.PointerEvent) => {
    setIsScrubbing(false);
    setScrubPreview(null);
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // Ignore
    }
    playRatchetTick(true);
    triggerHaptic(8);
  };

  // Render exactly 5 visible slots: 1 center, 2 above, 2 below
  // We compute relative distances from current continuous reelPosition
  const centerSlotIndex = Math.round(reelPosition);
  const visibleOffsets = [-2, -1, 0, 1, 2] as const;

  return (
    <div
      className={`relative flex items-stretch gap-3 select-none ${className}`}
    >
      {/* ARCADE MACHINE REEL HOUSING */}
      <div className="relative flex-1 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 rounded-2xl border-2 border-slate-800 shadow-[inset_0_2px_12px_rgba(0,0,0,0.8),0_4px_16px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col items-center">
        {/* Arcade Cabinet Top Bezel & Rivets */}
        <div className="w-full px-3 py-1.5 bg-gradient-to-r from-slate-950 via-slate-800/80 to-slate-950 border-b border-slate-800/80 flex items-center justify-between text-[10px] font-mono font-bold tracking-wider text-teal-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10B981]" />
            <span>ALPHABETIC REEL</span>
          </div>
          <button
            type="button"
            onClick={() => nudgeReel(-1)}
            className="p-0.5 rounded hover:bg-slate-700/60 text-slate-400 hover:text-white transition"
            title="Nudge Previous Letter"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>

        {/* 3D DRUM VIEWPORT */}
        <div
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="relative w-full h-[230px] flex items-center justify-center cursor-grab active:cursor-grabbing touch-none overflow-hidden"
          style={{
            perspective: '750px',
            perspectiveOrigin: '50% 50%',
          }}
        >
          {/* Top Drum Cylindrical Shadow Vignette */}
          <div className="pointer-events-none absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-slate-950 via-slate-950/80 to-transparent z-20" />

          {/* Bottom Drum Cylindrical Shadow Vignette */}
          <div className="pointer-events-none absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent z-20" />

          {/* Curved Glass Reflection Overlay */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.07] via-transparent to-white/[0.02] z-20" />

          {/* PAYLINE CENTER BEZEL (CENTER SLOT HIGHLIGHT RAILS) */}
          <div className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 h-[50px] rounded-xl border border-teal-500/40 bg-teal-500/[0.08] shadow-[0_0_15px_rgba(45,212,191,0.15),inset_0_1px_1px_rgba(255,255,255,0.15)] flex items-center justify-between px-3 z-10">
            {/* Left Payline Chevron Pointer */}
            <div className="flex items-center gap-1 text-[#2DD4BF] font-black text-xs">
              <span className="inline-block animate-pulse">►</span>
            </div>
            {/* Right Payline Chevron Pointer */}
            <div className="flex items-center gap-1 text-[#2DD4BF] font-black text-xs">
              <span className="inline-block animate-pulse">◄</span>
            </div>
          </div>

          {/* 5 VISIBLE SLOTS (1 in center, 2 above, 2 below, changing angle dynamically) */}
          <div className="relative w-full h-full flex items-center justify-center pointer-events-none">
            {visibleOffsets.map((offset) => {
              // Exact fractional distance of this virtual slot from the center
              const distance = offset + (centerSlotIndex - reelPosition);
              const wrappedIndex = mod(centerSlotIndex + offset, TOTAL_LETTERS);
              const letter = REEL_LETTERS[wrappedIndex];
              const count = clientCounts[letter] || 0;
              const isCenter = Math.abs(distance) < 0.5;

              // 3D cylindrical geometry calculations
              // Angle rotates away from viewer as distance from center increases
              const rotateXDeg = distance * -24;
              // TranslateZ curves back away into the drum
              const translateZ = Math.cos(distance * 0.48) * 38 - 38;
              const translateY = distance * SLOT_HEIGHT;
              const scale = Math.max(0.68, 1 - Math.abs(distance) * 0.16);
              const opacity = Math.max(
                0.2,
                1 - Math.min(Math.abs(distance) * 0.38, 0.8)
              );

              return (
                <div
                  key={`${offset}-${wrappedIndex}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSlotClick(offset);
                  }}
                  className={`pointer-events-auto absolute inset-x-4 h-[44px] flex items-center justify-center transition-transform duration-75 ease-out select-none cursor-pointer ${
                    isCenter ? 'font-black' : 'font-semibold'
                  }`}
                  style={{
                    transform: `translateY(${translateY}px) translateZ(${translateZ}px) rotateX(${rotateXDeg}deg) scale(${scale})`,
                    opacity,
                    transformOrigin: '50% 50%',
                  }}
                >
                  <div
                    className={`w-full max-w-[220px] py-1.5 px-4 rounded-xl flex items-center justify-between transition ${
                      isCenter
                        ? 'bg-gradient-to-r from-teal-500/20 via-teal-400/25 to-teal-500/20 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`font-mono ${
                          letter === 'ALL'
                            ? 'text-sm sm:text-base font-black tracking-widest text-[#2DD4BF]'
                            : 'text-xl sm:text-2xl font-black text-white'
                        }`}
                      >
                        {letter}
                      </span>
                      {letter === 'ALL' && (
                        <span className="text-[10px] uppercase font-bold text-teal-400/80 tracking-wide">
                          Directory
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      {count > 0 ? (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold transition ${
                            isCenter
                              ? 'bg-[#2DD4BF] text-slate-950 font-black shadow-sm'
                              : 'bg-slate-800 text-teal-300/80 border border-teal-500/20'
                          }`}
                        >
                          {count} {count === 1 ? 'client' : 'clients'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-600 font-mono">
                          0
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Arcade Cabinet Bottom Bezel */}
        <div className="w-full px-3 py-1.5 bg-gradient-to-r from-slate-950 via-slate-800/80 to-slate-950 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono font-bold tracking-wider text-slate-400">
          <span className="text-[11px] text-slate-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[#2DD4BF]" />
            <span>Flick to spin · Tap to jump</span>
          </span>
          <button
            type="button"
            onClick={() => nudgeReel(1)}
            className="p-0.5 rounded hover:bg-slate-700/60 text-slate-400 hover:text-white transition"
            title="Nudge Next Letter"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* A TO Z VERTICAL SCRUBBER PHONE STRIP (RIGHT EDGE) */}
      <div className="relative flex items-center shrink-0">
        <div
          ref={scrubberRef}
          onPointerDown={handleScrubberPointerDown}
          onPointerMove={handleScrubberPointerMove}
          onPointerUp={handleScrubberPointerUp}
          onPointerCancel={handleScrubberPointerUp}
          className="h-[270px] w-8 sm:w-9 py-2 px-1 rounded-2xl bg-slate-950 border border-slate-800/90 shadow-inner flex flex-col justify-between items-center cursor-pointer select-none touch-none hover:border-teal-500/40 transition"
          title="Scan thumb up & down A-Z"
        >
          {REEL_LETTERS.map((letter) => {
            const isCurrent = letter === selectedLetter;
            const hasClients = (clientCounts[letter] || 0) > 0;

            return (
              <div
                key={letter}
                className={`w-full flex items-center justify-center transition-all ${
                  isCurrent
                    ? 'scale-125 font-black'
                    : 'scale-100 font-medium'
                }`}
                style={{ height: `${100 / TOTAL_LETTERS}%` }}
              >
                <span
                  className={`text-[8.5px] sm:text-[9.5px] leading-none transition ${
                    isCurrent
                      ? 'text-[#2DD4BF] font-black'
                      : hasClients
                      ? 'text-slate-300 font-bold hover:text-white'
                      : 'text-slate-600'
                  }`}
                >
                  {letter === 'ALL' ? '•' : letter}
                </span>
              </div>
            );
          })}
        </div>

        {/* FLOATING MAGNIFYING BUBBLE (Appears to the left of the user's thumb when scrubbing) */}
        {isScrubbing && scrubPreview && (
          <div
            className="absolute right-12 -translate-y-1/2 z-50 pointer-events-none transition-all duration-75"
            style={{ top: scrubPreview.topPx }}
          >
            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-slate-900 border-2 border-[#2DD4BF] shadow-[0_10px_30px_rgba(0,0,0,0.8),0_0_20px_rgba(45,212,191,0.4)] text-white">
              <span className="text-2xl font-black font-mono text-[#2DD4BF]">
                {scrubPreview.letter}
              </span>
              <div className="flex flex-col text-left">
                <span className="text-[10px] uppercase font-bold text-slate-400">
                  Letter
                </span>
                <span className="text-[11px] font-bold text-white whitespace-nowrap">
                  {scrubPreview.count}{' '}
                  {scrubPreview.count === 1 ? 'client' : 'clients'}
                </span>
              </div>
              {/* Pointer triangle towards scrubber */}
              <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-0 h-0 border-y-8 border-y-transparent border-l-8 border-l-[#2DD4BF]" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
