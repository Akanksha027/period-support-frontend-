import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Colors } from '../../constants/Colors';
import { useAuth } from '@clerk/clerk-expo';
import {
  getPeriods,
  getSettings,
  createPeriod,
  updatePeriod,
  deletePeriod,
  Period,
  UserSettings,
} from '../../lib/api';
import { calculatePredictions, getDayInfo, CyclePredictions } from '../../lib/periodCalculations';
import { setClerkTokenGetter } from '../../lib/api';
import { Ionicons } from '@expo/vector-icons';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarScreen() {
  const { user, isSignedIn, getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [newPeriodDate, setNewPeriodDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());

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
    if (!user || !isSignedIn) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [periodsData, settingsData] = await Promise.all([
        getPeriods().catch(() => []),
        getSettings().catch(() => null),
      ]);
      setPeriods(periodsData);
      setSettings(settingsData);
    } catch (error: any) {
      if (error.response?.status !== 401) {
        console.error('[Calendar] Error loading data:', error);
      }
    } finally {
      setLoading(false);
    }
  }, [user, isSignedIn]);

  useEffect(() => {
    if (user && isSignedIn) {
      loadData();
    }
  }, [user, isSignedIn, loadData]);

  useFocusEffect(
    useCallback(() => {
      if (user && isSignedIn) {
        loadData();
      }
    }, [user, isSignedIn, loadData])
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
      const dayInfo = getDayInfo(date, periods, predictions);

      // Check if it's an actual period day
      const isPeriodDay = periods.some((period) => {
        const start = new Date(period.startDate);
        start.setHours(0, 0, 0, 0);
        const end = period.endDate ? new Date(period.endDate) : start;
        end.setHours(0, 0, 0, 0);
        return date >= start && date <= end;
      });

      if (isPeriodDay) {
        return { type: 'period', color: Colors.primary };
      }

      if (dayInfo.phase === 'fertile') {
        return { type: 'fertile', color: '#4A90E2' };
      }

      if (dayInfo.phase === 'pms') {
        return { type: 'pms', color: '#66BB6A' };
      }

      if (dayInfo.phase === 'predicted_period') {
        return { type: 'predicted', color: Colors.secondary };
      }

      return { type: 'normal', color: Colors.border };
    },
    [periods, predictions]
  );

  const handleAddPeriod = useCallback(async () => {
    if (!user) return;

    try {
      const date = new Date(newPeriodDate);
      date.setHours(0, 0, 0, 0);

      await createPeriod({
        startDate: date.toISOString(),
        endDate: null,
        flowLevel: null,
      });

      Alert.alert('Success', 'Period logged successfully');
      setShowDatePicker(false);
      loadData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to log period');
    }
  }, [user, newPeriodDate, loadData]);

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
              loadData();
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
            const isToday =
              date.toDateString() === new Date().toDateString();
            const period = periods.find((p) => {
              const start = new Date(p.startDate);
              start.setHours(0, 0, 0, 0);
              const end = p.endDate ? new Date(p.endDate) : start;
              end.setHours(0, 0, 0, 0);
              return date >= start && date <= end;
            });

            return (
              <TouchableOpacity
                key={date.toISOString()}
                style={[
                  styles.dayCell,
                  isToday && styles.todayCell,
                  status.type === 'period' && styles.periodCell,
                  status.type === 'fertile' && styles.fertileCell,
                  status.type === 'predicted' && styles.predictedCell,
                ]}
                onPress={() => {
                  if (period) {
                    setSelectedDate(date);
                  }
                }}
              >
                <Text
                  style={[
                    styles.dayText,
                    isToday && styles.todayText,
                    status.type === 'period' && styles.periodText,
                  ]}
                >
                  {date.getDate()}
                </Text>
                {status.type === 'period' && (
                  <View style={styles.periodIndicator} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: Colors.primary }]} />
            <Text style={styles.legendText}>Period</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: '#4A90E2' }]} />
            <Text style={styles.legendText}>Fertile</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendColor, { backgroundColor: Colors.secondary }]} />
            <Text style={styles.legendText}>Predicted</Text>
          </View>
        </View>

        {/* Add Period Button */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowDatePicker(true)}
        >
          <Ionicons name="add" size={24} color={Colors.white} />
          <Text style={styles.addButtonText}>Log Period</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Date Picker Modal */}
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
              onChange={(event, date) => {
                if (Platform.OS === 'android') {
                  setShowDatePicker(false);
                }
                if (date) {
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
                onPress={handleAddPeriod}
              >
                <Text style={styles.confirmButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Period Detail Modal */}
      {selectedDate && (
        <Modal
          visible={!!selectedDate}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedDate(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                Period: {selectedDate?.toLocaleDateString()}
              </Text>
              {periods
                .filter((p) => {
                  const start = new Date(p.startDate);
                  start.setHours(0, 0, 0, 0);
                  const end = p.endDate ? new Date(p.endDate) : start;
                  end.setHours(0, 0, 0, 0);
                  return selectedDate && selectedDate >= start && selectedDate <= end;
                })
                .map((period) => (
                  <View key={period.id} style={styles.periodDetail}>
                    <Text style={styles.periodDetailText}>
                      Start: {new Date(period.startDate).toLocaleDateString()}
                    </Text>
                    {period.endDate && (
                      <Text style={styles.periodDetailText}>
                        End: {new Date(period.endDate).toLocaleDateString()}
                      </Text>
                    )}
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => {
                        handleDeletePeriod(period.id);
                        setSelectedDate(null);
                      }}
                    >
                      <Text style={styles.deleteButtonText}>Delete Period</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setSelectedDate(null)}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
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
  },
  todayCell: {
    backgroundColor: Colors.surface,
    borderColor: Colors.primary,
    borderWidth: 2,
  },
  periodCell: {
    backgroundColor: Colors.secondary,
  },
  fertileCell: {
    backgroundColor: '#E3F2FD',
  },
  predictedCell: {
    backgroundColor: '#FFE5ED',
  },
  dayText: {
    fontSize: 14,
    color: Colors.text,
  },
  todayText: {
    fontWeight: 'bold',
    color: Colors.primary,
  },
  periodText: {
    color: Colors.white,
    fontWeight: '600',
  },
  periodIndicator: {
    position: 'absolute',
    bottom: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 20,
    gap: 20,
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
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    padding: 16,
    margin: 20,
    borderRadius: 24,
    gap: 8,
  },
  addButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    width: '90%',
    maxWidth: 400,
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
  periodDetail: {
    padding: 16,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    marginBottom: 12,
  },
  periodDetailText: {
    fontSize: 14,
    color: Colors.text,
    marginBottom: 4,
  },
  deleteButton: {
    backgroundColor: Colors.error,
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: Colors.white,
    fontWeight: '600',
  },
  closeButton: {
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    color: Colors.text,
    fontWeight: '600',
  },
});

