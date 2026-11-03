/**
 * Billing Status Domain Model & Classification
 *
 * Defines the three operational billing statuses for warehouse jobs:
 * 1. 'automatically_billed': Built into automated system for this task (e.g. pick & pack, label dispatch).
 * 2. 'needs_billed': Billable task requiring review/invoicing (bespoke SOW, kitting, rework, custom projects).
 * 3. 'our_cost': Internal warehouse overhead/cost to Cloud9 (housekeeping, waste, internal rework). Color coded RED.
 */

export type BillingStatus = 'automatically_billed' | 'needs_billed' | 'our_cost';

export interface BillingStatusConfig {
  key: BillingStatus;
  label: 'Automatically Billed' | 'Needs to be Billed' | 'Our Cost';
  shortLabel: string;
  description: string;
  badgeClass: string;
  dotClass: string;
  textClass: string;
  borderClass: string;
  bgClass: string;
  colorHex: string;
  billableBoolean: boolean;
}

export const BILLING_STATUS_CONFIG: Record<BillingStatus, BillingStatusConfig> = {
  automatically_billed: {
    key: 'automatically_billed',
    label: 'Automatically Billed',
    shortLabel: 'Auto-Billed',
    description: 'Automated billing built into system (picking, packing, label dispatch).',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
    dotClass: 'bg-emerald-400',
    textClass: 'text-emerald-300',
    borderClass: 'border-emerald-500/40',
    bgClass: 'bg-emerald-950/20',
    colorHex: '#10B981',
    billableBoolean: true,
  },
  needs_billed: {
    key: 'needs_billed',
    label: 'Needs to be Billed',
    shortLabel: 'Needs Billing',
    description: 'Billable job requiring manual/review invoicing to client.',
    badgeClass: 'bg-sky-500/20 text-sky-300 border border-sky-500/40',
    dotClass: 'bg-sky-400',
    textClass: 'text-sky-300',
    borderClass: 'border-sky-500/40',
    bgClass: 'bg-sky-950/20',
    colorHex: '#0284C7',
    billableBoolean: true,
  },
  our_cost: {
    key: 'our_cost',
    label: 'Our Cost',
    shortLabel: 'Our Cost',
    description: 'Internal warehouse expense absorbed by Cloud9 (unbilled).',
    badgeClass: 'bg-rose-500/25 text-rose-300 border-2 border-rose-500/60 font-black',
    dotClass: 'bg-rose-500',
    textClass: 'text-rose-400',
    borderClass: 'border-rose-500',
    bgClass: 'bg-rose-950/30',
    colorHex: '#EF4444',
    billableBoolean: false,
  },
};

/**
 * Determine if a task is already decreed as unbilled / Our Cost (e.g. standard Housekeeping, Facilities).
 */
export function isTaskDecreedUnbilled(params: {
  category?: string | null;
  taskCode?: string | null;
  taskName?: string | null;
  defaultBillingStatus?: BillingStatus | string | null;
  billable?: boolean;
}): boolean {
  if (params.defaultBillingStatus === 'our_cost') return true;
  if (params.billable === false && !params.defaultBillingStatus) return true;

  const cat = (params.category || '').toLowerCase();
  const code = (params.taskCode || '').toLowerCase();
  const name = (params.taskName || '').toLowerCase();

  return (
    cat.includes('housekeep') ||
    cat.includes('facilit') ||
    cat.includes('maintenance') ||
    cat.includes('clean') ||
    cat.includes('waste') ||
    code.includes('clean') ||
    code.includes('repl') ||
    code.includes('sweep') ||
    code.includes('waste') ||
    code.includes('maint') ||
    name.includes('clean') ||
    name.includes('sweep') ||
    name.includes('waste') ||
    name.includes('housekeep') ||
    name.includes('tidy') ||
    name.includes('cardboard') ||
    name.includes('compact')
  );
}

/**
 * Determine if a task is already decreed as Automatically Billed (e.g. picking & packing, label dispatch).
 */
export function isTaskDecreedAutoBilled(params: {
  category?: string | null;
  taskCode?: string | null;
  taskName?: string | null;
  defaultBillingStatus?: BillingStatus | string | null;
}): boolean {
  if (params.defaultBillingStatus === 'automatically_billed') return true;

  const cat = (params.category || '').toLowerCase();
  const code = (params.taskCode || '').toLowerCase();
  const name = (params.taskName || '').toLowerCase();

  return (
    code.includes('pick') ||
    name.includes('pick') ||
    cat.includes('pick') ||
    code.includes('disp') ||
    name.includes('dispatch') ||
    name.includes('label dispatch') ||
    cat.includes('dispatch')
  );
}

/**
 * Resolve the effective billing status for any task or entry.
 */
export function resolveBillingStatus(params: {
  billingStatus?: BillingStatus | string | null;
  billable?: boolean;
  category?: string | null;
  taskCode?: string | null;
  taskName?: string | null;
}): BillingStatus {
  if (
    params.billingStatus === 'automatically_billed' ||
    params.billingStatus === 'needs_billed' ||
    params.billingStatus === 'our_cost'
  ) {
    return params.billingStatus;
  }

  if (params.billable === false) {
    return 'our_cost';
  }

  if (isTaskDecreedUnbilled(params)) {
    return 'our_cost';
  }

  if (isTaskDecreedAutoBilled(params)) {
    return 'automatically_billed';
  }

  return 'needs_billed';
}

/**
 * Get the visual configuration object for a billing status.
 */
export function getBillingStatusConfig(status: BillingStatus | string | null | undefined): BillingStatusConfig {
  if (status && status in BILLING_STATUS_CONFIG) {
    return BILLING_STATUS_CONFIG[status as BillingStatus];
  }
  return BILLING_STATUS_CONFIG.needs_billed;
}
