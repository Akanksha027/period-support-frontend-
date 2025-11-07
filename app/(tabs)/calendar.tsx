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

    let showSpinner = true;

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

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={prevMonth} style={styles.navButton}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>
          {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </Text>
        <TouchableOpacity onPress={nextMonth} style={styles.navButton}>
          <Ionicons name="chevron-forward" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Day labels */}
        <View style={styles.dayLabels}>
          {DAYS.map((day) => (
            <Text key={day} style={styles.dayLabel}>
              {day}
            </Text>
          ))}
        </View>

        {/* Calendar grid */}
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
                  isToday && styles.todayCell,
                  { backgroundColor, borderColor },
                ]}
                onPress={() => handleDatePress(date)}
              >
                <Text
                  style={[
                    styles.dayText,
                    isToday && styles.todayText,
                    !status.isPredicted && styles.dayTextOnPhase,
                  ]}
                >
                  {date.getDate()}
                </Text>
              </TouchableOpacity>
            );
          })}
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
            <ScrollView style={styles.bottomSheetContent} showsVerticalScrollIndicator={false}>
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

              {/* Action Buttons */}
              <View style={styles.actionButtonsContainer}>
                {isFirstDayOfPeriod && selectedDatePeriod && (
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => {
                      handleDeletePeriod(selectedDatePeriod.id);
                    }}
                  >
                    <Ionicons name="trash-outline" size={20} color={Colors.white} />
                    <Text style={styles.deleteButtonText}>Delete Period</Text>
                  </TouchableOpacity>
                )}

                {canLogPeriod && (
                  <TouchableOpacity
                    style={styles.logPeriodButton}
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

              {/* Close Button */}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setSelectedDate(null)}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
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
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  navButton: {
    padding: 8,
  },
  monthTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
  },
  scrollView: {
    flex: 1,
  },
  dayLabels: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    position: 'relative',
    borderRadius: 10,
    marginVertical: 3,
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
  todayText: {
    fontWeight: 'bold',
    color: Colors.primary,
  },
  coloredText: {
    color: Colors.text,
    fontWeight: '600',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 20,
    gap: 20,
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  legendText: {
    fontSize: 12,
    color: Colors.textSecondary,
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
    padding: 20,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  deleteButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  logPeriodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  logPeriodButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    backgroundColor: Colors.surface,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
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
  dayTextOnPhase: {
    color: Colors.white,
    fontWeight: '700',
  },
});
