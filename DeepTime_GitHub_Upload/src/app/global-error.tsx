'use client';

import React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-950 text-white min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-xl">
          <h2 className="text-xl font-black text-white">Application Error</h2>
          <p className="text-xs text-slate-400 font-mono break-words">
            {error?.message || 'A critical error occurred.'}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm transition"
          >
            Reload Application
          </button>
        </div>
      </body>
    </html>
  );
}
