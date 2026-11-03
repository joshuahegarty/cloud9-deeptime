'use client';

import {
  getFeedbackReportsAction,
  submitFeedbackReportAction,
  updateFeedbackReportStatusAction,
} from '@/app/actions';
import { appendTranscript, VoiceMicButton } from '@/components/VoiceMicButton';
import {
  FeedbackReport,
  FeedbackSeverity,
  FeedbackStatus,
  FeedbackType,
  UserPublic,
} from '@/lib/types';
import {
  AlertTriangle,
  Bug,
  Camera,
  CheckCircle2,
  Clock,
  ExternalLink,
  ImagePlus,
  Lightbulb,
  ListFilter,
  MessageSquarePlus,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import React, { useCallback, useEffect, useRef, useState } from 'react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserPublic | null;
  currentPath: string;
}

export async function compressImageFileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1280;
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
        const compressed = canvas.toDataURL('image/jpeg', 0.78);
        resolve(compressed);
      };
      img.onerror = () => resolve(reader.result as string);
      img.src = reader.result as string;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

export const FEEDBACK_STATUS_META: Record<
  FeedbackStatus,
  { label: string; badgeClass: string; dotClass: string }
> = {
  open: {
    label: 'Open / New',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    dotClass: 'bg-sky-400',
  },
  planned: {
    label: 'Planned',
    badgeClass: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    dotClass: 'bg-purple-400',
  },
  in_progress: {
    label: 'Building Now',
    badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    dotClass: 'bg-amber-400',
  },
  resolved: {
    label: 'Shipped / Done',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    dotClass: 'bg-emerald-400',
  },
  closed: {
    label: 'Closed / Archived',
    badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
    dotClass: 'bg-slate-500',
  },
};

export function FeedbackModal({
  isOpen,
  onClose,
  user,
  currentPath,
}: FeedbackModalProps) {
  const [activeTab, setActiveTab] = useState<'submit' | 'list'>('submit');
  const [type, setType] = useState<FeedbackType>('bug');
  const [severity, setSeverity] = useState<FeedbackSeverity>('medium');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [pagePath, setPagePath] = useState(currentPath || '/');
  const [reporterName, setReporterName] = useState(user?.display_name || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const [reports, setReports] = useState<FeedbackReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'bug' | 'feature'>('all');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState<FeedbackStatus>('in_progress');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isStaff = user && (user.role === 'supervisor' || user.role === 'admin');

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      const res = await getFeedbackReportsAction();
      if (res.ok) {
        setReports(res.reports);
      }
    } finally {
      setLoadingReports(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setPagePath(
        typeof window !== 'undefined'
          ? window.location.pathname + window.location.search
          : currentPath || '/'
      );
      if (user?.display_name) {
        setReporterName(user.display_name);
      }
      setError(null);
      setSuccessMsg(null);
      loadReports();
    }
  }, [isOpen, currentPath, user, loadReports]);

  if (!isOpen) return null;

  const handleFilesSelected = async (files: FileList | File[] | null) => {
    if (!files) return;
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) return;

    const encoded: string[] = [];
    for (const file of list) {
      try {
        const dataUrl = await compressImageFileToDataUrl(file);
        encoded.push(dataUrl);
      } catch {
        // ignore failed file
      }
    }
    setAttachments((prev) => [...prev, ...encoded].slice(0, 6));
  };

  const handlePasteClipboard = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      await handleFilesSelected(imageFiles);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setSubmitting(true);

    try {
      const res = await submitFeedbackReportAction({
        type,
        severity,
        title,
        description,
        pagePath,
        reporterNameOverride: reporterName,
        attachments,
      });

      if (!res.ok) {
        setError(res.error || 'Could not submit report.');
      } else {
        setTitle('');
        setDescription('');
        setAttachments([]);
        setSuccessMsg(
          type === 'bug'
            ? 'Bug report logged! You can track progress on the Feedback & Roadmap Board.'
            : 'Feature request logged! Everyone can see its status on the Feedback & Roadmap Board.'
        );
        await loadReports();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (
    reportId: string,
    newStatus: FeedbackStatus,
    adminNote?: string
  ) => {
    const res = await updateFeedbackReportStatusAction({
      reportId,
      status: newStatus,
      adminNote,
    });
    if (res.ok) {
      setEditingNoteId(null);
      await loadReports();
    }
  };

  const filteredReports = reports.filter((r) =>
    filterType === 'all' ? true : r.type === filterType
  );

  const openCount = reports.filter(
    (r) => r.status === 'open' || r.status === 'planned' || r.status === 'in_progress'
  ).length;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="f8-feedback-title"
      onPaste={handlePasteClipboard}
    >
      <div className="w-full max-w-3xl rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-black text-xs tracking-wider">
              F8
            </span>
            <div>
              <h2
                id="f8-feedback-title"
                className="text-base sm:text-lg font-black text-white leading-tight"
              >
                Bug Report, Feature Request &amp; Roadmap Hub
              </h2>
              <p className="text-xs text-slate-400">
                Attach photos/screenshots (<kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[10px]">Ctrl+V</kbd> paste supported) &amp; track live progress on every request
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/feedback"
              onClick={onClose}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-xs font-black transition"
            >
              <span>Open Full Roadmap Board</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition"
              title="Close (Esc or F8)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="px-5 pt-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('submit')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-t-xl text-xs font-bold border-b-2 transition ${
                activeTab === 'submit'
                  ? 'border-emerald-400 text-emerald-300 bg-slate-800/60'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <MessageSquarePlus className="w-3.5 h-3.5" />
              Submit Bug / Feature
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('list')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-t-xl text-xs font-bold border-b-2 transition ${
                activeTab === 'list'
                  ? 'border-emerald-400 text-emerald-300 bg-slate-800/60'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              Live Roadmap &amp; Status Board
              <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-200 text-[10px] font-black">
                {reports.length}
              </span>
              {openCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                  {openCount} active
                </span>
              )}
            </button>
          </div>
          <Link
            href="/feedback"
            onClick={onClose}
            className="sm:hidden text-[11px] font-bold text-emerald-400 underline pb-1"
          >
            Full Board →
          </Link>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'submit' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type Toggle */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setType('bug')}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition ${
                    type === 'bug'
                      ? 'bg-rose-500/15 border-rose-500 text-white shadow-sm'
                      : 'bg-slate-800/50 border-slate-700/70 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      type === 'bug'
                        ? 'bg-rose-500 text-slate-950'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    <Bug className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-black">Bug Report</div>
                    <div className="text-[11px] text-slate-400">
                      Something is broken, slow, or calculating unexpectedly
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setType('feature')}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border text-left transition ${
                    type === 'feature'
                      ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-sm'
                      : 'bg-slate-800/50 border-slate-700/70 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      type === 'feature'
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    <Lightbulb className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-black">Feature Request</div>
                    <div className="text-[11px] text-slate-400">
                      Suggest a new workflow, report, shortcut, or improvement
                    </div>
                  </div>
                </button>
              </div>

              {/* Severity / Priority */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  {type === 'bug' ? 'Severity Level' : 'Impact / Priority'}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      {
                        value: 'low',
                        label: type === 'bug' ? 'Low / Minor' : 'Nice to Have',
                        activeClass: 'bg-slate-700 border-slate-400 text-white',
                      },
                      {
                        value: 'medium',
                        label: type === 'bug' ? 'Medium' : 'Helpful',
                        activeClass: 'bg-sky-500/20 border-sky-400 text-sky-200',
                      },
                      {
                        value: 'high',
                        label: type === 'bug' ? 'High' : 'High Impact',
                        activeClass: 'bg-amber-500/20 border-amber-400 text-amber-200',
                      },
                      {
                        value: 'critical',
                        label: type === 'bug' ? 'Critical / Blocker' : 'Essential',
                        activeClass: 'bg-rose-500/25 border-rose-400 text-rose-200',
                      },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setSeverity(item.value)}
                      className={`py-2 px-2.5 rounded-lg border text-xs font-bold transition ${
                        severity === item.value
                          ? item.activeClass
                          : 'bg-slate-800/40 border-slate-700/70 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary / Title */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label
                    htmlFor="f8-title-input"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-300"
                  >
                    Short Summary *
                  </label>
                  <VoiceMicButton
                    size="sm"
                    allowPhoto={false}
                    onTranscript={(spoken) => setTitle((prev) => appendTranscript(prev, spoken))}
                  />
                </div>
                <input
                  id="f8-title-input"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    type === 'bug'
                      ? 'e.g. Barcode scanner modal does not close after scanning order ref'
                      : 'e.g. Add pallet count total to the Floor live board header'
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Description + Photo Upload Box */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                  <label
                    htmlFor="f8-desc-input"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-300"
                  >
                    {type === 'bug'
                      ? 'What happened & steps to reproduce *'
                      : 'How should this feature work? *'}
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-emerald-400 font-semibold hidden sm:inline">
                      Tip: Paste a screenshot with Ctrl+V
                    </span>
                    <VoiceMicButton
                      size="sm"
                      onTranscript={(spoken) =>
                        setDescription((prev) => appendTranscript(prev, spoken))
                      }
                      onPhotoAttached={(dataUrl) =>
                        setAttachments((prev) =>
                          prev.length < 6 ? [...prev, dataUrl] : prev
                        )
                      }
                    />
                  </div>
                </div>
                <textarea
                  id="f8-desc-input"
                  rows={4}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    type === 'bug'
                      ? 'Describe what you clicked, what you expected to see, and what actually happened (you can paste screenshots directly into this box)...'
                      : 'Describe how this would help on the warehouse floor or in billing/reporting...'
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />

                {/* Photo & Screenshot Upload Strip */}
                <div className="mt-2.5 p-3 rounded-xl bg-slate-950/90 border border-dashed border-slate-700 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <Camera className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="font-bold">Photos &amp; Screenshots ({attachments.length}/6)</span>
                      <span className="text-[11px] text-slate-500 hidden sm:inline">
                        — Upload photos from your phone/PC or paste with Ctrl+V
                      </span>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        handleFilesSelected(e.target.files);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={attachments.length >= 6}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-40 text-emerald-300 border border-emerald-500/40 text-xs font-black inline-flex items-center gap-1.5 transition"
                    >
                      <ImagePlus className="w-3.5 h-3.5" />
                      + Attach Photo / Screenshot
                    </button>
                  </div>

                  {attachments.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
                      {attachments.map((src, idx) => (
                        <div
                          key={idx}
                          className="relative group rounded-lg overflow-hidden border border-slate-700 bg-slate-900 aspect-video flex items-center justify-center"
                        >
                          <img
                            src={src}
                            alt={`Attachment ${idx + 1}`}
                            onClick={() => setLightboxImage(src)}
                            className="w-full h-full object-cover cursor-pointer"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setAttachments((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="absolute top-1 right-1 p-1 rounded-md bg-rose-600/90 text-white opacity-90 hover:opacity-100"
                            title="Remove photo"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Context Metadata (Page & Reporter) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Screen / Page Path (Auto-Detected)
                  </label>
                  <input
                    type="text"
                    value={pagePath}
                    onChange={(e) => setPagePath(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-800 text-xs font-mono text-slate-300 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Reported By
                  </label>
                  <input
                    type="text"
                    value={reporterName}
                    onChange={(e) => setReporterName(e.target.value)}
                    placeholder="Your name"
                    className="w-full px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs font-semibold text-rose-200 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {successMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs font-semibold text-emerald-200 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{successMsg}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveTab('list')}
                      className="underline font-bold text-emerald-300 hover:text-white"
                    >
                      View Here →
                    </button>
                    <Link
                      href="/feedback"
                      onClick={onClose}
                      className="underline font-black text-white hover:text-emerald-300"
                    >
                      Open Full Board →
                    </Link>
                  </div>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 transition"
                >
                  <Send className="w-3.5 h-3.5" />
                  {submitting
                    ? 'Submitting...'
                    : type === 'bug'
                    ? 'Submit Bug Report'
                    : 'Submit Feature Request'}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {/* Filter Bar */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  {(['all', 'bug', 'feature'] as const).map((ft) => (
                    <button
                      key={ft}
                      type="button"
                      onClick={() => setFilterType(ft)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        filterType === ft
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {ft === 'all'
                        ? `All (${reports.length})`
                        : ft === 'bug'
                        ? `Bugs (${reports.filter((r) => r.type === 'bug').length})`
                        : `Features (${reports.filter((r) => r.type === 'feature').length})`}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('submit')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-bold border border-slate-700"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    + New Report
                  </button>
                  <Link
                    href="/feedback"
                    onClick={onClose}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-black"
                  >
                    <span>Full Board</span>
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>

              {loadingReports ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  Loading submitted reports...
                </div>
              ) : filteredReports.length === 0 ? (
                <div className="py-10 text-center rounded-xl bg-slate-950/50 border border-slate-800/80 p-6">
                  <p className="text-sm font-bold text-slate-300">
                    No reports or feature requests logged yet
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Press F8 anytime on any screen to log a bug or idea.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredReports.map((item) => {
                    const statusMeta =
                      FEEDBACK_STATUS_META[item.status] || FEEDBACK_STATUS_META.open;
                    const photos = Array.isArray(item.attachments) ? item.attachments : [];
                    const updates = Array.isArray(item.updates_log) ? item.updates_log : [];

                    return (
                      <div
                        key={item.id}
                        className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-black uppercase ${
                                item.type === 'bug'
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              }`}
                            >
                              {item.type === 'bug' ? (
                                <Bug className="w-3 h-3" />
                              ) : (
                                <Lightbulb className="w-3 h-3" />
                              )}
                              {item.type === 'bug' ? 'Bug' : 'Feature'}
                            </span>

                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase ${
                                item.severity === 'critical'
                                  ? 'bg-rose-600/30 text-rose-200'
                                  : item.severity === 'high'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : item.severity === 'medium'
                                  ? 'bg-sky-500/20 text-sky-300'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {item.severity}
                            </span>

                            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[11px] text-slate-400">
                              {item.page_path}
                            </span>
                          </div>

                          {/* Status Badge or Staff Selector */}
                          {isStaff ? (
                            <select
                              value={item.status}
                              onChange={(e) =>
                                handleStatusChange(
                                  item.id,
                                  e.target.value as FeedbackStatus
                                )
                              }
                              className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-200 focus:outline-none focus:border-emerald-500"
                            >
                              <option value="open">Open / New</option>
                              <option value="planned">Planned</option>
                              <option value="in_progress">Building Now (In Progress)</option>
                              <option value="resolved">Shipped / Done</option>
                              <option value="closed">Closed / Archived</option>
                            </select>
                          ) : (
                            <span
                              className={`px-2.5 py-0.5 rounded-md border text-[11px] font-black uppercase ${statusMeta.badgeClass}`}
                            >
                              {statusMeta.label}
                            </span>
                          )}
                        </div>

                        <div className="text-sm font-bold text-white">{item.title}</div>
                        <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                          {item.description}
                        </p>

                        {/* Attached Photos */}
                        {photos.length > 0 && (
                          <div className="flex flex-wrap gap-2 pt-1">
                            {photos.map((src, i) => (
                              <button
                                key={i}
                                type="button"
                                onClick={() => setLightboxImage(src)}
                                className="relative w-24 h-16 rounded-lg overflow-hidden border border-slate-700 hover:border-emerald-400 transition group"
                              >
                                <img
                                  src={src}
                                  alt={`Screenshot ${i + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Latest Admin / Josh Progress Update */}
                        {item.admin_note && (
                          <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-xs text-emerald-200">
                            <span className="font-black text-emerald-400">
                              Latest Progress Update:{' '}
                            </span>
                            {item.admin_note}
                          </div>
                        )}

                        {/* Progress Timeline */}
                        {updates.length > 1 && (
                          <div className="pl-3 border-l-2 border-slate-800 space-y-1 text-[11px] text-slate-400">
                            {updates.slice(-3).map((u) => (
                              <div key={u.id}>
                                <span className="font-bold text-slate-300">{u.author_name}</span>{' '}
                                <span className="text-emerald-400 font-semibold">
                                  [{FEEDBACK_STATUS_META[u.status]?.label || u.status}]
                                </span>
                                : {u.note}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500">
                          <div className="flex items-center gap-2">
                            <span>
                              By <strong className="text-slate-300">{item.reporter_name}</strong> ({item.reporter_role})
                            </span>
                            <span>•</span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(item.created_at).toLocaleString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>

                          {isStaff && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNoteId(
                                  editingNoteId === item.id ? null : item.id
                                );
                                setNoteDraft(item.admin_note || '');
                                setStatusDraft(item.status);
                              }}
                              className="text-emerald-400 hover:underline font-bold"
                            >
                              {item.admin_note ? '✏️ Post Progress Update' : '+ Post Progress Update'}
                            </button>
                          )}
                        </div>

                        {isStaff && editingNoteId === item.id && (
                          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-slate-900/90 p-2.5 rounded-xl border border-slate-800">
                            <select
                              value={statusDraft}
                              onChange={(e) =>
                                setStatusDraft(e.target.value as FeedbackStatus)
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-bold text-white"
                            >
                              <option value="open">Open / New</option>
                              <option value="planned">Planned</option>
                              <option value="in_progress">Building Now</option>
                              <option value="resolved">Shipped / Done</option>
                              <option value="closed">Closed</option>
                            </select>
                            <input
                              type="text"
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              placeholder="Write an update so the team can see what's happening..."
                              className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                            />
                            <VoiceMicButton
                              size="sm"
                              onTranscript={(spoken) =>
                                setNoteDraft((prev) => appendTranscript(prev, spoken))
                              }
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleStatusChange(item.id, statusDraft, noteDraft)
                              }
                              className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black"
                            >
                              Save Update
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Lightbox for Viewing Attached Photos */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[120] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh]">
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              className="absolute -top-3 -right-3 p-2 rounded-full bg-slate-800 text-white border border-slate-600 shadow-lg"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={lightboxImage}
              alt="Full size attachment"
              className="max-w-full max-h-[85vh] rounded-xl border border-slate-700 shadow-2xl object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
