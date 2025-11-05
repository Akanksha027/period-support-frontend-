import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Svg, { Circle, G, Text as SvgText, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { useAuth } from '@clerk/clerk-expo';
import { getPeriods, getSettings, getSymptoms, createPeriod, Period, UserSettings, Symptom } from '../../lib/api';
import { calculatePredictions, getDayInfo, getPeriodDayInfo, CyclePredictions } from '../../lib/periodCalculations';
import { usePhase } from '../../contexts/PhaseContext';
import { setClerkTokenGetter } from '../../lib/api';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const CIRCLE_RADIUS = width * 0.35;
const CENTER_X = width / 2;
const CENTER_Y = CIRCLE_RADIUS + 60;

interface DateInfo {
  day: number;
  date: Date;
  phase: 'period' | 'fertile' | 'pms' | 'predicted_period' | 'normal';
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, isSignedIn, getToken } = useAuth();
  const { phaseColors } = usePhase();
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [todaySymptoms, setTodaySymptoms] = useState<Symptom[]>([]);
  const [userName, setUserName] = useState<string>('');
  const loadingRef = useRef(false);

  // Set up token getter
  useEffect(() => {
    if (getToken) {
      setClerkTokenGetter(getToken);
    }
  }, [getToken]);

  // Get user name
  useEffect(() => {
    if (user) {
      const name = user.firstName || 
                  user.emailAddresses[0]?.emailAddress?.split('@')[0] ||
                  'there';
      setUserName(name);
    }
  }, [user]);

  const predictions = useMemo<CyclePredictions>(() => {
    return calculatePredictions(periods, settings);
  }, [periods, settings]);

  const currentPeriodInfo = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return getPeriodDayInfo(today, periods);
  }, [periods]);

  const isOnPeriod = useMemo(() => {
    return currentPeriodInfo !== null;
  }, [currentPeriodInfo]);

  const currentCycleInfo = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayInfo = getDayInfo(today, periods, predictions);
    
    const sortedPeriods = [...periods].sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    );
    
    let cycleDay = 1;
    let phaseName = 'Normal';
    let phaseEmoji = '😊';
    
    if (sortedPeriods.length > 0) {
      const lastPeriodStart = new Date(sortedPeriods[0].startDate);
      lastPeriodStart.setHours(0, 0, 0, 0);
      const daysSinceLastPeriod = Math.floor(
        (today.getTime() - lastPeriodStart.getTime()) / (1000 * 60 * 60 * 24)
      );
      cycleDay = daysSinceLastPeriod + 1;
    }
    
    if (dayInfo.isPeriod) {
      phaseName = 'Period Phase';
      phaseEmoji = '🩸';
    } else if (dayInfo.isFertile) {
      phaseName = 'Ovulation Phase';
      phaseEmoji = '💕';
    } else if (dayInfo.isPMS) {
      phaseName = 'Luteal Phase';
      phaseEmoji = '😌';
    } else {
      phaseName = 'Follicular Phase';
      phaseEmoji = '🌸';
    }
    
    return { cycleDay, phaseName, phaseEmoji, dayInfo };
  }, [periods, predictions]);

  const daysUntilPeriod = useMemo(() => {
    if (isOnPeriod || !predictions.nextPeriodDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextPeriod = new Date(predictions.nextPeriodDate);
    nextPeriod.setHours(0, 0, 0, 0);
    const diff = Math.ceil((nextPeriod.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : null;
  }, [predictions.nextPeriodDate, isOnPeriod]);

  const circleDates = useMemo<DateInfo[]>(() => {
    const dates: DateInfo[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dayInfo = getDayInfo(date, periods, predictions);
      dates.push({
        day: date.getDate(),
        date,
        phase: dayInfo.phase,
      });
    }
    
    return dates;
  }, [periods, predictions]);

  const loadData = useCallback(async () => {
    if (!user || !isSignedIn || loadingRef.current) return;
    
    loadingRef.current = true;
    setLoading(true);
    
    try {
      const [periodsData, settingsData] = await Promise.all([
        getPeriods().catch(() => []),
        getSettings().catch(() => null),
      ]);
      
      setPeriods(periodsData);
      setSettings(settingsData);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      const symptoms = await getSymptoms(
        today.toISOString(),
        endOfDay.toISOString()
      ).catch(() => []);
      setTodaySymptoms(symptoms);
    } catch (error: any) {
      if (error.response?.status !== 401) {
        console.error('[Home] Error loading data:', error);
      }
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [user, isSignedIn]);

  useEffect(() => {
    if (user && isSignedIn) {
      loadData();
    }
  }, [user, isSignedIn]);

  useFocusEffect(
    useCallback(() => {
      if (user && isSignedIn && !loadingRef.current) {
        loadData();
      }
    }, [user, isSignedIn, loadData])
  );

  const handleLogPeriod = useCallback(async () => {
    if (!user) return;
    
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      await createPeriod({
        startDate: today.toISOString(),
        endDate: null,
        flowLevel: null,
      });
      
      Alert.alert('Success', 'Period logged successfully');
      loadData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to log period');
    }
  }, [user, loadData]);

  const renderCircleDates = useMemo(() => {
    const angleStep = (2 * Math.PI) / 30;
    const dateRadius = CIRCLE_RADIUS - 30;

    return circleDates.map((dateInfo, index) => {
      const angle = index * angleStep - Math.PI / 2;
      const x = CENTER_X + dateRadius * Math.cos(angle);
      const y = CENTER_Y + dateRadius * Math.sin(angle);

      let color = '#E0E0E0';
      if (dateInfo.phase === 'period') color = '#FF6B9D';
      else if (dateInfo.phase === 'fertile') color = '#4A90E2';
      else if (dateInfo.phase === 'pms') color = '#66BB6A';
      else if (dateInfo.phase === 'predicted_period') color = '#FFB3C1';

      const isToday = index === 0;

      return (
        <G key={index}>
          <Circle
            cx={x}
            cy={y}
            r={isToday ? 18 : 12}
            fill={color}
            stroke={isToday ? '#000' : 'none'}
            strokeWidth={isToday ? 2 : 0}
          />
          <SvgText
            x={x}
            y={y + 4}
            fontSize={isToday ? 12 : 10}
            fill={isToday ? '#000' : '#666'}
            textAnchor="middle"
            fontWeight={isToday ? 'bold' : 'normal'}
          >
            {dateInfo.day}
          </SvgText>
        </G>
      );
    });
  }, [circleDates]);

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
          <Text style={styles.greeting}>Welcome, {userName}! 👋</Text>
          <Text style={styles.subtitle}>Track your cycle with ease</Text>
        </View>

        {/* Center Circle */}
        <View style={styles.circleContainer}>
          <Svg width={width} height={CIRCLE_RADIUS * 2 + 120}>
            {/* Outer circle */}
            <Circle
              cx={CENTER_X}
              cy={CENTER_Y}
              r={CIRCLE_RADIUS}
              fill="none"
              stroke="#E0E0E0"
              strokeWidth={2}
            />
            
            {/* Date circles */}
            {renderCircleDates}

            {/* Center info */}
            <G>
              <Circle
                cx={CENTER_X}
                cy={CENTER_Y}
                r={CIRCLE_RADIUS - 50}
                fill={phaseColors.tabBackground}
                opacity={0.2}
              />
              <SvgText
                x={CENTER_X}
                y={CENTER_Y - 20}
                fontSize={24}
                fontWeight="bold"
                fill={Colors.text}
                textAnchor="middle"
              >
                {currentCycleInfo.phaseEmoji}
              </SvgText>
              <SvgText
                x={CENTER_X}
                y={CENTER_Y + 10}
                fontSize={16}
                fontWeight="600"
                fill={Colors.text}
                textAnchor="middle"
              >
                Day {currentCycleInfo.cycleDay}
              </SvgText>
              <SvgText
                x={CENTER_X}
                y={CENTER_Y + 30}
                fontSize={12}
                fill={Colors.textSecondary}
                textAnchor="middle"
              >
                {currentCycleInfo.phaseName}
              </SvgText>
            </G>
          </Svg>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsContainer}>
          {isOnPeriod ? (
            <View style={styles.periodCard}>
              <Text style={styles.periodTitle}>On Your Period</Text>
              <Text style={styles.periodSubtitle}>
                Day {currentPeriodInfo?.dayNumber} of {currentPeriodInfo?.periodLength}
              </Text>
              <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/(tabs)/calendar')}>
                <Text style={styles.actionButtonText}>View Calendar</Text>
              </TouchableOpacity>
            </View>
          ) : daysUntilPeriod ? (
            <View style={styles.periodCard}>
              <Text style={styles.periodTitle}>Next Period</Text>
              <Text style={styles.periodSubtitle}>
                In {daysUntilPeriod} {daysUntilPeriod === 1 ? 'day' : 'days'}
              </Text>
              <TouchableOpacity style={styles.actionButton} onPress={handleLogPeriod}>
                <Text style={styles.actionButtonText}>Log Period</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.periodCard}>
              <Text style={styles.periodTitle}>Track Your Cycle</Text>
              <Text style={styles.periodSubtitle}>Start tracking to get predictions</Text>
              <TouchableOpacity style={styles.actionButton} onPress={handleLogPeriod}>
                <Text style={styles.actionButtonText}>Log Period</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Symptoms */}
        {todaySymptoms.length > 0 && (
          <View style={styles.symptomsContainer}>
            <Text style={styles.sectionTitle}>Today's Symptoms</Text>
            {todaySymptoms.map((symptom) => (
              <View key={symptom.id} style={styles.symptomItem}>
                <Text style={styles.symptomText}>
                  {symptom.type} (Severity: {symptom.severity}/5)
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Quick Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{predictions.cycleLength}</Text>
            <Text style={styles.statLabel}>Avg Cycle</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{predictions.periodLength}</Text>
            <Text style={styles.statLabel}>Avg Period</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{periods.length}</Text>
            <Text style={styles.statLabel}>Periods</Text>
          </View>
        </View>
      </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingTop: 10,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  circleContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  actionsContainer: {
    padding: 20,
  },
  periodCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  periodTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  periodSubtitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  actionButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  actionButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  symptomsContainer: {
    padding: 20,
    paddingTop: 0,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
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
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    paddingTop: 0,
  },
  statCard: {
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: 16,
    borderRadius: 12,
    minWidth: 80,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});

