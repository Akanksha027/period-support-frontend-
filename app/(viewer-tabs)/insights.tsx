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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import Svg, { Circle, G, Text as SvgText, Path, Line } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/Colors';
import { useAuth, useUser } from '@clerk/clerk-expo';
import {
  getPeriods,
  getSettings,
  getSymptoms,
  getMoods,
  getReminderStatus,
  generateReminder,
  createPeriod,
  Period,
  UserSettings,
  Symptom,
  Mood,
  Reminder,
  UserInfo,
  getUserInfo,
  getCurrentViewModeRecord,
} from '../../lib/api';
import { buildCacheKey, getCachedData, setCachedData } from '../../lib/cache';
import { calculatePredictions, getDayInfo, getPeriodDayInfo, CyclePredictions, getPhaseDetailsForDate } from '../../lib/periodCalculations';
import { usePhase } from '../../contexts/PhaseContext';
import { setClerkTokenGetter } from '../../lib/api';
import { Ionicons } from '@expo/vector-icons';
import { PHASE_PALETTE, PhaseKey } from '../../constants/phasePalette';
import PhaseGuide from '../../components/PhaseGuide';

// Fallback constants for symptom data
const safeSymptomOptions: any[] = [];
const safeSymptomData: any = {};

const { width } = Dimensions.get('window');
const CIRCLE_RADIUS = 155;
const SVG_SIZE = 400;

export default function ViewerInsightsScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { isSignedIn, getToken } = useAuth();
  const { phaseColors } = usePhase();
  const [loading, setLoading] = useState(true);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [todaySymptoms, setTodaySymptoms] = useState<Symptom[]>([]);
  const [todayMoods, setTodayMoods] = useState<Mood[]>([]);
  const [userName, setUserName] = useState<string>('');
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [lastReminder, setLastReminder] = useState<Reminder | null>(null);
  const [reminderEnabled, setReminderEnabled] = useState<boolean>(false);
  const [generatingReminder, setGeneratingReminder] = useState<boolean>(false);
  const loadingRef = useRef(false);

  // Set up token getter
  useEffect(() => {
    if (getToken) {
      setClerkTokenGetter(getToken);
    }
  }, [getToken]);

  // Get user name and info
  useEffect(() => {
    const loadUserInfo = async () => {
      try {
        const viewModeRecord = getCurrentViewModeRecord();
        const scopeIdentifier = viewModeRecord?.mode === 'OTHER'
          ? viewModeRecord?.viewedUserId ?? user?.id
          : user?.id;
        const cacheScope = buildCacheKey([
          viewModeRecord?.mode ?? 'UNKNOWN',
          scopeIdentifier ?? 'self',
        ]);
        const userInfoCacheKey = buildCacheKey(['viewer-insights-user-info', cacheScope]);

        const cachedInfo = await getCachedData<UserInfo | null>(userInfoCacheKey);
        if (cachedInfo) {
          setUserInfo(cachedInfo);
          if (cachedInfo.userType === 'OTHER' && cachedInfo.viewedUser) {
            const name = cachedInfo.viewedUser.name ||
              cachedInfo.viewedUser.email?.split('@')[0] ||
              'User';
            setUserName(name);
          }
        }

        const info = await getUserInfo();
        if (info) {
          setUserInfo(info);
          await setCachedData(userInfoCacheKey, info);
          if (info.userType === 'OTHER' && info.viewedUser) {
            const name = info.viewedUser.name || info.viewedUser.email?.split('@')[0] || 'User';
            setUserName(name);
          }
        }
      } catch (error) {
        console.error('[Viewer Insights] Failed to load user info:', error);
      }
    };

    loadUserInfo();
  }, [user]);

  const predictions = useMemo<CyclePredictions>(() => {
    return calculatePredictions(periods, settings);
  }, [periods, settings]);

  const currentPeriodInfo = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return getPeriodDayInfo(
      today,
      periods,
      predictions.periodLength || settings?.averagePeriodLength || 5
    );
  }, [periods, predictions, settings?.averagePeriodLength]);

  const isOnPeriod = useMemo(() => {
    return currentPeriodInfo !== null;
  }, [currentPeriodInfo]);

  const currentCycleInfo = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const phaseDetail = getPhaseDetailsForDate(today, periods, predictions, settings);
    const metadata = PHASE_PALETTE[phaseDetail.phase];
    const dayInfo = getDayInfo(today, periods, predictions);

    const sortedPeriods = [...periods].sort(
      (a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    );

    let cycleDay = 1;
    if (sortedPeriods.length > 0) {
      const lastPeriodStart = new Date(sortedPeriods[0].startDate);
      lastPeriodStart.setHours(0, 0, 0, 0);
      const daysSinceLastPeriod = Math.floor(
        (today.getTime() - lastPeriodStart.getTime()) / (1000 * 60 * 60 * 24)
      );
      cycleDay = daysSinceLastPeriod + 1;
    }

    const phaseStart = phaseDetail.phaseStart;
    let phaseDay = 1;
    if (phaseStart) {
      const diff = Math.floor((today.getTime() - phaseStart.getTime()) / (1000 * 60 * 60 * 24));
      phaseDay = diff >= 0 ? diff + 1 : 1;
    }

    return {
      cycleDay,
      phaseKey: phaseDetail.phase as PhaseKey,
      phaseDay,
      phaseEmoji: metadata.emoji,
      phaseMeta: metadata,
      dayInfo,
      isPredicted: phaseDetail.isPredicted,
    };
  }, [periods, predictions, settings]);

  const daysUntilPeriod = useMemo(() => {
    if (isOnPeriod || !predictions.nextPeriodDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextPeriod = new Date(predictions.nextPeriodDate);
    nextPeriod.setHours(0, 0, 0, 0);
    const diff = Math.ceil((nextPeriod.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : null;
  }, [predictions.nextPeriodDate, isOnPeriod]);

  const hasNoPeriodData = useMemo(() => {
    return periods.length === 0;
  }, [periods.length]);

  // Phase-based gradient colors
  const phaseGradientColors = useMemo((): [string, string, string] => {
    return currentCycleInfo.phaseMeta.gradient;
  }, [currentCycleInfo.phaseMeta]);

  const userRef = useRef(user);
  const isSignedInRef = useRef(isSignedIn);
  
  useEffect(() => {
    userRef.current = user;
    isSignedInRef.current = isSignedIn;
  }, [user, isSignedIn]);

  const loadData = useCallback(async () => {
    const currentUser = userRef.current;
    const currentIsSignedIn = isSignedInRef.current;

    if (!currentIsSignedIn || !currentUser) {
      setLoading(false);
      loadingRef.current = false;
      return;
    }

    if (loadingRef.current) return;

    loadingRef.current = true;

    let showSpinner = true;

    try {
      const viewModeRecord = getCurrentViewModeRecord();
      const scopeIdentifier = viewModeRecord?.mode === 'OTHER'
        ? viewModeRecord?.viewedUserId ?? currentUser.id
        : currentUser.id;
      const cacheScope = buildCacheKey([
        viewModeRecord?.mode ?? 'UNKNOWN',
        scopeIdentifier ?? 'self',
      ]);

      const periodsCacheKey = buildCacheKey(['viewer-periods', cacheScope]);
      const settingsCacheKey = buildCacheKey(['viewer-settings', cacheScope]);

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

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      const symptomsCacheKey = buildCacheKey([
        'viewer-symptoms',
        cacheScope,
        today.toISOString(),
        endOfDay.toISOString(),
      ]);
      const moodsCacheKey = buildCacheKey([
        'viewer-moods',
        cacheScope,
        today.toISOString(),
        endOfDay.toISOString(),
      ]);
      const remindersCacheKey = buildCacheKey(['viewer-reminders', cacheScope]);

      const cachedSymptoms = await getCachedData<Symptom[]>(symptomsCacheKey);
      if (cachedSymptoms !== undefined) {
        setTodaySymptoms(cachedSymptoms);
        showSpinner = false;
      }

      const cachedMoods = await getCachedData<Mood[]>(moodsCacheKey);
      if (cachedMoods !== undefined) {
        setTodayMoods(cachedMoods);
        showSpinner = false;
      }

      const cachedReminderStatus = await getCachedData<{ enabled: boolean; lastReminder: Reminder | null }>(remindersCacheKey);
      if (cachedReminderStatus !== undefined) {
        setReminderEnabled(cachedReminderStatus.enabled);
        setLastReminder(cachedReminderStatus.lastReminder);
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

      const [symptoms, moods, reminderStatus] = await Promise.all([
        getSymptoms(today.toISOString(), endOfDay.toISOString()).catch(() => []),
        getMoods(today.toISOString(), endOfDay.toISOString()).catch(() => []),
        getReminderStatus().catch(() => ({ enabled: false, lastReminder: null })),
      ]);
      setTodaySymptoms(symptoms);
      setTodayMoods(moods);
      setReminderEnabled(reminderStatus.enabled);
      setLastReminder(reminderStatus.lastReminder);

      await setCachedData(symptomsCacheKey, symptoms);
      await setCachedData(moodsCacheKey, moods);
      await setCachedData(remindersCacheKey, reminderStatus);
    } catch (error: any) {
      if (error.response?.status !== 401) {
        console.error('[Viewer Insights] Error loading data:', error);
      }
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (user && isSignedIn) {
      loadData();
    } else {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [user?.id, isSignedIn, loadData]);

  useFocusEffect(
    useCallback(() => {
      if (user && isSignedIn && !loadingRef.current) {
        loadData();
      }
    }, [user?.id, isSignedIn, loadData])
  );

  const handleGenerateReminder = useCallback(async () => {
    if (!settings?.reminderEnabled) {
      Alert.alert('Reminders Disabled', 'Reminders are disabled for this account.');
      return;
    }

    setGeneratingReminder(true);
    try {
      const response = await generateReminder();
      if (response.success && response.reminder) {
        setLastReminder(response.reminder);
        Alert.alert('Reminder Generated', 'Reminder has been generated!');
      } else {
        const errorMessage = response.message || 'Could not generate a reminder at this time. Please try again later.';
        Alert.alert('Unable to Generate', errorMessage);
      }
    } catch (error: any) {
      console.error('Error generating reminder:', error);
      Alert.alert('Error', error.message || 'Failed to generate reminder. Please try again.');
    } finally {
      setGeneratingReminder(false);
    }
  }, [settings?.reminderEnabled]);

  // Memoize tick marks
  const tickMarks = useMemo(() => {
    return Array.from({ length: 30 }).map((_, i) => {
      const angle = (i / 30) * 2 * Math.PI - Math.PI / 2;
      const innerRadius = 160;
      const outerRadius = 170;
      const x1 = 200 + innerRadius * Math.cos(angle);
      const y1 = 200 + innerRadius * Math.sin(angle);
      const x2 = 200 + outerRadius * Math.cos(angle);
      const y2 = 200 + outerRadius * Math.sin(angle);
      return { x1, y1, x2, y2, key: `tick-${i}` };
    });
  }, []);

  const svgOffset = useMemo(() => (width - SVG_SIZE) / 2, [width]);

  // Memoize ovulation arc
  const ovulationArc = useMemo(() => {
    if (!predictions.ovulationDate) return null;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const ovDate = new Date(predictions.ovulationDate);
    ovDate.setHours(0, 0, 0, 0);
    const daysUntilOv = Math.ceil((ovDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilOv >= 0 && daysUntilOv < 30) {
      const arcRadius = 185;
      const startAngle = -Math.PI / 3;
      const endAngle = 0;
      const startX = 200 + arcRadius * Math.cos(startAngle);
      const startY = 200 + arcRadius * Math.sin(startAngle);
      const endX = 200 + arcRadius * Math.cos(endAngle);
      const endY = 200 + arcRadius * Math.sin(endAngle);
      
      return { startX, startY, endX, endY, arcRadius };
    }
    return null;
  }, [predictions.ovulationDate]);

  // Memoize period arc
  const periodArc = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (isOnPeriod && currentPeriodInfo) {
      const arcRadius = 185;
      const startAngle = (5 * Math.PI) / 6;
      const endAngle = Math.PI;
      const startX = 200 + arcRadius * Math.cos(startAngle);
      const startY = 200 + arcRadius * Math.sin(startAngle);
      const endX = 200 + arcRadius * Math.cos(endAngle);
      const endY = 200 + arcRadius * Math.sin(endAngle);
      return { startX, startY, endX, endY, arcRadius };
    }
    
    if (predictions.nextPeriodDate && !isOnPeriod) {
      const periodDate = new Date(predictions.nextPeriodDate);
      periodDate.setHours(0, 0, 0, 0);
      const daysUntilPeriod = Math.ceil((periodDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntilPeriod >= 0 && daysUntilPeriod < 30) {
        const arcRadius = 185;
        const startAngle = (5 * Math.PI) / 6;
        const endAngle = Math.PI;
        const startX = 200 + arcRadius * Math.cos(startAngle);
        const startY = 200 + arcRadius * Math.sin(startAngle);
        const endX = 200 + arcRadius * Math.cos(endAngle);
        const endY = 200 + arcRadius * Math.sin(endAngle);
        return { startX, startY, endX, endY, arcRadius };
      }
    }
    return null;
  }, [isOnPeriod, currentPeriodInfo, predictions.nextPeriodDate]);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <LinearGradient
      colors={phaseGradientColors}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.gradientContainer}
    >
      <SafeAreaView style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>Welcome, {userName}! 👋</Text>
          <Text style={styles.subtitle}>Viewing cycle information</Text>
        </View>

        {/* Center Circle */}
        <View style={styles.circleContainer}>
          {/* Heart Image Background */}
          <View style={styles.heartImageContainer}>
            <Image
              source={require('../../assets/images/images/heart.png')}
              style={styles.heartImage}
              resizeMode="contain"
            />
          </View>

          {/* SVG Circle with all elements */}
          <View style={{ position: 'absolute', left: svgOffset, top: 0, zIndex: 2 }}>
            <Svg 
              width={SVG_SIZE} 
              height={SVG_SIZE} 
              viewBox="0 0 400 400"
            >
            {/* White circle background */}
            <Circle
              cx="200"
              cy="200"
              r="175"
              fill="#FFFFFF"
              opacity={0.7}
            />

            {/* Tick marks around the circle */}
            {tickMarks.map((tick) => (
              <Line
                key={tick.key}
                x1={tick.x1}
                y1={tick.y1}
                x2={tick.x2}
                y2={tick.y2}
                stroke="#E0E0E0"
                strokeWidth="2"
              />
            ))}

            {/* Yellow arc for ovulation */}
            {ovulationArc && (
              <G key="ovulation-arc">
                <Path
                  d={`M ${ovulationArc.startX} ${ovulationArc.startY} A ${ovulationArc.arcRadius} ${ovulationArc.arcRadius} 0 0 1 ${ovulationArc.endX} ${ovulationArc.endY}`}
                  stroke="#FFD93D"
                  strokeWidth="14"
                  fill="none"
                  strokeLinecap="round"
                />
                <Circle
                  cx={ovulationArc.endX}
                  cy={ovulationArc.endY}
                  r="10"
                  fill="#FFD93D"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                />
              </G>
            )}

            {/* Pink arc for period */}
            {periodArc && (
              <Path
                key={isOnPeriod ? "current-period-arc" : "next-period-arc"}
                d={`M ${periodArc.startX} ${periodArc.startY} A ${periodArc.arcRadius} ${periodArc.arcRadius} 0 0 1 ${periodArc.endX} ${periodArc.endY}`}
                stroke="#FF69B4"
                strokeWidth="14"
                fill="none"
                strokeLinecap="round"
              />
            )}

            {/* Phase Name at top */}
            <SvgText
              x="200"
              y="115"
              textAnchor="middle"
              fontSize="13"
              fill="#333"
              fontWeight="600"
            >
              {`${currentCycleInfo.phaseEmoji} ${currentCycleInfo.phaseMeta.shortLabel}`}
              {currentCycleInfo.isPredicted ? ' (predicted)' : ''}
            </SvgText>

            {/* Center content: Phase day or days left */}
            {hasNoPeriodData ? (
              <>
                <SvgText
                  x="200"
                  y="195"
                  textAnchor="middle"
                  fontSize="60"
                  fill="#000"
                  fontWeight="bold"
                >
                  —
                </SvgText>
                <SvgText
                  x="200"
                  y="220"
                  textAnchor="middle"
                  fontSize="14"
                  fill="#666"
                  fontWeight="500"
                >
                  days left
                </SvgText>
              </>
            ) : daysUntilPeriod !== null && daysUntilPeriod <= 3 && daysUntilPeriod > 0 ? (
              <>
                <SvgText
                  x="200"
                  y="195"
                  textAnchor="middle"
                  fontSize="60"
                  fill="#000"
                  fontWeight="bold"
                >
                  {daysUntilPeriod}
                </SvgText>
                <SvgText
                  x="200"
                  y="220"
                  textAnchor="middle"
                  fontSize="14"
                  fill="#666"
                  fontWeight="500"
                >
                  {daysUntilPeriod === 1 ? 'day left' : 'days left'}
                </SvgText>
              </>
            ) : (
              <>
                <SvgText
                  x="200"
                  y="195"
                  textAnchor="middle"
                  fontSize="60"
                  fill="#000"
                  fontWeight="bold"
                >
                  {currentCycleInfo.phaseDay}
                </SvgText>
                <SvgText
                  x="200"
                  y="228"
                  textAnchor="middle"
                  fontSize="11"
                  fill="#666"
                  fontWeight="500"
                >
                  {`day of ${currentCycleInfo.phaseMeta.shortLabel.toLowerCase()}`}
                </SvgText>
              </>
            )}

            {/* Next Period information */}
            <SvgText
              x="200"
              y="255"
              textAnchor="middle"
              fontSize="15"
              fill="#666"
              fontWeight="600"
            >
              Next Period
            </SvgText>
            <SvgText
              x="200"
              y="277"
              textAnchor="middle"
              fontSize="14"
              fill="#666"
              fontWeight="500"
            >
              {hasNoPeriodData || !predictions.nextPeriodDate
                ? 'Calculating...'
                : `will start on - ${new Date(predictions.nextPeriodDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()}`}
            </SvgText>
            </Svg>
          </View>

          {/* Mascot (Giraffe) in bottom-right */}
          <View style={styles.mascotContainer}>
            <Text style={styles.mascotEmoji}>🦒</Text>
          </View>
          {/* Note: Log Period button removed - view-only mode */}
        </View>

        {/* Cycle Phase Cards */}
        {!hasNoPeriodData && (
          <View style={styles.phaseCardsContainer}>
            {predictions.fertileWindowStart && predictions.fertileWindowEnd && (
              <View style={[styles.phaseCard, styles.fertilityCard]}>
                <Text style={styles.phaseCardLabel}>Fertility Window</Text>
                <Text style={styles.phaseCardDateText}>
                  {new Date(predictions.fertileWindowStart).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
                <View style={styles.phaseCardIcon}>
                  <Image
                    source={require('../../assets/images/images/heart_icon.png')}
                    style={styles.phaseCardIconImage}
                    resizeMode="contain"
                  />
                </View>
              </View>
            )}

            {predictions.ovulationDate && (
              <View style={[styles.phaseCard, styles.ovulationCard]}>
                <Text style={styles.phaseCardLabel}>Ovulation</Text>
                <Text style={styles.phaseCardDateText}>
                  {new Date(predictions.ovulationDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
                <View style={styles.phaseCardIcon}>
                  <Image
                    source={require('../../assets/images/images/flower_icon.png')}
                    style={styles.phaseCardIconImage}
                    resizeMode="contain"
                  />
                </View>
              </View>
            )}

            {(predictions.nextPeriodDate || isOnPeriod) && (
              <View style={[styles.phaseCard, styles.periodCard]}>
                <Text style={styles.phaseCardLabel}>
                  {isOnPeriod ? 'On Period' : 'Next Period'}
                </Text>
                <Text style={styles.phaseCardDateText}>
                  {isOnPeriod && currentPeriodInfo
                    ? `Day ${currentPeriodInfo.dayNumber}`
                    : predictions.nextPeriodDate
                    ? new Date(predictions.nextPeriodDate).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })
                    : '—'}
                </Text>
                <View style={styles.phaseCardIcon}>
                  <Image
                    source={require('../../assets/images/images/drop_icon.png')}
                    style={styles.phaseCardIconImage}
                    resizeMode="contain"
                  />
                </View>
              </View>
            )}
          </View>
        )}

        <PhaseGuide
          predictions={predictions}
          currentPhase={currentCycleInfo.phaseKey}
          style={{ marginTop: hasNoPeriodData ? 0 : -4 }}
        />

        {/* Reminders Section */}
        {settings?.reminderEnabled && (
          <View style={styles.remindersContainer}>
            <View style={styles.remindersHeader}>
              <View style={styles.remindersHeaderLeft}>
                <Ionicons name="notifications" size={24} color={Colors.primary} />
                <Text style={styles.remindersTitle}>Reminders</Text>
              </View>
              <TouchableOpacity
                style={[styles.generateReminderButton, generatingReminder && styles.generateReminderButtonDisabled]}
                onPress={handleGenerateReminder}
                disabled={generatingReminder}
              >
                {generatingReminder ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="refresh" size={16} color={Colors.white} />
                    <Text style={styles.generateReminderButtonText}>Generate</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {lastReminder ? (
              <View style={styles.reminderCard}>
                <Text style={styles.reminderMessage}>{lastReminder.message}</Text>
                {lastReminder.phase && (
                  <Text style={styles.reminderMeta}>
                    {lastReminder.phase} Phase • {lastReminder.cycleDay ? `Day ${lastReminder.cycleDay}` : ''}
                  </Text>
                )}
                <Text style={styles.reminderDate}>
                  {new Date(lastReminder.sentAt).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            ) : (
              <View style={styles.reminderCardEmpty}>
                <Ionicons name="notifications-outline" size={32} color={Colors.textSecondary} />
                <Text style={styles.reminderEmptyText}>
                  No reminder yet. Tap "Generate" to get a personalized reminder based on the cycle!
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Daily Insights Section - View Only */}
        <View style={styles.insightsContainer}>
          <View style={styles.insightsHeader}>
            <Text style={styles.insightsTitle}>Daily insights</Text>
            <Text style={styles.viewOnlyLabel}>View Only</Text>
          </View>
          
          {(todaySymptoms.length > 0 || todayMoods.length > 0) ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.insightsScrollContent}
            >
              {todayMoods.map((mood) => (
                <View
                  key={`mood-${mood.id}`}
                  style={styles.insightCard}
                >
                  <View style={styles.insightIconContainer}>
                    <Text style={styles.insightEmoji}>😊</Text>
                  </View>
                  <Text style={styles.insightText} numberOfLines={2}>
                    {mood.type}
                  </Text>
                </View>
              ))}
              {todaySymptoms.map((symptom) => (
                <View
                  key={`symptom-${symptom.id}`}
                  style={styles.insightCard}
                >
                  <View style={styles.insightIconContainer}>
                    <Text style={styles.insightEmoji}>🔴</Text>
                  </View>
                  <Text style={styles.insightText} numberOfLines={2}>
                    {symptom.type}
                  </Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyInsightCard}>
              <View style={styles.emptyInsightIcon}>
                <Ionicons name="information-circle-outline" size={32} color={Colors.textSecondary} />
              </View>
              <Text style={styles.emptyInsightText}>No symptoms or moods logged for today</Text>
            </View>
          )}
        </View>

        {/* Quick Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{predictions.cycleLength || settings?.averageCycleLength || 28}</Text>
            <Text style={styles.statLabel}>Avg Cycle</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{predictions.periodLength || settings?.averagePeriodLength || 5}</Text>
            <Text style={styles.statLabel}>Avg Period</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{periods.length}</Text>
            <Text style={styles.statLabel}>Periods</Text>
          </View>
        </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientContainer: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
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
  scrollContent: {
    paddingBottom: 140,
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
    justifyContent: 'center',
    marginVertical: 20,
    position: 'relative',
    width: width,
    height: 400,
    alignSelf: 'center',
  },
  heartImageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: '100%',
    height: 400,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  heartImage: {
    width: 360,
    height: 360,
    opacity: 0.7,
    tintColor: '#FFC1D6',
  },
  mascotContainer: {
    position: 'absolute',
    top: 125,
    right: (width - 400) / 2 - 20,
    zIndex: 7,
  },
  mascotEmoji: {
    fontSize: 150,
  },
  phaseCardsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    marginBottom: 24,
    gap: 8,
  },
  phaseCard: {
    flex: 1,
    minWidth: 130,
    height: 128,
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    shadowColor: '#F2A0C3',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  periodCard: {
    backgroundColor: '#FFE6ED',
    borderWidth: 1,
    borderColor: '#FFC9D8',
  },
  ovulationCard: {
    backgroundColor: '#FFEBD9',
    borderWidth: 1,
    borderColor: '#FFD5B2',
  },
  fertilityCard: {
    backgroundColor: '#E7ECFF',
    borderWidth: 1,
    borderColor: '#CBD5FF',
  },
  phaseCardDateText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
    textAlign: 'left',
  },
  phaseCardLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E2432',
    textAlign: 'left',
  },
  phaseCardIcon: {
    alignSelf: 'flex-end',
    marginTop: 8,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00000012',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  phaseCardIconImage: {
    width: 28,
    height: 28,
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
  insightsContainer: {
    padding: 20,
    paddingTop: 0,
  },
  insightsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  insightsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
  },
  viewOnlyLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    backgroundColor: Colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  insightsScrollContent: {
    gap: 12,
    paddingRight: 20,
  },
  insightCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    width: 120,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  insightIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  insightEmoji: {
    fontSize: 24,
  },
  insightText: {
    fontSize: 12,
    color: Colors.text,
    textAlign: 'center',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  emptyInsightCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  emptyInsightIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyInsightText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
  },
  remindersContainer: {
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 20,
  },
  remindersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  remindersHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  remindersTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
  },
  generateReminderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  generateReminderButtonDisabled: {
    opacity: 0.6,
  },
  generateReminderButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  reminderCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  reminderMessage: {
    fontSize: 15,
    color: Colors.text,
    lineHeight: 22,
    marginBottom: 8,
  },
  reminderMeta: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
    fontWeight: '500',
  },
  reminderDate: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontStyle: 'italic',
  },
  reminderCardEmpty: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  reminderEmptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
});
