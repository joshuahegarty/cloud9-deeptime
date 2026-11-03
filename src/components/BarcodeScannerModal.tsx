'use client';

import { BrowserMultiFormatReader } from '@zxing/browser';
import { Camera, QrCode, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { TaskType } from '@/lib/types';

interface BarcodeScannerModalProps {
  taskTypes: TaskType[];
  onDetected: (barcode: string) => void;
  onClose: () => void;
}

export function BarcodeScannerModal({
  taskTypes,
  onDetected,
  onClose,
}: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [cameraStatus, setCameraStatus] = useState<'starting' | 'active' | 'unavailable'>('starting');

  useEffect(() => {
    let controls: { stop: () => void } | null = null;
    let cancelled = false;

    async function startCamera() {
      if (!videoRef.current || typeof navigator === 'undefined' || !navigator.mediaDevices) {
        setCameraStatus('unavailable');
        return;
      }
      try {
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result) => {
            if (result && !cancelled) {
              const text = result.getText();
              if (text) {
                onDetected(text.trim());
              }
            }
          }
        );
        if (!cancelled) {
          setCameraStatus('active');
        }
      } catch {
        if (!cancelled) {
          setCameraStatus('unavailable');
        }
      }
    }

    startCamera();

    return () => {
      cancelled = true;
      if (controls) {
        try {
          controls.stop();
        } catch {
          // ignore
        }
      }
    };
  }, [onDetected]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualBarcode.trim()) {
      onDetected(manualBarcode.trim());
    }
  };

  const tasksWithBarcodes = taskTypes.filter((t) => Boolean(t.barcode));

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <QrCode className="w-6 h-6 text-emerald-400" />
            <h3 className="text-xl font-black text-white">Scan Task Barcode / QR</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Viewport */}
        <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-video flex items-center justify-center">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            muted
            playsInline
          />
          {cameraStatus !== 'active' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-slate-950/90">
              <Camera className="w-8 h-8 text-slate-400 mb-2" />
              <p className="text-sm font-bold text-slate-200">
                {cameraStatus === 'starting'
                  ? 'Initialising camera scanner (@zxing/browser)...'
                  : 'Camera not detected — use handheld scanner input or tap a task barcode below'}
              </p>
            </div>
          )}
        </div>

        {/* Handheld USB/Bluetooth Scanner or Manual Input */}
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            type="text"
            autoFocus
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value)}
            placeholder="Scan with handheld scanner or type barcode..."
            className="flex-1 h-14 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            className="btn-glove px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black"
          >
            Match
          </button>
        </form>

        {/* Quick Barcode Sheet for Warehouse Floor / Testing */}
        {tasksWithBarcodes.length > 0 && (
          <div className="pt-2 border-t border-slate-800">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Warehouse Barcode Catalogue (Tap to Simulate Scan):
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {tasksWithBarcodes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onDetected(t.barcode!)}
                  className="p-3 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left transition flex items-center justify-between"
                >
                  <div>
                    <div className="text-xs font-bold text-emerald-400 font-mono">
                      {t.barcode}
                    </div>
                    <div className="text-sm font-bold text-white">{t.name}</div>
                    <div className="text-[11px] text-slate-400">{t.client_name}</div>
                  </div>
                  <QrCode className="w-5 h-5 text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
