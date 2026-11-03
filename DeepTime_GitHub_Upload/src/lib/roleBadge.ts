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
