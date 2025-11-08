export type PhaseKey = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';

interface PhaseVisuals {
  label: string;
  shortLabel: string;
  color: string;
  gradient: [string, string, string];
  emoji: string;
  description: string;
  summary: string;
}

export const PHASE_PALETTE: Record<PhaseKey, PhaseVisuals> = {
  menstrual: {
    label: 'Menstrual Phase',
    shortLabel: 'Menstrual',
    color: '#FF1744',
    gradient: ['#FFFFFF', '#FFE3EA', '#FF647C'],
    emoji: '🩸',
    description:
      'Your cycle resets as the uterine lining sheds. Estrogen and progesterone are at their lowest, so rest, hydration, and warmth help ease cramps and fatigue.',
    summary: 'Period days — listen to your body and take things gently.',
  },
  follicular: {
    label: 'Follicular Phase',
    shortLabel: 'Follicular',
    color: '#FFC94D',
    gradient: ['#FFFFFF', '#FFF8E0', '#FFE7A1'],
    emoji: '🌼',
    description:
      'FSH gently coaxes follicles to grow while estrogen rebuilds the uterine lining. Energy and creativity typically climb — a great time to plan and learn.',
    summary: 'Fresh start — follicles grow and the lining rebuilds.',
  },
  ovulation: {
    label: 'Ovulation Phase',
    shortLabel: 'Ovulation',
    color: '#4A90E2',
    gradient: ['#FFFFFF', '#E3F1FF', '#4A90E2'],
    emoji: '💧',
    description:
      'LH surges and a mature egg is released. Cervical fluid is clear and stretchy, libido may peak, and this is the most fertile moment of the cycle.',
    summary: 'Egg release — peak fertility for roughly 24 hours.',
  },
  luteal: {
    label: 'Luteal Phase',
    shortLabel: 'Luteal',
    color: '#AB47BC',
    gradient: ['#FFFFFF', '#F3E5F5', '#AB47BC'],
    emoji: '🌙',
    description:
      'Progesterone from the corpus luteum thickens the uterine lining in case of pregnancy. If conception doesn’t occur, hormone levels drop and PMS can appear.',
    summary: 'Wind-down — progesterone peaks, then gently falls toward the next period.',
  },
};

export function getPhasePaletteColor(phase: PhaseKey): string {
  return PHASE_PALETTE[phase].color;
}

export function getPhaseGradient(phase: PhaseKey): [string, string, string] {
  return PHASE_PALETTE[phase].gradient;
}

