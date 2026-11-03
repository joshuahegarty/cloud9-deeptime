'use client';

import {
  updateSettingsAction,
  upsertClientAction,
  upsertTaskTypeAction,
  upsertUserAction,
} from '@/app/actions';
import { AppSettings, Client, Role, TaskType, UserAdmin } from '@/lib/types';
import {
  Building2,
  Check,
  FolderKanban,
  KeyRound,
  Pencil,
  Plus,
  Settings,
  Users,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';

interface SetupClientProps {
  initialSection: 'clients' | 'tasks' | 'users' | 'settings';
  isAdmin?: boolean;
  clients: Client[];
  taskTypes: TaskType[];
  users: UserAdmin[];
  settings: AppSettings;
}

const DEFAULT_CATEGORIES = [
  'Pick & Pack',
  'Inbound / Goods-In',
  'Kitting & Value Add',
  'Returns',
  'Outbound / Dispatch',
  'Inventory',
  'Housekeeping',
  'Ad-Hoc / Unlisted',
];

export function SetupClient({
  initialSection,
  isAdmin = true,
  clients,
  taskTypes,
  users,
  settings,
}: SetupClientProps) {
  const router = useRouter();
  const [section, setSection] = useState<'clients' | 'tasks' | 'users' | 'settings'>(
    initialSection
  );
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  // Client Modal state
  const [clientModal, setClientModal] = useState<Partial<Client> | null>(null);

  // Task Modal state
  const [selectedCatalogueClientId, setSelectedCatalogueClientId] =
    useState<string>('all');
  const [taskModal, setTaskModal] = useState<Partial<TaskType> | null>(null);
  const [isCustomCategoryMode, setIsCustomCategoryMode] = useState(false);

  React.useEffect(() => {
    if (!taskModal) {
      setIsCustomCategoryMode(false);
    }
  }, [taskModal]);

  const allCategoryChoices = React.useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    for (const t of taskTypes) {
      if (t.category && t.category.trim()) {
        set.add(t.category.trim());
      }
    }
    return Array.from(set);
  }, [taskTypes]);

  // User Modal state
  const [userModal, setUserModal] = useState<
    (Partial<UserAdmin> & { newPin?: string; newPassword?: string }) | null
  >(null);

  // Settings form state
  const [idlePromptMins, setIdlePromptMins] = useState(settings.idle_prompt_minutes);
  const [idleStopMins, setIdleStopMins] = useState(settings.idle_stop_minutes);
  const [shiftEnd, setShiftEnd] = useState(settings.shift_end);
  const [summaryTime, setSummaryTime] = useState(settings.summary_time);
  const [recipientsStr, setRecipientsStr] = useState(
    settings.summary_recipients.join(', ')
  );
  const [timezone, setTimezone] = useState(settings.timezone);
  const [showTargetsToOperatives, setShowTargetsToOperatives] = useState<boolean>(
    settings.show_targets_to_operatives ?? false
  );

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientModal) return;
    setBusy(true);
    const res = await upsertClientAction({
      id: clientModal.id,
      name: clientModal.name || '',
      code: clientModal.code || '',
      roundingMinutes: Number(clientModal.rounding_minutes ?? 0),
      billableDefault: clientModal.billable_default ?? true,
      active: clientModal.active ?? true,
    });
    setBusy(false);

    if (res.ok) {
      setClientModal(null);
      setBanner('Client saved.');
      router.refresh();
    } else {
      setBanner(res.error || 'Failed to save client');
    }
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskModal) return;
    setBusy(true);
    const res = await upsertTaskTypeAction({
      id: taskModal.id,
      clientId: taskModal.is_standard
        ? null
        : taskModal.client_id || clients[0]?.id || null,
      isStandard: Boolean(taskModal.is_standard),
      category: taskModal.category || 'Fulfilment',
      projectName: taskModal.project_name || null,
      projectColor: taskModal.project_color || 'amber',
      name: taskModal.name || '',
      code: taskModal.code || '',
      roundingMinutes:
        taskModal.rounding_minutes === null || taskModal.rounding_minutes === undefined
          ? null
          : Number(taskModal.rounding_minutes),
      minChargeMinutes:
        taskModal.min_charge_minutes === null || taskModal.min_charge_minutes === undefined
          ? 0
          : Number(taskModal.min_charge_minutes),
      standardMinutes:
        taskModal.standard_minutes !== null &&
        taskModal.standard_minutes !== undefined &&
        String(taskModal.standard_minutes) !== ''
          ? Number(taskModal.standard_minutes)
          : null,
      unitLabel: taskModal.unit_label || 'units',
      requireUnitsOnClose: taskModal.require_units_on_close ?? true,
      billable: taskModal.billable ?? true,
      billingStatus: taskModal.billing_status,
      rate:
        taskModal.rate !== null &&
        taskModal.rate !== undefined &&
        String(taskModal.rate) !== ''
          ? Number(taskModal.rate)
          : null,
      barcode: taskModal.barcode || null,
      sortOrder: Number(taskModal.sort_order ?? 1),
      active: taskModal.active ?? true,
    });
    setBusy(false);

    if (res.ok) {
      setTaskModal(null);
      setBanner('Task type saved.');
      router.refresh();
    } else {
      setBanner(res.error || 'Failed to save task type');
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userModal) return;
    setBusy(true);
    const res = await upsertUserAction({
      id: userModal.id,
      displayName: userModal.display_name || '',
      role: (userModal.role as Role) || 'operative',
      pin: userModal.newPin !== undefined ? userModal.newPin : userModal.pin_hash,
      hourlyCost:
        userModal.hourly_cost !== null &&
        userModal.hourly_cost !== undefined &&
        String(userModal.hourly_cost) !== ''
          ? Number(userModal.hourly_cost)
          : null,
      active: userModal.active ?? true,
      email: userModal.email || null,
      password: userModal.newPassword || null,
    });
    setBusy(false);

    if (res.ok) {
      setUserModal(null);
      setBanner('User account saved.');
      router.refresh();
    } else {
      setBanner(res.error || 'Failed to save user');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const recipients = recipientsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await updateSettingsAction({
      idle_prompt_minutes: Number(idlePromptMins),
      idle_stop_minutes: Number(idleStopMins),
      shift_end: shiftEnd,
      summary_time: summaryTime,
      summary_recipients: recipients,
      timezone,
      show_targets_to_operatives: showTargetsToOperatives,
    });
    setBusy(false);

    if (res.ok) {
      setBanner('Settings updated.');
      router.refresh();
    } else {
      setBanner(res.error || 'Failed to save settings');
    }
  };

  const filteredTasks = taskTypes.filter((t) => {
    if (selectedCatalogueClientId === 'all') return true;
    if (selectedCatalogueClientId === 'standard') return Boolean(t.is_standard);
    return t.client_id === selectedCatalogueClientId;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
            Clients, Task Categories, Standard &amp; Custom Tasks
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white mt-0.5">
            System Setup
          </h1>
        </div>

        {/* Section Tabs */}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/setup/clients"
            onClick={() => setSection('clients')}
            className={`btn-glove px-4 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 border ${
              section === 'clients'
                ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                : 'bg-slate-950 text-slate-300 border-slate-800'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Clients ({clients.length})
          </Link>
          <Link
            href="/setup/tasks"
            onClick={() => setSection('tasks')}
            className={`btn-glove px-4 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 border ${
              section === 'tasks'
                ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                : 'bg-slate-950 text-slate-300 border-slate-800'
            }`}
          >
            <FolderKanban className="w-4 h-4" />
            Task Catalogue ({taskTypes.length})
          </Link>
          {isAdmin && (
            <>
              <Link
                href="/setup/users"
                onClick={() => setSection('users')}
                className={`btn-glove px-4 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 border ${
                  section === 'users'
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : 'bg-slate-950 text-slate-300 border-slate-800'
                }`}
              >
                <Users className="w-4 h-4" />
                Users &amp; Costs ({users.length})
              </Link>
              <Link
                href="/setup/settings"
                onClick={() => setSection('settings')}
                className={`btn-glove px-4 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 border ${
                  section === 'settings'
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : 'bg-slate-950 text-slate-300 border-slate-800'
                }`}
              >
                <Settings className="w-4 h-4" />
                Settings
              </Link>
            </>
          )}
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

      {/* 1. CLIENTS SECTION */}
      {section === 'clients' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black text-white">3PL Clients</h2>
            <button
              type="button"
              onClick={() =>
                setClientModal({
                  name: '',
                  code: '',
                  rounding_minutes: 0,
                  billable_default: true,
                  active: true,
                })
              }
              className="btn-glove px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              New Client
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-bold uppercase text-slate-400">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Client Name</th>
                  <th className="py-3 px-4">Export Rounding Rule</th>
                  <th className="py-3 px-4">Billable Default</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {clients.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/40">
                    <td className="py-3.5 px-4 font-mono font-black text-emerald-400">
                      {c.code}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-white">{c.name}</td>
                    <td className="py-3.5 px-4 text-slate-300">
                      {c.rounding_minutes === 0
                        ? 'Exact (no rounding)'
                        : `Round UP to ${c.rounding_minutes} mins`}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      {c.billable_default ? 'Yes' : 'No'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          c.active
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {c.active ? 'Active' : 'Archived'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setClientModal(c)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 inline-flex items-center gap-1"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. TASK CATALOGUE SECTION */}
      {section === 'tasks' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-black text-white">Task Catalogue</h2>
              <select
                value={selectedCatalogueClientId}
                onChange={(e) => setSelectedCatalogueClientId(e.target.value)}
                className="h-10 px-3 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white"
              >
                <option value="all">All Tasks (Standard + Client Custom)</option>
                <option value="standard">Standard Tasks Only (All Clients)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    Custom Tasks: {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setTaskModal({
                    client_id: null,
                    is_standard: true,
                    category: 'Pick & Pack',
                    name: '',
                    code: 'STD-',
                    standard_minutes: null,
                    unit_label: 'orders',
                    billable: true,
                    rate: 24,
                    barcode: '',
                    sort_order: 10,
                    active: true,
                  })
                }
                className="btn-glove px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                New Standard Task (All Clients)
              </button>

              <button
                type="button"
                onClick={() =>
                  setTaskModal({
                    client_id:
                      selectedCatalogueClientId !== 'all' &&
                      selectedCatalogueClientId !== 'standard'
                        ? selectedCatalogueClientId
                        : clients[0]?.id,
                    is_standard: false,
                    category: 'Pick & Pack',
                    name: '',
                    code: '',
                    standard_minutes: null,
                    unit_label: 'orders',
                    billable: true,
                    rate: 25,
                    barcode: '',
                    sort_order: 1,
                    active: true,
                  })
                }
                className="btn-glove px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                New Client Custom Task
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-bold uppercase text-slate-400">
                  <th className="py-3 px-3">Scope / Client</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Code</th>
                  <th className="py-3 px-3">Task Name</th>
                  <th className="py-3 px-3">Billing Rounding</th>
                  <th className="py-3 px-3">Standard</th>
                  <th className="py-3 px-3">Unit Label</th>
                  <th className="py-3 px-3">Rate (£/hr)</th>
                  <th className="py-3 px-3">Barcode</th>
                  <th className="py-3 px-3">Billable</th>
                  <th className="py-3 px-3 text-right">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredTasks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/40">
                    <td className="py-3 px-3">
                      {t.is_standard ? (
                        <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono text-xs font-black">
                          STANDARD (ALL)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono text-xs font-black">
                          {t.client_code}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs font-semibold text-slate-300">
                      {t.category || 'Fulfilment'}
                    </td>
                    <td className="py-3 px-3 font-mono text-xs text-slate-300">
                      {t.code}
                    </td>
                    <td className="py-3 px-3 font-bold text-white">{t.name}</td>
                    <td className="py-3 px-3 text-xs">
                      {t.rounding_minutes === null || t.rounding_minutes === undefined ? (
                        <span className="text-slate-400">Customer Default</span>
                      ) : t.rounding_minutes === 0 ? (
                        <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 font-bold">
                          Override: Exact
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                          Override: Up {t.rounding_minutes}m
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-300">
                      {t.standard_minutes
                        ? `${t.standard_minutes}m / ${t.unit_label || 'entry'}`
                        : '—'}
                    </td>
                    <td className="py-3 px-3 text-slate-300">{t.unit_label || '—'}</td>
                    <td className="py-3 px-3 font-mono text-slate-300">
                      {t.rate ? `£${Number(t.rate).toFixed(2)}` : '—'}
                    </td>
                    <td className="py-3 px-3 font-mono text-xs text-amber-300">
                      {t.barcode || '—'}
                    </td>
                    <td className="py-3 px-3 text-slate-300">
                      {t.billable ? 'Yes' : 'No'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => setTaskModal(t)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 inline-flex items-center gap-1"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. USERS & HOURLY COSTS SECTION (Admin Only) */}
      {section === 'users' && isAdmin && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-white">
                Users, Roles, PINs &amp; Hourly Costs
              </h2>
              <p className="text-xs text-slate-400">
                Hourly cost is protected by Postgres RLS and excluded from non-admin views.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setUserModal({
                  display_name: '',
                  role: 'operative',
                  newPin: '5555',
                  hourly_cost: 12.5,
                  active: true,
                })
              }
              className="btn-glove px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              New User
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-bold uppercase text-slate-400">
                  <th className="py-3 px-4">Display Name</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">4-Digit PIN</th>
                  <th className="py-3 px-4">Hourly Cost (Admin Only)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/40">
                    <td className="py-3.5 px-4 font-bold text-white">
                      <div>{u.display_name}</div>
                      <div className="text-xs font-mono text-slate-400">{u.email}</div>
                    </td>
                    <td className="py-3.5 px-4 uppercase text-xs font-black text-emerald-400">
                      {u.role}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-amber-300 font-bold">
                      {u.pin_hash || '—'}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-white">
                      {u.hourly_cost !== null && u.hourly_cost !== undefined
                        ? `£${Number(u.hourly_cost).toFixed(2)} / hr`
                        : '—'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${
                          u.active
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {u.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          setUserModal({
                            ...u,
                            newPin: u.pin_hash || '',
                          })
                        }
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 inline-flex items-center gap-1"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                        Edit / Reset PIN
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. SETTINGS SECTION (Admin Only) */}
      {section === 'settings' && isAdmin && (
        <form
          onSubmit={handleSaveSettings}
          className="max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5"
        >
          <h2 className="text-lg font-black text-white">Warehouse Floor &amp; Cron Settings</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                Idle Prompt Threshold (Minutes)
              </label>
              <input
                type="number"
                required
                value={idlePromptMins}
                onChange={(e) => setIdlePromptMins(Number(e.target.value))}
                className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                Idle Auto-Stop Threshold (Minutes)
              </label>
              <input
                type="number"
                required
                value={idleStopMins}
                onChange={(e) => setIdleStopMins(Number(e.target.value))}
                className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                Shift End Auto-Close Time (HH:mm)
              </label>
              <input
                type="time"
                required
                value={shiftEnd}
                onChange={(e) => setShiftEnd(e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                Daily Summary Email Time (HH:mm)
              </label>
              <input
                type="time"
                required
                value={summaryTime}
                onChange={(e) => setSummaryTime(e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                Daily Summary Recipients (Comma-separated emails)
              </label>
              <input
                type="text"
                value={recipientsStr}
                onChange={(e) => setRecipientsStr(e.target.value)}
                placeholder="sarah@cloud9fulfilment.co.uk, dan@cloud9fulfilment.co.uk"
                className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-semibold"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                Display Timezone
              </label>
              <input
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="flex items-start gap-3 p-4 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                <input
                  type="checkbox"
                  checked={showTargetsToOperatives}
                  onChange={(e) => setShowTargetsToOperatives(e.target.checked)}
                  className="w-5 h-5 mt-0.5 rounded accent-emerald-500 shrink-0"
                />
                <div>
                  <div className="text-sm font-black text-white">
                    Show Target Pace &amp; % vs Standard to Operatives
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    When unchecked, Target Pace and % vs Standard remain visible only to Supervisors and Admins while baselines are being established.
                  </div>
                </div>
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="btn-glove px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Save Settings
          </button>
        </form>
      )}

      {/* CLIENT MODAL */}
      {clientModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveClient}
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-white">
                {clientModal.id ? 'Edit Client' : 'New Client'}
              </h3>
              <button
                type="button"
                onClick={() => setClientModal(null)}
                className="p-2 rounded-lg bg-slate-800 text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                Client Name
              </label>
              <input
                type="text"
                required
                value={clientModal.name || ''}
                onChange={(e) => setClientModal({ ...clientModal, name: e.target.value })}
                className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Code
                </label>
                <input
                  type="text"
                  required
                  value={clientModal.code || ''}
                  onChange={(e) =>
                    setClientModal({ ...clientModal, code: e.target.value.toUpperCase() })
                  }
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Billing Rounding (Round UP)
                </label>
                <select
                  value={clientModal.rounding_minutes ?? 0}
                  onChange={(e) =>
                    setClientModal({
                      ...clientModal,
                      rounding_minutes: Number(e.target.value),
                    })
                  }
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
                >
                  <option value={0}>Exact (No rounding)</option>
                  <option value={5}>Round UP to 5 mins</option>
                  <option value={10}>Round UP to 10 mins</option>
                  <option value={15}>Round UP to 15 mins</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-6 pt-1">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clientModal.billable_default ?? true}
                  onChange={(e) =>
                    setClientModal({ ...clientModal, billable_default: e.target.checked })
                  }
                  className="w-4 h-4 rounded accent-emerald-500"
                />
                Billable by default
              </label>

              <label className="flex items-center gap-2 text-sm font-bold text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={clientModal.active ?? true}
                  onChange={(e) =>
                    setClientModal({ ...clientModal, active: e.target.checked })
                  }
                  className="w-4 h-4 rounded accent-emerald-500"
                />
                Active
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setClientModal(null)}
                className="btn-glove px-4 rounded-xl bg-slate-800 text-slate-300 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="btn-glove px-5 rounded-xl bg-emerald-500 text-slate-950 font-black"
              >
                Save Client
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TASK MODAL */}
      {taskModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveTask}
            className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-white">
                {taskModal.id ? 'Edit Task Type' : 'New Task Type'}
              </h3>
              <button
                type="button"
                onClick={() => setTaskModal(null)}
                className="p-2 rounded-lg bg-slate-800 text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scope Toggle: Standard (All Clients) vs Client-Specific */}
            <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-950 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() =>
                  setTaskModal({
                    ...taskModal,
                    is_standard: false,
                    client_id: taskModal.client_id || clients[0]?.id,
                  })
                }
                className={`py-2.5 px-3 rounded-lg text-xs font-black ${
                  !taskModal.is_standard
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Custom Task (Specific Client)
              </button>
              <button
                type="button"
                onClick={() =>
                  setTaskModal({
                    ...taskModal,
                    is_standard: true,
                    client_id: null,
                  })
                }
                className={`py-2.5 px-3 rounded-lg text-xs font-black ${
                  taskModal.is_standard
                    ? 'bg-sky-400 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Standard Task (All Clients)
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!taskModal.is_standard && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                    Client
                  </label>
                  <select
                    value={taskModal.client_id || clients[0]?.id || ''}
                    onChange={(e) =>
                      setTaskModal({ ...taskModal, client_id: e.target.value })
                    }
                    className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
                  >
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Task Category
                </label>
                {!isCustomCategoryMode ? (
                  <select
                    value={
                      taskModal.category &&
                      allCategoryChoices.includes(taskModal.category)
                        ? taskModal.category
                        : allCategoryChoices[0]
                    }
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setIsCustomCategoryMode(true);
                        setTaskModal({ ...taskModal, category: '' });
                      } else {
                        setTaskModal({ ...taskModal, category: e.target.value });
                      }
                    }}
                    className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
                  >
                    {allCategoryChoices.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                    <option value="__custom__">+ Create New Category...</option>
                  </select>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      required
                      autoFocus
                      value={taskModal.category || ''}
                      onChange={(e) =>
                        setTaskModal({ ...taskModal, category: e.target.value })
                      }
                      placeholder="Type new category..."
                      className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-emerald-500 text-white font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomCategoryMode(false);
                        setTaskModal({
                          ...taskModal,
                          category: allCategoryChoices[0],
                        });
                      }}
                      className="h-11 px-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold shrink-0"
                      title="Back to category list"
                    >
                      List
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Task Code
                </label>
                <input
                  type="text"
                  required
                  value={taskModal.code || ''}
                  onChange={(e) =>
                    setTaskModal({ ...taskModal, code: e.target.value.toUpperCase() })
                  }
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Task Name
                </label>
                <input
                  type="text"
                  required
                  value={taskModal.name || ''}
                  onChange={(e) => setTaskModal({ ...taskModal, name: e.target.value })}
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
                />
              </div>

              {!taskModal.is_standard && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase text-amber-300 mb-1">
                    Bespoke Project Folder (Optional — Groups multi-stage tasks e.g. FSDU Build)
                  </label>
                  <input
                    type="text"
                    value={taskModal.project_name || ''}
                    onChange={(e) =>
                      setTaskModal({ ...taskModal, project_name: e.target.value })
                    }
                    placeholder="e.g. FSDU Retail Display Build Project"
                    className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-amber-500/40 text-white font-semibold"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold uppercase text-slate-400">
                    Target (Mins / Unit)
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={taskModal.standard_minutes === null}
                      onChange={(e) =>
                        setTaskModal({
                          ...taskModal,
                          standard_minutes: e.target.checked ? null : 1.0,
                        })
                      }
                      className="w-3.5 h-3.5 rounded accent-amber-400"
                    />
                    Target N/A
                  </label>
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={taskModal.standard_minutes ?? ''}
                  onChange={(e) =>
                    setTaskModal({
                      ...taskModal,
                      standard_minutes:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  placeholder="e.g. 1.50"
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Unit Label (What Unit Is Counted)
                </label>
                <input
                  type="text"
                  value={taskModal.unit_label || ''}
                  onChange={(e) =>
                    setTaskModal({ ...taskModal, unit_label: e.target.value })
                  }
                  placeholder="orders, cartons, pallets, units..."
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {['orders', 'cartons', 'pallets', 'units', 'FSDUs', 'items', 'locations'].map(
                    (preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setTaskModal({ ...taskModal, unit_label: preset })}
                        className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300"
                      >
                        {preset}
                      </button>
                    )
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Rate £ / Hour (Optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={taskModal.rate ?? ''}
                  onChange={(e) =>
                    setTaskModal({
                      ...taskModal,
                      rate: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Barcode Scan Value (Optional)
                </label>
                <input
                  type="text"
                  value={taskModal.barcode || ''}
                  onChange={(e) =>
                    setTaskModal({ ...taskModal, barcode: e.target.value.toUpperCase() })
                  }
                  placeholder="BC-PDN-PICK"
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Billing Rounding Rule
                </label>
                <select
                  value={
                    taskModal.rounding_minutes === null ||
                    taskModal.rounding_minutes === undefined
                      ? 'inherit'
                      : String(taskModal.rounding_minutes)
                  }
                  onChange={(e) =>
                    setTaskModal({
                      ...taskModal,
                      rounding_minutes:
                        e.target.value === 'inherit' ? null : Number(e.target.value),
                    })
                  }
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold"
                >
                  <option value="inherit">Use Customer Default Rule</option>
                  <option value="0">Override: Exact (No rounding)</option>
                  <option value="5">Override: Round UP to 5 mins</option>
                  <option value="10">Override: Round UP to 10 mins</option>
                  <option value="15">Override: Round UP to 15 mins</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Minimum Billable Charge (Mins)
                </label>
                <select
                  value={String(taskModal.min_charge_minutes ?? 0)}
                  onChange={(e) =>
                    setTaskModal({
                      ...taskModal,
                      min_charge_minutes: Number(e.target.value),
                    })
                  }
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold"
                >
                  <option value="0">No Minimum Floor (0m)</option>
                  <option value="5">5 mins Minimum Charge</option>
                  <option value="10">10 mins Minimum Charge</option>
                  <option value="15">15 mins Minimum Charge (e.g. 15m min + 5m increments)</option>
                  <option value="30">30 mins Minimum Charge</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Sort Order
                </label>
                <input
                  type="number"
                  value={taskModal.sort_order ?? 1}
                  onChange={(e) =>
                    setTaskModal({ ...taskModal, sort_order: Number(e.target.value) })
                  }
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={taskModal.require_units_on_close ?? true}
                  onChange={(e) =>
                    setTaskModal({
                      ...taskModal,
                      require_units_on_close: e.target.checked,
                    })
                  }
                  className="w-4 h-4 rounded accent-emerald-500"
                />
                Require Unit Count When Stopping Timer
              </label>

              <label className="flex items-center gap-2 text-sm font-bold text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={taskModal.billable ?? true}
                  onChange={(e) =>
                    setTaskModal({ ...taskModal, billable: e.target.checked })
                  }
                  className="w-4 h-4 rounded accent-emerald-500"
                />
                Billable
              </label>

              <label className="flex items-center gap-2 text-sm font-bold text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={taskModal.active ?? true}
                  onChange={(e) =>
                    setTaskModal({ ...taskModal, active: e.target.checked })
                  }
                  className="w-4 h-4 rounded accent-emerald-500"
                />
                Active
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTaskModal(null)}
                className="btn-glove px-4 rounded-xl bg-slate-800 text-slate-300 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="btn-glove px-5 rounded-xl bg-emerald-500 text-slate-950 font-black"
              >
                Save Task Type
              </button>
            </div>
          </form>
        </div>
      )}

      {/* USER MODAL */}
      {userModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveUser}
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-white">
                {userModal.id ? 'Edit User & Reset PIN' : 'New User Account'}
              </h3>
              <button
                type="button"
                onClick={() => setUserModal(null)}
                className="p-2 rounded-lg bg-slate-800 text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                Display Name
              </label>
              <input
                type="text"
                required
                value={userModal.display_name || ''}
                onChange={(e) =>
                  setUserModal({ ...userModal, display_name: e.target.value })
                }
                className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Role
                </label>
                <select
                  value={userModal.role || 'operative'}
                  onChange={(e) =>
                    setUserModal({ ...userModal, role: e.target.value as Role })
                  }
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
                >
                  <option value="operative">operative</option>
                  <option value="supervisor">supervisor</option>
                  <option value="admin">admin</option>
                  <option value="client_viewer">client_viewer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  4-Digit PIN
                </label>
                <input
                  type="text"
                  maxLength={4}
                  pattern="\d{4}"
                  value={userModal.newPin ?? ''}
                  onChange={(e) =>
                    setUserModal({
                      ...userModal,
                      newPin: e.target.value.replace(/\D/g, '').slice(0, 4),
                    })
                  }
                  placeholder="1234"
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                Hourly Cost (£ / hr — Admin RLS Only)
              </label>
              <input
                type="number"
                step="0.01"
                value={userModal.hourly_cost ?? ''}
                onChange={(e) =>
                  setUserModal({
                    ...userModal,
                    hourly_cost:
                      e.target.value === '' ? null : Number(e.target.value),
                  })
                }
                className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono"
              />
            </div>

            {(userModal.role === 'supervisor' || userModal.role === 'admin') && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                    Staff Email
                  </label>
                  <input
                    type="email"
                    value={userModal.email || ''}
                    onChange={(e) =>
                      setUserModal({ ...userModal, email: e.target.value })
                    }
                    className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                    New Password (Optional)
                  </label>
                  <input
                    type="password"
                    value={userModal.newPassword || ''}
                    onChange={(e) =>
                      setUserModal({ ...userModal, newPassword: e.target.value })
                    }
                    placeholder="Leave blank to keep"
                    className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                  />
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-sm font-bold text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={userModal.active ?? true}
                onChange={(e) =>
                  setUserModal({ ...userModal, active: e.target.checked })
                }
                className="w-4 h-4 rounded accent-emerald-500"
              />
              Account Active
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setUserModal(null)}
                className="btn-glove px-4 rounded-xl bg-slate-800 text-slate-300 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="btn-glove px-5 rounded-xl bg-emerald-500 text-slate-950 font-black"
              >
                Save User
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
