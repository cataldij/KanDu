/**
 * SpotCheckScanner - Live scanning experience with freeze-and-annotate
 * Features:
 * - Live camera preview with scanning animation
 * - KanDu logo at top
 * - Auto-analyze on capture
 * - Freeze frame effect
 * - Hand-drawn annotations with voice narration
 * - VH1-style speech bubbles
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  Easing,
  Alert,
  ActivityIndicator,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import { GoogleGenerativeAI } from '@google/generative-ai';
import AnimatedAnnotation, { Annotation } from './AnimatedAnnotation';
import AnimatedLogo from './AnimatedLogo';

// Dynamic import for speech recognition (only works in dev build)
let ExpoSpeechRecognitionModule: any = null;
try {
  const speechRecognition = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = speechRecognition.ExpoSpeechRecognitionModule;
} catch (e) {
  console.log('[SpotCheck] Speech recognition not available');
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_API_KEY || '');

interface SpotCheckScannerProps {
  onClose: () => void;
  onComplete?: (result: SpotCheckResult) => void;
  context?: string; // Optional context hint (e.g., "cooking", "cleaning")
  // Cooking session context
  recipeName?: string;
  recipeIngredients?: string[];
  currentStepInstruction?: string;
}

export interface SpotCheckResult {
  response: string;
  annotations: Annotation[];
  context: string;
  imageUri: string;
}

type ScannerState = 'scanning' | 'analyzing' | 'result';

// Chat message for conversation history
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Sophisticated prompt that identifies context and provides detailed analysis
interface CookingContext {
  recipeName?: string;
  ingredients?: string[];
  currentStep?: string;
}

const getSpotCheckPrompt = (contextHint?: string, cookingContext?: CookingContext) => {
  // If we have cooking context, create a cooking-specific prompt
  if (cookingContext?.recipeName) {
    return `You are KanDu, a friendly cooking assistant. The user is making "${cookingContext.recipeName}" and wants to check their progress.

RECIPE CONTEXT:
- Recipe: ${cookingContext.recipeName}
- Ingredients they should have: ${cookingContext.ingredients?.join(', ') || 'not specified'}
- Current step: ${cookingContext.currentStep || 'in progress'}

Look at the image and provide helpful cooking feedback:
1. Can you see any of the expected ingredients? If yes, comment on their preparation/state
2. If you don't see the expected ingredients, say "I don't see your ingredients for ${cookingContext.recipeName}, but I notice..." and comment on what you DO see
3. Give specific cooking advice based on what's visible

Return your response as JSON in this EXACT format:
{
  "context": "cooking",
  "contextDetail": "Brief description of what you see",
  "response": "Your conversational response (2-4 sentences). Be warm and helpful. Comment on what you see and give specific advice.",
  "annotations": [
    {
      "id": "1",
      "type": "circle|checkmark|x|arrow|pointer|highlight",
      "x": 50,
      "y": 50,
      "size": 1,
      "color": "green|yellow|red|blue|white",
      "label": "Short label (2-4 words)",
      "voiceText": "What to say when this annotation appears (5-10 words)"
    }
  ]
}

ANNOTATION GUIDELINES:
- Use "checkmark" with green for things that look good
- Use "circle" with yellow/red for things needing attention
- Use "x" with red for problems
- Coordinates are percentages (0-100) where (0,0) is top-left
- Place annotations on the ACTUAL items you're commenting on

Be encouraging and specific. Comment on colors, textures, doneness if visible.

IMPORTANT: Return ONLY valid JSON, no markdown code blocks.`;
  }

  // Default general prompt
  const basePrompt = `You are KanDu, an incredibly helpful AI assistant with the ability to see and understand what users are working on. You're like a knowledgeable friend looking over their shoulder, ready to help.

FIRST: Identify what the user is doing. Look at the image carefully and determine the context:
- Cooking/Food preparation (ingredients, pans, cutting, mixing, etc.)
- Cleaning (surfaces, appliances, floors, etc.)
- DIY/Repair work (tools, parts, fixtures, etc.)
- Organizing (drawers, shelves, closets, etc.)
- Automotive (engine, tires, fluids, etc.)
- Other home tasks

${contextHint ? `HINT: The user may be working on: ${contextHint}` : ''}

THEN: Analyze what you see and provide helpful feedback. Be specific about:
- What looks good (mark with green checkmarks)
- What needs attention (mark with yellow/orange circles)
- What's wrong or problematic (mark with red X)
- Helpful tips or next steps

Your response should feel like a friend giving advice, not a robot listing facts. Be warm, conversational, and specific.

Return your response as JSON in this EXACT format:
{
  "context": "cooking|cleaning|diy|organizing|automotive|other",
  "contextDetail": "Brief description of what you see them doing",
  "response": "Your conversational response. This will be spoken aloud, so make it natural. 2-4 sentences. Address what you see directly.",
  "annotations": [
    {
      "id": "1",
      "type": "circle|checkmark|x|arrow|pointer|highlight",
      "x": 50,
      "y": 50,
      "size": 1,
      "color": "green|yellow|red|blue|white",
      "label": "Short label (2-4 words)",
      "voiceText": "What to say when this annotation appears"
    }
  ]
}

ANNOTATION GUIDELINES:
- Use "checkmark" with green for things that look good
- Use "circle" with yellow/red for things needing attention
- Use "x" with red for problems or mistakes
- Use "arrow" to point between related items
- Use "pointer" for precise locations
- Coordinates are percentages (0-100) where (0,0) is top-left

VOICE TEXT GUIDELINES:
- Each annotation's voiceText should be a short phrase (5-10 words)
- Together they should tell a story: "This looks great... but this needs more time... and don't forget this part"

Be specific and helpful. If you see food, comment on doneness, color, texture. If you see cleaning, comment on spots missed. If you see DIY, comment on alignment, technique, safety.

IMPORTANT: Return ONLY valid JSON, no markdown code blocks or extra text.`;

  return basePrompt;
};

export const SpotCheckScanner: React.FC<SpotCheckScannerProps> = ({
  onClose,
  onComplete,
  context,
  recipeName,
  recipeIngredients,
  currentStepInstruction,
}) => {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [state, setState] = useState<ScannerState>('scanning');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [response, setResponse] = useState<string>('');
  const [detectedContext, setDetectedContext] = useState<string>('');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Voice Q&A state
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing' | 'response'>('idle');
  const [transcript, setTranscript] = useState('');
  const [qaResponse, setQaResponse] = useState<string | null>(null);
  const speechListenerRef = useRef<any>(null);

  // Text chat state
  const [showChat, setShowChat] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isProcessingChat, setIsProcessingChat] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);
  const chatInputAnim = useRef(new Animated.Value(0)).current;

  // Scanning animation
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const freezeAnim = useRef(new Animated.Value(0)).current;
  const qaResponseAnim = useRef(new Animated.Value(0)).current;
  const listeningPulseAnim = useRef(new Animated.Value(1)).current;

  // Start scanning animation
  useEffect(() => {
    if (state === 'scanning') {
      // Scanning line animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Pulse animation for corners
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
  }, [state]);

  // Request camera permission on mount
  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, []);

  const handleCameraReady = () => {
    setIsCameraReady(true);
  };

  // Capture and analyze
  const captureAndAnalyze = async () => {
    if (!cameraRef.current || !isCameraReady) return;

    try {
      // Take photo
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: true,
      });

      if (!photo?.uri) return;

      setCapturedImage(photo.uri);

      // Freeze effect animation
      Animated.timing(freezeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();

      setState('analyzing');

      // Analyze with AI
      const base64 = await FileSystem.readAsStringAsync(photo.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      const cookingContext = recipeName ? {
        recipeName,
        ingredients: recipeIngredients,
        currentStep: currentStepInstruction,
      } : undefined;
      const prompt = getSpotCheckPrompt(context, cookingContext);

      const result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64,
          },
        },
      ]);

      const responseText = result.response.text();
      console.log('[SpotCheck] AI Response:', responseText);

      // Parse response
      let jsonStr = responseText;
      if (jsonStr.includes('```json')) {
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (jsonStr.includes('```')) {
        jsonStr = jsonStr.replace(/```\n?/g, '');
      }
      jsonStr = jsonStr.trim();

      const parsed = JSON.parse(jsonStr);

      // Set response and context
      setResponse(parsed.response || '');
      setDetectedContext(parsed.contextDetail || parsed.context || '');

      // Add staggered delays to annotations
      if (parsed.annotations && Array.isArray(parsed.annotations)) {
        const annotationsWithDelays = parsed.annotations.map((ann: Annotation, idx: number) => ({
          ...ann,
          delay: idx * 400, // 400ms between each annotation
        }));
        setAnnotations(annotationsWithDelays);
      }

      setState('result');

      // Start voice narration after short delay
      setTimeout(() => {
        speakAnnotations(parsed.annotations || [], parsed.response);
      }, 300);

      // Call onComplete callback
      if (onComplete) {
        onComplete({
          response: parsed.response,
          annotations: parsed.annotations || [],
          context: parsed.context || 'other',
          imageUri: photo.uri,
        });
      }

    } catch (error) {
      console.error('[SpotCheck] Error:', error);
      setState('scanning');
      setCapturedImage(null);
    }
  };

  // Speak annotations with voice
  const speakAnnotations = async (anns: Annotation[], mainResponse: string) => {
    setIsSpeaking(true);

    // First, speak any annotation voice texts in sequence
    for (const ann of anns) {
      if (ann.voiceText) {
        await new Promise<void>((resolve) => {
          Speech.speak(ann.voiceText!, {
            language: 'en-US',
            rate: 0.9,
            pitch: 1.0,
            onDone: resolve,
            onError: resolve,
          });
        });
        // Small pause between annotations
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Then speak the main response if no voice texts
    if (anns.every(a => !a.voiceText) && mainResponse) {
      await new Promise<void>((resolve) => {
        Speech.speak(mainResponse, {
          language: 'en-US',
          rate: 0.9,
          pitch: 1.0,
          onDone: resolve,
          onError: resolve,
        });
      });
    }

    setIsSpeaking(false);
  };

  // Handle annotation start for synced voice
  const handleAnnotationStart = (annotation: Annotation, index: number) => {
    // Voice is handled separately in speakAnnotations for better control
  };

  // Reset scanner
  const resetScanner = () => {
    setState('scanning');
    setCapturedImage(null);
    setAnnotations([]);
    setResponse('');
    freezeAnim.setValue(0);
    Speech.stop();
    // Reset Q&A state too
    setVoiceState('idle');
    setQaResponse(null);
    setTranscript('');
    // Reset chat state
    setShowChat(false);
    setTextInput('');
    setChatHistory([]);
  };

  // Voice Q&A animations
  useEffect(() => {
    if (voiceState === 'listening') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(listeningPulseAnim, {
            toValue: 1.2,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(listeningPulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      listeningPulseAnim.setValue(1);
    }
  }, [voiceState]);

  useEffect(() => {
    if (voiceState === 'response' && qaResponse) {
      Animated.spring(qaResponseAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();
    } else if (voiceState === 'idle') {
      qaResponseAnim.setValue(0);
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

  // Cleanup speech recognition listeners
  const cleanupQAListeners = () => {
    if (speechListenerRef.current) {
      if (speechListenerRef.current.result) speechListenerRef.current.result.remove();
      if (speechListenerRef.current.error) speechListenerRef.current.error.remove();
      if (speechListenerRef.current.end) speechListenerRef.current.end.remove();
      speechListenerRef.current = null;
    }
  };

  // Start voice Q&A
  const startVoiceQA = async () => {
    if (!ExpoSpeechRecognitionModule) {
      Alert.alert('Not Available', 'Voice questions require a development build.');
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      Speech.stop(); // Stop any ongoing speech
      setVoiceState('listening');
      setTranscript('');
      setQaResponse(null);

      const { status } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Microphone access is required for voice questions.');
        setVoiceState('idle');
        return;
      }

      const resultListener = ExpoSpeechRecognitionModule.addListener('result', (event: any) => {
        if (event.results && event.results.length > 0) {
          setTranscript(event.results[0]?.transcript || '');
        }
        if (event.isFinal) {
          processSpotCheckQuestion(event.results?.[0]?.transcript || '');
        }
      });

      const errorListener = ExpoSpeechRecognitionModule.addListener('error', () => {
        cleanupQAListeners();
        setVoiceState('idle');
      });

      const endListener = ExpoSpeechRecognitionModule.addListener('end', () => {
        cleanupQAListeners();
        if (voiceState === 'listening' && transcript.length > 3) {
          processSpotCheckQuestion(transcript);
        } else if (voiceState === 'listening') {
          setVoiceState('idle');
        }
      });

      speechListenerRef.current = { result: resultListener, error: errorListener, end: endListener };

      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
      });
    } catch (error) {
      console.error('[SpotCheck] Voice QA error:', error);
      cleanupQAListeners();
      setVoiceState('idle');
    }
  };

  const stopVoiceListening = () => {
    if (ExpoSpeechRecognitionModule) ExpoSpeechRecognitionModule.stop();
    cleanupQAListeners();
    if (transcript.length > 3) {
      processSpotCheckQuestion(transcript);
    } else {
      setVoiceState('idle');
    }
  };

  const processSpotCheckQuestion = async (questionText: string) => {
    if (!questionText.trim() || questionText.length < 3) {
      setVoiceState('idle');
      return;
    }

    setVoiceState('processing');
    cleanupQAListeners();

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      const contextInfo = recipeName
        ? `making "${recipeName}" (${currentStepInstruction || 'in progress'})`
        : detectedContext || 'their current task';

      // If we have the captured image, send it with the question so AI can see what user is asking about
      if (capturedImage) {
        const base64 = await FileSystem.readAsStringAsync(capturedImage, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const visualPrompt = `You are KanDu, a helpful visual assistant. The user is looking at this image while ${contextInfo}.

Previous analysis said: "${response}"

The user now asks: "${questionText}"

IMPORTANT: Look at the ACTUAL IMAGE to answer their question. Point out SPECIFIC things you can see.

Return your response as JSON in this EXACT format:
{
  "response": "Your answer (2-3 sentences). Be specific about what you SEE in the image. Reference visual details.",
  "annotations": [
    {
      "id": "q1",
      "type": "circle|pointer|arrow|highlight",
      "x": 50,
      "y": 50,
      "size": 1.2,
      "color": "cyan",
      "label": "What you're pointing at (2-4 words)",
      "voiceText": "Brief explanation of this point"
    }
  ]
}

ANNOTATION GUIDELINES for Q&A:
- Use CYAN color for discussion annotations (to distinguish from original analysis)
- Place annotations on the EXACT things the user is asking about
- Use "pointer" for precise spots, "circle" to highlight areas, "highlight" for larger regions
- Coordinates are percentages (0-100) where (0,0) is top-left
- Size 1.2-1.5 makes them more prominent than original annotations

If the question doesn't require pointing at anything specific, return empty annotations array.

IMPORTANT: Return ONLY valid JSON, no markdown.`;

        const result = await model.generateContent([
          { text: visualPrompt },
          { inlineData: { mimeType: 'image/jpeg', data: base64 } },
        ]);

        const responseText = result.response.text();
        console.log('[SpotCheck] Q&A Visual Response:', responseText);

        // Parse the response
        let jsonStr = responseText;
        if (jsonStr.includes('```json')) {
          jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonStr.includes('```')) {
          jsonStr = jsonStr.replace(/```\n?/g, '');
        }
        jsonStr = jsonStr.trim();

        try {
          const parsed = JSON.parse(jsonStr);
          setQaResponse(parsed.response || responseText);

          // Add new "discussion" annotations with delays and distinct styling
          if (parsed.annotations && Array.isArray(parsed.annotations) && parsed.annotations.length > 0) {
            const discussionAnnotations = parsed.annotations.map((ann: Annotation, idx: number) => ({
              ...ann,
              id: `discussion-${idx}`,
              delay: idx * 300, // Quick staggered appearance
              isDiscussion: true, // Mark as discussion annotation
              size: ann.size || 1.3, // Make them bigger by default
              color: ann.color || 'cyan', // Cyan for discussion
            }));

            // Replace existing annotations with discussion ones (or layer them)
            setAnnotations(discussionAnnotations);
          }

          setVoiceState('response');
          Speech.speak(parsed.response || responseText, { language: 'en-US', rate: 0.95, pitch: 1.0 });
        } catch (parseError) {
          // If JSON parsing fails, just use the text response
          setQaResponse(responseText);
          setVoiceState('response');
          Speech.speak(responseText, { language: 'en-US', rate: 0.95, pitch: 1.0 });
        }
      } else {
        // Fallback: no image available, just text response
        const textPrompt = `You are KanDu, a helpful assistant. The user just did a spot check while ${contextInfo}.

The spot check analysis said: "${response}"

Now the user asks: "${questionText}"

Give a brief, helpful answer (2-3 sentences max). Be conversational and specific.`;

        const result = await model.generateContent(textPrompt);
        const answerText = result.response.text();
        setQaResponse(answerText);
        setVoiceState('response');
        Speech.speak(answerText, { language: 'en-US', rate: 0.95, pitch: 1.0 });
      }
    } catch (error) {
      console.error('[SpotCheck] Q&A error:', error);
      setQaResponse("Sorry, I couldn't process that. Try again?");
      setVoiceState('response');
    }
  };

  const dismissQAResponse = () => {
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
      Speech.stop();
      setShowChat(true);
      // Scroll to bottom when opening
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: false }), 100);
    }
  };

  // Process text chat message with image context and chat history
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
      const contextInfo = recipeName
        ? `making "${recipeName}" (${currentStepInstruction || 'in progress'})`
        : detectedContext || 'their current task';

      // Build conversation history for context
      const historyText = chatHistory
        .map(msg => `${msg.role === 'user' ? 'User' : 'KanDu'}: ${msg.content}`)
        .join('\n');

      // If we have the captured image, send it with the question
      if (capturedImage) {
        const base64 = await FileSystem.readAsStringAsync(capturedImage, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const visualPrompt = `You are KanDu, a helpful visual assistant. The user is looking at this image while ${contextInfo}.

Initial analysis said: "${response}"

${historyText ? `Previous conversation:\n${historyText}\n` : ''}
User now asks: "${message}"

IMPORTANT: Look at the ACTUAL IMAGE to answer their question. Point out SPECIFIC things you can see.

Return your response as JSON in this EXACT format:
{
  "response": "Your answer (2-3 sentences). Be specific about what you SEE in the image. Reference visual details.",
  "annotations": [
    {
      "id": "chat1",
      "type": "circle|pointer|arrow|highlight",
      "x": 50,
      "y": 50,
      "size": 1.2,
      "color": "cyan",
      "label": "What you're pointing at (2-4 words)",
      "voiceText": "Brief explanation of this point"
    }
  ]
}

ANNOTATION GUIDELINES for chat Q&A:
- Use CYAN color for discussion annotations (to distinguish from original analysis)
- Place annotations on the EXACT things the user is asking about
- Use "pointer" for precise spots, "circle" to highlight areas, "highlight" for larger regions
- Coordinates are percentages (0-100) where (0,0) is top-left
- Size 1.2-1.5 makes them more prominent

If the question doesn't require pointing at anything specific, return empty annotations array.

IMPORTANT: Return ONLY valid JSON, no markdown.`;

        const result = await model.generateContent([
          { text: visualPrompt },
          { inlineData: { mimeType: 'image/jpeg', data: base64 } },
        ]);

        const responseText = result.response.text();
        console.log('[SpotCheck] Chat Visual Response:', responseText);

        // Parse the response
        let jsonStr = responseText;
        if (jsonStr.includes('```json')) {
          jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonStr.includes('```')) {
          jsonStr = jsonStr.replace(/```\n?/g, '');
        }
        jsonStr = jsonStr.trim();

        try {
          const parsed = JSON.parse(jsonStr);
          const assistantResponse = parsed.response || responseText;

          // Add assistant message to history
          setChatHistory(prev => [...prev, { role: 'assistant', content: assistantResponse }]);

          // Add new "discussion" annotations with delays and distinct styling
          if (parsed.annotations && Array.isArray(parsed.annotations) && parsed.annotations.length > 0) {
            const discussionAnnotations = parsed.annotations.map((ann: Annotation, idx: number) => ({
              ...ann,
              id: `chat-${Date.now()}-${idx}`,
              delay: idx * 300,
              isDiscussion: true,
              size: ann.size || 1.3,
              color: ann.color || 'cyan',
            }));
            setAnnotations(discussionAnnotations);
          }
        } catch (parseError) {
          // If JSON parsing fails, just use the text response
          setChatHistory(prev => [...prev, { role: 'assistant', content: responseText }]);
        }
      } else {
        // Fallback: no image available, just text response
        const textPrompt = `You are KanDu, a helpful assistant. The user just did a spot check while ${contextInfo}.

The spot check analysis said: "${response}"

${historyText ? `Previous conversation:\n${historyText}\n` : ''}
User now asks: "${message}"

Give a brief, helpful answer (2-3 sentences max). Be conversational and specific.`;

        const result = await model.generateContent(textPrompt);
        const answerText = result.response.text();
        setChatHistory(prev => [...prev, { role: 'assistant', content: answerText }]);
      }

      // Scroll to bottom after response
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (error) {
      console.error('[SpotCheck] Chat error:', error);
      setChatHistory(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't process that. Try again?" }]);
    } finally {
      setIsProcessingChat(false);
    }
  };

  // Render permission request
  if (!permission?.granted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient
          colors={['#0f172a', '#1e3a5f']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.permissionContainer}>
          <Ionicons name="camera" size={64} color="#ffffff" />
          <Text style={styles.permissionTitle}>Camera Access Needed</Text>
          <Text style={styles.permissionText}>
            KanDu needs camera access to see what you're working on
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}
          >
            <Text style={styles.permissionButtonText}>Enable Camera</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const scanLineTranslate = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, SCREEN_HEIGHT - 200],
  });

  const imageSize = SCREEN_WIDTH - 40;

  return (
    <View style={styles.container}>
      {/* Camera or Frozen Image */}
      {state === 'scanning' ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          onCameraReady={handleCameraReady}
        />
      ) : capturedImage ? (
        <View style={styles.frozenImageContainer}>
          <Image
            source={{ uri: capturedImage }}
            style={styles.frozenImage}
            resizeMode="contain"
          />
          {/* Annotations overlay - matches image container */}
          {state === 'result' && (
            <View style={styles.annotationOverlay}>
              <AnimatedAnnotation
                annotations={annotations}
                imageWidth={SCREEN_WIDTH}
                imageHeight={SCREEN_HEIGHT}
                onAnnotationStart={handleAnnotationStart}
                handDrawn={true}
              />
            </View>
          )}
        </View>
      ) : null}

      {/* Scanning overlay */}
      {state === 'scanning' && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {/* Scanning line */}
          <Animated.View
            style={[
              styles.scanLine,
              { transform: [{ translateY: scanLineTranslate }] },
            ]}
          >
            <LinearGradient
              colors={['transparent', 'rgba(34, 197, 94, 0.5)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.scanLineGradient}
            />
          </Animated.View>

          {/* Corner brackets */}
          <Animated.View
            style={[
              styles.cornerBrackets,
              { transform: [{ scale: pulseAnim }] },
            ]}
          >
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </Animated.View>
        </View>
      )}

      {/* Analyzing overlay */}
      {state === 'analyzing' && (
        <View style={styles.analyzingOverlay}>
          <AnimatedLogo size={100} isLoading={true} traceDuration={3000} />
          <Text style={styles.analyzingText}>Analyzing...</Text>
        </View>
      )}

      {/* Top header with logo */}
      <LinearGradient
        colors={['rgba(0,0,0,0.7)', 'transparent']}
        style={[styles.topOverlay, { paddingTop: insets.top + 10 }]}
        pointerEvents="box-none"
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={28} color="#ffffff" />
          </TouchableOpacity>

          {/* KanDu Logo - hidden during analyzing (centered logo shows instead) */}
          <View style={styles.logoContainer}>
            {state !== 'analyzing' && (
              <AnimatedLogo size={50} isLoading={false} />
            )}
          </View>

          <View style={styles.headerSpacer} />
        </View>

        {state === 'scanning' && (
          <Text style={styles.scanPrompt}>
            Point at what you need help with
          </Text>
        )}
      </LinearGradient>

      {/* Bottom controls */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={[styles.bottomOverlay, { paddingBottom: Math.max(insets.bottom, 20) }]}
        pointerEvents="box-none"
      >
        {state === 'scanning' && (
          <TouchableOpacity
            style={[
              styles.captureButton,
              !isCameraReady && styles.captureButtonDisabled,
            ]}
            onPress={captureAndAnalyze}
            disabled={!isCameraReady}
            activeOpacity={0.8}
          >
            <View style={styles.captureButtonOuter}>
              <View style={styles.captureButtonInner} />
            </View>
          </TouchableOpacity>
        )}

        {state === 'result' && (
          <View style={styles.resultControls}>
            {/* Response card */}
            <View style={styles.responseCard}>
              <View style={styles.responseHeader}>
                <View style={styles.responseAvatar}>
                  <Ionicons name="checkmark-circle" size={20} color="#ffffff" />
                </View>
                <Text style={styles.responseLabel}>KanDu</Text>
                {isSpeaking && (
                  <View style={styles.speakingIndicator}>
                    <Ionicons name="volume-high" size={16} color="#22c55e" />
                  </View>
                )}
              </View>
              <Text style={styles.responseText}>{response}</Text>
              {detectedContext && (
                <Text style={styles.contextBadge}>
                  Detected: {detectedContext}
                </Text>
              )}
            </View>

            {/* Ask KanDu button with voice + text toggle */}
            <View style={styles.askKanduRow}>
              <TouchableOpacity
                style={styles.askKanduButton}
                onPress={startVoiceQA}
                activeOpacity={0.8}
              >
                <Ionicons name="mic" size={18} color="#ffffff" />
                <Text style={styles.askKanduText}>Ask a question</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.chatToggleButton}
                onPress={toggleChat}
                activeOpacity={0.7}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={18} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            </View>

            {/* Action buttons */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.gotItButton}
                onPress={onClose}
                activeOpacity={0.8}
              >
                <Text style={styles.gotItText}>Got it</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.checkAgainButton}
                onPress={resetScanner}
                activeOpacity={0.8}
              >
                <Ionicons name="camera-outline" size={20} color="#3b82f6" />
                <Text style={styles.checkAgainText}>Check again</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </LinearGradient>

      {/* Voice Q&A Overlay */}
      {voiceState !== 'idle' && (
        <View style={styles.voiceOverlay} pointerEvents="box-none">
          {/* Listening state */}
          {voiceState === 'listening' && (
            <TouchableOpacity
              style={styles.listeningOverlay}
              activeOpacity={1}
              onPress={stopVoiceListening}
            >
              <View style={styles.listeningContent}>
                <Animated.View
                  style={[
                    styles.listeningMicContainer,
                    { transform: [{ scale: listeningPulseAnim }] },
                  ]}
                >
                  <LinearGradient
                    colors={['#22c55e', '#16a34a']}
                    style={styles.listeningMic}
                  >
                    <Ionicons name="mic" size={32} color="#ffffff" />
                  </LinearGradient>
                </Animated.View>
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

          {/* Processing state */}
          {voiceState === 'processing' && (
            <View style={styles.processingContainer}>
              <View style={styles.processingBubble}>
                <ActivityIndicator size="small" color="#22c55e" />
                <Text style={styles.processingText}>Thinking...</Text>
              </View>
            </View>
          )}

          {/* Response state */}
          {voiceState === 'response' && qaResponse && (
            <TouchableOpacity
              style={styles.qaResponseOverlay}
              activeOpacity={1}
              onPress={dismissQAResponse}
            >
              <Animated.View
                style={[
                  styles.qaResponseBubble,
                  {
                    transform: [{ scale: qaResponseAnim }],
                    opacity: qaResponseAnim,
                  },
                ]}
              >
                <LinearGradient
                  colors={['rgba(15, 23, 42, 0.95)', 'rgba(30, 58, 95, 0.95)']}
                  style={styles.qaResponseGradient}
                >
                  <View style={styles.qaResponseHeader}>
                    <View style={styles.qaKanduBadge}>
                      <Text style={styles.qaKanduText}>KanDu</Text>
                    </View>
                    <TouchableOpacity onPress={dismissQAResponse}>
                      <Ionicons name="close" size={20} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.qaResponseText}>{qaResponse}</Text>
                  <Text style={styles.qaDismissHint}>Tap to dismiss</Text>
                </LinearGradient>
              </Animated.View>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Text Chat Overlay */}
      {showChat && (
        <KeyboardAvoidingView
          style={styles.chatOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={0}
        >
          <TouchableOpacity
            style={styles.chatBackdrop}
            activeOpacity={1}
            onPress={toggleChat}
          />
          <Animated.View
            style={[
              styles.chatContainer,
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
                <View style={styles.chatKanduBadge}>
                  <Ionicons name="chatbubble-ellipses" size={14} color="#22c55e" />
                  <Text style={styles.chatKanduText}>Chat with KanDu</Text>
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
                    <Ionicons name="image-outline" size={32} color="rgba(255,255,255,0.3)" />
                    <Text style={styles.chatEmptyText}>
                      Ask about anything in the image
                    </Text>
                    <Text style={styles.chatEmptyHint}>
                      I can see what you're looking at and point things out
                    </Text>
                  </View>
                )}
                {chatHistory.map((msg, index) => (
                  <View
                    key={index}
                    style={[
                      styles.chatBubble,
                      msg.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAssistant,
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
                      <ActivityIndicator size="small" color="#22c55e" />
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
                    (!textInput.trim() || isProcessingChat) && styles.chatSendButtonDisabled,
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
    backgroundColor: '#000000',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 20,
    marginBottom: 10,
  },
  permissionText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginBottom: 30,
  },
  permissionButton: {
    backgroundColor: '#22c55e',
    paddingHorizontal: 30,
    paddingVertical: 14,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  frozenImageContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  frozenImage: {
    width: '100%',
    height: '100%',
  },
  annotationOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
  },
  scanLineGradient: {
    flex: 1,
  },
  cornerBrackets: {
    ...StyleSheet.absoluteFillObject,
    margin: 40,
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#22c55e',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },
  analyzingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  analyzingText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 20,
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 30,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
  },
  headerSpacer: {
    width: 44,
  },
  scanPrompt: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 16,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 40,
  },
  captureButton: {
    alignSelf: 'center',
    marginBottom: 20,
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#ffffff',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ffffff',
  },
  resultControls: {
    width: '100%',
  },
  responseCard: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
  },
  responseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  responseAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  responseLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    flex: 1,
  },
  speakingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  responseText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#1e293b',
  },
  contextBadge: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 10,
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  gotItButton: {
    flex: 1,
    backgroundColor: '#22c55e',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  gotItText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  checkAgainButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  checkAgainText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '600',
  },
  // Ask KanDu button
  askKanduButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  askKanduText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  // Voice Q&A overlay styles
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
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transcriptContainer: {
    minHeight: 50,
    marginBottom: 16,
  },
  transcriptText: {
    fontSize: 20,
    fontWeight: '500',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 28,
  },
  transcriptPlaceholder: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  listeningHint: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
  processingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  qaResponseOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  qaResponseBubble: {
    maxHeight: 300,
  },
  qaResponseGradient: {
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  qaResponseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  qaKanduBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  qaKanduText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#22c55e',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  qaResponseText: {
    fontSize: 17,
    fontWeight: '400',
    color: '#ffffff',
    lineHeight: 26,
  },
  qaDismissHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    marginTop: 16,
  },
  // Ask KanDu row with chat toggle
  askKanduRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  chatToggleButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Text chat overlay styles
  chatOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 200,
  },
  chatBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  chatContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
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
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  chatKanduText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#22c55e',
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
    backgroundColor: '#22c55e',
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
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
});

export default SpotCheckScanner;
