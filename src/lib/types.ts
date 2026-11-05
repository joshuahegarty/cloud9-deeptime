export type Role = 'operative' | 'supervisor' | 'admin' | 'client_viewer';

export type EntrySource = 'scan' | 'typed' | 'picked' | 'crew' | 'manual';

export type BillingStatus = 'automatically_billed' | 'needs_billed' | 'our_cost';

export interface UserPublic {
  id: string;
  display_name: string;
  role: Role;
  job_title?: string | null;
  team_name?: string | null;
  is_core_warehouse?: boolean;
  email?: string | null;
  must_change_pin?: boolean;
  hands_free_voice_enabled?: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserAdmin extends UserPublic {
  email?: string | null;
  pin_hash: string | null;
  hourly_cost: number | null;
}

export interface Client {
  id: string;
  name: string;
  code: string;
  rounding_minutes: number;
  billable_default: boolean;
  baseline_status?: 'learning' | 'established' | 'bossing_it';
  baseline_approved?: boolean;
  baseline_approved_by?: string | null;
  baseline_approved_at?: string | null;
  baseline_notes?: string | null;
  manager_target_delegated?: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskType {
  id: string;
  client_id: string | null;
  is_standard?: boolean;
  category?: string;
  project_name?: string | null;
  project_color?: string | null;
  client_name?: string;
  client_code?: string;
  name: string;
  code: string;
  rounding_minutes?: number | null;
  min_charge_minutes?: number | null;
  standard_minutes: number | null;
  target_enabled?: boolean;
  unit_label: string | null;
  require_units_on_close?: boolean;
  billable: boolean;
  billing_status?: BillingStatus;
  rate: number | null;
  barcode: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssignedTask {
  id: string;
  user_id: string | null;
  user_name?: string;
  is_open_pool?: boolean;
  client_id: string;
  client_name?: string;
  client_code?: string;
  task_type_id: string;
  task_name?: string;
  task_code?: string;
  unit_label?: string | null;
  standard_minutes?: number | null;
  order_ref?: string | null;
  note?: string | null;
  assigned_by?: string | null;
  assigned_by_name?: string | null;
  status: 'pending' | 'started' | 'completed' | 'cancelled';
  created_at: string;
}

export interface TimeEntry {
  id: string;
  user_id: string;
  user_name?: string;
  client_id: string;
  client_name?: string;
  client_code?: string;
  client_rounding_minutes?: number;
  task_type_id: string;
  task_name?: string;
  task_code?: string;
  task_rounding_minutes?: number | null;
  task_min_charge_minutes?: number | null;
  unit_label?: string | null;
  require_units_on_close?: boolean;
  target_enabled?: boolean;
  standard_minutes?: number | null;
  order_ref: string | null;
  started_at: string;
  ended_at: string | null;
  units: number | null;
  billable: boolean;
  billing_status?: BillingStatus;
  unbilled_reason?: string | null;
  billing_review_status?: 'pending' | 'agreed' | 'disputed';
  billing_review_note?: string | null;
  source: EntrySource;
  crew_id: string | null;
  created_by: string;
  created_by_name?: string;
  auto_stopped: boolean;
  note: string | null;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
}

export interface Attendance {
  id: string;
  user_id: string;
  user_name?: string;
  clock_in: string;
  clock_out: string | null;
  auto_closed: boolean;
  reviewed: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditEvent {
  id: string;
  entry_id: string;
  changed_by: string;
  changed_by_name?: string;
  changed_at: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
}

export interface AppSettings {
  idle_prompt_minutes: number;
  idle_stop_minutes: number;
  shift_end: string;
  summary_time: string;
  summary_recipients: string[];
  timezone: string;
  show_targets_to_operatives?: boolean;
  helm_api_url?: string;
  helm_api_token?: string;
  helm_auto_sync?: boolean;
}

export interface SavedView {
  id: string;
  user_id: string;
  name: string;
  filter_json: {
    startDate?: string;
    endDate?: string;
    clientId?: string;
    taskTypeId?: string;
    userId?: string;
    tab?: 'client_task' | 'operative' | 'league';
  };
  created_at: string;
  updated_at: string;
}

export interface OfflineQueueItem {
  id: string;
  action: 'start_task' | 'stop_task' | 'clock_in' | 'clock_out';
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface TargetChangeRequest {
  id: string;
  task_type_id: string;
  task_name?: string;
  task_code?: string;
  client_id?: string | null;
  client_name?: string | null;
  client_code?: string | null;
  current_standard_minutes: number | null;
  proposed_standard_minutes: number;
  observed_pace: number | null;
  variance_percent: number | null;
  sample_runs: number;
  sample_units: number;
  operatives_count: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_by: string;
  requester_name?: string;
  reviewed_by: string | null;
  reviewer_name?: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskTargetAnalysis {
  taskTypeId: string;
  taskName: string;
  taskCode: string;
  category: string;
  clientId: string | null;
  clientName: string;
  clientCode: string;
  unitLabel: string | null;
  currentStandardMinutes: number | null;
  currentTargetUnitsPerHour: number | null;

  // Statistical Baseline Metrics
  sampleRunsCount: number;
  sampleUnitsCount: number;
  sampleMinutesTotal: number;
  distinctOperativesCount: number;

  // Baseline Maturity Check
  isCustomerBaselineApproved: boolean;
  customerBaselineStatus: 'learning' | 'established' | 'bossing_it';
  isTaskSampleSufficient: boolean;
  isBaselineEstablished: boolean;
  baselineReadinessReason: string;
  baselineRunsProgress: number; // e.g. 6 (out of 10)
  baselineRunsTarget: number; // e.g. 10

  // Performance Variance
  observedPaceMinutesPerUnit: number | null;
  observedUnitsPerHour: number | null;
  variancePercent: number | null; // e.g. +28.5% (faster) or -35.2% (slower)
  direction: 'quicker' | 'slower' | 'on_target' | 'no_data';
  isVarianceSignificant: boolean; // Math.abs(variancePercent) >= 10%

  // Engine Recommendation
  hasRecommendation: boolean;
  suggestedStandardMinutes: number | null;
  suggestedUnitsPerHour: number | null;
  recommendationTitle: string | null;
  recommendationDescription: string | null;
  recommendationSeverity: 'high' | 'medium' | 'healthy' | 'baseline_pending';

  // Two-point governance status
  pendingRequestId?: string;
  pendingRequest?: TargetChangeRequest;
  managerCanDirectEdit: boolean;
}

export type FeedbackType = 'bug' | 'feature';
export type FeedbackSeverity = 'low' | 'medium' | 'high' | 'critical';
export type FeedbackStatus = 'open' | 'planned' | 'in_progress' | 'resolved' | 'closed';
export type FeedbackDeviceType = 'desktop' | 'android' | 'iphone' | 'scanner';

export interface FeedbackUpdateItem {
  id: string;
  author_name: string;
  author_role: string;
  status: FeedbackStatus;
  note: string;
  created_at: string;
}

export interface FeedbackReport {
  id: string;
  type: FeedbackType;
  severity: FeedbackSeverity;
  device_type?: FeedbackDeviceType | null;
  title: string;
  description: string;
  page_path: string;
  reporter_user_id: string | null;
  reporter_name: string;
  reporter_role: string;
  status: FeedbackStatus;
  admin_note: string | null;
  attachments?: string[];
  updates_log?: FeedbackUpdateItem[];
  created_at: string;
  updated_at: string;
}

