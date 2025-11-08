import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
  DeviceEventEmitter,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors } from '../../constants/Colors';
import { useAuth, useUser } from '@clerk/clerk-expo';
import {
  getPeriods,
  getSettings,
  createPeriod,
  deletePeriod,
  getSymptoms,
  getMoods,
  Period,
  UserSettings,
  Symptom,
  Mood,
  getCurrentViewModeRecord,
} from '../../lib/api';
import { buildCacheKey, getCachedData, setCachedData } from '../../lib/cache';
import { calculatePredictions, getDayInfo, getPeriodDayInfo, CyclePredictions, getPhaseDetailsForDate } from '../../lib/periodCalculations';
import { setClerkTokenGetter } from '../../lib/api';
import { Ionicons } from '@expo/vector-icons';
import { PHASE_PALETTE, PhaseKey } from '../../constants/phasePalette';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Helper function to get phase info for any date
function getPhaseInfoForDate(
  date: Date,
  periods: Period[],
  predictions: CyclePredictions,
  settings: UserSettings | null
): { phaseName: string; phaseDay: number } {
  const dayInfo = getDayInfo(date, periods, predictions);
  const sortedPeriods = [...periods].sort(
    (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
  );

  let phaseName = 'Cycle';
  let phaseDay = 1;

  if (sortedPeriods.length > 0) {
    const lastPeriodStart = new Date(sortedPeriods[0].startDate);
    lastPeriodStart.setHours(0, 0, 0, 0);
    const lastPeriodEnd = sortedPeriods[0].endDate
      ? new Date(sortedPeriods[0].endDate)
      : new Date(lastPeriodStart.getTime() + (settings?.averagePeriodLength || 5) * 24 * 60 * 60 * 1000);
    lastPeriodEnd.setHours(0, 0, 0, 0);

    const periodInfo = getPeriodDayInfo(
      date,
      periods,
      predictions.periodLength || settings?.averagePeriodLength || 5
    );
    if (dayInfo.isPeriod && periodInfo) {
      phaseName = 'Period';
      phaseDay = periodInfo.dayNumber;
    } else if (dayInfo.isFertile && predictions.fertileWindowStart) {
      phaseName = 'Ovulation';
      const fertileStart = new Date(predictions.fertileWindowStart);
      fertileStart.setHours(0, 0, 0, 0);
      const daysSinceFertileStart = Math.floor((date.getTime() - fertileStart.getTime()) / (1000 * 60 * 60 * 24));
      phaseDay = Math.max(1, daysSinceFertileStart + 1);
    } else if (dayInfo.isPMS && predictions.ovulationDate) {
      phaseName = 'Luteal';
      const ovulationDate = new Date(predictions.ovulationDate);
      ovulationDate.setHours(0, 0, 0, 0);
      const daysSinceOvulation = Math.floor((date.getTime() - ovulationDate.getTime()) / (1000 * 60 * 60 * 24));
      phaseDay = Math.max(1, daysSinceOvulation + 1);
    } else {
      phaseName = 'Follicular';
      const daysSincePeriodEnd = Math.floor((date.getTime() - lastPeriodEnd.getTime()) / (1000 * 60 * 60 * 24));
      phaseDay = Math.max(1, daysSincePeriodEnd + 1);
    }
  }

  return { phaseName, phaseDay };
}

export default function CalendarScreen() {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedDateSymptoms, setSelectedDateSymptoms] = useState<Symptom[]>([]);
  const [selectedDateMoods, setSelectedDateMoods] = useState<Mood[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [newPeriodDate, setNewPeriodDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const todaysLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

  // Use refs to avoid infinite loops
  const userRef = useRef(user);
  const isSignedInRef = useRef(isSignedIn);
  const getTokenRef = useRef(getToken);
  const loadingDataRef = useRef(false);

  // Update refs when values change
  useEffect(() => {
    userRef.current = user;
    isSignedInRef.current = isSignedIn;
    getTokenRef.current = getToken;
  }, [user, isSignedIn, getToken]);

  // Set up token getter
  useEffect(() => {
    if (getToken) {
      setClerkTokenGetter(getToken);
    }
  }, [getToken]);

  const predictions = useMemo<CyclePredictions>(() => {
    return calculatePredictions(periods, settings);
  }, [periods, settings]);

  const loadData = useCallback(async () => {
    if (loadingDataRef.current) {
      return;
    }

    if (!userRef.current || !isSignedInRef.current) {
      setLoading(false);
      return;
    }
    loadingDataRef.current = true;

    let showSpinner = !refreshing;

    try {
      const viewModeRecord = getCurrentViewModeRecord();
      const scopeIdentifier = viewModeRecord?.mode === 'OTHER'
        ? viewModeRecord?.viewedUserId ?? userRef.current?.id
        : userRef.current?.id;
      const cacheScope = buildCacheKey([
        viewModeRecord?.mode ?? 'UNKNOWN',
        scopeIdentifier ?? 'self',
      ]);

      const periodsCacheKey = buildCacheKey(['periods', cacheScope]);
      const settingsCacheKey = buildCacheKey(['settings', cacheScope]);

      const cachedPeriods = await getCachedData<Period[]>(periodsCacheKey);
      if (cachedPeriods !== undefined) {
        setPeriods(cachedPeriods);
        showSpinner = false;
      }

      const cachedSettings = await getCachedData<UserSettings | null>(settingsCacheKey);
      if (cachedSettings !== undefined) {
        setSettings(cachedSettings);
        showSpinner = false;
      }

      setLoading(showSpinner);

      const [periodsData, settingsData] = await Promise.all([
        getPeriods().catch(() => []),
        getSettings().catch(() => null),
      ]);
      setPeriods(periodsData);
      setSettings(settingsData);

      await setCachedData(periodsCacheKey, periodsData);
      await setCachedData(settingsCacheKey, settingsData);
    } catch (error: any) {
      if (error.response?.status !== 401) {
        console.error('[Calendar] Error loading data:', error);
      }
    } finally {
      setLoading(false);
      loadingDataRef.current = false;
    }
  }, [refreshing]);

  // Load moods & symptoms for selected date
  const loadLogsForDate = useCallback(async (date: Date) => {
    if (!user) return;

    let showSpinner = true;
    setLoadingLogs(true);
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const viewModeRecord = getCurrentViewModeRecord();
      const scopeIdentifier = viewModeRecord?.mode === 'OTHER'
        ? viewModeRecord?.viewedUserId ?? user.id
        : user.id;
      const cacheScope = buildCacheKey([
        viewModeRecord?.mode ?? 'UNKNOWN',
        scopeIdentifier ?? 'self',
      ]);

      const symptomsCacheKey = buildCacheKey([
        'calendar-symptoms',
        cacheScope,
        startOfDay.toISOString(),
        endOfDay.toISOString(),
      ]);
      const moodsCacheKey = buildCacheKey([
        'calendar-moods',
        cacheScope,
        startOfDay.toISOString(),
        endOfDay.toISOString(),
      ]);

      const cachedSymptoms = await getCachedData<Symptom[]>(symptomsCacheKey);
      if (cachedSymptoms !== undefined) {
        setSelectedDateSymptoms(cachedSymptoms);
        showSpinner = false;
      }

      const cachedMoods = await getCachedData<Mood[]>(moodsCacheKey);
      if (cachedMoods !== undefined) {
        setSelectedDateMoods(cachedMoods);
        showSpinner = false;
      }

      if (!showSpinner) {
        setLoadingLogs(false);
      }

      const [symptoms, moods] = await Promise.all([
        getSymptoms(startOfDay.toISOString(), endOfDay.toISOString()).catch(() => []),
        getMoods(startOfDay.toISOString(), endOfDay.toISOString()).catch(() => []),
      ]);
      setSelectedDateSymptoms(symptoms);
      setSelectedDateMoods(moods);

      await setCachedData(symptomsCacheKey, symptoms);
      await setCachedData(moodsCacheKey, moods);
    } catch (error: any) {
      console.error('[Calendar] Error loading logs:', error);
      setSelectedDateSymptoms([]);
      setSelectedDateMoods([]);
    } finally {
      setLoadingLogs(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && isSignedIn) {
      const timer = setTimeout(() => {
        loadData();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setLoading(false);
    }
  }, [user?.id, isSignedIn]);

  useFocusEffect(
    useCallback(() => {
      if (user && isSignedIn) {
        loadingDataRef.current = false;
        loadData();
      }
    }, [user?.id, isSignedIn, loadData])
  );

  const getDaysInMonth = useCallback((date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  }, []);

  const getDayStatus = useCallback(
    (date: Date) => {
      const normalizedDate = new Date(date);
      normalizedDate.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const startOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const startOfFollowingMonth = new Date(today.getFullYear(), today.getMonth() + 2, 1);

      const monthKey = new Date(normalizedDate.getFullYear(), normalizedDate.getMonth(), 1);
      const isCurrentMonth = monthKey.getTime() === startOfCurrentMonth.getTime();
      const isNextMonth = monthKey.getTime() === startOfNextMonth.getTime();
      const isBeforeCurrentMonth = monthKey.getTime() < startOfCurrentMonth.getTime();
      const isBeyondNextMonth = monthKey.getTime() >= startOfFollowingMonth.getTime();

      const fallbackPeriodLength = Math.max(1, predictions?.periodLength || settings?.averagePeriodLength || 5);

      const isActualPeriodDay = periods.some((period) => {
        const start = new Date(period.startDate);
        start.setHours(0, 0, 0, 0);
        const end = period.endDate
          ? new Date(period.endDate)
          : (() => {
              const assumed = new Date(period.startDate);
              assumed.setHours(0, 0, 0, 0);
              assumed.setDate(assumed.getDate() + fallbackPeriodLength - 1);
              return assumed;
            })();
        end.setHours(0, 0, 0, 0);
        return normalizedDate.getTime() >= start.getTime() && normalizedDate.getTime() <= end.getTime();
      });

      if (isActualPeriodDay) {
        return { phase: 'menstrual' as PhaseKey, color: PHASE_PALETTE.menstrual.color, isPredicted: false };
      }

      if (isBeforeCurrentMonth || isBeyondNextMonth) {
        return { phase: null, color: null, isPredicted: false };
      }

      let allowPredicted = false;
      if (isCurrentMonth) {
        allowPredicted = true;
      } else if (isNextMonth) {
        if (!predictions.nextPeriodDate) {
          allowPredicted = true;
        } else {
          const nextPeriod = new Date(predictions.nextPeriodDate);
          nextPeriod.setHours(0, 0, 0, 0);
          allowPredicted = normalizedDate.getTime() <= nextPeriod.getTime();
        }
      }

      if (!allowPredicted) {
        return { phase: null, color: null, isPredicted: false };
      }

      const detail = getPhaseDetailsForDate(normalizedDate, periods, predictions, settings);
      const meta = PHASE_PALETTE[detail.phase];
      return { phase: detail.phase, color: meta.color, isPredicted: detail.isPredicted };
    },
    [periods, predictions, settings]
  );

  const handleDatePress = useCallback((date: Date) => {
    setSelectedDate(date);
    setSelectedDateSymptoms([]);
    setSelectedDateMoods([]);
    loadLogsForDate(date);
  }, [loadLogsForDate]);

  const handleAddPeriod = useCallback(async (selectedDate?: Date) => {
    if (!user) return;

    try {
      const date = selectedDate || new Date(newPeriodDate);
      date.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Prevent logging periods for future dates
      if (date > today) {
        Alert.alert('Invalid Date', 'Cannot log periods for future dates.');
        return;
      }

      // Calculate end date based on average period length
      const periodLength = settings?.averagePeriodLength || 5;
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + periodLength - 1);
      endDate.setHours(23, 59, 59, 999);

      // Prevent duplicate or overlapping period entries
      const overlapsExisting = periods.some((period) => {
        const start = new Date(period.startDate);
        start.setHours(0, 0, 0, 0);
        const existingEnd = period.endDate
          ? new Date(period.endDate)
          : (() => {
              const assumed = new Date(period.startDate);
              assumed.setHours(0, 0, 0, 0);
              assumed.setDate(assumed.getDate() + periodLength - 1);
              return assumed;
            })();
        existingEnd.setHours(23, 59, 59, 999);
        return date >= start && date <= existingEnd;
      });

      if (overlapsExisting) {
        Alert.alert('Period Already Logged', 'A period is already logged and in progress for this date.');
        return;
      }

      await createPeriod({
        startDate: date.toISOString(),
        endDate: endDate.toISOString(),
        flowLevel: 'medium',
      });

      Alert.alert('Success', 'Period logged successfully');
      setShowDatePicker(false);
      setSelectedDate(null);
      loadingDataRef.current = false;
      loadData();
      DeviceEventEmitter.emit('periodsUpdated');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to log period');
    }
  }, [user, newPeriodDate, settings, periods, loadData]);

  const handleDeletePeriod = useCallback(
    async (periodId: string) => {
      Alert.alert('Delete Period', 'Are you sure you want to delete this period?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePeriod(periodId);
              Alert.alert('Success', 'Period deleted successfully');
              setSelectedDate(null);
              loadingDataRef.current = false;
              loadData();
              DeviceEventEmitter.emit('periodsUpdated');
            } catch (error: any) {
              Alert.alert('Error', error.message || 'Failed to delete period');
            }
          },
        },
      ]);
    },
    [loadData]
  );

  const prevMonth = useCallback(() => {
    setCurrentMonth((prev) => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() - 1);
      return newDate;
    });
  }, []);

  const nextMonth = useCallback(() => {
    setCurrentMonth((prev) => {
      const newDate = new Date(prev);
      newDate.setMonth(newDate.getMonth() + 1);
      return newDate;
    });
  }, []);

  const days = useMemo(() => getDaysInMonth(currentMonth), [currentMonth, getDaysInMonth]);

  // Get period for selected date
  const selectedDatePeriod = useMemo(() => {
    if (!selectedDate) return null;
    return periods.find((p) => {
      const start = new Date(p.startDate);
      start.setHours(0, 0, 0, 0);
      const end = p.endDate
        ? new Date(p.endDate)
        : new Date(start.getTime() + (settings?.averagePeriodLength || 5) * 24 * 60 * 60 * 1000 - 1);
      end.setHours(23, 59, 59, 999);
      return selectedDate >= start && selectedDate <= end;
    });
  }, [selectedDate, periods, settings]);

  const selectedDatePeriodEnd = useMemo(() => {
    if (!selectedDatePeriod) return null;
    if (selectedDatePeriod.endDate) {
      const explicit = new Date(selectedDatePeriod.endDate);
      explicit.setHours(0, 0, 0, 0);
      return explicit;
    }
    const fallbackLength = settings?.averagePeriodLength || 5;
    const assumed = new Date(selectedDatePeriod.startDate);
    assumed.setHours(0, 0, 0, 0);
    assumed.setDate(assumed.getDate() + fallbackLength - 1);
    return assumed;
  }, [selectedDatePeriod, settings?.averagePeriodLength]);

  // Check if selected date is the first day of a period
  const isFirstDayOfPeriod = useMemo(() => {
    if (!selectedDate || !selectedDatePeriod) return false;
    const periodStart = new Date(selectedDatePeriod.startDate);
    periodStart.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    return periodStart.getTime() === selected.getTime();
  }, [selectedDate, selectedDatePeriod]);

  // Get phase info for selected date
  const selectedDatePhaseInfo = useMemo(() => {
    if (!selectedDate) return null;
    return getPhaseInfoForDate(selectedDate, periods, predictions, settings);
  }, [selectedDate, periods, predictions, settings]);

  // Check if selected date is in the past and has no period
  const canLogPeriod = useMemo(() => {
    if (!selectedDate) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selected = new Date(selectedDate);
    selected.setHours(0, 0, 0, 0);
    return selected <= today && !selectedDatePeriod;
  }, [selectedDate, selectedDatePeriod]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    loadingDataRef.current = false;
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
            colors={[Colors.primary]}
          />
        }
      >
        <View style={styles.headerBlock}>
          <Text style={styles.headerTitle}>Calendar</Text>
          <Text style={styles.headerSubtitle}>{todaysLabel}</Text>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.monthRow}>
            <TouchableOpacity onPress={prevMonth} style={styles.monthButton}>
              <Ionicons name="chevron-back" size={20} color={Colors.primary} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </Text>
            <TouchableOpacity onPress={nextMonth} style={styles.monthButton}>
              <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          <View style={styles.dayLabelsRow}>
            {DAYS.map((day) => (
              <Text key={day} style={styles.dayLabel}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {days.map((date, index) => {
              if (!date) {
                return <View key={`empty-${index}`} style={styles.dayCell} />;
              }

              const status = getDayStatus(date);
              const isToday = date.toDateString() === new Date().toDateString();
              const hasColor = Boolean(status.color);
              const actualAlpha = status.phase === 'follicular' ? '55' : '33';
              const predictedAlpha = status.phase === 'follicular' ? '33' : '20';
              const borderActualAlpha = status.phase === 'follicular' ? 'CC' : 'AA';
              const borderPredictedAlpha = status.phase === 'follicular' ? '66' : '40';

              const backgroundColor = hasColor
                ? `${status.color}${status.isPredicted ? predictedAlpha : actualAlpha}`
                : undefined;
              const borderColor = hasColor
                ? `${status.color}${status.isPredicted ? borderPredictedAlpha : borderActualAlpha}`
                : undefined;

              return (
                <TouchableOpacity
                  key={date.toISOString()}
                  style={[
                    styles.dayCell,
                    isToday && styles.todayCell,
                    hasColor && { backgroundColor, borderColor },
                  ]}
                  onPress={() => handleDatePress(date)}
                >
                  <Text
                    style={[
                      styles.dayText,
                      isToday && styles.todayText,
                      hasColor && !status.isPredicted && styles.dayTextOnPhase,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.legendRow}>
            {(['menstrual', 'follicular', 'ovulation', 'luteal'] as PhaseKey[]).map((phaseKey) => {
              const palette = PHASE_PALETTE[phaseKey];
              return (
                <View key={phaseKey} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: palette.color }]} />
                  <Text style={styles.legendText}>{palette.shortLabel}</Text>
                </View>
              );
            })}
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#999999' }]} />
              <Text style={styles.legendText}>Predicted tint</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={styles.logPromptCard}
          activeOpacity={0.85}
          onPress={() => handleDatePress(new Date())}
        >
          <View style={styles.logPromptHeader}>
            <Text style={styles.logPromptTitle}>Add mood, symptoms & notes</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.white} />
          </View>
          <Text style={styles.logPromptSubtitle}>Tap to open today&apos;s entry</Text>
          <View style={styles.moodDotsRow}>
            {[0, 1, 2, 3, 4].map((index) => (
              <View
                // eslint-disable-next-line react/no-array-index-key
                key={`mood-dot-${index}`}
                style={[styles.moodDot, { opacity: 0.35 + index * 0.15 }]}
              />
            ))}
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* Date Detail Bottom Sheet Modal */}
      <Modal
        visible={!!selectedDate}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedDate(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setSelectedDate(null)}
          />
          <View style={styles.bottomSheet}>
            <View style={styles.bottomSheetHandle} />
            <ScrollView
              style={styles.bottomSheetContent}
              contentContainerStyle={styles.bottomSheetScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Date Header */}
              <Text style={styles.bottomSheetTitle}>
                {selectedDate?.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>

              {/* Phase Information */}
              {selectedDatePhaseInfo && (
                <View style={styles.phaseInfoContainer}>
                  <Text style={styles.phaseInfoText}>
                    {selectedDatePhaseInfo.phaseName} Phase - Day {selectedDatePhaseInfo.phaseDay}
                  </Text>
                </View>
              )}

              {/* Period Information */}
              {selectedDatePeriod && (
                <View style={styles.periodInfoContainer}>
                  <Text style={styles.periodInfoTitle}>Period Information</Text>
                  <Text style={styles.periodInfoText}>
                    Start: {new Date(selectedDatePeriod.startDate).toLocaleDateString()}
                  </Text>
                  {selectedDatePeriodEnd && (
                    <Text style={styles.periodInfoText}>
                      End: {selectedDatePeriodEnd.toLocaleDateString()}
                      {!selectedDatePeriod.endDate ? ' (estimated)' : ''}
                    </Text>
                  )}
                </View>
              )}

              {loadingLogs ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                </View>
              ) : (
                <>
                  <View style={styles.moodsContainer}>
                    <Text style={styles.moodsTitle}>Moods</Text>
                    {selectedDateMoods.length > 0 ? (
                      selectedDateMoods.map((mood) => (
                        <View key={mood.id} style={styles.symptomItem}>
                          <Text style={styles.symptomText}>{mood.type}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.noSymptomsText}>No moods logged for this date</Text>
                    )}
                  </View>

                  <View style={styles.symptomsContainer}>
                    <Text style={styles.symptomsTitle}>Symptoms</Text>
                    {selectedDateSymptoms.length > 0 ? (
                      selectedDateSymptoms.map((symptom) => (
                        <View key={symptom.id} style={styles.symptomItem}>
                          <Text style={styles.symptomText}>
                            {symptom.type} {symptom.severity ? `(Severity: ${symptom.severity}/5)` : ''}
                          </Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.noSymptomsText}>No symptoms logged for this date</Text>
                    )}
                  </View>
                </>
              )}
            </ScrollView>
            <View style={styles.bottomActionArea}>
              {(isFirstDayOfPeriod && selectedDatePeriod) || canLogPeriod ? (
                <View style={styles.primaryActionsRow}>
                  {isFirstDayOfPeriod && selectedDatePeriod && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.deleteButton]}
                      onPress={() => {
                        handleDeletePeriod(selectedDatePeriod.id);
                      }}
                    >
                      <Ionicons name="trash-outline" size={20} color={Colors.white} />
                      <Text style={styles.deleteButtonText}>Delete</Text>
                    </TouchableOpacity>
                  )}
                  {canLogPeriod && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.logPeriodButton]}
                      onPress={() => {
                        setNewPeriodDate(selectedDate!);
                        handleAddPeriod(selectedDate!);
                      }}
                    >
                      <Ionicons name="add-circle-outline" size={20} color={Colors.white} />
                      <Text style={styles.logPeriodButtonText}>Log Period</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setSelectedDate(null)}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Date Picker Modal (for manual period logging) */}
      <Modal
        visible={showDatePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDatePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Period Start Date</Text>
            <DateTimePicker
              value={newPeriodDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              maximumDate={new Date()}
              onChange={(event, date) => {
                if (Platform.OS === 'android') {
                  setShowDatePicker(false);
                }
                if (date) {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  if (date > today) {
                    Alert.alert('Invalid Date', 'Cannot log periods for future dates.');
                    return;
                  }
                  setNewPeriodDate(date);
                }
              }}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowDatePicker(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={() => handleAddPeriod()}
              >
                <Text style={styles.confirmButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFF7FA',
  },
  contentContainer: {
    paddingTop: 16,
    paddingHorizontal: 24,
    paddingBottom: 40,
    gap: 24,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFF7FA',
  },
  headerBlock: {
    gap: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D16D8A',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  calendarCard: {
    backgroundColor: Colors.white,
    borderRadius: 28,
    paddingVertical: 24,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 107, 157, 0.12)',
  },
  monthLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  dayLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 12,
  },
  dayLabel: {
    width: `${100 / 7}%`,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    marginBottom: 12,
  },
  todayCell: {
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  dayText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
  },
  dayTextOnPhase: {
    color: Colors.white,
    fontWeight: '700',
  },
  todayText: {
    fontWeight: '700',
    color: Colors.primary,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 16,
    marginBottom: 8,
  },
  legendDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  legendText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  logPromptCard: {
    backgroundColor: Colors.primary,
    borderRadius: 28,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    gap: 12,
  },
  logPromptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logPromptTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  logPromptSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
  },
  moodDotsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  moodDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalBackdrop: {
    flex: 1,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  bottomSheetContent: {
    flex: 1,
  },
  bottomSheetScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  bottomSheetTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
  },
  phaseInfoContainer: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  phaseInfoText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  periodInfoContainer: {
    backgroundColor: '#FFE5ED',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  periodInfoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  periodInfoText: {
    fontSize: 14,
    color: Colors.text,
    marginBottom: 4,
  },
  loadingContainer: {
    marginVertical: 16,
    alignItems: 'center',
  },
  moodsContainer: {
    marginBottom: 16,
  },
  moodsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 12,
  },
  symptomsContainer: {
    marginBottom: 16,
  },
  symptomsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 12,
  },
  symptomItem: {
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  symptomText: {
    fontSize: 14,
    color: Colors.text,
  },
  noSymptomsText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  actionButtonsContainer: {
    gap: 12,
    marginBottom: 16,
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  deleteButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  logPeriodButton: {
    backgroundColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  logPeriodButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  closeButtonText: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 400,
    alignSelf: 'center',
    marginTop: 'auto',
    marginBottom: 'auto',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  modalButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: Colors.surface,
  },
  cancelButtonText: {
    color: Colors.text,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: Colors.primary,
  },
  confirmButtonText: {
    color: Colors.white,
    fontWeight: '600',
  },
  bottomActionArea: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    gap: 12,
  },
  primaryActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
});
