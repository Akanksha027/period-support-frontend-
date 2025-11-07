import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { getPeriods, getSettings } from '../lib/api';
import { calculatePredictions, getPhaseDetailsForDate } from '../lib/periodCalculations';
import type { Period, UserSettings } from '../lib/api';
import { PHASE_PALETTE, PhaseKey } from '../constants/phasePalette';

type PhaseContextType = {
  phase: PhaseKey;
  phaseColors: {
    tabBackground: string;
    tabBorder: string;
    tabActiveBackground: string;
    tabIcon: string;
    tabActiveIcon: string;
    chatButtonGradient: string[];
  };
};

const PhaseContext = createContext<PhaseContextType>({
  phase: 'follicular',
  phaseColors: {
    tabBackground: 'rgba(100, 181, 246, 0.25)',
    tabBorder: 'rgba(100, 181, 246, 0.45)',
    tabActiveBackground: 'rgba(100, 181, 246, 0.9)',
    tabIcon: '#1E88E5',
    tabActiveIcon: '#FFFFFF',
    chatButtonGradient: ['#64B5F6', '#1E88E5'],
  },
});

export const usePhase = () => useContext(PhaseContext);

function buildPhaseColors(phase: PhaseKey) {
  const palette = PHASE_PALETTE[phase];
  return {
    tabBackground: `${palette.color}20`,
    tabBorder: `${palette.color}80`,
    tabActiveBackground: `${palette.color}`,
    tabIcon: palette.color,
    tabActiveIcon: '#FFFFFF',
    chatButtonGradient: palette.gradient,
  };
}

export const PhaseProvider = ({ children }: { children: ReactNode }) => {
  const [phase, setPhase] = useState<PhaseKey>('follicular');
  const [periods, setPeriods] = useState<Period[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const predictions = useMemo(() => {
    return calculatePredictions(periods, settings);
  }, [periods, settings]);

  useEffect(() => {
    if (isLoading) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const phaseDetails = getPhaseDetailsForDate(today, periods, predictions, settings ?? undefined);
    setPhase(phaseDetails.phase);
  }, [periods, predictions, isLoading, settings]);

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        const [periodsData, settingsData] = await Promise.all([
          getPeriods().catch(() => []),
          getSettings().catch(() => null),
        ]);

        if (mounted) {
          setPeriods(periodsData);
          setSettings(settingsData);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Error loading phase data:', error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, []);

  const phaseColors = useMemo(() => buildPhaseColors(phase), [phase]);

  const value = useMemo<PhaseContextType>(
    () => ({
      phase,
      phaseColors,
    }),
    [phase, phaseColors]
  );

  return <PhaseContext.Provider value={value}>{children}</PhaseContext.Provider>;
};

