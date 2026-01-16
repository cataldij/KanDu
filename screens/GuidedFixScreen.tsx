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
import * as FileSystem from 'expo-file-system';

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

  // Voice Settings State
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  // Refs for modal states to avoid stale closures in interval
  const showVoiceModalRef = useRef(false);
  const showIdentityModalRef = useRef(false);
  const showOverrideModalRef = useRef(false);
  const identityStatusRef = useRef<IdentityStatus>('UNKNOWN');
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

  // Tracking refs
  const cameraRef = useRef<CameraView>(null);
  const frameIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isSpeakingRef = useRef(false);
  const lastGuidanceTimeRef = useRef<number>(0);
  const consecutiveMismatchCount = useRef<number>(0);
  const stepConfirmationWindow = useRef<boolean[]>([]); // Last 3 frame results
  const verificationAttempts = useRef<number>(0);
  const lastQuestionTime = useRef<number>(0);
  const forceConfirmedRef = useRef<boolean>(false); // Skip identity checks after force confirm
  const answerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const MIN_GUIDANCE_INTERVAL = 3000;
  const QUESTION_COOLDOWN = 5000; // 5 seconds between questions
  const MISMATCH_THRESHOLD = 2; // 2 consecutive mismatches = hard block
  const CONFIRMATION_WINDOW_SIZE = 3; // 2-of-3 rule

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
    if (!isLoadingPlan && sessionActive && repairSteps.length > 0 &&
        (identityStatus === 'CONFIRMED' || identityStatus === 'VERIFYING')) {
      // Only start if not already running
      if (!frameIntervalRef.current) {
        startFrameCapture();
      }
    } else {
      // Stop capture if conditions not met
      stopFrameCapture();
    }
    // Don't cleanup on every re-render - only stop when conditions change
  }, [isLoadingPlan, sessionActive, identityStatus, repairSteps.length]);

  // Reset step status when step changes
  useEffect(() => {
    setStepStatus('IN_PROGRESS');
    stepConfirmationWindow.current = [];
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
    identityStatusRef.current = identityStatus;
  }, [identityStatus]);

  useEffect(() => {
    sessionActiveRef.current = sessionActive;
  }, [sessionActive]);

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
      const steps = await generateRepairPlan(category, diagnosisSummary, likelyCause);
      setRepairSteps(steps);

      // Start with identity verification prompt
      const introMessage = "First, let's confirm what we're working on. Point the camera at your item.";
      setCurrentGuidance(introMessage);
      speakGuidance(introMessage);
      setIdentityStatus('VERIFYING');
    } catch (error) {
      console.error('Error loading repair plan:', error);
      Alert.alert('Error', 'Failed to load repair plan. Please try again.');
      navigation.goBack();
    } finally {
      setIsLoadingPlan(false);
    }
  };

  const startFrameCapture = () => {
    if (frameIntervalRef.current) return; // Already running
    frameIntervalRef.current = setInterval(() => {
      captureAndAnalyzeFrame();
    }, 2500); // 2.5 seconds
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
      return;
    }
    if (identityStatusRef.current === 'MISMATCH') {
      return;
    }
    if (showVoiceModalRef.current || showIdentityModalRef.current || showOverrideModalRef.current) {
      return;
    }

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

      const currentStep = repairSteps[currentStepIndex];

      const guidance = await getRealTimeGuidance({
        imageBase64: photo.base64,
        category,
        problemDescription: diagnosisSummary,
        currentStep: currentStepIndex + 1,
        totalSteps: repairSteps.length,
        currentStepInstruction: currentStep.instruction,
        stepContext: currentStep.lookingFor,
        expectedItem: expectedItem || undefined,
        originalImageBase64: originalImageBase64 || undefined,
      });

      handleGuidanceResponse(guidance);
    } catch (error: any) {
      console.error('Error analyzing frame:', error);
    } finally {
      isAnalyzingRef.current = false;
      setIsAnalyzing(false);
    }
  };

  const handleGuidanceResponse = (guidance: GuidanceResponse) => {
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
    if (identityStatus === 'VERIFYING') {
      // During verification phase, we need to identify and confirm the item
      if (guidance.detectedObject) {
        // We detected something - announce it immediately
        setDetectedItem(guidance.detectedObject);

        // Check if it seems like a mismatch based on the diagnosis
        if (guidance.wrongItem && guidance.detectedItemMismatch) {
          // AI thinks this isn't the right item
          console.log('⚠️ First detection mismatch:', guidance.detectedItemMismatch);
          consecutiveMismatchCount.current++;

          if (consecutiveMismatchCount.current >= MISMATCH_THRESHOLD) {
            // Confirmed mismatch - show modal
            console.log('🛑 Identity mismatch confirmed - showing modal');
            setIdentityStatus('MISMATCH');
            stopFrameCapture();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setShowIdentityModal(true);
            speakGuidance(`Hold on. I see a ${guidance.detectedItemMismatch}, but based on your diagnosis, we should be fixing something else. Is this the right item?`, true);
            return;
          } else {
            // First mismatch - announce what we see but keep checking
            const msg = `I see a ${guidance.detectedItemMismatch}. Let me take another look...`;
            setCurrentGuidance(msg);
            speakGuidance(msg);
            return;
          }
        } else {
          // Item matches or no expected mismatch - confirm and proceed
          console.log('✅ Identity confirmed:', guidance.detectedObject);
          consecutiveMismatchCount.current = 0;
          if (!expectedItem) {
            setExpectedItem(guidance.detectedObject);
          }
          setIdentityStatus('CONFIRMED');
          const confirmMsg = `Got it! I can see the ${guidance.detectedObject}. Let's get started.`;
          setCurrentGuidance(confirmMsg);
          speakGuidance(confirmMsg);

          // Now announce step 1
          setTimeout(() => {
            const step1 = repairSteps[0];
            setCurrentGuidance(step1.instruction);
            speakGuidance(`Step 1: ${step1.instruction}`);
          }, 2000);
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

    // === POST-VERIFICATION MISMATCH CHECK (during repair steps) ===
    // Skip if user force confirmed - they've acknowledged the mismatch and want to continue
    if (!forceConfirmedRef.current && guidance.wrongItem && guidance.detectedItemMismatch) {
      consecutiveMismatchCount.current++;
      setDetectedItem(guidance.detectedItemMismatch);
      console.log('⚠️ Identity mismatch detected:', guidance.detectedItemMismatch, 'Expected:', expectedItem, 'Count:', consecutiveMismatchCount.current);

      if (consecutiveMismatchCount.current >= MISMATCH_THRESHOLD) {
        // Hard block - 2 consecutive mismatches
        console.log('🛑 Identity mismatch threshold reached - stopping');
        setIdentityStatus('MISMATCH');
        stopFrameCapture();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setShowIdentityModal(true);
        speakGuidance(`Hold on. This looks like a ${guidance.detectedItemMismatch}, but we're supposed to be fixing ${expectedItem || 'something else'}.`, true);
        return;
      }
    } else if (!forceConfirmedRef.current) {
      // Reset mismatch counter on successful match (only if not force confirmed)
      if (consecutiveMismatchCount.current > 0) {
        console.log('✅ Mismatch counter reset');
      }
      consecutiveMismatchCount.current = 0;
    }

    // === STEP CONFIRMATION GATE ===
    // Track step completion in sliding window (2-of-3 rule)
    stepConfirmationWindow.current.push(guidance.stepComplete);
    if (stepConfirmationWindow.current.length > CONFIRMATION_WINDOW_SIZE) {
      stepConfirmationWindow.current.shift();
    }

    // Check for stable confirmation (2 out of 3)
    const confirmCount = stepConfirmationWindow.current.filter(Boolean).length;
    if (confirmCount >= 2 && stepStatus === 'IN_PROGRESS') {
      setStepStatus('PENDING_CONFIRMATION');
    }

    // If we have stable confirmation, actually confirm
    if (stepStatus === 'PENDING_CONFIRMATION' && confirmCount >= 2) {
      setStepStatus('CONFIRMED');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    // Enforce minimum time between guidance updates
    const now = Date.now();
    if (now - lastGuidanceTimeRef.current < MIN_GUIDANCE_INTERVAL) {
      return;
    }
    lastGuidanceTimeRef.current = now;

    // Update guidance text
    setCurrentGuidance(guidance.instruction);
    speakGuidance(guidance.instruction);

    // Update highlights for visual overlay
    if (guidance.highlights && guidance.highlights.length > 0) {
      console.log('🟢 Setting highlights:', guidance.highlights.length, 'boxes', guidance.highlights);
      setHighlights(guidance.highlights);
    } else {
      console.log('⚪ No highlights in this frame');
      setHighlights([]);
    }
  };

  const speakGuidance = (text: string, urgent: boolean = false) => {
    if (!voiceEnabled && !urgent) return;

    Speech.stop();
    isSpeakingRef.current = false;

    const speechOptions: Speech.SpeechOptions = {
      language: 'en-US',
      pitch: urgent ? voiceSettings.pitch * 1.2 : voiceSettings.pitch,
      rate: urgent ? voiceSettings.rate * 0.95 : voiceSettings.rate,
      onStart: () => {
        isSpeakingRef.current = true;
        console.log('Speech started:', text.substring(0, 50));
      },
      onDone: () => {
        isSpeakingRef.current = false;
        console.log('Speech done');
      },
      onError: (error) => {
        console.error('Speech error:', error);
        isSpeakingRef.current = false;
      },
    };

    // Add voice identifier if selected (note: may not work on all platforms)
    if (voiceSettings.voiceIdentifier) {
      speechOptions.voice = voiceSettings.voiceIdentifier;
    }

    console.log('Attempting to speak:', text.substring(0, 50), 'Voice enabled:', voiceEnabled);
    Speech.speak(text, speechOptions);
  };

  // === IDENTITY MODAL HANDLERS ===
  const handleSwitchItem = () => {
    setShowIdentityModal(false);
    setExpectedItem(detectedItem);
    setIdentityStatus('CONFIRMED');
    consecutiveMismatchCount.current = 0;
    setCurrentStepIndex(0); // Restart from step 1
    setStepStatus('IN_PROGRESS');
    stepConfirmationWindow.current = [];

    const msg = `Okay, switching to ${detectedItem}. Let's start from step 1.`;
    setCurrentGuidance(msg);
    speakGuidance(msg);

    setTimeout(() => {
      startFrameCapture();
      const step1 = repairSteps[0];
      setCurrentGuidance(step1.instruction);
      speakGuidance(`Step 1: ${step1.instruction}`);
    }, 2000);
  };

  const handleInsistCorrect = () => {
    setShowIdentityModal(false);
    verificationAttempts.current++;

    if (verificationAttempts.current >= 2) {
      // Too many failed verifications
      Alert.alert(
        "Can't Verify Item",
        "I'm having trouble confirming your item. For safety, I'll pause guided steps.",
        [
          { text: 'Try Again', onPress: () => { verificationAttempts.current = 0; handleStartVerification(); } },
          { text: 'Continue Anyway', style: 'destructive', onPress: handleForceConfirm },
          { text: 'Exit', onPress: () => navigation.goBack() },
        ]
      );
      return;
    }

    handleStartVerification();
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
    if (currentStepIndex < repairSteps.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);
      const nextInstruction = repairSteps[nextIndex].instruction;
      setCurrentGuidance(nextInstruction);
      speakGuidance(`Step ${nextIndex + 1}: ${nextInstruction}`);
      lastGuidanceTimeRef.current = Date.now();
    } else {
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
    }
  };

  const handleOverrideConfirm = () => {
    setShowOverrideModal(false);
    setStepStatus('OVERRIDDEN');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    advanceToNextStep();
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
      const safetyState = identityStatus === 'CONFIRMED' ? 'SAFE' :
                         identityStatus === 'MISMATCH' ? 'DANGER' : 'UNKNOWN';

      // Call Gemini with strict guardrails
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${process.env.EXPO_PUBLIC_GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                {
                  text: `You are a repair assistant helping with this step: "${currentStep.instruction}"

The user is working on: ${category} - ${diagnosisSummary}
Current safety state: ${safetyState}
Expected item status: ${identityStatus}

User asked: "${question}"

STRICT RULES:
- Answer ONLY about the current step
- Do NOT suggest next steps or alternative repairs
- Do NOT override safety warnings
- Keep response under 30 words
- If identity mismatch, say "Cannot confirm - wrong item detected"
- If unsafe, say "Stop - safety risk detected"
- Be helpful but brief

Respond clearly in 1-2 sentences max.`
                },
                ...(currentFrame ? [{
                  inlineData: {
                    mimeType: 'image/jpeg',
                    data: currentFrame
                  }
                }] : [])
              ]
            }],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: 100,
            }
          })
        }
      );

      const result = await response.json();
      const answer = result.candidates?.[0]?.content?.parts?.[0]?.text ||
                    'Sorry, I could not process that question. Please try again.';

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
              <Text style={styles.stopButtonText}>Stop & Get Help</Text>
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
              This looks like a <Text style={styles.identityModalHighlight}>{detectedItem}</Text>
              {expectedItem && <>, but we're fixing a <Text style={styles.identityModalHighlight}>{expectedItem}</Text></>}.
            </Text>

            <TouchableOpacity style={styles.identityModalButtonPrimary} onPress={handleSwitchItem}>
              <Text style={styles.identityModalButtonPrimaryText}>Switch to {detectedItem}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.identityModalButtonSecondary} onPress={handleInsistCorrect}>
              <Text style={styles.identityModalButtonSecondaryText}>No, it's the {expectedItem || 'correct item'}</Text>
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
      />

      {/* Overlay UI - Positioned absolutely on top of camera */}
      <View style={styles.cameraOverlay}>
        {/* Logo at top */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../assets/KanDu Together Logo 2.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
        </View>

        {/* Action Row - Below Logo */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.stopButton} onPress={handleStopSession}>
            <Ionicons name="close-circle" size={24} color="#ffffff" />
            <Text style={styles.stopButtonText}>Stop & Get Help</Text>
          </TouchableOpacity>

          <View style={styles.actionRowRight}>
            <TouchableOpacity
              style={[styles.controlToggle, flashEnabled && styles.controlToggleActive]}
              onPress={toggleFlash}
            >
              <Ionicons name={flashEnabled ? 'flash' : 'flash-off'} size={22} color="#ffffff" />
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
          </View>
        </View>

        {/* Bounding Box Highlights */}
        {highlights.length > 0 && (
          <View style={styles.highlightContainer}>
            {highlights.map((box, index) => (
              <View
                key={index}
                style={[
                  styles.highlightBox,
                  {
                    left: `${box.x}%`,
                    top: `${box.y}%`,
                    width: `${box.width}%`,
                    height: `${box.height}%`,
                  },
                ]}
              >
                <View style={styles.highlightLabel}>
                  <Text style={styles.highlightLabelText}>{box.label}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Identity Status Banner */}
        {identityStatus === 'VERIFYING' && (
          <View style={styles.identityBanner}>
            <Ionicons name="scan" size={20} color="#ffffff" />
            <Text style={styles.identityBannerText}>Identifying item...</Text>
          </View>
        )}

        {/* Progress Indicator */}
        {!isLoadingPlan && identityStatus === 'CONFIRMED' && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${((currentStepIndex + 1) / repairSteps.length) * 100}%` }]} />
            </View>
            <Text style={styles.progressText}>Step {currentStepIndex + 1} of {repairSteps.length}</Text>
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
              {isAnalyzing && (
                <View style={styles.analyzingIndicator}>
                  <ActivityIndicator size="small" color="#1E5AA8" />
                  <Text style={styles.analyzingText}>Analyzing...</Text>
                </View>
              )}
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
  logoContainer: {
    alignItems: 'center',
    marginTop: -40,
  },
  headerLogo: {
    width: '100%',
    height: 280,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: -120,
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
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
  // Highlight overlay styles
  highlightContainer: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'none',
  },
  highlightBox: {
    position: 'absolute',
    borderWidth: 3,
    borderColor: '#00ff00',
    borderRadius: 8,
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
  },
  highlightLabel: {
    position: 'absolute',
    top: -28,
    left: 0,
    backgroundColor: 'rgba(0, 255, 0, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  highlightLabelText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: 'bold',
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
  progressBar: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
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
});
