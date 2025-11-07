import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Platform,
  Dimensions,
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

  const loadData = useCallback(async () => {
    if (loadingDataRef.current) {
      return;
    }

    if (!userRef.current || !isSignedInRef.current) {
      setLoading(false);
      return;
    }

    loadingDataRef.current = true;
    setLoading(true);
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

      const cachedUserInfo = await getCachedData<UserInfo | null>(userInfoCacheKey);
      if (cachedUserInfo !== undefined) {
        setUserInfo(cachedUserInfo);
        if (cachedUserInfo?.userType === 'OTHER' && cachedUserInfo.viewedUser) {
          const name = cachedUserInfo.viewedUser.name ||
            cachedUserInfo.viewedUser.email?.split('@')[0] ||
            'User';
          setViewedUserName(name);
        }
      }

      const cachedPeriods = await getCachedData<Period[]>(periodsCacheKey);
      if (cachedPeriods !== undefined) {
        setPeriods(cachedPeriods);
      }

      const cachedSettings = await getCachedData<UserSettings | null>(settingsCacheKey);
      if (cachedSettings !== undefined) {
        setSettings(cachedSettings);
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
      setPeriods(periodsData);
      setSettings(settingsData);

      await setCachedData(periodsCacheKey, periodsData);
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
      const detail = getPhaseDetailsForDate(date, periods, predictions, settings);
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

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Calendar for {viewedUserName}</Text>
          <Text style={styles.subtitle}>View cycle and period information</Text>
        </View>

        {/* Month Navigation */}
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={() => navigateMonth('prev')} style={styles.navButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.monthText}>
            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
          <TouchableOpacity onPress={() => navigateMonth('next')} style={styles.navButton}>
            <Ionicons name="chevron-forward" size={24} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Calendar Grid */}
        <View style={styles.calendarContainer}>
          {/* Day Headers */}
          <View style={styles.dayHeaders}>
            {DAYS.map((day) => (
              <View key={day} style={styles.dayHeader}>
                <Text style={styles.dayHeaderText}>{day}</Text>
              </View>
            ))}
          </View>

          {/* Calendar Days */}
          <View style={styles.calendarGrid}>
            {days.map((date, index) => {
              if (!date) {
                return <View key={`empty-${index}`} style={styles.dayCell} />;
              }

              const status = getDayStatus(date);
              const isToday = date.toDateString() === new Date().toDateString();
              const backgroundColor = `${status.color}${status.isPredicted ? '22' : '66'}`;
              const borderColor = `${status.color}${status.isPredicted ? '33' : 'AA'}`;

              return (
                <TouchableOpacity
                  key={date.toISOString()}
                  style={[
                    styles.dayCell,
                    { backgroundColor, borderColor },
                    isToday && styles.todayDay,
                  ]}
                  onPress={() => handleDatePress(date)}
                >
                  <Text
                    style={[
                      styles.dayText,
                      !status.isPredicted && styles.dayTextOnPhase,
                      isToday && styles.todayText,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          {(['menstrual', 'follicular', 'ovulation', 'luteal'] as PhaseKey[]).map((phaseKey) => {
            const palette = PHASE_PALETTE[phaseKey];
            return (
              <View key={phaseKey} style={styles.legendItem}>
                <View style={[styles.legendColor, { backgroundColor: palette.color }]} />
                <Text style={styles.legendText}>{palette.shortLabel}</Text>
              </View>
            );
          })}
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#999999' }]} />
            <Text style={styles.legendText}>Predicted tint</Text>
          </View>
        </View>
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
                  {/* Phase Information */}
                  {(() => {
                    const phaseInfo = getPhaseInfoForDate(selectedDate, periods, predictions, settings);
                    return (
                      <View style={styles.phaseInfo}>
                        <Text style={styles.phaseLabel}>Phase:</Text>
                        <Text style={styles.phaseValue}>
                          {phaseInfo.phaseName} - Day {phaseInfo.phaseDay}
                        </Text>
                      </View>
                    );
                  })()}

                  {loadingLogs ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator size="small" color={Colors.primary} />
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
  container: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  navButton: {
    padding: 8,
  },
  monthText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  calendarContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  dayHeaders: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dayHeader: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  dayHeaderText: {
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
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    margin: 3,
  },
  todayDay: {
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
    fontWeight: 'bold',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: Colors.textSecondary,
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

