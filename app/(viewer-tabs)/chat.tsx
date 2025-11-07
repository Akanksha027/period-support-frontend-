import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import {
  chatWithAI,
  getUserInfo,
  getPeriods,
  getSettings,
  getSymptoms,
  getMoods,
  Period,
  UserSettings,
  Symptom,
  Mood,
  Reminder,
  UserInfo,
  getCurrentViewModeRecord,
  setClerkTokenGetter,
} from '@/lib/api';
import { buildCacheKey, getCachedData, setCachedData } from '@/lib/cache';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { calculatePredictions, getDayInfo, CyclePredictions } from '../../lib/periodCalculations';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: string;
  iconColor: string;
  template: string;
}

export default function ViewerChatScreen() {
  const { user } = useUser();
  const { getToken } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [todaySymptoms, setTodaySymptoms] = useState<Symptom[]>([]);
  const [todayMoods, setTodayMoods] = useState<Mood[]>([]);

  const scrollViewRef = useRef<ScrollView>(null);

  const viewerName = useMemo(() => {
    return (
      user?.firstName ||
      user?.fullName?.split(' ')[0] ||
      user?.emailAddresses?.[0]?.emailAddress?.split('@')[0] ||
      'there'
    );
  }, [user]);

  const viewedUserName = useMemo(() => {
    if (userInfo?.viewedUser?.name) {
      return userInfo.viewedUser.name;
    }
    if (userInfo?.viewedUser?.email) {
      return userInfo.viewedUser.email.split('@')[0];
    }
    return 'Akanksha';
  }, [userInfo]);

  const viewedUserFullName = useMemo(() => {
    return userInfo?.viewedUser?.name || viewedUserName;
  }, [userInfo, viewedUserName]);

  // Prepare quick actions tailored for the viewer
  const quickActions = useMemo<QuickAction[]>(() => {
    const friendlyName = viewedUserFullName;
    return [
      {
        id: 'daily-briefing',
        title: 'Daily Briefing',
        description: `Understand ${friendlyName}'s current cycle and mood`,
        icon: 'heart-circle-outline',
        iconColor: '#FF9AA2',
        template: `Please give me a warm, family-friendly daily briefing about ${friendlyName}'s current cycle phase, symptoms, and how we can support her today.`,
      },
      {
        id: 'symptom-understanding',
        title: 'Understand Symptoms',
        description: `Explain what ${friendlyName}'s symptoms mean`,
        icon: 'medkit-outline',
        iconColor: '#7DD3FC',
        template: `Could you explain what ${friendlyName}'s recent symptoms indicate and suggest caring, practical support that her family can offer?`,
      },
      {
        id: 'plan-ahead',
        title: 'Plan Ahead',
        description: 'Know what to prepare for upcoming days',
        icon: 'calendar-outline',
        iconColor: '#C4B5FD',
        template: `Help me plan ahead for ${friendlyName}'s upcoming phase. What medical insights and family support tips should we keep in mind?`,
      },
    ];
  }, [viewedUserFullName]);

  // Set up token getter for API calls
  useEffect(() => {
    if (getToken) {
      setClerkTokenGetter(getToken);
    }
  }, [getToken]);

  // Load viewer info
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
        const userInfoCacheKey = buildCacheKey(['viewer-chat-user-info', cacheScope]);

        const cachedUserInfo = await getCachedData<typeof userInfo>(userInfoCacheKey);
        if (cachedUserInfo !== undefined) {
          setUserInfo(cachedUserInfo);
        }

        const info = await getUserInfo();
        setUserInfo(info);
        await setCachedData(userInfoCacheKey, info);
      } catch (error) {
        console.error('[Viewer Chat] Failed to load user info:', error);
      }
    };

    loadUserInfo();
  }, [user]);

  // Load cycle data for viewed user
  useEffect(() => {
    const loadViewerData = async () => {
      try {
        const viewModeRecord = getCurrentViewModeRecord();
        const scopeIdentifier = viewModeRecord?.mode === 'OTHER'
          ? viewModeRecord?.viewedUserId ?? user?.id
          : user?.id;
        const cacheScope = buildCacheKey([
          viewModeRecord?.mode ?? 'UNKNOWN',
          scopeIdentifier ?? 'self',
        ]);

        const periodsCacheKey = buildCacheKey(['viewer-chat-periods', cacheScope]);
        const settingsCacheKey = buildCacheKey(['viewer-chat-settings', cacheScope]);

        const cachedPeriods = await getCachedData<Period[]>(periodsCacheKey);
        let showSpinner = true;
        if (cachedPeriods !== undefined) {
          setPeriods(cachedPeriods);
          showSpinner = false;
        }

        const cachedSettings = await getCachedData<UserSettings | null>(settingsCacheKey);
        if (cachedSettings !== undefined) {
          setSettings(cachedSettings);
          showSpinner = false;
        }

        if (showSpinner) {
          setLoading(true);
        }

        const [periodsData, settingsData] = await Promise.all([
          getPeriods().catch(() => []),
          getSettings().catch(() => null),
        ]);

        setPeriods(periodsData);
        setSettings(settingsData);

        await setCachedData(periodsCacheKey, periodsData);
        await setCachedData(settingsCacheKey, settingsData);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);

        const symptomsCacheKey = buildCacheKey([
          'viewer-chat-symptoms',
          cacheScope,
          today.toISOString(),
          endOfDay.toISOString(),
        ]);
        const moodsCacheKey = buildCacheKey([
          'viewer-chat-moods',
          cacheScope,
          today.toISOString(),
          endOfDay.toISOString(),
        ]);

        const cachedSymptoms = await getCachedData<Symptom[]>(symptomsCacheKey);
        if (cachedSymptoms !== undefined) {
          setTodaySymptoms(cachedSymptoms);
        }

        const cachedMoods = await getCachedData<Mood[]>(moodsCacheKey);
        if (cachedMoods !== undefined) {
          setTodayMoods(cachedMoods);
        }

        const [symptomsData, moodsData] = await Promise.all([
          getSymptoms(today.toISOString(), endOfDay.toISOString()).catch(() => []),
          getMoods(today.toISOString(), endOfDay.toISOString()).catch(() => []),
        ]);

        setTodaySymptoms(symptomsData);
        setTodayMoods(moodsData);

        await setCachedData(symptomsCacheKey, symptomsData);
        await setCachedData(moodsCacheKey, moodsData);
      } catch (error) {
        console.error('[Viewer Chat] Failed to load viewer cycle data:', error);
      }
    };

    loadViewerData();
  }, [user]);

  const predictions = useMemo<CyclePredictions>(() => {
    return calculatePredictions(periods, settings);
  }, [periods, settings]);

  const todayPhaseInfo = useMemo(() => {
    if (!periods.length) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return getDayInfo(today, periods, predictions);
  }, [periods, predictions]);

  const lastPeriodStart = useMemo(() => {
    if (!periods.length) return null;
    const latest = [...periods].sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];
    return latest?.startDate ? new Date(latest.startDate) : null;
  }, [periods]);

  const contextSummary = useMemo(() => {
    const friendlyName = viewedUserFullName;
    const parts: string[] = [];

    if (!periods.length) {
      parts.push(`${friendlyName} has not logged any period data yet. Encourage them gently to record their cycles so you can support them with accurate insights.`);
    } else {
      if (lastPeriodStart) {
        parts.push(`${friendlyName}'s last recorded period started on ${lastPeriodStart.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })}.`);
      }

      if (predictions.nextPeriodDate) {
        parts.push(`The next predicted period is around ${new Date(predictions.nextPeriodDate).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
        })}.`);
      }

      if (predictions.ovulationDate) {
        parts.push(`Ovulation is projected near ${new Date(predictions.ovulationDate).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
        })}.`);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const cycleDay = predictions?.cycleLength
        ? Math.max(
            1,
            Math.ceil(
              (today.getTime() -
                (lastPeriodStart?.setHours(0, 0, 0, 0) ?? today.getTime())) /
                (1000 * 60 * 60 * 24)
            ) + 1
          )
        : null;

      if (cycleDay && todayPhaseInfo) {
        const phaseLabel = todayPhaseInfo.isPeriod
          ? 'period phase'
          : todayPhaseInfo.isFertile
          ? 'fertile window'
          : todayPhaseInfo.isPMS
          ? 'luteal phase'
          : 'follicular phase';
        parts.push(`${friendlyName} is currently around cycle day ${cycleDay}, likely in the ${phaseLabel}.`);
      }
    }

    if (todayMoods.length) {
      const moodList = todayMoods.map((m) => m.type).join(', ');
      parts.push(`Mood check-ins today include: ${moodList}.`);
    }

    if (todaySymptoms.length) {
      const symptomList = todaySymptoms.map((s) => s.type).join(', ');
      parts.push(`Symptoms observed today: ${symptomList}.`);
    }

    if (!parts.length) {
      parts.push(`No new logs are available yet for ${friendlyName}. Focus on supportive guidance and encourage gentle tracking.`);
    }

    return parts.join(' ');
  }, [viewedUserFullName, periods.length, lastPeriodStart, predictions, todayMoods, todaySymptoms, todayPhaseInfo]);

  // Auto-scroll when messages update
  useEffect(() => {
    const timeout = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
    return () => clearTimeout(timeout);
  }, [messages]);

  const handleSendMessage = useCallback(
    async (messageText: string) => {
      if (!messageText.trim() || loading) return;

      if (showQuickActions) {
        setShowQuickActions(false);
      }

      const trimmedText = messageText.trim();

      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: trimmedText,
        timestamp: new Date(),
      };

      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setInputText('');
      setLoading(true);

      try {
        const familyContext = {
          role: 'system',
          content: `You are "Eira", an empathetic, medically-informed AI family coach. You are speaking with ${viewerName}, who is supporting ${viewedUserFullName}. Offer expert yet compassionate guidance. Use clear language, respect privacy, and reference ${viewedUserFullName}'s cycle data, symptoms, moods, and reminders when relevant. Always frame advice as support for ${viewedUserFullName}, avoiding clinical jargon when possible, and provide next steps the family can take. ${contextSummary}`,
        };

        const messagesArray = [
          familyContext,
          ...updatedMessages.map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        ];

        const response = await chatWithAI(messagesArray);

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content:
            response ||
            `I'm here for you. Let's talk about how we can support ${viewedUserFullName} today.`,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error: any) {
        console.error('[Viewer Chat] Error details:', error);
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content:
            error?.response?.data?.error ||
            'I ran into an issue fetching the latest information. Please try again in a moment.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, showQuickActions, viewerName, viewedUserFullName, contextSummary]
  );

  const handleSend = useCallback(() => {
    handleSendMessage(inputText);
  }, [inputText, handleSendMessage]);

  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      handleSendMessage(action.template);
    },
    [handleSendMessage]
  );

  const greetingSubtitle = useMemo(() => {
    return `You're supporting ${viewedUserFullName}. I’ll keep you updated like her care team would.`;
  }, [viewedUserFullName]);

  return (
    <View style={styles.container}>
      <View style={styles.gradientBorderLeft} pointerEvents="none">
        <LinearGradient
          colors={['#FF6B35', '#FF8E53', '#FFB3B3', '#E8B4F0', '#C8A2F0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.gradientLine}
        />
      </View>
      <View style={styles.gradientBorderRight} pointerEvents="none">
        <LinearGradient
          colors={['#FF6B35', '#FF8E53', '#FFB3B3', '#E8B4F0', '#C8A2F0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.gradientLine}
        />
      </View>

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={90}
        >
          {showQuickActions && messages.length === 0 && (
            <View style={styles.greetingSection}>
              <View style={styles.brainIconContainer}>
                <Ionicons name="sparkles" size={32} color="#9B8EE8" />
              </View>
              <Text style={styles.greetingText}>Hi {viewerName},</Text>
              <Text style={styles.helpText}>{`I'm here as ${viewedUserFullName}'s AI family coach.`}</Text>
              <Text style={styles.supportText}>{greetingSubtitle}</Text>
            </View>
          )}

          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={[
              styles.messagesContent,
              showQuickActions && messages.length === 0 && styles.messagesContentCentered,
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {showQuickActions && messages.length === 0 ? (
              <>
                <Text style={styles.quickActionsTitle}>Things you can do for {viewedUserFullName}</Text>
                {quickActions.map((action) => (
                  <TouchableOpacity
                    key={action.id}
                    style={styles.quickActionCard}
                    onPress={() => handleQuickAction(action)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.quickActionIcon, { backgroundColor: action.iconColor }]}>
                      <Ionicons name={action.icon as keyof typeof Ionicons.glyphMap} size={24} color="#FFFFFF" />
                    </View>
                    <View style={styles.quickActionContent}>
                      <Text style={styles.quickActionTitle}>{action.title}</Text>
                      <Text style={styles.quickActionDescription}>{action.description}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </>
            ) : (
              <>
                {messages.map((message) => (
                  <View
                    key={message.id}
                    style={[
                      styles.messageContainer,
                      message.role === 'user' ? styles.userMessage : styles.assistantMessage,
                    ]}
                  >
                    <Text
                      style={[
                        styles.messageText,
                        message.role === 'user' ? styles.userMessageText : styles.assistantMessageText,
                      ]}
                    >
                      {message.content}
                    </Text>
                  </View>
                ))}
                {loading && (
                  <View style={[styles.messageContainer, styles.assistantMessage]}>
                    <ActivityIndicator size="small" color={Colors.primary} />
                  </View>
                )}
              </>
            )}
          </ScrollView>

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder={`Ask about ${viewedUserFullName}'s wellbeing`}
              placeholderTextColor={Colors.textSecondary}
              multiline
              maxLength={500}
              onSubmitEditing={handleSend}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.sendButton, (!inputText.trim() || loading) && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim() || loading}
            >
              <Ionicons
                name="send"
                size={20}
                color={inputText.trim() && !loading ? Colors.white : Colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
    position: 'relative',
  },
  gradientBorderLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    zIndex: 1000,
  },
  gradientBorderRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 3,
    zIndex: 1000,
  },
  gradientLine: {
    flex: 1,
    width: '100%',
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  keyboardView: {
    flex: 1,
  },
  greetingSection: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 10,
  },
  brainIconContainer: {
    marginBottom: 12,
    marginLeft: -4,
  },
  greetingText: {
    fontSize: 30,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 6,
  },
  helpText: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  supportText: {
    fontSize: 16,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 20,
    paddingBottom: 20,
  },
  messagesContentCentered: {
    paddingTop: 0,
  },
  quickActionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 16,
  },
  quickActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  quickActionContent: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  quickActionDescription: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  messageContainer: {
    maxWidth: '80%',
    marginBottom: 12,
    padding: 12,
    borderRadius: 16,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.primary,
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userMessageText: {
    color: Colors.white,
  },
  assistantMessageText: {
    color: Colors.text,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: Colors.text,
    maxHeight: 100,
    minHeight: 40,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: Colors.border,
  },
});


