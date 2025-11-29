import { Period, UserSettings } from './api';

export type CyclePhase = 'period' | 'fertile' | 'pms' | 'normal' | 'predicted_period';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type DetailedPhaseKey = 'menstrual' | 'follicular' | 'ovulation' | 'luteal';

export interface DetailedPhaseInfo {
  phase: DetailedPhaseKey;
  isPredicted: boolean;
  phaseStart: Date | null;
  phaseEnd: Date | null;
}

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

export function buildEffectivePeriods(
  periods: Period[],
  settings?: UserSettings | null
): Period[] {
  if (!settings || periods.length > 0 || !settings.lastPeriodDate) {
    return periods;
  }

  const start = new Date(settings.lastPeriodDate);
  if (Number.isNaN(start.getTime())) {
    return periods;
  }
  start.setHours(0, 0, 0, 0);

  const length = Math.max(
    1,
    settings.periodDuration ?? settings.averagePeriodLength ?? 5
  );
  const end = new Date(start);
  end.setDate(end.getDate() + length - 1);
  end.setHours(0, 0, 0, 0);

  const timestamp =
    settings.updatedAt ?? settings.createdAt ?? new Date().toISOString();

  const fallbackPeriod: Period = {
    id: 'settings-fallback',
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    flowLevel: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return [fallbackPeriod];
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
    const lastPeriodDate = settings?.lastPeriodDate
      ? new Date(settings.lastPeriodDate)
      : null;

    if (!lastPeriodDate) {
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

    lastPeriodDate.setHours(0, 0, 0, 0);

    let nextPeriodDate = new Date(lastPeriodDate);
    nextPeriodDate.setDate(nextPeriodDate.getDate() + cycleLength);
    nextPeriodDate.setHours(0, 0, 0, 0);

    while (nextPeriodDate.getTime() <= today.getTime()) {
      nextPeriodDate.setDate(nextPeriodDate.getDate() + cycleLength);
    }

    const ovulationDate = new Date(nextPeriodDate);
    ovulationDate.setDate(ovulationDate.getDate() - 14);
    ovulationDate.setHours(0, 0, 0, 0);

    const fertileWindowStart = new Date(ovulationDate);
    fertileWindowStart.setDate(fertileWindowStart.getDate() - 5);
    fertileWindowStart.setHours(0, 0, 0, 0);

    const fertileWindowEnd = new Date(ovulationDate);
    fertileWindowEnd.setHours(23, 59, 59, 999);

    const pmsStart = new Date(nextPeriodDate);
    pmsStart.setDate(pmsStart.getDate() - 5);
    pmsStart.setHours(0, 0, 0, 0);

    const pmsEnd = new Date(nextPeriodDate);
    pmsEnd.setDate(pmsEnd.getDate() - 1);
    pmsEnd.setHours(23, 59, 59, 999);

    return {
      nextPeriodDate,
      ovulationDate,
      fertileWindowStart,
      fertileWindowEnd,
      pmsStart,
      pmsEnd,
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
    const cyclesSinceLastPeriod = Math.floor(daysSinceLastPeriodStart / finalCycleLength);
    
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

function normalise(date: Date | null): Date | null {
  if (!date) return null;
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
}

function resolvePeriodEnd(period: Period, fallbackLength: number): Date {
  // Always use the current period length setting, not the stored endDate
  // This ensures periods display consistently with the user's current preference
  // If period length is 5, we want days: start, start+1, start+2, start+3, start+4 (5 days total)
  // So end = start + (length - 1)
  const assumedEnd = new Date(period.startDate);
  assumedEnd.setHours(0, 0, 0, 0);
  // Subtract 1 because if length is 5, we want 5 days: day 0, 1, 2, 3, 4 (which is start + 4)
  const daysToAdd = Math.max(1, fallbackLength) - 1;
  assumedEnd.setDate(assumedEnd.getDate() + daysToAdd);
  // Set to end of day to ensure we include the full last day
  assumedEnd.setHours(23, 59, 59, 999);
  return assumedEnd;
}

export function getPhaseDetailsForDate(
  date: Date,
  periods: Period[],
  predictions: CyclePredictions,
  settings: UserSettings | null = null
): DetailedPhaseInfo | null {
  const dayDate = new Date(date);
  dayDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const effectivePeriodLength = Math.max(
    1,
    predictions?.periodLength || settings?.averagePeriodLength || 5
  );

  const sortedPeriods = [...periods].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );

  const fallbackPeriodStart = settings?.lastPeriodDate
    ? normalise(new Date(settings.lastPeriodDate))
    : null;
  const fallbackPeriodEnd = fallbackPeriodStart
    ? (() => {
        const end = new Date(fallbackPeriodStart);
        end.setDate(end.getDate() + effectivePeriodLength - 1);
        return end;
      })()
    : null;

  const lastRecordedPeriod = sortedPeriods[0] || null;
  const lastPeriodStart = lastRecordedPeriod
    ? normalise(new Date(lastRecordedPeriod.startDate))
    : fallbackPeriodStart;
  const lastPeriodEnd = lastRecordedPeriod
    ? resolvePeriodEnd(lastRecordedPeriod, effectivePeriodLength)
    : fallbackPeriodEnd;

  // 1. Check for actual logged periods first (works for past and present)
  if (sortedPeriods.length > 0) {
    for (const period of sortedPeriods) {
      const start = normalise(new Date(period.startDate));
      const end = resolvePeriodEnd(period, effectivePeriodLength);
      // resolvePeriodEnd already sets end to 23:59:59:999, so we can use it directly
      if (start && dayDate >= start && dayDate <= end) {
        return {
          phase: 'menstrual',
          isPredicted: dayDate >= today,
          phaseStart: start,
          phaseEnd: end,
        };
      }
    }
  }

  // Check fallback period (from settings) if no logged periods
  if (sortedPeriods.length === 0 && fallbackPeriodStart && fallbackPeriodEnd) {
    if (dayDate >= fallbackPeriodStart && dayDate <= fallbackPeriodEnd) {
      return {
        phase: 'menstrual',
        isPredicted: dayDate >= today,
        phaseStart: fallbackPeriodStart,
        phaseEnd: fallbackPeriodEnd,
      };
    }
  }

  // 2. For PAST dates (before today) without logged periods - return null (no phase)
  if (dayDate < today) {
    return null;
  }

  // Determine if date is in current month or future months
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  currentMonth.setHours(0, 0, 0, 0);
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  nextMonth.setHours(0, 0, 0, 0);
  const dayMonth = new Date(dayDate.getFullYear(), dayDate.getMonth(), 1);
  dayMonth.setHours(0, 0, 0, 0);
  const isCurrentMonth = dayMonth.getTime() === currentMonth.getTime();
  const isFutureMonth = dayMonth.getTime() >= nextMonth.getTime();

  // 3. Check for predicted periods (menstrual phase)
  const predictedPeriods = generatePredictedPeriods(periods, settings, 6);
  let isPredictedPeriod = false;
  for (const predictedPeriod of predictedPeriods) {
    const predictedStart = normalise(predictedPeriod.startDate);
    const predictedEnd = normalise(predictedPeriod.endDate);
    if (predictedStart && predictedEnd && dayDate >= predictedStart && dayDate <= predictedEnd) {
      isPredictedPeriod = true;
      // For current month, still return predicted period
      // For future months, only return predicted periods
      if (isCurrentMonth || isFutureMonth) {
        return {
          phase: 'menstrual',
          isPredicted: true,
          phaseStart: predictedStart,
          phaseEnd: predictedEnd,
        };
      }
    }
  }

  // 4. For FUTURE months (beyond current month) - ONLY show predicted periods, no other phases
  if (isFutureMonth) {
    return null; // No phase info for future months except predicted periods (already checked above)
  }

  // 5. For CURRENT month only - show full cycle phases (for educational purposes)
  if (isCurrentMonth) {
    // Calculate cycle phases for current month
    const nextPeriodStart = predictions.nextPeriodDate
      ? normalise(predictions.nextPeriodDate)
      : null;

    // Calculate ovulation date - use predictions if available, otherwise estimate
    let ovulationDate = predictions.ovulationDate
      ? normalise(predictions.ovulationDate)
      : null;

    // If no ovulation date in predictions, estimate it (typically 14 days before next period)
    if (!ovulationDate && nextPeriodStart) {
      ovulationDate = new Date(nextPeriodStart);
      ovulationDate.setDate(ovulationDate.getDate() - 14);
      ovulationDate.setHours(0, 0, 0, 0);
    }

    // Check for fertile window FIRST (5 days before ovulation to ovulation day)
    // This includes the ovulation day itself
    if (ovulationDate) {
      const fertileStart = new Date(ovulationDate);
      fertileStart.setDate(fertileStart.getDate() - 5);
      fertileStart.setHours(0, 0, 0, 0);
      const fertileEnd = new Date(ovulationDate);
      fertileEnd.setHours(23, 59, 59, 999);

      if (dayDate >= fertileStart && dayDate <= fertileEnd) {
        return {
          phase: 'ovulation', // Using ovulation phase for fertile window
          isPredicted: true,
          phaseStart: fertileStart,
          phaseEnd: fertileEnd,
        };
      }
    }

    // Check for ovulation day specifically (if not already caught by fertile window)
    if (ovulationDate && dayDate.getTime() === ovulationDate.getTime()) {
      return {
        phase: 'ovulation',
        isPredicted: true,
        phaseStart: ovulationDate,
        phaseEnd: ovulationDate,
      };
    }

    // Check for luteal phase (after ovulation, before next period)
    if (ovulationDate && nextPeriodStart) {
      const lutealStart = new Date(ovulationDate);
      lutealStart.setDate(lutealStart.getDate() + 1);
      lutealStart.setHours(0, 0, 0, 0);
      const lutealEnd = new Date(nextPeriodStart);
      lutealEnd.setDate(lutealEnd.getDate() - 1);
      lutealEnd.setHours(23, 59, 59, 999);

      if (dayDate >= lutealStart && dayDate <= lutealEnd) {
        return {
          phase: 'luteal',
          isPredicted: true,
          phaseStart: lutealStart,
          phaseEnd: lutealEnd,
        };
      }
    }

    // Check for follicular phase (after last period end, before ovulation)
    if (lastPeriodEnd && ovulationDate && dayDate > lastPeriodEnd && dayDate < ovulationDate) {
      const follicularStart = new Date(lastPeriodEnd);
      follicularStart.setDate(follicularStart.getDate() + 1);
      follicularStart.setHours(0, 0, 0, 0);
      const follicularEnd = new Date(ovulationDate);
      follicularEnd.setDate(follicularEnd.getDate() - 1);
      follicularEnd.setHours(23, 59, 59, 999);
      return {
        phase: 'follicular',
        isPredicted: true,
        phaseStart: follicularStart,
        phaseEnd: follicularEnd,
      };
    }

    // If we have a next period but no ovulation date, calculate phases
    // Ovulation typically occurs 14 days before next period
    if (lastPeriodEnd && nextPeriodStart) {
      const estimatedOvulation = new Date(nextPeriodStart);
      estimatedOvulation.setDate(estimatedOvulation.getDate() - 14);
      estimatedOvulation.setHours(0, 0, 0, 0);

      // Follicular phase: after period ends, before ovulation
      if (dayDate > lastPeriodEnd && dayDate < estimatedOvulation) {
        const follicularStart = new Date(lastPeriodEnd);
        follicularStart.setDate(follicularStart.getDate() + 1);
        follicularStart.setHours(0, 0, 0, 0);
        const follicularEnd = new Date(estimatedOvulation);
        follicularEnd.setDate(follicularEnd.getDate() - 1);
        follicularEnd.setHours(23, 59, 59, 999);
        return {
          phase: 'follicular',
          isPredicted: true,
          phaseStart: follicularStart,
          phaseEnd: follicularEnd,
        };
      }

      // Ovulation day (estimated)
      if (dayDate.getTime() === estimatedOvulation.getTime()) {
        return {
          phase: 'ovulation',
          isPredicted: true,
          phaseStart: estimatedOvulation,
          phaseEnd: estimatedOvulation,
        };
      }

      // Luteal phase: after ovulation, before next period
      if (dayDate > estimatedOvulation && dayDate < nextPeriodStart) {
        const lutealStart = new Date(estimatedOvulation);
        lutealStart.setDate(lutealStart.getDate() + 1);
        lutealStart.setHours(0, 0, 0, 0);
        const lutealEnd = new Date(nextPeriodStart);
        lutealEnd.setDate(lutealEnd.getDate() - 1);
        lutealEnd.setHours(23, 59, 59, 999);
        return {
          phase: 'luteal',
          isPredicted: true,
          phaseStart: lutealStart,
          phaseEnd: lutealEnd,
        };
      }
    }

    // Default fallback for current month - ensure all dates get a phase
    // If we have period data, assign phases based on cycle position
    if (lastPeriodEnd) {
      // If date is after last period end, it should be in follicular, ovulation, or luteal
      if (dayDate > lastPeriodEnd) {
        // Try to estimate based on cycle length
        const cycleLength = settings?.averageCycleLength || 28;
        const daysSincePeriodEnd = Math.floor((dayDate.getTime() - lastPeriodEnd.getTime()) / (1000 * 60 * 60 * 24));
        
        // Estimate ovulation around day 14 of cycle (from period start)
        const estimatedOvulationDay = 14;
        const periodLength = settings?.averagePeriodLength || 5;
        const daysFromPeriodStart = daysSincePeriodEnd + periodLength;
        
        if (daysFromPeriodStart < estimatedOvulationDay - 5) {
          // Follicular phase (before fertile window)
          return {
            phase: 'follicular',
            isPredicted: true,
            phaseStart: new Date(lastPeriodEnd.getTime() + 24 * 60 * 60 * 1000),
            phaseEnd: nextPeriodStart || null,
          };
        } else if (daysFromPeriodStart >= estimatedOvulationDay - 5 && daysFromPeriodStart <= estimatedOvulationDay) {
          // Ovulation/fertile window
          return {
            phase: 'ovulation',
            isPredicted: true,
            phaseStart: new Date(lastPeriodEnd.getTime() + (estimatedOvulationDay - periodLength - 5) * 24 * 60 * 60 * 1000),
            phaseEnd: new Date(lastPeriodEnd.getTime() + (estimatedOvulationDay - periodLength) * 24 * 60 * 60 * 1000),
          };
        } else {
          // Luteal phase (after ovulation)
          return {
            phase: 'luteal',
            isPredicted: true,
            phaseStart: new Date(lastPeriodEnd.getTime() + (estimatedOvulationDay - periodLength + 1) * 24 * 60 * 60 * 1000),
            phaseEnd: nextPeriodStart || null,
          };
        }
      } else if (dayDate <= lastPeriodEnd) {
        // Date is during or right after period - should be menstrual (already handled above)
        // But if we reach here, it means it's not a logged period, so return null
        return null;
      }
    }
    
    // If we have next period but no last period end, estimate from next period
    if (nextPeriodStart && !lastPeriodEnd) {
      const estimatedOvulation = new Date(nextPeriodStart);
      estimatedOvulation.setDate(estimatedOvulation.getDate() - 14);
      estimatedOvulation.setHours(0, 0, 0, 0);
      
      if (dayDate < estimatedOvulation) {
        return {
          phase: 'follicular',
          isPredicted: true,
          phaseStart: null,
          phaseEnd: estimatedOvulation,
        };
      } else if (dayDate.getTime() === estimatedOvulation.getTime()) {
        return {
          phase: 'ovulation',
          isPredicted: true,
          phaseStart: estimatedOvulation,
          phaseEnd: estimatedOvulation,
        };
      } else if (dayDate < nextPeriodStart) {
        return {
          phase: 'luteal',
          isPredicted: true,
          phaseStart: new Date(estimatedOvulation.getTime() + 24 * 60 * 60 * 1000),
          phaseEnd: nextPeriodStart,
        };
      }
    }
  }

  // If no period data at all, return null
  return null;
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

  const phaseDetails = getPhaseDetailsForDate(dayDate, periods, predictions, null);

  // Handle null phase details (no phase information available)
  if (!phaseDetails) {
    return {
      date: dayDate,
      phase: 'normal',
      confidence: predictions.confidence,
      isPeriod: false,
      isFertile: false,
      isPMS: false,
      isPredicted: false,
    };
  }

  switch (phaseDetails.phase) {
    case 'menstrual':
      return {
        date: dayDate,
        phase: phaseDetails.isPredicted ? 'predicted_period' : 'period',
        confidence: predictions.confidence,
        isPeriod: !phaseDetails.isPredicted,
        isFertile: false,
        isPMS: false,
        isPredicted: phaseDetails.isPredicted,
      };
    case 'ovulation':
      return {
        date: dayDate,
        phase: 'fertile',
        confidence: predictions.confidence,
        isPeriod: false,
        isFertile: true,
        isPMS: false,
        isPredicted: phaseDetails.isPredicted,
      };
    case 'luteal':
      return {
        date: dayDate,
        phase: 'pms',
        confidence: predictions.confidence,
        isPeriod: false,
        isFertile: false,
        isPMS: true,
        isPredicted: phaseDetails.isPredicted,
      };
    case 'follicular':
    default:
      return {
        date: dayDate,
        phase: 'normal',
        confidence: predictions.confidence,
        isPeriod: false,
        isFertile: false,
        isPMS: false,
        isPredicted: phaseDetails.isPredicted,
      };
  }
}

/**
 * Generate future predicted period ranges based on existing history.
 */
export interface PredictedPeriodRange {
  startDate: Date;
  endDate: Date;
}

export function generatePredictedPeriods(
  periods: Period[],
  settings: UserSettings | null,
  monthsAhead = 6
): PredictedPeriodRange[] {
  const fallbackPeriods = buildEffectivePeriods(periods, settings);
  const referencePeriods = periods.length > 0 ? periods : fallbackPeriods;

  if (referencePeriods.length === 0) {
    return [];
  }

  const sorted = [...referencePeriods].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );

  const lastStart = new Date(sorted[0].startDate);
  lastStart.setHours(0, 0, 0, 0);

  const fallbackCycleLength = settings?.averageCycleLength ?? 28;
  let cycleLength = fallbackCycleLength;

  if (sorted.length >= 2) {
    let total = 0;
    let count = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = new Date(sorted[i].startDate);
      const next = new Date(sorted[i + 1].startDate);
      current.setHours(0, 0, 0, 0);
      next.setHours(0, 0, 0, 0);
      const diff = Math.round(
        (current.getTime() - next.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (diff > 0) {
        total += diff;
        count += 1;
      }
    }
    if (count > 0) {
      cycleLength = Math.max(1, Math.round(total / count));
    }
  }

  // Always use the current period length setting from user settings
  // Don't calculate from stored endDate as it may be outdated
  const periodLength = settings?.averagePeriodLength ?? settings?.periodDuration ?? 5;

  // Calculate target date (6 months from today)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const targetDate = new Date(today);
  targetDate.setMonth(targetDate.getMonth() + monthsAhead);
  targetDate.setHours(23, 59, 59, 999);

  const results: PredictedPeriodRange[] = [];
  let anchor = new Date(lastStart);
  let generated = 0;
  const safetyLimit = 100; // Safety limit to prevent infinite loops

  // Generate predictions until we reach the target date
  while (generated < safetyLimit) {
    anchor.setDate(anchor.getDate() + cycleLength);
    anchor.setHours(0, 0, 0, 0);

    // Stop if we've gone past the target date
    if (anchor.getTime() > targetDate.getTime()) {
      break;
    }

    const end = new Date(anchor);
    end.setDate(end.getDate() + periodLength - 1);
    end.setHours(23, 59, 59, 999);

    results.push({
      startDate: new Date(anchor),
      endDate: end,
    });

    generated += 1;
  }

  return results;
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
    // Always use calculated end date based on current period length setting, not stored endDate
    const end = new Date(period.startDate);
    end.setHours(0, 0, 0, 0);
    // Calculate end date: if period length is 5, days are 0,1,2,3,4 (5 days total)
    // So we add (periodLength - 1) to get the last day
    const daysToAdd = Math.max(1, fallbackPeriodLength) - 1;
    end.setDate(end.getDate() + daysToAdd);
    end.setHours(23, 59, 59, 999); // Set to end of day to include the full last day
    
    // Double-check: dayDate should be >= start and <= end
    // If periodLength is 5 and start is Nov 22, end should be Nov 26 23:59:59:999
    // Nov 27 00:00:00 should NOT match (27 > 26.999...)
    const isWithinPeriod = dayDate >= start && dayDate <= end;
    
    // Additional safety check: calculate the day difference
    const dayDiff = Math.floor((dayDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    // Day difference should be 0 to (periodLength - 1)
    if (dayDiff < 0 || dayDiff >= fallbackPeriodLength) {
      return false; // Date is outside the period range
    }
    
    return isWithinPeriod;
  });

  if (!currentPeriod) {
    return null;
  }

  const startDate = new Date(currentPeriod.startDate);
  startDate.setHours(0, 0, 0, 0);
  // Always calculate end date based on current period length setting, not stored endDate
  const endDate = new Date(currentPeriod.startDate);
  endDate.setHours(0, 0, 0, 0);
  // Calculate end date: if period length is 5, days are 0,1,2,3,4 (5 days total)
  endDate.setDate(endDate.getDate() + Math.max(1, fallbackPeriodLength) - 1);
  endDate.setHours(23, 59, 59, 999); // Set to end of day

  const diff = Math.floor((dayDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const dayNumber = diff + 1;
  // Calculate period length: if start is Nov 22 and end is Nov 26 23:59:59:999
  // The difference in days is 4, but we have 5 days total (22, 23, 24, 25, 26)
  // So periodLength = fallbackPeriodLength (we already calculated it correctly)
  const periodLength = Math.max(1, fallbackPeriodLength);
  
  // Ensure dayNumber doesn't exceed periodLength
  if (dayNumber > periodLength) {
    return null; // This date is beyond the period end
  }

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

