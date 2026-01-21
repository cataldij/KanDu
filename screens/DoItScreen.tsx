/**
 * DoItScreen - AI Home Assistant with Chat Interface
 * Users can ask anything about home improvement and get help
 */

import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { GoogleGenerativeAI } from '@google/generative-ai';
import HouseIcon from '../components/HouseIcon';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_API_KEY || '');

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// Quick action buttons
const QUICK_ACTIONS = [
  { id: 'fix', icon: 'construct', label: 'Fix Something', color: '#1E90FF' },
  { id: 'learn', icon: 'bulb', label: 'Learn How', color: '#4A90E2' },
  { id: 'plan', icon: 'clipboard', label: 'Plan Project', color: '#00CBA9' },
  { id: 'cost', icon: 'calculator', label: 'Estimate Cost', color: '#7B68EE' },
  { id: 'safety', icon: 'shield-checkmark', label: 'Safety Check', color: '#10b981' },
  { id: 'find', icon: 'search', label: 'Find Parts', color: '#f59e0b' },
];

// Suggested prompts
const SUGGESTED_PROMPTS = [
  "What's the easiest home improvement project for a beginner?",
  "How do I know if I need a professional?",
  "What tools should every homeowner have?",
  "How can I make my home more energy efficient?",
  "What maintenance should I do each season?",
  "How do I find a good contractor?",
];

export default function DoItScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  useEffect(() => {
    const keyboardDidShow = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardVisible(true);
    });
    const keyboardDidHide = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
    });

    return () => {
      keyboardDidShow.remove();
      keyboardDidHide.remove();
    };
  }, []);

  useEffect(() => {
    // Scroll to bottom when new messages arrive
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const messageText = text || inputText.trim();
    if (!messageText || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setLoading(true);

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      // Build conversation history for context
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }],
      }));

      const systemPrompt = `You are KanDu, a friendly and knowledgeable AI home assistant. You help homeowners with:
- DIY repairs and maintenance
- Home improvement projects
- Understanding how things work
- Finding the right tools and materials
- Safety advice
- Cost estimates
- When to call a professional

Be conversational, helpful, and encouraging. Use simple language that anyone can understand.
Keep responses concise but thorough - aim for 2-4 paragraphs maximum unless the user asks for detailed instructions.
If someone needs step-by-step help or a diagnosis, encourage them to use the Fix It or Plan It features in the app.

Important: You're chatting with a homeowner who may be stressed about a home issue. Be reassuring and practical.`;

      const chat = model.startChat({
        history: [
          {
            role: 'user',
            parts: [{ text: systemPrompt }],
          },
          {
            role: 'model',
            parts: [{ text: "I understand! I'm KanDu, your friendly home assistant. I'm here to help with any home-related questions - from simple fixes to major projects. What can I help you with today?" }],
          },
          ...conversationHistory,
        ],
      });

      const result = await chat.sendMessage(messageText);
      const responseText = result.response.text();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAction = (action: typeof QUICK_ACTIONS[0]) => {
    switch (action.id) {
      case 'fix':
        navigation.navigate('Diagnosis', { category: 'other' });
        break;
      case 'learn':
        navigation.navigate('LearnIt' as any);
        break;
      case 'plan':
        navigation.navigate('PlanIt' as any);
        break;
      case 'cost':
        sendMessage("Can you help me estimate the cost for a home improvement project?");
        break;
      case 'safety':
        sendMessage("What safety precautions should I take for DIY projects?");
        break;
      case 'find':
        sendMessage("Where can I find parts and materials for home repairs?");
        break;
    }
  };

  const renderMessage = (message: Message) => {
    const isUser = message.role === 'user';

    return (
      <View
        key={message.id}
        style={[
          styles.messageContainer,
          isUser ? styles.userMessageContainer : styles.assistantMessageContainer,
        ]}
      >
        {!isUser && (
          <View style={styles.assistantAvatar}>
            <Text style={styles.avatarEmoji}>🏠</Text>
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          <Text style={[styles.messageText, isUser && styles.userMessageText]}>
            {message.content}
          </Text>
        </View>
      </View>
    );
  };

  // Empty state / Welcome screen
  const renderWelcome = () => (
    <View style={styles.welcomeContainer}>
      {/* Hero Gradient Area - Milky/airy gradient */}
      <LinearGradient
        colors={['#0f172a', '#FF8B5E', '#D4E8ED']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.heroGradient, { paddingTop: insets.top }]}
      >
        {/* Glass sheen overlay */}
        <LinearGradient
          pointerEvents="none"
          colors={[
            'rgba(255,255,255,0.35)',
            'rgba(255,255,255,0.14)',
            'rgba(255,255,255,0.00)',
          ]}
          locations={[0, 0.45, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {/* Ghost checkmark watermark */}
        <View style={styles.heroWatermark} pointerEvents="none">
          <Svg width={800} height={400} viewBox="25 30 50 30">
            <Path
              d="M38 46 L46 54 L62 38"
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>

        {/* Back Button */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={28} color="#ffffff" />
          <Text style={styles.backButtonText}>KanDu™</Text>
        </TouchableOpacity>

        {/* Hero Content */}
        <View style={styles.heroContent}>
          <HouseIcon
            icon="chatbubbles"
            size={84}
            gradientColors={['#ffffff', '#fed7aa', '#fdba74']}
          />
          <Text style={styles.heroTitle}>Hey there!</Text>
          <Text style={styles.heroSubtitle}>
            I'm KanDu, your AI home assistant. Ask me anything about home improvement!
          </Text>
        </View>
      </LinearGradient>

      {/* Quick Actions */}
      <View style={styles.quickActionsSection}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.quickActionsGrid}>
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.id}
              style={styles.quickActionCard}
              onPress={() => handleQuickAction(action)}
              activeOpacity={0.7}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: action.color }]}>
                <Ionicons name={action.icon as any} size={24} color="#fff" />
              </View>
              <Text style={styles.quickActionLabel}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Suggested Prompts */}
      <View style={styles.suggestedSection}>
        <Text style={styles.sectionTitle}>Try asking...</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestedScroll}
        >
          {SUGGESTED_PROMPTS.map((prompt, index) => (
            <TouchableOpacity
              key={index}
              style={styles.suggestedChip}
              onPress={() => sendMessage(prompt)}
            >
              <Text style={styles.suggestedText}>{prompt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      {/* Always show Welcome/Hero when no messages */}
      {messages.length === 0 ? (
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.welcomeScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderWelcome()}
        </ScrollView>
      ) : (
        <>
          {/* Mini Hero for Chat Mode */}
          <LinearGradient
            colors={['#0f172a', '#FF8B5E', '#D4E8ED']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[styles.chatHeroGradient, { paddingTop: insets.top }]}
          >
            {/* Glass sheen overlay */}
            <LinearGradient
              pointerEvents="none"
              colors={[
                'rgba(255,255,255,0.35)',
                'rgba(255,255,255,0.14)',
                'rgba(255,255,255,0.00)',
              ]}
              locations={[0, 0.45, 1]}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.8, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            {/* Back Button */}
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backButton}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={28} color="#ffffff" />
              <Text style={styles.backButtonText}>KanDu™</Text>
            </TouchableOpacity>

            {/* Chat Header */}
            <View style={styles.chatHeaderRow}>
              <View style={styles.chatHeaderIcon}>
                <Text style={styles.chatHeaderEmoji}>🏠</Text>
              </View>
              <Text style={styles.chatHeaderTitle}>KanDu Assistant</Text>
            </View>
          </LinearGradient>

          <ScrollView
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >

            {/* Messages */}
            {messages.map(renderMessage)}

            {/* Loading indicator */}
            {loading && (
              <View style={styles.loadingContainer}>
                <View style={styles.assistantAvatar}>
                  <Text style={styles.avatarEmoji}>🏠</Text>
                </View>
                <View style={styles.loadingBubble}>
                  <ActivityIndicator size="small" color="#FF6B35" />
                  <Text style={styles.loadingText}>Thinking...</Text>
                </View>
              </View>
            )}

            {/* Quick Actions in Chat */}
            {!keyboardVisible && messages.length > 0 && !loading && (
              <View style={styles.chatQuickActions}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chatQuickActionsScroll}
                >
                  {QUICK_ACTIONS.slice(0, 4).map((action) => (
                    <TouchableOpacity
                      key={action.id}
                      style={styles.chatQuickActionChip}
                      onPress={() => handleQuickAction(action)}
                    >
                      <Ionicons name={action.icon as any} size={16} color={action.color} />
                      <Text style={[styles.chatQuickActionText, { color: action.color }]}>
                        {action.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </ScrollView>
        </>
      )}

      {/* Input Area */}
      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="Ask me anything about home improvement..."
            placeholderTextColor="#94a3b8"
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={1000}
            onSubmitEditing={() => sendMessage()}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || loading) && styles.sendButtonDisabled,
            ]}
            onPress={() => sendMessage()}
            disabled={!inputText.trim() || loading}
          >
            {loading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#D4E8ED',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
    paddingTop: 16,
  },
  welcomeScrollContent: {
    flexGrow: 1,
  },

  // Welcome Screen
  welcomeContainer: {
    flex: 1,
  },

  // Hero Gradient (MainHomeScreen style)
  heroGradient: {
    paddingBottom: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  chatHeroGradient: {
    paddingBottom: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  heroWatermark: {
    position: 'absolute',
    top: 20,
    right: -270,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '500',
  },
  heroContent: {
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 20,
  },
  chatHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 8,
  },

  // Quick Actions
  quickActionsSection: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E5AA8',
    marginBottom: 16,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickActionCard: {
    width: (SCREEN_WIDTH - 52) / 3,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickActionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
  },

  // Suggested Prompts
  suggestedSection: {
    marginTop: 24,
    paddingLeft: 20,
  },
  suggestedScroll: {
    paddingRight: 20,
    gap: 10,
  },
  suggestedChip: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    maxWidth: 280,
  },
  suggestedText: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 18,
  },

  // Chat Header
  chatHeaderIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatHeaderEmoji: {
    fontSize: 20,
  },
  chatHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Messages
  messageContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  assistantMessageContainer: {
    justifyContent: 'flex-start',
  },
  assistantAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEmoji: {
    fontSize: 18,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 14,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: '#FF6B35',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  messageText: {
    fontSize: 15,
    color: '#1e293b',
    lineHeight: 22,
  },
  userMessageText: {
    color: '#fff',
  },

  // Loading
  loadingContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#64748b',
    fontStyle: 'italic',
  },

  // Chat Quick Actions
  chatQuickActions: {
    paddingVertical: 12,
  },
  chatQuickActionsScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chatQuickActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  chatQuickActionText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Input Area
  inputContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 28 : 12,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#f8fafc',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
    maxHeight: 100,
    paddingVertical: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF6B35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
});
