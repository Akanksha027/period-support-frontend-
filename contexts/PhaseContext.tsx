import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback } from 'react';
import { getPeriods, getSettings } from '../lib/api';
import { calculatePredictions, getDayInfo } from '../lib/periodCalculations';
import type { Period, UserSettings } from '../lib/api';

type Phase = 'Period Phase' | 'Ovulation Phase' | 'Luteal Phase' | 'Follicular Phase';

interface PhaseContextType {
  phase: Phase;
  phaseColors: {
    tabBackground: string;
    tabBorder: string;
    tabActiveBackground: string;
    tabIcon: string;
    tabActiveIcon: string;
    chatButtonGradient: string[];
  };
}

const PhaseContext = createContext<PhaseContextType>({
  phase: 'Follicular Phase',
  phaseColors: {
    tabBackground: 'rgba(255, 213, 79, 0.7)',
    tabBorder: 'rgba(255, 213, 79, 0.95)',
    tabActiveBackground: 'rgba(255, 213, 79, 1)',
    tabIcon: 'rgba(184, 134, 11, 1)',
    tabActiveIcon: '#FFFFFF',
    chatButtonGradient: ['#FFD700', '#FFA500'],
  },
});

export const usePhase = () => useContext(PhaseContext);

const PHASE_COLORS = {
  'Period Phase': {
    tabBackground: 'rgba(255, 80, 120, 0.8)',
    tabBorder: 'rgba(255, 80, 120, 0.95)',
    tabActiveBackground: 'rgba(255, 80, 120, 1)',
    tabIcon: 'rgba(180, 20, 60, 1)',
    tabActiveIcon: '#FFFFFF',
    chatButtonGradient: ['#FF5078', '#E91E63'],
  },
  'Ovulation Phase': {
    tabBackground: 'rgba(135, 206, 250, 0.8)',
    tabBorder: 'rgba(135, 206, 250, 0.95)',
    tabActiveBackground: 'rgba(135, 206, 250, 1)',
    tabIcon: 'rgba(30, 144, 255, 1)',
    tabActiveIcon: '#FFFFFF',
    chatButtonGradient: ['#87CEEB', '#1E90FF'],
  },
  'Luteal Phase': {
    tabBackground: 'rgba(144, 238, 144, 0.8)',
    tabBorder: 'rgba(144, 238, 144, 0.95)',
    tabActiveBackground: 'rgba(144, 238, 144, 1)',
    tabIcon: 'rgba(60, 179, 113, 1)',
    tabActiveIcon: '#FFFFFF',
    chatButtonGradient: ['#90EE90', '#3CB371'],
  },
  'Follicular Phase': {
    tabBackground: 'rgba(255, 213, 79, 0.8)',
    tabBorder: 'rgba(255, 213, 79, 0.95)',
    tabActiveBackground: 'rgba(255, 213, 79, 1)',
    tabIcon: 'rgba(184, 134, 11, 1)',
    tabActiveIcon: '#FFFFFF',
    chatButtonGradient: ['#FFD700', '#FFA500'],
  },
} as const;

export const PhaseProvider = ({ children }: { children: ReactNode }) => {
  const [phase, setPhase] = useState<Phase>('Follicular Phase');
  const [periods, setPeriods] = useState<Period[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Memoize predictions to avoid recalculation
  const predictions = useMemo(() => {
    return calculatePredictions(periods, settings);
  }, [periods, settings]);

  // Calculate phase based on today's date (optimized)
  useEffect(() => {
    if (isLoading) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayInfo = getDayInfo(today, periods, predictions);

    let newPhase: Phase;
    if (dayInfo.isPeriod) {
      newPhase = 'Period Phase';
    } else if (dayInfo.isFertile) {
      newPhase = 'Ovulation Phase';
    } else if (dayInfo.isPMS) {
      newPhase = 'Luteal Phase';
    } else {
      newPhase = 'Follicular Phase';
    }

    // Only update if phase actually changed
    setPhase((prev) => (prev !== newPhase ? newPhase : prev));
  }, [periods, predictions, isLoading]);

  // Load data once on mount (optimized - no interval)
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

  // Memoize phase colors to avoid recalculation
  const phaseColors = useMemo(() => {
    return PHASE_COLORS[phase];
  }, [phase]);

  const value: PhaseContextType = useMemo(
    () => ({
      phase,
      phaseColors,
    }),
    [phase, phaseColors]
  );

  return <PhaseContext.Provider value={value}>{children}</PhaseContext.Provider>;
};

