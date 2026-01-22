/**
 * GuidedFixScreen (STATE MACHINE VERSION)
 *
 * This is a complete rewrite of GuidedFixScreen using a state machine architecture.
 * It replaces 40+ useState variables with a single predictable state machine.
 *
 * Key improvements:
 * - Single source of truth for all state
 * - Atomic state transitions (no race conditions)
 * - Impossible states are impossible
 * - Built-in two-frame stability for auto-advance
 * - Built-in request cancellation via AbortController
 * - Built-in escalation ladder for low confidence
 * - Banned items and substitutes sent to server
 */

import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  Image,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';

import { useGuidedFixStateMachine, GuidedFixAction, SubstituteInfo, VoiceSettings, PauseReason, ConversationEntry } from '../hooks/useGuidedFixStateMachine';
import { FrameCaptureService, FrameCaptureGetters } from '../services/frameCapture';
import { generateRepairPlan, RepairStep, BoundingBox } from '../services/guidedFix';
import { askVoiceQuestion, findSubstitute } from '../services/api';
import AnimatedLogo from '../components/AnimatedLogo';
import RepairPlanLoadingScreen from '../components/RepairPlanLoadingScreen';

// Dynamic import for speech recognition (only works in dev build)
let ExpoSpeechRecognitionModule: any = null;
try {
  const speechRecognition = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = speechRecognition.ExpoSpeechRecognitionModule;
} catch (e) {
  console.log('Speech recognition not available - requires dev build');
}

// Voice question cooldown (5 seconds between questions)
const QUESTION_COOLDOWN = 5000;

// Static import for logo
const KanDuTogetherLogo = require('../assets/kandu-together.png');

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Plan revision colors for visual distinction
const PLAN_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];

/**
 * Extract the main item name from a diagnosis summary
 * Examples:
 * - "The candle has developed..." -> "candle"
 * - "Your washing machine is..." -> "washing machine"
 * - "I see a leaky faucet..." -> "faucet"
 */
function extractItemName(diagnosisSummary: string): string {
  // Common patterns to extract item name
  const patterns = [
    /^(?:The|Your|This|A|An)\s+(.+?)\s+(?:has|is|appears|seems|looks|shows|displays)/i,
    /^(?:I see|I can see|Looking at)\s+(?:a|an|the|your)?\s*(.+?)\s+(?:with|that|which)/i,
    /^(.+?)\s+(?:has|is|appears|seems|looks|shows)/i,
  ];

  for (const pattern of patterns) {
    const match = diagnosisSummary.match(pattern);
    if (match && match[1]) {
      // Clean up the extracted name
      let itemName = match[1].trim();
      // Remove trailing punctuation
      itemName = itemName.replace(/[.,;:!?]+$/, '');
      // Limit to reasonable length (first 3 words max)
      const words = itemName.split(/\s+/).slice(0, 3);
      return words.join(' ');
    }
  }

  // Fallback: try to get the first noun-like phrase (first 2-3 words)
  const firstWords = diagnosisSummary.split(/\s+/).slice(0, 4);
  // Remove common starting words
  const filtered = firstWords.filter(w =>
    !['the', 'a', 'an', 'your', 'this', 'i', 'see', 'can'].includes(w.toLowerCase())
  );
  if (filtered.length > 0) {
    return filtered.slice(0, 2).join(' ');
  }

  // Last resort: return first 20 chars
  return diagnosisSummary.substring(0, 20).trim();
}

type RootStackParamList = {
  Home: undefined;
  Results: any;
  GuidedFix: {
    category: string;
    diagnosisSummary: string;
    likelyCause?: string;
    originalImageUri?: string;
  };
};

type GuidedFixScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'GuidedFix'>;
  route: RouteProp<RootStackParamList, 'GuidedFix'>;
};

export default function GuidedFixScreenNew({ navigation, route }: GuidedFixScreenProps) {
  const { category, diagnosisSummary, likelyCause, originalImageUri } = route.params;
  const insets = useSafeAreaInsets();

  // Camera permissions
  const [permission, requestPermission] = useCameraPermissions();

  // Loading states
  const [initialSteps, setInitialSteps] = useState<RepairStep[]>([]);

  // State machine
  const { state, dispatch, context } = useGuidedFixStateMachine(initialSteps);

  // UI Control States
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [recognitionEnabled, setRecognitionEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [textBoxOpacity, setTextBoxOpacity] = useState(0.55);

  // Voice Settings
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    rate: 0.95,
    pitch: 1.0,
    voiceName: 'Default',
  });
  const [availableVoices, setAvailableVoices] = useState<Speech.Voice[]>([]);
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  // Plan regeneration state
  const [isRegeneratingPlan, setIsRegeneratingPlan] = useState(false);
  const [planRevision, setPlanRevision] = useState(0);

  // Missing items tracking (for pause modal)
  const [localMissingItems, setLocalMissingItems] = useState<Set<string>>(new Set());

  // Preview dimensions for highlights
  const [previewDimensions, setPreviewDimensions] = useState({ width: screenWidth, height: screenHeight });

  // Visual highlights (bounding boxes)
  const [highlights, setHighlights] = useState<BoundingBox[]>([]);

  // Displayed guidance text (React state for proper re-rendering)
  const [displayedGuidance, setDisplayedGuidance] = useState<string>('');

  // Rate limiting indicator
  const [isRateLimited, setIsRateLimited] = useState(false);
  const rateLimitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Voice Question States
  const [isListening, setIsListening] = useState(false);
  const [voiceQuestion, setVoiceQuestion] = useState('');
  const [voiceAnswer, setVoiceAnswer] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [questionCooldown, setQuestionCooldown] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<ConversationEntry[]>([]);
  const [stepModifications, setStepModifications] = useState<string>('');
  const [showPlanModal, setShowPlanModal] = useState(false);

  // Refs
  const cameraRef = useRef<CameraView>(null);
  const frameCaptureService = useRef<FrameCaptureService>(new FrameCaptureService());
  const speechQueue = useRef<string[]>([]);
  const isSpeaking = useRef(false);
  const speechListenerRef = useRef<any>(null);
  const lastQuestionTime = useRef<number>(0);
  const stepModificationsRef = useRef<string>('');
  const substituteSearchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSearchingRef = useRef(false);
  const substituteScanAttemptsRef = useRef(0);
  const MAX_SUBSTITUTE_SCAN_ATTEMPTS = 5; // After 5 failed scans, show "not found"
  const lastGoodHighlightsRef = useRef<BoundingBox[]>([]);
  const emptyHighlightCountRef = useRef(0);
  const EMPTY_HIGHLIGHT_THRESHOLD = 3; // Wait 3 empty frames before clearing
  const lastSpokenGuidanceRef = useRef<string>(''); // Track last spoken text to avoid repetition
  const lastSpokenTimeRef = useRef<number>(0); // Track when last guidance was spoken
  const GUIDANCE_REPEAT_THRESHOLD_MS = 10000; // Only repeat same guidance after 10 seconds

  // Ref to hold current state for frame capture getters (avoids stale closures)
  const stateRef = useRef(state);
  stateRef.current = state; // Always update to latest state

  // Keep stepModificationsRef in sync
  useEffect(() => {
    stepModificationsRef.current = stepModifications;
  }, [stepModifications]);

  // ============================================================================
  // SPEECH SYNTHESIS (defined early for use in effects)
  // ============================================================================

  const processNextSpeech = () => {
    if (isSpeaking.current || speechQueue.current.length === 0) {
      return;
    }

    const text = speechQueue.current.shift()!;
    isSpeaking.current = true;

    Speech.speak(text, {
      rate: 0.95,
      pitch: 1.0,
      onDone: () => {
        isSpeaking.current = false;
        context.isSpeaking = false;
        processNextSpeech();
      },
      onError: () => {
        isSpeaking.current = false;
        context.isSpeaking = false;
        processNextSpeech();
      },
    });

    context.isSpeaking = true;
  };

  const speakGuidance = (text: string, force: boolean = false) => {
    // Only speak if voice is enabled
    if (!voiceEnabled) {
      return;
    }

    // Efficiency: Don't repeat the same guidance too quickly (unless forced)
    if (!force) {
      const now = Date.now();
      const timeSinceLastSpoken = now - lastSpokenTimeRef.current;
      if (text === lastSpokenGuidanceRef.current && timeSinceLastSpoken < GUIDANCE_REPEAT_THRESHOLD_MS) {
        console.log('🔇 Skipping duplicate guidance:', text.substring(0, 30) + '...');
        return;
      }
    }

    lastSpokenGuidanceRef.current = text;
    lastSpokenTimeRef.current = Date.now();
    speechQueue.current.push(text);
    processNextSpeech();
  };

  // ============================================================================
  // LIFECYCLE: Generate repair plan on mount
  // ============================================================================

  useEffect(() => {
    generateInitialPlan();
  }, []);

  const generateInitialPlan = async () => {
    try {
      console.log('🔧 Generating repair plan...');

      const steps = await generateRepairPlan(
        category,
        diagnosisSummary,
        likelyCause
      );

      console.log(`✅ Generated ${steps.length} repair steps`);
      setInitialSteps(steps);
      context.repairSteps = steps;

      // Set expected item from diagnosis summary (extract the main item)
      context.expectedItem = extractItemName(diagnosisSummary);
      console.log(`🏷️ Expected item: "${context.expectedItem}" (extracted from diagnosis)`)

      // Start the session and immediately mark plan as loaded
      // (plan was loaded before state machine started, so we dispatch both)
      dispatch({ type: 'START_SESSION' });
      dispatch({ type: 'PLAN_LOADED', steps });
    } catch (error: any) {
      console.error('❌ Failed to generate repair plan:', error);
      Alert.alert(
        'Unable to Generate Plan',
        error.message || 'Please try again',
        [{ text: 'Go Back', onPress: () => navigation.goBack() }]
      );
    }
  };

  // ============================================================================
  // LIFECYCLE: Comprehensive cleanup on unmount
  // ============================================================================

  useEffect(() => {
    return () => {
      console.log('🧹 Cleaning up GuidedFixScreen...');

      // Stop frame capture
      frameCaptureService.current.stop();

      // Stop any ongoing speech
      Speech.stop();

      // Clear substitute search timeout
      if (substituteSearchTimeoutRef.current) {
        clearTimeout(substituteSearchTimeoutRef.current);
        substituteSearchTimeoutRef.current = null;
      }

      // Clear rate limit timeout
      if (rateLimitTimeoutRef.current) {
        clearTimeout(rateLimitTimeoutRef.current);
        rateLimitTimeoutRef.current = null;
      }

      // Cleanup speech listeners
      if (speechListenerRef.current) {
        try {
          if (speechListenerRef.current.result?.remove) {
            speechListenerRef.current.result.remove();
          }
          if (speechListenerRef.current.error?.remove) {
            speechListenerRef.current.error.remove();
          }
          if (speechListenerRef.current.end?.remove) {
            speechListenerRef.current.end.remove();
          }
        } catch (e) {
          // Ignore cleanup errors
        }
        speechListenerRef.current = null;
      }

      // Clear speech queue
      speechQueue.current = [];
      isSpeaking.current = false;

      console.log('✅ Cleanup complete');
    };
  }, []);

  // ============================================================================
  // LIFECYCLE: Handle permissions
  // ============================================================================

  useEffect(() => {
    if (state.type === 'REQUESTING_PERMISSIONS') {
      if (permission?.granted) {
        dispatch({ type: 'PERMISSIONS_GRANTED' });
      } else if (permission && !permission.granted && !permission.canAskAgain) {
        dispatch({ type: 'PERMISSIONS_DENIED' });
      } else {
        requestPermission().then((result) => {
          if (result.granted) {
            dispatch({ type: 'PERMISSIONS_GRANTED' });
          } else {
            dispatch({ type: 'PERMISSIONS_DENIED' });
          }
        });
      }
    }
  }, [state.type, permission]);

  // ============================================================================
  // LIFECYCLE: Start/stop frame capture based on state
  // ============================================================================

  useEffect(() => {
    const shouldCapture = state.type === 'STEP_ACTIVE' ||
                          state.type === 'CONFIRMING_COMPLETION' ||
                          state.type === 'VERIFYING_IDENTITY';

    if (shouldCapture) {
      // Use getter functions to avoid stale closure bug
      const getters: FrameCaptureGetters = {
        getState: () => stateRef.current,
        getContext: () => context,
        dispatch,
        isSpeaking: () => isSpeaking.current,
      };
      frameCaptureService.current.start(cameraRef, getters);
    } else {
      frameCaptureService.current.stop();
    }

    return () => {
      frameCaptureService.current.stop();
    };
  }, [state.type]);

  // Speak intro message when entering VERIFYING_IDENTITY state (only once)
  const hasSpokenIntroRef = useRef(false);
  const lastSpokenMismatchRef = useRef<string>('');
  useEffect(() => {
    if (state.type === 'VERIFYING_IDENTITY') {
      // Speak intro on first entry
      if (!hasSpokenIntroRef.current) {
        hasSpokenIntroRef.current = true;
        const introMessage = "First, let's confirm what we're working on. Point the camera at your item.";
        context.currentGuidance = introMessage;
        setDisplayedGuidance(introMessage);
        speakGuidance(introMessage, true);
      }
      // Speak mismatch warning if detected item doesn't match expected
      else if (state.detectedItem && state.mismatchCount > 0 && state.detectedItem !== lastSpokenMismatchRef.current) {
        lastSpokenMismatchRef.current = state.detectedItem;
        const expectedName = context.expectedItem || 'the item from your diagnosis';
        const mismatchMessage = `I see a ${state.detectedItem}, but I'm looking for ${expectedName}. Let me take another look...`;
        context.currentGuidance = mismatchMessage;
        setDisplayedGuidance(mismatchMessage);
        speakGuidance(mismatchMessage, true);
      }
    } else {
      hasSpokenIntroRef.current = false;
      lastSpokenMismatchRef.current = '';
    }
  }, [state.type, state.type === 'VERIFYING_IDENTITY' ? state.detectedItem : '', state.type === 'VERIFYING_IDENTITY' ? state.mismatchCount : 0]);

  // Speak when mismatch modal appears
  useEffect(() => {
    if (state.type === 'IDENTITY_MISMATCH_MODAL') {
      const expectedName = state.expectedItem || context.expectedItem || 'your item';
      const message = `Hold on. I see a ${state.detectedItem}, but your diagnosis is for ${expectedName}. What would you like to do?`;
      speakGuidance(message, true);
    }
  }, [state.type]);

  // Sync displayedGuidance from context.currentGuidance when it changes
  // This is needed because context is a ref (doesn't trigger re-renders)
  const previousGuidanceRef = useRef<string>('');
  useEffect(() => {
    const guidance = context.currentGuidance;
    if (guidance && guidance !== previousGuidanceRef.current) {
      previousGuidanceRef.current = guidance;
      setDisplayedGuidance(guidance);

      // Also speak the guidance if voice is enabled and we're in an active state
      const isActiveState = state.type === 'STEP_ACTIVE' ||
                            state.type === 'CONFIRMING_COMPLETION' ||
                            state.type === 'VERIFYING_IDENTITY';
      if (voiceEnabled && isActiveState) {
        speakGuidance(guidance);
      }
    }
  });

  // Sync highlights from context with persistence logic
  useEffect(() => {
    // Only update highlights when recognition is enabled
    if (!recognitionEnabled) {
      return;
    }

    const contextHighlights = context.currentHighlights || [];

    if (contextHighlights.length > 0) {
      // Adjust highlight coordinates from percentage (0-100) to screen coordinates
      const adjustedHighlights = contextHighlights.map(box => ({
        ...box,
        x: box.x, // Keep as percentage, convert in render
        y: box.y,
        width: box.width,
        height: box.height,
      }));

      console.log('🟢 Setting highlights:', adjustedHighlights.length, 'boxes');
      lastGoodHighlightsRef.current = adjustedHighlights;
      emptyHighlightCountRef.current = 0;
      setHighlights(adjustedHighlights);
    } else {
      // No highlights in this frame - don't immediately clear
      emptyHighlightCountRef.current++;
      console.log(`⚪ No highlights in this frame (${emptyHighlightCountRef.current}/${EMPTY_HIGHLIGHT_THRESHOLD})`);

      if (emptyHighlightCountRef.current >= EMPTY_HIGHLIGHT_THRESHOLD) {
        // Enough empty frames - now clear the highlights
        console.log('🔴 Clearing highlights after', EMPTY_HIGHLIGHT_THRESHOLD, 'empty frames');
        lastGoodHighlightsRef.current = [];
        setHighlights([]);
      }
      // Otherwise keep showing last good highlights for persistence
    }
  }, [context.currentHighlights, recognitionEnabled]);

  // Clear highlights when recognition is disabled
  useEffect(() => {
    if (!recognitionEnabled) {
      setHighlights([]);
      lastGoodHighlightsRef.current = [];
      emptyHighlightCountRef.current = 0;
    }
  }, [recognitionEnabled]);

  // ============================================================================
  // USER ACTIONS
  // ============================================================================

  const handlePause = () => {
    dispatch({ type: 'PAUSE_MANUAL' });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleResume = () => {
    dispatch({ type: 'RESUME_SESSION' });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleConfirmStep = () => {
    dispatch({ type: 'USER_REQUESTED_OVERRIDE' });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };


  const toggleFlash = () => {
    setFlashEnabled(prev => !prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleRecognition = () => {
    setRecognitionEnabled(prev => !prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    speakGuidance(recognitionEnabled ? 'Visual recognition paused' : 'Visual recognition enabled');
  };

  const toggleVoice = () => {
    setVoiceEnabled(prev => !prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!voiceEnabled) {
      speakGuidance('Voice enabled');
    }
  };

  const adjustOpacity = (delta: number) => {
    setTextBoxOpacity(prev => Math.max(0.3, Math.min(1.0, prev + delta)));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ============================================================================
  // VOICE SETTINGS HELPERS
  // ============================================================================

  // Load available voices on mount
  useEffect(() => {
    const loadVoices = async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        // Filter to English voices and sort by quality
        const englishVoices = voices
          .filter(v => v.language.startsWith('en'))
          .sort((a, b) => {
            if (a.quality === 'Enhanced' && b.quality !== 'Enhanced') return -1;
            if (a.quality !== 'Enhanced' && b.quality === 'Enhanced') return 1;
            return a.name.localeCompare(b.name);
          });
        setAvailableVoices(englishVoices);
      } catch (error) {
        console.log('Error loading voices:', error);
      }
    };
    loadVoices();
  }, []);

  const adjustRate = (delta: number) => {
    setVoiceSettings(prev => ({
      ...prev,
      rate: Math.max(0.5, Math.min(1.5, prev.rate + delta)),
    }));
  };

  const adjustPitch = (delta: number) => {
    setVoiceSettings(prev => ({
      ...prev,
      pitch: Math.max(0.5, Math.min(2.0, prev.pitch + delta)),
    }));
  };

  const selectVoice = (voice: Speech.Voice | null) => {
    if (voice) {
      setVoiceSettings(prev => ({
        ...prev,
        voiceIdentifier: voice.identifier,
        voiceName: voice.name,
      }));
    } else {
      setVoiceSettings(prev => ({
        ...prev,
        voiceIdentifier: undefined,
        voiceName: 'Default',
      }));
    }
  };

  const previewVoice = () => {
    Speech.speak('This is how I will sound during the repair session.', {
      rate: voiceSettings.rate,
      pitch: voiceSettings.pitch,
      voice: voiceSettings.voiceIdentifier,
    });
  };

  const openVoiceSettings = () => {
    setShowVoiceModal(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ============================================================================
  // SUBSTITUTE SCANNING
  // ============================================================================

  const captureAndSearchSubstitute = async () => {
    if (!cameraRef.current || !isSearchingRef.current) {
      return;
    }

    const searchItem = state.type === 'SEARCHING_SUBSTITUTE' ? state.searchItem : '';
    if (!searchItem) {
      console.error('No search item for substitute search');
      return;
    }

    // Increment scan attempt counter
    substituteScanAttemptsRef.current++;
    const attemptNumber = substituteScanAttemptsRef.current;
    console.log(`🔍 Substitute scan attempt ${attemptNumber}/${MAX_SUBSTITUTE_SCAN_ATTEMPTS}`);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.5,
        skipProcessing: true,
      });

      if (!photo?.base64) {
        console.error('No photo captured for substitute search');
        handleSubstituteScanResult(null, 'Camera not ready');
        return;
      }

      // Get current step info
      const currentStep = context.repairSteps[context.currentStepIndex];
      const bannedItems = Array.from(context.permanentlyUnavailableItems);

      console.log('🔍 Calling find-substitute API for:', searchItem);

      const { data, error } = await findSubstitute({
        imageBase64: photo.base64,
        missingItem: searchItem,
        category,
        stepInstruction: currentStep?.instruction || diagnosisSummary,
        bannedItems: bannedItems.length > 0 ? bannedItems : undefined,
      });

      // Check if still searching (state may have changed)
      if (!isSearchingRef.current) {
        console.log('Substitute search cancelled, ignoring result');
        return;
      }

      if (error) {
        console.error('Find substitute error:', error);
        handleSubstituteScanResult(null, 'Analysis failed');
        return;
      }

      if (data?.foundSubstitute && data.suggestedSubstitute) {
        // Found a substitute! Reset counter and dispatch
        console.log('🎉 Found substitute:', data.suggestedSubstitute, 'for', searchItem);
        substituteScanAttemptsRef.current = 0;

        const substituteInfo: SubstituteInfo = {
          item: data.suggestedSubstitute,
          reason: data.reason || '',
          instruction: data.instruction || '',
          confidence: data.confidence || 0.8,
          highlight: data.highlight,
        };

        // Show highlight on found item
        if (data.highlight) {
          setHighlights([data.highlight]);
        }

        dispatch({ type: 'SUBSTITUTE_FOUND', substitute: substituteInfo });
        speakGuidance(`I found ${data.suggestedSubstitute}! ${data.reason || ''}`);
      } else {
        // No substitute found in this scan
        handleSubstituteScanResult(null, data?.reason || 'No matching items visible');
      }
    } catch (err) {
      console.error('Substitute search error:', err);
      handleSubstituteScanResult(null, 'Something went wrong');
    }
  };

  // Handle substitute scan result - either continue or show "not found"
  const handleSubstituteScanResult = (found: boolean | null, reason: string) => {
    if (!isSearchingRef.current) return;

    if (substituteScanAttemptsRef.current >= MAX_SUBSTITUTE_SCAN_ATTEMPTS) {
      // Max attempts reached - show "not found" screen
      console.log('❌ Max scan attempts reached, showing not found');
      substituteScanAttemptsRef.current = 0;
      dispatch({ type: 'SUBSTITUTE_SCAN_FAILED', reason: 'No matching items found after scanning' });
      speakGuidance(`I couldn't find a substitute for ${state.type === 'SEARCHING_SUBSTITUTE' ? state.searchItem : 'the item'}.`);
    } else {
      // Continue scanning
      console.log(`Scan attempt ${substituteScanAttemptsRef.current} failed: ${reason}`);
      scheduleNextSubstituteCapture();
    }
  };

  const scheduleNextSubstituteCapture = () => {
    if (isSearchingRef.current && !substituteSearchTimeoutRef.current) {
      substituteSearchTimeoutRef.current = setTimeout(() => {
        substituteSearchTimeoutRef.current = null;
        if (isSearchingRef.current) {
          captureAndSearchSubstitute();
        }
      }, 2500); // 2.5s between scans
    }
  };

  // Effect to manage substitute search state
  useEffect(() => {
    if (state.type === 'SEARCHING_SUBSTITUTE') {
      // Start substitute search (user clicked "Start Scanning")
      console.log('🔍 Starting substitute scan for:', state.searchItem);
      isSearchingRef.current = true;
      substituteScanAttemptsRef.current = 0; // Reset counter

      // Start first capture immediately
      captureAndSearchSubstitute();
    } else {
      // Stop substitute search
      isSearchingRef.current = false;
      if (substituteSearchTimeoutRef.current) {
        clearTimeout(substituteSearchTimeoutRef.current);
        substituteSearchTimeoutRef.current = null;
      }
    }

    return () => {
      if (substituteSearchTimeoutRef.current) {
        clearTimeout(substituteSearchTimeoutRef.current);
        substituteSearchTimeoutRef.current = null;
      }
    };
  }, [state.type === 'SEARCHING_SUBSTITUTE' ? state.searchItem : null]);

  // Effect to handle REGENERATING_PLAN state from substitute flow
  useEffect(() => {
    if (state.type === 'REGENERATING_PLAN') {
      console.log('🔄 REGENERATING_PLAN state detected, triggering plan regeneration');
      // Get the step from state - this is preserved through the substitute flow
      const stepToPreserve = state.step;

      // Trigger plan regeneration
      regeneratePlanWithMissingItems(state.missingItems, stepToPreserve);
    }
  }, [state.type === 'REGENERATING_PLAN']);

  // Sync planRevision from context
  useEffect(() => {
    if (context.planRevision !== planRevision) {
      console.log(`📊 Syncing planRevision: ${planRevision} -> ${context.planRevision}`);
      setPlanRevision(context.planRevision);
    }
  }, [context.planRevision]);

  // ============================================================================
  // MODAL HANDLERS
  // ============================================================================

  // Handle continue with original item in identity mismatch
  const handleContinueWithOriginal = () => {
    dispatch({ type: 'CONTINUE_WITH_ORIGINAL' });
    speakGuidance(`Continuing with ${context.expectedItem || 'the original item'}.`);
  };

  // Handle starting a new diagnosis
  const handleStartNewDiagnosis = () => {
    dispatch({ type: 'START_NEW_DIAGNOSIS' });
    navigation.navigate('Home');
  };

  // Handle override confirmation (user says they did the step)
  const handleOverrideConfirm = () => {
    dispatch({ type: 'OVERRIDE_CONFIRMED' });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    speakGuidance('Great! Moving to the next step.');
  };

  // Handle completion confirmation (AI thinks step is done)
  const handleCompletionConfirm = () => {
    dispatch({ type: 'COMPLETION_CONFIRMED' });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    speakGuidance('Step complete!');
  };

  // Handle completion denial (user says step isn't done)
  const handleCompletionDeny = () => {
    dispatch({ type: 'COMPLETION_DENIED' });
    speakGuidance('No problem, keep going.');
  };

  // Handle toggling missing item in pause modal
  // Updates both local UI state AND state machine (for substitute search)
  const handleToggleMissingItem = (item: string) => {
    setLocalMissingItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(item)) {
        newSet.delete(item);
      } else {
        newSet.add(item);
      }
      return newSet;
    });
    // Also update state machine so START_SUBSTITUTE_SEARCH has the items
    dispatch({ type: 'TOGGLE_MISSING_ITEM', item });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Handle regenerate plan with missing items
  const handleRegeneratePlan = async () => {
    if (localMissingItems.size === 0) {
      // No items missing, just resume
      handleResumeSession();
      return;
    }

    setIsRegeneratingPlan(true);

    // Capture current step BEFORE dispatch changes state
    const currentStepBeforeDispatch = state.type === 'PAUSED' ? state.step : 0;

    // Add missing items to permanently unavailable
    localMissingItems.forEach(item => {
      context.permanentlyUnavailableItems.add(item);
    });

    dispatch({
      type: 'REGENERATE_PLAN',
      missingItems: Array.from(localMissingItems),
    });

    await regeneratePlanWithMissingItems(Array.from(localMissingItems), currentStepBeforeDispatch);
    setIsRegeneratingPlan(false);
    setLocalMissingItems(new Set());
  };

  // Handle resume session from pause
  const handleResumeSession = () => {
    dispatch({ type: 'RESUME_SESSION' });
    setLocalMissingItems(new Set());
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // Handle stop session
  const handleStopSession = () => {
    Speech.stop();
    dispatch({ type: 'SESSION_ENDED' });
    navigation.goBack();
  };

  // Handle starting substitute search
  const handleStartSubstituteSearch = () => {
    dispatch({ type: 'START_SUBSTITUTE_SEARCH' });
  };

  // Handle cancel substitute search
  const handleCancelSubstituteSearch = () => {
    dispatch({ type: 'CANCEL_SUBSTITUTE_SEARCH' });
  };

  // Handle confirm substitute
  const handleConfirmSubstitute = () => {
    // Get substitute info from current state
    if (state.type === 'SUBSTITUTE_FOUND_MODAL') {
      const { searchItem, foundSubstitute } = state;

      // Add the original item to permanently unavailable (banned)
      context.permanentlyUnavailableItems.add(searchItem.toLowerCase());
      console.log('🚫 Added to permanently unavailable:', searchItem);

      // Add the substitute mapping
      context.confirmedSubstitutes.set(searchItem.toLowerCase(), foundSubstitute.item.toLowerCase());
      console.log('✅ Confirmed substitute:', searchItem, '->', foundSubstitute.item);
    }

    dispatch({ type: 'CONFIRM_SUBSTITUTE' });
    speakGuidance('Got it! Using the substitute.');
  };

  // Handle acknowledge new plan
  const handleAcknowledgeNewPlan = () => {
    dispatch({ type: 'ACKNOWLEDGE_NEW_PLAN' });
    setPlanRevision(prev => prev + 1);
    speakGuidance('Great! Let\'s continue with the updated plan.');
  };

  // ============================================================================
  // VOICE QUESTION FUNCTIONS
  // ============================================================================

  const cleanupListeners = () => {
    if (speechListenerRef.current) {
      try {
        if (speechListenerRef.current.result?.remove) {
          speechListenerRef.current.result.remove();
        }
        if (speechListenerRef.current.error?.remove) {
          speechListenerRef.current.error.remove();
        }
        if (speechListenerRef.current.end?.remove) {
          speechListenerRef.current.end.remove();
        }
      } catch (e) {
        console.log('Error cleaning up listeners:', e);
      }
      speechListenerRef.current = null;
    }
  };

  const startListening = async () => {
    // Check if speech recognition module is available
    if (!ExpoSpeechRecognitionModule) {
      Alert.alert('Not Available', 'Voice questions require a development build with speech recognition.');
      return;
    }

    // Check cooldown
    const now = Date.now();
    if (now - lastQuestionTime.current < QUESTION_COOLDOWN) {
      const remaining = Math.ceil((QUESTION_COOLDOWN - (now - lastQuestionTime.current)) / 1000);
      Alert.alert('Please Wait', `You can ask another question in ${remaining} seconds.`);
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsListening(true);
      setVoiceQuestion('');

      // Stop frame capture while listening
      frameCaptureService.current.stop();

      // Request permission
      const { status } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Microphone access is required for voice questions.');
        setIsListening(false);
        return;
      }

      // Set up event listener for results
      speechListenerRef.current = ExpoSpeechRecognitionModule.addListener('result', (event: any) => {
        if (event.results && event.results.length > 0) {
          const transcript = event.results[0]?.transcript || '';

          // Wake word detection
          const lowerTranscript = transcript.toLowerCase();
          if (lowerTranscript.includes('kandu')) {
            const questionPart = transcript.substring(transcript.toLowerCase().indexOf('kandu') + 5).trim();
            if (questionPart.length > 5) {
              setVoiceQuestion(questionPart);
            }
          } else {
            setVoiceQuestion(transcript);
          }
        }

        if (event.isFinal) {
          const finalText = event.results?.[0]?.transcript || '';
          cleanupAndProcessResult(finalText);
        }
      });

      // Listen for errors
      const errorListener = ExpoSpeechRecognitionModule.addListener('error', (event: any) => {
        console.error('Speech recognition error event:', event);
        cleanupListeners();
        setIsListening(false);
        if (event.error !== 'aborted') {
          Alert.alert('Recognition Error', event.message || 'Speech recognition failed.');
        }
      });

      // Listen for end
      const endListener = ExpoSpeechRecognitionModule.addListener('end', () => {
        console.log('🎤 Speech recognition ended');
        cleanupListeners();
        setIsListening(false);
      });

      // Store all listeners for cleanup
      speechListenerRef.current = {
        result: speechListenerRef.current,
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
      console.error('Speech recognition error:', error);
      cleanupListeners();
      Alert.alert('Error', 'Could not start voice recognition. Please try again.');
      setIsListening(false);
    }
  };

  const cleanupAndProcessResult = async (finalTranscript: string) => {
    cleanupListeners();
    setIsListening(false);

    // Enforce maximum question length
    const trimmedQuestion = finalTranscript.trim().slice(0, 100);

    if (trimmedQuestion.length > 5) {
      setVoiceQuestion(trimmedQuestion);
      await processVoiceQuestion(trimmedQuestion);
    } else {
      Alert.alert('No Question', 'Please speak your question clearly.');
    }
  };

  const processVoiceQuestion = async (question: string) => {
    // Update rate limiting timestamp
    lastQuestionTime.current = Date.now();
    setQuestionCooldown(true);
    setTimeout(() => setQuestionCooldown(false), QUESTION_COOLDOWN);

    // Dispatch question to state machine
    dispatch({ type: 'QUESTION_COMPLETE', question });

    // Add to local conversation history too
    const userEntry: ConversationEntry = {
      role: 'user',
      content: question,
      timestamp: Date.now(),
    };
    setConversationHistory(prev => [...prev.slice(-4), userEntry]);

    // Detect constraints from the question - items to ban or substitute
    const lowerQuestion = question.toLowerCase();
    const constraintPatterns = [
      { pattern: /(?:don't|do not|doesn't|dont) have (?:a |an |the )?(.+?)(?:\?|$|,)/i, type: 'missing' as const },
      { pattern: /what if (?:i |I )?(?:don't|do not|dont) have (?:a |an |the )?(.+?)(?:\?|$|,)/i, type: 'missing' as const },
      { pattern: /(?:can i |can I )(?:use|try) (?:a |an |the )?(.+?) instead(?: of (.+))?/i, type: 'substitute' as const },
      { pattern: /(?:is there |what's )(?:an? )?alternative to (?:a |an |the )?(.+?)(?:\?|$)/i, type: 'missing' as const },
      { pattern: /(?:without|skip) (?:a |an |the )?(.+?)(?:\?|$|,)/i, type: 'missing' as const },
    ];

    let detectedItem = '';
    let detectedSubstitute = '';
    let constraintType: 'missing' | 'substitute' | null = null;

    for (const { pattern, type } of constraintPatterns) {
      const match = lowerQuestion.match(pattern);
      if (match && match[1]) {
        detectedItem = match[1].trim();
        constraintType = type;
        if (type === 'substitute' && match[2]) {
          detectedSubstitute = match[2].trim();
        }
        console.log(`🔄 Detected constraint: ${type} - ${detectedItem}${detectedSubstitute ? ` -> ${detectedSubstitute}` : ''}`);
        break;
      }
    }

    try {
      // Capture current frame for context
      let currentFrame = '';
      if (cameraRef.current) {
        try {
          const photo = await cameraRef.current.takePictureAsync({
            base64: true,
            quality: 0.5,
          });
          if (photo?.base64) {
            currentFrame = photo.base64;
          }
        } catch (e) {
          console.log('Could not capture frame for question context');
        }
      }

      // Build conversation context string
      const recentConversation = conversationHistory
        .slice(-3)
        .map(e => `${e.role === 'user' ? 'User' : 'Assistant'}: ${e.content}`)
        .join('\n');

      // Map identity status to API format ('VERIFYING' -> 'CHECKING')
      const apiIdentityStatus = context.identityStatus === 'VERIFYING' ? 'CHECKING' : context.identityStatus;

      // Determine current step instruction (fallback for identity verification)
      const stepInstruction = currentStep?.instruction ||
        (state.type === 'VERIFYING_IDENTITY'
          ? `Identifying item: ${context.expectedItem || diagnosisSummary}`
          : `Working on: ${diagnosisSummary}`);

      // Call voice question API
      const { data, error } = await askVoiceQuestion({
        question,
        category,
        diagnosisSummary,
        currentStepInstruction: stepInstruction,
        identityStatus: apiIdentityStatus,
        imageBase64: currentFrame || undefined,
        conversationContext: recentConversation || undefined,
        userConstraints: stepModificationsRef.current || undefined,
      });

      if (error) {
        console.error('Voice question error:', error);
        dispatch({ type: 'ERROR_OCCURRED', message: error, recoverable: true });
        Alert.alert('Error', error);
        return;
      }

      const answer = data?.answer || 'Sorry, I could not process that question. Please try again.';

      // Dispatch answer to state machine
      dispatch({ type: 'ANSWER_RECEIVED', answer });

      // Add assistant answer to local history
      const assistantEntry: ConversationEntry = {
        role: 'assistant',
        content: answer,
        timestamp: Date.now(),
      };
      setConversationHistory(prev => [...prev.slice(-4), assistantEntry]);

      // If a constraint was detected, update context
      if (constraintType === 'missing' && detectedItem) {
        dispatch({ type: 'CONVERSATION_UPDATE_ITEM', action: 'ban', item: detectedItem });
        setStepModifications(prev => {
          const newMods = prev ? `${prev}; User doesn't have: ${detectedItem}` : `User doesn't have: ${detectedItem}`;
          return newMods;
        });
      } else if (constraintType === 'substitute' && detectedItem) {
        dispatch({ type: 'CONVERSATION_UPDATE_ITEM', action: 'substitute', item: detectedSubstitute || 'unknown', substitute: detectedItem });
      }

      // Display and speak answer
      setVoiceAnswer(answer);
      setShowAnswer(true);

      // Speak the answer
      if (voiceEnabled) {
        speakGuidance(answer);
      }

      // Transition to CONVERSATION state after speaking is done (via DISMISS_ANSWER)
      // Don't auto-dismiss - let user control when to dismiss

    } catch (error) {
      console.error('Voice question processing error:', error);
      dispatch({ type: 'ERROR_OCCURRED', message: 'Failed to process question', recoverable: true });
      Alert.alert('Error', 'Failed to process your question. Please try again.');
    }
  };

  // Dismiss answer and enter conversation mode (or resume)
  const dismissAnswer = () => {
    setShowAnswer(false);
    setVoiceAnswer('');
    setVoiceQuestion('');
    dispatch({ type: 'DISMISS_ANSWER' }); // This transitions to CONVERSATION state
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // ============================================================================
  // RENDER: Loading state (initial plan generation)
  // ============================================================================

  if (initialSteps.length === 0 && state.type === 'IDLE') {
    return <RepairPlanLoadingScreen visible={true} />;
  }

  // ============================================================================
  // RENDER: Error state
  // ============================================================================

  if (state.type === 'ERROR') {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={64} color="#ef4444" />
        <Text style={styles.errorTitle}>Error</Text>
        <Text style={styles.errorMessage}>{state.message}</Text>
        {state.recoverable && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => dispatch({ type: 'RETRY_FROM_ERROR' })}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.retryButton, styles.goBackButton]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.retryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ============================================================================
  // RENDER: Session complete
  // ============================================================================

  if (state.type === 'SESSION_COMPLETE') {
    return (
      <View style={styles.completeContainer}>
        <Ionicons name="checkmark-circle" size={80} color="#10b981" />
        <Text style={styles.completeTitle}>Session Complete!</Text>
        <Text style={styles.completeMessage}>
          Great job! You've completed all repair steps.
        </Text>
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ============================================================================
  // RENDER: Main camera view with old UI
  // ============================================================================

  const currentStep = state.type === 'STEP_ACTIVE' ||
                       state.type === 'CONFIRMING_COMPLETION' ||
                       state.type === 'PAUSED'
    ? context.repairSteps[state.step]
    : null;

  // Calculate stepNumber from any state that has a step property
  const stepNumber = (() => {
    if (state.type === 'STEP_ACTIVE' ||
        state.type === 'CONFIRMING_COMPLETION' ||
        state.type === 'PAUSED' ||
        state.type === 'NEW_PLAN_MODAL' ||
        state.type === 'REGENERATING_PLAN' ||
        state.type === 'SEARCHING_SUBSTITUTE' ||
        state.type === 'SUBSTITUTE_FOUND_MODAL' ||
        state.type === 'COMPLETION_SUGGESTED_MODAL' ||
        state.type === 'OVERRIDE_CONFIRMATION_MODAL' ||
        state.type === 'LISTENING' ||
        state.type === 'PROCESSING_QUESTION' ||
        state.type === 'SHOWING_ANSWER' ||
        state.type === 'CONVERSATION' ||
        state.type === 'VOICE_SETTINGS_MODAL') {
      return state.step + 1;
    }
    return 1; // Default to 1 for states without step (IDLE, LOADING_PLAN, etc.)
  })();

  const totalSteps = context.repairSteps.length;
  const isLoadingPlan = state.type === 'IDLE' || state.type === 'REQUESTING_PERMISSIONS';

  return (
    <View style={styles.container}>
      <StatusBar hidden={true} />

      {/* Render Modals */}
      {renderModals()}

      {/* Fullscreen Camera */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={flashEnabled}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setPreviewDimensions({ width, height });
        }}
      />

      {/* Bounding Box Highlights */}
      {highlights.length > 0 && (
        <View style={styles.highlightContainer} pointerEvents="none">
          {highlights.map((box, index) => {
            // Convert normalized coordinates (0-100) to pixels using actual preview dimensions
            const { width: previewW, height: previewH } = previewDimensions;

            // Box coordinates are in percentage (0-100), convert to pixels
            const boxLeftPx = (box.x / 100) * previewW;
            const boxTopPx = (box.y / 100) * previewH;
            const boxWidthPx = (box.width / 100) * previewW;
            const boxHeightPx = (box.height / 100) * previewH;

            // Calculate center point in pixels
            const centerXPx = boxLeftPx + boxWidthPx / 2;
            const centerYPx = boxTopPx + boxHeightPx / 2;

            // Circle diameter: use larger dimension, minimum 60px for visibility
            const circleDiameterPx = Math.max(boxWidthPx, boxHeightPx, 60);

            // Circle position (top-left corner of circle)
            const circleLeftPx = centerXPx - circleDiameterPx / 2;
            const circleTopPx = centerYPx - circleDiameterPx / 2;

            // Label position: above the circle, clamped to screen edges
            const labelLeftPx = Math.max(10, centerXPx - 80);
            const labelTopPx = Math.max(10, circleTopPx - 50);

            return (
              <View key={index}>
                {/* Outer circle - bright green for visibility */}
                <View
                  style={[
                    styles.highlightCircle,
                    {
                      left: circleLeftPx,
                      top: circleTopPx,
                      width: circleDiameterPx,
                      height: circleDiameterPx,
                    },
                  ]}
                />
                {/* Inner glow circle */}
                <View
                  style={[
                    styles.highlightCircleInner,
                    {
                      left: circleLeftPx + 4,
                      top: circleTopPx + 4,
                      width: circleDiameterPx - 8,
                      height: circleDiameterPx - 8,
                    },
                  ]}
                />
                {/* Label positioned above the circle */}
                <View
                  style={[
                    styles.highlightLabel,
                    {
                      left: labelLeftPx,
                      top: labelTopPx,
                      maxWidth: previewW - labelLeftPx - 20,
                    },
                  ]}
                >
                  <View style={styles.highlightLabelArrow} />
                  <Text style={styles.highlightLabelText} numberOfLines={2}>
                    {box.label}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* UI Overlay */}
      <View style={styles.cameraOverlay}>
        {/* Logo at top - matches RepairPlanLoadingScreen size */}
        <Image
          source={KanDuTogetherLogo}
          style={[styles.headerLogo, { marginTop: insets.top - 55 }]}
          resizeMode="contain"
        />

        {/* Control buttons row */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.stopButton} onPress={handleStopSession}>
            <Ionicons name="close-circle" size={24} color="#ffffff" />
            <Text style={styles.stopButtonText}>Stop</Text>
          </TouchableOpacity>

          <View style={styles.actionRowRight}>
            <TouchableOpacity
              style={[styles.controlToggle, flashEnabled && styles.controlToggleActive]}
              onPress={toggleFlash}
            >
              <Ionicons name={flashEnabled ? 'flash' : 'flash-off'} size={22} color="#ffffff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlToggle, recognitionEnabled && styles.controlToggleRecognition]}
              onPress={toggleRecognition}
            >
              <Ionicons name={recognitionEnabled ? 'eye' : 'eye-off'} size={22} color="#ffffff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.controlToggle}
              onPress={toggleVoice}
              onLongPress={openVoiceSettings}
              delayLongPress={500}
            >
              <Ionicons name={voiceEnabled ? 'volume-high' : 'volume-mute'} size={22} color="#ffffff" />
            </TouchableOpacity>

            {/* Settings Gear Icon */}
            <TouchableOpacity
              style={styles.controlToggle}
              onPress={openVoiceSettings}
            >
              <Ionicons name="settings-outline" size={20} color="#ffffff" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlToggle, styles.pauseButton]}
              onPress={handlePause}
            >
              <Ionicons name="pause" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Identity Banner */}
        {state.type === 'VERIFYING_IDENTITY' && (
          <View style={styles.identityBanner}>
            <Ionicons name="scan" size={20} color="#ffffff" />
            <Text style={styles.identityBannerText}>Identifying item...</Text>
          </View>
        )}

        {/* Progress Bar with Plan Revision Colors */}
        {!isLoadingPlan && state.type !== 'VERIFYING_IDENTITY' && (
          <TouchableOpacity
            style={styles.progressContainer}
            onPress={() => {
              setShowPlanModal(true);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.progressBarRow}>
              <View style={styles.progressBar}>
                <View style={[
                  styles.progressFill,
                  {
                    width: `${(stepNumber / totalSteps) * 100}%`,
                    backgroundColor: PLAN_COLORS[planRevision % PLAN_COLORS.length]
                  }
                ]} />
              </View>
              {/* Plan revision badge */}
              {planRevision > 0 && (
                <View style={[styles.planRevisionBadge, { backgroundColor: PLAN_COLORS[planRevision % PLAN_COLORS.length] }]}>
                  <Ionicons name="refresh" size={10} color="#ffffff" />
                  <Text style={styles.planRevisionBadgeText}>v{planRevision + 1}</Text>
                </View>
              )}
            </View>
            <View style={styles.progressTextRow}>
              <Text style={styles.progressText}>
                Step {stepNumber} of {totalSteps}
                {planRevision > 0 ? ' (Updated Plan)' : ''}
              </Text>
              <Ionicons name="list-outline" size={14} color="#94a3b8" style={{ marginLeft: 6 }} />
            </View>
          </TouchableOpacity>
        )}

        {/* Transparent Guidance Box */}
        <View style={styles.guidanceContainer}>
          {isLoadingPlan ? (
            <View style={[styles.guidanceBox, { backgroundColor: `rgba(255, 255, 255, ${textBoxOpacity})` }]}>
              <ActivityIndicator size="small" color="#1E5AA8" style={{ marginRight: 10 }} />
              <Text style={styles.guidanceText}>Preparing your repair plan...</Text>
            </View>
          ) : (
            <>
              {isRateLimited ? (
                <View style={[styles.analyzingIndicator, { backgroundColor: 'rgba(239, 68, 68, 0.9)' }]}>
                  <Ionicons name="time-outline" size={16} color="#ffffff" />
                  <Text style={[styles.analyzingText, { color: '#ffffff' }]}>Rate limited - waiting...</Text>
                </View>
              ) : frameCaptureService.current.isCurrentlyAnalyzing() && recognitionEnabled ? (
                <View style={styles.analyzingIndicator}>
                  <ActivityIndicator size="small" color="#1E5AA8" />
                  <Text style={styles.analyzingText}>Analyzing...</Text>
                </View>
              ) : null}

              <View style={[styles.guidanceBox, { backgroundColor: `rgba(255, 255, 255, ${textBoxOpacity})` }]}>
                <Text style={styles.guidanceText}>
                  {displayedGuidance || currentStep?.instruction || 'Analyzing...'}
                </Text>
              </View>

              {/* Step Status Indicator */}
              {(state.type === 'STEP_ACTIVE' || state.type === 'CONFIRMING_COMPLETION') && (
                <View style={styles.stepStatusContainer}>
                  <View style={[
                    styles.stepStatusBadge,
                    state.type === 'STEP_ACTIVE' && state.stepStatus === 'CONFIRMED'
                      ? styles.stepStatusConfirmed
                      : styles.stepStatusPending
                  ]}>
                    <Ionicons
                      name={state.type === 'STEP_ACTIVE' && state.stepStatus === 'CONFIRMED' ? 'checkmark-circle' : 'time'}
                      size={16}
                      color={state.type === 'STEP_ACTIVE' && state.stepStatus === 'CONFIRMED' ? '#10b981' : '#f59e0b'}
                    />
                    <Text style={[
                      styles.stepStatusText,
                      state.type === 'STEP_ACTIVE' && state.stepStatus === 'CONFIRMED'
                        ? styles.stepStatusTextConfirmed
                        : styles.stepStatusTextPending
                    ]}>
                      {state.type === 'STEP_ACTIVE' && state.stepStatus === 'CONFIRMED'
                        ? 'Step Confirmed'
                        : 'Waiting for confirmation...'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Voice Question Answer Display */}
              {showAnswer && voiceAnswer && (
                <View style={styles.answerContainer}>
                  <View style={styles.answerBox}>
                    <Ionicons name="chatbubble-ellipses" size={20} color="#1E5AA8" />
                    <Text style={styles.answerText}>{voiceAnswer}</Text>
                    <TouchableOpacity onPress={dismissAnswer} style={styles.dismissAnswerButton}>
                      <Ionicons name="close-circle" size={20} color="#64748b" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Voice Question Button */}
              {!isLoadingPlan && (
                <View style={styles.voiceQuestionContainer}>
                  <TouchableOpacity
                    style={[
                      styles.micButton,
                      isListening && styles.micButtonListening,
                      questionCooldown && styles.micButtonDisabled
                    ]}
                    onPress={startListening}
                    disabled={isListening || questionCooldown}
                  >
                    {isListening ? (
                      <>
                        <ActivityIndicator size="small" color="#ffffff" />
                        <Text style={styles.micButtonText}>Listening...</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="mic" size={24} color="#ffffff" />
                        <Text style={styles.micButtonText}>Ask a Question</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {voiceQuestion && !showAnswer && (
                    <View style={styles.questionPreview}>
                      <Text style={styles.questionPreviewText}>"{voiceQuestion}"</Text>
                    </View>
                  )}
                </View>
              )}

              {/* Action Buttons */}
              {state.type === 'STEP_ACTIVE' && (
                <View style={styles.actionButtonsContainer}>
                  <TouchableOpacity style={styles.nextStepButton} onPress={handleConfirmStep}>
                    <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                    <Text style={styles.nextStepButtonText}>
                      {stepNumber < totalSteps ? 'Done - Next Step' : 'Finish'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      </View>
    </View>
  );

  // ============================================================================
  // RENDER: Modals (All 8 modals from old version with exact styling)
  // ============================================================================

  function renderModals() {
    // Extract data for modals based on state
    const detectedItem = state.type === 'IDENTITY_MISMATCH_MODAL' ? state.detectedItem : '';
    const expectedItem = state.type === 'IDENTITY_MISMATCH_MODAL' ? state.expectedItem : context.expectedItem || '';
    const completionEvidence = state.type === 'COMPLETION_SUGGESTED_MODAL' ? state.evidence : '';
    const pauseReason: PauseReason = state.type === 'PAUSED' ? state.reason : 'manual';
    const neededItems = state.type === 'PAUSED' ? state.neededItems : [];
    const workingStepDescription = state.type === 'PAUSED' ? state.workingStepDescription : '';
    const taskInstruction = state.type === 'PAUSED' ? state.taskInstruction : '';
    const pauseMessage = state.type === 'PAUSED' ? state.pauseMessage : 'Session paused';
    // For NEW_PLAN_MODAL, show only the steps from current step onwards (the newly generated ones)
    // state.newSteps contains the full plan (completed + new), so slice from state.step
    const newPlanSteps = state.type === 'NEW_PLAN_MODAL'
      ? state.newSteps.slice(state.step)
      : [];
    const substituteSearchItem = state.type === 'SUBSTITUTE_SCAN_READY' ? state.searchItem :
                                 state.type === 'SEARCHING_SUBSTITUTE' ? state.searchItem :
                                 state.type === 'SUBSTITUTE_NOT_FOUND' ? state.searchItem :
                                 state.type === 'SUBSTITUTE_FOUND_MODAL' ? state.searchItem : '';
    const substituteNotFoundReason = state.type === 'SUBSTITUTE_NOT_FOUND' ? state.reason : '';
    const foundSubstitute = state.type === 'SUBSTITUTE_FOUND_MODAL' ? state.foundSubstitute : null;

    return (
      <>
        {/* 1. Identity Mismatch Modal */}
        <Modal visible={state.type === 'IDENTITY_MISMATCH_MODAL'} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.identityModal}>
              <Ionicons name="warning" size={48} color="#ef4444" />
              <Text style={styles.identityModalTitle}>Wrong Item Detected</Text>
              <Text style={styles.identityModalText}>
                I see a <Text style={styles.identityModalHighlight}>{detectedItem}</Text>, but your diagnosis is for a <Text style={styles.identityModalHighlight}>{expectedItem || 'different item'}</Text>.
              </Text>

              <TouchableOpacity style={styles.identityModalButtonPrimary} onPress={handleContinueWithOriginal}>
                <Ionicons name="camera" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.identityModalButtonPrimaryText}>Continue with {expectedItem || 'Original Item'}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.identityModalButtonSecondary} onPress={handleStartNewDiagnosis}>
                <Ionicons name="add-circle-outline" size={18} color="#1E5AA8" style={{ marginRight: 8 }} />
                <Text style={styles.identityModalButtonSecondaryText}>Start New Diagnosis</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.identityModalButtonTertiary} onPress={() => navigation.goBack()}>
                <Text style={styles.identityModalButtonTertiaryText}>Exit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* 2. Override Confirmation Modal */}
        <Modal visible={state.type === 'OVERRIDE_CONFIRMATION_MODAL'} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.overrideModal}>
              <Ionicons name="checkmark-done-circle" size={48} color="#10b981" />
              <Text style={styles.overrideModalTitle}>Mark Step Complete?</Text>
              <Text style={styles.overrideModalText}>
                Ready to move on to the next step?
              </Text>
              <Text style={styles.overrideModalStep}>
                Step {stepNumber}: "{state.type === 'OVERRIDE_CONFIRMATION_MODAL' ? state.instruction : currentStep?.instruction}"
              </Text>

              <TouchableOpacity style={[styles.overrideModalButtonPrimary, { backgroundColor: '#10b981' }]} onPress={handleOverrideConfirm}>
                <Ionicons name="checkmark" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.overrideModalButtonPrimaryText}>Yes, Move to Next Step</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.overrideModalButtonSecondary} onPress={() => dispatch({ type: 'OVERRIDE_CANCELLED' })}>
                <Text style={styles.overrideModalButtonSecondaryText}>Not Yet</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* 3. AI Completion Suggestion Modal */}
        <Modal visible={state.type === 'COMPLETION_SUGGESTED_MODAL'} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.completionModal}>
              <Ionicons name="checkmark-circle" size={48} color="#10b981" />
              <Text style={styles.completionModalTitle}>Step Complete?</Text>
              <Text style={styles.completionModalText}>
                {completionEvidence || 'It looks like you may have completed this step.'}
              </Text>
              <Text style={styles.completionModalStep}>
                Step {stepNumber}: "{currentStep?.instruction}"
              </Text>

              <TouchableOpacity style={styles.completionModalButtonPrimary} onPress={handleCompletionConfirm}>
                <Ionicons name="checkmark" size={20} color="#ffffff" />
                <Text style={styles.completionModalButtonPrimaryText}>Yes, Done!</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.completionModalButtonSecondary} onPress={handleCompletionDeny}>
                <Text style={styles.completionModalButtonSecondaryText}>Not Yet, Keep Going</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* 4. Session Paused Modal (Complex - 4 pause reasons) */}
        <Modal visible={state.type === 'PAUSED' && !showPlanModal} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.pauseModal}>
              <Ionicons
                name={pauseReason === 'get_item' && neededItems.length > 0 ? 'construct' : pauseReason === 'get_item' ? 'play-circle' : pauseReason === 'working_on_step' ? 'build' : pauseReason === 'do_task' ? 'hand-left' : 'pause-circle'}
                size={48}
                color={pauseReason === 'working_on_step' ? '#10b981' : pauseReason === 'do_task' ? '#f59e0b' : '#1E5AA8'}
              />
              <Text style={styles.pauseModalTitle}>
                {pauseReason === 'get_item' && neededItems.length > 0
                  ? 'Items Needed'
                  : pauseReason === 'get_item'
                    ? `Step ${stepNumber}`
                    : pauseReason === 'working_on_step'
                      ? 'Working...'
                      : pauseReason === 'do_task'
                        ? 'Your Turn!'
                        : 'Session Paused'}
              </Text>
              <Text style={styles.pauseModalText}>
                {pauseReason === 'get_item' && neededItems.length > 0
                  ? 'Check any items you DON\'T have:'
                  : pauseReason === 'get_item'
                    ? currentStep?.instruction || 'Ready to start this step'
                    : pauseReason === 'working_on_step'
                      ? `Take your time ${workingStepDescription}. Tap "Done" when finished.`
                      : pauseReason === 'do_task'
                        ? 'Complete this task:'
                        : pauseMessage}
              </Text>

              {/* Item Checklist - only for get_item reason WITH items */}
              {pauseReason === 'get_item' && neededItems.length > 0 && (
                <View style={styles.itemChecklist}>
                  {neededItems.map((item, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.itemChecklistRow,
                        localMissingItems.has(item) && styles.itemChecklistRowMissing
                      ]}
                      onPress={() => handleToggleMissingItem(item)}
                    >
                      <Ionicons
                        name={localMissingItems.has(item) ? 'close-circle' : 'checkmark-circle'}
                        size={24}
                        color={localMissingItems.has(item) ? '#ef4444' : '#10b981'}
                      />
                      <Text style={[
                        styles.itemChecklistText,
                        localMissingItems.has(item) && styles.itemChecklistTextMissing
                      ]}>
                        {item.charAt(0).toUpperCase() + item.slice(1)}
                      </Text>
                      {localMissingItems.has(item) && (
                        <Text style={styles.itemChecklistMissingLabel}>Don't have</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {pauseReason === 'get_item' && localMissingItems.size > 0 && (
                <View style={styles.substituteSearchSection}>
                  <View style={styles.pauseModalTip}>
                    <Ionicons name="bulb-outline" size={20} color="#f59e0b" />
                    <Text style={styles.pauseModalTipText}>
                      We'll update the plan to work without these items
                    </Text>
                  </View>

                  {/* Help me find a substitute button */}
                  <TouchableOpacity
                    style={styles.findSubstituteButton}
                    onPress={handleStartSubstituteSearch}
                  >
                    <View style={styles.findSubstituteButtonContent}>
                      <Ionicons name="search" size={20} color="#8b5cf6" />
                      <View style={styles.findSubstituteButtonTextContainer}>
                        <Text style={styles.findSubstituteButtonTitle}>Help me find a substitute</Text>
                        <Text style={styles.findSubstituteButtonSubtitle}>
                          Show me your drawer, cabinet, or garage
                        </Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#8b5cf6" />
                  </TouchableOpacity>
                </View>
              )}

              {/* Show current step for working_on_step */}
              {pauseReason === 'working_on_step' && (
                <View style={styles.pauseModalCurrentStepBox}>
                  <Text style={styles.pauseModalCurrentStepLabel}>Step {stepNumber}:</Text>
                  <Text style={styles.pauseModalCurrentStep}>
                    {currentStep?.instruction}
                  </Text>
                </View>
              )}

              {/* Show task instruction for do_task */}
              {pauseReason === 'do_task' && taskInstruction && (
                <View style={styles.taskInstructionBox}>
                  <Text style={styles.taskInstructionText}>
                    {taskInstruction}
                  </Text>
                  {/* Small View Plan link */}
                  <TouchableOpacity
                    style={styles.viewPlanLink}
                    onPress={() => {
                      setShowPlanModal(true);
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    }}
                  >
                    <Ionicons name="list-outline" size={14} color="#3b82f6" />
                    <Text style={styles.viewPlanLinkText}>
                      View {planRevision > 0 ? 'Updated ' : ''}Plan
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {pauseReason !== 'get_item' && pauseReason !== 'working_on_step' && pauseReason !== 'do_task' && (
                <Text style={styles.pauseModalCurrentStep}>
                  Current Step: {currentStep?.instruction}
                </Text>
              )}

              {pauseReason === 'get_item' ? (
                <>
                  <TouchableOpacity
                    style={[styles.pauseModalButtonPrimary, isRegeneratingPlan && styles.pauseModalButtonDisabled]}
                    onPress={neededItems.length === 0 ? handleResumeSession : handleRegeneratePlan}
                    disabled={isRegeneratingPlan}
                  >
                    {isRegeneratingPlan ? (
                      <ActivityIndicator color="#ffffff" size="small" />
                    ) : (
                      <Ionicons name={localMissingItems.size > 0 ? 'refresh' : 'play'} size={24} color="#ffffff" />
                    )}
                    <Text style={styles.pauseModalButtonPrimaryText}>
                      {isRegeneratingPlan
                        ? 'Updating Plan...'
                        : neededItems.length === 0
                          ? 'Continue'
                          : localMissingItems.size > 0
                            ? 'Update Plan & Continue'
                            : 'I Have Everything - Continue'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : pauseReason === 'working_on_step' ? (
                <>
                  <TouchableOpacity style={[styles.pauseModalButtonPrimary, { backgroundColor: '#10b981' }]} onPress={handleResumeSession}>
                    <Ionicons name="checkmark-circle" size={24} color="#ffffff" />
                    <Text style={styles.pauseModalButtonPrimaryText}>Done - Check My Work</Text>
                  </TouchableOpacity>

                  {/* Mark Step Complete - Skip AI verification */}
                  <TouchableOpacity
                    style={[styles.pauseModalButtonSecondary, { marginTop: 10, borderColor: '#10b981' }]}
                    onPress={() => {
                      dispatch({ type: 'USER_REQUESTED_OVERRIDE' });
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }}
                  >
                    <Ionicons name="checkmark-done" size={20} color="#10b981" style={{ marginRight: 8 }} />
                    <Text style={[styles.pauseModalButtonSecondaryText, { color: '#10b981' }]}>Mark Step Complete</Text>
                  </TouchableOpacity>
                </>
              ) : pauseReason === 'do_task' ? (
                <>
                  {/* Repeat Instruction Button */}
                  <TouchableOpacity
                    style={[styles.pauseModalButtonSecondary, { backgroundColor: '#6366f1', marginBottom: 10 }]}
                    onPress={() => {
                      if (taskInstruction) {
                        speakGuidance(taskInstruction);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                    }}
                  >
                    <Ionicons name="volume-high" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                    <Text style={[styles.pauseModalButtonSecondaryText, { color: '#ffffff' }]}>Repeat Instruction</Text>
                  </TouchableOpacity>

                  {/* Ask a Question Button */}
                  <TouchableOpacity
                    style={[
                      styles.pauseModalButtonSecondary,
                      { backgroundColor: '#1E5AA8', marginBottom: 10 },
                      (isListening || questionCooldown) && styles.pauseModalButtonDisabled
                    ]}
                    onPress={startListening}
                    disabled={isListening || questionCooldown}
                  >
                    {isListening ? (
                      <>
                        <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
                        <Text style={[styles.pauseModalButtonSecondaryText, { color: '#ffffff' }]}>Listening...</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="mic" size={20} color="#ffffff" style={{ marginRight: 8 }} />
                        <Text style={[styles.pauseModalButtonSecondaryText, { color: '#ffffff' }]}>Ask a Question</Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {/* Got it - Continue Button */}
                  <TouchableOpacity style={[styles.pauseModalButtonPrimary, { backgroundColor: '#10b981' }]} onPress={handleResumeSession}>
                    <Ionicons name="checkmark-circle" size={24} color="#ffffff" />
                    <Text style={styles.pauseModalButtonPrimaryText}>Got It!</Text>
                  </TouchableOpacity>

                  {/* Mark Step Complete - Manual override option */}
                  <TouchableOpacity
                    style={[styles.pauseModalButtonSecondary, { marginTop: 10, borderColor: '#10b981' }]}
                    onPress={() => {
                      dispatch({ type: 'USER_REQUESTED_OVERRIDE' });
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    }}
                  >
                    <Ionicons name="checkmark-done" size={20} color="#10b981" style={{ marginRight: 8 }} />
                    <Text style={[styles.pauseModalButtonSecondaryText, { color: '#10b981' }]}>Mark Step Complete</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={styles.pauseModalButtonPrimary} onPress={handleResumeSession}>
                  <Ionicons name="play" size={24} color="#ffffff" />
                  <Text style={styles.pauseModalButtonPrimaryText}>Resume Session</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.pauseModalButtonSecondary} onPress={handleStopSession}>
                <Text style={styles.pauseModalButtonSecondaryText}>Stop & Exit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* 5. New Plan Modal */}
        <Modal visible={state.type === 'NEW_PLAN_MODAL'} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.newPlanModal}>
              <View style={styles.newPlanHeader}>
                <Ionicons name="refresh-circle" size={36} color={PLAN_COLORS[planRevision % PLAN_COLORS.length]} />
                <Text style={styles.newPlanTitle}>Plan Updated!</Text>
                <View style={[styles.newPlanBadge, { backgroundColor: PLAN_COLORS[planRevision % PLAN_COLORS.length] }]}>
                  <Text style={styles.newPlanBadgeText}>v{planRevision + 1}</Text>
                </View>
              </View>

              <Text style={styles.newPlanSubtitle}>
                Here are your updated steps (starting from step {stepNumber}):
              </Text>

              <ScrollView style={styles.newPlanStepsList} showsVerticalScrollIndicator={true}>
                {newPlanSteps.map((step, index) => (
                  <View key={index} style={styles.newPlanStepItem}>
                    <View style={[styles.newPlanStepNumber, { backgroundColor: PLAN_COLORS[planRevision % PLAN_COLORS.length] }]}>
                      <Text style={styles.newPlanStepNumberText}>{stepNumber + index}</Text>
                    </View>
                    <View style={styles.newPlanStepContent}>
                      <Text style={styles.newPlanStepInstruction}>{step.instruction}</Text>
                      {step.toolsNeeded && step.toolsNeeded.length > 0 && (
                        <View style={styles.newPlanStepTools}>
                          <Ionicons name="construct-outline" size={12} color="#64748b" />
                          <Text style={styles.newPlanStepToolsText}>
                            {step.toolsNeeded.join(', ')}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={[styles.newPlanButton, { backgroundColor: PLAN_COLORS[planRevision % PLAN_COLORS.length] }]}
                onPress={handleAcknowledgeNewPlan}
              >
                <Ionicons name="checkmark-circle" size={24} color="#ffffff" />
                <Text style={styles.newPlanButtonText}>Got It - Let's Continue!</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* View Full Plan Modal */}
        <Modal visible={showPlanModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.viewPlanModal}>
              <View style={styles.viewPlanHeader}>
                <View style={styles.viewPlanTitleRow}>
                  <Ionicons name="list" size={24} color={PLAN_COLORS[planRevision % PLAN_COLORS.length]} />
                  <Text style={styles.viewPlanTitle}>Repair Plan</Text>
                  {planRevision > 0 && (
                    <View style={[styles.viewPlanBadge, { backgroundColor: PLAN_COLORS[planRevision % PLAN_COLORS.length] }]}>
                      <Text style={styles.viewPlanBadgeText}>v{planRevision + 1}</Text>
                    </View>
                  )}
                </View>
                <TouchableOpacity onPress={() => setShowPlanModal(false)} style={styles.viewPlanCloseButton}>
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.viewPlanStepsList} showsVerticalScrollIndicator={true}>
                {(!context.repairSteps || context.repairSteps.length === 0) ? (
                  <Text style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>No steps available yet.</Text>
                ) : context.repairSteps.map((step, index) => {
                  const isCurrentStep = index + 1 === stepNumber;
                  const isCompleted = index + 1 < stepNumber;
                  return (
                    <View
                      key={index}
                      style={[
                        styles.viewPlanStepItem,
                        isCurrentStep && styles.viewPlanStepItemCurrent,
                        isCompleted && styles.viewPlanStepItemCompleted,
                      ]}
                    >
                      <View style={[
                        styles.viewPlanStepNumber,
                        {
                          backgroundColor: isCompleted
                            ? '#10b981'
                            : isCurrentStep
                              ? PLAN_COLORS[planRevision % PLAN_COLORS.length]
                              : '#cbd5e1'
                        }
                      ]}>
                        {isCompleted ? (
                          <Ionicons name="checkmark" size={14} color="#ffffff" />
                        ) : (
                          <Text style={styles.viewPlanStepNumberText}>{index + 1}</Text>
                        )}
                      </View>
                      <View style={styles.viewPlanStepContent}>
                        <Text style={[
                          styles.viewPlanStepInstruction,
                          isCompleted && styles.viewPlanStepInstructionCompleted,
                          isCurrentStep && styles.viewPlanStepInstructionCurrent,
                        ]}>
                          {step.instruction}
                        </Text>
                        {(step.toolsNeeded?.length > 0 || step.materialsNeeded?.length > 0) && (
                          <View style={styles.viewPlanStepItems}>
                            {step.toolsNeeded?.map((tool, i) => (
                              <View key={`tool-${i}`} style={styles.viewPlanStepItemChip}>
                                <Ionicons name="construct-outline" size={10} color="#64748b" />
                                <Text style={styles.viewPlanStepItemChipText}>{tool}</Text>
                              </View>
                            ))}
                            {step.materialsNeeded?.map((material, i) => (
                              <View key={`mat-${i}`} style={styles.viewPlanStepItemChip}>
                                <Ionicons name="cube-outline" size={10} color="#64748b" />
                                <Text style={styles.viewPlanStepItemChipText}>{material}</Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                style={[styles.viewPlanCloseButtonFull, { backgroundColor: PLAN_COLORS[planRevision % PLAN_COLORS.length] }]}
                onPress={() => setShowPlanModal(false)}
              >
                <Text style={styles.viewPlanCloseButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* 6a. Substitute Scan Ready Modal - User clicks "Start Scanning" */}
        <Modal visible={state.type === 'SUBSTITUTE_SCAN_READY'} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.substituteScanReadyModal}>
              <View style={styles.substituteScanReadyHeader}>
                <Ionicons name="search" size={48} color="#8b5cf6" />
                <Text style={styles.substituteScanReadyTitle}>Find a Substitute</Text>
              </View>

              <View style={styles.substituteScanReadyContent}>
                <Text style={styles.substituteScanReadyLabel}>Looking for something to replace:</Text>
                <View style={styles.substituteScanReadyItemBox}>
                  <Ionicons name="close-circle" size={24} color="#ef4444" />
                  <Text style={styles.substituteScanReadyItemText}>{substituteSearchItem}</Text>
                </View>

                <Text style={styles.substituteScanReadyInstructions}>
                  Point your camera at a drawer, cabinet, or anywhere you might have a substitute item.
                </Text>
              </View>

              <View style={styles.substituteScanReadyButtons}>
                <TouchableOpacity
                  style={styles.substituteScanReadyButtonPrimary}
                  onPress={() => {
                    dispatch({ type: 'BEGIN_SCANNING' });
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }}
                >
                  <Ionicons name="scan" size={24} color="#ffffff" />
                  <Text style={styles.substituteScanReadyButtonPrimaryText}>Start Scanning</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.substituteScanReadyButtonSecondary}
                  onPress={() => {
                    dispatch({ type: 'SKIP_AND_UPDATE_PLAN' });
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={styles.substituteScanReadyButtonSecondaryText}>Skip & Update Plan Without</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.substituteScanReadyButtonCancel}
                  onPress={handleCancelSubstituteSearch}
                >
                  <Text style={styles.substituteScanReadyButtonCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* 6b. Substitute Search Overlay - Active scanning */}
        <Modal visible={state.type === 'SEARCHING_SUBSTITUTE'} transparent animationType="fade">
          <View style={styles.substituteSearchOverlay}>
            {/* Scanning indicator at top */}
            <View style={styles.substituteSearchHeader}>
              <View style={styles.substituteSearchHeaderContent}>
                <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 10 }} />
                <View>
                  <Text style={styles.substituteSearchTitle}>
                    Scanning for: {substituteSearchItem}
                  </Text>
                  <Text style={styles.substituteSearchSubtitle}>
                    Move camera slowly across your items
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.substituteSearchCancelButton}
                onPress={handleCancelSubstituteSearch}
              >
                <Ionicons name="close" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>

            {/* Scanning animation indicator */}
            <View style={styles.substituteSearchScanIndicator}>
              <View style={styles.substituteSearchScanFrame}>
                <View style={styles.substituteSearchScanCorner} />
                <View style={[styles.substituteSearchScanCorner, { right: 0, left: undefined }]} />
                <View style={[styles.substituteSearchScanCorner, { bottom: 0, top: undefined }]} />
                <View style={[styles.substituteSearchScanCorner, { bottom: 0, right: 0, left: undefined, top: undefined }]} />
              </View>
              <Text style={styles.substituteSearchScanText}>
                Analyzing visible items...
              </Text>
            </View>

            {/* Progress indicator */}
            <View style={styles.substituteSearchTip}>
              <Ionicons name="bulb-outline" size={18} color="#f59e0b" />
              <Text style={styles.substituteSearchTipText}>
                I'll highlight items that could work as substitutes
              </Text>
            </View>
          </View>
        </Modal>

        {/* 6c. Substitute Not Found Modal */}
        <Modal visible={state.type === 'SUBSTITUTE_NOT_FOUND'} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.substituteNotFoundModal}>
              <View style={styles.substituteNotFoundHeader}>
                <Ionicons name="search-outline" size={48} color="#64748b" />
                <Text style={styles.substituteNotFoundTitle}>No Substitutes Found</Text>
              </View>

              <View style={styles.substituteNotFoundContent}>
                <Text style={styles.substituteNotFoundLabel}>I couldn't find a substitute for:</Text>
                <View style={styles.substituteNotFoundItemBox}>
                  <Ionicons name="close-circle" size={20} color="#ef4444" />
                  <Text style={styles.substituteNotFoundItemText}>{substituteSearchItem}</Text>
                </View>
                <Text style={styles.substituteNotFoundReason}>{substituteNotFoundReason}</Text>
              </View>

              <View style={styles.substituteNotFoundButtons}>
                <TouchableOpacity
                  style={styles.substituteNotFoundButtonPrimary}
                  onPress={() => {
                    dispatch({ type: 'SCAN_AGAIN' });
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  }}
                >
                  <Ionicons name="refresh" size={22} color="#ffffff" />
                  <Text style={styles.substituteNotFoundButtonPrimaryText}>Scan Again</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.substituteNotFoundButtonSecondary}
                  onPress={() => {
                    dispatch({ type: 'SKIP_AND_UPDATE_PLAN' });
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Ionicons name="create-outline" size={20} color="#8b5cf6" style={{ marginRight: 8 }} />
                  <Text style={styles.substituteNotFoundButtonSecondaryText}>Update Repair Plan</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* 7. Substitute Confirmation Modal */}
        <Modal visible={state.type === 'SUBSTITUTE_FOUND_MODAL' && foundSubstitute !== null} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.substituteConfirmModal}>
              <View style={styles.substituteConfirmHeader}>
                <View style={styles.substituteConfirmIcon}>
                  <Ionicons name="checkmark-circle" size={40} color="#10b981" />
                </View>
                <Text style={styles.substituteConfirmTitle}>Found a Substitute!</Text>
              </View>

              <View style={styles.substituteConfirmContent}>
                <View style={styles.substituteConfirmItem}>
                  <Text style={styles.substituteConfirmLabel}>Instead of:</Text>
                  <View style={styles.substituteConfirmItemBox}>
                    <Ionicons name="close-circle" size={20} color="#ef4444" />
                    <Text style={styles.substituteConfirmItemTextMissing}>{substituteSearchItem}</Text>
                  </View>
                </View>

                <Ionicons name="arrow-down" size={24} color="#8b5cf6" style={{ alignSelf: 'center', marginVertical: 8 }} />

                <View style={styles.substituteConfirmItem}>
                  <Text style={styles.substituteConfirmLabel}>Use this:</Text>
                  <View style={[styles.substituteConfirmItemBox, styles.substituteConfirmItemBoxFound]}>
                    <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                    <Text style={styles.substituteConfirmItemTextFound}>{foundSubstitute?.item}</Text>
                  </View>
                </View>

                {foundSubstitute?.reason && (
                  <View style={styles.substituteConfirmReason}>
                    <Ionicons name="information-circle" size={18} color="#3b82f6" />
                    <Text style={styles.substituteConfirmReasonText}>{foundSubstitute.reason}</Text>
                  </View>
                )}

                {foundSubstitute?.instruction && (
                  <View style={styles.substituteConfirmInstruction}>
                    <Text style={styles.substituteConfirmInstructionText}>{foundSubstitute.instruction}</Text>
                  </View>
                )}
              </View>

              <View style={styles.substituteConfirmButtons}>
                <TouchableOpacity
                  style={styles.substituteConfirmButtonPrimary}
                  onPress={handleConfirmSubstitute}
                >
                  <Ionicons name="checkmark" size={22} color="#ffffff" />
                  <Text style={styles.substituteConfirmButtonPrimaryText}>Use This Substitute</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.substituteConfirmButtonSecondary}
                  onPress={() => dispatch({ type: 'KEEP_LOOKING' })}
                >
                  <Ionicons name="search" size={18} color="#64748b" />
                  <Text style={styles.substituteConfirmButtonSecondaryText}>Keep Looking</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.substituteConfirmButtonCancel}
                  onPress={handleCancelSubstituteSearch}
                >
                  <Text style={styles.substituteConfirmButtonCancelText}>Skip - Update Plan Without</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* 8. Voice Settings Modal */}
        <Modal visible={showVoiceModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.voiceModal}>
              <View style={styles.voiceModalHeader}>
                <Text style={styles.voiceModalTitle}>Voice Settings</Text>
                <TouchableOpacity onPress={() => setShowVoiceModal(false)}>
                  <Ionicons name="close" size={28} color="#64748b" />
                </TouchableOpacity>
              </View>

              {/* Speed Control */}
              <View style={styles.voiceSettingRow}>
                <Text style={styles.voiceSettingLabel}>Speed</Text>
                <View style={styles.voiceSettingControls}>
                  <TouchableOpacity style={styles.voiceAdjustButton} onPress={() => adjustRate(-0.1)}>
                    <Ionicons name="remove" size={24} color="#1E5AA8" />
                  </TouchableOpacity>
                  <Text style={styles.voiceSettingValue}>{voiceSettings.rate.toFixed(1)}x</Text>
                  <TouchableOpacity style={styles.voiceAdjustButton} onPress={() => adjustRate(0.1)}>
                    <Ionicons name="add" size={24} color="#1E5AA8" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Pitch Control */}
              <View style={styles.voiceSettingRow}>
                <Text style={styles.voiceSettingLabel}>Pitch</Text>
                <View style={styles.voiceSettingControls}>
                  <TouchableOpacity style={styles.voiceAdjustButton} onPress={() => adjustPitch(-0.1)}>
                    <Ionicons name="remove" size={24} color="#1E5AA8" />
                  </TouchableOpacity>
                  <Text style={styles.voiceSettingValue}>{voiceSettings.pitch.toFixed(1)}</Text>
                  <TouchableOpacity style={styles.voiceAdjustButton} onPress={() => adjustPitch(0.1)}>
                    <Ionicons name="add" size={24} color="#1E5AA8" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Text Box Opacity Control */}
              <View style={styles.voiceSettingRow}>
                <Text style={styles.voiceSettingLabel}>Text Box Opacity</Text>
                <View style={styles.voiceSettingControls}>
                  <TouchableOpacity style={styles.voiceAdjustButton} onPress={() => adjustOpacity(-0.1)}>
                    <Ionicons name="remove" size={24} color="#1E5AA8" />
                  </TouchableOpacity>
                  <Text style={styles.voiceSettingValue}>{Math.round(textBoxOpacity * 100)}%</Text>
                  <TouchableOpacity style={styles.voiceAdjustButton} onPress={() => adjustOpacity(0.1)}>
                    <Ionicons name="add" size={24} color="#1E5AA8" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Voice Selection */}
              <Text style={styles.voiceSectionTitle}>Voice</Text>
              <ScrollView style={styles.voiceList} showsVerticalScrollIndicator={false}>
                {/* Default Voice Option */}
                <TouchableOpacity
                  style={[
                    styles.voiceOption,
                    !voiceSettings.voiceIdentifier && styles.voiceOptionSelected,
                  ]}
                  onPress={() => selectVoice(null)}
                >
                  <View style={styles.voiceOptionInfo}>
                    <Text style={styles.voiceOptionName}>Default</Text>
                    <Text style={styles.voiceOptionQuality}>System default voice</Text>
                  </View>
                  {!voiceSettings.voiceIdentifier && (
                    <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                  )}
                </TouchableOpacity>

                {/* Available Voices */}
                {availableVoices.map((voice) => (
                  <TouchableOpacity
                    key={voice.identifier}
                    style={[
                      styles.voiceOption,
                      voiceSettings.voiceIdentifier === voice.identifier && styles.voiceOptionSelected,
                    ]}
                    onPress={() => selectVoice(voice)}
                  >
                    <View style={styles.voiceOptionInfo}>
                      <Text style={styles.voiceOptionName}>{voice.name}</Text>
                      <Text style={styles.voiceOptionQuality}>
                        {voice.quality === 'Enhanced' ? 'Enhanced quality' : 'Standard'}
                      </Text>
                    </View>
                    {voiceSettings.voiceIdentifier === voice.identifier && (
                      <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Preview Button */}
              <TouchableOpacity style={styles.voicePreviewButton} onPress={previewVoice}>
                <Ionicons name="play" size={20} color="#ffffff" />
                <Text style={styles.voicePreviewButtonText}>Preview Voice</Text>
              </TouchableOpacity>

              {/* Voice troubleshooting tip */}
              {Platform.OS === 'ios' && (
                <View style={styles.voiceTip}>
                  <Ionicons name="information-circle" size={16} color="#64748b" />
                  <Text style={styles.voiceTipText}>
                    If you can't hear voice, turn off Silent Mode and check volume
                  </Text>
                </View>
              )}

              {/* Done Button */}
              <TouchableOpacity
                style={styles.voiceDoneButton}
                onPress={() => setShowVoiceModal(false)}
              >
                <Text style={styles.voiceDoneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* 9. Conversation Modal - persistent back-and-forth with user */}
        <Modal visible={state.type === 'CONVERSATION' || state.type === 'SHOWING_ANSWER' || state.type === 'PROCESSING_QUESTION'} transparent animationType="fade">
          <View style={styles.conversationOverlay}>
            <View style={styles.conversationModal}>
              <View style={styles.conversationHeader}>
                <Ionicons name="chatbubbles" size={28} color="#1E5AA8" />
                <Text style={styles.conversationTitle}>
                  {state.type === 'PROCESSING_QUESTION' ? 'Thinking...' : 'Ask Me Anything'}
                </Text>
              </View>

              {/* Conversation History */}
              <ScrollView style={styles.conversationHistory} showsVerticalScrollIndicator={true}>
                {state.type === 'CONVERSATION' && state.conversationHistory.map((entry, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.conversationBubble,
                      entry.role === 'user' ? styles.conversationBubbleUser : styles.conversationBubbleAssistant
                    ]}
                  >
                    <Text style={[
                      styles.conversationBubbleText,
                      entry.role === 'user' ? styles.conversationBubbleTextUser : styles.conversationBubbleTextAssistant
                    ]}>
                      {entry.content}
                    </Text>
                  </View>
                ))}
                {state.type === 'SHOWING_ANSWER' && (
                  <>
                    <View style={[styles.conversationBubble, styles.conversationBubbleUser]}>
                      <Text style={[styles.conversationBubbleText, styles.conversationBubbleTextUser]}>
                        {state.question}
                      </Text>
                    </View>
                    <View style={[styles.conversationBubble, styles.conversationBubbleAssistant]}>
                      <Text style={[styles.conversationBubbleText, styles.conversationBubbleTextAssistant]}>
                        {state.answer}
                      </Text>
                    </View>
                  </>
                )}
                {state.type === 'PROCESSING_QUESTION' && (
                  <>
                    <View style={[styles.conversationBubble, styles.conversationBubbleUser]}>
                      <Text style={[styles.conversationBubbleText, styles.conversationBubbleTextUser]}>
                        {state.question}
                      </Text>
                    </View>
                    <View style={[styles.conversationBubble, styles.conversationBubbleAssistant]}>
                      <ActivityIndicator size="small" color="#1E5AA8" />
                    </View>
                  </>
                )}
              </ScrollView>

              {/* Actions */}
              <View style={styles.conversationActions}>
                {/* Ask another question */}
                <TouchableOpacity
                  style={[
                    styles.conversationAskButton,
                    (isListening || questionCooldown || state.type === 'PROCESSING_QUESTION') && styles.conversationButtonDisabled
                  ]}
                  onPress={() => {
                    if (state.type === 'SHOWING_ANSWER') {
                      dismissAnswer(); // Transition to CONVERSATION first
                    }
                    startListening();
                  }}
                  disabled={isListening || questionCooldown || state.type === 'PROCESSING_QUESTION'}
                >
                  {isListening ? (
                    <>
                      <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 8 }} />
                      <Text style={styles.conversationAskButtonText}>Listening...</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="mic" size={22} color="#ffffff" />
                      <Text style={styles.conversationAskButtonText}>Ask Another Question</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Resume Button */}
                <TouchableOpacity
                  style={styles.conversationResumeButton}
                  onPress={() => {
                    if (state.type === 'SHOWING_ANSWER') {
                      dispatch({ type: 'DISMISS_ANSWER' });
                    }
                    dispatch({ type: 'END_CONVERSATION' });
                    // Restart frame capture
                    if (cameraRef.current) {
                      frameCaptureService.current.start(cameraRef, {
                        getState: () => state,
                        getContext: () => context,
                        dispatch,
                        isSpeaking: () => isSpeaking.current,
                      });
                    }
                    speakGuidance('Resuming session. Point your camera at the work area.');
                  }}
                  disabled={state.type === 'PROCESSING_QUESTION'}
                >
                  <Ionicons name="play-circle" size={22} color="#10b981" />
                  <Text style={styles.conversationResumeButtonText}>Resume Session</Text>
                </TouchableOpacity>
              </View>

              {/* Tip about constraints */}
              <View style={styles.conversationTip}>
                <Ionicons name="bulb-outline" size={16} color="#f59e0b" />
                <Text style={styles.conversationTipText}>
                  Say "I don't have..." to update your plan, or ask any question about the repair
                </Text>
              </View>
            </View>
          </View>
        </Modal>
      </>
    );
  }

  // ============================================================================
  // PLAN REGENERATION
  // ============================================================================

  async function regeneratePlanWithMissingItems(missingItems: string[], preservedStepIndex: number) {
    try {
      speakGuidance('Finding alternative steps. One moment...');

      // Use the preserved step index (passed from caller to avoid stale state)
      const currentStepIndex = preservedStepIndex;
      const completedSteps = context.repairSteps.slice(0, currentStepIndex);
      const currentStepInstruction = context.repairSteps[currentStepIndex]?.instruction || '';
      console.log(`🔄 Regenerating plan from step ${currentStepIndex + 1} (preserving ${completedSteps.length} completed steps)`);

      console.log('🔄 Regenerating plan with missing items:', missingItems);

      // Build substitutes description for prompt context
      const substitutesMap = Object.fromEntries(context.confirmedSubstitutes);
      const substitutesDescription = Object.keys(substitutesMap).length > 0
        ? `Use these CONFIRMED SUBSTITUTES:\n${Object.entries(substitutesMap).map(([banned, sub]) => `- Use "${sub}" instead of "${banned}"`).join('\n')}`
        : '';

      // Build enhanced prompt that tells AI about completed steps
      // This is CRITICAL to prevent regenerating from step 1
      const regeneratePrompt = `${diagnosisSummary}.

User has completed steps 1-${currentStepIndex} already.
Current step (step ${currentStepIndex + 1}): ${currentStepInstruction}

${substitutesDescription}

IMPORTANT: Generate ONLY the remaining steps starting from step ${currentStepIndex + 1}.
Do NOT regenerate steps 1-${currentStepIndex} - those are already complete.`;

      // Generate new plan with banned items and substitutes
      const newSteps = await generateRepairPlan(
        category,
        regeneratePrompt,
        likelyCause,
        Array.from(context.permanentlyUnavailableItems),
        substitutesMap
      );

      // Combine completed steps with new steps
      const updatedPlan = [...completedSteps, ...newSteps];

      // Update context
      context.repairSteps = updatedPlan;

      console.log(`📋 Updated plan: ${completedSteps.length} completed + ${newSteps.length} new = ${updatedPlan.length} total steps`);

      // Dispatch plan regenerated
      dispatch({
        type: 'PLAN_REGENERATED',
        newSteps: updatedPlan,
        planRevision: context.planRevision + 1,
      });

      speakGuidance('Got it! I found alternative steps for you.');
    } catch (error: any) {
      console.error('❌ Failed to regenerate plan:', error);
      Alert.alert(
        'Unable to Regenerate Plan',
        error.message || 'Please try again',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => dispatch({ type: 'PAUSE_MANUAL' }) },
          { text: 'Retry', onPress: () => regeneratePlanWithMissingItems(missingItems, preservedStepIndex) },
        ]
      );
    }
  }
}

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  headerLogo: {
    width: 600,
    height: 210,
    alignSelf: 'center',
    marginTop: -10,
    marginBottom: -80,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 2,
    marginTop: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  actionRowRight: {
    flexDirection: 'row',
    gap: 10,
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-start',
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.95)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  stopButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  controlToggle: {
    backgroundColor: 'rgba(30, 90, 168, 0.9)',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlToggleActive: {
    backgroundColor: 'rgba(245, 158, 11, 0.9)',
  },
  controlToggleRecognition: {
    backgroundColor: 'rgba(16, 185, 129, 0.9)',
  },
  pauseButton: {
    backgroundColor: 'rgba(245, 158, 11, 0.9)',
  },
  identityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    marginTop: 4,
    borderRadius: 12,
    gap: 8,
  },
  identityBannerText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  progressContainer: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    marginTop: 4,
  },
  progressBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 4,
  },
  progressText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  planRevisionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 10,
    gap: 3,
  },
  planRevisionBadgeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  progressTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // View Plan Modal styles
  viewPlanModal: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  viewPlanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  viewPlanTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  viewPlanTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  viewPlanBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  viewPlanBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  viewPlanCloseButton: {
    padding: 4,
  },
  viewPlanStepsList: {
    maxHeight: 400,
  },
  viewPlanStepItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  viewPlanStepItemCurrent: {
    backgroundColor: '#f0f9ff',
    marginHorizontal: -12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderBottomWidth: 0,
  },
  viewPlanStepItemCompleted: {
    opacity: 0.6,
  },
  viewPlanStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  viewPlanStepNumberText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  viewPlanStepContent: {
    flex: 1,
  },
  viewPlanStepInstruction: {
    fontSize: 14,
    color: '#334155',
    lineHeight: 20,
  },
  viewPlanStepInstructionCurrent: {
    fontWeight: '600',
    color: '#0369a1',
  },
  viewPlanStepInstructionCompleted: {
    textDecorationLine: 'line-through',
    color: '#94a3b8',
  },
  viewPlanStepItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
    gap: 4,
  },
  viewPlanStepItemChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  viewPlanStepItemChipText: {
    fontSize: 10,
    color: '#64748b',
  },
  viewPlanCloseButtonFull: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  viewPlanCloseButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  guidanceContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 30,
  },
  analyzingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(30, 90, 168, 0.9)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginHorizontal: 20,
    marginBottom: 10,
    gap: 8,
    alignSelf: 'center',
  },
  analyzingText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  guidanceBox: {
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    minHeight: 60,
    justifyContent: 'center',
  },
  guidanceText: {
    fontSize: 16,
    color: '#000000',
    lineHeight: 22,
    fontWeight: '500',
  },
  stepStatusContainer: {
    marginTop: 10,
    alignItems: 'center',
  },
  stepStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
  },
  stepStatusPending: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  stepStatusConfirmed: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  stepStatusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  stepStatusTextPending: {
    color: '#f59e0b',
  },
  stepStatusTextConfirmed: {
    color: '#10b981',
  },
  opacityControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    gap: 12,
  },
  opacityButton: {
    backgroundColor: 'rgba(30, 90, 168, 0.8)',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  opacityButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  opacityLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  actionButtonsContainer: {
    marginHorizontal: 20,
    marginTop: 12,
  },
  nextStepButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  nextStepButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#ffffff',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
  },
  errorMessage: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: '#2563eb',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  goBackButton: {
    backgroundColor: '#6b7280',
    marginTop: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  completeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  completeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
  },
  completeMessage: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
  },
  doneButton: {
    marginTop: 32,
    backgroundColor: '#10b981',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 8,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },

  // ============================================================================
  // MODAL STYLES (All 8 modals from old version)
  // ============================================================================

  // Modal Overlay
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  // 1. Identity Mismatch Modal
  identityModal: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  identityModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 16,
    marginBottom: 12,
  },
  identityModalText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 24,
  },
  identityModalHighlight: {
    color: '#1E5AA8',
    fontWeight: 'bold',
  },
  identityModalButtonPrimary: {
    backgroundColor: '#1E5AA8',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 10,
  },
  identityModalButtonPrimaryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  identityModalButtonSecondary: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 10,
  },
  identityModalButtonSecondaryText: {
    color: '#1e293b',
    fontSize: 16,
    fontWeight: '600',
  },
  identityModalButtonTertiary: {
    paddingVertical: 10,
  },
  identityModalButtonTertiaryText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },

  // 2. Override Confirmation Modal
  overrideModal: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  overrideModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 16,
    marginBottom: 12,
  },
  overrideModalText: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 22,
  },
  overrideModalStep: {
    fontSize: 14,
    color: '#1E5AA8',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  overrideModalButtonPrimary: {
    backgroundColor: '#10b981',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  overrideModalButtonPrimaryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  overrideModalButtonSecondary: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  overrideModalButtonSecondaryText: {
    color: '#1e293b',
    fontSize: 16,
    fontWeight: '600',
  },

  // 3. AI Completion Suggestion Modal
  completionModal: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  completionModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#10b981',
    marginTop: 16,
    marginBottom: 12,
  },
  completionModalText: {
    fontSize: 16,
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 24,
  },
  completionModalStep: {
    fontSize: 14,
    color: '#64748b',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  completionModalButtonPrimary: {
    flexDirection: 'row',
    backgroundColor: '#10b981',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    gap: 8,
  },
  completionModalButtonPrimaryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  completionModalButtonSecondary: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  completionModalButtonSecondaryText: {
    color: '#1e293b',
    fontSize: 16,
    fontWeight: '600',
  },

  // 4. Session Paused Modal
  pauseModal: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  pauseModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E5AA8',
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  pauseModalText: {
    fontSize: 16,
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 24,
  },
  pauseModalTip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef3c7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
    gap: 8,
  },
  pauseModalTipText: {
    fontSize: 13,
    color: '#92400e',
    flex: 1,
  },
  pauseModalCurrentStep: {
    fontSize: 14,
    color: '#64748b',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  pauseModalCurrentStepBox: {
    backgroundColor: '#f8fafc',
    padding: 16,
    borderRadius: 12,
    width: '100%',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pauseModalCurrentStepLabel: {
    fontSize: 12,
    color: '#94a3b8',
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  taskInstructionBox: {
    backgroundColor: '#fef3c7',
    padding: 20,
    borderRadius: 16,
    width: '100%',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#f59e0b',
  },
  taskInstructionText: {
    fontSize: 20,
    color: '#92400e',
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 28,
  },
  viewPlanLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f59e0b40',
    gap: 4,
  },
  viewPlanLinkText: {
    fontSize: 13,
    color: '#3b82f6',
    fontWeight: '500',
  },
  pauseModalButtonPrimary: {
    flexDirection: 'row',
    backgroundColor: '#10b981',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 16,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 10,
  },
  pauseModalButtonPrimaryText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  pauseModalButtonSecondary: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  pauseModalButtonSecondaryText: {
    color: '#64748b',
    fontSize: 15,
    fontWeight: '600',
  },
  pauseModalButtonDisabled: {
    opacity: 0.7,
  },

  // Item Checklist
  itemChecklist: {
    width: '100%',
    marginBottom: 16,
    gap: 8,
  },
  itemChecklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 12,
    borderWidth: 2,
    borderColor: '#10b981',
  },
  itemChecklistRowMissing: {
    backgroundColor: '#fef2f2',
    borderColor: '#ef4444',
  },
  itemChecklistText: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '500',
  },
  itemChecklistTextMissing: {
    textDecorationLine: 'line-through',
    color: '#94a3b8',
  },
  itemChecklistMissingLabel: {
    fontSize: 12,
    color: '#ef4444',
    fontWeight: '600',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },

  // 5. New Plan Modal
  newPlanModal: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    width: '95%',
    maxWidth: 400,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  newPlanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  newPlanTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  newPlanBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  newPlanBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  newPlanSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 16,
  },
  newPlanStepsList: {
    maxHeight: 300,
    marginBottom: 20,
  },
  newPlanStepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  newPlanStepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#10b981',
  },
  newPlanStepNumberText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  newPlanStepContent: {
    flex: 1,
  },
  newPlanStepInstruction: {
    fontSize: 15,
    color: '#1e293b',
    lineHeight: 22,
  },
  newPlanStepTools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  newPlanStepToolsText: {
    fontSize: 12,
    color: '#64748b',
  },
  newPlanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    gap: 10,
  },
  newPlanButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: 'bold',
  },

  // 6. Substitute Search Section
  substituteSearchSection: {
    width: '100%',
    gap: 12,
  },
  findSubstituteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f3ff',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#8b5cf6',
    borderStyle: 'dashed',
  },
  findSubstituteButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  findSubstituteButtonTextContainer: {
    flex: 1,
  },
  findSubstituteButtonTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8b5cf6',
  },
  findSubstituteButtonSubtitle: {
    fontSize: 12,
    color: '#a78bfa',
    marginTop: 2,
  },

  // Substitute Search Overlay
  substituteSearchOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 60,
  },
  substituteSearchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(139, 92, 246, 0.9)',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  substituteSearchHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  substituteSearchTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  substituteSearchSubtitle: {
    fontSize: 12,
    color: '#e9d5ff',
    marginTop: 2,
  },
  substituteSearchCancelButton: {
    padding: 8,
    marginLeft: 10,
  },
  substituteSearchScanIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  substituteSearchScanFrame: {
    width: 200,
    height: 200,
    position: 'relative',
  },
  substituteSearchScanCorner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#8b5cf6',
    borderTopWidth: 4,
    borderLeftWidth: 4,
    top: 0,
    left: 0,
  },
  substituteSearchScanText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
    marginTop: 20,
    textAlign: 'center',
  },
  substituteSearchTip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 10,
  },
  substituteSearchTipText: {
    color: '#ffffff',
    fontSize: 14,
  },

  // 6a. Substitute Scan Ready Modal
  substituteScanReadyModal: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  substituteScanReadyHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  substituteScanReadyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 12,
  },
  substituteScanReadyContent: {
    alignItems: 'center',
    marginBottom: 24,
  },
  substituteScanReadyLabel: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 12,
  },
  substituteScanReadyItemBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fecaca',
    marginBottom: 20,
  },
  substituteScanReadyItemText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#dc2626',
    marginLeft: 10,
  },
  substituteScanReadyInstructions: {
    fontSize: 15,
    color: '#475569',
    textAlign: 'center',
    lineHeight: 22,
  },
  substituteScanReadyButtons: {
    gap: 12,
  },
  substituteScanReadyButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8b5cf6',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  substituteScanReadyButtonPrimaryText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  substituteScanReadyButtonSecondary: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 14,
    borderRadius: 12,
  },
  substituteScanReadyButtonSecondaryText: {
    color: '#475569',
    fontSize: 15,
    fontWeight: '600',
  },
  substituteScanReadyButtonCancel: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  substituteScanReadyButtonCancelText: {
    color: '#94a3b8',
    fontSize: 14,
  },

  // 6c. Substitute Not Found Modal
  substituteNotFoundModal: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  substituteNotFoundHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  substituteNotFoundTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 12,
  },
  substituteNotFoundContent: {
    alignItems: 'center',
    marginBottom: 24,
  },
  substituteNotFoundLabel: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 12,
  },
  substituteNotFoundItemBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    marginBottom: 16,
  },
  substituteNotFoundItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#dc2626',
    marginLeft: 8,
  },
  substituteNotFoundReason: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  substituteNotFoundButtons: {
    gap: 12,
  },
  substituteNotFoundButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8b5cf6',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  substituteNotFoundButtonPrimaryText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  substituteNotFoundButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f3ff',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#c4b5fd',
  },
  substituteNotFoundButtonSecondaryText: {
    color: '#7c3aed',
    fontSize: 15,
    fontWeight: '600',
  },

  // 7. Substitute Confirmation Modal
  substituteConfirmModal: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
    maxHeight: '85%',
  },
  substituteConfirmHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  substituteConfirmIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#dcfce7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  substituteConfirmTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  substituteConfirmContent: {
    marginBottom: 20,
  },
  substituteConfirmItem: {
    marginBottom: 8,
  },
  substituteConfirmLabel: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 6,
    fontWeight: '500',
  },
  substituteConfirmItemBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 10,
    borderWidth: 2,
    borderColor: '#fecaca',
  },
  substituteConfirmItemBoxFound: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  substituteConfirmItemTextMissing: {
    fontSize: 16,
    color: '#ef4444',
    fontWeight: '500',
    textDecorationLine: 'line-through',
    flex: 1,
  },
  substituteConfirmItemTextFound: {
    fontSize: 16,
    color: '#10b981',
    fontWeight: '600',
    flex: 1,
  },
  substituteConfirmReason: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#eff6ff',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    gap: 10,
    marginTop: 12,
  },
  substituteConfirmReasonText: {
    fontSize: 14,
    color: '#3b82f6',
    flex: 1,
    lineHeight: 20,
  },
  substituteConfirmInstruction: {
    backgroundColor: '#f8fafc',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#8b5cf6',
  },
  substituteConfirmInstructionText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    fontStyle: 'italic',
  },
  substituteConfirmButtons: {
    gap: 10,
  },
  substituteConfirmButtonPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 14,
    gap: 10,
  },
  substituteConfirmButtonPrimaryText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  substituteConfirmButtonSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  substituteConfirmButtonSecondaryText: {
    color: '#64748b',
    fontSize: 15,
    fontWeight: '600',
  },
  substituteConfirmButtonCancel: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  substituteConfirmButtonCancelText: {
    color: '#94a3b8',
    fontSize: 14,
  },

  // 8. Voice Settings Modal
  voiceModal: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
  },
  voiceModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  voiceModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  voiceSettingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  voiceSettingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  voiceSettingControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  voiceAdjustButton: {
    backgroundColor: '#f1f5f9',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceSettingValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E5AA8',
    minWidth: 50,
    textAlign: 'center',
  },
  voiceSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 16,
    marginBottom: 12,
  },
  voiceList: {
    maxHeight: 200,
    marginBottom: 16,
  },
  voiceOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  voiceOptionSelected: {
    backgroundColor: '#f0fdf4',
  },
  voiceOptionInfo: {
    flex: 1,
  },
  voiceOptionName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
  },
  voiceOptionQuality: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  voicePreviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E5AA8',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 8,
    marginBottom: 10,
  },
  voicePreviewButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  voiceTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    marginBottom: 12,
  },
  voiceTipText: {
    flex: 1,
    fontSize: 12,
    color: '#64748b',
    lineHeight: 16,
  },
  voiceDoneButton: {
    backgroundColor: '#10b981',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  voiceDoneButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // ============================================================================
  // CONVERSATION MODAL STYLES
  // ============================================================================

  conversationOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    padding: 20,
  },
  conversationModal: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  conversationTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  conversationHistory: {
    maxHeight: 300,
    marginBottom: 16,
  },
  conversationBubble: {
    padding: 12,
    borderRadius: 16,
    marginVertical: 4,
    maxWidth: '85%',
  },
  conversationBubbleUser: {
    backgroundColor: '#1E5AA8',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  conversationBubbleAssistant: {
    backgroundColor: '#f1f5f9',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  conversationBubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  conversationBubbleTextUser: {
    color: '#ffffff',
  },
  conversationBubbleTextAssistant: {
    color: '#1e293b',
  },
  conversationActions: {
    gap: 10,
    marginBottom: 12,
  },
  conversationAskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E5AA8',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  conversationAskButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  conversationResumeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ecfdf5',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#10b981',
    gap: 8,
  },
  conversationResumeButtonText: {
    color: '#10b981',
    fontSize: 16,
    fontWeight: '600',
  },
  conversationButtonDisabled: {
    opacity: 0.5,
  },
  conversationTip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  conversationTipText: {
    flex: 1,
    fontSize: 13,
    color: '#92400e',
    lineHeight: 18,
  },

  // ============================================================================
  // VOICE QUESTION STYLES
  // ============================================================================

  voiceQuestionContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  micButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E5AA8',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  micButtonListening: {
    backgroundColor: '#ef4444',
    transform: [{ scale: 1.05 }],
  },
  micButtonDisabled: {
    backgroundColor: '#94a3b8',
    opacity: 0.6,
  },
  micButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  questionPreview: {
    marginTop: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    maxWidth: '90%',
  },
  questionPreviewText: {
    fontSize: 14,
    color: '#475569',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  answerContainer: {
    marginTop: 12,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  answerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(30, 90, 168, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: '#1E5AA8',
    padding: 12,
    borderRadius: 8,
    gap: 10,
  },
  answerText: {
    flex: 1,
    fontSize: 15,
    color: '#1e293b',
    lineHeight: 22,
  },
  dismissAnswerButton: {
    padding: 4,
  },

  // ============================================================================
  // VISUAL HIGHLIGHT STYLES (Bounding Boxes)
  // ============================================================================

  highlightContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 20,
    pointerEvents: 'none',
  },
  highlightCircle: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 4,
    borderColor: '#00FF88',
    backgroundColor: 'transparent',
    shadowColor: '#00FF88',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 10,
  },
  highlightCircleInner: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: 'rgba(0, 255, 136, 0.4)',
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
  },
  highlightLabel: {
    position: 'absolute',
    backgroundColor: '#00FF88',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    maxWidth: '60%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 8,
  },
  highlightLabelArrow: {
    position: 'absolute',
    bottom: -8,
    left: 20,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#00FF88',
  },
  highlightLabelText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    flexWrap: 'wrap',
  },
});
