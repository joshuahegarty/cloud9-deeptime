'use client';

import {
  clockOutAction,
  confirmStillOnTaskAction,
  dismissAssignedTaskAction,
  reassignRunningTaskAction,
  startTaskAction,
  startUnlistedTaskAction,
  stopTaskAction,
  updateRunningTaskUnitsAction,
  upsertClientAction,
  upsertTaskTypeAction,
} from '@/app/actions';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import {
  calculateActualVsStandardPercent,
  formatElapsedHMS,
  formatHours,
  formatLondonTime,
  getDurationMinutes,
  minutesToHours,
} from '@/lib/calculations';
import { enqueueOfflineAction } from '@/lib/offline-queue';
import {
  AppSettings,
  AssignedTask,
  Attendance,
  Client,
  EntrySource,
  TaskType,
  TimeEntry,
  UserPublic,
} from '@/lib/types';
import {
  AlertTriangle,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Delete,
  FolderKanban,
  FolderOpen,
  Globe,
  Hash,
  Info,
  Layers,
  LogOut,
  Mic,
  Pencil,
  Play,
  Plus,
  QrCode,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  Square,
  Star,
  Tablet,
  Unlock,
  Warehouse,
  X,
} from 'lucide-react';
import {
  BillingStatus,
  BILLING_STATUS_CONFIG,
  isTaskDecreedUnbilled,
  resolveBillingStatus,
} from '@/lib/billingStatus';
import { REEL_LETTERS, ReelLetter } from '@/components/AlphabeticalReelWheel';
import { useRouter, useSearchParams } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';

interface NowClientProps {
  user: UserPublic;
  initialRunningEntry: TimeEntry | null;
  initialTodayEntries: TimeEntry[];
  last5Tasks: TaskType[];
  assignedTasks?: AssignedTask[];
  openAttendance: Attendance | null;
  clients: Client[];
  taskTypes: TaskType[];
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

function formatReadableDuration(minutes: number): string {
  const totalSeconds = Math.max(0, Math.round(minutes * 60));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins}m`;
}

export function NowClient({
  user,
  initialRunningEntry,
  initialTodayEntries,
  last5Tasks,
  assignedTasks = [],
  openAttendance,
  clients,
  taskTypes,
  settings,
}: NowClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [runningEntry, setRunningEntry] = useState<TimeEntry | null>(initialRunningEntry);
  const [todayEntries, setTodayEntries] = useState<TimeEntry[]>(initialTodayEntries);
  const [isKioskMode, setIsKioskMode] = useState(false);

  // 3-Way Top Quick Bar state: 'assigned' | 'recent' | 'favourites'
  const [quickBarTab, setQuickBarTab] = useState<'assigned' | 'recent' | 'favourites'>(
    assignedTasks.length > 0 ? 'assigned' : 'recent'
  );
  const [favouriteKeys, setFavouriteKeys] = useState<string[]>([]);
  const [openProjectFolders, setOpenProjectFolders] = useState<Record<string, boolean>>({});
  const [targetNotApplicable, setTargetNotApplicable] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(`c9_fav_tasks_${user.id}`);
        if (raw) {
          setFavouriteKeys(JSON.parse(raw));
        }
      } catch {
        // ignore
      }
    }
  }, [user.id]);

  const toggleFavouriteTask = (clientId: string | null | undefined, taskId: string) => {
    const key = `${clientId || 'STD'}:${taskId}`;
    setFavouriteKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`c9_fav_tasks_${user.id}`, JSON.stringify(next));
      }
      return next;
    });
  };

  // Track local activity confirmation so clicking "Yes" immediately dismisses the idle modal
  const [localLastActivityMs, setLocalLastActivityMs] = useState<number | null>(null);

  // Hands-Free Voice Command Mode state (Backlog Feature #3: 30:31-31:10)
  const [showVoicePanel, setShowVoicePanel] = useState(false);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [lastVoiceTranscript, setLastVoiceTranscript] = useState<string | null>(null);

  // Live elapsed timer
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [idleSecondsSinceActivity, setIdleSecondsSinceActivity] = useState(0);

  // Multi-Client / Consolidated 3PL definition
  const MULTI_CLIENT_ID = '10000000-0000-0000-0000-000000000000';
  const MULTI_CLIENT_DEFAULT: Client = useMemo(
    () => ({
      id: MULTI_CLIENT_ID,
      name: 'Multi-Client / Consolidated',
      code: 'MULTI',
      rounding_minutes: 15,
      billable_default: true,
      active: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }),
    []
  );

  // Guarantee Multi-Client is in the client list even if not seeded yet
  const effectiveClients = useMemo(() => {
    const hasMulti = clients.some(
      (c) => c.id === MULTI_CLIENT_ID || c.code === 'MULTI'
    );
    if (!hasMulti) {
      return [MULTI_CLIENT_DEFAULT, ...clients];
    }
    return clients;
  }, [clients, MULTI_CLIENT_DEFAULT]);

  // Start task selector state
  const [startTab, setStartTab] = useState<'pick' | 'type'>('pick');
  const [selectedClientId, setSelectedClientId] = useState<string>(
    clients[0]?.id ?? MULTI_CLIENT_ID
  );
  const [directoryLetter, setDirectoryLetter] = useState<ReelLetter>('ALL');
  const [clientSearchText, setClientSearchText] = useState<string>('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchAllClients, setSearchAllClients] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // Confirm-and-start modal state (used when scanning barcode or adding an Order/Wave Ref)
  const [confirmStartModal, setConfirmStartModal] = useState<{
    task: TaskType;
    targetClient: Client;
    source: EntrySource;
  } | null>(null);
  const [orderRefInput, setOrderRefInput] = useState('');
  const [initialUnitsInput, setInitialUnitsInput] = useState('');

  // "Task Not Listed" modal state for Operatives
  const [showUnlistedModal, setShowUnlistedModal] = useState(false);
  const [unlistedTitle, setUnlistedTitle] = useState('');
  const [unlistedCategory, setUnlistedCategory] = useState('Ad-Hoc / Unlisted');
  const [unlistedOrderRef, setUnlistedOrderRef] = useState('');
  const [unlistedUnitLabel, setUnlistedUnitLabel] = useState('');
  const [unlistedBillingStatus, setUnlistedBillingStatus] =
    useState<BillingStatus>('needs_billed');
  const [unlistedUnbilledReason, setUnlistedUnbilledReason] = useState('');
  const [unbillJustification, setUnbillJustification] = useState('');

  // Supervisor authorization modal for unbilled tasks ("Our Cost")
  const [unbillAuthModal, setUnbillAuthModal] = useState<{
    taskTitle: string;
    onConfirm: (justification: string) => void;
  } | null>(null);

  // Manager / Admin quick Client & Task Add/Edit modals right from /now
  const [clientEditModal, setClientEditModal] = useState<Partial<Client> | null>(null);
  const [taskEditModal, setTaskEditModal] = useState<Partial<TaskType> | null>(null);
  const [isCustomCategoryMode, setIsCustomCategoryMode] = useState(false);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  useEffect(() => {
    if (!taskEditModal) {
      setIsCustomCategoryMode(false);
      setTargetNotApplicable(false);
    } else {
      setTargetNotApplicable(
        Boolean(taskEditModal.id && taskEditModal.standard_minutes === null)
      );
    }
  }, [taskEditModal]);

  // Stop & Units keypad modal state
  const [showConfirmSwitchModal, setShowConfirmSwitchModal] = useState(false);
  const [showStopUnitsModal, setShowStopUnitsModal] = useState(false);
  const [stopUnitsValue, setStopUnitsValue] = useState('');
  const [stopIsMistake, setStopIsMistake] = useState(false);
  const [stopMistakeReason, setStopMistakeReason] = useState('');
  const [showWrongTaskModal, setShowWrongTaskModal] = useState(false);
  const [wrongTaskClientId, setWrongTaskClientId] = useState<string>('');
  const [wrongTaskTypeId, setWrongTaskTypeId] = useState<string>('');
  const [wrongTaskReason, setWrongTaskReason] = useState<string>('');
  const [clockOutAfterStop, setClockOutAfterStop] = useState(false);
  const [showZeroActivityConfirmModal, setShowZeroActivityConfirmModal] = useState(false);
  const [pendingZeroUnitsValue, setPendingZeroUnitsValue] = useState<number | null>(null);
  const [pendingSwitchAction, setPendingSwitchAction] = useState<
    | {
        kind: 'catalogue';
        task: TaskType;
        source: EntrySource;
        targetClient: Client;
        orderRefValue?: string | null;
        unitsValue?: number | null;
      }
    | {
        kind: 'unlisted';
        clientId: string;
        clientName: string;
        customTaskTitle: string;
        category: string;
        orderRef: string | null;
        unitLabel: string;
        billingStatus: BillingStatus;
        unbilledReason: string | null;
      }
    | null
  >(null);

  // Shift Clock-Out Confirmation Modal state
  const [showClockOutConfirmModal, setShowClockOutConfirmModal] = useState(false);

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [justStartedPulse, setJustStartedPulse] = useState<{
    taskName: string;
    clientName: string;
  } | null>(null);
  const activeTimerSectionRef = React.useRef<HTMLElement | null>(null);

  const pingToTopTimer = (taskName: string, clientName: string) => {
    setJustStartedPulse({ taskName, clientName });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => {
        activeTimerSectionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 60);
    }
    setTimeout(() => {
      setJustStartedPulse(null);
    }, 4500);
  };

  useEffect(() => {
    setRunningEntry(initialRunningEntry);
    setTodayEntries(initialTodayEntries);
  }, [initialRunningEntry, initialTodayEntries]);

  useEffect(() => {
    const syncKiosk = () => {
      const fromStorage =
        typeof window !== 'undefined' && window.localStorage.getItem('kiosk') === 'true';
      const fromQuery = searchParams?.get('kiosk') === '1';
      setIsKioskMode(fromStorage || fromQuery);
    };
    syncKiosk();
    window.addEventListener('c9-kiosk-changed', syncKiosk);
    return () => window.removeEventListener('c9-kiosk-changed', syncKiosk);
  }, [searchParams]);

  // Tick elapsed timer every second
  useEffect(() => {
    if (!runningEntry) {
      setElapsedSeconds(0);
      setIdleSecondsSinceActivity(0);
      return;
    }

    const updateTimer = () => {
      const nowMs = Date.now();
      const startMs = new Date(runningEntry.started_at).getTime();
      const serverActivityMs = new Date(
        runningEntry.last_activity_at || runningEntry.started_at
      ).getTime();
      const effectiveActivityMs = localLastActivityMs
        ? Math.max(serverActivityMs, localLastActivityMs)
        : serverActivityMs;

      setElapsedSeconds(Math.max(0, Math.floor((nowMs - startMs) / 1000)));
      setIdleSecondsSinceActivity(
        Math.max(0, Math.floor((nowMs - effectiveActivityMs) / 1000))
      );
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [runningEntry, localLastActivityMs]);

  const selectedClient = useMemo(
    () =>
      effectiveClients.find((c) => c.id === selectedClientId) ??
      effectiveClients[0],
    [effectiveClients, selectedClientId]
  );

  const isMultiClientSelected =
    selectedClient?.code === 'MULTI' || selectedClientId === MULTI_CLIENT_ID;

  // Clients excluding Multi-Client for the alphabetical directory list
  const alphabeticalClients = useMemo(() => {
    return effectiveClients.filter(
      (c) => c.code !== 'MULTI' && c.id !== MULTI_CLIENT_ID
    );
  }, [effectiveClients]);

  // Count clients per letter for instant A-Z filter bar
  const clientCountsByLetter = useMemo(() => {
    const counts: Record<string, number> = { ALL: alphabeticalClients.length, '#': 0 };
    for (const letter of REEL_LETTERS) {
      if (letter !== 'ALL' && letter !== '#') {
        counts[letter] = 0;
      }
    }
    for (const c of alphabeticalClients) {
      const firstChar = (c.name || '').trim().charAt(0).toUpperCase();
      if (firstChar >= 'A' && firstChar <= 'Z') {
        counts[firstChar] = (counts[firstChar] || 0) + 1;
      } else {
        counts['#'] = (counts['#'] || 0) + 1;
      }
    }
    return counts;
  }, [alphabeticalClients]);

  // Filtered clients for the directory list based on active reel letter and search text
  const filteredClients = useMemo(() => {
    let list = alphabeticalClients;
    if (directoryLetter !== 'ALL') {
      if (directoryLetter === '#') {
        list = list.filter((c) => {
          const first = (c.name || '').trim().charAt(0).toUpperCase();
          return !(first >= 'A' && first <= 'Z');
        });
      } else {
        list = list.filter((c) => {
          const first = (c.name || '').trim().charAt(0).toUpperCase();
          return first === directoryLetter;
        });
      }
    }
    const q = clientSearchText.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q)
      );
    }
    return list;
  }, [alphabeticalClients, directoryLetter, clientSearchText]);

  const showIdlePrompt =
    Boolean(runningEntry) &&
    !showConfirmSwitchModal &&
    !showWrongTaskModal &&
    !showStopUnitsModal &&
    !showClockOutConfirmModal &&
    !confirmStartModal &&
    !showUnlistedModal &&
    !clientEditModal &&
    !taskEditModal &&
    !showScanner &&
    idleSecondsSinceActivity >= settings.idle_prompt_minutes * 60;

  // Separate tasks into Client-Specific Custom Tasks, Bespoke Projects, Standard Tasks, and Housekeeping
  const customClientTasks = useMemo(
    () =>
      isMultiClientSelected
        ? []
        : taskTypes.filter(
            (t) =>
              !t.is_standard &&
              t.client_id === selectedClientId &&
              (selectedCategoryFilter === 'ALL' ||
                (t.category || 'Fulfilment') === selectedCategoryFilter)
          ),
    [taskTypes, selectedClientId, selectedCategoryFilter, isMultiClientSelected]
  );

  // Group client tasks with project_name into collapsible Bespoke Project folders (Item #9)
  const bespokeProjectsList = useMemo(() => {
    const pool = isMultiClientSelected
      ? taskTypes.filter((t) => Boolean(t.project_name))
      : taskTypes.filter(
          (t) => Boolean(t.project_name) && t.client_id === selectedClientId
        );
    const map = new Map<
      string,
      {
        projectName: string;
        projectColor: string;
        clientId: string | null;
        clientName: string;
        tasks: TaskType[];
      }
    >();
    for (const t of pool) {
      if (!t.project_name) continue;
      const key = `${t.client_id || 'STD'}::${t.project_name}`;
      const existing = map.get(key);
      if (existing) {
        existing.tasks.push(t);
      } else {
        map.set(key, {
          projectName: t.project_name,
          projectColor: t.project_color || 'amber',
          clientId: t.client_id,
          clientName: t.client_name || selectedClient?.name || 'Client Project',
          tasks: [t],
        });
      }
    }
    return Array.from(map.values());
  }, [taskTypes, selectedClientId, isMultiClientSelected, selectedClient]);

  // Dedicated Cloud9 Internal / Housekeeping tasks (Item #10)
  const housekeepingTasks = useMemo(
    () =>
      taskTypes.filter(
        (t) =>
          (t.category || '').toLowerCase().includes('housekeeping') ||
          t.code === 'STD-CLEAN' ||
          t.billing_status === 'our_cost'
      ),
    [taskTypes]
  );

  // Favourite tasks resolved from favouriteKeys (Item #7)
  const favouriteTasks = useMemo(() => {
    const results: Array<{ task: TaskType; client: Client | undefined }> = [];
    for (const key of favouriteKeys) {
      const [cId, tId] = key.split(':');
      const task = taskTypes.find((t) => t.id === tId);
      if (!task) continue;
      const client =
        cId && cId !== 'STD'
          ? effectiveClients.find((c) => c.id === cId)
          : effectiveClients.find((c) => c.id === task.client_id) || selectedClient;
      results.push({ task, client });
    }
    return results;
  }, [favouriteKeys, taskTypes, effectiveClients, selectedClient]);

  // Prominent 30-Minute "Resume Last Task" lookup when No Task Running (Item #8)
  const lastStoppedWithin30Mins = useMemo(() => {
    if (runningEntry) return null;
    const nowMs = Date.now();
    for (const entry of todayEntries) {
      if (!entry.ended_at) continue;
      if (entry.note && entry.note.startsWith('[MISTAKE]')) continue;
      const endedMs = new Date(entry.ended_at).getTime();
      const diffMins = (nowMs - endedMs) / 60000;
      if (diffMins >= 0 && diffMins <= 30) {
        const matchedTask = taskTypes.find((t) => t.id === entry.task_type_id);
        const matchedClient = effectiveClients.find((c) => c.id === entry.client_id);
        if (matchedTask && matchedClient) {
          return {
            entry,
            task: matchedTask,
            client: matchedClient,
            minutesAgo: Math.max(1, Math.round(diffMins)),
          };
        }
      }
    }
    return null;
  }, [runningEntry, todayEntries, taskTypes, effectiveClients]);

  const standardTasks = useMemo(
    () =>
      taskTypes.filter(
        (t) =>
          Boolean(t.is_standard) &&
          (selectedCategoryFilter === 'ALL' ||
            (t.category || 'Fulfilment') === selectedCategoryFilter)
      ),
    [taskTypes, selectedCategoryFilter]
  );

  const allCategoryChoices = useMemo(() => {
    const set = new Set<string>([...DEFAULT_CATEGORIES, ...customCategories]);
    for (const t of taskTypes) {
      if (t.category && t.category.trim()) {
        set.add(t.category.trim());
      }
    }
    return Array.from(set);
  }, [taskTypes, customCategories]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>(customCategories);
    for (const t of taskTypes) {
      if (
        t.is_standard ||
        (!isMultiClientSelected && t.client_id === selectedClientId)
      ) {
        set.add(t.category || 'Fulfilment');
      }
    }
    return ['ALL', ...Array.from(set)];
  }, [taskTypes, selectedClientId, customCategories, isMultiClientSelected]);

  // Scoped Type Search: filters to selected client + standard tasks by default, or all clients if toggled
  const searchedTasks = useMemo(() => {
    const basePool = searchAllClients
      ? taskTypes
      : taskTypes.filter((t) => t.is_standard || t.client_id === selectedClientId);

    const q = searchQuery.trim().toLowerCase();
    if (!q) return basePool;
    return basePool.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        (t.category && t.category.toLowerCase().includes(q)) ||
        (t.client_name && t.client_name.toLowerCase().includes(q)) ||
        (t.client_code && t.client_code.toLowerCase().includes(q)) ||
        (t.barcode && t.barcode.toLowerCase().includes(q))
    );
  }, [taskTypes, searchQuery, searchAllClients, selectedClientId]);

  const performStartCatalogueTask = async (
    task: TaskType,
    source: EntrySource,
    targetClient: Client,
    orderRefValue?: string | null,
    unitsValue?: number | null,
    previousUnits?: number | null
  ) => {
    if (busy) return;
    const nowIso = new Date().toISOString();
    setBusy(true);
    setFeedback(null);

    const payload = {
      clientId: targetClient.id,
      taskTypeId: task.id,
      orderRef: orderRefValue?.trim() || null,
      units: unitsValue ?? null,
      previousUnits,
      source,
      startedAt: nowIso,
      userId: user.id,
    };

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('offline');
      }
      const res = await startTaskAction(payload);
      if (!res.ok) {
        setFeedback(res.error || 'Could not start task');
      } else {
        const startedEntry: TimeEntry = {
          id: res.entryId || `running-${Date.now()}`,
          user_id: user.id,
          user_name: user.display_name,
          client_id: targetClient.id,
          client_name: targetClient.name,
          client_code: targetClient.code,
          task_type_id: task.id,
          task_name: task.name,
          task_code: task.code,
          unit_label: task.unit_label || 'units',
          require_units_on_close: task.require_units_on_close ?? true,
          standard_minutes: task.standard_minutes,
          order_ref: payload.orderRef,
          started_at: nowIso,
          ended_at: null,
          units: payload.units,
          billable: task.billable,
          source,
          crew_id: null,
          created_by: user.id,
          auto_stopped: false,
          note: null,
          last_activity_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso,
        };
        setRunningEntry(startedEntry);
        setElapsedSeconds(0);
        setConfirmStartModal(null);
        setShowStopUnitsModal(false);
        setPendingSwitchAction(null);
        setLocalLastActivityMs(Date.now());
        pingToTopTimer(task.name, targetClient.name);
        router.refresh();
      }
    } catch {
      await enqueueOfflineAction('start_task', payload);
      const optimisticEntry: TimeEntry = {
        id: `offline-${Date.now()}`,
        user_id: user.id,
        user_name: user.display_name,
        client_id: targetClient.id,
        client_name: targetClient.name,
        client_code: targetClient.code,
        task_type_id: task.id,
        task_name: task.name,
        task_code: task.code,
        unit_label: task.unit_label || 'units',
        require_units_on_close: task.require_units_on_close ?? true,
        standard_minutes: task.standard_minutes,
        order_ref: payload.orderRef,
        started_at: nowIso,
        ended_at: null,
        units: payload.units,
        billable: task.billable,
        source,
        crew_id: null,
        created_by: user.id,
        auto_stopped: false,
        note: null,
        last_activity_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      };
      setRunningEntry(optimisticEntry);
      setElapsedSeconds(0);
      setConfirmStartModal(null);
      setShowStopUnitsModal(false);
      setPendingSwitchAction(null);
      setLocalLastActivityMs(Date.now());
      pingToTopTimer(task.name, targetClient.name);
      setFeedback('Queued offline — will sync automatically on reconnect.');
    } finally {
      setBusy(false);
    }
  };

  const doesRunningTaskRequireUnits = (entry: TimeEntry | null) => {
    if (!entry) return false;
    if (entry.require_units_on_close === false) return false;
    const matchedTask = taskTypes.find((t) => t.id === entry.task_type_id);
    if (matchedTask && matchedTask.require_units_on_close === false) return false;
    if (entry.task_code === 'STD-PICK' || entry.task_code === 'STD-PACK') {
      return matchedTask?.require_units_on_close ?? false;
    }
    return true;
  };

  // Direct 1-tap Task Start (or via Confirm Modal when orderRef / barcode scan is used)
  const executeStartTask = async (
    task: TaskType,
    source: EntrySource,
    overrideClient?: Client,
    orderRefValue?: string | null,
    unitsValue?: number | null
  ) => {
    if (busy) return;
    const targetClient =
      overrideClient ??
      (task.client_id ? clients.find((c) => c.id === task.client_id) : undefined) ??
      selectedClient;
    if (!targetClient) return;

    // If a task is currently running, first ask the operative to confirm ending the running task and switching
    if (runningEntry) {
      setConfirmStartModal(null);
      setClockOutAfterStop(false);
      setPendingSwitchAction({
        kind: 'catalogue',
        task,
        source,
        targetClient,
        orderRefValue,
        unitsValue,
      });
      setShowConfirmSwitchModal(true);
      return;
    }

    await performStartCatalogueTask(
      task,
      source,
      targetClient,
      orderRefValue,
      unitsValue,
      undefined
    );
  };

  const handleConfirmSwitchProceed = async () => {
    if (!runningEntry || !pendingSwitchAction) {
      setShowConfirmSwitchModal(false);
      return;
    }
    setShowConfirmSwitchModal(false);
    if (doesRunningTaskRequireUnits(runningEntry)) {
      setStopUnitsValue(runningEntry.units ? String(runningEntry.units) : '');
      setShowStopUnitsModal(true);
      return;
    }
    await completeStopOrSwitchWithUnits(runningEntry.units ?? null);
  };

  // Open Confirm-and-Start modal (used when operative clicks "# Ref" or scans a barcode)
  const openConfirmStart = (
    task: TaskType,
    source: EntrySource,
    overrideClient?: Client
  ) => {
    const targetClient =
      overrideClient ??
      (task.client_id ? clients.find((c) => c.id === task.client_id) : undefined) ??
      selectedClient;
    if (!targetClient) return;
    setOrderRefInput('');
    setInitialUnitsInput('');
    setConfirmStartModal({ task, targetClient, source });
  };

  const handleConfirmAndStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmStartModal || busy) return;
    const parsedUnits =
      initialUnitsInput.trim() !== '' ? parseInt(initialUnitsInput.trim(), 10) : null;
    await executeStartTask(
      confirmStartModal.task,
      confirmStartModal.source,
      confirmStartModal.targetClient,
      orderRefInput,
      Number.isNaN(parsedUnits as number) ? null : parsedUnits
    );
  };

  const performStartUnlistedTask = async (
    params: {
      clientId: string;
      clientName: string;
      customTaskTitle: string;
      category: string;
      orderRef: string | null;
      unitLabel: string;
      billingStatus: BillingStatus;
      unbilledReason: string | null;
    },
    previousUnits?: number | null
  ) => {
    setBusy(true);
    setFeedback(null);
    const res = await startUnlistedTaskAction({
      clientId: params.clientId,
      customTaskTitle: params.customTaskTitle,
      category: params.category,
      orderRef: params.orderRef,
      unitLabel: params.unitLabel || 'units',
      previousUnits,
      startedAt: new Date().toISOString(),
      userId: user.id,
      billingStatus: params.billingStatus,
      unbilledReason: params.unbilledReason,
    });
    setBusy(false);

    if (!res.ok) {
      setFeedback(res.error || 'Could not start unlisted task');
      return;
    }

    const nowIso = new Date().toISOString();
    const matchedClient = effectiveClients.find((c) => c.id === params.clientId);
    setRunningEntry({
      id: res.entryId || `running-unlisted-${Date.now()}`,
      user_id: user.id,
      user_name: user.display_name,
      client_id: params.clientId,
      client_name: params.clientName,
      client_code: matchedClient?.code || 'CUSTOM',
      task_type_id: 'unlisted',
      task_name: params.customTaskTitle,
      task_code: 'CUSTOM',
      unit_label: params.unitLabel || 'units',
      standard_minutes: null,
      order_ref: params.orderRef,
      started_at: nowIso,
      ended_at: null,
      units: null,
      billable: params.billingStatus !== 'our_cost',
      source: 'typed',
      crew_id: null,
      created_by: user.id,
      auto_stopped: false,
      note: null,
      last_activity_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    });
    setElapsedSeconds(0);
    setShowUnlistedModal(false);
    setShowStopUnitsModal(false);
    setPendingSwitchAction(null);
    setUnlistedTitle('');
    setUnlistedOrderRef('');
    setUnlistedUnitLabel('');
    setUnlistedBillingStatus('needs_billed');
    setUnlistedUnbilledReason('');
    setLocalLastActivityMs(Date.now());
    pingToTopTimer(params.customTaskTitle, params.clientName);
    setFeedback(
      `Started custom task "${params.customTaskTitle}" for ${params.clientName}.`
    );
    router.refresh();
  };

  // Execute "Task Not Listed" Start
  const handleStartUnlistedTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClient || !unlistedTitle.trim() || busy) return;

    if (unlistedBillingStatus === 'our_cost' && !unlistedUnbilledReason.trim()) {
      setFeedback(
        'A mandatory justification is required when starting an unbilled task.'
      );
      return;
    }

    const unlistedPayload = {
      clientId: selectedClient.id,
      clientName: selectedClient.name,
      customTaskTitle: unlistedTitle.trim(),
      category: unlistedCategory,
      orderRef: unlistedOrderRef.trim() || null,
      unitLabel: unlistedUnitLabel.trim() || 'units',
      billingStatus: unlistedBillingStatus,
      unbilledReason:
        unlistedBillingStatus === 'our_cost'
          ? unlistedUnbilledReason.trim()
          : null,
    };

    // If a task is currently running, first ask the operative to confirm ending the running task and switching
    if (runningEntry) {
      setShowUnlistedModal(false);
      setClockOutAfterStop(false);
      setPendingSwitchAction({
        kind: 'unlisted',
        ...unlistedPayload,
      });
      setShowConfirmSwitchModal(true);
      return;
    }

    await performStartUnlistedTask(unlistedPayload, undefined);
  };

  // Save Client (Add/Edit) from Manager Modal
  const handleSaveClientModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientEditModal) return;
    setBusy(true);
    const res = await upsertClientAction({
      id: clientEditModal.id,
      name: clientEditModal.name || '',
      code: clientEditModal.code || '',
      roundingMinutes: Number(clientEditModal.rounding_minutes ?? 0),
      billableDefault: clientEditModal.billable_default ?? true,
      active: clientEditModal.active ?? true,
    });
    setBusy(false);
    if (res.ok) {
      setClientEditModal(null);
      setFeedback('Client saved.');
      router.refresh();
    } else {
      setFeedback(res.error || 'Could not save client');
    }
  };

  // Save Task (Standard or Client-Specific) from Manager Modal
  const handleSaveTaskModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskEditModal) return;

    const parsedStdMins =
      !targetNotApplicable &&
      taskEditModal.standard_minutes !== null &&
      taskEditModal.standard_minutes !== undefined &&
      String(taskEditModal.standard_minutes) !== ''
        ? Number(taskEditModal.standard_minutes)
        : null;

    if (!targetNotApplicable && (parsedStdMins === null || parsedStdMins <= 0)) {
      setFeedback(
        'Please enter a Target (Standard Mins / Unit) or tick "Target Not Applicable (N/A)".'
      );
      return;
    }

    setBusy(true);
    const res = await upsertTaskTypeAction({
      id: taskEditModal.id,
      clientId: taskEditModal.is_standard
        ? null
        : taskEditModal.client_id || selectedClientId,
      isStandard: Boolean(taskEditModal.is_standard),
      category: taskEditModal.category || 'Fulfilment',
      projectName: taskEditModal.project_name || null,
      projectColor: taskEditModal.project_color || 'amber',
      name: taskEditModal.name || '',
      code: taskEditModal.code || '',
      roundingMinutes:
        taskEditModal.rounding_minutes === null ||
        taskEditModal.rounding_minutes === undefined
          ? null
          : Number(taskEditModal.rounding_minutes),
      minChargeMinutes:
        taskEditModal.min_charge_minutes === null ||
        taskEditModal.min_charge_minutes === undefined
          ? 0
          : Number(taskEditModal.min_charge_minutes),
      standardMinutes: parsedStdMins,
      unitLabel: taskEditModal.unit_label || 'units',
      requireUnitsOnClose: taskEditModal.require_units_on_close ?? true,
      billingStatus:
        taskEditModal.billing_status ??
        (taskEditModal.billable === false ? 'our_cost' : 'needs_billed'),
      billable:
        (taskEditModal.billing_status ??
          (taskEditModal.billable === false ? 'our_cost' : 'needs_billed')) !==
        'our_cost',
      rate:
        taskEditModal.rate !== null &&
        taskEditModal.rate !== undefined &&
        String(taskEditModal.rate) !== ''
          ? Number(taskEditModal.rate)
          : null,
      barcode: taskEditModal.barcode || null,
      sortOrder: Number(taskEditModal.sort_order ?? 10),
      active: taskEditModal.active ?? true,
    });
    setBusy(false);
    if (res.ok) {
      setTaskEditModal(null);
      setFeedback('Task saved to catalogue.');
      router.refresh();
    } else {
      setFeedback(res.error || 'Could not save task');
    }
  };

  // Handle Barcode Scan Match
  const handleBarcodeDetected = (code: string) => {
    setShowScanner(false);
    const clean = code.trim().toUpperCase();
    const match = taskTypes.find(
      (t) =>
        (t.barcode && t.barcode.toUpperCase() === clean) ||
        t.code.toUpperCase() === clean
    );
    if (!match) {
      setFeedback(`No active task found for barcode "${code}"`);
      return;
    }
    openConfirmStart(match, 'scan');
  };

  // Open "I've chosen the wrong task" modal to reassign running timer without stopping it
  const openWrongTaskModal = () => {
    if (!runningEntry) return;
    const defaultClient = runningEntry.client_id || selectedClientId;
    setWrongTaskClientId(defaultClient);
    const matchingTasks = taskTypes.filter(
      (t) => t.is_standard || t.client_id === defaultClient
    );
    const defaultTask =
      matchingTasks.find((t) => t.id !== runningEntry.task_type_id)?.id ||
      matchingTasks[0]?.id ||
      '';
    setWrongTaskTypeId(defaultTask);
    setWrongTaskReason('');
    setShowWrongTaskModal(true);
  };

  const handleReassignWrongTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!runningEntry || !wrongTaskClientId || !wrongTaskTypeId || busy) return;
    const chosenClient = effectiveClients.find((c) => c.id === wrongTaskClientId);
    const chosenTask = taskTypes.find((t) => t.id === wrongTaskTypeId);
    if (!chosenClient || !chosenTask) return;

    setBusy(true);
    setFeedback(null);
    const res = await reassignRunningTaskAction({
      entryId: runningEntry.id,
      newClientId: chosenClient.id,
      newTaskTypeId: chosenTask.id,
      reason: wrongTaskReason,
    });
    setBusy(false);

    if (!res.ok) {
      setFeedback(res.error || 'Could not reassign running timer.');
      return;
    }

    setRunningEntry({
      ...runningEntry,
      client_id: chosenClient.id,
      client_name: chosenClient.name,
      client_code: chosenClient.code,
      task_type_id: chosenTask.id,
      task_name: chosenTask.name,
      task_code: chosenTask.code,
      unit_label: chosenTask.unit_label || 'units',
      require_units_on_close: chosenTask.require_units_on_close ?? true,
      standard_minutes: chosenTask.standard_minutes,
    });
    setShowWrongTaskModal(false);
    setFeedback(
      `Timer reassigned to "${chosenTask.name}" (${chosenClient.name}) — kept original start time.`
    );
    router.refresh();
  };

  const handleOpenMistakeCancelModal = () => {
    if (!runningEntry) return;
    setPendingSwitchAction(null);
    setClockOutAfterStop(false);
    setStopUnitsValue('0');
    setStopIsMistake(true);
    setStopMistakeReason('');
    setShowStopUnitsModal(true);
  };

  // Handle pressing big STOP button (or confirmed Clock Out)
  const handlePressStop = (andClockOut = false) => {
    if (!runningEntry) {
      if (andClockOut) {
        executeClockOut(undefined);
      }
      return;
    }

    setStopIsMistake(false);
    setStopMistakeReason('');

    if (!doesRunningTaskRequireUnits(runningEntry)) {
      if (andClockOut) {
        executeClockOut(runningEntry.units ?? null);
      } else {
        executeStopTask(runningEntry.units ?? null, false, null);
      }
      return;
    }

    setPendingSwitchAction(null);
    setClockOutAfterStop(andClockOut);
    setStopUnitsValue(runningEntry.units ? String(runningEntry.units) : '');
    setShowStopUnitsModal(true);
  };

  const completeStopOrSwitchWithUnits = async (units: number | null | undefined) => {
    if (pendingSwitchAction) {
      if (pendingSwitchAction.kind === 'catalogue') {
        await performStartCatalogueTask(
          pendingSwitchAction.task,
          pendingSwitchAction.source,
          pendingSwitchAction.targetClient,
          pendingSwitchAction.orderRefValue,
          pendingSwitchAction.unitsValue,
          units ?? null
        );
      } else {
        await performStartUnlistedTask(pendingSwitchAction, units ?? null);
      }
      return;
    }

    if (clockOutAfterStop) {
      await executeClockOut(units);
    } else {
      await executeStopTask(units, stopIsMistake, stopMistakeReason);
    }
  };

  const executeStopTask = async (
    units: number | null | undefined,
    isMistakeFlag = false,
    mistakeNote: string | null = null
  ) => {
    if (!runningEntry || busy) return;
    const nowIso = new Date().toISOString();
    setBusy(true);
    setFeedback(null);

    const payload = {
      entryId: runningEntry.id.startsWith('offline-') ? undefined : runningEntry.id,
      units: isMistakeFlag ? 0 : units,
      endedAt: nowIso,
      userId: user.id,
      isMistake: isMistakeFlag,
      mistakeReason: mistakeNote,
    };

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('offline');
      }
      await stopTaskAction(payload);
      setRunningEntry(null);
      setShowStopUnitsModal(false);
      setStopIsMistake(false);
      setStopMistakeReason('');
      if (isMistakeFlag) {
        setFeedback('Timer cancelled as accidental start — excluded from pace averages and client billing.');
      }
      router.refresh();
    } catch {
      await enqueueOfflineAction('stop_task', payload);
      setRunningEntry(null);
      setShowStopUnitsModal(false);
      setStopIsMistake(false);
      setStopMistakeReason('');
      setFeedback('Task stop queued offline — will sync on reconnect.');
    } finally {
      setBusy(false);
    }
  };

  const executeClockOut = async (units: number | null | undefined) => {
    if (busy) return;
    const nowIso = new Date().toISOString();
    setBusy(true);
    setShowClockOutConfirmModal(false);

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('offline');
      }
      await clockOutAction({ userId: user.id, units, timestamp: nowIso });
      setRunningEntry(null);
      setShowStopUnitsModal(false);
      if (isKioskMode) {
        router.push('/kiosk');
      } else {
        setFeedback('You have clocked out and closed your shift.');
        router.refresh();
      }
    } catch {
      await enqueueOfflineAction('clock_out', {
        userId: user.id,
        units,
        timestamp: nowIso,
      });
      setRunningEntry(null);
      setShowStopUnitsModal(false);
      if (isKioskMode) {
        router.push('/kiosk');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAdjustLiveTally = async (deltaOrExact: number, isExact = false) => {
    if (!runningEntry) return;
    const currentUnits = Number(runningEntry.units ?? 0);
    const nextUnits = isExact
      ? Math.max(0, Math.round(deltaOrExact))
      : Math.max(0, currentUnits + deltaOrExact);
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    setLocalLastActivityMs(nowMs);
    setIdleSecondsSinceActivity(0);
    setRunningEntry({
      ...runningEntry,
      units: nextUnits,
      last_activity_at: nowIso,
    });

    if (!runningEntry.id.startsWith('offline-') && !runningEntry.id.startsWith('running-')) {
      try {
        await updateRunningTaskUnitsAction({
          entryId: runningEntry.id,
          units: nextUnits,
        });
      } catch {
        // Ignore transient network errors — state is kept in runningEntry
      }
    }
  };

  const handleConfirmStillOnTask = async () => {
    if (!runningEntry) return;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    setShowStopUnitsModal(false);
    setLocalLastActivityMs(nowMs);
    setIdleSecondsSinceActivity(0);
    setRunningEntry({
      ...runningEntry,
      last_activity_at: nowIso,
    });

    setBusy(true);
    await confirmStillOnTaskAction({ entryId: runningEntry.id });
    setBusy(false);
    setFeedback('Confirmed — timer continues for another 60 minutes.');
    router.refresh();
  };

  const executeVoiceCommand = async (rawPhrase: string) => {
    const phrase = rawPhrase.trim().toLowerCase();
    setLastVoiceTranscript(rawPhrase.trim());

    if (phrase.includes('stop')) {
      if (!runningEntry) {
        setFeedback('Voice Command: No task is currently running to stop.');
        return;
      }
      handlePressStop(false);
      return;
    }

    if (phrase.includes('plus ten') || phrase.includes('add ten') || phrase.includes('+10')) {
      if (!runningEntry) {
        setFeedback('Voice Command: Start a task first before adding to Live Tally.');
        return;
      }
      await handleAdjustLiveTally(10);
      setFeedback('Voice Command executed: Added +10 to Live Tally.');
      return;
    }

    if (phrase.includes('plus five') || phrase.includes('add five') || phrase.includes('+5')) {
      if (!runningEntry) {
        setFeedback('Voice Command: Start a task first before adding to Live Tally.');
        return;
      }
      await handleAdjustLiveTally(5);
      setFeedback('Voice Command executed: Added +5 to Live Tally.');
      return;
    }

    if (phrase.includes('plus one') || phrase.includes('add one') || phrase.includes('+1')) {
      if (!runningEntry) {
        setFeedback('Voice Command: Start a task first before adding to Live Tally.');
        return;
      }
      await handleAdjustLiveTally(1);
      setFeedback('Voice Command executed: Added +1 to Live Tally.');
      return;
    }

    if (phrase.includes('resume')) {
      if (lastStoppedWithin30Mins) {
        await executeStartTask(
          lastStoppedWithin30Mins.task,
          'picked',
          lastStoppedWithin30Mins.client,
          lastStoppedWithin30Mins.entry.order_ref
        );
        return;
      }
      const fallbackRecent = last5Tasks[0];
      if (fallbackRecent) {
        const clientObj =
          effectiveClients.find((c) => c.id === fallbackRecent.client_id) ||
          selectedClient ||
          MULTI_CLIENT_DEFAULT;
        await executeStartTask(fallbackRecent, 'picked', clientObj);
        return;
      }
      setFeedback('Voice Command: No recent task found to resume.');
      return;
    }

    if (phrase.includes('pack')) {
      const packTask =
        taskTypes.find((t) => t.code === 'STD-PACK') ||
        taskTypes.find((t) => t.name.toLowerCase().includes('pack'));
      if (packTask) {
        await executeStartTask(packTask, 'picked', selectedClient || MULTI_CLIENT_DEFAULT);
        return;
      }
    }

    if (phrase.includes('pick')) {
      const pickTask =
        taskTypes.find((t) => t.code === 'STD-PICK') ||
        taskTypes.find((t) => t.name.toLowerCase().includes('pick'));
      if (pickTask) {
        await executeStartTask(pickTask, 'picked', selectedClient || MULTI_CLIENT_DEFAULT);
        return;
      }
    }

    setFeedback(`Voice heard "${rawPhrase}" — try "Start Pick", "Start Pack", "Plus 10", "Resume", or "Stop Task".`);
  };

  const triggerBrowserVoiceListen = () => {
    if (typeof window === 'undefined') return;
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setShowVoicePanel(true);
      setFeedback('Browser Speech API not active on this device — use the Hands-Free Command Triggers below.');
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = 'en-GB';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      setIsVoiceListening(true);
      setShowVoicePanel(true);

      recognition.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript || '';
        setIsVoiceListening(false);
        if (transcript) {
          executeVoiceCommand(transcript);
        }
      };
      recognition.onerror = () => {
        setIsVoiceListening(false);
      };
      recognition.onend = () => {
        setIsVoiceListening(false);
      };
      recognition.start();
    } catch {
      setIsVoiceListening(false);
      setShowVoicePanel(true);
    }
  };

  const exitKioskFromBanner = () => {
    window.localStorage.removeItem('kiosk');
    setIsKioskMode(false);
    window.dispatchEvent(new CustomEvent('c9-kiosk-changed'));
    router.replace('/now');
  };

  const isManagerOrAdmin = user.role === 'supervisor' || user.role === 'admin';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Kiosk Session Banner OR Personal Shift Status Strip */}
      {isKioskMode ? (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-slate-900 border border-amber-500/40 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 flex items-center justify-center shrink-0">
              <Tablet className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-black uppercase tracking-wider text-amber-300">
                Kiosk Session Active
              </div>
              <div className="text-base font-black text-white flex flex-wrap items-center gap-2">
                <span>{user.display_name}</span>
                {openAttendance && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Clocked in {formatLondonTime(openAttendance.clock_in)}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/kiosk')}
              className="h-11 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs sm:text-sm font-bold border border-slate-700 flex items-center justify-center transition"
            >
              Switch Operative
            </button>
            <button
              type="button"
              onClick={exitKioskFromBanner}
              className="h-11 px-4 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs sm:text-sm font-bold border border-amber-500/50 flex items-center justify-center gap-1.5 transition"
            >
              <Unlock className="w-4 h-4" />
              Exit Kiosk Mode
            </button>
            <button
              type="button"
              onClick={() => setShowClockOutConfirmModal(true)}
              className="h-11 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-black shadow flex items-center justify-center gap-1.5 transition"
            >
              <LogOut className="w-4 h-4" />
              Clock Out
            </button>
          </div>
        </div>
      ) : (
        openAttendance && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 rounded-2xl bg-slate-900/90 border border-slate-800">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold text-slate-200">{user.display_name}</span>
              <span className="text-slate-400">
                · Shift clocked in since{' '}
                <strong className="text-emerald-400 font-mono">
                  {formatLondonTime(openAttendance.clock_in)}
                </strong>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowVoicePanel((prev) => !prev)}
                className={`px-3.5 py-2 rounded-xl border text-xs font-black inline-flex items-center gap-1.5 transition ${
                  showVoicePanel || isVoiceListening
                    ? 'bg-[#22D3EE] text-slate-950 border-[#22D3EE] shadow-md shadow-cyan-500/20'
                    : 'bg-slate-800/90 hover:bg-slate-700 text-cyan-300 border-cyan-500/40'
                }`}
              >
                <Mic className={`w-3.5 h-3.5 ${isVoiceListening ? 'animate-ping' : ''}`} />
                Hands-Free Voice Mode
              </button>
              <button
                type="button"
                onClick={() => setShowClockOutConfirmModal(true)}
                className="px-3.5 py-2 rounded-xl bg-rose-950/70 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/40 text-xs font-black inline-flex items-center gap-1.5 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                End Shift / Clock Out
              </button>
            </div>
          </div>
        )
      )}

      {/* BACKLOG FEATURE #3: HANDS-FREE VOICE COMMAND MODE PANEL (30:31-31:10) */}
      {showVoicePanel && (
        <div className="p-4 sm:p-5 rounded-3xl bg-slate-900/95 border-2 border-[#22D3EE]/50 shadow-xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-[#22D3EE]/15 border border-[#22D3EE]/40 flex items-center justify-center text-[#22D3EE]">
                <Mic className={`w-5 h-5 ${isVoiceListening ? 'animate-pulse' : ''}`} />
              </span>
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-[#22D3EE]">
                  Hands-Free Voice Command Mode (Glove & Wristband Ready)
                </div>
                <div className="text-xs text-slate-400">
                  Say or tap a voice phrase below to start, tally, resume, or stop tasks hands-free.
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={triggerBrowserVoiceListen}
                className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition ${
                  isVoiceListening
                    ? 'bg-rose-500 text-white animate-pulse'
                    : 'bg-[#22D3EE] hover:bg-cyan-300 text-slate-950'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                {isVoiceListening ? 'Listening... Speak Now' : 'Listen via Microphone'}
              </button>
              <button
                type="button"
                onClick={() => setShowVoicePanel(false)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {lastVoiceTranscript && (
            <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 font-mono">
              Last voice command: <span className="text-[#22D3EE] font-bold">&ldquo;{lastVoiceTranscript}&rdquo;</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {[
              { label: '🎙️ "Start Pick"', cmd: 'start pick' },
              { label: '🎙️ "Start Pack"', cmd: 'start pack' },
              { label: '🎙️ "Plus One (+1)"', cmd: 'plus one' },
              { label: '🎙️ "Plus Five (+5)"', cmd: 'plus five' },
              { label: '🎙️ "Plus Ten (+10)"', cmd: 'plus ten' },
              { label: '🎙️ "Resume Last Task"', cmd: 'resume' },
              { label: '🎙️ "Stop Task"', cmd: 'stop task' },
            ].map((item) => (
              <button
                key={item.cmd}
                type="button"
                disabled={busy}
                onClick={() => executeVoiceCommand(item.cmd)}
                className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-200 hover:text-[#22D3EE] border border-slate-800 hover:border-[#22D3EE]/50 text-xs font-bold transition"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {feedback && (
        <div className="p-4 rounded-2xl bg-slate-900 border border-emerald-500/50 text-emerald-300 text-sm font-bold flex items-center justify-between shadow-lg">
          <span>{feedback}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ACTIVE TIMER HERO CARD */}
      <section
        ref={activeTimerSectionRef}
        className={`scroll-mt-20 rounded-3xl border p-6 sm:p-8 shadow-2xl transition border-l-[3px] border-l-[#22D3EE] ${
          justStartedPulse
            ? 'ring-4 ring-emerald-400/70 bg-gradient-to-b from-emerald-950/60 via-slate-900 to-slate-900 timer-running'
            : runningEntry
              ? 'bg-gradient-to-b from-cyan-950/35 via-slate-900 to-slate-900 timer-running'
              : 'bg-gradient-to-b from-slate-900 to-slate-900/90 border-slate-800/90'
        }`}
      >
        {justStartedPulse && (
          <div className="mb-4 px-4 py-3 rounded-2xl bg-emerald-500 text-slate-950 font-black text-sm sm:text-base flex items-center justify-between gap-3 shadow-lg shadow-emerald-500/25 animate-pulse">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>
                TIMER STARTED — Now timing <u>{justStartedPulse.taskName}</u> ({justStartedPulse.clientName})
              </span>
            </div>
            <span className="text-xs uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-950 text-emerald-300 font-mono">
              LIVE
            </span>
          </div>
        )}
        {runningEntry ? (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#22D3EE] text-slate-950 text-xs font-black uppercase tracking-wider mb-2 shadow">
                  <span className="w-2 h-2 rounded-full bg-slate-950 animate-ping" />
                  Running Now · {runningEntry.client_code}
                </div>
                <h1 className="text-2xl sm:text-4xl font-black text-white leading-tight">
                  {runningEntry.task_name}
                </h1>
                <p className="text-base sm:text-lg font-bold text-[#22D3EE] mt-1 flex flex-wrap items-center gap-2">
                  <span>{runningEntry.client_name}</span>
                  {runningEntry.order_ref && (
                    <span className="px-2.5 py-0.5 rounded-lg bg-slate-800 text-slate-200 font-mono text-xs border border-slate-700">
                      Ref: {runningEntry.order_ref}
                    </span>
                  )}
                </p>
              </div>

              <div className="text-right bg-slate-950/70 px-4 py-2.5 rounded-2xl border border-slate-800">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Started At
                </div>
                <div className="text-lg font-black text-slate-100 font-mono">
                  {formatLondonTime(runningEntry.started_at)}
                </div>
              </div>
            </div>

            {/* Big Elapsed Timer Display */}
            <div className="py-5 px-6 rounded-2xl bg-slate-950/90 border border-slate-800/90 text-center shadow-inner">
              <div className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
                Elapsed Time
              </div>
              <div
                className="text-5xl sm:text-7xl font-black font-mono tracking-wider text-white tabular-nums"
                data-testid="elapsed-timer"
              >
                {formatElapsedHMS(elapsedSeconds)}
              </div>
            </div>

            {/* LIVE TALLY / BATCH LAP COUNTER (+1, +5, +10) */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/85 border border-emerald-500/35 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 text-center sm:text-left">
                <div className="px-4 py-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 min-w-[92px] text-center">
                  <div className="text-[10px] font-black uppercase tracking-wider text-emerald-300">
                    Live Tally
                  </div>
                  <div
                    className="text-3xl font-black font-mono text-white tabular-nums leading-none mt-0.5"
                    data-testid="live-tally-count"
                  >
                    {runningEntry.units ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-emerald-400">
                    Batch / Lap Counter ({runningEntry.unit_label || 'units'})
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Tap as you complete batches — pre-fills your final count when stopping.
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handleAdjustLiveTally(-1)}
                  disabled={(runningEntry.units ?? 0) <= 0}
                  className="h-12 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-mono font-black text-base border border-slate-700 transition active:scale-95"
                  title="Subtract 1"
                >
                  -1
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjustLiveTally(1)}
                  className="h-12 px-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-mono font-black text-lg border border-emerald-500/50 shadow-sm transition active:scale-95"
                >
                  +1
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjustLiveTally(5)}
                  className="h-12 px-4 rounded-xl bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-200 font-mono font-black text-lg border border-emerald-500/50 shadow-sm transition active:scale-95"
                >
                  +5
                </button>
                <button
                  type="button"
                  onClick={() => handleAdjustLiveTally(10)}
                  className="h-12 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-black text-lg shadow-md shadow-emerald-500/20 transition active:scale-95"
                >
                  +10
                </button>
                {(runningEntry.units ?? 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => handleAdjustLiveTally(0, true)}
                    className="h-12 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-bold border border-slate-800 transition"
                    title="Reset tally to 0"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* ONE BIG STOP BUTTON */}
            <button
              type="button"
              disabled={busy}
              onClick={() => handlePressStop(false)}
              className="w-full min-h-[76px] rounded-2xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white text-2xl font-black tracking-wide shadow-xl shadow-rose-950/50 flex items-center justify-center gap-3 transition active:scale-[0.99]"
            >
              <Square className="w-7 h-7 fill-current" />
              STOP TASK
              {doesRunningTaskRequireUnits(runningEntry) && (
                <span className="text-sm font-bold bg-rose-900/80 px-3 py-1 rounded-xl border border-rose-400/30">
                  + Log {runningEntry.unit_label || 'units'}
                </span>
              )}
            </button>

            {/* WRONG TASK RESELECTOR & ACCIDENTAL START MISTAKE ROW */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={openWrongTaskModal}
                className="h-11 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 hover:text-amber-200 border border-amber-500/35 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition"
              >
                <RotateCcw className="w-4 h-4 shrink-0" />
                I&apos;ve Chosen the Wrong Task
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleOpenMistakeCancelModal}
                className="h-11 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-rose-300 border border-slate-800 hover:border-rose-500/40 text-xs font-bold flex items-center justify-center gap-2 transition"
              >
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                Accidental Start / I Made a Mistake
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-5 space-y-4">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-slate-800/90 border border-slate-700 text-[#22D3EE] mb-1 shadow-inner">
              <Clock className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#22D3EE] uppercase tracking-[1px]">
                No Task Running
              </h1>
              <p className="text-[12px] font-normal text-[#888888] max-w-lg mx-auto mt-1">
                Tap a task in the Quick Bar below to start in one click, or choose a client and select a task from the catalogue.
              </p>
            </div>

            {/* ITEM #8: PROMINENT 30-MINUTE "RESUME LAST TASK" BUTTON */}
            {lastStoppedWithin30Mins && (
              <div className="max-w-xl mx-auto pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    executeStartTask(
                      lastStoppedWithin30Mins.task,
                      'picked',
                      lastStoppedWithin30Mins.client,
                      lastStoppedWithin30Mins.entry.order_ref
                    )
                  }
                  className="w-full min-h-[68px] px-5 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black shadow-xl shadow-emerald-500/20 flex items-center justify-between gap-3 transition active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3 text-left min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-slate-950/20 flex items-center justify-center shrink-0">
                      <RotateCcw className="w-6 h-6 stroke-[2.75]" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-wider text-slate-900/80">
                        Stopped {lastStoppedWithin30Mins.minutesAgo}m ago · 1-Click Resume
                      </div>
                      <div className="text-base sm:text-lg font-black text-slate-950 truncate">
                        Resume {lastStoppedWithin30Mins.task.name}
                      </div>
                      <div className="text-xs font-bold text-slate-900/85 truncate">
                        {lastStoppedWithin30Mins.client.name} ({lastStoppedWithin30Mins.client.code})
                      </div>
                    </div>
                  </div>
                  <span className="px-3.5 py-2 rounded-xl bg-slate-950 text-emerald-300 text-xs font-black uppercase tracking-wider shrink-0 flex items-center gap-1.5">
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Resume
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="section-divider" />

      {/* ITEM #7: 3-WAY TOP QUICK BAR (ASSIGNED TO YOU | LAST 4 TASKS | FAVOURITES) */}
      <section className="bg-[#0B0F19] border-2 border-lime-500/30 border-l-[6px] border-l-[#E8FF2A] rounded-3xl p-5 space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-lime-500/20">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-0.5 rounded-lg bg-[#E8FF2A] text-slate-950 flex items-center justify-center text-[12px] font-black tracking-wider shadow-sm">
              QUICK BAR
            </span>
            <h2 className="text-[16px] font-bold uppercase tracking-[1px] text-[#E8FF2A] flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-[#E8FF2A]" />
              1-Tap Task Launchpad
            </h2>
          </div>

          {/* 3-Way Tab Switcher */}
          <div className="inline-flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => setQuickBarTab('assigned')}
              className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition ${
                quickBarTab === 'assigned'
                  ? 'bg-[#E8FF2A] text-slate-950 shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>Assigned to You</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  quickBarTab === 'assigned'
                    ? 'bg-slate-950 text-[#E8FF2A]'
                    : assignedTasks.length > 0
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-800 text-slate-400'
                }`}
              >
                {assignedTasks.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setQuickBarTab('recent')}
              className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition ${
                quickBarTab === 'recent'
                  ? 'bg-[#E8FF2A] text-slate-950 shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <span>Last 4 Tasks</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  quickBarTab === 'recent'
                    ? 'bg-slate-950 text-[#E8FF2A]'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {Math.min(4, last5Tasks.length)}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setQuickBarTab('favourites')}
              className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition ${
                quickBarTab === 'favourites'
                  ? 'bg-[#E8FF2A] text-slate-950 shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>Favourites</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  quickBarTab === 'favourites'
                    ? 'bg-slate-950 text-[#E8FF2A]'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {favouriteTasks.length}
              </span>
            </button>
          </div>
        </div>

        {/* TAB 1: ASSIGNED TO YOU */}
        {quickBarTab === 'assigned' && (
          <div>
            {assignedTasks.length === 0 ? (
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-1">
                <div className="text-sm font-bold text-slate-300">
                  No tasks currently assigned to you by a Supervisor
                </div>
                <p className="text-xs text-slate-400">
                  Switch to <button type="button" onClick={() => setQuickBarTab('recent')} className="text-[#E8FF2A] underline font-bold">Last 4 Tasks</button> or <button type="button" onClick={() => setQuickBarTab('favourites')} className="text-[#E8FF2A] underline font-bold">Favourites</button>, or pick from the catalogue below.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {assignedTasks.map((assigned) => {
                  const matchedTask = taskTypes.find((t) => t.id === assigned.task_type_id);
                  const matchedClient = effectiveClients.find((c) => c.id === assigned.client_id);
                  const isCurrentlyRunning =
                    runningEntry?.task_type_id === assigned.task_type_id &&
                    runningEntry?.client_id === assigned.client_id;

                  const isOpenPoolGrab = Boolean(assigned.is_open_pool || !assigned.user_id);

                  return (
                    <div
                      key={assigned.id}
                      className={`w-full p-4 rounded-2xl bg-slate-900/95 border-2 text-left flex items-center justify-between gap-3.5 shadow-lg ${
                        isOpenPoolGrab
                          ? 'border-amber-400/70 bg-gradient-to-r from-amber-950/25 to-slate-900'
                          : 'border-[#E8FF2A]/50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {isOpenPoolGrab ? (
                            <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-mono text-[10px] font-black uppercase tracking-wider">
                              OPEN POOL GRAB · ANY OPERATIVE
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-[#E8FF2A] text-slate-950 font-mono text-[10px] font-black">
                              ASSIGNED BY {assigned.assigned_by_name?.toUpperCase() || 'SUPERVISOR'}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono text-[10px] font-bold">
                            {assigned.client_code}
                          </span>
                          {assigned.order_ref && (
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[10px]">
                              Ref: {assigned.order_ref}
                            </span>
                          )}
                        </div>
                        <div className="text-[15px] font-bold text-white mt-1.5 leading-snug">
                          {assigned.task_name}
                        </div>
                        <div className="text-xs text-slate-300 mt-0.5">
                          {assigned.client_name}
                          {assigned.note ? ` · "${assigned.note}"` : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={async () => {
                            await dismissAssignedTaskAction({ assignedTaskId: assigned.id });
                            router.refresh();
                          }}
                          className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs"
                          title="Dismiss assigned task"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        {matchedTask && matchedClient && (
                          <button
                            type="button"
                            disabled={busy || isCurrentlyRunning}
                            onClick={() =>
                              executeStartTask(
                                matchedTask,
                                'picked',
                                matchedClient,
                                assigned.order_ref
                              )
                            }
                            className={`play-btn px-3.5 h-11 rounded-xl disabled:opacity-50 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-md transition ${
                              isOpenPoolGrab
                                ? 'bg-amber-400 hover:bg-amber-300 shadow-amber-500/20'
                                : 'bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/20'
                            }`}
                          >
                            <Play className="w-4 h-4 fill-current" />
                            {isOpenPoolGrab ? 'Grab & Start' : 'Start'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LAST 4 TASKS */}
        {quickBarTab === 'recent' && (
          <div>
            {last5Tasks.length === 0 ? (
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-400">
                No recent tasks recorded yet. Select a client and start a task below.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {last5Tasks.slice(0, 4).map((task) => {
                  const isCurrentlyRunning =
                    runningEntry?.task_type_id === task.id &&
                    runningEntry?.client_id === task.client_id;
                  const matchedClient = effectiveClients.find(
                    (c) => c.id === task.client_id
                  );
                  const isStandard = Boolean(task.is_standard);
                  const favKey = `${task.client_id || 'STD'}:${task.id}`;
                  const isFav = favouriteKeys.includes(favKey);

                  return (
                    <div
                      key={`${task.client_id}-${task.id}`}
                      className={`w-full p-4 rounded-2xl border text-left flex items-center justify-between gap-3.5 transition-all shadow-lg ${
                        isCurrentlyRunning
                          ? 'bg-emerald-950/30 border-emerald-500/40 opacity-60'
                          : 'bg-slate-900/90 hover:bg-slate-850 border-slate-800 card-interactive'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {task.client_code && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (task.client_id) {
                                  setSelectedClientId(task.client_id);
                                }
                              }}
                              className="px-2 py-0.5 rounded bg-[#10B981] hover:bg-emerald-400 text-slate-950 font-mono text-[10px] font-black flex items-center gap-1 transition shadow-sm"
                            >
                              <span>{task.client_code}</span>
                              <ChevronRight className="w-2.5 h-2.5 stroke-[3]" />
                            </button>
                          )}
                          <span className="text-[12px] font-medium text-slate-400 truncate max-w-[130px]">
                            {task.client_name}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[9.5px] font-mono font-bold uppercase tracking-wider ${
                              isStandard
                                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {isStandard ? 'Standard SOP' : 'Bespoke SOW'}
                          </span>
                        </div>
                        <div className="text-[15px] font-semibold text-[#E8E8E8] mt-1.5 leading-snug">
                          {task.name}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleFavouriteTask(task.client_id, task.id)}
                          className={`p-2.5 rounded-xl border transition ${
                            isFav
                              ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-amber-300'
                          }`}
                          title={isFav ? 'Remove from Favourites' : 'Star as Weekly Favourite'}
                        >
                          <Star className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                        </button>
                        <button
                          type="button"
                          disabled={busy || isCurrentlyRunning}
                          onClick={() => executeStartTask(task, 'picked', matchedClient)}
                          className="play-btn w-11 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20 transition"
                          title="Resume task immediately"
                        >
                          <Play className="w-5 h-5 fill-current" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: FAVOURITES */}
        {quickBarTab === 'favourites' && (
          <div>
            {favouriteTasks.length === 0 ? (
              <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-1">
                <div className="text-sm font-bold text-slate-300">
                  No weekly favourite tasks starred yet
                </div>
                <p className="text-xs text-slate-400">
                  Tap the <strong className="text-amber-300">★ Star</strong> button on any task card to pin your regular weekly tasks here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {favouriteTasks.map(({ task, client }) => {
                  const isCurrentlyRunning =
                    runningEntry?.task_type_id === task.id &&
                    runningEntry?.client_id === (client?.id ?? task.client_id);
                  return (
                    <div
                      key={`fav-${client?.id || 'STD'}-${task.id}`}
                      className="w-full p-4 rounded-2xl bg-slate-900/90 border border-amber-500/35 text-left flex items-center justify-between gap-3.5 shadow-lg"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 font-mono text-[10px] font-black">
                            ★ FAVOURITE
                          </span>
                          {client && (
                            <span className="text-xs font-bold text-emerald-400">
                              {client.name} ({client.code})
                            </span>
                          )}
                        </div>
                        <div className="text-[15px] font-semibold text-white mt-1.5 leading-snug">
                          {task.name}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleFavouriteTask(client?.id ?? task.client_id, task.id)}
                          className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-400 text-amber-300"
                          title="Remove from Favourites"
                        >
                          <Star className="w-4 h-4 fill-current" />
                        </button>
                        <button
                          type="button"
                          disabled={busy || isCurrentlyRunning}
                          onClick={() => executeStartTask(task, 'picked', client)}
                          className="play-btn w-11 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/20 transition"
                        >
                          <Play className="w-5 h-5 fill-current" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      <div className="section-divider" />

      {/* MODE CONTROLLER HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl">
        <div>
          <h2 className="text-[16px] font-bold uppercase tracking-[1px] text-[#2DD4BF] flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2DD4BF] shadow-[0_0_8px_#2DD4BF]" />
            Warehouse Task Station
          </h2>
          <p className="text-[12px] font-normal text-slate-400 mt-0.5">
            1. Target Context · 2. Select Universal Warehouse SOP or Bespoke Client SOW Task
          </p>
        </div>

        {/* Unified Single-Row Segmented Controls */}
        <div className="inline-flex items-center gap-1.5 p-1.5 rounded-2xl bg-slate-950 border border-slate-800 shrink-0 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setStartTab('pick')}
            className={`h-11 px-3.5 rounded-xl text-xs font-black flex items-center gap-1.5 whitespace-nowrap transition ${
              startTab === 'pick'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FolderKanban className="w-4 h-4" />
            Task Selector
          </button>
          <button
            type="button"
            onClick={() => setStartTab('type')}
            className={`h-11 px-3.5 rounded-xl text-xs font-black flex items-center gap-1.5 whitespace-nowrap transition ${
              startTab === 'type'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Search className="w-4 h-4" />
            Type Search
          </button>
          <button
            type="button"
            onClick={() => setShowScanner(true)}
            className="h-11 px-3.5 rounded-xl text-xs font-black bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 whitespace-nowrap transition"
          >
            <QrCode className="w-4 h-4" />
            Scan Barcode
          </button>
        </div>
      </div>

      {/* STATION 01: CLIENT & ACCOUNT SELECTION ("PURCHASE / CLIENT SELECTION") */}
      <section className="bg-[#0B101D] border-2 border-teal-500/35 border-l-[6px] border-l-[#2DD4BF] rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-teal-500/20">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-1 rounded-xl bg-[#2DD4BF] text-slate-950 text-xs font-black tracking-wider shadow-sm">
              STEP 1
            </span>
            <div>
              <h3 className="text-[17px] font-bold uppercase tracking-[1px] text-white flex items-center gap-2">
                <Globe className="w-5 h-5 text-[#2DD4BF]" />
                Client & Account Selection
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Target an individual client account or run Multi-Client for consolidated warehouse picking & packing waves.
              </p>
            </div>
          </div>

          {isManagerOrAdmin && (
            <div className="flex items-center gap-2">
              {selectedClient && !isMultiClientSelected && (
                <button
                  type="button"
                  onClick={() => setClientEditModal(selectedClient)}
                  className="text-xs font-bold text-slate-300 hover:text-emerald-400 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 transition"
                >
                  <Pencil className="w-3 h-3" />
                  Edit {selectedClient.code}
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  setClientEditModal({
                    name: '',
                    code: '',
                    rounding_minutes: 15,
                    billable_default: true,
                    active: true,
                  })
                }
                className="text-xs font-bold text-emerald-400 hover:text-emerald-300 inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-950/50 border border-emerald-500/40 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Client
              </button>
            </div>
          )}
        </div>

        {/* Dedicated Multi-Client / Consolidated 3PL Option */}
        <div
          onClick={() => setSelectedClientId(MULTI_CLIENT_ID)}
          className={`p-3.5 sm:p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between gap-3 card-interactive ${
            isMultiClientSelected
              ? 'card-selected bg-teal-500/15 border-[#2DD4BF] text-white shadow-md shadow-teal-500/10'
              : 'bg-slate-950 border-slate-800 hover:border-teal-500/40 text-slate-300'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border transition ${
                isMultiClientSelected
                  ? 'bg-[#2DD4BF] text-slate-950 border-teal-300 shadow-md shadow-teal-500/20'
                  : 'bg-slate-900 border-slate-800 text-teal-400'
              }`}
            >
              <Globe className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded bg-teal-500/20 text-[#2DD4BF] text-[10px] font-mono font-black border border-teal-500/40">
                  MULTI-CLIENT 3PL
                </span>
                <span className="text-[11px] font-bold text-slate-400">
                  Consolidated Wave
                </span>
              </div>
              <div className="text-[15px] font-bold text-[#E8E8E8] leading-tight mt-0.5 truncate">
                Multi-Client / Consolidated Fulfilment
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                Universal pick, pack, inbound & dispatch for any client or combined wave.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {isMultiClientSelected ? (
              <span className="px-3 py-1.5 rounded-xl bg-[#2DD4BF] text-slate-950 text-xs font-black tracking-wider flex items-center gap-1.5 shadow">
                <Check className="w-3.5 h-3.5 stroke-[3]" />
                ACTIVE BATCH
              </span>
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs font-bold hover:text-white transition">
                Select
              </span>
            )}
          </div>
        </div>

        {/* Full-Width Client Directory: Search + Flat A-Z Filter Bar + 2/3-Column Client Grid */}
        <div className="bg-slate-950 rounded-2xl border border-slate-800/90 p-4 shadow-inner space-y-3.5">
          {/* Top Row: Search Box + Instant A-Z Letter Pills */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
            <div className="relative w-full lg:w-72 shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={clientSearchText}
                onChange={(e) => setClientSearchText(e.target.value)}
                placeholder={`Search ${alphabeticalClients.length} clients by name or code...`}
                className="w-full h-10 pl-9 pr-8 rounded-xl bg-slate-900 border border-slate-800 text-white font-semibold text-xs focus:outline-none focus:border-teal-500 transition"
              />
              {clientSearchText && (
                <button
                  type="button"
                  onClick={() => setClientSearchText('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Flat Instant A-Z Filter Pills (Zero Spinning / Zero Jumping) */}
            <div className="flex flex-wrap items-center gap-1">
              {REEL_LETTERS.map((letter) => {
                const count = clientCountsByLetter[letter] || 0;
                const isSelected = directoryLetter === letter;
                const isEmpty = letter !== 'ALL' && count === 0;

                if (letter === '#' && count === 0) return null;

                return (
                  <button
                    key={letter}
                    type="button"
                    disabled={isEmpty}
                    onClick={() => setDirectoryLetter(letter)}
                    className={`h-8 px-2 rounded-lg font-mono text-[11px] font-bold transition flex items-center justify-center ${
                      isSelected
                        ? 'bg-[#2DD4BF] text-slate-950 shadow-sm font-black'
                        : isEmpty
                        ? 'bg-slate-900/30 text-slate-600 border border-slate-800/40 opacity-40 cursor-not-allowed'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800'
                    }`}
                    title={
                      letter === 'ALL'
                        ? `Show all ${count} clients`
                        : `${count} client${count === 1 ? '' : 's'} starting with ${letter}`
                    }
                  >
                    {letter === 'ALL' ? `ALL (${count})` : letter}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Full-Width Multi-Column Client Cards Grid */}
          {filteredClients.length === 0 ? (
            <div className="py-8 flex flex-col items-center justify-center text-center p-4 rounded-xl bg-slate-900/40 border border-dashed border-slate-800">
              <Building2 className="w-8 h-8 text-slate-500 mb-1.5" />
              <p className="text-xs font-semibold text-slate-400">
                No clients match {directoryLetter === 'ALL' ? 'your search' : `'${directoryLetter}'`}
              </p>
              <button
                type="button"
                onClick={() => {
                  setDirectoryLetter('ALL');
                  setClientSearchText('');
                }}
                className="mt-2 text-xs font-bold text-[#2DD4BF] hover:underline"
              >
                Show All Clients ({alphabeticalClients.length})
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-[290px] overflow-y-auto pr-1">
              {filteredClients.map((c) => {
                const active = c.id === selectedClientId && !isMultiClientSelected;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedClientId(c.id)}
                    className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between gap-2.5 card-interactive ${
                      active
                        ? 'card-selected bg-teal-500/15 border-[#2DD4BF] text-white shadow-sm'
                        : 'bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="min-w-0 flex items-center gap-2.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-black shrink-0 ${
                          active
                            ? 'bg-[#2DD4BF] text-slate-950 shadow-sm'
                            : 'bg-[#10B981] text-slate-950'
                        }`}
                      >
                        {c.code}
                      </span>
                      <div className="min-w-0">
                        <div className="text-[14px] font-semibold text-[#E8E8E8] leading-tight truncate">
                          {c.name}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {c.rounding_minutes > 0
                            ? `${c.rounding_minutes}m billing rounding`
                            : 'Exact billing'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center shrink-0">
                      {active ? (
                        <span className="w-6 h-6 rounded-full bg-[#2DD4BF] text-slate-950 flex items-center justify-center shrink-0 shadow">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </span>
                      ) : (
                        <span className="w-6 h-6 rounded-full border border-slate-700 shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Active Target Summary Bar */}
        <div className="p-2.5 px-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Target Context:</span>
            {isMultiClientSelected ? (
              <span className="font-bold text-[#2DD4BF] flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5" />
                Multi-Client / Consolidated 3PL
              </span>
            ) : (
              <span className="font-bold text-[#2DD4BF] flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" />
                [{selectedClient?.code}] {selectedClient?.name}
              </span>
            )}
          </div>
          <span className="text-[11px] text-slate-400">
            {isMultiClientSelected
              ? 'Standard warehouse SOPs ready for mixed / universal batches'
              : `Bespoke SOW & standard tasks loaded for ${selectedClient?.code}`}
          </span>
        </div>
      </section>

      {/* CONDITIONAL BODY: TYPE SEARCH MODE vs DUAL-STATION TASK SELECTOR */}
      {startTab === 'type' ? (
        <section className="bg-[#0A121E] border-2 border-emerald-500/30 border-l-[6px] border-l-[#10B981] rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl">
          <div className="pb-3 border-b border-emerald-500/20">
            <h3 className="text-[16px] font-bold uppercase tracking-[1px] text-emerald-400 flex items-center gap-2">
              <Search className="w-4 h-4" />
              Quick Type Search
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Instantly search through all tasks by keyword, task code, or client name.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search tasks for ${selectedClient?.name || 'client'}...`}
                className="w-full h-12 pl-12 pr-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold text-sm sm:text-base focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Scope toggle so Type Search respects the selected client by default */}
            <div className="inline-flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setSearchAllClients(false)}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition ${
                  !searchAllClients
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {selectedClient?.code} Tasks Only
              </button>
              <button
                type="button"
                onClick={() => setSearchAllClients(true)}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition ${
                  searchAllClients
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All Clients
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {searchedTasks.map((task) => {
              const targetClient = task.is_standard
                ? selectedClient
                : clients.find((c) => c.id === task.client_id) ?? selectedClient;

              return (
                <div
                  key={task.id}
                  className={`p-4 rounded-2xl bg-slate-950 hover:bg-slate-900 border border-slate-800 border-l-[3px] ${
                    task.is_standard ? 'border-l-[#60A5FA]' : 'border-l-[#FB923C]'
                  } card-interactive flex items-center justify-between gap-3 transition shadow`}
                >
                  <button
                    type="button"
                    onClick={() => executeStartTask(task, 'typed', targetClient)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold text-slate-950 ${
                          task.is_standard
                            ? 'bg-[#60A5FA]'
                            : 'bg-[#FB923C]'
                        }`}
                      >
                        {task.is_standard ? 'STANDARD' : `${task.client_code} CUSTOM`}
                      </span>
                      <span className="text-[12px] font-normal text-[#888888]">
                        {task.category || 'Fulfilment'}
                      </span>
                    </div>
                    <div className="text-[15px] font-semibold text-[#E8E8E8] mt-1.5 leading-snug">
                      {task.name}
                    </div>
                    <div className="text-[11px] font-normal text-[#666666] mt-1">
                      {task.is_standard
                        ? `For ${selectedClient?.name}`
                        : task.client_name}
                      {task.unit_label ? ` · Tracks ${task.unit_label}` : ''}
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openConfirmStart(task, 'typed', targetClient)}
                      className="h-10 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[11px] font-bold flex items-center gap-1"
                      title="Add an Order / Wave / Batch Reference before starting"
                    >
                      <Hash className="w-3 h-3 text-emerald-400" />
                      Ref
                    </button>
                    <button
                      type="button"
                      onClick={() => executeStartTask(task, 'typed', targetClient)}
                      className="play-btn w-11 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow transition"
                      title="Start task immediately"
                    >
                      <Play className="w-5 h-5 fill-current" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <div className="space-y-6">
          {/* CONDUIT BAR 1: CONTEXT TO OPERATIONS FLOW CONNECTOR */}
          <div className="relative py-2 flex items-center justify-center">
            <div className="w-full border-t-2 border-slate-800/80" />
            <div className="absolute px-4 py-1.5 rounded-full bg-slate-900 border border-teal-500/40 shadow-xl flex items-center gap-2 text-xs font-mono font-bold text-slate-300">
              <span className="w-2 h-2 rounded-full bg-[#2DD4BF] animate-pulse" />
              <span className="text-slate-400 uppercase">Target Context:</span>
              <span className="text-[#2DD4BF]">
                {isMultiClientSelected
                  ? 'MULTI-CLIENT / CONSOLIDATED BATCH'
                  : `[${selectedClient?.code}] ${selectedClient?.name?.toUpperCase()}`}
              </span>
              <span className="text-slate-600">│</span>
              <span className="text-slate-400 text-[11px] font-sans">
                Universal SOPs or Bespoke SOW:
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-teal-400" />
            </div>
          </div>

          {/* Category Filter Pills Toolbar */}
          <div className="p-3.5 sm:p-4 rounded-2xl bg-purple-950/20 border border-purple-500/30 border-l-[4px] border-l-[#A78BFA] space-y-2.5 shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-purple-500/20">
              <div className="flex items-center gap-2">
                {isManagerOrAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewCategoryName('');
                      setShowAddCategoryModal(true);
                    }}
                    title="Add a Category"
                    className="w-6 h-6 rounded-lg bg-[#A78BFA]/20 hover:bg-[#A78BFA] text-[#A78BFA] hover:text-slate-950 border border-[#A78BFA]/50 flex items-center justify-center transition shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  </button>
                )}
                <span className="text-[13px] font-bold uppercase tracking-[1px] text-[#A78BFA] flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#A78BFA]" />
                  Category Filter
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {availableCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    selectedCategoryFilter === cat
                      ? 'bg-[#A78BFA] text-slate-950 shadow-md shadow-purple-500/20'
                      : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  {cat === 'ALL' ? 'All Categories' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* STATION 02A: UNIVERSAL STANDARD WAREHOUSE OPERATIONS */}
          <section className="bg-[#071322] border-2 border-sky-500/40 border-l-[6px] border-l-[#0284C7] rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-sky-500/25">
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-1 rounded-xl bg-[#0284C7] text-white flex items-center justify-center text-[12px] font-black tracking-wider shadow-sm">
                  STEP 2A
                </span>
                <div>
                  <h3 className="text-[17px] font-bold uppercase tracking-[1px] text-[#38BDF8] flex items-center gap-2">
                    <Warehouse className="w-5 h-5 text-[#38BDF8]" />
                    Universal Standard Warehouse Tasks
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Standard 3PL operational procedures · Universal across ALL clients & multi-client consolidation batches.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-sky-500/15 border border-sky-500/30 text-[11px] font-bold text-[#38BDF8]">
                  {standardTasks.length} {standardTasks.length === 1 ? 'task' : 'tasks'}
                </span>
                {isManagerOrAdmin && (
                  <button
                    type="button"
                    onClick={() =>
                      setTaskEditModal({
                        client_id: null,
                        is_standard: true,
                        category:
                          selectedCategoryFilter !== 'ALL'
                            ? selectedCategoryFilter
                            : 'Pick & Pack',
                        name: '',
                        code: 'STD-',
                        standard_minutes: null,
                        unit_label: 'orders',
                        billable: true,
                        rate: 25,
                        barcode: '',
                        sort_order: standardTasks.length + 1,
                        active: true,
                      })
                    }
                    title="Add standard warehouse task"
                    className="w-7 h-7 rounded-lg bg-sky-500/20 hover:bg-sky-500 text-sky-300 hover:text-slate-950 border border-sky-500/50 flex items-center justify-center transition shadow-sm"
                  >
                    <Plus className="w-4 h-4 stroke-[3]" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {standardTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-4 rounded-2xl bg-[#0B1A2C] hover:bg-[#0E223A] border border-sky-500/25 border-l-[4px] border-l-[#38BDF8] card-interactive flex items-center justify-between gap-3 transition shadow"
                >
                  <button
                    type="button"
                    onClick={() => executeStartTask(task, 'picked', selectedClient)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-[#38BDF8] text-slate-950 font-mono text-[10px] font-black">
                        STANDARD 3PL SOP
                      </span>
                      <span className="text-[12px] font-normal text-slate-400">
                        {task.category || 'Fulfilment'}
                      </span>
                    </div>
                    <div className="text-[15px] font-semibold text-[#E8E8E8] mt-1.5 leading-snug">
                      {task.name}
                    </div>
                    <div className="text-[11px] font-normal text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-slate-400">
                        Target: <strong className="text-sky-300 font-medium">{isMultiClientSelected ? 'Multi-Client Wave' : selectedClient?.name}</strong>
                      </span>
                      {(isManagerOrAdmin || settings.show_targets_to_operatives) && task.standard_minutes ? (
                        <span className="px-2 py-0.5 rounded bg-sky-950/80 border border-sky-500/40 text-[10px] font-mono font-bold text-sky-300">
                          ⚡ {Number(task.standard_minutes).toFixed(2)} min/{task.unit_label || 'unit'} std
                        </span>
                      ) : null}
                      {task.unit_label && (
                        <span className="px-2 py-0.5 rounded bg-teal-950/80 border border-teal-500/30 text-[11px] font-semibold text-[#2DD4BF]">
                          Tracks {task.unit_label}
                        </span>
                      )}
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleFavouriteTask(selectedClient?.id ?? null, task.id)}
                      className={`p-2.5 rounded-xl border transition ${
                        favouriteKeys.includes(`${selectedClient?.id || 'STD'}:${task.id}`)
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                          : 'bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-300 border-slate-800'
                      }`}
                      title="Star as Weekly Favourite"
                    >
                      <Star
                        className={`w-4 h-4 ${
                          favouriteKeys.includes(`${selectedClient?.id || 'STD'}:${task.id}`)
                            ? 'fill-current'
                            : ''
                        }`}
                      />
                    </button>
                    {isManagerOrAdmin && (
                      <button
                        type="button"
                        onClick={() => setTaskEditModal(task)}
                        className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition"
                        title="Edit standard task"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openConfirmStart(task, 'picked', selectedClient)}
                      className="h-10 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[11px] font-bold flex items-center gap-1 transition"
                      title="Start with an Order / Batch Reference"
                    >
                      <Hash className="w-3 h-3 text-[#38BDF8]" />
                      Ref
                    </button>
                    <button
                      type="button"
                      onClick={() => executeStartTask(task, 'picked', selectedClient)}
                      className="play-btn w-11 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-md shadow-emerald-500/15 transition"
                      title="Start standard warehouse task immediately"
                    >
                      <Play className="w-5 h-5 fill-current" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Add Task + Tile for Standard Warehouse Tasks (Supervisors & Admins Only) */}
              {isManagerOrAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setTaskEditModal({
                      client_id: null,
                      is_standard: true,
                      category:
                        selectedCategoryFilter !== 'ALL'
                          ? selectedCategoryFilter
                          : 'Pick & Pack',
                      name: '',
                      code: 'STD-',
                      standard_minutes: null,
                      unit_label: 'orders',
                      billable: true,
                      rate: 25,
                      barcode: '',
                      sort_order: standardTasks.length + 1,
                      active: true,
                    });
                  }}
                  className="p-4 rounded-2xl bg-[#091522]/80 hover:bg-sky-950/30 border-2 border-dashed border-sky-500/40 hover:border-sky-400 card-interactive flex items-center justify-between gap-3 transition text-left min-h-[88px]"
                >
                  <div>
                    <div className="inline-block px-2 py-0.5 rounded bg-sky-500/20 text-[#38BDF8] font-mono text-[10px] font-bold">
                      STANDARD
                    </div>
                    <div className="text-[15px] font-semibold text-[#E8E8E8] mt-1.5 leading-snug">
                      Add Standard Task +
                    </div>
                    <div className="text-[11px] font-normal text-slate-400 mt-0.5">
                      Add a warehouse-wide standard task
                    </div>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-[#0284C7] text-white flex items-center justify-center shrink-0 shadow">
                    <Plus className="w-5 h-5 stroke-[3]" />
                  </div>
                </button>
              )}
            </div>
          </section>

          {/* CONDUIT BAR 2: UNIVERSAL SOP TO BESPOKE SOW TRANSITION */}
          <div className="relative py-2 flex items-center justify-center">
            <div className="w-full border-t-2 border-dashed border-amber-500/35" />
            <div className="absolute px-4 py-1.5 rounded-full bg-slate-900 border-2 border-amber-500/50 shadow-xl flex items-center gap-2 text-xs font-mono font-bold text-amber-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>OR EXECUTE BESPOKE CLIENT SPECIFICATIONS (CUSTOM SOW)</span>
              <ChevronDown className="w-3.5 h-3.5 text-amber-400" />
            </div>
          </div>

          {/* STATION 02B: BESPOKE CLIENT SOW TASKS ("TASKS SECTION") */}
          <section className="bg-[#170F06] border-2 border-amber-500/45 border-l-[6px] border-l-[#F59E0B] rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-amber-500/25">
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-1 rounded-xl bg-[#F59E0B] text-slate-950 flex items-center justify-center text-[12px] font-black tracking-wider shadow-sm">
                  STEP 2B
                </span>
                <div>
                  <h3 className="text-[17px] font-bold uppercase tracking-[1px] text-[#FBBF24] flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#FBBF24]" />
                    Bespoke Client SOW Tasks {!isMultiClientSelected && selectedClient ? `— ${selectedClient.name}` : ''}
                  </h3>
                  <p className="text-[11px] text-amber-200/80 mt-0.5">
                    Client-specific contracted work: custom packaging recipes, bespoke kitting, and contracted billing rates.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-[11px] font-bold text-[#FBBF24]">
                  {customClientTasks.length} {customClientTasks.length === 1 ? 'task' : 'tasks'}
                </span>
                {isManagerOrAdmin && !isMultiClientSelected && (
                  <button
                    type="button"
                    onClick={() =>
                      setTaskEditModal({
                        client_id: selectedClientId,
                        is_standard: false,
                        category:
                          selectedCategoryFilter !== 'ALL'
                            ? selectedCategoryFilter
                            : 'Pick & Pack',
                        name: '',
                        code: `${selectedClient?.code || 'TSK'}-`,
                        standard_minutes: null,
                        unit_label: 'orders',
                        billable: true,
                        rate: 25,
                        barcode: '',
                        sort_order: customClientTasks.length + 1,
                        active: true,
                      })
                    }
                    title={`Add custom task for ${selectedClient?.name}`}
                    className="w-7 h-7 rounded-lg bg-[#FB923C]/20 hover:bg-[#FB923C] text-[#FB923C] hover:text-slate-950 border border-[#FB923C]/50 flex items-center justify-center transition shadow-sm"
                  >
                    <Plus className="w-4 h-4 stroke-[3]" />
                  </button>
                )}
              </div>
            </div>

            {/* Multi-Client Selection State Banner for Custom Tasks */}
            {isMultiClientSelected ? (
              <div className="p-5 sm:p-6 rounded-2xl bg-amber-950/30 border-2 border-dashed border-amber-500/40 flex flex-col sm:flex-row items-center justify-between gap-4 text-left">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0">
                    <Boxes className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-[15px] font-bold text-amber-200">
                      Multi-Client / Consolidated Batch Active
                    </h4>
                    <p className="text-xs text-amber-200/80 max-w-xl mt-1 leading-relaxed">
                      Universal standard warehouse operations in <strong className="text-white">Step 2A</strong> above are active and ready for any consolidated wave. Bespoke SOW tasks are tailored to individual clients. To run specialized kitting, custom relabelling, or client-specific assembly, pick a client in <strong className="text-white">Step 1</strong>.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const firstAlphabetical = alphabeticalClients[0];
                    if (firstAlphabetical) setSelectedClientId(firstAlphabetical.id);
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shrink-0 transition shadow"
                >
                  Select a Client
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {customClientTasks.map((task) => (
                  <div
                    key={task.id}
                    className="p-4 rounded-2xl bg-[#231508] hover:bg-[#2C1A0A] border border-amber-500/35 border-l-[4px] border-l-[#F59E0B] card-interactive flex items-center justify-between gap-3 transition shadow"
                  >
                    <button
                      type="button"
                      onClick={() => executeStartTask(task, 'picked', selectedClient)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-[#F59E0B] text-slate-950 font-mono text-[10px] font-black">
                          {selectedClient?.code} BESPOKE SOW
                        </span>
                        <span className="text-[12px] font-normal text-amber-200/80">
                          {task.category || 'Fulfilment'}
                        </span>
                      </div>
                      <div className="text-[15px] font-semibold text-[#E8E8E8] mt-1.5 leading-snug">
                        {task.name}
                      </div>
                      <div className="text-[11px] font-normal text-slate-400 mt-1 flex flex-wrap items-center gap-1.5">
                        {task.rate ? (
                          <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-500/30 text-[10px] font-mono font-bold text-amber-300">
                            £{Number(task.rate).toFixed(2)}/hr rate
                          </span>
                        ) : null}
                        {task.unit_label && (
                          <div className="inline-block px-2 py-0.5 rounded bg-teal-950/80 border border-teal-500/30 text-[11px] font-semibold text-[#2DD4BF]">
                            Tracks {task.unit_label}
                          </div>
                        )}
                      </div>
                    </button>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {isManagerOrAdmin && (
                        <button
                          type="button"
                          onClick={() => setTaskEditModal(task)}
                          className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition"
                          title="Edit task"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openConfirmStart(task, 'picked', selectedClient)}
                        className="h-10 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[11px] font-bold flex items-center gap-1 transition"
                        title="Start with an Order / Batch Reference"
                      >
                        <Hash className="w-3 h-3 text-[#FB923C]" />
                        Ref
                      </button>
                      <button
                        type="button"
                        onClick={() => executeStartTask(task, 'picked', selectedClient)}
                        className="play-btn w-11 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shadow-md shadow-emerald-500/15 transition"
                        title="Start custom task immediately"
                      >
                        <Play className="w-5 h-5 fill-current" />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Add Task + Tile for Custom Tasks (Supervisors & Admins Only) */}
                {isManagerOrAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setTaskEditModal({
                        client_id: selectedClientId,
                        is_standard: false,
                        category:
                          selectedCategoryFilter !== 'ALL'
                            ? selectedCategoryFilter
                            : 'Pick & Pack',
                        name: '',
                        code: `${selectedClient?.code || 'TSK'}-`,
                        standard_minutes: null,
                        unit_label: 'orders',
                        billable: true,
                        rate: 25,
                        barcode: '',
                        sort_order: customClientTasks.length + 1,
                        active: true,
                      });
                    }}
                    className="p-4 rounded-2xl bg-[#1C1207]/80 hover:bg-amber-950/30 border-2 border-dashed border-amber-500/40 hover:border-amber-400 card-interactive flex items-center justify-between gap-3 transition text-left min-h-[88px]"
                  >
                    <div>
                      <div className="inline-block px-2 py-0.5 rounded bg-[#FB923C]/20 text-[#FB923C] font-mono text-[10px] font-bold">
                        {selectedClient?.code} CUSTOM
                      </div>
                      <div className="text-[15px] font-semibold text-[#E8E8E8] mt-1.5 leading-snug">
                        Add Custom Task +
                      </div>
                      <div className="text-[11px] font-normal text-slate-400 mt-0.5">
                        Add a bespoke task for {selectedClient?.name}
                      </div>
                    </div>
                    <div className="w-11 h-11 rounded-xl bg-[#F59E0B] text-slate-950 flex items-center justify-center shrink-0 shadow">
                      <Plus className="w-5 h-5 stroke-[3]" />
                    </div>
                  </button>
                )}
              </div>
            )}
          </section>

          {/* ITEM #9 — STEP 2C: BESPOKE PROJECTS (COLLAPSIBLE COLOUR-CODED PROJECT FOLDERS) */}
          <section className="bg-[#120A1E] border-2 border-violet-500/45 border-l-[6px] border-l-violet-400 rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-violet-500/25">
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-1 rounded-xl bg-violet-400 text-slate-950 flex items-center justify-center text-[12px] font-black tracking-wider shadow-sm">
                  STEP 2C
                </span>
                <div>
                  <h3 className="text-[17px] font-bold uppercase tracking-[1px] text-violet-300 flex items-center gap-2">
                    <FolderOpen className="w-5 h-5 text-violet-300" />
                    Bespoke Projects (Collapsible Multi-Part Folders)
                  </h3>
                  <p className="text-[11px] text-violet-200/80 mt-0.5">
                    Colour-coded project folders containing multi-stage sub-tasks (e.g. FSDU Building, Stocking, Cardboard Breakdown).
                  </p>
                </div>
              </div>

              {isManagerOrAdmin && !isMultiClientSelected && (
                <button
                  type="button"
                  onClick={() =>
                    setTaskEditModal({
                      client_id: selectedClientId,
                      is_standard: false,
                      category: 'Kitting & Value Add',
                      project_name: 'FSDU Retail Display Build Project',
                      project_color: 'amber',
                      name: '',
                      code: `${selectedClient?.code || 'PRJ'}-`,
                      standard_minutes: null,
                      unit_label: 'FSDUs',
                      billable: true,
                      rate: 28,
                      barcode: '',
                      sort_order: customClientTasks.length + 1,
                      active: true,
                    })
                  }
                  className="px-3 py-1.5 rounded-xl bg-violet-500/20 hover:bg-violet-400 text-violet-200 hover:text-slate-950 border border-violet-400/50 text-xs font-black flex items-center gap-1.5 transition"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  Add Project Task
                </button>
              )}
            </div>

            {bespokeProjectsList.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-violet-500/25 text-xs text-slate-400 flex items-center justify-between gap-3">
                <span>
                  No multi-part Bespoke Projects configured for{' '}
                  <strong className="text-white">{selectedClient?.name}</strong> yet.
                  (Try selecting <strong>CCELL Direct</strong> or <strong>Payload Drinks</strong> to view the sample FSDU Build Project folder.)
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                {bespokeProjectsList.map((proj) => {
                  const folderKey = `${proj.clientId || 'STD'}::${proj.projectName}`;
                  const isOpen = openProjectFolders[folderKey] ?? true;
                  return (
                    <div
                      key={folderKey}
                      className="rounded-2xl bg-slate-950/90 border-2 border-violet-500/40 overflow-hidden shadow-lg"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setOpenProjectFolders((prev) => ({
                            ...prev,
                            [folderKey]: !isOpen,
                          }))
                        }
                        className="w-full px-4 py-3.5 bg-gradient-to-r from-violet-950/70 via-slate-900 to-slate-900 flex items-center justify-between gap-3 text-left hover:bg-violet-950/90 transition"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-violet-500/25 border border-violet-400/50 text-violet-200 flex items-center justify-center shrink-0">
                            <FolderOpen className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2 py-0.5 rounded bg-violet-400 text-slate-950 font-mono text-[10px] font-black uppercase">
                                PROJECT FOLDER
                              </span>
                              <span className="text-xs font-bold text-violet-300">
                                {proj.clientName}
                              </span>
                              <span className="text-[11px] font-mono text-slate-400">
                                ({proj.tasks.length} sub-tasks)
                              </span>
                            </div>
                            <div className="text-base font-black text-white truncate mt-0.5">
                              {proj.projectName}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-bold text-violet-300">
                            {isOpen ? 'Collapse' : 'Expand Sub-Tasks'}
                          </span>
                          <ChevronDown
                            className={`w-5 h-5 text-violet-300 transition-transform ${
                              isOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </div>
                      </button>

                      {isOpen && (
                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/60 border-t border-violet-500/25">
                          {proj.tasks.map((task, idx) => {
                            const targetClient =
                              effectiveClients.find((c) => c.id === task.client_id) ||
                              selectedClient;
                            return (
                              <div
                                key={task.id}
                                className="p-3.5 rounded-xl bg-slate-900 hover:bg-slate-800/90 border border-violet-500/30 border-l-[4px] border-l-violet-400 flex items-center justify-between gap-3 transition"
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    executeStartTask(task, 'picked', targetClient)
                                  }
                                  className="flex-1 text-left min-w-0"
                                >
                                  <div className="flex items-center gap-1.5">
                                    <span className="px-1.5 py-0.5 rounded bg-violet-500/25 text-violet-200 font-mono text-[10px] font-black">
                                      STAGE {idx + 1}
                                    </span>
                                    <span className="text-[11px] font-mono text-slate-400">
                                      {task.code}
                                    </span>
                                  </div>
                                  <div className="text-sm font-bold text-white mt-1 leading-snug">
                                    {task.name}
                                  </div>
                                  {task.unit_label && (
                                    <div className="text-[11px] text-teal-300 font-semibold mt-1">
                                      Tracks {task.unit_label}
                                    </div>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    executeStartTask(task, 'picked', targetClient)
                                  }
                                  className="play-btn w-10 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shrink-0 shadow"
                                  title="Start project sub-task"
                                >
                                  <Play className="w-4 h-4 fill-current" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ITEM #10 — STEP 2D: CLOUD9 INTERNAL / HOUSEKEEPING (NON-CLIENT OVERHEADS) */}
          <section className="bg-[#0E131A] border-2 border-slate-700/80 border-l-[6px] border-l-rose-400 rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-1 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 flex items-center justify-center text-[12px] font-black tracking-wider">
                  STEP 2D
                </span>
                <div>
                  <h3 className="text-[17px] font-bold uppercase tracking-[1px] text-slate-200 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-rose-400" />
                    Cloud9 Internal / Housekeeping (Non-Client Overheads)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Sweeping, warehouse cleaning, and internal jobs — recorded as Cloud9 internal overhead and never billed to a client.
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-[11px] font-bold text-rose-300">
                Internal Overhead · Non-Billable
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {housekeepingTasks.map((task) => {
                const targetClient =
                  effectiveClients.find((c) => c.id === task.client_id) ||
                  MULTI_CLIENT_DEFAULT;
                return (
                  <div
                    key={`hk-${task.id}`}
                    className="p-4 rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-800 border-l-[4px] border-l-rose-400 flex items-center justify-between gap-3 transition shadow"
                  >
                    <button
                      type="button"
                      onClick={() => executeStartTask(task, 'picked', targetClient)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono text-[10px] font-black">
                          CLOUD9 INTERNAL
                        </span>
                        <span className="text-xs text-slate-400">
                          {task.category || 'Housekeeping'}
                        </span>
                      </div>
                      <div className="text-[15px] font-semibold text-white mt-1.5 leading-snug">
                        {task.name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Non-billable internal warehouse activity
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => executeStartTask(task, 'picked', targetClient)}
                      className="play-btn w-11 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center shrink-0 shadow"
                    >
                      <Play className="w-5 h-5 fill-current" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      <div className="section-divider" />

      {/* TODAY'S ENTRIES (PERSONAL TO LOGGED-IN OPERATIVE ONLY) */}
      <section className="v4-entries-receded border border-slate-800/80 rounded-3xl p-5 sm:p-6 space-y-4 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[16px] font-bold uppercase tracking-[1px] text-[#888888]">
              Today&apos;s Entries — {user.display_name}
            </h2>
            <p className="text-[12px] font-normal text-[#888888]">
              Personal log (only your own entries are shown here)
            </p>
          </div>
          <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-slate-950 border border-slate-800 text-[#888888]">
            {todayEntries.length} {todayEntries.length === 1 ? 'entry' : 'entries'} today
          </span>
        </div>

        {todayEntries.length === 0 ? (
          <p className="text-[13px] text-[#999999] py-4 text-center">
            No entries logged by {user.display_name} yet today.
          </p>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {todayEntries.map((entry) => {
              const isRunning = !entry.ended_at;
              const mins = entry.ended_at
                ? getDurationMinutes(entry.started_at, entry.ended_at)
                : elapsedSeconds / 60;
              const hrs = formatHours(minutesToHours(mins));
              const readableDur = formatReadableDuration(mins);
              const stdPct =
                entry.ended_at && mins >= 1
                  ? calculateActualVsStandardPercent({
                      standardMinutes: entry.standard_minutes,
                      unitLabel: entry.unit_label,
                      actualMinutes: mins,
                      units: entry.units,
                    })
                  : null;

              return (
                <div
                  key={entry.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#10B981] text-slate-950 font-mono text-[10px] font-bold">
                        {entry.client_code}
                      </span>
                      <span className="text-[13px] font-medium text-[#999999]">
                        {entry.task_name}
                      </span>
                      {entry.order_ref && (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-950 text-[#888888] border border-slate-800">
                          {entry.order_ref}
                        </span>
                      )}
                      {entry.auto_stopped && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          Auto-stopped
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-normal text-[#666666] mt-1">
                      {formatLondonTime(entry.started_at)} →{' '}
                      {isRunning ? (
                        <span className="text-[#22D3EE] font-bold">Running</span>
                      ) : (
                        formatLondonTime(entry.ended_at)
                      )}
                      {entry.units !== null && entry.units !== undefined && (
                        <span className="ml-3 text-[#999999] font-medium">
                          · {entry.units} {entry.unit_label || 'units'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    {stdPct !== null && (isManagerOrAdmin || settings.show_targets_to_operatives) && (
                      <span
                        className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${
                          stdPct >= 100
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-amber-500/20 text-amber-300'
                        }`}
                      >
                        {stdPct}% vs std
                      </span>
                    )}
                    <div className="text-right">
                      <div className="font-mono text-base font-bold text-white">
                        {readableDur}
                      </div>
                      <div className="font-mono text-[11px] text-[#666666]">
                        {hrs} hrs
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* CONFIRM CLOCK-OUT / SHIFT CLOSE MODAL */}
      {showClockOutConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border-2 border-rose-500/80 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0">
                  <LogOut className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-rose-400">
                    Confirm Shift Close
                  </div>
                  <h3 className="text-xl font-black text-white mt-0.5">
                    End Shift &amp; Clock Out?
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowClockOutConfirmModal(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-sm text-slate-300 space-y-1.5">
              <p>
                Are you sure you want to clock out and close your shift for{' '}
                <strong className="text-white">{user.display_name}</strong>?
              </p>
              {runningEntry && (
                <p className="text-xs font-semibold text-amber-300">
                  Your currently running task ({runningEntry.client_code} ·{' '}
                  {runningEntry.task_name}) will also be stopped.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowClockOutConfirmModal(false)}
                className="btn-glove rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center justify-center"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setShowClockOutConfirmModal(false);
                  handlePressStop(true);
                }}
                className="btn-glove rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black shadow-lg flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Yes, Clock Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM-AND-START MODAL (Used for Barcode Scan or attaching Order/Batch Ref) */}
      {confirmStartModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmAndStart}
            className="w-full max-w-md bg-slate-900 border-2 border-emerald-500 rounded-3xl p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-black uppercase tracking-wider">
                  {confirmStartModal.targetClient.code} · Ready to Start
                </div>
                <h3 className="text-2xl font-black text-white mt-2 leading-snug">
                  {confirmStartModal.task.name}
                </h3>
                <p className="text-sm font-bold text-slate-300 mt-0.5">
                  Client: {confirmStartModal.targetClient.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmStartModal(null)}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {runningEntry && (
              <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs font-bold text-amber-200">
                Starting this task will automatically stop your current task (
                {runningEntry.client_code} · {runningEntry.task_name}) at the same instant.
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Order / Wave / Batch Reference (Optional)
              </label>
              <input
                type="text"
                autoFocus
                value={orderRefInput}
                onChange={(e) => setOrderRefInput(e.target.value)}
                placeholder="e.g. WAVE-410 or ASN-901"
                className="w-full h-14 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmStartModal(null)}
                className="btn-glove-lg rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center justify-center"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="btn-glove-lg rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-lg font-black flex items-center justify-center gap-2 shadow-lg"
              >
                <Play className="w-5 h-5 fill-current" />
                Start Now
              </button>
            </div>
          </form>
        </div>
      )}

      {/* "TASK NOT LISTED" MODAL FOR OPERATIVES */}
      {showUnlistedModal && selectedClient && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleStartUnlistedTask}
            className="w-full max-w-md bg-slate-900 border-2 border-amber-500 rounded-3xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-amber-400">
                  Task Not Listed · {selectedClient.code}
                </div>
                <h3 className="text-xl font-black text-white mt-0.5">
                  Start Custom Task for {selectedClient.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUnlistedModal(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Task Title / Description *
              </label>
              <input
                type="text"
                required
                autoFocus
                value={unlistedTitle}
                onChange={(e) => setUnlistedTitle(e.target.value)}
                placeholder="e.g. Promotional flyer insertion"
                className="w-full h-14 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Category
                </label>
                <select
                  value={unlistedCategory}
                  onChange={(e) => setUnlistedCategory(e.target.value)}
                  className="w-full h-12 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold"
                >
                  {DEFAULT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Unit Label (Optional)
                </label>
                <input
                  type="text"
                  value={unlistedUnitLabel}
                  onChange={(e) => setUnlistedUnitLabel(e.target.value)}
                  placeholder="units, boxes, pallets..."
                  className="w-full h-12 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Order / Batch Ref (Optional)
              </label>
              <input
                type="text"
                value={unlistedOrderRef}
                onChange={(e) => setUnlistedOrderRef(e.target.value)}
                placeholder="e.g. PO-991"
                className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Billing Status
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setUnlistedBillingStatus('automatically_billed')}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 transition ${
                    unlistedBillingStatus === 'automatically_billed'
                      ? 'bg-emerald-500/30 text-emerald-300 border-emerald-400 shadow-md shadow-emerald-500/20'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  Auto-Billed
                </button>
                <button
                  type="button"
                  onClick={() => setUnlistedBillingStatus('needs_billed')}
                  className={`px-3 py-2.5 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 transition ${
                    unlistedBillingStatus === 'needs_billed'
                      ? 'bg-sky-500/30 text-sky-300 border-sky-400 shadow-md shadow-sky-500/20'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
                  Needs Billed
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const decreed = isTaskDecreedUnbilled({
                      category: unlistedCategory,
                      taskName: unlistedTitle,
                    });
                    if (decreed) {
                      setUnlistedBillingStatus('our_cost');
                      if (!unlistedUnbilledReason) {
                        setUnlistedUnbilledReason(
                          `Routine warehouse ${unlistedCategory || 'maintenance'} (standard decree)`
                        );
                      }
                    } else {
                      setUnbillJustification(unlistedUnbilledReason);
                      setUnbillAuthModal({
                        taskTitle: unlistedTitle.trim() || 'This Unlisted Task',
                        onConfirm: (justification: string) => {
                          setUnlistedBillingStatus('our_cost');
                          setUnlistedUnbilledReason(justification);
                          setUnbillAuthModal(null);
                        },
                      });
                    }
                  }}
                  className={`px-3 py-2.5 rounded-xl border-2 text-xs font-black flex items-center justify-center gap-1.5 transition ${
                    unlistedBillingStatus === 'our_cost'
                      ? 'bg-rose-500/30 text-rose-300 border-rose-500 shadow-md shadow-rose-500/20'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-rose-400'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                  Our Cost
                </button>
              </div>
              {unlistedBillingStatus === 'our_cost' && (
                <div className="mt-2.5 p-3 rounded-xl bg-rose-950/40 border border-rose-500/50 space-y-1">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-rose-300">
                    Why is this unbilled? (Mandatory Justification for K & Finance)*
                  </label>
                  <input
                    type="text"
                    required
                    value={unlistedUnbilledReason}
                    onChange={(e) => setUnlistedUnbilledReason(e.target.value)}
                    placeholder="e.g. Defect rework, facility maintenance, training run..."
                    className="w-full h-10 px-3 rounded-lg bg-slate-950 border border-rose-500/60 text-white text-xs font-semibold focus:outline-none focus:border-rose-400"
                  />
                  {!unlistedUnbilledReason.trim() && (
                    <p className="text-[10px] text-rose-400 font-bold">
                      * Required: Explain why Cloud9 is absorbing this labor expense.
                    </p>
                  )}
                </div>
              )}
              <div className="mt-1 text-[11px] text-slate-400">
                {BILLING_STATUS_CONFIG[unlistedBillingStatus].description}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowUnlistedModal(false)}
                className="btn-glove-lg rounded-2xl bg-slate-800 text-slate-300 font-bold flex items-center justify-center"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !unlistedTitle.trim()}
                className="btn-glove-lg rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5 fill-current" />
                Start Task
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MANAGER / ADMIN QUICK CLIENT ADD/EDIT MODAL */}
      {clientEditModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveClientModal}
            className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-white">
                {clientEditModal.id ? 'Edit Client' : 'Add New Client'}
              </h3>
              <button
                type="button"
                onClick={() => setClientEditModal(null)}
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
                value={clientEditModal.name || ''}
                onChange={(e) =>
                  setClientEditModal({ ...clientEditModal, name: e.target.value })
                }
                placeholder="e.g. Yorkshire Tea Co"
                className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Short Code
                </label>
                <input
                  type="text"
                  required
                  value={clientEditModal.code || ''}
                  onChange={(e) =>
                    setClientEditModal({
                      ...clientEditModal,
                      code: e.target.value.toUpperCase(),
                    })
                  }
                  placeholder="YTC"
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Billing Rounding (Round UP)
                </label>
                <select
                  value={clientEditModal.rounding_minutes ?? 0}
                  onChange={(e) =>
                    setClientEditModal({
                      ...clientEditModal,
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

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setClientEditModal(null)}
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

      {/* ADD CATEGORY MODAL */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const clean = newCategoryName.trim();
              if (!clean) return;
              if (!customCategories.includes(clean)) {
                setCustomCategories((prev) => [...prev, clean]);
              }
              setSelectedCategoryFilter(clean);
              setShowAddCategoryModal(false);
              setFeedback(`Category "${clean}" added and selected.`);
            }}
            className="w-full max-w-md bg-slate-900 border-2 border-[#A78BFA]/70 rounded-3xl p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#A78BFA]/20 text-[#A78BFA] flex items-center justify-center">
                  <Layers className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-black text-white">Add Task Category</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">
                Category Name
              </label>
              <input
                type="text"
                required
                autoFocus
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Palletising & Shrink Wrap"
                className="w-full h-12 px-4 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold focus:outline-none focus:border-[#A78BFA]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                className="btn-glove px-4 rounded-xl bg-slate-800 text-slate-300 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newCategoryName.trim()}
                className="btn-glove px-5 rounded-xl bg-[#A78BFA] hover:bg-purple-300 text-slate-950 font-black"
              >
                Add Category
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MANAGER / ADMIN QUICK TASK ADD/EDIT MODAL */}
      {taskEditModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveTaskModal}
            className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-3xl p-6 space-y-4 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-white">
                {taskEditModal.id ? 'Edit Catalogue Task' : 'Add Catalogue Task'}
              </h3>
              <button
                type="button"
                onClick={() => setTaskEditModal(null)}
                className="p-2 rounded-lg bg-slate-800 text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scope Toggle: Standard (All Clients) vs Custom Client Task */}
            <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-950 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() =>
                  setTaskEditModal({
                    ...taskEditModal,
                    is_standard: false,
                    client_id: taskEditModal.client_id || selectedClientId,
                  })
                }
                className={`py-2.5 px-3 rounded-lg text-xs font-black ${
                  !taskEditModal.is_standard
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Client-Specific Task
              </button>
              <button
                type="button"
                onClick={() =>
                  setTaskEditModal({
                    ...taskEditModal,
                    is_standard: true,
                    client_id: null,
                  })
                }
                className={`py-2.5 px-3 rounded-lg text-xs font-black ${
                  taskEditModal.is_standard
                    ? 'bg-sky-400 text-slate-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Standard Task (All Clients)
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {!taskEditModal.is_standard && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                    Client
                  </label>
                  <select
                    value={taskEditModal.client_id || selectedClientId}
                    onChange={(e) =>
                      setTaskEditModal({ ...taskEditModal, client_id: e.target.value })
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
                      taskEditModal.category &&
                      allCategoryChoices.includes(taskEditModal.category)
                        ? taskEditModal.category
                        : allCategoryChoices[0]
                    }
                    onChange={(e) => {
                      if (e.target.value === '__custom__') {
                        setIsCustomCategoryMode(true);
                        setTaskEditModal({ ...taskEditModal, category: '' });
                      } else {
                        setTaskEditModal({ ...taskEditModal, category: e.target.value });
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
                      value={taskEditModal.category || ''}
                      onChange={(e) =>
                        setTaskEditModal({ ...taskEditModal, category: e.target.value })
                      }
                      placeholder="Type new category..."
                      className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-emerald-500 text-white font-bold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomCategoryMode(false);
                        setTaskEditModal({
                          ...taskEditModal,
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
                  value={taskEditModal.code || ''}
                  onChange={(e) =>
                    setTaskEditModal({
                      ...taskEditModal,
                      code: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono font-bold"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Task Title
                </label>
                <input
                  type="text"
                  required
                  value={taskEditModal.name || ''}
                  onChange={(e) =>
                    setTaskEditModal({ ...taskEditModal, name: e.target.value })
                  }
                  placeholder="e.g. FSDU Display Assembly"
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
                />
              </div>

              {!taskEditModal.is_standard && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase text-amber-300 mb-1">
                    Bespoke Project Folder (Optional — Groups sub-tasks under 1 folder)
                  </label>
                  <input
                    type="text"
                    value={taskEditModal.project_name || ''}
                    onChange={(e) =>
                      setTaskEditModal({
                        ...taskEditModal,
                        project_name: e.target.value || null,
                      })
                    }
                    placeholder="e.g. FSDU Retail Display Build Project"
                    className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-amber-500/40 text-white font-bold"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Unit Type / Label *
                </label>
                <input
                  type="text"
                  required
                  value={taskEditModal.unit_label || ''}
                  onChange={(e) =>
                    setTaskEditModal({ ...taskEditModal, unit_label: e.target.value })
                  }
                  placeholder="orders, units, cartons, pallets..."
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {['orders', 'units', 'cartons', 'pallets', 'FSDUs', 'cycles'].map((u) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() =>
                        setTaskEditModal({ ...taskEditModal, unit_label: u })
                      }
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition ${
                        taskEditModal.unit_label === u
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                          : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold uppercase text-slate-400">
                    Target (Mins / Unit)
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={targetNotApplicable}
                      onChange={(e) => {
                        setTargetNotApplicable(e.target.checked);
                        if (e.target.checked) {
                          setTaskEditModal({
                            ...taskEditModal,
                            standard_minutes: null,
                          });
                        }
                      }}
                      className="w-3.5 h-3.5 rounded accent-amber-400"
                    />
                    Target N/A
                  </label>
                </div>
                <input
                  type="number"
                  step="0.01"
                  disabled={targetNotApplicable}
                  required={!targetNotApplicable}
                  value={targetNotApplicable ? '' : (taskEditModal.standard_minutes ?? '')}
                  onChange={(e) =>
                    setTaskEditModal({
                      ...taskEditModal,
                      standard_minutes:
                        e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  placeholder={targetNotApplicable ? 'No target (N/A)' : 'e.g. 0.50'}
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold disabled:opacity-50"
                />
                {!targetNotApplicable &&
                  taskEditModal.standard_minutes &&
                  Number(taskEditModal.standard_minutes) > 0 && (
                    <div className="text-[10px] font-semibold text-emerald-400 mt-1">
                      ≈ {(60 / Number(taskEditModal.standard_minutes)).toFixed(0)}{' '}
                      {taskEditModal.unit_label || 'units'}/hr ({(Number(taskEditModal.standard_minutes) * 60).toFixed(0)}s per{' '}
                      {taskEditModal.unit_label || 'unit'})
                    </div>
                  )}
              </div>

              <div className="sm:col-span-2">
                <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
                  <input
                    type="checkbox"
                    checked={taskEditModal.require_units_on_close ?? true}
                    onChange={(e) =>
                      setTaskEditModal({
                        ...taskEditModal,
                        require_units_on_close: e.target.checked,
                      })
                    }
                    className="w-4 h-4 mt-0.5 rounded accent-emerald-500 shrink-0"
                  />
                  <div>
                    <div className="text-xs font-black uppercase tracking-wider text-white">
                      Prompt for Production Quantity on Stop
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Uncheck for tasks like <strong>Standard Order Pick</strong> or <strong>Standard Order Pack</strong> where order counts are tracked externally in Helm (stops immediately in 1 tap).
                    </div>
                  </div>
                </label>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">
                  Billing Status
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setTaskEditModal({
                        ...taskEditModal,
                        billing_status: 'automatically_billed',
                        billable: true,
                      })
                    }
                    className={`px-3 py-2.5 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 transition ${
                      (taskEditModal.billing_status ??
                        (taskEditModal.billable === false ? 'our_cost' : 'needs_billed')) ===
                      'automatically_billed'
                        ? 'bg-emerald-500/30 text-emerald-300 border-emerald-400 shadow-md shadow-emerald-500/20'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    Auto-Billed
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setTaskEditModal({
                        ...taskEditModal,
                        billing_status: 'needs_billed',
                        billable: true,
                      })
                    }
                    className={`px-3 py-2.5 rounded-xl border text-xs font-black flex items-center justify-center gap-1.5 transition ${
                      (taskEditModal.billing_status ??
                        (taskEditModal.billable === false ? 'our_cost' : 'needs_billed')) ===
                      'needs_billed'
                        ? 'bg-sky-500/30 text-sky-300 border-sky-400 shadow-md shadow-sky-500/20'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-sky-400 shrink-0" />
                    Needs Billed
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const decreed = isTaskDecreedUnbilled({
                        category: taskEditModal.category,
                        taskCode: taskEditModal.code,
                        taskName: taskEditModal.name,
                      });
                      if (decreed) {
                        setTaskEditModal({
                          ...taskEditModal,
                          billing_status: 'our_cost',
                          billable: false,
                        });
                      } else {
                        setUnbillJustification('');
                        setUnbillAuthModal({
                          taskTitle:
                            taskEditModal.name ||
                            taskEditModal.code ||
                            'this task',
                          onConfirm: (justification: string) => {
                            setTaskEditModal({
                              ...taskEditModal,
                              billing_status: 'our_cost',
                              billable: false,
                            });
                            setUnbillAuthModal(null);
                          },
                        });
                      }
                    }}
                    className={`px-3 py-2.5 rounded-xl border-2 text-xs font-black flex items-center justify-center gap-1.5 transition ${
                      (taskEditModal.billing_status ??
                        (taskEditModal.billable === false ? 'our_cost' : 'needs_billed')) ===
                      'our_cost'
                        ? 'bg-rose-500/30 text-rose-300 border-rose-500 shadow-md shadow-rose-500/20'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-rose-400'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                    Our Cost
                  </button>
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {
                    BILLING_STATUS_CONFIG[
                      taskEditModal.billing_status ??
                        (taskEditModal.billable === false ? 'our_cost' : 'needs_billed')
                    ].description
                  }
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Billing Rounding Override (For Billing Only)
                </label>
                <select
                  value={
                    taskEditModal.rounding_minutes === null ||
                    taskEditModal.rounding_minutes === undefined
                      ? 'inherit'
                      : String(taskEditModal.rounding_minutes)
                  }
                  onChange={(e) =>
                    setTaskEditModal({
                      ...taskEditModal,
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
                  Minimum Charge Floor (15m Min Rule)
                </label>
                <select
                  value={String(taskEditModal.min_charge_minutes ?? 0)}
                  onChange={(e) =>
                    setTaskEditModal({
                      ...taskEditModal,
                      min_charge_minutes: Number(e.target.value),
                    })
                  }
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm font-bold"
                >
                  <option value="0">No Minimum Floor (Use Rounding Only)</option>
                  <option value="15">15 Mins Minimum Charge (Then 5m increments)</option>
                  <option value="30">30 Mins Minimum Charge</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTaskEditModal(null)}
                className="btn-glove px-4 rounded-xl bg-slate-800 text-slate-300 font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="btn-glove px-5 rounded-xl bg-emerald-500 text-slate-950 font-black"
              >
                Save Task
              </button>
            </div>
          </form>
        </div>
      )}

      {/* FULL-SCREEN IDLE PROMPT ("Still on this?") */}
      {showIdlePrompt && runningEntry && (
        <div className="fixed inset-0 z-40 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-lg w-full bg-slate-900 border-2 border-amber-500 rounded-3xl p-8 shadow-2xl space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-10 h-10" />
            </div>

            <div>
              <div className="text-xs font-black uppercase tracking-widest text-amber-400">
                Idle Check ({settings.idle_prompt_minutes}+ mins)
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-white mt-2">
                Still on this task?
              </h2>
              <p className="text-lg font-bold text-emerald-300 mt-2">
                {runningEntry.client_name} · {runningEntry.task_name}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                If no response is received by {settings.idle_stop_minutes} minutes, this entry will be auto-stopped at your last confirmed activity time.
              </p>
            </div>

            <div className="space-y-3">
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmStillOnTask}
                className="w-full min-h-[72px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xl font-black shadow-lg flex items-center justify-center"
              >
                YES — STILL ON THIS TASK
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => handlePressStop(false)}
                className="w-full min-h-[64px] rounded-2xl bg-rose-600 hover:bg-rose-500 text-white text-lg font-black flex items-center justify-center"
              >
                NO — STOP TASK NOW
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM TASK SWITCH MODAL (WHEN A TASK IS ALREADY RUNNING) */}
      {showConfirmSwitchModal && runningEntry && pendingSwitchAction && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border-2 border-amber-400 rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/40">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-amber-400">
                    Task Already Running
                  </div>
                  <h3 className="text-xl font-black text-white mt-0.5 leading-snug">
                    Finish current task and switch?
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmSwitchModal(false);
                  setPendingSwitchAction(null);
                }}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Currently Timing ({formatElapsedHMS(elapsedSeconds)})
                </div>
                <div className="text-sm font-black text-white mt-0.5">
                  {runningEntry.task_name}
                </div>
                <div className="text-xs font-bold text-emerald-400">
                  {runningEntry.client_name} ({runningEntry.client_code})
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/30">
                <div className="text-[10px] font-black uppercase tracking-wider text-sky-400">
                  Switching To New Task
                </div>
                <div className="text-sm font-black text-white mt-0.5">
                  {pendingSwitchAction.kind === 'catalogue'
                    ? pendingSwitchAction.task.name
                    : pendingSwitchAction.customTaskTitle}
                </div>
                <div className="text-xs font-bold text-sky-300">
                  {pendingSwitchAction.kind === 'catalogue'
                    ? `${pendingSwitchAction.targetClient.name} (${pendingSwitchAction.targetClient.code})`
                    : pendingSwitchAction.clientName}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setShowConfirmSwitchModal(false);
                  setPendingSwitchAction(null);
                }}
                className="btn-glove-lg rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center"
              >
                No, Keep Current
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirmSwitchProceed}
                className="btn-glove-lg rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm flex items-center justify-center gap-1.5 shadow-lg"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                Yes, Finish &amp; Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* "I'VE CHOSEN THE WRONG TASK" REASSIGN RUNNING TIMER MODAL */}
      {showWrongTaskModal && runningEntry && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleReassignWrongTask}
            className="w-full max-w-md bg-slate-900 border-2 border-amber-400 rounded-3xl p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-amber-400">
                  Reassign Running Timer
                </div>
                <h3 className="text-xl font-black text-white mt-0.5">
                  I&apos;ve chosen the wrong task
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Switch your running timer to the right Client &amp; Task while keeping your original start time ({formatLondonTime(runningEntry.started_at)}).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowWrongTaskModal(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Correct Client
                </label>
                <select
                  value={wrongTaskClientId}
                  onChange={(e) => {
                    const nextClient = e.target.value;
                    setWrongTaskClientId(nextClient);
                    const available = taskTypes.filter(
                      (t) => t.is_standard || t.client_id === nextClient
                    );
                    if (available.length > 0) {
                      setWrongTaskTypeId(available[0].id);
                    }
                  }}
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold text-sm"
                >
                  {effectiveClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Correct Task
                </label>
                <select
                  value={wrongTaskTypeId}
                  onChange={(e) => setWrongTaskTypeId(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white font-bold text-sm"
                >
                  {taskTypes
                    .filter((t) => t.is_standard || t.client_id === wrongTaskClientId)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.is_standard ? '[Standard] ' : '[Custom] '}
                        {t.name} ({t.code})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                  Quick Note (Optional)
                </label>
                <input
                  type="text"
                  value={wrongTaskReason}
                  onChange={(e) => setWrongTaskReason(e.target.value)}
                  placeholder="e.g. Clicked wrong client by mistake"
                  className="w-full h-11 px-3 rounded-xl bg-slate-950 border border-slate-700 text-white text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowWrongTaskModal(false)}
                className="btn-glove-lg rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !wrongTaskTypeId}
                className="btn-glove-lg rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-sm flex items-center justify-center gap-1.5 shadow-lg"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                Update Running Timer
              </button>
            </div>
          </form>
        </div>
      )}

      {/* UNITS NUMERIC KEYPAD MODAL ON STOP (SKIPPABLE — ALWAYS ON TOP z-50) */}
      {showStopUnitsModal && runningEntry && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border-2 border-slate-700 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  {stopIsMistake
                    ? 'Accidental Start / Cancel Timer'
                    : pendingSwitchAction
                      ? 'Closing Current Task — Declare Quantity Completed'
                      : 'Stopping Task — Declare Quantity Completed'}
                </div>
                <h3 className="text-2xl font-black text-white">
                  {stopIsMistake
                    ? 'Cancel Accidental Timer'
                    : `How many ${runningEntry.unit_label || 'units'} completed?`}
                </h3>
                <p className="text-xs text-slate-400">
                  {runningEntry.client_name} · {runningEntry.task_name}
                </p>
                {pendingSwitchAction && (
                  <p className="text-[11px] font-bold text-sky-300 mt-1">
                    Next task:{' '}
                    {pendingSwitchAction.kind === 'catalogue'
                      ? pendingSwitchAction.task.name
                      : pendingSwitchAction.customTaskTitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setLocalLastActivityMs(Date.now());
                  setShowStopUnitsModal(false);
                  setPendingSwitchAction(null);
                  setStopIsMistake(false);
                }}
                className="p-2 rounded-xl bg-slate-800 text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!stopIsMistake && (
              <>
                <div className="h-16 px-4 rounded-xl bg-slate-950 border-2 border-emerald-500/60 flex items-center justify-between">
                  <span className="text-3xl font-black font-mono text-white">
                    {stopUnitsValue || '0'}
                  </span>
                  <span className="text-sm font-bold uppercase text-emerald-400">
                    {runningEntry.unit_label || 'units'}
                  </span>
                </div>

                {/* Glove Numeric Keypad */}
                <div className="grid grid-cols-3 gap-2.5">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => setStopUnitsValue((prev) => (prev + digit).slice(0, 6))}
                      className="btn-glove-lg rounded-xl bg-slate-800 hover:bg-slate-700 text-2xl font-black text-white border border-slate-700 flex items-center justify-center"
                    >
                      {digit}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setStopUnitsValue('')}
                    className="btn-glove-lg rounded-xl bg-slate-950 text-xs font-bold text-slate-400 border border-slate-800 flex items-center justify-center"
                  >
                    CLEAR
                  </button>
                  <button
                    type="button"
                    onClick={() => setStopUnitsValue((prev) => (prev + '0').slice(0, 6))}
                    className="btn-glove-lg rounded-xl bg-slate-800 hover:bg-slate-700 text-2xl font-black text-white border border-slate-700 flex items-center justify-center"
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={() => setStopUnitsValue((prev) => prev.slice(0, -1))}
                    className="btn-glove-lg rounded-xl bg-slate-950 text-slate-300 border border-slate-800 flex items-center justify-center"
                  >
                    <Delete className="w-6 h-6" />
                  </button>
                </div>
              </>
            )}

            {/* ACCIDENTAL START / I MADE A MISTAKE CHECKBOX */}
            {!pendingSwitchAction && (
              <div className="p-3.5 rounded-2xl bg-slate-950 border border-rose-500/35 space-y-2.5">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stopIsMistake}
                    onChange={(e) => setStopIsMistake(e.target.checked)}
                    className="w-4 h-4 mt-0.5 rounded accent-rose-500 shrink-0"
                  />
                  <div>
                    <div className="text-xs font-black uppercase tracking-wider text-rose-300">
                      Accidental Start / I Made a Mistake
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Excludes this timer from pace averages and client billing.
                    </div>
                  </div>
                </label>

                {stopIsMistake && (
                  <input
                    type="text"
                    required
                    value={stopMistakeReason}
                    onChange={(e) => setStopMistakeReason(e.target.value)}
                    placeholder="Reason (e.g. Pressed start by accident, didn't do task)..."
                    className="w-full h-10 px-3 rounded-xl bg-slate-900 border border-rose-500/50 text-white text-xs font-semibold"
                  />
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              {stopIsMistake ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setStopIsMistake(false);
                      setShowStopUnitsModal(false);
                    }}
                    className="btn-glove-lg rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      executeStopTask(
                        0,
                        true,
                        stopMistakeReason.trim() || 'Accidental start / mistake'
                      );
                    }}
                    className="btn-glove-lg rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg"
                  >
                    <X className="w-4 h-4 stroke-[3]" />
                    Cancel as Mistake
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setPendingZeroUnitsValue(null);
                      setShowZeroActivityConfirmModal(true);
                    }}
                    className="btn-glove-lg rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center"
                  >
                    Skip Units &amp; Stop
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const trimmed = stopUnitsValue.trim();
                      const num = trimmed !== '' ? parseInt(trimmed, 10) : null;
                      if (num === null || Number.isNaN(num) || num <= 0) {
                        setPendingZeroUnitsValue(0);
                        setShowZeroActivityConfirmModal(true);
                        return;
                      }
                      completeStopOrSwitchWithUnits(num);
                    }}
                    className="btn-glove-lg rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base flex items-center justify-center gap-2"
                  >
                    <Check className="w-5 h-5" />
                    {pendingSwitchAction ? 'Save & Switch' : 'Save & Stop'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECOND WINDOW: CONFIRM ZERO ACTIVITY MODAL (RED WARNING — ITEM #12) */}
      {showZeroActivityConfirmModal && runningEntry && (
        <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border-2 border-rose-500 rounded-3xl p-6 shadow-2xl space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/40">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-rose-400">
                    Zero Productivity Warning
                  </div>
                  <h3 className="text-xl font-black text-white mt-0.5 leading-snug">
                    Confirm 0 {runningEntry.unit_label || 'units'} completed?
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowZeroActivityConfirmModal(false)}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-rose-950/35 border border-rose-500/40 text-sm text-slate-200 space-y-1.5">
              <p>
                Task:{' '}
                <strong className="text-white">
                  {runningEntry.client_code} · {runningEntry.task_name}
                </strong>
              </p>
              <p className="text-xs text-rose-200 font-semibold">
                Recording 0 {runningEntry.unit_label || 'units'} will exclude this run from pace averages and flag it as a Manager Action Point for the Supervisor to review.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowZeroActivityConfirmModal(false)}
                className="btn-glove-lg rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center"
              >
                No, Enter Units
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setShowZeroActivityConfirmModal(false);
                  completeStopOrSwitchWithUnits(pendingZeroUnitsValue);
                }}
                className="btn-glove-lg rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/30"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                Yes, Confirm Zero
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUPERVISOR AUTHORIZATION FOR UNBILLED TASKS MODAL */}
      {unbillAuthModal && (
        <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border-2 border-rose-500 rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/40">
                  <ShieldAlert className="w-6 h-6 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">
                    Supervisor Authorization Required
                  </h3>
                  <p className="text-xs font-semibold text-rose-300">
                    Have you got authorization from a supervisor that this is an unbilled task?
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUnbillAuthModal(null)}
                className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-xs text-slate-300 leading-relaxed space-y-1">
              <div>
                Task:{' '}
                <strong className="text-white">
                  &ldquo;{unbillAuthModal.taskTitle}&rdquo;
                </strong>
              </div>
              <div>
                Marking this as{' '}
                <span className="text-rose-400 font-bold uppercase">
                  Our Cost
                </span>{' '}
                means Cloud9 absorbs the labor expense and this time will{' '}
                <strong>NOT</strong> be billed to the client.
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-rose-300 mb-1.5">
                Why is this unbilled? (Mandatory Justification for K & Finance)*
              </label>
              <textarea
                required
                rows={3}
                value={unbillJustification}
                onChange={(e) => setUnbillJustification(e.target.value)}
                placeholder="Explain why Cloud9 absorbs this cost (e.g., supplier packaging defect rework, internal stock reorganization, authorized training)..."
                className="w-full p-3 rounded-xl bg-slate-950 border border-rose-500/60 text-white text-xs placeholder:text-slate-500 focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400 font-medium"
              />
              {!unbillJustification.trim() ? (
                <div className="text-[11px] text-rose-400 font-semibold mt-1">
                  * A typed justification is required to unbill this task.
                </div>
              ) : (
                <div className="text-[11px] text-emerald-400 font-semibold mt-1 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Justification recorded for K & billing audit.
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setUnbillAuthModal(null)}
                className="btn-glove rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm flex items-center justify-center"
              >
                No, Go Back
              </button>
              <button
                type="button"
                disabled={!unbillJustification.trim()}
                onClick={() =>
                  unbillAuthModal.onConfirm(unbillJustification.trim())
                }
                className="btn-glove rounded-2xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:hover:bg-rose-600 text-white font-black text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/30"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                Yes, Authorized as Our Cost
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BARCODE CAMERA / HANDHELD SCANNER MODAL */}
      {showScanner && (
        <BarcodeScannerModal
          taskTypes={taskTypes}
          onDetected={handleBarcodeDetected}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
