'use client';

const DARTH_MARLEY_QUOTES = [
  "Yah mon... I find your lack of irie vibes disturbing. Don't worry about a thing, every little pallet gonna be alright.",
  "Luke... I am your Rasta. One Love, One Empire, One Warehouse, bredren. Feel the power of the Dub Side.",
  "No woman, no cry, no unbilled container inna Babylon. The Force is strong with Cloud Nine today, mon.",
  "You underestimate the power of the Dreadlock Sith, mon. Jammin' on the forklift until the shift is done.",
  "Search your feelings, bredren... you know the pick and pack is irie. Stir it up and join the Dark Side, yah mon.",
];

let quoteIndex = 0;

/**
 * Plays Darth Vader mechanical breathing + dub bass skank via Web Audio API,
 * followed by a deep-pitched Bob Marley x Darth Vader voice line via SpeechSynthesis.
 */
export function playDarthMarleyVoice(customQuote?: string): string {
  const quote =
    customQuote ||
    DARTH_MARLEY_QUOTES[quoteIndex++ % DARTH_MARLEY_QUOTES.length];

  if (typeof window === 'undefined') return quote;

  try {
    const AudioCtx =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // 1. Darth Vader mechanical respirator breath (Inhale + Exhale noise burst through bandpass filter)
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
        gain.gain.linearRampToValueAtTime(0.28, startTime + duration * 0.3);
        gain.gain.linearRampToValueAtTime(0.01, startTime + duration);

        whiteNoise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        whiteNoise.start(startTime);
        whiteNoise.stop(startTime + duration);
      };

      // Vader inhale (0.0s - 0.55s) & exhale (0.65s - 1.25s)
      createBreath(now, 0.55, 620);
      createBreath(now + 0.65, 0.6, 440);

      // 2. Warm Reggae Sub-Bass Dub Drop + Offbeat Skank Chord
      const bassOsc = ctx.createOscillator();
      const bassGain = ctx.createGain();
      bassOsc.type = 'sine';
      bassOsc.frequency.setValueAtTime(110, now + 0.15); // A2
      bassOsc.frequency.exponentialRampToValueAtTime(55, now + 0.9); // Drop to A1
      bassGain.gain.setValueAtTime(0.25, now + 0.15);
      bassGain.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
      bassOsc.connect(bassGain);
      bassGain.connect(ctx.destination);
      bassOsc.start(now + 0.15);
      bassOsc.stop(now + 1.15);
    }
  } catch {
    // Ignore audio context autoplay restrictions if triggered without gesture
  }

  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(quote);
      // Deep Darth Vader pitch + laid-back Bob Marley tempo
      utterance.pitch = 0.25;
      utterance.rate = 0.78;
      utterance.volume = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const deepVoice =
        voices.find((v) => /male|david|mark|daniel|george|uk|english/i.test(v.name)) ||
        voices[0];
      if (deepVoice) {
        utterance.voice = deepVoice;
      }

      window.speechSynthesis.speak(utterance);
    }
  } catch {
    // Ignore speech synthesis errors
  }

  return quote;
}
