'use client';

import {
  getFeedbackReportsAction,
  submitFeedbackReportAction,
  updateFeedbackReportStatusAction,
} from '@/app/actions';
import {
  compressImageFileToDataUrl,
  FEEDBACK_STATUS_META,
} from '@/components/FeedbackModal';
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
  ImagePlus,
  LayoutGrid,
  Lightbulb,
  List,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface FeedbackBoardClientProps {
  initialReports: FeedbackReport[];
  user: UserPublic;
}

const KANBAN_COLUMNS: Array<{
  status: FeedbackStatus;
  title: string;
  subtitle: string;
  accentBorder: string;
}> = [
  {
    status: 'open',
    title: 'Open / New',
    subtitle: 'Newly submitted requests & bug reports',
    accentBorder: 'border-t-sky-400',
  },
  {
    status: 'planned',
    title: 'Planned',
    subtitle: 'Approved & queued for upcoming sprint',
    accentBorder: 'border-t-purple-400',
  },
  {
    status: 'in_progress',
    title: 'Building Now',
    subtitle: 'Actively being built or fixed right now',
    accentBorder: 'border-t-amber-400',
  },
  {
    status: 'resolved',
    title: 'Shipped / Done',
    subtitle: 'Completed & deployed live for the team',
    accentBorder: 'border-t-emerald-400',
  },
];

export function FeedbackBoardClient({
  initialReports,
  user,
}: FeedbackBoardClientProps) {
  const [reports, setReports] = useState<FeedbackReport[]>(initialReports);
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  const [filterType, setFilterType] = useState<'all' | 'feature' | 'bug'>('all');
  const [searchText, setSearchText] = useState('');
  const [showClosed, setShowClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Quick Submit Modal / Drawer state
  const [showNewModal, setShowNewModal] = useState(false);
  const [newType, setNewType] = useState<FeedbackType>('feature');
  const [newSeverity, setNewSeverity] = useState<FeedbackSeverity>('medium');
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPagePath, setNewPagePath] = useState('/now');
  const [newAttachments, setNewAttachments] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Inline Progress Update state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<FeedbackStatus>('in_progress');
  const [noteDraft, setNoteDraft] = useState('');

  const isStaff = user.role === 'supervisor' || user.role === 'admin';

  const refreshReports = useCallback(async () => {
    setBusy(true);
    try {
      const res = await getFeedbackReportsAction();
      if (res.ok) {
        setReports(res.reports);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    setReports(initialReports);
  }, [initialReports]);

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (!showClosed && r.status === 'closed' && viewMode === 'list') return false;
      if (filterType !== 'all' && r.type !== filterType) return false;
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        const hay = `${r.title} ${r.description} ${r.reporter_name} ${r.admin_note || ''} ${r.page_path}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [reports, filterType, searchText, showClosed, viewMode]);

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
        // ignore
      }
    }
    setNewAttachments((prev) => [...prev, ...encoded].slice(0, 6));
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

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDesc.trim()) return;
    setBusy(true);
    const res = await submitFeedbackReportAction({
      type: newType,
      severity: newSeverity,
      title: newTitle,
      description: newDesc,
      pagePath: newPagePath,
      reporterNameOverride: user.display_name,
      attachments: newAttachments,
    });
    setBusy(false);

    if (res.ok) {
      setNewTitle('');
      setNewDesc('');
      setNewAttachments([]);
      setShowNewModal(false);
      setBanner(
        `Submitted new ${newType === 'feature' ? 'Feature Request' : 'Bug Report'}: "${newTitle.trim()}"`
      );
      await refreshReports();
    } else {
      setBanner(res.error || 'Could not submit.');
    }
  };

  const handleQuickUpdate = async (
    reportId: string,
    nextStatus: FeedbackStatus,
    note?: string
  ) => {
    setBusy(true);
    const res = await updateFeedbackReportStatusAction({
      reportId,
      status: nextStatus,
      adminNote: note,
    });
    setBusy(false);
    if (res.ok) {
      setEditingId(null);
      setBanner('Updated status and posted progress note for the team.');
      await refreshReports();
    }
  };

  const renderReportCard = (item: FeedbackReport) => {
    const statusMeta =
      FEEDBACK_STATUS_META[item.status] || FEEDBACK_STATUS_META.open;
    const photos = Array.isArray(item.attachments) ? item.attachments : [];
    const updates = Array.isArray(item.updates_log) ? item.updates_log : [];
    const isEditing = editingId === item.id;

    return (
      <div
        key={item.id}
        className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 hover:border-slate-700 transition space-y-3 shadow-lg"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                item.type === 'bug'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/35'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35'
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
              className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                item.severity === 'critical'
                  ? 'bg-rose-600/30 text-rose-200 border border-rose-500/40'
                  : item.severity === 'high'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : item.severity === 'medium'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {item.severity}
            </span>

            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono text-[10px] text-slate-400">
              {item.page_path}
            </span>
          </div>

          {isStaff ? (
            <select
              value={item.status}
              disabled={busy}
              onChange={(e) =>
                handleQuickUpdate(item.id, e.target.value as FeedbackStatus)
              }
              className={`px-2 py-1 rounded-lg border text-[11px] font-black uppercase focus:outline-none ${statusMeta.badgeClass} bg-slate-900`}
            >
              <option value="open">Open / New</option>
              <option value="planned">Planned</option>
              <option value="in_progress">Building Now</option>
              <option value="resolved">Shipped / Done</option>
              <option value="closed">Closed / Archived</option>
            </select>
          ) : (
            <span
              className={`px-2.5 py-0.5 rounded-md border text-[10px] font-black uppercase ${statusMeta.badgeClass}`}
            >
              {statusMeta.label}
            </span>
          )}
        </div>

        <div>
          <h3 className="text-sm sm:text-base font-black text-white leading-snug">
            {item.title}
          </h3>
          <p className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed mt-1">
            {item.description}
          </p>
        </div>

        {/* Photo / Screenshot Thumbnails */}
        {photos.length > 0 && (
          <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Attached Photos ({photos.length}) — Click to enlarge
            </div>
            <div className="flex flex-wrap gap-2">
              {photos.map((src, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setLightboxImage(src)}
                  className="relative w-24 h-16 rounded-xl overflow-hidden border border-slate-700 hover:border-emerald-400 transition shadow"
                >
                  <img
                    src={src}
                    alt={`Attachment ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Latest Update Banner */}
        {item.admin_note && (
          <div className="p-3 rounded-xl bg-emerald-950/35 border border-emerald-500/35 text-xs text-emerald-200 space-y-0.5">
            <div className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              What&apos;s Happening / Latest Update
            </div>
            <div className="font-semibold text-white">{item.admin_note}</div>
          </div>
        )}

        {/* Activity / Update Log */}
        {updates.length > 0 && (
          <div className="pl-3 border-l-2 border-slate-800 space-y-1 text-[11px] text-slate-400">
            {updates.slice(-3).map((u) => (
              <div key={u.id} className="leading-snug">
                <span className="font-bold text-slate-200">{u.author_name}</span>{' '}
                <span className="text-emerald-400 font-bold">
                  ({FEEDBACK_STATUS_META[u.status]?.label || u.status})
                </span>
                : {u.note}
              </div>
            ))}
          </div>
        )}

        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <div>
            Logged by <strong className="text-slate-200">{item.reporter_name}</strong> ·{' '}
            {new Date(item.created_at).toLocaleString('en-GB', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </div>

          {isStaff && (
            <button
              type="button"
              onClick={() => {
                if (isEditing) {
                  setEditingId(null);
                } else {
                  setEditingId(item.id);
                  setStatusDraft(item.status);
                  setNoteDraft(item.admin_note || '');
                }
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-800 font-bold text-[11px] transition"
            >
              {isEditing ? 'Cancel' : '✏️ Update Progress'}
            </button>
          )}
        </div>

        {isStaff && isEditing && (
          <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/40 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-black uppercase tracking-wider text-emerald-400">
                Update Status &amp; Post Progress Note for Team
              </div>
              <VoiceMicButton
                size="sm"
                onTranscript={(spoken) =>
                  setNoteDraft((prev) => appendTranscript(prev, spoken))
                }
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <select
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value as FeedbackStatus)}
                className="h-10 px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-bold text-white"
              >
                <option value="open">Open / New</option>
                <option value="planned">Planned</option>
                <option value="in_progress">Building Now</option>
                <option value="resolved">Shipped / Done</option>
                <option value="closed">Closed / Archived</option>
              </select>
              <input
                type="text"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="What's been done or what's happening next..."
                className="sm:col-span-2 h-10 px-3 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handleQuickUpdate(item.id, statusDraft, noteDraft)}
                className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black"
              >
                Save &amp; Publish Update
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-xl">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-400">
            <Sparkles className="w-3.5 h-3.5" />
            Cloud9 DeepTime · F8 Feedback &amp; Feature Roadmap
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white mt-0.5">
            Feature Requests, Bug Reports &amp; Live Progress
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Everyone on the team can log ideas or bugs with photos (press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 font-mono">F8</kbd> anywhere) and see what is Planned, Building Now, and Shipped.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="btn-glove px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-black shadow-lg shadow-emerald-500/20 flex items-center gap-2"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            Log Bug / Feature Request (with Photos)
          </button>

          <button
            type="button"
            onClick={refreshReports}
            disabled={busy}
            className="btn-glove p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            title="Refresh board"
          >
            <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {banner && (
        <div className="p-4 rounded-xl bg-slate-900 border border-emerald-500/50 text-emerald-300 text-sm font-bold flex items-center justify-between">
          <span>{banner}</span>
          <button type="button" onClick={() => setBanner(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter & View Switcher Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(['all', 'feature', 'bug'] as const).map((ft) => (
            <button
              key={ft}
              type="button"
              onClick={() => setFilterType(ft)}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition ${
                filterType === ft
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
              }`}
            >
              {ft === 'all'
                ? `All Items (${reports.length})`
                : ft === 'feature'
                ? `Feature Requests (${reports.filter((r) => r.type === 'feature').length})`
                : `Bug Reports (${reports.filter((r) => r.type === 'bug').length})`}
            </button>
          ))}

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search requests, notes, or reporter..."
              className="h-9 pl-8 pr-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex p-1 rounded-xl bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('board')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition ${
                viewMode === 'board'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Roadmap Columns
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition ${
                viewMode === 'list'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Detailed List
            </button>
          </div>
        </div>
      </div>

      {/* KANBAN ROADMAP COLUMNS VIEW */}
      {viewMode === 'board' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {KANBAN_COLUMNS.map((col) => {
            const colItems = filteredReports.filter((r) => r.status === col.status);
            return (
              <div
                key={col.status}
                className={`bg-slate-900/90 border border-slate-800 border-t-4 ${col.accentBorder} rounded-2xl p-3.5 space-y-3`}
              >
                <div className="flex items-center justify-between gap-2 px-1">
                  <div>
                    <div className="text-sm font-black text-white">{col.title}</div>
                    <div className="text-[11px] text-slate-400">{col.subtitle}</div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-xs font-black text-slate-200 font-mono">
                    {colItems.length}
                  </span>
                </div>

                {colItems.length === 0 ? (
                  <div className="p-6 rounded-xl bg-slate-950/50 border border-dashed border-slate-800 text-center text-xs text-slate-500">
                    No items in {col.title}
                  </div>
                ) : (
                  <div className="space-y-3">{colItems.map(renderReportCard)}</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredReports.length === 0 ? (
            <div className="p-10 rounded-2xl bg-slate-900 border border-slate-800 text-center text-sm text-slate-400">
              No matching bug reports or feature requests found.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredReports.map(renderReportCard)}
            </div>
          )}
        </div>
      )}

      {/* NEW REPORT / FEATURE REQUEST MODAL WITH PHOTO UPLOAD */}
      {showNewModal && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onPaste={handlePasteClipboard}
        >
          <form
            onSubmit={handleCreateReport}
            className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-emerald-400">
                  Submit Feedback or Feature Idea
                </div>
                <h3 className="text-xl font-black text-white mt-0.5">
                  Log a Feature Request or Bug Report
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setNewType('feature')}
                className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition ${
                  newType === 'feature'
                    ? 'bg-emerald-500/15 border-emerald-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <Lightbulb className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <div className="text-xs font-black">Feature Request</div>
                  <div className="text-[10px] text-slate-400">New idea or improvement</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setNewType('bug')}
                className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition ${
                  newType === 'bug'
                    ? 'bg-rose-500/15 border-rose-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <Bug className="w-5 h-5 text-rose-400 shrink-0" />
                <div>
                  <div className="text-xs font-black">Bug Report</div>
                  <div className="text-[10px] text-slate-400">Something broken or wrong</div>
                </div>
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-xs font-bold uppercase text-slate-300">
                  Short Summary *
                </label>
                <VoiceMicButton
                  size="sm"
                  allowPhoto={false}
                  onTranscript={(spoken) =>
                    setNewTitle((prev) => appendTranscript(prev, spoken))
                  }
                />
              </div>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Add photo upload to Goods In damages"
                className="w-full h-11 px-3.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label className="block text-xs font-bold uppercase text-slate-300">
                  Details &amp; Photos *
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-emerald-400 font-semibold hidden sm:inline">
                    Paste screenshots with Ctrl+V
                  </span>
                  <VoiceMicButton
                    size="sm"
                    onTranscript={(spoken) =>
                      setNewDesc((prev) => appendTranscript(prev, spoken))
                    }
                    onPhotoAttached={(dataUrl) =>
                      setNewAttachments((prev) =>
                        prev.length < 6 ? [...prev, dataUrl] : prev
                      )
                    }
                  />
                </div>
              </div>
              <textarea
                rows={4}
                required
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Explain what you'd like to see or what happened..."
                className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white"
              />

              <div className="mt-2.5 p-3 rounded-xl bg-slate-950 border border-dashed border-slate-700 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-emerald-400" />
                    Attached Photos ({newAttachments.length}/6)
                  </span>
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
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-black inline-flex items-center gap-1.5"
                  >
                    <ImagePlus className="w-3.5 h-3.5" />
                    + Attach Photo / Screenshot
                  </button>
                </div>

                {newAttachments.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1">
                    {newAttachments.map((src, idx) => (
                      <div
                        key={idx}
                        className="relative rounded-lg overflow-hidden border border-slate-700 aspect-video"
                      >
                        <img
                          src={src}
                          alt={`Upload ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setNewAttachments((prev) =>
                              prev.filter((_, i) => i !== idx)
                            )
                          }
                          className="absolute top-1 right-1 p-1 rounded bg-rose-600 text-white"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Priority / Severity
                </label>
                <select
                  value={newSeverity}
                  onChange={(e) => setNewSeverity(e.target.value as FeedbackSeverity)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white"
                >
                  <option value="low">Low / Nice to Have</option>
                  <option value="medium">Medium / Helpful</option>
                  <option value="high">High Impact</option>
                  <option value="critical">Critical / Essential</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Page / Area
                </label>
                <input
                  type="text"
                  value={newPagePath}
                  onChange={(e) => setNewPagePath(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                Submit to Board
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Lightbox */}
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
