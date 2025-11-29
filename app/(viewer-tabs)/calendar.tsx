import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Platform,
  Dimensions,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Colors } from '../../constants/Colors';
import { useAuth, useUser } from '@clerk/clerk-expo';
import {
  getPeriods,
  getSettings,
  getSymptoms,
  getMoods,
  getUserInfo,
  Period,
  UserSettings,
  Symptom,
  Mood,
  UserInfo,
  getCurrentViewModeRecord,
} from '../../lib/api';
import { buildCacheKey, getCachedData, setCachedData } from '../../lib/cache';
import { calculatePredictions, getDayInfo, getPeriodDayInfo, CyclePredictions, getPhaseDetailsForDate, buildEffectivePeriods } from '../../lib/periodCalculations';
import { setClerkTokenGetter } from '../../lib/api';
import { Ionicons } from '@expo/vector-icons';
import { PHASE_PALETTE, PhaseKey } from '../../constants/phasePalette';
import PeriLoader from '../../components/PeriLoader';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Helper function to get phase info for any date
function getPhaseInfoForDate(
  date: Date,
  periods: Period[],
  predictions: CyclePredictions,
  settings: UserSettings | null
): { phaseName: string; phaseDay: number } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateNormalized = new Date(date);
  dateNormalized.setHours(0, 0, 0, 0);

  // Get phase details using the main function
  const phaseDetails = getPhaseDetailsForDate(date, periods, predictions, settings);
  
  // If no phase details (null), return null
  if (!phaseDetails) {
    return null;
  }

  // For past dates without logged periods, return null
  if (dateNormalized < today && phaseDetails.phase !== 'menstrual') {
    return null;
  }

  // Calculate phase day number based on phase start
  let phaseDay = 1;
  if (phaseDetails.phaseStart) {
    const daysSinceStart = Math.floor(
      (dateNormalized.getTime() - phaseDetails.phaseStart.getTime()) / (1000 * 60 * 60 * 24)
    );
    phaseDay = Math.max(1, daysSinceStart + 1);
  }

  // Handle different phases
  if (phaseDetails.phase === 'menstrual') {
    const periodInfo = getPeriodDayInfo(
      date,
      periods,
      predictions.periodLength || settings?.averagePeriodLength || 5
    );
    if (periodInfo) {
      return {
        phaseName: phaseDetails.isPredicted ? 'Predicted Period' : 'Period',
        phaseDay: periodInfo.dayNumber,
      };
    } else {
      return {
        phaseName: phaseDetails.isPredicted ? 'Predicted Period' : 'Period',
        phaseDay: phaseDay,
      };
    }
  } else if (phaseDetails.phase === 'ovulation') {
    return {
      phaseName: 'Ovulation',
      phaseDay: phaseDay,
    };
  } else if (phaseDetails.phase === 'luteal') {
    return {
      phaseName: 'Luteal',
      phaseDay: phaseDay,
    };
  } else if (phaseDetails.phase === 'follicular') {
    return {
      phaseName: 'Follicular',
      phaseDay: phaseDay,
    };
  }

  // Default fallback
  return null;
}

export default function ViewerCalendarScreen() {
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedDateSymptoms, setSelectedDateSymptoms] = useState<Symptom[]>([]);
  const [selectedDateMoods, setSelectedDateMoods] = useState<Mood[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [viewedUserName, setViewedUserName] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);

  // Use refs to avoid infinite loops
  const userRef = useRef(user);
  const isSignedInRef = useRef(isSignedIn);
  const getTokenRef = useRef(getToken);
  const loadingDataRef = useRef(false);

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

const loadData = useCallback(async ({ skipSpinner = false }: { skipSpinner?: boolean } = {}) => {
  if (loadingDataRef.current) {
    return;
  }

  if (!userRef.current || !isSignedInRef.current) {
    setLoading(false);
    return;
  }

  loadingDataRef.current = true;
  try {
      const viewModeRecord = getCurrentViewModeRecord();
      const scopeIdentifier = viewModeRecord?.mode === 'OTHER'
        ? viewModeRecord?.viewedUserId ?? userRef.current?.id
        : userRef.current?.id;
      const cacheScope = buildCacheKey([
        viewModeRecord?.mode ?? 'UNKNOWN',
        scopeIdentifier ?? 'self',
      ]);

      const userInfoCacheKey = buildCacheKey(['viewer-user-info', cacheScope]);
      const periodsCacheKey = buildCacheKey(['viewer-periods', cacheScope]);
      const settingsCacheKey = buildCacheKey(['viewer-settings', cacheScope]);

    let hasCachedSnapshot = false;

      const cachedUserInfo = await getCachedData<UserInfo | null>(userInfoCacheKey);
      if (cachedUserInfo !== undefined) {
        setUserInfo(cachedUserInfo);
        if (cachedUserInfo?.userType === 'OTHER' && cachedUserInfo.viewedUser) {
          const name = cachedUserInfo.viewedUser.name ||
            cachedUserInfo.viewedUser.email?.split('@')[0] ||
            'User';
          setViewedUserName(name);
        }
      hasCachedSnapshot = true;
      }

      const cachedPeriods = await getCachedData<Period[]>(periodsCacheKey);
      if (cachedPeriods !== undefined) {
        setPeriods(cachedPeriods);
      hasCachedSnapshot = true;
      }

      const cachedSettings = await getCachedData<UserSettings | null>(settingsCacheKey);
      if (cachedSettings !== undefined) {
        setSettings(cachedSettings);
      hasCachedSnapshot = true;
    }

    if (hasCachedSnapshot) {
      setLoading(false);
    } else if (!skipSpinner) {
      setLoading(true);
      }

      // Get user info to check if viewing someone else
      const info = await getUserInfo();
      if (info) {
        setUserInfo(info);
        await setCachedData(userInfoCacheKey, info);
        // Get viewed user's name
        if (info.userType === 'OTHER' && info.viewedUser) {
          const name = info.viewedUser.name ||
                      info.viewedUser.email?.split('@')[0] ||
                      'User';
          setViewedUserName(name);
        } else {
          const name = userRef.current?.firstName ||
                      userRef.current?.emailAddresses[0]?.emailAddress?.split('@')[0] ||
                      'User';
          setViewedUserName(name);
        }
      }

      const [periodsData, settingsData] = await Promise.all([
        getPeriods().catch(() => []),
        getSettings().catch(() => null),
      ]);
      const effectivePeriods = buildEffectivePeriods(periodsData, settingsData);
      setPeriods(effectivePeriods);
      setSettings(settingsData);

      await setCachedData(periodsCacheKey, effectivePeriods);
      await setCachedData(settingsCacheKey, settingsData);
    } catch (error: any) {
      if (error.response?.status !== 401) {
        console.error('[Viewer Calendar] Error loading data:', error);
      }
    } finally {
      setLoading(false);
      loadingDataRef.current = false;
    }
}, []);

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
        'viewer-calendar-symptoms',
        cacheScope,
        startOfDay.toISOString(),
        endOfDay.toISOString(),
      ]);
      const moodsCacheKey = buildCacheKey([
        'viewer-calendar-moods',
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
      console.error('[Viewer Calendar] Error loading logs:', error);
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
        loadData({ skipSpinner: true });
      }
  }, [user?.id, isSignedIn, loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    loadingDataRef.current = false;
    await loadData({ skipSpinner: true });
    setRefreshing(false);
  }, [loadData]);

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
      const startOfSixMonthsAhead = new Date(today.getFullYear(), today.getMonth() + 6, 1);

      const monthKey = new Date(normalizedDate.getFullYear(), normalizedDate.getMonth(), 1);
      const isCurrentMonth = monthKey.getTime() === startOfCurrentMonth.getTime();
      const isBeforeCurrentMonth = monthKey.getTime() < startOfCurrentMonth.getTime();
      const isBeyondSixMonths = monthKey.getTime() >= startOfSixMonthsAhead.getTime();

      const fallbackPeriodLength = Math.max(1, predictions?.periodLength || settings?.averagePeriodLength || 5);

      const isActualPeriodDay = periods.some((period) => {
        const start = new Date(period.startDate);
        start.setHours(0, 0, 0, 0);
        // Always use current period length setting, not the stored endDate
        // This ensures periods display with the user's current preference
        const end = new Date(period.startDate);
        end.setHours(0, 0, 0, 0);
        // Calculate end date: if period length is 5, days are 0,1,2,3,4 (5 days total)
        // So we add (periodLength - 1) to get the last day
        end.setDate(end.getDate() + fallbackPeriodLength - 1);
        end.setHours(23, 59, 59, 999); // Set to end of day to include the full last day
        return normalizedDate.getTime() >= start.getTime() && normalizedDate.getTime() <= end.getTime();
      });

      if (isActualPeriodDay) {
        return { phase: 'menstrual' as PhaseKey, color: PHASE_PALETTE.menstrual.color, isPredicted: false };
      }

      // Allow predictions for up to 6 months ahead
      if (isBeforeCurrentMonth || isBeyondSixMonths) {
        return { phase: null, color: null, isPredicted: false };
      }

      // Allow predictions for current month and up to 6 months ahead
      const allowPredicted = !isBeforeCurrentMonth && !isBeyondSixMonths;

      const detail = getPhaseDetailsForDate(normalizedDate, periods, predictions, settings);
      
      // If no phase details (null), return no phase
      if (!detail) {
        return { phase: null, color: null, isPredicted: false };
      }
      
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

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth((prev) => {
      const newDate = new Date(prev);
      if (direction === 'prev') {
        newDate.setMonth(prev.getMonth() - 1);
      } else {
        newDate.setMonth(prev.getMonth() + 1);
      }
      return newDate;
    });
  };

  const days = getDaysInMonth(currentMonth);

  const todaysLabel = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <PeriLoader size="large" />
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
          <Text style={styles.headerSubtitle}>Viewing {viewedUserName}</Text>
          <Text style={styles.headerDate}>{todaysLabel}</Text>
        </View>

        <View style={styles.calendarCard}>
          <View style={styles.monthRow}>
            <TouchableOpacity onPress={() => navigateMonth('prev')} style={styles.monthButton}>
              <Ionicons name="chevron-back" size={20} color={Colors.primary} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </Text>
            <TouchableOpacity onPress={() => navigateMonth('next')} style={styles.monthButton}>
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
                    hasColor && { backgroundColor, borderColor },
                    isToday && styles.todayCell,
                  ]}
                  onPress={() => handleDatePress(date)}
                >
                  <Text
                    style={[
                      styles.dayText,
                      hasColor && !status.isPredicted && styles.dayTextOnPhase,
                      isToday && styles.todayText,
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
            <Text style={styles.logPromptTitle}>Review today&apos;s notes</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.white} />
          </View>
          <Text style={styles.logPromptSubtitle}>
            Tap to check {viewedUserName}&apos;s latest symptoms & moods
          </Text>
          <View style={styles.moodDotsRow}>
            {[0, 1, 2, 3, 4].map((index) => (
              <View
                // eslint-disable-next-line react/no-array-index-key
                key={`viewer-mood-dot-${index}`}
                style={[styles.moodDot, { opacity: 0.35 + index * 0.15 }]}
              />
            ))}
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* Date Detail Modal */}
      <Modal
        visible={selectedDate !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedDate(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedDate?.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
              <TouchableOpacity
                onPress={() => setSelectedDate(null)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {selectedDate && (
                <>
                  {/* Phase Information - Only show for logged periods or predicted periods */}
                  {(() => {
                    const phaseInfo = getPhaseInfoForDate(selectedDate, periods, predictions, settings);
                    if (phaseInfo) {
                      return (
                        <View style={styles.phaseInfo}>
                          <Text style={styles.phaseLabel}>Phase:</Text>
                          <Text style={styles.phaseValue}>
                            {phaseInfo.phaseName} - Day {phaseInfo.phaseDay}
                          </Text>
                        </View>
                      );
                    } else if (selectedDate) {
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const selected = new Date(selectedDate);
                      selected.setHours(0, 0, 0, 0);
                      if (selected < today) {
                        return (
                          <View style={styles.phaseInfo}>
                            <Text style={styles.phaseLabel}>Phase:</Text>
                            <Text style={styles.phaseValue}>No period logged for this date</Text>
                          </View>
                        );
                      }
                    }
                    return null;
                  })()}

                  {loadingLogs ? (
                    <View style={styles.loadingContainer}>
                  <PeriLoader size={36} />
                    </View>
                  ) : (
                    <>
                      <View style={styles.symptomsSection}>
                        <Text style={styles.sectionTitle}>Moods</Text>
                        {selectedDateMoods.length === 0 ? (
                          <Text style={styles.emptyText}>No moods logged for this date</Text>
                        ) : (
                          <View style={styles.symptomsList}>
                            {selectedDateMoods.map((mood) => (
                              <View key={mood.id} style={styles.symptomItem}>
                                <Text style={styles.symptomText}>{mood.type}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>

                      <View style={styles.symptomsSection}>
                        <Text style={styles.sectionTitle}>Symptoms</Text>
                        {selectedDateSymptoms.length === 0 ? (
                          <Text style={styles.emptyText}>No symptoms logged for this date</Text>
                        ) : (
                          <View style={styles.symptomsList}>
                            {selectedDateSymptoms.map((symptom) => (
                              <View key={symptom.id} style={styles.symptomItem}>
                                <Text style={styles.symptomText}>
                                  {symptom.type} {symptom.severity && `(Severity: ${symptom.severity})`}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    </>
                  )}
                </>
              )}
            </ScrollView>
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
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  headerDate: {
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
    borderWidth: 2,
    borderColor: Colors.primary,
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
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.7,
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    flex: 1,
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    padding: 20,
  },
  phaseInfo: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: Colors.background,
    borderRadius: 12,
  },
  phaseLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  phaseValue: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  symptomsSection: {
    marginTop: 20,
  },
  loadingContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  symptomsList: {
    gap: 8,
  },
  symptomItem: {
    padding: 12,
    backgroundColor: Colors.background,
    borderRadius: 8,
  },
  symptomText: {
    fontSize: 14,
    color: Colors.text,
    textTransform: 'capitalize',
  },
});

