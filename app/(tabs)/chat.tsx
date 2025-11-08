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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { chatWithAI, setClerkTokenGetter } from '../../lib/api';
import { useAuth, useUser } from '@clerk/clerk-expo';

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
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const initialMessageSent = useRef(false);

  const userName = user?.firstName || user?.fullName?.split(' ')[0] || 'there';

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
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: error?.response?.data?.error || 'Sorry, I encountered an error. Please try again.',
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

      <SafeAreaView style={styles.safeArea} edges={['top']}>
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
              <Text style={styles.greetingText}>Hey {userName}!</Text>
              <Text style={styles.helpText}>How can I help you?</Text>
            </View>
          )}

          <ScrollView
            ref={scrollViewRef}
            style={styles.messagesContainer}
            contentContainerStyle={[
              styles.messagesContent,
              showQuickActions && messages.length === 0 && styles.messagesContentCentered,
            ]}
          >
            {showQuickActions && messages.length === 0 ? (
              <>
                <Text style={styles.quickActionsTitle}>Things you can do!</Text>
                {quickActions.map((action) => (
                  <TouchableOpacity
                    key={action.id}
                    style={styles.quickActionCard}
                    onPress={() => handleQuickAction(action)}
                    activeOpacity={0.7}
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
              placeholder="Say hello 👋"
              placeholderTextColor={Colors.textSecondary}
              multiline
              maxLength={500}
              onSubmitEditing={handleSend}
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
    paddingBottom: 100, // Add padding to ensure input is above tab bar
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
    fontSize: 32,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 8,
  },
  helpText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 24,
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