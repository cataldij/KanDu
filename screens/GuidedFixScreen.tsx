import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  Modal,
  ScrollView,
  Platform,
  Image,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';

// Dynamic import for SpeechRecognition - may not be available on all builds
let ExpoSpeechRecognitionModule: any = null;
try {
  const speechRecognition = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = speechRecognition.ExpoSpeechRecognitionModule;
} catch (error) {
  console.log('expo-speech-recognition not available:', error);
}

// Voice settings interface
interface VoiceSettings {
  rate: number;
  pitch: number;
  voiceIdentifier?: string;
  voiceName?: string;
}

// Available voice from expo-speech
interface AvailableVoice {
  identifier: string;
  name: string;
  quality: string;
  language: string;
}
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { getRealTimeGuidance, generateRepairPlan, RepairStep, GuidanceResponse, BoundingBox } from '../services/guidedFix';
import { askVoiceQuestion, findSubstitute } from '../services/api';

// Static import for logo to avoid Metro bundler path encoding issues
const KanDuTogetherLogo = require('../assets/kandu-together.png');

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Identity Gate States
type IdentityStatus = 'UNKNOWN' | 'VERIFYING' | 'CONFIRMED' | 'MISMATCH';

// Step Completion States
type StepStatus = 'IN_PROGRESS' | 'PENDING_CONFIRMATION' | 'CONFIRMED' | 'OVERRIDDEN';

// Step Completion Policies
type CompletionPolicy = 'VISUAL_REQUIRED' | 'VISUAL_PREFERRED' | 'USER_CONFIRM_ONLY';

type RootStackParamList = {
  Home: undefined;
  Results: {
    diagnosis: string;
    category: string;
    description: string;
    imageUri?: string;
    videoUri?: string;
    fromHistory?: boolean;
  };
  GuidedFix: {
    category: string;
    diagnosisSummary: string;
    likelyCause?: string;
    originalImageUri?: string;
  };
  GuidedFixDisclaimer: {
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

export default function GuidedFixScreen({ navigation, route }: GuidedFixScreenProps) {
  const { category, diagnosisSummary, likelyCause, originalImageUri } = route.params;
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const [demoMode, setDemoMode] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [recognitionEnabled, setRecognitionEnabled] = useState(true); // AI recognition toggle
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const isAnalyzingRef = useRef(false); // Ref to avoid stale closure in interval
  const sessionActiveRef = useRef(true); // Ref to avoid stale closure
  const [currentGuidance, setCurrentGuidance] = useState<string>('');
  const [repairSteps, setRepairSteps] = useState<RepairStep[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isLoadingPlan, setIsLoadingPlan] = useState(true);
  const [sessionActive, setSessionActive] = useState(true);
  const [highlights, setHighlights] = useState<BoundingBox[]>([]);
  const [originalImageBase64, setOriginalImageBase64] = useState<string | null>(null);

  // Identity Gate State
  const [identityStatus, setIdentityStatus] = useState<IdentityStatus>('UNKNOWN');
  const [expectedItem, setExpectedItem] = useState<string>('');
  const [detectedItem, setDetectedItem] = useState<string>('');
  const [showIdentityModal, setShowIdentityModal] = useState(false);
  const [showVerificationPrompt, setShowVerificationPrompt] = useState(false);

  // Step Confirmation State
  const [stepStatus, setStepStatus] = useState<StepStatus>('IN_PROGRESS');
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [showCompletionPrompt, setShowCompletionPrompt] = useState(false); // AI suggesting step might be complete
  const [completionEvidence, setCompletionEvidence] = useState<string>(''); // What AI saw

  // Voice Settings State
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  // Refs for modal states to avoid stale closures in interval
  const showVoiceModalRef = useRef(false);
  const showIdentityModalRef = useRef(false);
  const showOverrideModalRef = useRef(false);
  const showCompletionPromptRef = useRef(false);
  const showNewPlanModalRef = useRef(false); // Ref for new plan modal
  const identityStatusRef = useRef<IdentityStatus>('UNKNOWN');
  const recognitionEnabledRef = useRef(true); // Ref for recognition toggle
  const [availableVoices, setAvailableVoices] = useState<AvailableVoice[]>([]);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>({
    rate: 0.9,
    pitch: 1.0,
    voiceIdentifier: undefined,
    voiceName: 'Default',
  });

  // Text box opacity control - start at 55% for better camera visibility
  const [textBoxOpacity, setTextBoxOpacity] = useState(0.55);

  // Voice Question State (Phase 1-3)
  const [isListening, setIsListening] = useState(false);
  const [voiceQuestion, setVoiceQuestion] = useState('');
  const [voiceAnswer, setVoiceAnswer] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [questionCooldown, setQuestionCooldown] = useState(false);
  const [recognitionAvailable, setRecognitionAvailable] = useState(false);

  // Conversation Context - tracks Q&A history for adaptive guidance
  interface ConversationEntry {
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }
  const [conversationHistory, setConversationHistory] = useState<ConversationEntry[]>([]);
  const [stepModifications, setStepModifications] = useState<string>(''); // User constraints like "no hair dryer"
  const stepModificationsRef = useRef<string>(''); // Ref for immediate access in callbacks

  // Session Pause State
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseReason, setPauseReason] = useState<'manual' | 'get_item' | 'working_on_step' | 'do_task' | null>(null);
  const [taskInstruction, setTaskInstruction] = useState<string>('');
  const [pauseMessage, setPauseMessage] = useState('');
  const [workingStepDescription, setWorkingStepDescription] = useState(''); // What user is doing

  // Item Checklist State - tracks items needed and which user doesn't have
  const [neededItems, setNeededItems] = useState<string[]>([]);
  const [missingItems, setMissingItems] = useState<Set<string>>(new Set());
  const [confirmedItems, setConfirmedItems] = useState<Set<string>>(new Set()); // Items user confirmed they have
  const [isRegeneratingPlan, setIsRegeneratingPlan] = useState(false);

  // PERMANENT unavailable items - items the user has marked as not having
  // This persists through the ENTIRE session and is ALWAYS excluded from future plans
  const permanentlyUnavailableRef = useRef<Set<string>>(new Set());

  // CONFIRMED SUBSTITUTES - items the AI identified as substitutes for banned items
  // Maps: banned item -> substitute item (e.g., "aluminum foil" -> "wax paper")
  // This persists for the entire session and is used in plan generation/guidance
  const confirmedSubstitutesRef = useRef<Map<string, string>>(new Map());

  // Substitute Search State
  const [isSearchingSubstitute, setIsSearchingSubstitute] = useState(false);
  const isSearchingSubstituteRef = useRef(false); // Ref for stale closure prevention
  const [substituteSearchItem, setSubstituteSearchItem] = useState<string>(''); // Which item we're finding substitute for
  const substituteSearchItemRef = useRef<string>(''); // Ref for stale closure prevention in setTimeout callbacks
  const [showSubstituteModal, setShowSubstituteModal] = useState(false);
  const [foundSubstitute, setFoundSubstitute] = useState<{
    item: string;
    reason: string;
    instruction: string;
    confidence: number;
    highlight?: { label: string; x: number; y: number; width: number; height: number };
  } | null>(null);

  // Plan Revision State - tracks plan changes and shows new plan modal
  const [planRevision, setPlanRevision] = useState(0); // 0 = original, 1+ = regenerated
  const [showNewPlanModal, setShowNewPlanModal] = useState(false);
  const [showViewPlanModal, setShowViewPlanModal] = useState(false); // View current plan from do_task modal
  const [newPlanSteps, setNewPlanSteps] = useState<RepairStep[]>([]); // Steps to show in modal
  const [planStartStep, setPlanStartStep] = useState(0); // Which step the new plan starts from

  // Plan revision colors for progress bar
  const PLAN_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444']; // green, blue, purple, orange, red

  // Rate limiting state
  const [isRateLimited, setIsRateLimited] = useState(false);
  const rateLimitBackoffRef = useRef<number>(5000); // Start with 5s backoff
  const MAX_BACKOFF = 30000; // Max 30s backoff

  // Tracking refs
  const cameraRef = useRef<CameraView>(null);
  const frameIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSpeakingRef = useRef(false);
  const lastSpeechStartRef = useRef<number>(Date.now()); // Track when speech started for timeout detection
  const speechQueueRef = useRef<Array<{ text: string; urgent: boolean }>>([]);
  const lastGuidanceTimeRef = useRef<number>(0);
  const consecutiveMismatchCount = useRef<number>(0);
  const stepConfirmationWindow = useRef<boolean[]>([]); // Last 3 frame results
  const verificationAttempts = useRef<number>(0);
  const lastQuestionTime = useRef<number>(0);
  const forceConfirmedRef = useRef<boolean>(false); // Skip identity checks after force confirm
  const answerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastInstructionRef = useRef<string>(''); // Track last instruction to avoid repetition
  const sameInstructionCount = useRef<number>(0); // Count how many times same instruction repeated
  const itemOutOfViewCount = useRef<number>(0); // Track consecutive frames where item is not visible
  const lastOutOfViewWarning = useRef<number>(0); // Prevent spamming out-of-view warnings
  const isAutoAdvancingRef = useRef<boolean>(false); // Prevent multiple auto-advances during transition
  const stepStartTimeRef = useRef<number>(Date.now()); // Track when current step started
  const stepTimeoutPromptShown = useRef<boolean>(false); // Prevent multiple timeout prompts per step
  const lastAnalysisCompleteRef = useRef<number>(0); // Track when last analysis finished

  // === STALE RESPONSE GATING (Fix #1 from ChatGPT analysis) ===
  const guidanceRequestIdRef = useRef<number>(0); // Incrementing request ID
  const currentStepIndexRef = useRef<number>(0); // Mirror of currentStepIndex for closure safety
  const stepAdvanceTimestampRef = useRef<number>(0); // When we last advanced steps
  const STEP_ADVANCE_FREEZE_MS = 3000; // Ignore responses for 3s after step advance (increased from 1.5s)

  // === HIGHLIGHT PERSISTENCE (Fix #2 from ChatGPT analysis) ===
  const lastGoodHighlightsRef = useRef<BoundingBox[]>([]); // Keep last valid highlights
  const emptyHighlightCountRef = useRef<number>(0); // Count consecutive empty highlight frames
  const EMPTY_HIGHLIGHT_THRESHOLD = 3; // Only clear after 3 consecutive empty frames

  // === CAMERA PREVIEW DIMENSIONS (Fix #3 from ChatGPT analysis) ===
  const [previewDimensions, setPreviewDimensions] = useState({ width: screenWidth, height: screenHeight });

  const FRAME_CAPTURE_INTERVAL = 5000; // 5 seconds between frame captures (prevents rapid-fire analysis loop)
  const MIN_GUIDANCE_INTERVAL = 5000; // 5 seconds between guidance updates
  const STEP_TIMEOUT = 25000; // 25 seconds on same step = offer manual confirmation
  const WORKING_MODE_INTERVAL = 10000; // 10 seconds between guidance when user is working
  const QUESTION_COOLDOWN = 5000; // 5 seconds between questions
  const MISMATCH_THRESHOLD = 2; // 2 consecutive mismatches = hard block
  const CONFIRMATION_WINDOW_SIZE = 3; // 2-of-3 rule

  // Working mode state - reduces nagging while user completes step
  const [isWorkingMode, setIsWorkingMode] = useState(false);
  const workingModeStartRef = useRef<number>(0);
  const lastSpokenTimeRef = useRef<number>(0);

  // Track last action we paused for (to prevent re-pausing for same action)
  const lastPausedActionRef = useRef<string>('');
  const actionPauseCountRef = useRef<number>(0); // How many times we've spoken this action

  // Load available voices and check speech recognition on mount
  useEffect(() => {
    const loadVoices = async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        // Filter to English voices and sort by quality
        const englishVoices = voices
          .filter((v: any) => v.language?.startsWith('en'))
          .sort((a: any, b: any) => {
            // Prioritize enhanced/premium quality voices
            if (a.quality === 'Enhanced' && b.quality !== 'Enhanced') return -1;
            if (b.quality === 'Enhanced' && a.quality !== 'Enhanced') return 1;
            return a.name.localeCompare(b.name);
          });
        setAvailableVoices(englishVoices as AvailableVoice[]);
      } catch (error) {
        console.log('Could not load voices:', error);
      }
    };

    const checkSpeechRecognition = async () => {
      // Check if the module is even available (requires native build)
      if (!ExpoSpeechRecognitionModule) {
        console.log('Speech recognition module not available');
        setRecognitionAvailable(false);
        return;
      }
      try {
        const { status } = await ExpoSpeechRecognitionModule.getPermissionsAsync();
        // If we can check permissions, recognition is available on this platform
        setRecognitionAvailable(true);
      } catch (error) {
        console.log('Speech recognition not available:', error);
        setRecognitionAvailable(false);
      }
    };

    loadVoices();
    checkSpeechRecognition();
  }, []);

  // Load original image for comparison on mount
  useEffect(() => {
    const loadOriginalImage = async () => {
      if (originalImageUri) {
        try {
          const base64 = await FileSystem.readAsStringAsync(originalImageUri, {
            encoding: 'base64',
          });
          setOriginalImageBase64(base64);
        } catch (error) {
          console.error('Error loading original image:', error);
        }
      }
    };
    loadOriginalImage();
  }, [originalImageUri]);

  // Load repair plan on mount, cleanup on unmount
  useEffect(() => {
    loadRepairPlan();

    // Cleanup when component unmounts
    return () => {
      stopFrameCapture();
      Speech.stop();
    };
  }, []);

  // Start frame capture when plan is ready (including during VERIFYING phase)
  useEffect(() => {
    const shouldCapture = !isLoadingPlan && sessionActive && repairSteps.length > 0 &&
        (identityStatus === 'CONFIRMED' || identityStatus === 'VERIFYING');

    console.log('🔄 Frame capture useEffect:', {
      shouldCapture,
      isLoadingPlan,
      sessionActive,
      repairStepsLength: repairSteps.length,
      identityStatus,
      frameIntervalRunning: !!frameIntervalRef.current
    });

    if (shouldCapture) {
      // Only start if not already running
      if (!frameIntervalRef.current) {
        console.log('▶️ Starting frame capture from useEffect');
        startFrameCapture();
      }
    } else {
      // Stop capture if conditions not met
      console.log('⏹️ Stopping frame capture from useEffect');
      stopFrameCapture();
    }
    // Don't cleanup on every re-render - only stop when conditions change
  }, [isLoadingPlan, sessionActive, identityStatus, repairSteps.length]);

  // Reset step status when step changes
  useEffect(() => {
    console.log('📊 Step index changed to:', currentStepIndex, '- resetting step state');
    setStepStatus('IN_PROGRESS');
    stepConfirmationWindow.current = [];
    isAutoAdvancingRef.current = false; // Reset auto-advancing flag for new step
    stepStartTimeRef.current = Date.now(); // Reset step timer
    stepTimeoutPromptShown.current = false; // Reset timeout prompt flag

    // === FIX: Reset instruction tracking for new step ===
    lastInstructionRef.current = ''; // Clear last instruction so new step instruction is seen as new
    sameInstructionCount.current = 0; // Reset repetition counter

    // === STALE RESPONSE GATING ===
    currentStepIndexRef.current = currentStepIndex; // Keep ref in sync
    stepAdvanceTimestampRef.current = Date.now(); // Mark when we advanced
    // Reset action tracking when step changes
    lastPausedActionRef.current = '';
    actionPauseCountRef.current = 0;
    console.log('🔒 Step advance timestamp set, will ignore stale responses for', STEP_ADVANCE_FREEZE_MS, 'ms');
  }, [currentStepIndex]);

  // Keep refs in sync with state for use in interval callbacks
  useEffect(() => {
    showVoiceModalRef.current = showVoiceModal;
  }, [showVoiceModal]);

  useEffect(() => {
    showIdentityModalRef.current = showIdentityModal;
  }, [showIdentityModal]);

  useEffect(() => {
    showOverrideModalRef.current = showOverrideModal;
  }, [showOverrideModal]);

  useEffect(() => {
    showCompletionPromptRef.current = showCompletionPrompt;
  }, [showCompletionPrompt]);

  useEffect(() => {
    identityStatusRef.current = identityStatus;
  }, [identityStatus]);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
  }, [sessionActive]);

  useEffect(() => {
    recognitionEnabledRef.current = recognitionEnabled;
  }, [recognitionEnabled]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    showNewPlanModalRef.current = showNewPlanModal;
  }, [showNewPlanModal]);

  // Keep stepModificationsRef in sync with state for immediate access in callbacks
  useEffect(() => {
    stepModificationsRef.current = stepModifications;
    console.log('📝 stepModifications updated:', stepModifications || '(empty)');
  }, [stepModifications]);

  // Reset analyzing state when modal closes to ensure analysis can resume
  useEffect(() => {
    if (!showVoiceModal && !showIdentityModal && !showOverrideModal) {
      // Clear any stuck analyzing state when modals close
      setIsAnalyzing(false);
      isAnalyzingRef.current = false;
    }

    // Stop any preview voice when modal closes
    if (!showVoiceModal) {
      Speech.stop();
      isSpeakingRef.current = false;
    }
  }, [showVoiceModal, showIdentityModal, showOverrideModal]);

  const loadRepairPlan = async () => {
    try {
      setIsLoadingPlan(true);
      console.log('🔧 loadRepairPlan called with:', { category, diagnosisSummary, likelyCause });
      const steps = await generateRepairPlan(category, diagnosisSummary, likelyCause);
      console.log('🔧 Repair plan received:', steps?.length, 'steps');
      setRepairSteps(steps);

      // Start with identity verification prompt
      const introMessage = "First, let's confirm what we're working on. Point the camera at your item.";
      setCurrentGuidance(introMessage);
      speakGuidance(introMessage);
      setIdentityStatus('VERIFYING');
    } catch (error: any) {
      console.error('❌ Error loading repair plan:', error);
      console.error('❌ Error message:', error?.message);
      console.error('❌ Error stack:', error?.stack);
      Alert.alert('Error', `Failed to load repair plan: ${error?.message || 'Unknown error'}`);
      navigation.goBack();
    } finally {
      setIsLoadingPlan(false);
    }
  };

  const startFrameCapture = () => {
    if (frameIntervalRef.current) return; // Already running
    console.log(`📹 Starting frame capture with ${FRAME_CAPTURE_INTERVAL}ms interval`);
    frameIntervalRef.current = setInterval(() => {
      captureAndAnalyzeFrame();
    }, FRAME_CAPTURE_INTERVAL);
  };

  const stopFrameCapture = () => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
  };

  const captureAndAnalyzeFrame = async () => {
    // Use refs to check state (avoids stale closure in interval callbacks)
    if (!cameraRef.current || isAnalyzingRef.current || !sessionActiveRef.current) {
      console.log('⏸️ Skipping frame: camera=', !!cameraRef.current, 'analyzing=', isAnalyzingRef.current, 'sessionActive=', sessionActiveRef.current);
      return;
    }
    // Skip if session is paused - don't use API credits
    if (isPausedRef.current) {
      console.log('⏸️ Skipping frame: session paused');
      return;
    }
    // === FIX #1: Wait for speech to complete before analyzing next frame ===
    // This prevents the AI from analyzing while the previous instruction is being spoken
    // BUT add a safety valve: if speaking has been true for more than 15 seconds, force reset
    if (isSpeakingRef.current) {
      const speakingDuration = Date.now() - lastSpeechStartRef.current;
      if (speakingDuration > 15000) {
        console.warn('⚠️ Speech stuck for', speakingDuration, 'ms - forcing reset');
        isSpeakingRef.current = false;
        speechQueueRef.current = [];
      } else {
        console.log('⏸️ Skipping frame: speech in progress - waiting for completion');
        return;
      }
    }
    // Enforce minimum time between analyses to prevent rapid-fire loop
    const timeSinceLastAnalysis = Date.now() - lastAnalysisCompleteRef.current;
    if (timeSinceLastAnalysis < FRAME_CAPTURE_INTERVAL - 500) { // 500ms tolerance
      console.log(`⏸️ Skipping frame: only ${timeSinceLastAnalysis}ms since last analysis (min: ${FRAME_CAPTURE_INTERVAL - 500}ms)`);
      return;
    }
    // Note: Analysis always runs for step completion detection
    // recognitionEnabled only controls visual feedback (highlights, analyzing indicator)
    if (identityStatusRef.current === 'MISMATCH') {
      console.log('⏸️ Skipping frame: identity mismatch');
      return;
    }
    if (showVoiceModalRef.current || showIdentityModalRef.current || showOverrideModalRef.current || showCompletionPromptRef.current || showNewPlanModalRef.current) {
      console.log('⏸️ Skipping frame: modal open (voice=', showVoiceModalRef.current, 'identity=', showIdentityModalRef.current, 'override=', showOverrideModalRef.current, 'completion=', showCompletionPromptRef.current, 'newPlan=', showNewPlanModalRef.current, ')');
      return;
    }
    console.log('📸 captureAndAnalyzeFrame starting, identityStatus=', identityStatusRef.current);

    // === STALE RESPONSE GATING: Generate request ID and capture step index at send time ===
    guidanceRequestIdRef.current += 1;
    const thisRequestId = guidanceRequestIdRef.current;
    const thisStepIndex = currentStepIndexRef.current;
    console.log(`🔑 Request #${thisRequestId} for step ${thisStepIndex + 1}`);

    try {
      isAnalyzingRef.current = true;
      setIsAnalyzing(true);

      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.5,
      });

      if (!photo || !photo.base64) {
        return;
      }

      // === FIX #2: Use ref for step index to avoid stale closure ===
      // The state value `currentStepIndex` may be stale in the interval callback
      // Use the ref which is always current
      const stepIndexForRequest = thisStepIndex; // Already captured from ref at request start
      const currentStep = repairSteps[stepIndexForRequest];

      if (!currentStep) {
        console.log('⏸️ Skipping frame: no step at index', stepIndexForRequest);
        return;
      }

      console.log('📸 Analyzing frame for step:', stepIndexForRequest + 1, '/', repairSteps.length);
      console.log('📝 Step instruction:', currentStep.instruction);

      // getRealTimeGuidance returns the guidance directly or throws an error
      // Use stepModificationsRef to get the most current constraints (state may be stale in interval)
      const currentConstraints = stepModificationsRef.current;
      if (currentConstraints) {
        console.log('📝 Sending user constraints to AI:', currentConstraints);
      }

      // Build confirmed substitutes object from ref
      const confirmedSubs = confirmedSubstitutesRef.current.size > 0
        ? Object.fromEntries(confirmedSubstitutesRef.current)
        : undefined;
      if (confirmedSubs) {
        console.log('📝 Sending confirmed substitutes to AI:', confirmedSubs);
      }

      const guidance = await getRealTimeGuidance({
        imageBase64: photo.base64,
        category,
        problemDescription: diagnosisSummary,
        currentStep: stepIndexForRequest + 1,
        totalSteps: repairSteps.length,
        currentStepInstruction: currentStep.instruction,
        stepContext: currentStep.lookingFor,
        expectedItem: expectedItem || undefined,
        originalImageBase64: originalImageBase64 || undefined,
        completionCriteria: currentStep.completionCriteria,
        visualAnchors: currentStep.visualAnchors,
        userConstraints: currentConstraints || undefined, // Use ref for most current value
        bannedItems: permanentlyUnavailableRef.current.size > 0
          ? Array.from(permanentlyUnavailableRef.current)
          : undefined, // Pass banned items to API
        confirmedSubstitutes: confirmedSubs, // Pass confirmed substitutes to API
      });

      // === STALE RESPONSE GATING: Check if this response is still relevant ===
      const timeSinceStepAdvance = Date.now() - stepAdvanceTimestampRef.current;
      const isStaleRequest = thisRequestId !== guidanceRequestIdRef.current;
      const isWrongStep = thisStepIndex !== currentStepIndexRef.current;
      const isInFreezeWindow = timeSinceStepAdvance < STEP_ADVANCE_FREEZE_MS;

      if (isStaleRequest || isWrongStep || isInFreezeWindow) {
        console.log(`🚫 IGNORING stale response #${thisRequestId}:`, {
          isStaleRequest,
          isWrongStep,
          isInFreezeWindow,
          thisStepIndex,
          currentStepIndex: currentStepIndexRef.current,
          timeSinceStepAdvance,
        });
        return; // Don't process this stale response
      }

      console.log('✅ Guidance received:', {
        requestId: thisRequestId,
        instruction: guidance.instruction?.substring(0, 50),
        confidence: guidance.confidence,
        stepComplete: guidance.stepComplete,
        detectedObject: guidance.detectedObject,
        highlightsCount: guidance.highlights?.length || 0,
        highlightsData: guidance.highlights, // Log full highlight data
        recognitionEnabled: recognitionEnabledRef.current,
      });

      handleGuidanceResponse(guidance);

      // Reset backoff on successful response
      rateLimitBackoffRef.current = 5000;
      if (isRateLimited) {
        setIsRateLimited(false);
      }
    } catch (error: any) {
      console.error('❌ Exception analyzing frame:', error.message || error);

      // Check if this is a rate limit error (429 from Gemini)
      const errorMsg = error.message?.toLowerCase() || '';
      if (errorMsg.includes('429') || errorMsg.includes('rate limit') || errorMsg.includes('quota')) {
        const currentBackoff = rateLimitBackoffRef.current;
        console.log(`⏳ Rate limited by Gemini, pausing analysis for ${currentBackoff / 1000} seconds`);

        // Show rate limit indicator to user
        setIsRateLimited(true);
        setCurrentGuidance(`Rate limited - waiting ${Math.round(currentBackoff / 1000)}s before resuming...`);

        // Stop frame capture temporarily and restart after exponential backoff
        stopFrameCapture();
        setTimeout(() => {
          if (sessionActiveRef.current && !isPausedRef.current) {
            console.log('▶️ Resuming frame capture after rate limit backoff');
            setIsRateLimited(false);
            startFrameCapture();
          }
        }, currentBackoff);

        // Increase backoff for next time (exponential, up to max)
        rateLimitBackoffRef.current = Math.min(currentBackoff * 2, MAX_BACKOFF);
      }
    } finally {
      isAnalyzingRef.current = false;
      setIsAnalyzing(false);
      lastAnalysisCompleteRef.current = Date.now(); // Track when this analysis finished
      console.log('📸 Analysis complete, next allowed in', FRAME_CAPTURE_INTERVAL, 'ms');
    }
  };

  const handleGuidanceResponse = (guidance: GuidanceResponse) => {
    // === EARLY BAIL-OUT: Don't process if we're already auto-advancing ===
    if (isAutoAdvancingRef.current) {
      console.log('⏭️ Skipping guidance - auto-advance in progress');
      return;
    }

    // Safety check first
    if (guidance.shouldStop && guidance.safetyWarning) {
      stopFrameCapture();
      setSessionActive(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      speakGuidance(guidance.safetyWarning, true);
      Alert.alert(
        'Safety Warning',
        guidance.safetyWarning + '\n\nPlease call a professional for this repair.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
      return;
    }

    // === IDENTITY GATE ===
    // Use ref to check identity status immediately (state updates are async)
    if (identityStatusRef.current === 'VERIFYING') {
      // During verification phase, we need to identify and confirm the item
      // Extract expected item keywords from diagnosis to match against
      const diagnosisLower = diagnosisSummary.toLowerCase();
      const categoryLower = category.toLowerCase();

      // Common items by category for validation
      const expectedKeywords: string[] = [];
      if (categoryLower.includes('candle') || diagnosisLower.includes('candle')) {
        expectedKeywords.push('candle', 'wax', 'wick', 'flame');
      }
      if (categoryLower.includes('plumbing') || diagnosisLower.includes('pipe') || diagnosisLower.includes('faucet') || diagnosisLower.includes('drain')) {
        expectedKeywords.push('pipe', 'p-trap', 'faucet', 'drain', 'sink', 'valve', 'plumbing');
      }
      if (categoryLower.includes('electrical') || diagnosisLower.includes('outlet') || diagnosisLower.includes('switch')) {
        expectedKeywords.push('outlet', 'switch', 'wire', 'electrical', 'breaker');
      }
      if (categoryLower.includes('appliance') || diagnosisLower.includes('washer') || diagnosisLower.includes('dryer')) {
        expectedKeywords.push('washer', 'dryer', 'appliance', 'machine');
      }
      if (categoryLower.includes('hvac') || diagnosisLower.includes('thermostat') || diagnosisLower.includes('filter')) {
        expectedKeywords.push('thermostat', 'filter', 'vent', 'hvac', 'air');
      }

      if (guidance.detectedObject) {
        // We detected something - check if it matches what we expect
        setDetectedItem(guidance.detectedObject);
        const detectedLower = guidance.detectedObject.toLowerCase();
        console.log('🔍 VERIFYING: Detected object:', guidance.detectedObject, 'Expected keywords:', expectedKeywords);

        // Check if detected object matches expected item from diagnosis
        const matchesExpected = expectedKeywords.length === 0 ||
          expectedKeywords.some(kw => detectedLower.includes(kw)) ||
          expectedKeywords.some(kw => diagnosisLower.includes(detectedLower.split(' ')[0]));

        // Check if it seems like a mismatch based on the diagnosis OR our keyword check
        if ((guidance.wrongItem && guidance.detectedItemMismatch) || (!matchesExpected && expectedKeywords.length > 0)) {
          // AI thinks this isn't the right item OR our keyword check failed
          const mismatchItem = guidance.detectedItemMismatch || guidance.detectedObject;
          console.log('⚠️ First detection mismatch:', mismatchItem, 'matchesExpected:', matchesExpected);
          consecutiveMismatchCount.current++;

          if (consecutiveMismatchCount.current >= MISMATCH_THRESHOLD) {
            // Confirmed mismatch - show modal
            console.log('🛑 Identity mismatch confirmed - showing modal');
            identityStatusRef.current = 'MISMATCH'; // Update ref immediately
            setIdentityStatus('MISMATCH');
            stopFrameCapture();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setShowIdentityModal(true);
            const expectedItemName = expectedKeywords[0] || 'the correct item';
            speakGuidance(`Hold on. I see a ${mismatchItem}, but your diagnosis is for a ${expectedItemName}. What would you like to do?`, true);
            return;
          } else {
            // First mismatch - announce what we see and what we're looking for
            const expectedItemName = expectedKeywords[0] || 'the item from your diagnosis';
            const msg = `I see a ${mismatchItem}, but I'm looking for a ${expectedItemName}. Let me take another look...`;
            setCurrentGuidance(msg);
            speakGuidance(msg);
            return;
          }
        } else {
          // Item matches expected - confirm and proceed IMMEDIATELY
          console.log('✅ Identity confirmed, transitioning to CONFIRMED:', guidance.detectedObject);
          consecutiveMismatchCount.current = 0;
          if (!expectedItem) {
            setExpectedItem(guidance.detectedObject);
          }

          // CRITICAL: Update ref IMMEDIATELY to prevent re-entry (state is async)
          identityStatusRef.current = 'CONFIRMED';
          setIdentityStatus('CONFIRMED');

          // Brief confirmation, then start step 1 guidance right away
          const confirmMsg = `Found it! I see your ${guidance.detectedObject}. Starting step 1.`;
          setCurrentGuidance(confirmMsg);
          speakGuidance(confirmMsg);

          // Announce step 1 after brief pause
          setTimeout(() => {
            const step1 = repairSteps[0];
            setCurrentGuidance(step1.instruction);
            speakGuidance(`Step 1: ${step1.instruction}`);

            // Enter working mode - user is now executing the step
            setIsWorkingMode(true);
            workingModeStartRef.current = Date.now();
            lastSpokenTimeRef.current = Date.now();

            // Let AI guide naturally - no auto-pause
            console.log('✅ Starting step 1 - letting AI guide naturally');
          }, 1500);
          return;
        }
      } else {
        // Nothing detected yet - keep waiting
        consecutiveMismatchCount.current++;
        if (consecutiveMismatchCount.current >= 4) {
          // After 4 attempts with no detection, ask user to adjust
          const msg = "I'm having trouble seeing the item clearly. Try moving the camera closer or adjusting the lighting.";
          setCurrentGuidance(msg);
          speakGuidance(msg);
          consecutiveMismatchCount.current = 0; // Reset and keep trying
        }
        return;
      }
    }

    // === ITEM OUT OF VIEW DETECTION ===
    // Check if the expected item is no longer visible in the frame
    const OUT_OF_VIEW_THRESHOLD = 2; // 2 consecutive frames without item
    const OUT_OF_VIEW_COOLDOWN = 8000; // Don't repeat warning within 8 seconds

    if (identityStatusRef.current === 'CONFIRMED' && expectedItem) {
      // Check if detectedObject is empty or doesn't match expected item
      const itemVisible = guidance.detectedObject &&
        guidance.detectedObject.toLowerCase().includes(expectedItem.toLowerCase().split(' ')[0]);

      if (!itemVisible && guidance.confidence < 0.3) {
        // Item might be out of view
        itemOutOfViewCount.current++;
        console.log(`⚠️ Item possibly out of view (${itemOutOfViewCount.current}/${OUT_OF_VIEW_THRESHOLD})`);

        if (itemOutOfViewCount.current >= OUT_OF_VIEW_THRESHOLD) {
          const now = Date.now();
          if (now - lastOutOfViewWarning.current > OUT_OF_VIEW_COOLDOWN) {
            lastOutOfViewWarning.current = now;
            // === FIX: Say what we DO see instead of just "can't see target" ===
            let outOfViewMsg: string;
            if (guidance.detectedObject && guidance.detectedObject.trim()) {
              // We see something else - tell user what we see
              outOfViewMsg = `I see a ${guidance.detectedObject}, but I'm looking for the ${expectedItem}. Point the camera at the ${expectedItem}.`;
            } else {
              // We don't see anything identifiable
              outOfViewMsg = `I can't see the ${expectedItem}. Please bring it back into view.`;
            }
            setCurrentGuidance(outOfViewMsg);
            speakGuidance(outOfViewMsg);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            // Keep showing highlights of what we DO see (don't clear them)
            // Only clear if there are no highlights at all
            if (!guidance.highlights || guidance.highlights.length === 0) {
              setHighlights([]);
            }
          }
          return; // Don't process further until item is back in view
        }
      } else {
        // Item is visible - reset counter
        if (itemOutOfViewCount.current > 0) {
          console.log('✅ Item back in view');
        }
        itemOutOfViewCount.current = 0;
      }
    }

    // === POST-VERIFICATION MISMATCH CHECK ===
    // DISABLED: Once identity is confirmed during VERIFYING phase, we trust the user has the right item.
    // The mismatch check was causing issues when the item's appearance changed (e.g., lit candle -> extinguished candle)
    // This caused the app to ask "is this the right item?" repeatedly and reset to step 1.
    // The verification phase already handles identity confirmation - no need to re-check during repair steps.
    //
    // If we need item verification in the future, it should be a one-time check at the start, not ongoing.
    console.log('📍 Post-verification mismatch check disabled - trusting confirmed identity');

    // === STEP CONFIRMATION GATE ===
    // Track step completion in sliding window (2-of-3 rule)
    stepConfirmationWindow.current.push(guidance.stepComplete);
    if (stepConfirmationWindow.current.length > CONFIRMATION_WINDOW_SIZE) {
      stepConfirmationWindow.current.shift();
    }

    // Check for stable confirmation (2 out of 3)
    const confirmCount = stepConfirmationWindow.current.filter(Boolean).length;

    // Handle AI-suggested completion (confidence 0.6-0.79)
    if (guidance.suggestCompletion && stepStatus === 'IN_PROGRESS' && !showCompletionPrompt) {
      // AI thinks step might be complete - ask user to confirm
      setCompletionEvidence(guidance.completionEvidence || 'It looks like you may have completed this step.');
      setShowCompletionPrompt(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      speakGuidance("Did you complete this step?");
      return; // Pause guidance until user responds
    }

    // If AI is confident (stepComplete=true with confidence >= 0.7), auto-progress
    // Use ref to prevent multiple triggers (state is async and may not update fast enough)
    if (guidance.stepComplete && guidance.confidence >= 0.7 && stepStatus === 'IN_PROGRESS' && !isAutoAdvancingRef.current) {
      isAutoAdvancingRef.current = true; // Prevent re-entry immediately
      setStepStatus('CONFIRMED');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Auto-advance to next step after speech completes
      const evidence = guidance.completionEvidence || 'Step completed!';
      speakGuidance(`Great! ${evidence}`);

      // === FIX: Wait for speech to complete before advancing ===
      // Poll until speech is done, then advance
      const waitForSpeechAndAdvance = () => {
        if (isSpeakingRef.current) {
          // Still speaking, check again in 200ms
          setTimeout(waitForSpeechAndAdvance, 200);
          return;
        }
        // Speech done - use ref for current step index to avoid stale closure
        const stepIdx = currentStepIndexRef.current;
        if (stepIdx < repairSteps.length - 1) {
          advanceToNextStep();
        } else {
          // Final step complete
          handleFinalStepComplete();
        }
        isAutoAdvancingRef.current = false; // Reset after advancing
      };
      // Start polling after a brief moment
      setTimeout(waitForSpeechAndAdvance, 300);

      // Return early to prevent further processing during the confirmation period
      return;
    }

    // Enforce minimum time between guidance updates
    const now = Date.now();
    if (now - lastGuidanceTimeRef.current < MIN_GUIDANCE_INTERVAL) {
      return;
    }
    lastGuidanceTimeRef.current = now;

    // === WORKING MODE - Reduce nagging while user completes step ===
    // Determine if this is an "important" message worth speaking in working mode
    const isImportantGuidance =
      guidance.stepComplete ||
      guidance.suggestCompletion ||
      guidance.safetyWarning ||
      (guidance.confidence >= 0.8 && guidance.highlights?.length > 0) || // Found the target with high confidence
      guidance.wrongItem ||
      guidance.shouldStop;

    // Check if we should skip speaking due to working mode
    const timeSinceLastSpoken = now - lastSpokenTimeRef.current;
    const inWorkingModeCooldown = isWorkingMode && timeSinceLastSpoken < WORKING_MODE_INTERVAL;

    // Detect "nagging" instructions (camera repositioning requests)
    const lowerInstruction = guidance.instruction.toLowerCase();
    const isNaggingInstruction =
      lowerInstruction.includes("can't see") ||
      lowerInstruction.includes("cannot see") ||
      lowerInstruction.includes("don't see") ||
      lowerInstruction.includes("move the camera") ||
      lowerInstruction.includes("reposition") ||
      lowerInstruction.includes("adjust the camera") ||
      lowerInstruction.includes("show the");

    // === INSTRUCTION REPETITION DETECTION ===
    // If AI keeps saying the same thing, it might be stuck - prompt user to confirm
    const instructionSimilar = isSimilarInstruction(guidance.instruction, lastInstructionRef.current);
    if (instructionSimilar) {
      sameInstructionCount.current++;
      console.log(`⚠️ Same instruction repeated ${sameInstructionCount.current} times`);

      // After 3 repetitions, assume step might be complete and ask user
      if (sameInstructionCount.current >= 3 && stepStatus === 'IN_PROGRESS' && !showCompletionPrompt) {
        console.log('🔄 AI seems stuck - prompting user to confirm step completion');
        setCompletionEvidence('I\'ve been giving the same guidance. You may have already completed this step.');
        setShowCompletionPrompt(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        speakGuidance("Have you already completed this step?");
        lastSpokenTimeRef.current = now;
        sameInstructionCount.current = 0;
        return;
      }
    } else {
      // Different instruction - reset counter
      sameInstructionCount.current = 0;
    }
    lastInstructionRef.current = guidance.instruction;

    // === TIMEOUT-BASED FALLBACK ===
    // If stuck on same step for too long, offer manual confirmation
    const timeSinceStepStart = now - stepStartTimeRef.current;
    if (timeSinceStepStart > STEP_TIMEOUT && stepStatus === 'IN_PROGRESS' && !showCompletionPrompt && !stepTimeoutPromptShown.current) {
      console.log('⏰ Step timeout reached - offering manual confirmation');
      stepTimeoutPromptShown.current = true;
      setCompletionEvidence('Taking a while on this step. Did you already complete it?');
      setShowCompletionPrompt(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      speakGuidance("Did you already finish this step? Tap yes if you're done.");
      lastSpokenTimeRef.current = now;
      return;
    }

    // Update guidance text on screen (always show, even if not speaking)
    setCurrentGuidance(guidance.instruction);

    // === FIX: Never speak the exact same instruction twice in a row ===
    // This prevents the loop where AI keeps repeating the same guidance
    if (instructionSimilar && sameInstructionCount.current >= 1) {
      console.log('🔇 Skipping duplicate instruction (count:', sameInstructionCount.current, '):', guidance.instruction.substring(0, 50));
      // Don't speak, but still update the screen text above
      return;
    }

    // Decide whether to speak based on working mode
    const shouldSpeak =
      isImportantGuidance || // Always speak important events
      !isWorkingMode || // Always speak when not in working mode
      (!inWorkingModeCooldown && !isNaggingInstruction); // Speak non-nagging after cooldown

    if (shouldSpeak) {
      speakGuidance(guidance.instruction);
      lastSpokenTimeRef.current = now;
      console.log('🔊 Speaking guidance (important:', isImportantGuidance, ', nagging:', isNaggingInstruction, ')');
    } else {
      console.log('🔇 Skipping speech in working mode (nagging:', isNaggingInstruction, ', cooldown:', inWorkingModeCooldown, ')');
    }

    // === AUTO-PAUSE DETECTION ===
    // Check if AI suggests user needs to get an item/tool
    const neededItem = checkForGetItemInstruction(guidance.instruction);
    if (neededItem && !isPausedRef.current) {
      // Trigger auto-pause popup after a brief delay to let the instruction be spoken
      // Capture both the step instruction AND the AI guidance for item extraction
      const currentStep = repairSteps[currentStepIndex];
      const capturedStepInstruction = currentStep?.instruction || '';
      const capturedGuidanceInstruction = guidance.instruction || '';
      // Combine both for better item extraction
      const combinedInstruction = `${capturedStepInstruction} ${capturedGuidanceInstruction}`;
      console.log('🛒 Item needed detected:', neededItem, '- will pause for checklist');
      setTimeout(() => {
        if (!isPausedRef.current) { // Double-check we haven't paused yet
          handlePauseSession('get_item', `You need: ${neededItem}. Check off items you DON'T have:`, undefined, combinedInstruction);
        }
      }, 2000);
    }

    // === TASK DETECTION: Use API's requiresManualAction flag (preferred) or fall back to client detection ===
    // The API now explicitly tells us when user needs hands-free time for physical action
    const isActionTask = guidance.requiresManualAction || checkForActionTask(guidance.instruction);
    if (isActionTask && !isPausedRef.current && !neededItem && stepStatus === 'IN_PROGRESS') {
      // Check if this is a NEW action or same as before
      const isSameAction = isSimilarInstruction(guidance.instruction, lastPausedActionRef.current);

      if (!isSameAction) {
        // NEW action detected - speak it and pause IMMEDIATELY
        console.log('🔧 NEW action task detected (requiresManualAction:', guidance.requiresManualAction, '):', guidance.instruction.substring(0, 50), '- pausing for user');
        lastPausedActionRef.current = guidance.instruction;
        actionPauseCountRef.current = 1;

        // Speak the instruction first, then pause
        setCurrentGuidance(guidance.instruction);
        speakGuidance(guidance.instruction);

        // Pause immediately (speech will continue in background)
        const capturedInstruction = guidance.instruction;
        setTimeout(() => {
          if (!isPausedRef.current) {
            handlePauseSession('do_task', undefined, undefined, undefined, undefined, capturedInstruction);
          }
        }, 500); // Brief delay to ensure speech starts
        return; // Stop processing - user needs to work
      } else {
        // SAME action - user tapped "Done" but AI still giving same instruction
        // This means the action may not be complete - don't re-pause, but count repeats
        actionPauseCountRef.current++;
        console.log('🔄 Same action repeated', actionPauseCountRef.current, 'times:', guidance.instruction.substring(0, 50));

        // After 2 repeats of same action, the AI will naturally give step completion guidance
        // or the user can manually advance
      }
    }

    // === HIGHLIGHT PERSISTENCE: Only clear after multiple consecutive empty frames ===
    if (recognitionEnabled) {
      if (guidance.highlights && guidance.highlights.length > 0) {
        // Enforce minimum size for visibility (at least 12% width and 15% height)
        const MIN_WIDTH = 12;
        const MIN_HEIGHT = 15;
        const adjustedHighlights = guidance.highlights.map(box => ({
          ...box,
          width: Math.max(box.width, MIN_WIDTH),
          height: Math.max(box.height, MIN_HEIGHT),
          // Adjust position if box would go off screen after size increase
          x: Math.min(box.x, 100 - Math.max(box.width, MIN_WIDTH)),
          y: Math.min(box.y, 100 - Math.max(box.height, MIN_HEIGHT)),
        }));
        console.log('🟢 Setting highlights:', adjustedHighlights.length, 'boxes', adjustedHighlights);
        setHighlights(adjustedHighlights);
        lastGoodHighlightsRef.current = adjustedHighlights; // Save as last good
        emptyHighlightCountRef.current = 0; // Reset empty counter
      } else {
        // No highlights in this frame - don't immediately clear
        emptyHighlightCountRef.current++;
        console.log(`⚪ No highlights in this frame (${emptyHighlightCountRef.current}/${EMPTY_HIGHLIGHT_THRESHOLD})`);

        if (emptyHighlightCountRef.current >= EMPTY_HIGHLIGHT_THRESHOLD) {
          // Enough empty frames - now clear the highlights
          console.log('🔴 Clearing highlights after', EMPTY_HIGHLIGHT_THRESHOLD, 'empty frames');
          setHighlights([]);
          lastGoodHighlightsRef.current = [];
        } else {
          // Keep showing last good highlights for persistence
          console.log('🟡 Keeping last good highlights for now');
          // Don't change highlights - they persist from last good frame
        }
      }
    }
    // If recognition is off, highlights stay cleared (we cleared them in toggleRecognition)
  };

  // Helper to check if two instructions are essentially the same
  const isSimilarInstruction = (a: string, b: string): boolean => {
    if (!a || !b) return false;
    // Normalize: lowercase, remove punctuation, trim
    const normalize = (s: string) => s.toLowerCase().replace(/[.,!?]/g, '').trim();
    const normA = normalize(a);
    const normB = normalize(b);
    // Check for exact match or high similarity (starts with same 30 chars)
    return normA === normB ||
           (normA.length > 20 && normB.length > 20 && normA.substring(0, 30) === normB.substring(0, 30));
  };

  // === SPEECH QUEUE SYSTEM ===
  // Safety timeout ref to prevent speech from blocking forever
  const speechTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Process next item in speech queue
  const processNextSpeech = () => {
    // Clear any existing timeout
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }

    if (speechQueueRef.current.length === 0) {
      isSpeakingRef.current = false;
      return;
    }

    const { text, urgent } = speechQueueRef.current.shift()!;

    // Safety timeout: if speech callbacks don't fire within 10 seconds, force continue
    // This prevents the app from freezing if speech system hangs
    const SPEECH_TIMEOUT_MS = 10000;
    speechTimeoutRef.current = setTimeout(() => {
      console.warn('⚠️ Speech timeout - forcing continue after', SPEECH_TIMEOUT_MS, 'ms');
      processNextSpeech();
    }, SPEECH_TIMEOUT_MS);

    const speechOptions: Speech.SpeechOptions = {
      language: 'en-US',
      pitch: urgent ? voiceSettings.pitch * 1.2 : voiceSettings.pitch,
      rate: urgent ? voiceSettings.rate * 0.95 : voiceSettings.rate,
      onStart: () => {
        console.log('Speech started:', text.substring(0, 50));
      },
      onDone: () => {
        console.log('Speech done, queue length:', speechQueueRef.current.length);
        // Clear safety timeout
        if (speechTimeoutRef.current) {
          clearTimeout(speechTimeoutRef.current);
          speechTimeoutRef.current = null;
        }
        // Process next item in queue after a brief pause for natural flow
        setTimeout(processNextSpeech, 200);
      },
      onError: (error) => {
        console.error('Speech error:', error);
        // Clear safety timeout
        if (speechTimeoutRef.current) {
          clearTimeout(speechTimeoutRef.current);
          speechTimeoutRef.current = null;
        }
        // Still try to process next item
        setTimeout(processNextSpeech, 100);
      },
    };

    // Add voice identifier if selected
    if (voiceSettings.voiceIdentifier) {
      speechOptions.voice = voiceSettings.voiceIdentifier;
    }

    console.log('Speaking from queue:', text.substring(0, 50));
    Speech.speak(text, speechOptions);
  };

  const speakGuidance = (text: string, urgent: boolean = false) => {
    if (!voiceEnabled && !urgent) return;

    // For urgent messages (safety), interrupt current speech
    if (urgent) {
      Speech.stop();
      speechQueueRef.current = []; // Clear queue
      isSpeakingRef.current = true;
      lastSpeechStartRef.current = Date.now(); // Track start time
      speechQueueRef.current.push({ text, urgent });
      processNextSpeech();
      return;
    }

    // Add to queue
    speechQueueRef.current.push({ text, urgent });
    console.log('Added to speech queue, length:', speechQueueRef.current.length);

    // If not currently speaking, start processing
    if (!isSpeakingRef.current) {
      isSpeakingRef.current = true;
      lastSpeechStartRef.current = Date.now(); // Track start time
      processNextSpeech();
    }
  };

  // === IDENTITY MODAL HANDLERS ===
  const handleStartNewDiagnosis = () => {
    // User wants to start fresh with the detected item
    console.log('🔄 handleStartNewDiagnosis - navigating to DiagnosisScreen for:', detectedItem);
    setShowIdentityModal(false);
    stopFrameCapture();
    Speech.stop();

    // Navigate to diagnosis screen to start fresh
    // Pass the same category since they're likely still in the same repair domain
    navigation.navigate('Diagnosis' as never, {
      category: category, // Required param
    } as never);
  };

  const handleContinueWithOriginal = () => {
    // User confirms they have the right item, resume verification to find it
    console.log('🔄 handleContinueWithOriginal - resuming verification for:', expectedItem);
    setShowIdentityModal(false);
    consecutiveMismatchCount.current = 0;

    // Reset to VERIFYING state and continue looking for the correct item
    identityStatusRef.current = 'VERIFYING';
    setIdentityStatus('VERIFYING');

    const expectedItemName = expectedItem || 'your item';
    const msg = `Okay, show me your ${expectedItemName}. Point the camera at it.`;
    setCurrentGuidance(msg);
    speakGuidance(msg);

    // Resume frame capture to continue looking
    startFrameCapture();
  };

  const handleStartVerification = () => {
    setShowVerificationPrompt(true);
    setIdentityStatus('VERIFYING');
    consecutiveMismatchCount.current = 0;

    const msg = "Show me the brand logo or model label clearly.";
    setCurrentGuidance(msg);
    speakGuidance(msg);
    startFrameCapture();
  };

  const handleForceConfirm = () => {
    setShowIdentityModal(false);
    setShowVerificationPrompt(false);
    setIdentityStatus('CONFIRMED');
    consecutiveMismatchCount.current = 0;
    verificationAttempts.current = 0;
    forceConfirmedRef.current = true; // Skip future identity checks

    speakGuidance("Okay, I'll guide you through the steps. Just follow along and we'll figure this out together.");

    // Start from step 1
    setTimeout(() => {
      startFrameCapture();
      if (repairSteps.length > 0) {
        const step1 = repairSteps[0];
        setCurrentGuidance(step1.instruction);
        speakGuidance(`Step 1: ${step1.instruction}`);
      }
    }, 2000);
  };

  // === STEP NAVIGATION ===
  const canAdvance = stepStatus === 'CONFIRMED' || stepStatus === 'OVERRIDDEN';

  const handleNextStep = () => {
    if (!canAdvance) {
      // Show override modal
      setShowOverrideModal(true);
      return;
    }

    advanceToNextStep();
  };

  const advanceToNextStep = () => {
    console.log('🔄 advanceToNextStep called, currentStepIndex:', currentStepIndex, 'repairSteps.length:', repairSteps.length);
    if (currentStepIndex < repairSteps.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const nextIndex = currentStepIndex + 1;
      const nextStep = repairSteps[nextIndex];
      console.log('➡️ Setting step index from', currentStepIndex, 'to', nextIndex);

      // === DETERMINISTIC ITEMS CHECK FROM PLAN METADATA ===
      // Check if next step requires tools or materials
      const toolsNeeded = nextStep.toolsNeeded || [];
      const materialsNeeded = nextStep.materialsNeeded || [];
      const allItemsNeeded = [...toolsNeeded, ...materialsNeeded].filter(item => item && item.trim());

      if (allItemsNeeded.length > 0) {
        // Pause to show items checklist BEFORE starting the step
        console.log('🛠️ Step', nextIndex + 1, 'requires items:', allItemsNeeded);

        // CRITICAL: Update ref IMMEDIATELY to prevent stale responses from processing
        currentStepIndexRef.current = nextIndex;
        stepAdvanceTimestampRef.current = Date.now();
        // Set step index first so the modal shows the correct step
        setCurrentStepIndex(nextIndex);
        setCurrentGuidance(nextStep.instruction);

        // Then show the items checklist with explicit items from plan metadata
        setTimeout(() => {
          const itemsList = allItemsNeeded.join(', ');
          handlePauseSession(
            'get_item',
            `Step ${nextIndex + 1} needs: ${itemsList}. Check off any you DON'T have:`,
            undefined,
            nextStep.instruction,
            allItemsNeeded // Pass explicit items from plan metadata
          );
          speakGuidance(`Before we continue, you'll need ${itemsList}. Check off any items you don't have.`);
        }, 500);
        return; // Don't continue - the resume handler will start frame capture
      }

      // No items needed - proceed normally
      // CRITICAL: Update ref IMMEDIATELY to prevent stale responses from processing
      currentStepIndexRef.current = nextIndex;
      stepAdvanceTimestampRef.current = Date.now();
      setCurrentStepIndex(nextIndex);
      setCurrentGuidance(nextStep.instruction);
      speakGuidance(`Step ${nextIndex + 1}: ${nextStep.instruction}`);
      lastGuidanceTimeRef.current = Date.now();

      // Enter working mode for the new step
      setIsWorkingMode(true);
      workingModeStartRef.current = Date.now();
      lastSpokenTimeRef.current = Date.now();

      // Reset tracking for new step
      setStepStatus('IN_PROGRESS');
      stepConfirmationWindow.current = [];
      lastInstructionRef.current = '';
      sameInstructionCount.current = 0;
      lastPausedActionRef.current = ''; // Reset action tracking for new step
      actionPauseCountRef.current = 0;

      console.log('✅ Advanced to step', nextIndex + 1, '- no items needed, letting AI guide naturally');
    } else {
      console.log('🏁 Final step reached, calling handleFinalStepComplete');
      handleFinalStepComplete();
    }
  };

  const handleFinalStepComplete = () => {
    // All steps complete - clean up first
    stopFrameCapture();
    Speech.stop();
    setSessionActive(false);

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Alert.alert(
      'Repair Complete!',
      "You've finished all the steps. Test your repair to make sure it works.",
      [
        {
          text: 'Mark as Fixed',
          onPress: () => navigation.navigate('Home'),
        },
        {
          text: 'Need More Help',
          onPress: () => navigation.goBack(),
        },
      ],
      { cancelable: false } // Prevent dismissing by tapping outside
    );
  };

  const handleOverrideConfirm = () => {
    setShowOverrideModal(false);
    setStepStatus('OVERRIDDEN');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    advanceToNextStep();
  };

  // Handler when user confirms AI's suggested completion
  const handleCompletionConfirm = () => {
    setShowCompletionPrompt(false);
    setCompletionEvidence('');
    setStepStatus('CONFIRMED');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    speakGuidance('Great job!');

    setTimeout(() => {
      if (currentStepIndex < repairSteps.length - 1) {
        advanceToNextStep();
      } else {
        handleFinalStepComplete();
      }
    }, 1000);
  };

  // Handler when user says step is not complete yet
  const handleCompletionDeny = () => {
    setShowCompletionPrompt(false);
    setCompletionEvidence('');
    setStepStatus('IN_PROGRESS');
    stepConfirmationWindow.current = []; // Reset the confirmation window
    speakGuidance('No problem, keep going with this step.');
  };

  const handleStopSession = () => {
    Alert.alert(
      'Stop Guided Fix?',
      'Are you sure you want to stop? You can return to the diagnosis results.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: () => {
            stopFrameCapture();
            Speech.stop();
            navigation.goBack();
          },
        },
      ]
    );
  };

  // === SESSION PAUSE HANDLERS ===
  // stepInstruction: Pass this when calling from a setTimeout to avoid stale closure issues
  // explicitItems: Pass explicit items list (from plan metadata) to bypass heuristic extraction
  // taskInstructionText: The specific task instruction to display for 'do_task' reason
  const handlePauseSession = (reason: 'manual' | 'get_item' | 'working_on_step' | 'do_task', message?: string, workingDescription?: string, stepInstruction?: string, explicitItems?: string[], taskInstructionText?: string) => {
    // Extract items FIRST before showing modal (for get_item reason)
    let extractedItems: string[] = [];
    if (reason === 'get_item') {
      // Use explicit items from plan metadata if provided (most reliable)
      if (explicitItems && explicitItems.length > 0) {
        extractedItems = explicitItems;
        console.log('📋 Using explicit items from plan metadata:', extractedItems);
      } else {
        // Fall back to heuristic extraction from instruction text
        const instructionToUse = stepInstruction || repairSteps[currentStepIndex]?.instruction;
        if (instructionToUse) {
          extractedItems = extractItemsFromInstruction(instructionToUse);
          console.log('📋 Extracted items from step (heuristic):', instructionToUse, '→', extractedItems);
        } else {
          console.log('⚠️ No step instruction found for item extraction');
        }
      }
    }

    // Set all state together
    setIsPaused(true);
    isPausedRef.current = true;
    setPauseReason(reason);
    setWorkingStepDescription(workingDescription || '');

    // Set task instruction for do_task reason
    if (reason === 'do_task' && taskInstructionText) {
      setTaskInstruction(taskInstructionText);
    }

    // Set appropriate message based on reason
    let pauseMsg = message;
    if (!pauseMsg) {
      if (reason === 'get_item') {
        pauseMsg = 'Check off any items you DON\'T have:';
      } else if (reason === 'working_on_step') {
        pauseMsg = 'Take your time. Tap "Done" when finished.';
      } else if (reason === 'do_task') {
        pauseMsg = 'Complete this task, then tap "Done" when finished.';
      } else {
        pauseMsg = 'Session paused. Resume when ready.';
      }
    }
    setPauseMessage(pauseMsg);
    setNeededItems(extractedItems);
    setMissingItems(new Set());
    setShowPauseModal(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    // Stop frame capture to save API credits
    stopFrameCapture();
    Speech.stop();

    if (reason === 'do_task' && taskInstructionText) {
      speakGuidance(`Complete this task: ${taskInstructionText}. Tap done when you're finished.`);
    } else if (reason === 'get_item' && extractedItems.length > 0) {
      speakGuidance(`Session paused. You need ${extractedItems.length} items. Check off any you don't have.`);
    } else if (reason === 'get_item') {
      speakGuidance('Session paused. Gather the items you need, then tap continue.');
    } else if (reason === 'working_on_step') {
      speakGuidance(`Take your time ${workingDescription || ''}. Tap Done when you're finished.`);
    } else {
      speakGuidance('Session paused. Tap Resume when you are ready to continue.');
    }
  };

  const handleResumeSession = () => {
    const wasWorkingOnStep = pauseReason === 'working_on_step';
    const wasGetItem = pauseReason === 'get_item';
    const wasDoTask = pauseReason === 'do_task';

    console.log('▶️ handleResumeSession called, reason was:', pauseReason);

    // === FIX #3: Persist missing items to stepModifications BEFORE clearing ===
    // This ensures the AI remembers what items the user doesn't have
    if (missingItems.size > 0) {
      const missingList = Array.from(missingItems).join(', ');
      const newConstraints = stepModifications
        ? `${stepModifications}; User does not have: ${missingList}`
        : `User does not have: ${missingList}`;
      console.log('📝 Saving missing items to constraints:', newConstraints);
      setStepModifications(newConstraints);
      // Also update ref immediately for the next API call (state is async)
      stepModificationsRef.current = newConstraints;
    }

    setIsPaused(false);
    isPausedRef.current = false;
    setShowPauseModal(false);
    setPauseReason(null);
    setPauseMessage('');
    setWorkingStepDescription('');
    setNeededItems([]); // Clear needed items
    setMissingItems(new Set()); // Clear missing items (already saved to stepModifications)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const currentStep = repairSteps[currentStepIndex];

    // Handle do_task resume with delayed frame capture
    // Give user time to show result of their action
    if (wasDoTask) {
      speakGuidance(`Let me check if that's complete.`);
      setCurrentGuidance('Checking your work...');
      // Clear last paused action so we can detect if same instruction is given again
      lastPausedActionRef.current = '';
      // Delay before starting frame capture to let user position camera
      console.log('▶️ Delaying frame capture for do_task resume (2s)...');
      setTimeout(() => {
        if (sessionActiveRef.current && !isPausedRef.current) {
          console.log('▶️ Starting frame capture after do_task delay');
          startFrameCapture();
        }
      }, 2000);
      return;
    }

    // Resume frame capture immediately for other pause reasons
    console.log('▶️ Starting frame capture...');
    startFrameCapture();

    // For working_on_step, verify completion with AI
    if (wasWorkingOnStep) {
      speakGuidance(`Okay, let me check if that's done.`);
      setCurrentGuidance('Verifying step completion...');
      // Exit working mode to allow immediate AI feedback
      setIsWorkingMode(false);
    } else if (wasGetItem && currentStep) {
      // User said they have items - continue with current step
      speakGuidance(`Great! Let's continue. ${currentStep.instruction}`);
      setCurrentGuidance(currentStep.instruction);
      // Enter working mode since they're about to do the step
      setIsWorkingMode(true);
      workingModeStartRef.current = Date.now();
      lastSpokenTimeRef.current = Date.now();
    } else if (currentStep) {
      speakGuidance(`Resuming. ${currentStep.instruction}`);
      setCurrentGuidance(currentStep.instruction);
    }
  };

  const handleManualPause = () => {
    handlePauseSession('manual');
  };

  // Check if AI instruction suggests user needs to get an item
  // Returns null if the instruction is ONLY confirming item is visible (no fetch request)
  const checkForGetItemInstruction = (instruction: string): string | null => {
    const lowerInstruction = instruction.toLowerCase();

    // Helper function to check if item appears as a whole word
    const containsWholeWord = (text: string, word: string): boolean => {
      const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedWord}\\b`, 'i');
      return regex.test(text);
    };

    // Common tools and materials that users might need to fetch
    const fetchableItems = [
      // Heat sources
      'heat gun', 'hair dryer', 'hairdryer', 'blow dryer', 'blowdryer', 'heat source',
      // Tools
      'wrench', 'screwdriver', 'pliers', 'hammer', 'duct tape', 'electrical tape',
      'bucket', 'towel', 'rag', 'cloth', 'gloves', 'flashlight', 'battery', 'batteries',
      'meter', 'multimeter', 'gauge', 'level', 'ruler', 'scissors', 'knife', 'spoon',
      // Materials
      'aluminum foil', 'foil', 'plastic wrap', 'paper towel', 'paper towels', 'newspaper',
      'replacement', 'filter', 'container',
      'bowl', 'cup', 'cleaner', 'solution', 'spray', 'lubricant', 'wd-40',
      'vinegar', 'baking soda', 'bleach', 'soap', 'detergent',
      // Safety items
      'safety glasses', 'goggles', 'mask', 'respirator', 'ear plugs', 'ear protection',
      // Plumbing
      'plunger', 'snake', 'drain snake', 'auger', 'pipe wrench', 'teflon tape', 'plumber\'s tape',
      // Electrical
      'wire stripper', 'wire nuts', 'voltage tester',
      // General
      'ladder', 'step stool', 'extension cord', 'lamp', 'mirror',
    ];

    // Contexts that suggest fetching/using is needed (user might not have item yet)
    // Expanded to catch action phrases like "use a hairdryer" or "apply heat with"
    const fetchContexts = ['get', 'grab', 'fetch', 'find', 'need', 'bring', 'locate', 'gather', 'show me', 'position',
      'use', 'apply', 'with a', 'with the', 'using', 'you\'ll need', 'you will need', 'requires', 'take', 'hold'];

    // Check if any fetchable item is mentioned in a fetch context
    for (const item of fetchableItems) {
      if (containsWholeWord(lowerInstruction, item)) {
        // Make sure it's in a context that suggests fetching
        if (fetchContexts.some(ctx => lowerInstruction.includes(ctx))) {
          // Check if confirmation phrases indicate item is ALREADY visible
          const hasConfirmation = lowerInstruction.includes('i see') ||
                                  lowerInstruction.includes('i can see') ||
                                  lowerInstruction.includes('is visible') ||
                                  lowerInstruction.includes('great') ||
                                  lowerInstruction.includes('good');

          // Check if instruction STILL asks for item despite seeing something
          const stillNeedsItem = lowerInstruction.includes('now') ||
                                 lowerInstruction.includes('also') ||
                                 lowerInstruction.includes('but') ||
                                 lowerInstruction.includes('still');

          // If there's a confirmation AND still needs item, trigger pause
          // If there's a confirmation but NO "still needs", skip this item
          // If there's NO confirmation at all, trigger pause
          if (hasConfirmation && !stillNeedsItem) {
            continue; // Skip this item, it's already confirmed visible
          }

          return item;
        }
      }
    }

    return null;
  };

  // Check if AI instruction is an action task that user needs to do physically
  // Returns true if user should pause and complete the task
  const checkForActionTask = (instruction: string): boolean => {
    const lowerInstruction = instruction.toLowerCase();

    // Skip if it's a camera/position request (not a physical task)
    const cameraRequests = ['move camera', 'point camera', 'show me', 'move closer', 'adjust angle', 'can\'t see', 'cannot see', 'don\'t see'];
    if (cameraRequests.some(req => lowerInstruction.includes(req))) {
      return false;
    }

    // Skip if it's a confirmation/observation (not an action)
    const confirmationPhrases = ['i see', 'i can see', 'looks good', 'step complete', 'well done', 'great job', 'perfect'];
    if (confirmationPhrases.some(phrase => lowerInstruction.includes(phrase))) {
      return false;
    }

    // Action verbs that indicate physical tasks user needs to perform
    const actionVerbs = [
      'put', 'place', 'apply', 'wrap', 'cover', 'remove', 'take off', 'take out',
      'turn', 'rotate', 'twist', 'tighten', 'loosen', 'unscrew', 'screw',
      'press', 'push', 'pull', 'lift', 'lower', 'hold', 'squeeze', 'grab', 'grip',
      'blow', 'extinguish', 'light', 'ignite',
      'pour', 'fill', 'empty', 'drain', 'flush',
      'cut', 'trim', 'peel', 'scrape', 'slice',
      'wipe', 'clean', 'dry', 'rinse', 'scrub', 'wash',
      'connect', 'disconnect', 'attach', 'detach', 'plug', 'unplug',
      'open', 'close', 'shut', 'lock', 'unlock',
      'insert', 'pull out', 'slide', 'adjust', 'move', 'position',
      'fold', 'unfold', 'bend', 'straighten', 'flatten',
      'tape', 'seal', 'secure', 'fasten', 'unfasten',
      'measure', 'mark', 'align', 'center',
      'heat', 'cool', 'warm', 'melt',
      'spray', 'dab', 'spread', 'rub',
      'set', 'reset', 'replace', 'swap', 'switch',
    ];

    // Check if instruction starts with or contains an action verb
    for (const verb of actionVerbs) {
      // Check if instruction starts with the verb (most common for commands)
      if (lowerInstruction.startsWith(verb)) {
        console.log('🔧 Action detected (starts with):', verb);
        return true;
      }
      // Check for "now [verb]" pattern
      if (lowerInstruction.includes(`now ${verb}`)) {
        console.log('🔧 Action detected (now verb):', verb);
        return true;
      }
      // Check for "go ahead and [verb]" pattern
      if (lowerInstruction.includes(`go ahead and ${verb}`)) {
        console.log('🔧 Action detected (go ahead):', verb);
        return true;
      }
      // Check for "please [verb]" pattern
      if (lowerInstruction.includes(`please ${verb}`)) {
        console.log('🔧 Action detected (please verb):', verb);
        return true;
      }
      // Check for "you need to [verb]" pattern
      if (lowerInstruction.includes(`need to ${verb}`)) {
        console.log('🔧 Action detected (need to):', verb);
        return true;
      }
      // Check for "you should [verb]" pattern
      if (lowerInstruction.includes(`should ${verb}`)) {
        console.log('🔧 Action detected (should):', verb);
        return true;
      }
      // Check for "try to [verb]" or "try [verb]ing" pattern
      if (lowerInstruction.includes(`try to ${verb}`) || lowerInstruction.includes(`try ${verb}`)) {
        console.log('🔧 Action detected (try to):', verb);
        return true;
      }
      // Check for verb at start of a sentence after period or comma
      const sentencePattern = new RegExp(`[.,]\\s*${verb}\\b`, 'i');
      if (sentencePattern.test(lowerInstruction)) {
        console.log('🔧 Action detected (mid-sentence):', verb);
        return true;
      }
    }

    console.log('⚪ No action detected in:', lowerInstruction.substring(0, 50));
    return false;
  };

  // Extract ALL items mentioned in a step instruction for checklist
  const extractItemsFromInstruction = (instruction: string): string[] => {
    const lowerInstruction = instruction.toLowerCase();
    const foundItems: string[] = [];

    // Common tools and materials - these will be matched as whole words
    const allItems = [
      // Heat sources (group)
      'heat gun', 'hair dryer', 'hairdryer', 'blow dryer', 'blowdryer', 'heat source',
      // Tools
      'wrench', 'screwdriver', 'pliers', 'hammer', 'duct tape', 'electrical tape',
      'bucket', 'towel', 'rag', 'cloth', 'gloves', 'flashlight', 'battery', 'batteries',
      'meter', 'multimeter', 'gauge', 'level', 'ruler', 'scissors', 'knife', 'spoon',
      // Materials
      'aluminum foil', 'foil', 'plastic wrap', 'paper towel', 'paper towels', 'newspaper',
      'replacement', 'filter', 'container',
      'bowl', 'cup', 'cleaner', 'solution', 'spray', 'lubricant', 'wd-40',
      'vinegar', 'baking soda', 'bleach', 'soap', 'detergent',
      // Safety items
      'safety glasses', 'goggles', 'mask', 'respirator', 'ear plugs', 'ear protection',
      // Plumbing
      'plunger', 'snake', 'drain snake', 'auger', 'pipe wrench', 'teflon tape', 'plumber\'s tape',
      // Electrical
      'wire stripper', 'wire nuts', 'voltage tester',
      // General
      'ladder', 'step stool', 'extension cord', 'lamp', 'mirror', 'lighter', 'matches',
    ];

    // Helper function to check if item appears as a whole word (not part of another word)
    const containsWholeWord = (text: string, word: string): boolean => {
      // Escape special regex characters in the word
      const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Use word boundary regex - matches word not as part of another word
      const regex = new RegExp(`\\b${escapedWord}\\b`, 'i');
      return regex.test(text);
    };

    for (const item of allItems) {
      if (containsWholeWord(lowerInstruction, item) && !foundItems.includes(item)) {
        // Avoid duplicates like "foil" when "aluminum foil" is already found
        const isDuplicate = foundItems.some(existing =>
          existing.includes(item) || item.includes(existing)
        );
        if (!isDuplicate) {
          foundItems.push(item);
        }
      }
    }

    return foundItems;
  };

  // Check if a step requires time-consuming action that should trigger "working" pause
  // Returns a user-friendly description of what they're doing, or null if no pause needed
  const checkForWorkingStep = (instruction: string): string | null => {
    const lowerInstruction = instruction.toLowerCase();

    // Action verbs that typically require time to complete
    const workingActions = [
      // State changes
      { trigger: 'extinguish', description: 'extinguishing the flame' },
      { trigger: 'blow out', description: 'blowing out the flame' },
      { trigger: 'turn off', description: 'turning off' },
      { trigger: 'shut off', description: 'shutting off' },
      { trigger: 'disconnect', description: 'disconnecting' },
      { trigger: 'remove', description: 'removing' },
      { trigger: 'unplug', description: 'unplugging' },
      // Time-consuming actions
      { trigger: 'wrap', description: 'wrapping' },
      { trigger: 'apply heat', description: 'applying heat' },
      { trigger: 'heat the', description: 'heating' },
      { trigger: 'melt', description: 'melting the wax' },
      { trigger: 'wait for', description: 'waiting' },
      { trigger: 'let it', description: 'letting it' },
      { trigger: 'allow', description: 'allowing time for' },
      { trigger: 'pour', description: 'pouring' },
      { trigger: 'drain', description: 'draining' },
      { trigger: 'tighten', description: 'tightening' },
      { trigger: 'loosen', description: 'loosening' },
      { trigger: 'unscrew', description: 'unscrewing' },
      { trigger: 'screw', description: 'screwing' },
      { trigger: 'clean', description: 'cleaning' },
      { trigger: 'wipe', description: 'wiping' },
      { trigger: 'dry', description: 'drying' },
    ];

    for (const action of workingActions) {
      if (lowerInstruction.includes(action.trigger)) {
        return action.description;
      }
    }

    return null;
  };

  // Handle toggling an item as missing
  const handleToggleMissingItem = (item: string) => {
    // Validate item is not empty
    if (!item || item.trim().length === 0) {
      console.warn('⚠️ Attempted to toggle empty item as missing');
      return;
    }
    setMissingItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(item)) {
        newSet.delete(item);
      } else {
        newSet.add(item);
      }
      return newSet;
    });
  };

  // === SUBSTITUTE SEARCH HANDLERS ===

  // Start the substitute search process - close items modal and enter camera scan mode
  const handleStartSubstituteSearch = () => {
    // Filter out empty strings and get valid missing items
    const validMissingItems = Array.from(missingItems).filter(item => item && item.trim().length > 0);
    console.log('🔍 Starting substitute search. missingItems:', Array.from(missingItems), 'validMissingItems:', validMissingItems);

    if (validMissingItems.length === 0) {
      Alert.alert('No Missing Items', 'Mark at least one item you don\'t have first.');
      return;
    }

    // Get the first valid missing item to search for substitute
    const firstMissingItem = validMissingItems[0];
    console.log('🔍 Searching for substitute for:', firstMissingItem);
    setSubstituteSearchItem(firstMissingItem);
    substituteSearchItemRef.current = firstMissingItem; // Sync ref for stale closure prevention
    setFoundSubstitute(null);
    setIsSearchingSubstitute(true);
    isSearchingSubstituteRef.current = true; // Sync ref

    // Close the pause modal but keep session paused
    setShowPauseModal(false);

    // Speak instruction
    speakGuidance(`Point your camera at a drawer, cabinet, or anywhere you might have something to use instead of ${firstMissingItem}.`);

    // Start frame capture for substitute search (uses same camera)
    startSubstituteCapture();
  };

  // Capture a frame and analyze for substitutes
  const startSubstituteCapture = async () => {
    if (!cameraRef.current) {
      console.error('Camera not available for substitute search');
      return;
    }

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.5,
        skipProcessing: true,
      });

      if (!photo?.base64) {
        console.error('No photo captured for substitute search');
        return;
      }

      // Call the find-substitute API
      const currentStep = repairSteps[currentStepIndex];
      const allBannedItems = Array.from(permanentlyUnavailableRef.current);

      // Use ref to get current value (avoids stale closure in async/setTimeout callbacks)
      const currentSearchItem = substituteSearchItemRef.current;
      console.log('🔍 Calling find-substitute API for:', currentSearchItem);

      if (!currentSearchItem || currentSearchItem.trim().length === 0) {
        console.error('❌ substituteSearchItemRef is empty, cannot search');
        speakGuidance('Something went wrong. Let me try again.');
        return;
      }

      const { data, error } = await findSubstitute({
        imageBase64: photo.base64,
        missingItem: currentSearchItem,
        category,
        stepInstruction: currentStep?.instruction || diagnosisSummary,
        bannedItems: allBannedItems.length > 0 ? allBannedItems : undefined,
      });

      if (error) {
        console.error('Find substitute error:', error);
        // Show actual error in guidance for debugging
        const shortError = error.length > 80 ? error.substring(0, 80) + '...' : error;
        setCurrentGuidance(`Error: ${shortError}`);
        speakGuidance('I couldn\'t analyze that. Try pointing at a different spot.');
        // Allow retry - use ref to avoid stale closure
        setTimeout(() => {
          if (isSearchingSubstituteRef.current) {
            console.log('🔍 Retrying substitute search after error...');
            startSubstituteCapture();
          }
        }, 3000);
        return;
      }

      if (data?.foundSubstitute && data.suggestedSubstitute) {
        // Found a substitute!
        console.log('🎉 Found substitute:', data.suggestedSubstitute, 'for', currentSearchItem);
        setFoundSubstitute({
          item: data.suggestedSubstitute,
          reason: data.reason,
          instruction: data.instruction,
          confidence: data.confidence,
          highlight: data.highlight,
        });

        // Show the highlight on the camera
        if (data.highlight) {
          setHighlights([data.highlight]);
        }

        // Show confirmation modal
        setShowSubstituteModal(true);
        setIsSearchingSubstitute(false);
        isSearchingSubstituteRef.current = false; // Sync ref

        speakGuidance(`I found ${data.suggestedSubstitute}! ${data.reason}`);
      } else {
        // No substitute found yet - keep scanning
        console.log('No substitute found yet, reason:', data?.reason);
        speakGuidance(data?.reason || 'I don\'t see a suitable substitute there. Try another spot.');

        // Continue scanning - use ref to avoid stale closure
        setTimeout(() => {
          if (isSearchingSubstituteRef.current) {
            console.log('🔍 Continuing substitute search...');
            startSubstituteCapture();
          }
        }, 3000);
      }
    } catch (err) {
      console.error('Substitute search error:', err);
      speakGuidance('Something went wrong. Let\'s try again.');
      // Retry - use ref to avoid stale closure
      setTimeout(() => {
        if (isSearchingSubstituteRef.current) {
          console.log('🔍 Retrying substitute search after exception...');
          startSubstituteCapture();
        }
      }, 3000);
    }
  };

  // User confirms the found substitute
  const handleConfirmSubstitute = async () => {
    if (!foundSubstitute) return;

    // Add to confirmed substitutes map
    confirmedSubstitutesRef.current.set(substituteSearchItem.toLowerCase(), foundSubstitute.item.toLowerCase());
    console.log('✅ Confirmed substitute:', substituteSearchItem, '->', foundSubstitute.item);

    // Add the original item to banned list
    permanentlyUnavailableRef.current.add(substituteSearchItem.toLowerCase());

    // Close substitute modal
    setShowSubstituteModal(false);
    setFoundSubstitute(null);
    setHighlights([]);

    // Remove from missing items since we found a substitute
    setMissingItems(prev => {
      const newSet = new Set(prev);
      newSet.delete(substituteSearchItem);
      return newSet;
    });

    // If there are more missing items, ask about them
    const remainingMissing = Array.from(missingItems).filter(item => item !== substituteSearchItem);
    if (remainingMissing.length > 0) {
      // Go back to items modal for remaining items
      setShowPauseModal(true);
      speakGuidance(`Great! Now let's check the other items.`);
    } else {
      // All items handled - regenerate plan with substitutes
      setIsRegeneratingPlan(true);
      speakGuidance(`Perfect! I'll update the plan to use ${foundSubstitute.item}.`);
      await regeneratePlanWithSubstitutes();
    }
  };

  // Cancel substitute search and go back to items modal
  const handleCancelSubstituteSearch = () => {
    setIsSearchingSubstitute(false);
    isSearchingSubstituteRef.current = false; // Sync ref
    setShowSubstituteModal(false);
    setFoundSubstitute(null);
    setHighlights([]);
    setShowPauseModal(true);
    speakGuidance('No problem. You can still update the plan without finding a substitute.');
  };

  // Regenerate plan using confirmed substitutes
  const regeneratePlanWithSubstitutes = async () => {
    const preservedStepIndex = currentStepIndex;
    const allBannedItems = Array.from(permanentlyUnavailableRef.current);
    const allSubstitutes = confirmedSubstitutesRef.current.size > 0
      ? Object.fromEntries(confirmedSubstitutesRef.current)
      : undefined;

    // Build substitutes description for prompt context
    const substitutesDescription = allSubstitutes
      ? `Use these CONFIRMED SUBSTITUTES:\n${Object.entries(allSubstitutes).map(([banned, sub]) => `- Use "${sub}" instead of "${banned}"`).join('\n')}`
      : '';

    const regeneratePrompt = `${diagnosisSummary}.
User has completed steps 1-${preservedStepIndex}.
Current step: ${repairSteps[preservedStepIndex]?.instruction || ''}

${substitutesDescription}

Generate remaining steps using the confirmed substitutes above.`;

    try {
      const newSteps = await generateRepairPlan(
        category,
        regeneratePrompt,
        likelyCause,
        allBannedItems,
        allSubstitutes // Pass confirmed substitutes to API
      );

      if (newSteps && newSteps.length > 0) {
        setNewPlanSteps(newSteps);
        setPlanRevision(prev => prev + 1);

        const completedSteps = repairSteps.slice(0, preservedStepIndex);
        const combinedSteps = [...completedSteps, ...newSteps];
        setRepairSteps(combinedSteps);
        setCurrentStepIndex(preservedStepIndex);
        currentStepIndexRef.current = preservedStepIndex;

        setIsPaused(false);
        isPausedRef.current = false;
        setMissingItems(new Set());
        setNeededItems([]);

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowNewPlanModal(true);
      }
    } catch (err) {
      console.error('Failed to regenerate plan with substitutes:', err);
      Alert.alert('Error', 'Could not update plan. Continuing with current plan.');
      handleResumeSession();
    }

    setIsRegeneratingPlan(false);
  };

  // Handle regenerating the plan with missing items as constraints
  // IMPORTANT: Regenerates from the CURRENT step, preserving progress
  const handleRegeneratePlan = async () => {
    if (missingItems.size === 0) {
      // No items marked as missing, just resume
      // But first, track confirmed items (items user has)
      const itemsUserHas = neededItems.filter(item => !missingItems.has(item));
      if (itemsUserHas.length > 0) {
        setConfirmedItems(prev => {
          const newSet = new Set(prev);
          itemsUserHas.forEach(item => newSet.add(item));
          return newSet;
        });
      }
      handleResumeSession();
      return;
    }

    setIsRegeneratingPlan(true);

    // Remember current progress - we'll continue from here
    const preservedStepIndex = currentStepIndex;
    const completedStepsCount = preservedStepIndex; // Steps 0 to preservedStepIndex-1 are done

    // ADD new missing items to PERMANENT unavailable list
    // These items will NEVER be suggested again in this session
    missingItems.forEach(item => {
      permanentlyUnavailableRef.current.add(item.toLowerCase());
      console.log('🚫 Added to permanently unavailable:', item);
    });

    // Build constraints string from ALL permanently unavailable items
    // This includes items marked as missing in previous regenerations
    const allUnavailableItems = Array.from(permanentlyUnavailableRef.current);
    const constraintsList = allUnavailableItems.join(', ');
    console.log('🚫 All permanently unavailable items:', constraintsList);

    // Build new constraints - ALWAYS include the full permanent unavailable list
    // This ensures the AI guidance never suggests unavailable items
    const newConstraints = `UNAVAILABLE ITEMS (DO NOT SUGGEST): ${constraintsList}`;

    // Update step modifications immediately
    setStepModifications(newConstraints);
    stepModificationsRef.current = newConstraints;
    console.log('📝 Updated stepModifications with permanent constraints:', newConstraints);

    // Track items user confirmed they have
    const itemsUserHas = neededItems.filter(item => !missingItems.has(item));
    if (itemsUserHas.length > 0) {
      setConfirmedItems(prev => {
        const newSet = new Set(prev);
        itemsUserHas.forEach(item => newSet.add(item));
        return newSet;
      });
    }

    try {
      // Get the current step instruction for context
      const currentStepInstruction = repairSteps[preservedStepIndex]?.instruction || '';

      // Regenerate plan starting from current step with constraints
      // Tell the AI we've already completed earlier steps
      const completedStepsDescription = preservedStepIndex > 0
        ? `User has already completed steps 1-${preservedStepIndex}. `
        : '';

      const regeneratePrompt = `${diagnosisSummary}.
${completedStepsDescription}
CURRENT SITUATION: User is on step ${preservedStepIndex + 1}: "${currentStepInstruction}"

⚠️ CRITICAL CONSTRAINT - ITEMS USER DOES NOT HAVE: ${constraintsList}
These items are NOT available to the user. Do NOT include ANY of these items in ANY step.
You MUST find alternatives or different approaches that work WITHOUT: ${constraintsList}.

Generate a plan starting from this point that:
1. NEVER uses: ${constraintsList}
2. Suggests practical alternatives for each unavailable item
3. Works with common household items the user likely has
Do NOT include steps for things the user has already completed.`;

      console.log('[handleRegeneratePlan] Regenerating from step', preservedStepIndex + 1, 'with constraints:', constraintsList);

      // Build confirmed substitutes object from ref
      const confirmedSubs = confirmedSubstitutesRef.current.size > 0
        ? Object.fromEntries(confirmedSubstitutesRef.current)
        : undefined;
      console.log('[handleRegeneratePlan] Confirmed substitutes:', confirmedSubs);

      // Pass the banned items array and confirmed substitutes to the API
      const newSteps = await generateRepairPlan(
        category,
        regeneratePrompt,
        likelyCause,
        allUnavailableItems, // Pass banned items to server-side prompt
        confirmedSubs // Pass confirmed substitutes to API
      );

      if (newSteps && newSteps.length > 0) {
        // Store new steps for modal display
        setNewPlanSteps(newSteps);
        setPlanStartStep(0); // New plan starts at index 0 (but represents continuation)

        // Increment plan revision for color tracking
        setPlanRevision(prev => prev + 1);

        // Update repair steps (replacing remaining steps with new ones)
        // Keep completed steps from before + add new steps
        const completedSteps = repairSteps.slice(0, preservedStepIndex);
        const combinedSteps = [...completedSteps, ...newSteps];
        setRepairSteps(combinedSteps);

        // Stay at current step index (which now points to first step of new plan)
        setCurrentStepIndex(preservedStepIndex);
        currentStepIndexRef.current = preservedStepIndex;

        console.log('[handleRegeneratePlan] Combined plan:', completedSteps.length, 'completed +', newSteps.length, 'new =', combinedSteps.length, 'total');

        // Close pause modal and show new plan modal
        setShowPauseModal(false);
        setIsPaused(false);
        isPausedRef.current = false;
        setPauseReason(null);
        setMissingItems(new Set());
        setNeededItems([]);

        // Show the new plan modal for user acknowledgment
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setShowNewPlanModal(true);
        speakGuidance(`I've updated the plan to work without ${constraintsList}. Take a look at the new steps.`);
      }
    } catch (err) {
      console.error('Failed to regenerate plan:', err);
      Alert.alert('Error', 'Could not regenerate plan. Continuing with current plan.');
      // Resume with current plan
      setShowPauseModal(false);
      setIsPaused(false);
      isPausedRef.current = false;
      setPauseReason(null);
      setMissingItems(new Set());
      startFrameCapture();
    }

    setIsRegeneratingPlan(false);
  };

  // Handle user acknowledging the new plan
  const handleAcknowledgeNewPlan = () => {
    setShowNewPlanModal(false);
    setNewPlanSteps([]);

    // Start guidance on the current step (first step of new plan section)
    const currentStep = repairSteps[currentStepIndex];
    if (currentStep) {
      setCurrentGuidance(currentStep.instruction);
      speakGuidance(`Continuing with step ${currentStepIndex + 1}: ${currentStep.instruction}`);
    }

    // Reset step status and start frame capture
    setStepStatus('IN_PROGRESS');
    stepConfirmationWindow.current = [];
    setIsWorkingMode(true);
    workingModeStartRef.current = Date.now();
    lastSpokenTimeRef.current = Date.now();
    startFrameCapture();
  };

  const toggleVoice = () => {
    const newValue = !voiceEnabled;
    setVoiceEnabled(newValue);

    if (!newValue) {
      Speech.stop();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      speakGuidance('Voice guidance enabled');
    }
  };

  const toggleFlash = () => {
    setFlashEnabled(!flashEnabled);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const toggleRecognition = () => {
    const newValue = !recognitionEnabled;
    setRecognitionEnabled(newValue);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (newValue) {
      speakGuidance('Visual feedback on');
    } else {
      speakGuidance('Visual feedback off');
      // Clear highlights when turning off visual feedback
      setHighlights([]);
    }
  };

  const openVoiceSettings = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowVoiceModal(true);
  };

  const previewVoice = () => {
    Speech.stop();
    const previewText = "This is how I'll sound during your repair.";
    const speechOptions: Speech.SpeechOptions = {
      language: 'en-US',
      pitch: voiceSettings.pitch,
      rate: voiceSettings.rate,
      onStart: () => {
        console.log('Preview voice started');
      },
      onDone: () => {
        console.log('Preview voice done');
      },
      onError: (error) => {
        console.error('Preview voice error:', error);
      },
    };
    if (voiceSettings.voiceIdentifier) {
      speechOptions.voice = voiceSettings.voiceIdentifier;
    }
    Speech.speak(previewText, speechOptions);
  };

  const selectVoice = (voice: AvailableVoice | null) => {
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const adjustRate = (delta: number) => {
    setVoiceSettings(prev => ({
      ...prev,
      rate: Math.max(0.5, Math.min(1.5, prev.rate + delta)),
    }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const adjustPitch = (delta: number) => {
    setVoiceSettings(prev => ({
      ...prev,
      pitch: Math.max(0.5, Math.min(2.0, prev.pitch + delta)),
    }));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Ref to store event listener subscriptions
  const speechListenerRef = useRef<any>(null);

  // Voice Question Functions (Phase 1-3)
  const startListening = async () => {
    // Check if speech recognition module is available
    if (!ExpoSpeechRecognitionModule) {
      Alert.alert('Not Available', 'Voice questions require a development build with speech recognition.');
      return;
    }

    // Check cooldown (Phase 2: Rate limiting)
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
      stopFrameCapture();

      // Request permission
      const { status } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Microphone access is required for voice questions.');
        setIsListening(false);
        startFrameCapture(); // Resume frame capture
        return;
      }

      // Set up event listener for results before starting
      // The module extends NativeModule, so we use addListener
      speechListenerRef.current = ExpoSpeechRecognitionModule.addListener('result', (event: any) => {
        if (event.results && event.results.length > 0) {
          const transcript = event.results[0]?.transcript || '';

          // Phase 3: Wake word detection
          const lowerTranscript = transcript.toLowerCase();
          if (lowerTranscript.includes('kandu')) {
            // Extract question after wake word
            const questionPart = transcript.substring(transcript.toLowerCase().indexOf('kandu') + 5).trim();
            if (questionPart.length > 5) {
              setVoiceQuestion(questionPart);
            }
          } else {
            // Regular question without wake word
            setVoiceQuestion(transcript);
          }
        }

        if (event.isFinal) {
          const finalText = event.results?.[0]?.transcript || '';
          cleanupAndProcessResult(finalText);
        }
      });

      // Also listen for errors
      const errorListener = ExpoSpeechRecognitionModule.addListener('error', (event: any) => {
        console.error('Speech recognition error event:', event);
        cleanupListeners();
        setIsListening(false);
        if (event.error !== 'aborted') {
          Alert.alert('Recognition Error', event.message || 'Speech recognition failed.');
        }
        // Resume frame capture on error
        startFrameCapture();
      });

      // Store error listener for cleanup
      const endListener = ExpoSpeechRecognitionModule.addListener('end', () => {
        console.log('🎤 Speech recognition ended');
        cleanupListeners();
        setIsListening(false);
        // Resume frame capture if no answer is being shown
        // (if an answer is shown, frame capture will resume when answer is dismissed)
        setTimeout(() => {
          if (!showAnswer && !frameIntervalRef.current) {
            console.log('🎥 Resuming frame capture after speech end');
            startFrameCapture();
          }
        }, 500);
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
      startFrameCapture(); // Resume frame capture on error
    }
  };

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

  const cleanupAndProcessResult = async (finalTranscript: string) => {
    cleanupListeners();
    setIsListening(false);

    // Enforce maximum question length (Phase 2: Guardrails)
    const trimmedQuestion = finalTranscript.trim().slice(0, 100);

    if (trimmedQuestion.length > 5) {
      setVoiceQuestion(trimmedQuestion);
      await processVoiceQuestion(trimmedQuestion);
    } else {
      Alert.alert('No Question', 'Please speak your question clearly.');
      // Resume frame capture if no valid question
      startFrameCapture();
    }
  };

  const stopListening = async (finalTranscript: string) => {
    try {
      if (ExpoSpeechRecognitionModule) {
        ExpoSpeechRecognitionModule.stop();
      }
      cleanupAndProcessResult(finalTranscript);
    } catch (error) {
      console.error('Error stopping recognition:', error);
      cleanupListeners();
      setIsListening(false);
    }
  };

  const processVoiceQuestion = async (question: string) => {
    // Update rate limiting timestamp (Phase 2)
    lastQuestionTime.current = Date.now();
    setQuestionCooldown(true);
    setTimeout(() => setQuestionCooldown(false), QUESTION_COOLDOWN);

    // Add user question to conversation history
    const userEntry: ConversationEntry = {
      role: 'user',
      content: question,
      timestamp: Date.now(),
    };
    setConversationHistory(prev => [...prev.slice(-4), userEntry]); // Keep last 5 entries

    // Detect constraints/modifications from the question
    const lowerQuestion = question.toLowerCase();
    const constraintPatterns = [
      { pattern: /(?:don't|do not|doesn't|dont) have (?:a |an |the )?(.+?)(?:\?|$|,)/i, type: 'missing' },
      { pattern: /what if (?:i |I )?(?:don't|do not|dont) have (?:a |an |the )?(.+?)(?:\?|$|,)/i, type: 'missing' },
      { pattern: /(?:can i |can I )(?:use|try) (?:a |an |the )?(.+?) instead/i, type: 'alternative' },
      { pattern: /(?:is there |what's )(?:an? )?alternative to (?:a |an |the )?(.+?)(?:\?|$)/i, type: 'alternative' },
      { pattern: /(?:without|skip) (?:a |an |the )?(.+?)(?:\?|$|,)/i, type: 'skip' },
    ];

    let detectedConstraint = '';
    for (const { pattern, type } of constraintPatterns) {
      const match = lowerQuestion.match(pattern);
      if (match && match[1]) {
        const item = match[1].trim();
        if (type === 'missing' || type === 'skip') {
          detectedConstraint = `User doesn't have: ${item}`;
        } else if (type === 'alternative') {
          detectedConstraint = `User wants to use alternative: ${item}`;
        }
        console.log(`🔄 Detected constraint: ${detectedConstraint}`);
        break;
      }
    }

    try {
      // Capture current frame for context
      let currentFrame = '';
      if (cameraRef.current) {
        const photo = await cameraRef.current.takePictureAsync({
          base64: true,
          quality: 0.5,
        });
        if (photo?.base64) {
          currentFrame = photo.base64;
        }
      }

      // Get current step context
      const currentStep = repairSteps[currentStepIndex];

      // Build conversation context string for the API
      const recentConversation = conversationHistory
        .slice(-3)
        .map(e => `${e.role === 'user' ? 'User' : 'Assistant'}: ${e.content}`)
        .join('\n');

      // Call voice question Edge Function with conversation context
      // Use ref for most current constraints value
      const { data, error } = await askVoiceQuestion({
        question,
        category,
        diagnosisSummary,
        currentStepInstruction: currentStep.instruction,
        identityStatus,
        imageBase64: currentFrame || undefined,
        // Pass additional context
        conversationContext: recentConversation || undefined,
        userConstraints: stepModificationsRef.current || undefined,
      });

      if (error) {
        console.error('Voice question error:', error);
        Alert.alert('Error', error);
        startFrameCapture();
        return;
      }

      const answer = data?.answer || 'Sorry, I could not process that question. Please try again.';

      // Add assistant answer to conversation history
      const assistantEntry: ConversationEntry = {
        role: 'assistant',
        content: answer,
        timestamp: Date.now(),
      };
      setConversationHistory(prev => [...prev.slice(-4), assistantEntry]);

      // If a constraint was detected, update step modifications for future guidance
      if (detectedConstraint) {
        setStepModifications(prev => {
          const newMods = prev ? `${prev}; ${detectedConstraint}` : detectedConstraint;
          console.log(`📝 Updated step modifications: ${newMods}`);
          return newMods;
        });

        // Also update the current guidance to reflect the alternative
        // The answer should contain the alternative approach
        if (answer && !answer.toLowerCase().includes('sorry')) {
          setCurrentGuidance(answer);
        }
      }

      // Display and speak answer (Phase 1)
      setVoiceAnswer(answer);
      setShowAnswer(true);

      // Speak answer using voice settings
      if (voiceEnabled) {
        const speechOptions: Speech.SpeechOptions = {
          language: 'en-US',
          pitch: voiceSettings.pitch,
          rate: voiceSettings.rate,
        };
        if (voiceSettings.voiceIdentifier) {
          speechOptions.voice = voiceSettings.voiceIdentifier;
        }
        Speech.speak(answer, speechOptions);
      }

      // Auto-dismiss after 10 seconds (Phase 2)
      if (answerTimeoutRef.current) {
        clearTimeout(answerTimeoutRef.current);
      }
      answerTimeoutRef.current = setTimeout(() => {
        setShowAnswer(false);
        setVoiceAnswer('');
        // Resume frame capture after auto-dismiss
        startFrameCapture();
      }, 10000);

    } catch (error) {
      console.error('Error processing voice question:', error);
      Alert.alert('Error', 'Could not process your question. Please try again.');
      // Resume frame capture on error
      startFrameCapture();
    }
  };

  const dismissAnswer = () => {
    if (answerTimeoutRef.current) {
      clearTimeout(answerTimeoutRef.current);
    }
    setShowAnswer(false);
    setVoiceAnswer('');
    Speech.stop();
    // Resume frame capture after dismissing answer
    startFrameCapture();
  };

  const adjustOpacity = (delta: number) => {
    setTextBoxOpacity(prev => Math.max(0.3, Math.min(1.0, prev + delta)));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  // Request camera permission
  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1E5AA8" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={80} color="#64748b" />
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>
          We need camera access to guide you through the repair step-by-step.
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.permissionButton, { backgroundColor: '#64748b', marginTop: 12 }]}
          onPress={() => setDemoMode(true)}
        >
          <Text style={styles.permissionButtonText}>View Demo Mode (No Camera)</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Demo Mode
  if (demoMode || !permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.demoContainer}>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.stopButton} onPress={handleStopSession}>
              <Ionicons name="close-circle" size={24} color="#ffffff" />
              <Text style={styles.stopButtonText}>Stop</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlToggle} onPress={toggleVoice}>
              <Ionicons name={voiceEnabled ? 'volume-high' : 'volume-mute'} size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>

          <View style={styles.demoCameraView}>
            <Ionicons name="videocam-off" size={100} color="#64748b" />
            <Text style={styles.demoText}>Demo Mode</Text>
            <Text style={styles.demoSubtext}>Camera will work in the full app build</Text>
          </View>

          {!isLoadingPlan && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${((currentStepIndex + 1) / repairSteps.length) * 100}%` }]} />
              </View>
              <Text style={styles.progressText}>Step {currentStepIndex + 1} of {repairSteps.length}</Text>
            </View>
          )}

          <View style={styles.guidanceContainer}>
            {isLoadingPlan ? (
              <View style={styles.guidanceBox}>
                <ActivityIndicator size="small" color="#1E5AA8" style={{ marginRight: 10 }} />
                <Text style={styles.guidanceText}>Preparing your repair plan...</Text>
              </View>
            ) : (
              <>
                <View style={styles.guidanceBox}>
                  <Text style={styles.guidanceText}>{currentGuidance || 'Point camera at the problem area'}</Text>
                </View>

                {/* Step Status Indicator */}
                <View style={styles.stepStatusContainer}>
                  <View style={[styles.stepStatusBadge, stepStatus === 'CONFIRMED' || stepStatus === 'OVERRIDDEN' ? styles.stepStatusConfirmed : styles.stepStatusPending]}>
                    <Ionicons
                      name={stepStatus === 'CONFIRMED' || stepStatus === 'OVERRIDDEN' ? 'checkmark-circle' : 'time'}
                      size={16}
                      color={stepStatus === 'CONFIRMED' || stepStatus === 'OVERRIDDEN' ? '#10b981' : '#f59e0b'}
                    />
                    <Text style={[styles.stepStatusText, stepStatus === 'CONFIRMED' || stepStatus === 'OVERRIDDEN' ? styles.stepStatusTextConfirmed : styles.stepStatusTextPending]}>
                      {stepStatus === 'CONFIRMED' ? 'Step Confirmed' : stepStatus === 'OVERRIDDEN' ? 'Manually Confirmed' : 'In Progress'}
                    </Text>
                  </View>
                </View>

                <View style={styles.actionButtonsContainer}>
                  <TouchableOpacity
                    style={[styles.nextStepButton, !canAdvance && styles.nextStepButtonDisabled]}
                    onPress={handleNextStep}
                  >
                    <Text style={styles.nextStepButtonText}>
                      {canAdvance
                        ? (currentStepIndex < repairSteps.length - 1 ? 'Next Step' : 'Finish')
                        : 'I Did This Step'
                      }
                    </Text>
                    <Ionicons name={canAdvance ? 'arrow-forward' : 'checkmark'} size={20} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Hide status bar for fullscreen experience */}
      <StatusBar hidden={true} />

      {/* Identity Mismatch Modal */}
      <Modal visible={showIdentityModal} transparent animationType="fade">
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

      {/* Override Confirmation Modal */}
      <Modal visible={showOverrideModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.overrideModal}>
            <Ionicons name="help-circle" size={48} color="#f59e0b" />
            <Text style={styles.overrideModalTitle}>Confirm Step Completion</Text>
            <Text style={styles.overrideModalText}>
              I couldn't visually confirm this step is complete. Are you sure you finished Step {currentStepIndex + 1}?
            </Text>
            <Text style={styles.overrideModalStep}>"{repairSteps[currentStepIndex]?.instruction}"</Text>

            <TouchableOpacity style={styles.overrideModalButtonPrimary} onPress={handleOverrideConfirm}>
              <Text style={styles.overrideModalButtonPrimaryText}>Yes, I Completed This Step</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.overrideModalButtonSecondary} onPress={() => setShowOverrideModal(false)}>
              <Text style={styles.overrideModalButtonSecondaryText}>Keep Trying</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* AI Completion Suggestion Modal */}
      <Modal visible={showCompletionPrompt} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.completionModal}>
            <Ionicons name="checkmark-circle" size={48} color="#10b981" />
            <Text style={styles.completionModalTitle}>Step Complete?</Text>
            <Text style={styles.completionModalText}>
              {completionEvidence || 'It looks like you may have completed this step.'}
            </Text>
            <Text style={styles.completionModalStep}>
              Step {currentStepIndex + 1}: "{repairSteps[currentStepIndex]?.instruction}"
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

      {/* Session Paused Modal */}
      <Modal visible={showPauseModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.pauseModal}>
            <Ionicons
              name={pauseReason === 'get_item' ? 'construct' : pauseReason === 'working_on_step' ? 'build' : pauseReason === 'do_task' ? 'hand-left' : 'pause-circle'}
              size={48}
              color={pauseReason === 'working_on_step' ? '#10b981' : pauseReason === 'do_task' ? '#f59e0b' : '#1E5AA8'}
            />
            <Text style={styles.pauseModalTitle}>
              {pauseReason === 'get_item' ? 'Items Needed' : pauseReason === 'working_on_step' ? 'Working...' : pauseReason === 'do_task' ? 'Your Turn!' : 'Session Paused'}
            </Text>
            <Text style={styles.pauseModalText}>
              {pauseReason === 'get_item'
                ? 'Check any items you DON\'T have:'
                : pauseReason === 'working_on_step'
                  ? `Take your time ${workingStepDescription}. Tap "Done" when finished.`
                  : pauseReason === 'do_task'
                    ? 'Complete this task:'
                    : pauseMessage}
            </Text>

            {/* Item Checklist - only for get_item reason */}
            {pauseReason === 'get_item' && neededItems.length > 0 && (
              <View style={styles.itemChecklist}>
                {neededItems.map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.itemChecklistRow,
                      missingItems.has(item) && styles.itemChecklistRowMissing
                    ]}
                    onPress={() => handleToggleMissingItem(item)}
                  >
                    <Ionicons
                      name={missingItems.has(item) ? 'close-circle' : 'checkmark-circle'}
                      size={24}
                      color={missingItems.has(item) ? '#ef4444' : '#10b981'}
                    />
                    <Text style={[
                      styles.itemChecklistText,
                      missingItems.has(item) && styles.itemChecklistTextMissing
                    ]}>
                      {item.charAt(0).toUpperCase() + item.slice(1)}
                    </Text>
                    {missingItems.has(item) && (
                      <Text style={styles.itemChecklistMissingLabel}>Don't have</Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Show current step when no items detected */}
            {pauseReason === 'get_item' && neededItems.length === 0 && (
              <View style={styles.pauseModalCurrentStepBox}>
                <Text style={styles.pauseModalCurrentStepLabel}>Current Step:</Text>
                <Text style={styles.pauseModalCurrentStep}>
                  {repairSteps[currentStepIndex]?.instruction}
                </Text>
              </View>
            )}

            {pauseReason === 'get_item' && missingItems.size > 0 && (
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
                <Text style={styles.pauseModalCurrentStepLabel}>Step {currentStepIndex + 1}:</Text>
                <Text style={styles.pauseModalCurrentStep}>
                  {repairSteps[currentStepIndex]?.instruction}
                </Text>
              </View>
            )}

            {/* Show task instruction for do_task */}
            {pauseReason === 'do_task' && taskInstruction && (
              <View style={styles.taskInstructionBox}>
                <Text style={styles.taskInstructionText}>
                  {taskInstruction}
                </Text>
              </View>
            )}

            {/* View Plan button for do_task */}
            {pauseReason === 'do_task' && (
              <TouchableOpacity
                style={styles.viewPlanButton}
                onPress={() => setShowViewPlanModal(true)}
              >
                <Ionicons name="list" size={20} color="#3b82f6" />
                <Text style={styles.viewPlanButtonText}>
                  View {planRevision > 0 ? 'Updated ' : ''}Plan ({repairSteps.length} steps)
                </Text>
                <Ionicons name="chevron-forward" size={18} color="#3b82f6" />
              </TouchableOpacity>
            )}

            {pauseReason !== 'get_item' && pauseReason !== 'working_on_step' && pauseReason !== 'do_task' && (
              <Text style={styles.pauseModalCurrentStep}>
                Current Step: {repairSteps[currentStepIndex]?.instruction}
              </Text>
            )}

            {pauseReason === 'get_item' ? (
              <>
                <TouchableOpacity
                  style={[styles.pauseModalButtonPrimary, isRegeneratingPlan && styles.pauseModalButtonDisabled]}
                  onPress={handleRegeneratePlan}
                  disabled={isRegeneratingPlan}
                >
                  {isRegeneratingPlan ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Ionicons name={missingItems.size > 0 ? 'refresh' : 'play'} size={24} color="#ffffff" />
                  )}
                  <Text style={styles.pauseModalButtonPrimaryText}>
                    {isRegeneratingPlan
                      ? 'Updating Plan...'
                      : missingItems.size > 0
                        ? 'Update Plan & Continue'
                        : 'I Have Everything - Continue'}
                  </Text>
                </TouchableOpacity>
              </>
            ) : pauseReason === 'working_on_step' ? (
              <TouchableOpacity style={[styles.pauseModalButtonPrimary, { backgroundColor: '#10b981' }]} onPress={handleResumeSession}>
                <Ionicons name="checkmark-circle" size={24} color="#ffffff" />
                <Text style={styles.pauseModalButtonPrimaryText}>Done - Check My Work</Text>
              </TouchableOpacity>
            ) : pauseReason === 'do_task' ? (
              <TouchableOpacity style={[styles.pauseModalButtonPrimary, { backgroundColor: '#f59e0b' }]} onPress={handleResumeSession}>
                <Ionicons name="checkmark-circle" size={24} color="#ffffff" />
                <Text style={styles.pauseModalButtonPrimaryText}>Done - I Completed This</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.pauseModalButtonPrimary} onPress={handleResumeSession}>
                <Ionicons name="play" size={24} color="#ffffff" />
                <Text style={styles.pauseModalButtonPrimaryText}>Resume Session</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.pauseModalButtonSecondary} onPress={() => { setShowPauseModal(false); handleStopSession(); }}>
              <Text style={styles.pauseModalButtonSecondaryText}>Stop & Exit</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* New Plan Modal - Shows updated plan after regeneration */}
      <Modal visible={showNewPlanModal} transparent animationType="slide">
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
              Here are your updated steps (starting from step {currentStepIndex + 1}):
            </Text>

            <ScrollView style={styles.newPlanStepsList} showsVerticalScrollIndicator={true}>
              {newPlanSteps.map((step, index) => (
                <View key={index} style={styles.newPlanStepItem}>
                  <View style={[styles.newPlanStepNumber, { backgroundColor: PLAN_COLORS[planRevision % PLAN_COLORS.length] }]}>
                    <Text style={styles.newPlanStepNumberText}>{currentStepIndex + index + 1}</Text>
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

      {/* View Current Plan Modal - Shows all steps with progress */}
      <Modal visible={showViewPlanModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.viewPlanModal}>
            <View style={styles.viewPlanHeader}>
              <View style={styles.viewPlanHeaderLeft}>
                <Ionicons name="list" size={28} color={PLAN_COLORS[planRevision % PLAN_COLORS.length]} />
                <Text style={styles.viewPlanTitle}>
                  {planRevision > 0 ? 'Updated Plan' : 'Repair Plan'}
                </Text>
              </View>
              {planRevision > 0 && (
                <View style={[styles.viewPlanBadge, { backgroundColor: PLAN_COLORS[planRevision % PLAN_COLORS.length] }]}>
                  <Text style={styles.viewPlanBadgeText}>v{planRevision + 1}</Text>
                </View>
              )}
            </View>

            <Text style={styles.viewPlanProgress}>
              Step {currentStepIndex + 1} of {repairSteps.length} • {Math.round(((currentStepIndex) / repairSteps.length) * 100)}% complete
            </Text>

            <ScrollView style={styles.viewPlanStepsList} showsVerticalScrollIndicator={true}>
              {repairSteps.map((step, index) => {
                const isCompleted = index < currentStepIndex;
                const isCurrent = index === currentStepIndex;
                return (
                  <View
                    key={index}
                    style={[
                      styles.viewPlanStepItem,
                      isCompleted && styles.viewPlanStepItemCompleted,
                      isCurrent && styles.viewPlanStepItemCurrent,
                    ]}
                  >
                    <View style={[
                      styles.viewPlanStepNumber,
                      isCompleted && styles.viewPlanStepNumberCompleted,
                      isCurrent && { backgroundColor: PLAN_COLORS[planRevision % PLAN_COLORS.length] },
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
                      ]}>
                        {step.instruction}
                      </Text>
                      {step.toolsNeeded && step.toolsNeeded.length > 0 && (
                        <View style={styles.viewPlanStepTools}>
                          <Ionicons name="construct-outline" size={12} color={isCompleted ? '#94a3b8' : '#64748b'} />
                          <Text style={[
                            styles.viewPlanStepToolsText,
                            isCompleted && { color: '#94a3b8' },
                          ]}>
                            {step.toolsNeeded.join(', ')}
                          </Text>
                        </View>
                      )}
                      {isCurrent && (
                        <View style={[styles.viewPlanCurrentBadge, { backgroundColor: PLAN_COLORS[planRevision % PLAN_COLORS.length] }]}>
                          <Text style={styles.viewPlanCurrentBadgeText}>Current Step</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[styles.viewPlanCloseButton, { backgroundColor: PLAN_COLORS[planRevision % PLAN_COLORS.length] }]}
              onPress={() => setShowViewPlanModal(false)}
            >
              <Ionicons name="close-circle" size={24} color="#ffffff" />
              <Text style={styles.viewPlanCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Substitute Search Overlay - Full screen camera view for scanning */}
      <Modal visible={isSearchingSubstitute} transparent animationType="fade">
        <View style={styles.substituteSearchOverlay}>
          {/* Scanning indicator at top */}
          <View style={styles.substituteSearchHeader}>
            <View style={styles.substituteSearchHeaderContent}>
              <ActivityIndicator size="small" color="#ffffff" style={{ marginRight: 10 }} />
              <View>
                <Text style={styles.substituteSearchTitle}>
                  Looking for substitute for: {substituteSearchItem}
                </Text>
                <Text style={styles.substituteSearchSubtitle}>
                  Show me your drawer, cabinet, or supplies
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
              Point camera at available items
            </Text>
          </View>

          {/* Tip at bottom */}
          <View style={styles.substituteSearchTip}>
            <Ionicons name="bulb-outline" size={18} color="#f59e0b" />
            <Text style={styles.substituteSearchTipText}>
              Move slowly so I can identify items that could work
            </Text>
          </View>
        </View>
      </Modal>

      {/* Substitute Confirmation Modal - Shows when substitute found */}
      <Modal visible={showSubstituteModal && foundSubstitute !== null} transparent animationType="slide">
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
                onPress={() => {
                  setShowSubstituteModal(false);
                  setFoundSubstitute(null);
                  // Continue scanning for another option
                  startSubstituteCapture();
                }}
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

      {/* Voice Settings Modal */}
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

      {/* Camera View - Absolute fill, edge-to-edge */}
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={flashEnabled}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          console.log('📐 Camera preview dimensions:', width, 'x', height);
          setPreviewDimensions({ width, height });
        }}
      />

      {/* Overlay UI - Positioned absolutely on top of camera */}
      <View style={styles.cameraOverlay}>
        {/* Logo at top - Large, independent, no background box */}
        <Image
          source={KanDuTogetherLogo}
          style={[styles.headerLogo, { marginTop: insets.top + 4 }]}
          resizeMode="contain"
          onError={(e) => console.log('Logo load error:', e.nativeEvent.error)}
          onLoad={() => console.log('Logo loaded successfully')}
        />

        {/* Action Row - Below Logo */}
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

            <TouchableOpacity
              style={styles.controlToggle}
              onPress={openVoiceSettings}
            >
              <Ionicons name="settings-outline" size={20} color="#ffffff" />
            </TouchableOpacity>

            {/* Manual Pause Button */}
            <TouchableOpacity
              style={[styles.controlToggle, styles.pauseButton]}
              onPress={handleManualPause}
            >
              <Ionicons name="pause" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Bounding Box Highlights - Using PIXELS for proper positioning */}
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
              const labelLeftPx = Math.max(10, centerXPx - 80); // Center label roughly
              const labelTopPx = Math.max(10, circleTopPx - 50); // Above circle

              console.log(`🔵 Highlight #${index}:`, {
                box,
                previewW,
                previewH,
                circleLeftPx,
                circleTopPx,
                circleDiameterPx,
              });

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
                        maxWidth: previewW - labelLeftPx - 20, // Don't overflow right edge
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

        {/* Identity Status Banner */}
        {identityStatus === 'VERIFYING' && (
          <View style={styles.identityBanner}>
            <Ionicons name="scan" size={20} color="#ffffff" />
            <Text style={styles.identityBannerText}>Identifying item...</Text>
          </View>
        )}

        {/* Progress Indicator with Plan Revision Colors */}
        {!isLoadingPlan && identityStatus === 'CONFIRMED' && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBarRow}>
              <View style={styles.progressBar}>
                <View style={[
                  styles.progressFill,
                  {
                    width: `${((currentStepIndex + 1) / repairSteps.length) * 100}%`,
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
            <Text style={styles.progressText}>
              Step {currentStepIndex + 1} of {repairSteps.length}
              {planRevision > 0 ? ' (Updated Plan)' : ''}
            </Text>
          </View>
        )}

        {/* Guidance Box */}
        <View style={styles.guidanceContainer}>
          {isLoadingPlan ? (
            <View style={styles.guidanceBox}>
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
              ) : isAnalyzing && recognitionEnabled ? (
                <View style={styles.analyzingIndicator}>
                  <ActivityIndicator size="small" color="#1E5AA8" />
                  <Text style={styles.analyzingText}>Analyzing...</Text>
                </View>
              ) : null}
              <View
                style={[
                  styles.guidanceBox,
                  {
                    backgroundColor: `rgba(255, 255, 255, ${textBoxOpacity})`,
                  },
                ]}
              >
                <Text style={styles.guidanceText}>{currentGuidance}</Text>
              </View>

              {/* Step Status Indicator */}
              {identityStatus === 'CONFIRMED' && (
                <View style={styles.stepStatusContainer}>
                  <View style={[styles.stepStatusBadge, stepStatus === 'CONFIRMED' || stepStatus === 'OVERRIDDEN' ? styles.stepStatusConfirmed : styles.stepStatusPending]}>
                    <Ionicons
                      name={stepStatus === 'CONFIRMED' || stepStatus === 'OVERRIDDEN' ? 'checkmark-circle' : 'time'}
                      size={16}
                      color={stepStatus === 'CONFIRMED' || stepStatus === 'OVERRIDDEN' ? '#10b981' : '#f59e0b'}
                    />
                    <Text style={[styles.stepStatusText, stepStatus === 'CONFIRMED' || stepStatus === 'OVERRIDDEN' ? styles.stepStatusTextConfirmed : styles.stepStatusTextPending]}>
                      {stepStatus === 'CONFIRMED' ? 'Step Confirmed' : stepStatus === 'OVERRIDDEN' ? 'Manually Confirmed' : 'Waiting for confirmation...'}
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

              {/* Voice Question Button - Always visible once plan is loaded */}
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
              {identityStatus === 'CONFIRMED' && (
                <View style={styles.actionButtonsContainer}>
                  <TouchableOpacity
                    style={[styles.nextStepButton, !canAdvance && styles.nextStepButtonDisabled]}
                    onPress={handleNextStep}
                  >
                    <Text style={styles.nextStepButtonText}>
                      {canAdvance
                        ? (currentStepIndex < repairSteps.length - 1 ? 'Next Step' : 'Finish')
                        : 'I Did This Step'
                      }
                    </Text>
                    <Ionicons name={canAdvance ? 'arrow-forward' : 'checkmark'} size={20} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              )}

            </>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  headerLogo: {
    width: '70%', // Wide but not full width
    height: 120, // Much larger logo
    alignSelf: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 2, // Reduced gap between logo and buttons
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
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFB',
    padding: 40,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E5AA8',
    marginTop: 20,
    marginBottom: 12,
  },
  permissionText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: '#1E5AA8',
    paddingHorizontal: 30,
    paddingVertical: 16,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
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
    backgroundColor: 'rgba(16, 185, 129, 0.9)', // Green when enabled
  },
  // Highlight overlay styles - Bold circle design for clear visibility
  highlightContainer: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999, // Ensure it's above everything
    elevation: 20, // Android elevation
    pointerEvents: 'none',
  },
  // Outer circle - bright green/cyan for high visibility
  highlightCircle: {
    position: 'absolute',
    borderRadius: 9999, // Full circle
    borderWidth: 4,
    borderColor: '#00FF88', // Bright green for visibility
    backgroundColor: 'transparent',
    // Add shadow/glow effect
    shadowColor: '#00FF88',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 10,
  },
  // Inner glow circle
  highlightCircleInner: {
    position: 'absolute',
    borderRadius: 9999,
    borderWidth: 2,
    borderColor: 'rgba(0, 255, 136, 0.4)', // Subtle inner glow
    backgroundColor: 'rgba(0, 255, 136, 0.1)', // Very subtle fill
  },
  // Label bubble positioned above the circle
  highlightLabel: {
    position: 'absolute',
    backgroundColor: '#00FF88', // Bright green background
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    maxWidth: '60%',
    // Shadow for depth
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 8,
  },
  // Arrow pointing down from label to circle
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
    color: '#000000', // Black text on bright green
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    flexWrap: 'wrap',
  },
  identityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginHorizontal: 20,
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
    paddingVertical: 10,
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
  progressText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  analyzingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 90, 168, 0.9)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 10,
    alignSelf: 'center',
  },
  analyzingText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
  },
  guidanceContainer: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
  },
  guidanceBox: {
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    maxWidth: screenWidth - 40,
    position: 'relative',
  },
  guidanceText: {
    flex: 1,
    fontSize: 18,
    color: '#1e293b',
    lineHeight: 26,
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
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 12,
  },
  nextStepButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10b981',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  nextStepButtonDisabled: {
    backgroundColor: '#6b7280',
  },
  nextStepButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Demo Mode styles
  demoContainer: {
    flex: 1,
    backgroundColor: '#1e293b',
  },
  demoCameraView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#334155',
  },
  demoText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 20,
  },
  demoSubtext: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 8,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
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
  // AI Completion Suggestion Modal styles
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
  // Pause Button style
  pauseButton: {
    backgroundColor: 'rgba(245, 158, 11, 0.9)', // Orange/amber for visibility
  },
  // Session Paused Modal styles
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
  viewPlanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    width: '100%',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    gap: 8,
  },
  viewPlanButtonText: {
    fontSize: 15,
    color: '#3b82f6',
    fontWeight: '600',
    flex: 1,
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
  // Item Checklist styles
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
  // Voice Settings Modal styles
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
  // Voice Question Styles
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
  // New Plan Modal Styles
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
  // View Plan Modal Styles
  viewPlanModal: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    width: '95%',
    maxWidth: 400,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  viewPlanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  viewPlanHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  viewPlanTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  viewPlanBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  viewPlanBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  viewPlanProgress: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 16,
  },
  viewPlanStepsList: {
    maxHeight: 350,
    marginBottom: 16,
  },
  viewPlanStepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 4,
    gap: 12,
  },
  viewPlanStepItemCompleted: {
    backgroundColor: '#f1f5f9',
    opacity: 0.7,
  },
  viewPlanStepItemCurrent: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  viewPlanStepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
  },
  viewPlanStepNumberCompleted: {
    backgroundColor: '#10b981',
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
    color: '#1e293b',
    lineHeight: 20,
  },
  viewPlanStepInstructionCompleted: {
    color: '#94a3b8',
    textDecorationLine: 'line-through',
  },
  viewPlanStepTools: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  viewPlanStepToolsText: {
    fontSize: 11,
    color: '#64748b',
  },
  viewPlanCurrentBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 6,
  },
  viewPlanCurrentBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  viewPlanCloseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
    gap: 8,
  },
  viewPlanCloseButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  // Substitute Search Section styles
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
  // Substitute Search Overlay styles
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
  // Substitute Confirmation Modal styles
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
});
