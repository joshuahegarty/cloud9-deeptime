'use client';

import {
  getFeedbackReportsAction,
  submitFeedbackReportAction,
  updateFeedbackReportStatusAction,
} from '@/app/actions';
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
  CheckCircle2,
  Clock,
  Lightbulb,
  ListFilter,
  MessageSquarePlus,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserPublic | null;
  currentPath: string;
}

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
  const [pagePath, setPagePath] = useState(currentPath || '/');
  const [reporterName, setReporterName] = useState(user?.display_name || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [reports, setReports] = useState<FeedbackReport[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'bug' | 'feature'>('all');
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

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
      });

      if (!res.ok) {
        setError(res.error || 'Could not submit report.');
      } else {
        setTitle('');
        setDescription('');
        setSuccessMsg(
          type === 'bug'
            ? 'Bug report logged! Thank you for helping improve Cloud9 DeepTime.'
            : 'Feature request logged! Thank you for your suggestion.'
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
    (r) => r.status === 'open' || r.status === 'in_progress'
  ).length;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="f8-feedback-title"
    >
      <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-700/80 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
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
                Bug Report &amp; Feature Request Hub
              </h2>
              <p className="text-xs text-slate-400">
                Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 font-mono text-[11px]">F8</kbd> at any time to report an issue or suggest an improvement
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition"
            title="Close (Esc or F8)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-5 pt-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2">
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
              Submit New
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
              Submitted Log
              <span className="px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-200 text-[10px] font-black">
                {reports.length}
              </span>
              {openCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                  {openCount} open
                </span>
              )}
            </button>
          </div>
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
                <label
                  htmlFor="f8-title-input"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1"
                >
                  Short Summary *
                </label>
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

              {/* Description */}
              <div>
                <label
                  htmlFor="f8-desc-input"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1"
                >
                  {type === 'bug'
                    ? 'What happened & steps to reproduce *'
                    : 'How should this feature work? *'}
                </label>
                <textarea
                  id="f8-desc-input"
                  rows={4}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    type === 'bug'
                      ? 'Describe what you clicked, what you expected to see, and what actually happened...'
                      : 'Describe how this would help on the warehouse floor or in billing/reporting...'
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
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
                  <button
                    type="button"
                    onClick={() => setActiveTab('list')}
                    className="underline font-bold text-emerald-300 hover:text-white shrink-0"
                  >
                    View Log →
                  </button>
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
                <button
                  type="button"
                  onClick={() => setActiveTab('submit')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-bold border border-slate-700"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  + New Report
                </button>
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
                <div className="space-y-2.5">
                  {filteredReports.map((item) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2"
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
                            className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[11px] font-bold text-slate-200 focus:outline-none focus:border-emerald-500"
                          >
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                            <option value="closed">Closed</option>
                          </select>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase ${
                              item.status === 'resolved'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : item.status === 'in_progress'
                                ? 'bg-amber-500/20 text-amber-300'
                                : item.status === 'closed'
                                ? 'bg-slate-800 text-slate-400'
                                : 'bg-sky-500/20 text-sky-300'
                            }`}
                          >
                            {item.status.replace('_', ' ')}
                          </span>
                        )}
                      </div>

                      <div className="text-sm font-bold text-white">{item.title}</div>
                      <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">
                        {item.description}
                      </p>

                      {item.admin_note && (
                        <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-xs text-emerald-200">
                          <span className="font-bold text-emerald-400">Admin Note: </span>
                          {item.admin_note}
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
                            }}
                            className="text-emerald-400 hover:underline font-semibold"
                          >
                            {item.admin_note ? 'Edit Note' : '+ Add Response Note'}
                          </button>
                        )}
                      </div>

                      {isStaff && editingNoteId === item.id && (
                        <div className="pt-2 flex items-center gap-2">
                          <input
                            type="text"
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            placeholder="Add resolution or team note..."
                            className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleStatusChange(item.id, item.status, noteDraft)
                            }
                            className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold"
                          >
                            Save Note
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
