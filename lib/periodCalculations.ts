import { Period, UserSettings } from './api';

export type CyclePhase = 'period' | 'fertile' | 'pms' | 'normal' | 'predicted_period';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface DayInfo {
  date: Date;
  phase: CyclePhase;
  confidence: ConfidenceLevel;
  isPeriod: boolean;
  isFertile: boolean;
  isPMS: boolean;
  isPredicted: boolean;
}

export interface CyclePredictions {
  nextPeriodDate: Date | null;
  ovulationDate: Date | null;
  fertileWindowStart: Date | null;
  fertileWindowEnd: Date | null;
  pmsStart: Date | null;
  pmsEnd: Date | null;
  cycleLength: number;
  periodLength: number;
  confidence: ConfidenceLevel;
}

/**
 * Calculate cycle predictions based on period history (optimized)
 */
export function calculatePredictions(
  periods: Period[],
  settings: UserSettings | null
): CyclePredictions {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // If no periods, use settings defaults with low confidence
  if (periods.length === 0) {
    const cycleLength = settings?.averageCycleLength ?? 28;
    const periodLength = settings?.averagePeriodLength ?? 5;
    
    return {
      nextPeriodDate: null,
      ovulationDate: null,
      fertileWindowStart: null,
      fertileWindowEnd: null,
      pmsStart: null,
      pmsEnd: null,
      cycleLength,
      periodLength,
      confidence: 'low',
    };
  }

  // Get the most recent period
  const sortedPeriods = [...periods].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );
  const lastPeriod = sortedPeriods[0];
  const lastPeriodStart = new Date(lastPeriod.startDate);
  lastPeriodStart.setHours(0, 0, 0, 0);

  // Calculate average cycle length from history
  let totalCycleDays = 0;
  let cycleCount = 0;

  for (let i = 0; i < sortedPeriods.length - 1; i++) {
    const current = new Date(sortedPeriods[i].startDate);
    const next = new Date(sortedPeriods[i + 1].startDate);
    current.setHours(0, 0, 0, 0);
    next.setHours(0, 0, 0, 0);
    const diff = Math.abs(next.getTime() - current.getTime());
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    totalCycleDays += days;
    cycleCount++;
  }

  const avgCycleLength =
    cycleCount > 0
      ? Math.round(totalCycleDays / cycleCount)
      : (settings?.averageCycleLength || 28);
  
  const finalCycleLength = avgCycleLength > 0 ? avgCycleLength : 28;

  // Calculate average period length
  let totalPeriodDays = 0;
  let periodCount = 0;

  for (const period of sortedPeriods) {
    if (period.endDate) {
      const start = new Date(period.startDate);
      const end = new Date(period.endDate);
      const diff = Math.abs(end.getTime() - start.getTime());
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
      totalPeriodDays += days;
      periodCount++;
    } else {
      totalPeriodDays += settings?.averagePeriodLength || 5;
      periodCount++;
    }
  }

  const avgPeriodLength =
    periodCount > 0
      ? Math.round(totalPeriodDays / periodCount)
      : settings?.averagePeriodLength || 5;

  // Predict next period - calculate from START of last period
  // Cycle length is measured from the start of one period to the start of the next period
  let nextPeriodDate = new Date(lastPeriodStart);
  nextPeriodDate.setDate(nextPeriodDate.getDate() + finalCycleLength);
  nextPeriodDate.setHours(0, 0, 0, 0);
  
  // If the predicted next period date is in the past, calculate the next future period
  const todayCheck = new Date();
  todayCheck.setHours(0, 0, 0, 0);
  
  if (nextPeriodDate.getTime() <= todayCheck.getTime()) {
    // Calculate how many full cycles have passed since the last period start
    const daysSinceLastPeriodStart = Math.floor((todayCheck.getTime() - lastPeriodStart.getTime()) / (1000 * 60 * 60 * 24));
    const cyclesSinceLastPeriod = Math.floor(daysSinceLastPeriod / finalCycleLength);
    
    // Calculate the next period start date
    const nextCycleStart = new Date(lastPeriodStart);
    nextCycleStart.setDate(nextCycleStart.getDate() + (cyclesSinceLastPeriod + 1) * finalCycleLength);
    nextPeriodDate = nextCycleStart;
    nextPeriodDate.setHours(0, 0, 0, 0);
  }

  // Calculate ovulation - typically occurs 14 days before the next period
  // This gives us the ovulation date for the current cycle
  const ovulationDate = new Date(nextPeriodDate);
  ovulationDate.setDate(ovulationDate.getDate() - 14);
  ovulationDate.setHours(0, 0, 0, 0);

  // Fertile window - typically 5 days before ovulation through ovulation day
  // This is when conception is most likely
  const fertileWindowStart = new Date(ovulationDate);
  fertileWindowStart.setDate(fertileWindowStart.getDate() - 5);
  fertileWindowStart.setHours(0, 0, 0, 0);

  const fertileWindowEnd = new Date(ovulationDate);
  fertileWindowEnd.setHours(23, 59, 59, 999);

  // PMS window
  const pmsStart = new Date(nextPeriodDate);
  pmsStart.setDate(pmsStart.getDate() - 5);
  pmsStart.setHours(0, 0, 0, 0);

  const pmsEnd = new Date(nextPeriodDate);
  pmsEnd.setDate(pmsEnd.getDate() - 1);
  pmsEnd.setHours(23, 59, 59, 999);

  // Confidence
  let confidence: ConfidenceLevel = 'low';
  if (cycleCount >= 3) {
    confidence = 'high';
  } else if (cycleCount >= 1) {
    confidence = 'medium';
  }

  return {
    nextPeriodDate,
    ovulationDate,
    fertileWindowStart,
    fertileWindowEnd,
    pmsStart,
    pmsEnd,
    cycleLength: finalCycleLength,
    periodLength: avgPeriodLength,
    confidence,
  };
}

/**
 * Get phase information for a specific date (optimized)
 */
export function getDayInfo(
  date: Date,
  periods: Period[],
  predictions: CyclePredictions
): DayInfo {
  const dayDate = new Date(date);
  dayDate.setHours(0, 0, 0, 0);

  const inferredPeriodLength = Math.max(1, predictions?.periodLength || 5);

  const resolvePeriodEnd = (period: Period) => {
    if (period.endDate) {
      const explicitEnd = new Date(period.endDate);
      explicitEnd.setHours(0, 0, 0, 0);
      return explicitEnd;
    }
    const assumedEnd = new Date(period.startDate);
    assumedEnd.setHours(0, 0, 0, 0);
    assumedEnd.setDate(assumedEnd.getDate() + inferredPeriodLength - 1);
    return assumedEnd;
  };

  // Check if it's an actual period day
  const isPeriod = periods.some((period) => {
    const start = new Date(period.startDate);
    start.setHours(0, 0, 0, 0);
    const end = resolvePeriodEnd(period);
    return dayDate >= start && dayDate <= end;
  });

  if (isPeriod) {
    return {
      date: dayDate,
      phase: 'period',
      confidence: 'high',
      isPeriod: true,
      isFertile: false,
      isPMS: false,
      isPredicted: false,
    };
  }

  // Check predicted period
  if (predictions.nextPeriodDate) {
    const predictedPeriodStart = new Date(predictions.nextPeriodDate);
    predictedPeriodStart.setHours(0, 0, 0, 0);
    const predictedPeriodEnd = new Date(predictedPeriodStart);
    predictedPeriodEnd.setDate(
      predictedPeriodEnd.getDate() + predictions.periodLength - 1
    );
    predictedPeriodEnd.setHours(23, 59, 59, 999);

    const dayTime = dayDate.getTime();
    const startTime = predictedPeriodStart.getTime();
    const endTime = predictedPeriodEnd.getTime();
    
    if (dayTime >= startTime && dayTime <= endTime) {
      return {
        date: dayDate,
        phase: 'predicted_period',
        confidence: predictions.confidence,
        isPeriod: false,
        isFertile: false,
        isPMS: false,
        isPredicted: true,
      };
    }
  }

  // Check fertile window
  if (
    predictions.fertileWindowStart &&
    predictions.fertileWindowEnd &&
    dayDate >= predictions.fertileWindowStart &&
    dayDate <= predictions.fertileWindowEnd
  ) {
    return {
      date: dayDate,
      phase: 'fertile',
      confidence: predictions.confidence,
      isPeriod: false,
      isFertile: true,
      isPMS: false,
      isPredicted: true,
    };
  }

  // Check PMS window
  if (
    predictions.pmsStart &&
    predictions.pmsEnd &&
    dayDate >= predictions.pmsStart &&
    dayDate <= predictions.pmsEnd
  ) {
    return {
      date: dayDate,
      phase: 'pms',
      confidence: predictions.confidence,
      isPeriod: false,
      isFertile: false,
      isPMS: true,
      isPredicted: true,
    };
  }

  return {
    date: dayDate,
    phase: 'normal',
    confidence: 'high',
    isPeriod: false,
    isFertile: false,
    isPMS: false,
    isPredicted: false,
  };
}

/**
 * Get period day information
 */
export function getPeriodDayInfo(
  date: Date,
  periods: Period[],
  fallbackPeriodLength = 5
): {
  dayNumber: number;
  dayLabel: string;
  periodLength: number;
  isStart: boolean;
  isMiddle: boolean;
  isEnd: boolean;
} | null {
  const dayDate = new Date(date);
  dayDate.setHours(0, 0, 0, 0);

  const currentPeriod = periods.find((period) => {
    const start = new Date(period.startDate);
    start.setHours(0, 0, 0, 0);
    const end = period.endDate
      ? new Date(period.endDate)
      : (() => {
          const assumed = new Date(period.startDate);
          assumed.setHours(0, 0, 0, 0);
          assumed.setDate(assumed.getDate() + Math.max(1, fallbackPeriodLength) - 1);
          return assumed;
        })();
    end.setHours(0, 0, 0, 0);
    return dayDate >= start && dayDate <= end;
  });

  if (!currentPeriod) {
    return null;
  }

  const startDate = new Date(currentPeriod.startDate);
  startDate.setHours(0, 0, 0, 0);
  const endDate = currentPeriod.endDate
    ? new Date(currentPeriod.endDate)
    : (() => {
        const assumed = new Date(currentPeriod.startDate);
        assumed.setHours(0, 0, 0, 0);
        assumed.setDate(assumed.getDate() + Math.max(1, fallbackPeriodLength) - 1);
        return assumed;
      })();
  endDate.setHours(0, 0, 0, 0);

  const diff = Math.floor((dayDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const dayNumber = diff + 1;
  const periodLength = Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  let dayLabel = '';
  if (dayNumber === 1) {
    dayLabel = '1st day';
  } else if (dayNumber === 2) {
    dayLabel = '2nd day';
  } else if (dayNumber === 3) {
    dayLabel = '3rd day';
  } else {
    dayLabel = `${dayNumber}th day`;
  }

  return {
    dayNumber,
    dayLabel,
    periodLength,
    isStart: dayNumber === 1,
    isMiddle: dayNumber > 1 && dayNumber < periodLength,
    isEnd: dayNumber === periodLength,
  };
}

/**
 * Get a supportive note for a phase
 */
export function getPhaseNote(phase: CyclePhase): string {
  switch (phase) {
    case 'period':
      return "Rest and be gentle with yourself. Your body is working hard 💕";
    case 'fertile':
      return "You're in your fertile window! Energy may be higher 🌟";
    case 'pms':
      return "Premenstrual phase - mood changes are normal and valid 🫶";
    case 'predicted_period':
      return "Predicted period day - listen to what your body needs";
    default:
      return "You're doing great! Keep tracking to know your cycle better ✨";
  }
}

