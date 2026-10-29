'use client';

import React, { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center space-y-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
        <h2 className="text-xl font-black text-white">Something went wrong</h2>
        <p className="text-xs text-slate-400 font-mono break-words">
          {error?.message || 'An unexpected error occurred.'}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm transition"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
