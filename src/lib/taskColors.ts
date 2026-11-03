/**
 * Task Hue & Shade Palette Generator
 * 
 * Provides deterministic, rich visual grouping for warehouse time entries.
 * - Distinct Hue Families:
 *   - Amber / Orange: Pick & Pack, Fulfillment, Dispatch
 *   - Electric Blue: Inbound, Receiving, Putaway, Pallet Storage
 *   - Turquoise / Emerald: Kitting, Assembly, Rework, Production
 *   - Radiant Violet / Purple: Returns, Quality Control, Relabeling, Inspection
 *   - Rose / Crimson: Housekeeping, Cycle Counting, Facilities, Maintenance
 * 
 * - Distinct Shades within each family:
 *   Each task within a family receives a stable, distinguishable shade of that hue.
 *   Operatives working on the same task always share the exact same hue & shade.
 */

export type HueFamilyKey = 'amber_orange' | 'electric_blue' | 'turquoise_emerald' | 'radiant_violet' | 'rose_crimson';

export interface TaskHueStyle {
  familyKey: HueFamilyKey;
  familyName: string;
  shadeIndex: number;
  shadeName: string;
  // Border and accent colors
  borderLeftHex: string;
  accentHex: string;
  // Card backgrounds and borders
  cardBgHex: string;
  cardBorderHex: string;
  cardHoverBgHex: string;
  // Badges & Pills
  badgeBgHex: string;
  badgeBorderHex: string;
  badgeTextHex: string;
  // Subtle Glow
  glowHex: string;
  // Dot indicator
  dotClass: string;
}

interface PaletteShade {
  shadeName: string;
  borderLeftHex: string;
  accentHex: string;
  cardBgHex: string;
  cardBorderHex: string;
  cardHoverBgHex: string;
  badgeBgHex: string;
  badgeBorderHex: string;
  badgeTextHex: string;
  glowHex: string;
  dotClass: string;
}

const PALETTE_FAMILIES: Record<HueFamilyKey, { familyName: string; shades: PaletteShade[] }> = {
  amber_orange: {
    familyName: 'Pick & Pack / Dispatch',
    shades: [
      {
        shadeName: 'Crisp Amber',
        borderLeftHex: '#F59E0B',
        accentHex: '#F59E0B',
        cardBgHex: 'rgba(245, 158, 11, 0.08)',
        cardBorderHex: 'rgba(245, 158, 11, 0.28)',
        cardHoverBgHex: 'rgba(245, 158, 11, 0.13)',
        badgeBgHex: 'rgba(245, 158, 11, 0.20)',
        badgeBorderHex: 'rgba(245, 158, 11, 0.45)',
        badgeTextHex: '#FCD34D',
        glowHex: 'rgba(245, 158, 11, 0.25)',
        dotClass: 'bg-amber-400',
      },
      {
        shadeName: 'Vivid Tangerine',
        borderLeftHex: '#EA580C',
        accentHex: '#EA580C',
        cardBgHex: 'rgba(234, 88, 12, 0.08)',
        cardBorderHex: 'rgba(234, 88, 12, 0.28)',
        cardHoverBgHex: 'rgba(234, 88, 12, 0.13)',
        badgeBgHex: 'rgba(234, 88, 12, 0.20)',
        badgeBorderHex: 'rgba(234, 88, 12, 0.45)',
        badgeTextHex: '#FDBA74',
        glowHex: 'rgba(234, 88, 12, 0.25)',
        dotClass: 'bg-orange-500',
      },
      {
        shadeName: 'Warm Gold',
        borderLeftHex: '#D97706',
        accentHex: '#D97706',
        cardBgHex: 'rgba(217, 119, 6, 0.08)',
        cardBorderHex: 'rgba(217, 119, 6, 0.28)',
        cardHoverBgHex: 'rgba(217, 119, 6, 0.13)',
        badgeBgHex: 'rgba(217, 119, 6, 0.20)',
        badgeBorderHex: 'rgba(217, 119, 6, 0.45)',
        badgeTextHex: '#FDE68A',
        glowHex: 'rgba(217, 119, 6, 0.25)',
        dotClass: 'bg-amber-500',
      },
      {
        shadeName: 'Flame Coral',
        borderLeftHex: '#F97316',
        accentHex: '#F97316',
        cardBgHex: 'rgba(249, 115, 22, 0.08)',
        cardBorderHex: 'rgba(249, 115, 22, 0.28)',
        cardHoverBgHex: 'rgba(249, 115, 22, 0.13)',
        badgeBgHex: 'rgba(249, 115, 22, 0.20)',
        badgeBorderHex: 'rgba(249, 115, 22, 0.45)',
        badgeTextHex: '#FED7AA',
        glowHex: 'rgba(249, 115, 22, 0.25)',
        dotClass: 'bg-orange-400',
      },
    ],
  },
  electric_blue: {
    familyName: 'Inbound & Storage',
    shades: [
      {
        shadeName: 'Electric Blue',
        borderLeftHex: '#3B82F6',
        accentHex: '#3B82F6',
        cardBgHex: 'rgba(59, 130, 246, 0.08)',
        cardBorderHex: 'rgba(59, 130, 246, 0.28)',
        cardHoverBgHex: 'rgba(59, 130, 246, 0.13)',
        badgeBgHex: 'rgba(59, 130, 246, 0.20)',
        badgeBorderHex: 'rgba(59, 130, 246, 0.45)',
        badgeTextHex: '#93C5FD',
        glowHex: 'rgba(59, 130, 246, 0.25)',
        dotClass: 'bg-blue-400',
      },
      {
        shadeName: 'Ocean Sky',
        borderLeftHex: '#0284C7',
        accentHex: '#0284C7',
        cardBgHex: 'rgba(2, 132, 199, 0.08)',
        cardBorderHex: 'rgba(2, 132, 199, 0.28)',
        cardHoverBgHex: 'rgba(2, 132, 199, 0.13)',
        badgeBgHex: 'rgba(2, 132, 199, 0.20)',
        badgeBorderHex: 'rgba(2, 132, 199, 0.45)',
        badgeTextHex: '#7DD3FC',
        glowHex: 'rgba(2, 132, 199, 0.25)',
        dotClass: 'bg-sky-400',
      },
      {
        shadeName: 'Cobalt Royal',
        borderLeftHex: '#2563EB',
        accentHex: '#2563EB',
        cardBgHex: 'rgba(37, 99, 235, 0.08)',
        cardBorderHex: 'rgba(37, 99, 235, 0.28)',
        cardHoverBgHex: 'rgba(37, 99, 235, 0.13)',
        badgeBgHex: 'rgba(37, 99, 235, 0.20)',
        badgeBorderHex: 'rgba(37, 99, 235, 0.45)',
        badgeTextHex: '#BFDBFE',
        glowHex: 'rgba(37, 99, 235, 0.25)',
        dotClass: 'bg-blue-500',
      },
      {
        shadeName: 'Indigo Steel',
        borderLeftHex: '#6366F1',
        accentHex: '#6366F1',
        cardBgHex: 'rgba(99, 102, 241, 0.08)',
        cardBorderHex: 'rgba(99, 102, 241, 0.28)',
        cardHoverBgHex: 'rgba(99, 102, 241, 0.13)',
        badgeBgHex: 'rgba(99, 102, 241, 0.20)',
        badgeBorderHex: 'rgba(99, 102, 241, 0.45)',
        badgeTextHex: '#C7D2FE',
        glowHex: 'rgba(99, 102, 241, 0.25)',
        dotClass: 'bg-indigo-400',
      },
    ],
  },
  turquoise_emerald: {
    familyName: 'Kitting & Production',
    shades: [
      {
        shadeName: 'Vivid Turquoise',
        borderLeftHex: '#14B8A6',
        accentHex: '#14B8A6',
        cardBgHex: 'rgba(20, 184, 166, 0.08)',
        cardBorderHex: 'rgba(20, 184, 166, 0.28)',
        cardHoverBgHex: 'rgba(20, 184, 166, 0.13)',
        badgeBgHex: 'rgba(20, 184, 166, 0.20)',
        badgeBorderHex: 'rgba(20, 184, 166, 0.45)',
        badgeTextHex: '#99F6E4',
        glowHex: 'rgba(20, 184, 166, 0.25)',
        dotClass: 'bg-teal-400',
      },
      {
        shadeName: 'Vibrant Emerald',
        borderLeftHex: '#10B981',
        accentHex: '#10B981',
        cardBgHex: 'rgba(16, 185, 129, 0.08)',
        cardBorderHex: 'rgba(16, 185, 129, 0.28)',
        cardHoverBgHex: 'rgba(16, 185, 129, 0.13)',
        badgeBgHex: 'rgba(16, 185, 129, 0.20)',
        badgeBorderHex: 'rgba(16, 185, 129, 0.45)',
        badgeTextHex: '#A7F3D0',
        glowHex: 'rgba(16, 185, 129, 0.25)',
        dotClass: 'bg-emerald-400',
      },
      {
        shadeName: 'Aquamarine Cyan',
        borderLeftHex: '#06B6D4',
        accentHex: '#06B6D4',
        cardBgHex: 'rgba(6, 182, 212, 0.08)',
        cardBorderHex: 'rgba(6, 182, 212, 0.28)',
        cardHoverBgHex: 'rgba(6, 182, 212, 0.13)',
        badgeBgHex: 'rgba(6, 182, 212, 0.20)',
        badgeBorderHex: 'rgba(6, 182, 212, 0.45)',
        badgeTextHex: '#A5F3FC',
        glowHex: 'rgba(6, 182, 212, 0.25)',
        dotClass: 'bg-cyan-400',
      },
      {
        shadeName: 'Lush Jade',
        borderLeftHex: '#059669',
        accentHex: '#059669',
        cardBgHex: 'rgba(5, 150, 105, 0.08)',
        cardBorderHex: 'rgba(5, 150, 105, 0.28)',
        cardHoverBgHex: 'rgba(5, 150, 105, 0.13)',
        badgeBgHex: 'rgba(5, 150, 105, 0.20)',
        badgeBorderHex: 'rgba(5, 150, 105, 0.45)',
        badgeTextHex: '#6EE7B7',
        glowHex: 'rgba(5, 150, 105, 0.25)',
        dotClass: 'bg-emerald-500',
      },
    ],
  },
  radiant_violet: {
    familyName: 'Returns & Quality Control',
    shades: [
      {
        shadeName: 'Radiant Violet',
        borderLeftHex: '#8B5CF6',
        accentHex: '#8B5CF6',
        cardBgHex: 'rgba(139, 92, 246, 0.08)',
        cardBorderHex: 'rgba(139, 92, 246, 0.28)',
        cardHoverBgHex: 'rgba(139, 92, 246, 0.13)',
        badgeBgHex: 'rgba(139, 92, 246, 0.20)',
        badgeBorderHex: 'rgba(139, 92, 246, 0.45)',
        badgeTextHex: '#DDD6FE',
        glowHex: 'rgba(139, 92, 246, 0.25)',
        dotClass: 'bg-violet-400',
      },
      {
        shadeName: 'Amethyst Purple',
        borderLeftHex: '#A855F7',
        accentHex: '#A855F7',
        cardBgHex: 'rgba(168, 85, 247, 0.08)',
        cardBorderHex: 'rgba(168, 85, 247, 0.28)',
        cardHoverBgHex: 'rgba(168, 85, 247, 0.13)',
        badgeBgHex: 'rgba(168, 85, 247, 0.20)',
        badgeBorderHex: 'rgba(168, 85, 247, 0.45)',
        badgeTextHex: '#E9D5FF',
        glowHex: 'rgba(168, 85, 247, 0.25)',
        dotClass: 'bg-purple-400',
      },
      {
        shadeName: 'Rich Fuchsia',
        borderLeftHex: '#D946EF',
        accentHex: '#D946EF',
        cardBgHex: 'rgba(217, 70, 239, 0.08)',
        cardBorderHex: 'rgba(217, 70, 239, 0.28)',
        cardHoverBgHex: 'rgba(217, 70, 239, 0.13)',
        badgeBgHex: 'rgba(217, 70, 239, 0.20)',
        badgeBorderHex: 'rgba(217, 70, 239, 0.45)',
        badgeTextHex: '#F5D0FE',
        glowHex: 'rgba(217, 70, 239, 0.25)',
        dotClass: 'bg-fuchsia-400',
      },
      {
        shadeName: 'Deep Lavender',
        borderLeftHex: '#7C3AED',
        accentHex: '#7C3AED',
        cardBgHex: 'rgba(124, 58, 237, 0.08)',
        cardBorderHex: 'rgba(124, 58, 237, 0.28)',
        cardHoverBgHex: 'rgba(124, 58, 237, 0.13)',
        badgeBgHex: 'rgba(124, 58, 237, 0.20)',
        badgeBorderHex: 'rgba(124, 58, 237, 0.45)',
        badgeTextHex: '#EDE9FE',
        glowHex: 'rgba(124, 58, 237, 0.25)',
        dotClass: 'bg-purple-500',
      },
    ],
  },
  rose_crimson: {
    familyName: 'Housekeeping & Facilities',
    shades: [
      {
        shadeName: 'Rose Ruby',
        borderLeftHex: '#F43F5E',
        accentHex: '#F43F5E',
        cardBgHex: 'rgba(244, 63, 94, 0.08)',
        cardBorderHex: 'rgba(244, 63, 94, 0.28)',
        cardHoverBgHex: 'rgba(244, 63, 94, 0.13)',
        badgeBgHex: 'rgba(244, 63, 94, 0.20)',
        badgeBorderHex: 'rgba(244, 63, 94, 0.45)',
        badgeTextHex: '#FECDD3',
        glowHex: 'rgba(244, 63, 94, 0.25)',
        dotClass: 'bg-rose-400',
      },
      {
        shadeName: 'Deep Berry',
        borderLeftHex: '#E11D48',
        accentHex: '#E11D48',
        cardBgHex: 'rgba(225, 29, 72, 0.08)',
        cardBorderHex: 'rgba(225, 29, 72, 0.28)',
        cardHoverBgHex: 'rgba(225, 29, 72, 0.13)',
        badgeBgHex: 'rgba(225, 29, 72, 0.20)',
        badgeBorderHex: 'rgba(225, 29, 72, 0.45)',
        badgeTextHex: '#FFE4E6',
        glowHex: 'rgba(225, 29, 72, 0.25)',
        dotClass: 'bg-rose-500',
      },
      {
        shadeName: 'Warm Magenta',
        borderLeftHex: '#EC4899',
        accentHex: '#EC4899',
        cardBgHex: 'rgba(236, 72, 153, 0.08)',
        cardBorderHex: 'rgba(236, 72, 153, 0.28)',
        cardHoverBgHex: 'rgba(236, 72, 153, 0.13)',
        badgeBgHex: 'rgba(236, 72, 153, 0.20)',
        badgeBorderHex: 'rgba(236, 72, 153, 0.45)',
        badgeTextHex: '#FBCFE8',
        glowHex: 'rgba(236, 72, 153, 0.25)',
        dotClass: 'bg-pink-400',
      },
      {
        shadeName: 'Coral Pink',
        borderLeftHex: '#FB7185',
        accentHex: '#FB7185',
        cardBgHex: 'rgba(251, 113, 133, 0.08)',
        cardBorderHex: 'rgba(251, 113, 133, 0.28)',
        cardHoverBgHex: 'rgba(251, 113, 133, 0.13)',
        badgeBgHex: 'rgba(251, 113, 133, 0.20)',
        badgeBorderHex: 'rgba(251, 113, 133, 0.45)',
        badgeTextHex: '#FFE4E6',
        glowHex: 'rgba(251, 113, 133, 0.25)',
        dotClass: 'bg-rose-300',
      },
    ],
  },
};

/**
 * Deterministically hash any string into a non-negative integer.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Resolve the Hue Family from category or code names.
 */
export function resolveHueFamilyKey(params: {
  category?: string | null;
  code?: string | null;
  name?: string | null;
  clientId?: string | null;
}): HueFamilyKey {
  const cat = (params.category || '').toLowerCase();
  const code = (params.code || '').toLowerCase();
  const name = (params.name || '').toLowerCase();
  const combined = `${cat} ${code} ${name}`;

  // 1. Pick & Pack / Dispatch
  if (
    combined.includes('pick') ||
    combined.includes('pack') ||
    combined.includes('dispatch') ||
    combined.includes('ship') ||
    combined.includes('fulfill') ||
    code.includes('pick')
  ) {
    return 'amber_orange';
  }

  // 2. Inbound / Putaway / Storage
  if (
    combined.includes('inbound') ||
    combined.includes('recv') ||
    combined.includes('receiv') ||
    combined.includes('putaway') ||
    combined.includes('pallet') ||
    combined.includes('storage') ||
    combined.includes('unload') ||
    code.includes('recv')
  ) {
    return 'electric_blue';
  }

  // 3. Kitting / Assembly / Rework / Production
  if (
    combined.includes('kit') ||
    combined.includes('assembl') ||
    combined.includes('rework') ||
    combined.includes('build') ||
    combined.includes('foam') ||
    combined.includes('bundle') ||
    code.includes('kit')
  ) {
    return 'turquoise_emerald';
  }

  // 4. Returns / QC / Relabeling / Inspection
  if (
    combined.includes('return') ||
    combined.includes('qc') ||
    combined.includes('qual') ||
    combined.includes('inspect') ||
    combined.includes('label') ||
    combined.includes('relabel') ||
    code.includes('ret')
  ) {
    return 'radiant_violet';
  }

  // 5. Housekeeping / Maintenance / Cycle count
  if (
    combined.includes('housekeep') ||
    combined.includes('clean') ||
    combined.includes('sweep') ||
    combined.includes('maint') ||
    combined.includes('count') ||
    combined.includes('cycle') ||
    combined.includes('audit') ||
    combined.includes('facility') ||
    code.includes('clean') ||
    code.includes('cycle')
  ) {
    return 'rose_crimson';
  }

  // Fallback: Deterministic assignment by client or code
  const familyKeys: HueFamilyKey[] = [
    'amber_orange',
    'electric_blue',
    'turquoise_emerald',
    'radiant_violet',
    'rose_crimson',
  ];
  const hash = hashString(params.code || params.name || params.clientId || 'default');
  return familyKeys[hash % familyKeys.length];
}

/**
 * Get the exact Hue and Shade style for a task.
 * Guaranteed deterministic: same task always produces identical hue and shade.
 */
export function getTaskHueStyle(params: {
  taskId?: string | null;
  category?: string | null;
  code?: string | null;
  name?: string | null;
  clientId?: string | null;
}): TaskHueStyle {
  const familyKey = resolveHueFamilyKey(params);
  const family = PALETTE_FAMILIES[familyKey];

  // Derive distinct shade from the specific task (code or ID or name)
  const taskKey = params.code || params.taskId || params.name || '0';
  const shadeHash = hashString(taskKey);
  const shadeIndex = shadeHash % family.shades.length;
  const shade = family.shades[shadeIndex];

  return {
    familyKey,
    familyName: family.familyName,
    shadeIndex,
    shadeName: shade.shadeName,
    borderLeftHex: shade.borderLeftHex,
    accentHex: shade.accentHex,
    cardBgHex: shade.cardBgHex,
    cardBorderHex: shade.cardBorderHex,
    cardHoverBgHex: shade.cardHoverBgHex,
    badgeBgHex: shade.badgeBgHex,
    badgeBorderHex: shade.badgeBorderHex,
    badgeTextHex: shade.badgeTextHex,
    glowHex: shade.glowHex,
    dotClass: shade.dotClass,
  };
}
