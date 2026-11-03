export function getRoleBadgeClass(jobTitle?: string | null): string {
  const t = (jobTitle || 'Warehouse Operative').toLowerCase();

  if (t.includes('ceo') || t.includes('admin') || t.includes('builder')) {
    return 'bg-amber-500/15 border-amber-500/40 text-amber-300';
  }
  if (t.includes('supervisor')) {
    return 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300';
  }
  if (t.includes('core warehouse')) {
    return 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300';
  }
  if (t.includes('ccell')) {
    return 'bg-purple-500/15 border-purple-500/40 text-purple-300';
  }
  if (t.includes('marketing') || t.includes('innovation')) {
    return 'bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-300';
  }
  if (t.includes('sales')) {
    return 'bg-orange-500/15 border-orange-500/40 text-orange-300';
  }
  if (t.includes('people') || t.includes('operations')) {
    return 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300';
  }
  return 'bg-sky-500/15 border-sky-500/40 text-sky-300';
}

export function getStaffPriorityRank(user: {
  display_name?: string | null;
  role?: string | null;
  is_core_warehouse?: boolean | null;
}): number {
  const name = (user.display_name || '').trim().toLowerCase();
  if (name === 'mark') return 1;
  if (name === 'edna') return 2;
  if (user.role === 'supervisor') return 3;
  if (name === 'erica') return 4;
  if (name === 'sam') return 5;
  if (name === 'alex') return 6;
  if (name === 'mason') return 7;
  if (user.is_core_warehouse) return 8;
  return 50;
}

export function isPrimaryStaffMember(user: {
  display_name?: string | null;
  role?: string | null;
  is_core_warehouse?: boolean | null;
}): boolean {
  return getStaffPriorityRank(user) < 50;
}

export function sortCoreStaffFirst<
  T extends {
    display_name?: string | null;
    role?: string | null;
    is_core_warehouse?: boolean | null;
  }
>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const rankA = getStaffPriorityRank(a);
    const rankB = getStaffPriorityRank(b);
    if (rankA !== rankB) return rankA - rankB;
    return (a.display_name || '').localeCompare(b.display_name || '');
  });
}

export function getAdditionalStaffGroupLabel(user: {
  job_title?: string | null;
  team_name?: string | null;
  role?: string | null;
}): string {
  const jt = (user.job_title || '').toLowerCase();
  const tn = (user.team_name || '').toLowerCase();

  if (jt.includes('ceo') || jt.includes('admin') || user.role === 'admin') {
    return 'Executive & Admin';
  }
  if (jt.includes('ccell') || tn.includes('ccell')) {
    return 'CCELL & Warehouse Support';
  }
  if (jt.includes('warehouse operative') || tn.includes('warehouse')) {
    return 'CCELL & Warehouse Support';
  }
  if (jt.includes('people') || jt.includes('operations') || tn.includes('operations')) {
    return 'People & Operations';
  }
  if (jt.includes('sales') || tn.includes('sales')) {
    return 'Sales Team';
  }
  if (jt.includes('marketing') || jt.includes('innovation') || tn.includes('marketing')) {
    return 'Marketing & Innovations';
  }
  return user.job_title || 'Additional Staff';
}

export const ADDITIONAL_GROUP_ORDER = [
  'CCELL & Warehouse Support',
  'People & Operations',
  'Sales Team',
  'Marketing & Innovations',
  'Executive & Admin',
];

