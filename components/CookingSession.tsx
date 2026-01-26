/**
 * CookingSession - Step-by-step cooking guide with hybrid navigation
 *
 * Features:
 * - AI-expanded detailed steps (from basic recipe steps)
 * - Stories-style progress bar with tap-to-jump
 * - Swipe and edge-tap navigation
 * - Rich step content: visual cues, tips, equipment, warnings
 * - Voice-first Q&A with text fallback
 * - Spot Check integration
 * - Auto-voice narration
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
  PanResponder,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { GoogleGenerativeAI } from '@google/generative-ai';
import AnimatedLogo from './AnimatedLogo';
import SpotCheckScanner from './SpotCheckScanner';

// Dynamic import for speech recognition (only works in dev build)
let ExpoSpeechRecognitionModule: any = null;
try {
  const speechRecognition = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = speechRecognition.ExpoSpeechRecognitionModule;
} catch (e) {
  console.log('[CookingSession] Speech recognition not available');
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const EDGE_TAP_ZONE = 60;

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_API_KEY || '');

// Chat message for conversation history
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Rich step structure from AI expansion
interface ExpandedStep {
  stepNumber: number;
  mainInstruction: string;
  timeEstimate: string;
  visualCue: string;
  techniqueTip?: string;
  equipment?: string[];
  commonMistake?: string;
  chefTip?: string;
  safetyWarning?: string;
  ingredientNotes?: string;
}

interface CookingSessionProps {
  recipeName: string;
  steps: string[];
  ingredients?: string[];
  onClose: () => void;
  onComplete?: () => void;
  accentColor?: string;
}

export const CookingSession: React.FC<CookingSessionProps> = ({
  recipeName,
  steps,
  ingredients = [],
  onClose,
  onComplete,
  accentColor = '#FF6B35',
}) => {
  const insets = useSafeAreaInsets();

  // Session state
  const [isLoading, setIsLoading] = useState(true);
  const [expandedSteps, setExpandedSteps] = useState<ExpandedStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // Timer state
  const [timerActive, setTimerActive] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Voice Q&A state - sleek overlay mode
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing' | 'response'>('idle');
  const [transcript, setTranscript] = useState('');
  const [qaResponse, setQaResponse] = useState<string | null>(null);
  const speechListenerRef = useRef<any>(null);
  const responseAnim = useRef(new Animated.Value(0)).current;
  const listeningAnim = useRef(new Animated.Value(0)).current;

  // Text chat state
  const [showChat, setShowChat] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isProcessingChat, setIsProcessingChat] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);
  const chatInputAnim = useRef(new Animated.Value(0)).current;

  // Spot Check state
  const [showSpotCheck, setShowSpotCheck] = useState(false);

  // Animation refs
  const progressAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const totalSteps = expandedSteps.length;
  const currentStepData = expandedSteps[currentStep];

  // Expand steps with AI on mount
  useEffect(() => {
    expandStepsWithAI();
  }, []);

  // Pulse animation for listening state
  useEffect(() => {
    if (voiceState === 'listening') {
      // Animate in the overlay
      Animated.timing(listeningAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      // Pulse the mic
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else if (voiceState === 'idle') {
      listeningAnim.setValue(0);
      pulseAnim.setValue(1);
    }
  }, [voiceState]);

  // Animate response bubble in/out
  useEffect(() => {
    if (voiceState === 'response' && qaResponse) {
      Animated.spring(responseAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();
    } else if (voiceState === 'idle') {
      responseAnim.setValue(0);
    }
  }, [voiceState, qaResponse]);

  // Chat overlay animation
  useEffect(() => {
    Animated.timing(chatInputAnim, {
      toValue: showChat ? 1 : 0,
      duration: 250,
      useNativeDriver: true,
    }).start();
  }, [showChat]);

  // Timer effect
  useEffect(() => {
    if (timerActive && timerSeconds > 0) {
      timerRef.current = setTimeout(() => {
        setTimerSeconds(prev => prev - 1);
      }, 1000);
    } else if (timerActive && timerSeconds === 0) {
      setTimerActive(false);
      Speech.speak('Timer complete!', { language: 'en-US' });
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timerActive, timerSeconds]);

  // Progress bar animation
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: currentStep,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [currentStep]);

  // Auto-speak when step changes (only after loading)
  useEffect(() => {
    if (!isLoading && expandedSteps.length > 0) {
      const timer = setTimeout(() => {
        speakCurrentStep();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [currentStep, isLoading, expandedSteps]);

  // Expand basic steps into rich detailed steps using AI
  const expandStepsWithAI = async () => {
    setIsLoading(true);

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      const prompt = `You are a professional chef assistant. Expand these basic recipe steps into detailed cooking guidance.

Recipe: ${recipeName}
Ingredients: ${ingredients.join(', ')}

Basic steps:
${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

For EACH step, provide detailed guidance in this exact JSON format:
{
  "steps": [
    {
      "stepNumber": 1,
      "mainInstruction": "Detailed, clear instruction (2-3 sentences with specific technique)",
      "timeEstimate": "X-Y minutes" or "X seconds",
      "visualCue": "What to look for when this step is done correctly",
      "techniqueTip": "Pro technique to do this better (optional, include for most steps)",
      "equipment": ["item1", "item2"] (optional, only if specific equipment needed),
      "commonMistake": "What NOT to do (optional, include if there's a common pitfall)",
      "chefTip": "Professional insight that elevates the dish (optional)",
      "safetyWarning": "Safety concern if applicable (optional, only for heat/sharp/raw meat)",
      "ingredientNotes": "Prep notes for ingredients in this step (optional)"
    }
  ]
}

Make instructions conversational and encouraging. Be specific about temperatures, times, and visual indicators. Return ONLY valid JSON.`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      // Parse JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.steps && Array.isArray(parsed.steps)) {
          setExpandedSteps(parsed.steps);
        } else {
          throw new Error('Invalid response structure');
        }
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (error) {
      console.error('[CookingSession] Failed to expand steps:', error);
      // Fallback: create basic expanded steps from original
      const fallbackSteps: ExpandedStep[] = steps.map((step, idx) => ({
        stepNumber: idx + 1,
        mainInstruction: step,
        timeEstimate: '1-2 minutes',
        visualCue: 'Complete this step before moving on',
      }));
      setExpandedSteps(fallbackSteps);
    } finally {
      setIsLoading(false);
    }
  };

  // Parse time estimate to seconds for timer
  const parseTimeToSeconds = (timeStr: string): number => {
    const minMatch = timeStr.match(/(\d+)(?:-\d+)?\s*min/i);
    const secMatch = timeStr.match(/(\d+)(?:-\d+)?\s*sec/i);

    if (minMatch) return parseInt(minMatch[1]) * 60;
    if (secMatch) return parseInt(secMatch[1]);
    return 60; // Default 1 minute
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startTimer = () => {
    if (currentStepData?.timeEstimate) {
      const seconds = parseTimeToSeconds(currentStepData.timeEstimate);
      setTimerSeconds(seconds);
      setTimerActive(true);
    }
  };

  // Voice functions
  const speakCurrentStep = useCallback(() => {
    if (!currentStepData) return;

    setIsSpeaking(true);
    const text = `Step ${currentStepData.stepNumber}. ${currentStepData.mainInstruction}`;

    Speech.speak(text, {
      language: 'en-US',
      rate: 0.9,
      pitch: 1.0,
      onDone: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  }, [currentStepData]);

  const stopSpeaking = () => {
    Speech.stop();
    setIsSpeaking(false);
  };

  // Cleanup speech recognition listeners
  const cleanupListeners = () => {
    if (speechListenerRef.current) {
      if (speechListenerRef.current.result) speechListenerRef.current.result.remove();
      if (speechListenerRef.current.error) speechListenerRef.current.error.remove();
      if (speechListenerRef.current.end) speechListenerRef.current.end.remove();
      speechListenerRef.current = null;
    }
  };

  // Start voice Q&A - immediately begins listening
  const startVoiceQA = async () => {
    // Check if speech recognition is available
    if (!ExpoSpeechRecognitionModule) {
      Alert.alert('Not Available', 'Voice questions require a development build.');
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      stopSpeaking(); // Stop any ongoing speech
      setVoiceState('listening');
      setTranscript('');
      setQaResponse(null);

      // Request permission
      const { status } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Microphone access is required for voice questions.');
        setVoiceState('idle');
        return;
      }

      // Set up result listener
      const resultListener = ExpoSpeechRecognitionModule.addListener('result', (event: any) => {
        if (event.results && event.results.length > 0) {
          const currentTranscript = event.results[0]?.transcript || '';
          setTranscript(currentTranscript);
        }

        if (event.isFinal) {
          const finalText = event.results?.[0]?.transcript || '';
          processVoiceQuestion(finalText);
        }
      });

      // Set up error listener
      const errorListener = ExpoSpeechRecognitionModule.addListener('error', (event: any) => {
        console.error('[CookingSession] Speech error:', event);
        cleanupListeners();
        setVoiceState('idle');
      });

      // Set up end listener
      const endListener = ExpoSpeechRecognitionModule.addListener('end', () => {
        cleanupListeners();
        if (voiceState === 'listening') {
          // If still in listening state, process what we have
          if (transcript.length > 3) {
            processVoiceQuestion(transcript);
          } else {
            setVoiceState('idle');
          }
        }
      });

      // Store listeners for cleanup
      speechListenerRef.current = {
        result: resultListener,
        error: errorListener,
        end: endListener,
      };

      // Start recognition
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
      });

    } catch (error) {
      console.error('[CookingSession] Voice QA error:', error);
      cleanupListeners();
      setVoiceState('idle');
    }
  };

  // Stop listening manually
  const stopListening = () => {
    if (ExpoSpeechRecognitionModule) {
      ExpoSpeechRecognitionModule.stop();
    }
    cleanupListeners();

    // Process what we have if there's meaningful transcript
    if (transcript.length > 3) {
      processVoiceQuestion(transcript);
    } else {
      setVoiceState('idle');
    }
  };

  // Process the voice question through AI
  const processVoiceQuestion = async (questionText: string) => {
    if (!questionText.trim() || questionText.length < 3) {
      setVoiceState('idle');
      return;
    }

    setVoiceState('processing');
    cleanupListeners();

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      const prompt = `You are KanDu, a friendly cooking assistant. The user is making "${recipeName}" and is on step ${currentStepData?.stepNumber}: "${currentStepData?.mainInstruction}"

Recipe context:
- Ingredients: ${ingredients.join(', ')}
- Current step: ${JSON.stringify(currentStepData)}

User asks: "${questionText}"

Give a brief, helpful answer (2-3 sentences max). Be warm, conversational, and specific. Don't repeat the question.`;

      const result = await model.generateContent(prompt);
      const response = result.response.text();
      setQaResponse(response);
      setVoiceState('response');

      // Speak the response
      Speech.speak(response, {
        language: 'en-US',
        rate: 0.95,
        pitch: 1.0,
      });
    } catch (error) {
      console.error('[CookingSession] Q&A error:', error);
      setQaResponse("Sorry, I couldn't process that. Try again?");
      setVoiceState('response');
    }
  };

  // Dismiss the response bubble
  const dismissResponse = () => {
    Speech.stop();
    setVoiceState('idle');
    setQaResponse(null);
    setTranscript('');
  };

  // Toggle chat overlay
  const toggleChat = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (showChat) {
      Keyboard.dismiss();
      setShowChat(false);
    } else {
      stopSpeaking();
      setShowChat(true);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: false }), 100);
    }
  };

  // Process text chat message with conversation history
  const sendChatMessage = async () => {
    const message = textInput.trim();
    if (!message || isProcessingChat) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTextInput('');
    setIsProcessingChat(true);

    // Add user message to history
    const userMessage: ChatMessage = { role: 'user', content: message };
    setChatHistory(prev => [...prev, userMessage]);

    // Scroll to bottom
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      // Build conversation history for context
      const historyText = chatHistory
        .map(msg => `${msg.role === 'user' ? 'User' : 'KanDu'}: ${msg.content}`)
        .join('\n');

      const prompt = `You are KanDu, a friendly cooking assistant. The user is making "${recipeName}" and is on step ${currentStepData?.stepNumber}: "${currentStepData?.mainInstruction}"

Recipe context:
- Ingredients: ${ingredients.join(', ')}
- Current step: ${JSON.stringify(currentStepData)}

${historyText ? `Previous conversation:\n${historyText}\n` : ''}
User asks: "${message}"

Give a brief, helpful answer (2-3 sentences max). Be warm, conversational, and specific. Don't repeat the question.`;

      const result = await model.generateContent(prompt);
      const response = result.response.text();

      // Add assistant message to history
      setChatHistory(prev => [...prev, { role: 'assistant', content: response }]);

      // Scroll to bottom after response
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error) {
      console.error('[CookingSession] Chat error:', error);
      setChatHistory(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't process that. Try again?" }]);
    } finally {
      setIsProcessingChat(false);
    }
  };

  // Navigation
  const navigateToStep = (stepIndex: number, direction: 'left' | 'right' | 'direct' = 'direct') => {
    if (stepIndex < 0 || stepIndex >= totalSteps || stepIndex === currentStep) return;

    stopSpeaking();
    setTimerActive(false);

    const slideDirection = direction === 'direct'
      ? (stepIndex > currentStep ? 'left' : 'right')
      : direction;

    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: slideDirection === 'left' ? -50 : 50, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setCurrentStep(stepIndex);
      slideAnim.setValue(slideDirection === 'left' ? 50 : -50);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]).start();
    });
  };

  const nextStep = () => {
    if (currentStep < totalSteps - 1) {
      setCompletedSteps(prev => new Set([...prev, currentStep]));
      navigateToStep(currentStep + 1, 'left');
    } else {
      setCompletedSteps(prev => new Set([...prev, currentStep]));
      onComplete?.();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      navigateToStep(currentStep - 1, 'right');
    }
  };

  // Pan responder for swipe - only claim horizontal gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only claim if predominantly horizontal (dx > dy*2) and significant movement
        const isHorizontal = Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2;
        const isSignificant = Math.abs(gestureState.dx) > 20;
        return isHorizontal && isSignificant;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -50) nextStep();
        else if (gestureState.dx > 50) prevStep();
      },
    })
  ).current;

  const handleContentTap = (event: any) => {
    const { locationX } = event.nativeEvent;
    if (locationX < EDGE_TAP_ZONE) prevStep();
    else if (locationX > SCREEN_WIDTH - EDGE_TAP_ZONE - 40) nextStep();
  };

  // Render loading screen
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={['#0f172a', '#1e3a5f', '#0f172a']}
          style={StyleSheet.absoluteFill}
        />
        <AnimatedLogo size={140} isLoading={true} />
        <Text style={styles.loadingText}>Preparing your cooking guide...</Text>
        <Text style={styles.loadingSubtext}>{recipeName}</Text>
      </View>
    );
  }

  // Render progress bar
  const renderProgressBar = () => {
    const segmentWidth = (SCREEN_WIDTH - 40 - (totalSteps - 1) * 4) / totalSteps;

    return (
      <View style={styles.progressContainer}>
        {expandedSteps.map((_, index) => {
          const isCompleted = completedSteps.has(index);
          const isCurrent = index === currentStep;
          const isPast = index < currentStep;

          return (
            <TouchableOpacity
              key={index}
              style={[styles.progressSegment, { width: segmentWidth }]}
              onPress={() => navigateToStep(index)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.progressSegmentBg,
                  (isCompleted || isPast) && styles.progressSegmentCompleted,
                  isCurrent && styles.progressSegmentCurrent,
                ]}
              >
                {isCurrent && (
                  <Animated.View
                    style={[styles.progressSegmentFill, { backgroundColor: accentColor }]}
                  />
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  // Render step content
  const renderStepContent = () => {
    if (!currentStepData) return null;

    return (
      <Animated.View
        style={[
          styles.stepContent,
          { opacity: fadeAnim, transform: [{ translateX: slideAnim }] },
        ]}
        {...panResponder.panHandlers}
      >
        {/* Step header */}
        <View style={styles.stepHeader}>
          <View style={[styles.stepBadge, { backgroundColor: accentColor }]}>
            <Text style={styles.stepBadgeText}>Step {currentStepData.stepNumber}</Text>
          </View>
          <View style={styles.timeBadge}>
            <Ionicons name="time-outline" size={14} color="#94a3b8" />
            <Text style={styles.timeBadgeText}>{currentStepData.timeEstimate}</Text>
          </View>
        </View>

        <ScrollView
          style={styles.instructionScroll}
          contentContainerStyle={styles.instructionScrollContent}
          showsVerticalScrollIndicator={true}
        >
            {/* Main instruction */}
            <Text style={styles.mainInstruction}>{currentStepData.mainInstruction}</Text>

            {/* Visual cue - always show */}
            <View style={styles.visualCueCard}>
              <View style={styles.visualCueHeader}>
                <Ionicons name="eye" size={18} color="#22c55e" />
                <Text style={styles.visualCueLabel}>Look for</Text>
              </View>
              <Text style={styles.visualCueText}>{currentStepData.visualCue}</Text>
            </View>

            {/* Technique tip */}
            {currentStepData.techniqueTip && (
              <View style={styles.tipCard}>
                <View style={styles.tipHeader}>
                  <Ionicons name="bulb" size={18} color="#f59e0b" />
                  <Text style={styles.tipLabel}>Technique</Text>
                </View>
                <Text style={styles.tipText}>{currentStepData.techniqueTip}</Text>
              </View>
            )}

            {/* Equipment */}
            {currentStepData.equipment && currentStepData.equipment.length > 0 && (
              <View style={styles.equipmentCard}>
                <View style={styles.equipmentHeader}>
                  <Ionicons name="construct" size={16} color="#8b5cf6" />
                  <Text style={styles.equipmentLabel}>Equipment</Text>
                </View>
                <View style={styles.equipmentList}>
                  {currentStepData.equipment.map((item, i) => (
                    <View key={i} style={styles.equipmentPill}>
                      <Text style={styles.equipmentText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Common mistake */}
            {currentStepData.commonMistake && (
              <View style={styles.mistakeCard}>
                <View style={styles.mistakeHeader}>
                  <Ionicons name="warning" size={18} color="#ef4444" />
                  <Text style={styles.mistakeLabel}>Avoid</Text>
                </View>
                <Text style={styles.mistakeText}>{currentStepData.commonMistake}</Text>
              </View>
            )}

            {/* Chef tip */}
            {currentStepData.chefTip && (
              <View style={styles.chefTipCard}>
                <View style={styles.chefTipHeader}>
                  <Text style={styles.chefTipEmoji}>👨‍🍳</Text>
                  <Text style={styles.chefTipLabel}>Chef's tip</Text>
                </View>
                <Text style={styles.chefTipText}>{currentStepData.chefTip}</Text>
              </View>
            )}

            {/* Safety warning */}
            {currentStepData.safetyWarning && (
              <View style={styles.safetyCard}>
                <View style={styles.safetyHeader}>
                  <Ionicons name="shield-checkmark" size={18} color="#f97316" />
                  <Text style={styles.safetyLabel}>Safety</Text>
                </View>
                <Text style={styles.safetyText}>{currentStepData.safetyWarning}</Text>
              </View>
            )}

            {/* Timer button */}
            <View style={styles.timerSection}>
              {timerActive ? (
                <View style={styles.timerActive}>
                  <Text style={styles.timerDisplay}>{formatTime(timerSeconds)}</Text>
                  <TouchableOpacity
                    style={styles.timerCancelButton}
                    onPress={() => setTimerActive(false)}
                  >
                    <Ionicons name="close" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.timerStartButton, { borderColor: accentColor }]}
                  onPress={startTimer}
                >
                  <Ionicons name="timer-outline" size={20} color={accentColor} />
                  <Text style={[styles.timerStartText, { color: accentColor }]}>
                    Start {currentStepData.timeEstimate} timer
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>

        {/* Nav hints - edge tap zones */}
        <TouchableOpacity
          style={styles.navHintLeft}
          onPress={prevStep}
          activeOpacity={0.3}
        >
          {currentStep > 0 && (
            <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.4)" />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navHintRight}
          onPress={nextStep}
          activeOpacity={0.3}
        >
          {currentStep < totalSteps - 1 && (
            <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.4)" />
          )}
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // Render sleek voice overlay (listening + response states)
  const renderVoiceOverlay = () => {
    if (voiceState === 'idle') return null;

    return (
      <Animated.View
        style={[
          styles.voiceOverlay,
          {
            opacity: voiceState === 'listening' ? listeningAnim : 1,
          },
        ]}
        pointerEvents="box-none"
      >
        {/* Listening state - centered pulsing mic with transcript */}
        {voiceState === 'listening' && (
          <TouchableOpacity
            style={styles.listeningOverlay}
            activeOpacity={1}
            onPress={stopListening}
          >
            <View style={styles.listeningContent}>
              {/* Pulsing mic */}
              <Animated.View
                style={[
                  styles.listeningMicContainer,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              >
                <LinearGradient
                  colors={[accentColor, `${accentColor}CC`]}
                  style={styles.listeningMic}
                >
                  <Ionicons name="mic" size={36} color="#ffffff" />
                </LinearGradient>
              </Animated.View>

              {/* Real-time transcript */}
              <View style={styles.transcriptContainer}>
                {transcript ? (
                  <Text style={styles.transcriptText}>{transcript}</Text>
                ) : (
                  <Text style={styles.transcriptPlaceholder}>Listening...</Text>
                )}
              </View>

              <Text style={styles.listeningHint}>Tap anywhere to send</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Processing state - small indicator */}
        {voiceState === 'processing' && (
          <View style={styles.processingOverlay}>
            <View style={styles.processingBubble}>
              <ActivityIndicator size="small" color={accentColor} />
              <Text style={styles.processingText}>Thinking...</Text>
            </View>
          </View>
        )}

        {/* Response state - sleek floating bubble */}
        {voiceState === 'response' && qaResponse && (
          <TouchableOpacity
            style={styles.responseOverlay}
            activeOpacity={1}
            onPress={dismissResponse}
          >
            <Animated.View
              style={[
                styles.responseBubble,
                {
                  transform: [
                    { scale: responseAnim },
                    {
                      translateY: responseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [50, 0],
                      }),
                    },
                  ],
                  opacity: responseAnim,
                },
              ]}
            >
              <LinearGradient
                colors={['rgba(15, 23, 42, 0.95)', 'rgba(30, 58, 95, 0.95)']}
                style={styles.responseBubbleGradient}
              >
                <View style={styles.responseHeader}>
                  <View style={styles.responseKanduBadge}>
                    <Text style={styles.responseKanduText}>KanDu</Text>
                  </View>
                  <TouchableOpacity onPress={dismissResponse} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.responseText}>{qaResponse}</Text>
                <Text style={styles.responseDismissHint}>Tap to dismiss</Text>
              </LinearGradient>
            </Animated.View>
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0f172a', '#1e3a5f', '#0f172a']}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        {renderProgressBar()}

        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => { stopSpeaking(); onClose(); }}
            style={styles.closeButton}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>

          <Text style={styles.recipeName} numberOfLines={1}>{recipeName}</Text>

          <TouchableOpacity
            onPress={isSpeaking ? stopSpeaking : speakCurrentStep}
            style={[styles.voiceButton, isSpeaking && styles.voiceButtonActive]}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isSpeaking ? 'volume-high' : 'volume-medium-outline'}
              size={22}
              color="#ffffff"
            />
          </TouchableOpacity>
        </View>

        <Text style={styles.stepCounter}>{currentStep + 1} of {totalSteps}</Text>
      </View>

      {/* Step content */}
      {renderStepContent()}

      {/* Bottom controls */}
      <View style={[styles.bottomControls, { paddingBottom: Math.max(insets.bottom, 20) }]}>
        <View style={styles.actionButtonsRow}>
          <View style={styles.askButtonRow}>
            <TouchableOpacity
              style={[styles.askButton, { backgroundColor: `${accentColor}30` }]}
              onPress={startVoiceQA}
              activeOpacity={0.8}
            >
              <Ionicons name="mic" size={18} color="#ffffff" />
              <Text style={styles.askButtonText}>Ask KanDu</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chatToggleButton}
              onPress={toggleChat}
              activeOpacity={0.7}
            >
              <Ionicons name="chatbubble-ellipses-outline" size={16} color="rgba(255,255,255,0.8)" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.spotCheckButton}
            onPress={() => setShowSpotCheck(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="scan" size={18} color="#ffffff" />
            <Text style={styles.spotCheckText}>Spot Check</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.navButtons}>
          <TouchableOpacity
            style={[styles.navButton, currentStep === 0 && styles.navButtonDisabled]}
            onPress={prevStep}
            disabled={currentStep === 0}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={24} color={currentStep === 0 ? 'rgba(255,255,255,0.3)' : '#ffffff'} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navButtonPrimary, { backgroundColor: accentColor }]}
            onPress={nextStep}
            activeOpacity={0.8}
          >
            {currentStep === totalSteps - 1 ? (
              <>
                <Ionicons name="checkmark" size={24} color="#ffffff" />
                <Text style={styles.navButtonPrimaryText}>Done</Text>
              </>
            ) : (
              <>
                <Text style={styles.navButtonPrimaryText}>Next</Text>
                <Ionicons name="arrow-forward" size={24} color="#ffffff" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Voice Q&A Overlay */}
      {renderVoiceOverlay()}

      {/* Spot Check Modal */}
      <Modal
        visible={showSpotCheck}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowSpotCheck(false)}
      >
        <SpotCheckScanner
          onClose={() => setShowSpotCheck(false)}
          context="cooking"
          recipeName={recipeName}
          recipeIngredients={ingredients}
          currentStepInstruction={currentStepData?.mainInstruction}
        />
      </Modal>

      {/* Text Chat Overlay */}
      {showChat && (
        <KeyboardAvoidingView
          style={styles.chatOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <TouchableOpacity
            style={styles.chatBackdrop}
            activeOpacity={1}
            onPress={toggleChat}
          />
          <Animated.View
            style={[
              styles.chatContainer,
              { paddingBottom: insets.bottom },
              {
                transform: [{
                  translateY: chatInputAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [300, 0],
                  }),
                }],
                opacity: chatInputAnim,
              },
            ]}
          >
            <LinearGradient
              colors={['rgba(15, 23, 42, 0.98)', 'rgba(30, 58, 95, 0.98)']}
              style={styles.chatGradient}
            >
              {/* Chat header */}
              <View style={styles.chatHeader}>
                <View style={[styles.chatKanduBadge, { backgroundColor: `${accentColor}20` }]}>
                  <Ionicons name="chatbubble-ellipses" size={14} color={accentColor} />
                  <Text style={[styles.chatKanduText, { color: accentColor }]}>Chat with KanDu</Text>
                </View>
                <TouchableOpacity onPress={toggleChat} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={22} color="rgba(255,255,255,0.5)" />
                </TouchableOpacity>
              </View>

              {/* Chat messages */}
              <ScrollView
                ref={chatScrollRef}
                style={styles.chatMessages}
                contentContainerStyle={styles.chatMessagesContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {chatHistory.length === 0 && (
                  <View style={styles.chatEmptyState}>
                    <Ionicons name="restaurant-outline" size={32} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.chatEmptyText}>
                      Ask anything about this recipe
                    </Text>
                    <Text style={styles.chatEmptyHint}>
                      Substitutions, techniques, timing tips...
                    </Text>
                  </View>
                )}
                {chatHistory.map((msg, index) => (
                  <View
                    key={index}
                    style={[
                      styles.chatBubble,
                      msg.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAssistant,
                      msg.role === 'user' && { backgroundColor: accentColor },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chatBubbleText,
                        msg.role === 'user' && styles.chatBubbleTextUser,
                      ]}
                    >
                      {msg.content}
                    </Text>
                  </View>
                ))}
                {isProcessingChat && (
                  <View style={[styles.chatBubble, styles.chatBubbleAssistant]}>
                    <View style={styles.chatTypingIndicator}>
                      <ActivityIndicator size="small" color={accentColor} />
                      <Text style={styles.chatTypingText}>Thinking...</Text>
                    </View>
                  </View>
                )}
              </ScrollView>

              {/* Chat input */}
              <View style={styles.chatInputContainer}>
                <TextInput
                  style={styles.chatInput}
                  placeholder="Type your question..."
                  placeholderTextColor="rgba(255,255,255,0.4)"
                  value={textInput}
                  onChangeText={setTextInput}
                  onSubmitEditing={sendChatMessage}
                  returnKeyType="send"
                  autoFocus={true}
                  multiline={false}
                />
                <TouchableOpacity
                  style={[
                    styles.chatSendButton,
                    { backgroundColor: textInput.trim() && !isProcessingChat ? accentColor : 'rgba(255,255,255,0.1)' },
                  ]}
                  onPress={sendChatMessage}
                  disabled={!textInput.trim() || isProcessingChat}
                >
                  <Ionicons
                    name="send"
                    size={18}
                    color={textInput.trim() && !isProcessingChat ? '#ffffff' : 'rgba(255,255,255,0.3)'}
                  />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </Animated.View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginTop: 24,
  },
  loadingSubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 8,
  },
  header: {
    paddingHorizontal: 20,
  },
  progressContainer: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 16,
  },
  progressSegment: {
    height: 4,
  },
  progressSegmentBg: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressSegmentCompleted: {
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  progressSegmentCurrent: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  progressSegmentFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    borderRadius: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    marginHorizontal: 12,
  },
  voiceButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceButtonActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.3)',
  },
  stepCounter: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 8,
  },
  stepContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  stepBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  stepBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  timeBadgeText: {
    fontSize: 13,
    color: '#94a3b8',
  },
  instructionScroll: {
    flex: 1,
  },
  instructionScrollContent: {
    paddingBottom: 20,
    gap: 12,
  },
  mainInstruction: {
    fontSize: 20,
    fontWeight: '500',
    color: '#ffffff',
    lineHeight: 28,
    marginBottom: 8,
  },
  visualCueCard: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#22c55e',
  },
  visualCueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  visualCueLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#22c55e',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  visualCueText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 22,
  },
  tipCard: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  tipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f59e0b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tipText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 22,
  },
  equipmentCard: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 12,
    padding: 14,
  },
  equipmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  equipmentLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8b5cf6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  equipmentList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  equipmentPill: {
    backgroundColor: 'rgba(139, 92, 246, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  equipmentText: {
    fontSize: 14,
    color: '#c4b5fd',
  },
  mistakeCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#ef4444',
  },
  mistakeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  mistakeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ef4444',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  mistakeText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 22,
  },
  chefTipCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
  },
  chefTipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  chefTipEmoji: {
    fontSize: 16,
  },
  chefTipLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chefTipText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 22,
    fontStyle: 'italic',
  },
  safetyCard: {
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#f97316',
  },
  safetyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  safetyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#f97316',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  safetyText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 22,
  },
  timerSection: {
    marginTop: 8,
  },
  timerActive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    padding: 16,
    borderRadius: 16,
    gap: 16,
  },
  timerDisplay: {
    fontSize: 36,
    fontWeight: '700',
    color: '#22c55e',
    fontVariant: ['tabular-nums'],
  },
  timerCancelButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerStartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  timerStartText: {
    fontSize: 15,
    fontWeight: '600',
  },
  navHintLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navHintRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomControls: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  askButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: 10,
    gap: 6,
  },
  askButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  spotCheckButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  spotCheckText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  navButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  navButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonPrimary: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  navButtonPrimaryText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
  // Sleek voice overlay styles
  voiceOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  listeningOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listeningContent: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  listeningMicContainer: {
    marginBottom: 24,
  },
  listeningMic: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  transcriptContainer: {
    minHeight: 60,
    marginBottom: 16,
  },
  transcriptText: {
    fontSize: 22,
    fontWeight: '500',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 32,
  },
  transcriptPlaceholder: {
    fontSize: 20,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  listeningHint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  processingOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 200,
  },
  processingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 10,
  },
  processingText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#ffffff',
  },
  responseOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 180,
  },
  responseBubble: {
    maxHeight: 300,
  },
  responseBubbleGradient: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  responseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  responseKanduBadge: {
    backgroundColor: 'rgba(255, 107, 53, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  responseKanduText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B35',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  responseText: {
    fontSize: 17,
    fontWeight: '400',
    color: '#ffffff',
    lineHeight: 26,
  },
  responseDismissHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    marginTop: 16,
  },
  // Ask button row with chat toggle
  askButtonRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  chatToggleButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Text chat overlay styles
  chatOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
    justifyContent: 'flex-end',
  },
  chatBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  chatContainer: {
    maxHeight: SCREEN_HEIGHT * 0.6,
    minHeight: 300,
  },
  chatGradient: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  chatKanduBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  chatKanduText: {
    fontSize: 13,
    fontWeight: '600',
  },
  chatMessages: {
    flex: 1,
    marginBottom: 12,
  },
  chatMessagesContent: {
    paddingVertical: 8,
    gap: 10,
  },
  chatEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  chatEmptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  chatEmptyHint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  chatBubble: {
    maxWidth: '85%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
  },
  chatBubbleUser: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  chatBubbleAssistant: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderBottomLeftRadius: 4,
  },
  chatBubbleText: {
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.9)',
  },
  chatBubbleTextUser: {
    color: '#ffffff',
  },
  chatTypingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatTypingText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
  },
  chatInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 24,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
  },
  chatInput: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
    paddingVertical: 8,
  },
  chatSendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CookingSession;
