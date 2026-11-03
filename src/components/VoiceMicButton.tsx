'use client';

import { Camera, Mic, MicOff, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

interface VoiceMicButtonProps {
  onTranscript: (text: string) => void;
  onPhotoAttached?: (dataUrl: string, fileName: string) => void;
  allowPhoto?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  label?: string;
}

async function compressNotePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 960;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(reader.result as string);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.onerror = () => reject(new Error('Could not decode image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export function VoiceMicButton({
  onTranscript,
  onPhotoAttached,
  allowPhoto = true,
  className = '',
  size = 'sm',
  label,
}: VoiceMicButtonProps) {
  const [listening, setListening] = useState(false);
  const [attachedPhotoUrl, setAttachedPhotoUrl] = useState<string | null>(null);
  const [attachedPhotoName, setAttachedPhotoName] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const toggleDictation = () => {
    if (typeof window === 'undefined') return;

    if (listening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      setListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        'Voice dictation is supported in Chrome, Edge, Android Chrome, and Safari. Please use a supported browser or type your note.'
      );
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-GB';
      recognition.interimResults = false;
      recognition.continuous = false;

      recognition.onstart = () => {
        setListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results || [])
          .map((res: any) => res[0]?.transcript || '')
          .join(' ')
          .trim();
        if (transcript) {
          onTranscript(transcript);
        }
      };

      recognition.onerror = () => {
        setListening(false);
      };

      recognition.onend = () => {
        setListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setListening(false);
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressNotePhoto(file);
      setAttachedPhotoUrl(dataUrl);
      setAttachedPhotoName(file.name);
      if (onPhotoAttached) {
        onPhotoAttached(dataUrl, file.name);
      } else {
        onTranscript(`[📷 Photo: ${file.name}]`);
      }
      try {
        window.localStorage.setItem(`c9_last_note_photo`, dataUrl);
      } catch {
        // ignore quota
      }
    } catch {
      // ignore
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className={`inline-flex flex-wrap items-center gap-1.5 shrink-0 ${className}`}>
      <button
        type="button"
        onClick={toggleDictation}
        title={
          listening
            ? 'Listening... Tap to stop voice dictation'
            : 'Tap to speak — transcribes your voice directly into the box'
        }
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-black transition shrink-0 ${
          size === 'sm' ? 'h-9 px-2.5 text-[11px]' : 'h-11 px-3.5 text-xs'
        } ${
          listening
            ? 'bg-rose-500 text-white border border-rose-300 shadow-lg shadow-rose-500/30 animate-pulse'
            : 'bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40'
        }`}
      >
        {listening ? (
          <>
            <MicOff className="w-3.5 h-3.5" />
            <span>{label ? 'Listening...' : 'Stop'}</span>
          </>
        ) : (
          <>
            <Mic className="w-3.5 h-3.5" />
            <span>{label ?? '🎤 Speak'}</span>
          </>
        )}
      </button>

      {allowPhoto && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach a photo or camera snapshot to this note"
            className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-black transition shrink-0 ${
              size === 'sm' ? 'h-9 px-2.5 text-[11px]' : 'h-11 px-3 text-xs'
            } bg-sky-500/15 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>📷 Photo</span>
          </button>

          {attachedPhotoUrl && (
            <div className="inline-flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-lg bg-slate-900 border border-sky-500/40">
              <button
                type="button"
                onClick={() => setShowPreviewModal(true)}
                className="flex items-center gap-1 text-[10px] font-bold text-sky-300 hover:underline"
                title="View attached photo"
              >
                <img
                  src={attachedPhotoUrl}
                  alt={attachedPhotoName || 'Attached photo'}
                  className="w-6 h-6 rounded object-cover border border-sky-400/50"
                />
                <span className="max-w-[75px] truncate">
                  {attachedPhotoName || 'Photo'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAttachedPhotoUrl(null);
                  setAttachedPhotoName(null);
                }}
                className="p-0.5 text-slate-400 hover:text-rose-400"
                title="Remove photo"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {showPreviewModal && attachedPhotoUrl && (
            <div
              onClick={() => setShowPreviewModal(false)}
              className="fixed inset-0 z-[90] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="relative max-w-lg w-full bg-slate-900 border border-slate-700 rounded-2xl p-3 shadow-2xl space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 truncate">
                    📷 {attachedPhotoName || 'Attached Note Photo'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPreviewModal(false)}
                    className="p-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <img
                  src={attachedPhotoUrl}
                  alt="Note attachment"
                  className="w-full max-h-[70vh] object-contain rounded-xl bg-slate-950"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function appendTranscript(currentValue: string, spoken: string): string {
  const cleanSpoken = spoken.trim();
  if (!cleanSpoken) return currentValue;
  const trimmedCurrent = currentValue.trim();
  if (!trimmedCurrent) {
    return cleanSpoken.charAt(0).toUpperCase() + cleanSpoken.slice(1);
  }
  return `${trimmedCurrent} ${cleanSpoken}`;
}
