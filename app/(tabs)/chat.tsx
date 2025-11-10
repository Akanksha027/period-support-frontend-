import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { chatWithAI, setClerkTokenGetter, getUserInfo } from '../../lib/api';
import { useAuth, useUser } from '@clerk/clerk-expo';
import PeriLoader from '../../components/PeriLoader';

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
  message: string;
}

const quickActions: QuickAction[] = [
  {
    id: 'symptom-help',
    title: 'Symptom Advice',
    description: 'Get help with period symptoms and relief tips',
    icon: 'medical-outline',
    iconColor: '#FFD700',
    message: 'I need help with my period symptoms. Can you provide advice?',
  },
  {
    id: 'cycle-info',
    title: 'Cycle Information',
    description: 'Learn about your cycle phases and predictions',
    icon: 'calendar-outline',
    iconColor: '#7DD3FC',
    message: 'Can you explain my cycle phases and what to expect?',
  },
  {
    id: 'health-tips',
    title: 'Health Tips',
    description: 'Get personalized health and wellness guidance',
    icon: 'heart-outline',
    iconColor: '#FFB6C1',
    message: 'What health tips do you have for me based on my cycle?',
  },
];

export default function ChatScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { getToken } = useAuth();
  const params = useLocalSearchParams<{ initialMessage?: string }>();
  const insets = useSafeAreaInsets();
  const TAB_BAR_HEIGHT = 78;
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const initialMessageSent = useRef(false);
  const ensuredUserRef = useRef(false);

  const userName = user?.firstName || user?.fullName?.split(' ')[0] || 'there';

  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
      }
    );
    const keyboardWillHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
      }
    );

    return () => {
      keyboardWillHideListener.remove();
      keyboardWillShowListener.remove();
    };
  }, []);

  useEffect(() => {
    if (getToken) {
      setClerkTokenGetter(getToken);
    }
  }, [getToken]);

  useEffect(() => {
    if (params.initialMessage && !initialMessageSent.current) {
      initialMessageSent.current = true;
      setShowQuickActions(false);
      setTimeout(() => {
        handleSendMessage(params.initialMessage!);
      }, 500);
    }
  }, [params.initialMessage]);

  useEffect(() => {
    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }, [messages]);

  const handleSendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() || loading) return;

    if (showQuickActions) {
      setShowQuickActions(false);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText.trim(),
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputText('');
    setLoading(true);

    try {
      if (!ensuredUserRef.current) {
        try {
          await getUserInfo();
          ensuredUserRef.current = true;
        } catch (ensureError: any) {
          console.error('[Chat] Failed to ensure user exists before chatting:', ensureError);
          if (ensureError?.response?.status === 404) {
            ensuredUserRef.current = false;
            throw ensureError;
          }
        }
      }

      const messagesArray = updatedMessages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      console.log('[Chat] Sending messages:', messagesArray);
      const response = await chatWithAI(messagesArray);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response || 'I understand your question. Let me help you with that.',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('[Chat] Error details:', error);
      ensuredUserRef.current = false;
      let fallbackMessage =
        error?.response?.data?.error ||
        error?.friendlyMessage ||
        'Sorry, I encountered an error. Please try again.';

      if (error?.response?.status === 404) {
        fallbackMessage =
          "I couldn't find your tracking data yet. Please finish setting up your profile and log at least one period so I can give personalised guidance.";
      }

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: fallbackMessage,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading, showQuickActions]);

  const handleSend = useCallback(() => {
    handleSendMessage(inputText);
  }, [inputText, handleSendMessage]);

  const handleQuickAction = useCallback((action: QuickAction) => {
    handleSendMessage(action.message);
  }, [handleSendMessage]);

  return (
    <View style={styles.container}>
      <View style={styles.gradientBarContainer} pointerEvents="none">
        <LinearGradient
          colors={['#FF6B35', '#FF8E53', '#FFB3B3', '#E8B4F0', '#C8A2F0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.gradientBar}
        />
      </View>

      <SafeAreaView 
        style={styles.safeArea} 
        edges={['top']}
      >
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <ScrollView
            ref={scrollViewRef}
            style={styles.contentContainer}
            contentContainerStyle={styles.contentWrapper}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.greetingSection}>
              <View style={styles.brainIconContainer}>
                <Ionicons name="sparkles" size={28} color="#9B8EE8" />
              </View>
              <Text style={styles.greetingText}>Hey {userName}!</Text>
              <Text style={styles.helpText}>How can I help you?</Text>
            </View>

            {showQuickActions && messages.length === 0 && (
              <View style={styles.quickActionsContainer}>
                <Text style={styles.quickActionsTitle}>Things you can do!</Text>
                <View style={styles.quickActionsCards}>
                  {quickActions.map((action) => (
                    <TouchableOpacity
                      key={action.id}
                      style={styles.quickActionCard}
                      onPress={() => handleQuickAction(action)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.quickActionIcon, { backgroundColor: action.iconColor }]}>
                        <Ionicons name={action.icon as keyof typeof Ionicons.glyphMap} size={22} color="#FFFFFF" />
                      </View>
                      <View style={styles.quickActionContent}>
                        <Text style={styles.quickActionTitle}>{action.title}</Text>
                        <Text style={styles.quickActionDescription}>{action.description}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {!showQuickActions && (
              <View style={styles.messagesWrapper}>
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
                  <View style={[styles.messageContainer, styles.assistantMessage, styles.loaderMessage]}>
                    <PeriLoader size={100} containerStyle={styles.loaderLottieContainer} />
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          <View style={[styles.inputContainer, keyboardVisible && styles.inputContainerKeyboard]}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Say hello 👋"
              placeholderTextColor={Colors.textSecondary}
              multiline
              maxLength={500}
              onSubmitEditing={handleSend}
              returnKeyType="send"
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[styles.sendButton, (!inputText.trim() || loading) && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim() || loading}
              activeOpacity={0.7}
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
  },
  gradientBarContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 12,
    zIndex: 1000,
  },
  gradientBar: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  keyboardView: {
    flex: 1,
  },
  contentContainer: {
    flex: 1,
  },
  contentWrapper: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  greetingSection: {
    paddingTop: 24,
    paddingBottom: 16,
  },
  brainIconContainer: {
    marginBottom: 8,
  },
  greetingText: {
    fontSize: 30,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  helpText: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.text,
    letterSpacing: -0.5,
  },
  quickActionsContainer: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  quickActionsTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 14,
  },
  quickActionsCards: {
    gap: 10,
  },
  quickActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.04)',
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  quickActionContent: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
    letterSpacing: -0.2,
  },
  quickActionDescription: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  messagesWrapper: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  messageContainer: {
    maxWidth: '78%',
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 4,
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 4,
  },
  loaderMessage: {
    backgroundColor: 'transparent',
    padding: 0,
  },
  loaderLottieContainer: {
    backgroundColor: 'transparent',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  userMessageText: {
    color: Colors.white,
  },
  assistantMessageText: {
    color: Colors.text,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.06)',
    gap: 10,
    marginBottom: 78,
  },
  inputContainerKeyboard: {
    marginBottom: 0,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    color: Colors.text,
    maxHeight: 100,
    minHeight: 44,
    lineHeight: 20,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 0,
  },
  sendButtonDisabled: {
    backgroundColor: Colors.border,
    opacity: 0.6,
  },
});