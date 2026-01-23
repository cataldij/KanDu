/**
 * DoItScreen - Decision Helper & Action Companion
 * Camera-first experience that removes decision fatigue
 * Includes Spot Check for quick visual/voice checks
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
  Dimensions,
  Modal,
  Alert,
  Image,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { Video as VideoCompressor } from 'react-native-compressor';
import { CameraView, useCameraPermissions } from 'expo-camera';
import HouseIcon from '../components/HouseIcon';
import VideoCompressionModal from '../components/VideoCompressionModal';
import AnimatedLogo from '../components/AnimatedLogo';
import FavoriteButton from '../components/FavoriteButton';
import AnimatedAnnotation, { Annotation, AnnotationType, AnnotationColor } from '../components/AnimatedAnnotation';
import SpotCheckScanner from '../components/SpotCheckScanner';
import CookingSession from '../components/CookingSession';
import { supabase } from '../services/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_API_KEY || '');

// API Keys for image services
const PEXELS_API_KEY = process.env.EXPO_PUBLIC_PEXELS_API_KEY || '';
const UNSPLASH_ACCESS_KEY = process.env.EXPO_PUBLIC_UNSPLASH_ACCESS_KEY || '';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  imageUri?: string;
}

// Recipe/Task option from AI
interface RecipeOption {
  id: string;
  name: string;
  tagline: string;
  time: string;
  difficulty: 'Easy' | 'Medium' | 'Moderate';
  mood?: 'quick' | 'comfort' | 'healthy' | 'creative';
  ingredients: string[];
  steps: string[];
  tips?: string;
  icon: string;
  imageUrl?: string;
}

// Mood filters for cooking
const MOOD_FILTERS = [
  { id: 'all', label: 'All', icon: 'apps' },
  { id: 'quick', label: 'Quick', icon: 'flash' },
  { id: 'comfort', label: 'Comfort', icon: 'heart' },
  { id: 'healthy', label: 'Healthy', icon: 'leaf' },
  { id: 'creative', label: 'Creative', icon: 'sparkles' },
];

// "What are you in the mood for?" suggestions
const MOOD_SUGGESTIONS = [
  { id: 'something-warm', label: 'Something warm', icon: 'flame', color: '#FF6B35' },
  { id: 'light-fresh', label: 'Light & fresh', icon: 'leaf', color: '#10B981' },
  { id: 'kid-friendly', label: 'Kid-friendly', icon: 'happy', color: '#F59E0B' },
  { id: 'use-it-up', label: 'Use it all up', icon: 'trash-bin', color: '#8B5CF6' },
];

// Intent-first tiles - the core verticals
const INTENT_TILES = [
  {
    id: 'cooking',
    icon: 'restaurant',
    label: "Make a meal",
    subtext: 'Scan fridge, get ideas',
    gradient: ['#FF6B35', '#FFA500'] as [string, string],
    cameraPrompt: 'Show me what you have',
    cameraSubtext: 'Scan your fridge or pantry',
  },
  {
    id: 'projects',
    icon: 'hammer',
    label: 'Tackle a project',
    subtext: 'What should I work on?',
    gradient: ['#1E90FF', '#00CBA9'] as [string, string],
    cameraPrompt: 'Show me the space',
    cameraSubtext: 'What area needs attention?',
  },
  {
    id: 'organizing',
    icon: 'grid',
    label: 'Get organized',
    subtext: 'Declutter, reorganize',
    gradient: ['#4A90E2', '#7B68EE'] as [string, string],
    cameraPrompt: 'Show me the mess',
    cameraSubtext: 'Drawer, closet, or room',
  },
  {
    id: 'cleaning',
    icon: 'sparkles',
    label: 'Quick clean',
    subtext: 'What to clean now',
    gradient: ['#00CBA9', '#10B981'] as [string, string],
    cameraPrompt: 'Show me the area',
    cameraSubtext: 'What space needs cleaning?',
  },
];

// Energy options for contextual recommendations
const ENERGY_OPTIONS = [
  { id: 'quick', label: 'Keep it simple', icon: 'flash', subtext: "I'm tired" },
  { id: 'normal', label: "I've got time", icon: 'time', subtext: 'Normal energy' },
];

// Serving size options (for cooking)
const SERVING_OPTIONS = [
  { id: '1', label: '1', subtext: 'Just me' },
  { id: '2', label: '2', subtext: 'Couple' },
  { id: '3-4', label: '3-4', subtext: 'Family' },
  { id: '5+', label: '5+', subtext: 'Crowd' },
];

// Meal type options (for cooking)
const MEAL_TYPE_OPTIONS = [
  { id: 'breakfast', label: 'Breakfast', icon: 'sunny', color: '#F59E0B' },
  { id: 'lunch', label: 'Lunch', icon: 'partly-sunny', color: '#10B981' },
  { id: 'dinner', label: 'Dinner', icon: 'moon', color: '#6366F1' },
  { id: 'snack', label: 'Snack', icon: 'cafe', color: '#EC4899' },
  { id: 'on-the-go', label: 'On the Go', icon: 'car', color: '#F97316' },
];

// Refine options - skill level
const SKILL_LEVEL_OPTIONS = [
  { id: 'beginner', label: 'Beginner', icon: 'school', description: 'Simple techniques only' },
  { id: 'confident', label: 'Confident', icon: 'thumbs-up', description: 'Comfortable in kitchen' },
  { id: 'chef', label: 'Chef Mode', icon: 'star', description: 'Bring on the challenge' },
];

// Refine options - cuisine
const CUISINE_OPTIONS = [
  { id: 'any', label: 'Any Style', icon: 'globe' },
  { id: 'italian', label: 'Italian', icon: 'pizza' },
  { id: 'mexican', label: 'Mexican', icon: 'flame' },
  { id: 'asian', label: 'Asian', icon: 'restaurant' },
  { id: 'american', label: 'American', icon: 'fast-food' },
  { id: 'mediterranean', label: 'Mediterranean', icon: 'leaf' },
];

// Refine options - dietary restrictions
const DIETARY_OPTIONS = [
  { id: 'vegetarian', label: 'Vegetarian', icon: 'leaf' },
  { id: 'vegan', label: 'Vegan', icon: 'nutrition' },
  { id: 'gluten-free', label: 'Gluten-Free', icon: 'warning' },
  { id: 'dairy-free', label: 'Dairy-Free', icon: 'water' },
  { id: 'low-carb', label: 'Low Carb', icon: 'trending-down' },
  { id: 'high-protein', label: 'High Protein', icon: 'fitness' },
];

type FlowState = 'welcome' | 'capture' | 'liveScan' | 'review' | 'analyzing' | 'options' | 'detail' | 'spotcheck' | 'spotcheck_result';

export default function DoItScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'DoIt'>>();
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  // Flow state
  const [flowState, setFlowState] = useState<FlowState>('welcome');
  const [activeIntent, setActiveIntent] = useState<typeof INTENT_TILES[0] | null>(null);
  const [selectedEnergy, setSelectedEnergy] = useState<string | null>(null);
  const [selectedServings, setSelectedServings] = useState<string | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<string | null>(null);
  const [showContextPicker, setShowContextPicker] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<typeof INTENT_TILES[0] | null>(null);

  // Media state
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedVideo, setCapturedVideo] = useState<string | null>(null);
  const [_showMediaOptions, setShowMediaOptions] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionProgress, setCompressionProgress] = useState(0);
  const [compressionStatus, setCompressionStatus] = useState<'compressing' | 'complete' | 'error'>('compressing');

  // Multi-shot scan state
  const [isScanning, setIsScanning] = useState(false);
  const [scannedFrames, setScannedFrames] = useState<string[]>([]);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pressStartTimeRef = useRef<number>(0);
  const isLongPressRef = useRef<boolean>(false);

  // Options state (replaces chat)
  const [recipeOptions, setRecipeOptions] = useState<RecipeOption[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeOption | null>(null);
  const [activeMoodFilter, setActiveMoodFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [loadingRecipeImage, setLoadingRecipeImage] = useState(false);

  // Refine options state
  const [showRefineModal, setShowRefineModal] = useState(false);
  const [selectedSkillLevel, setSelectedSkillLevel] = useState<string | null>(null);
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [selectedDietary, setSelectedDietary] = useState<string[]>([]);
  const [feedbackText, setFeedbackText] = useState('');
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Legacy state (keeping for compatibility during transition)
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);

  // Spot Check annotations state
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [spotCheckResponse, setSpotCheckResponse] = useState<string | null>(null);
  const [spotCheckQuestion, setSpotCheckQuestion] = useState<string>('');
  const [showSpotCheckScanner, setShowSpotCheckScanner] = useState(false);
  const [showCookingSession, setShowCookingSession] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  // Handle navigation from Favorites - show recipe detail directly
  useEffect(() => {
    const favoriteRecipe = route.params?.favoriteRecipe;
    if (favoriteRecipe) {
      // Set the cooking intent as active
      const cookingIntent = INTENT_TILES.find(t => t.id === 'cooking');
      if (cookingIntent) {
        setActiveIntent(cookingIntent);
      }
      // Set the recipe and go directly to detail view
      setSelectedRecipe(favoriteRecipe as RecipeOption);
      setFlowState('detail');
    }
  }, [route.params?.favoriteRecipe]);

  // Get the AI prompt based on intent and energy
  const getAnalysisPrompt = (intent: string, energy: string, servings?: string | null, mealType?: string | null) => {
    const energyContext = energy === 'quick'
      ? 'The user is TIRED and wants the EASIEST option. Minimize effort, time, and cleanup.'
      : 'The user has normal energy and can handle moderate effort.';

    const servingsContext = servings
      ? `SERVING SIZE: Make enough for ${servings === '5+' ? '5 or more people' : servings === '3-4' ? '3-4 people' : servings === '2' ? '2 people' : '1 person (single serving)'}. Adjust portions accordingly.`
      : '';

    const mealTypeContext = mealType
      ? `MEAL TYPE: This is for ${mealType === 'on-the-go' ? 'an ON-THE-GO meal (portable, easy to eat, no utensils needed ideally)' : mealType === 'breakfast' ? 'BREAKFAST (morning-appropriate, energizing)' : mealType === 'lunch' ? 'LUNCH (midday meal, satisfying but not too heavy)' : mealType === 'dinner' ? 'DINNER (evening meal, can be more elaborate)' : 'a SNACK (light, quick to prepare, smaller portion)'}. Suggest appropriate dishes for this meal type.`
      : '';

    const prompts: Record<string, string> = {
      cooking: `You are KanDu, a friendly cooking assistant. Analyze this image of ingredients/fridge/pantry.

${energyContext}
${servingsContext}
${mealTypeContext}

Give exactly 3 meal options based on the visible ingredients. Return ONLY valid JSON, no markdown.

JSON FORMAT (return exactly this structure):
{
  "options": [
    {
      "id": "1",
      "name": "Dish Name",
      "tagline": "Short catchy description (5-8 words)",
      "time": "20 min",
      "difficulty": "Easy",
      "mood": "comfort",
      "ingredients": ["ingredient 1", "ingredient 2", "ingredient 3"],
      "steps": ["Step 1 instruction", "Step 2 instruction", "Step 3 instruction"],
      "tips": "Optional pro tip"
    }
  ]
}

RULES:
1. Return EXACTLY 3 options - varied styles (quick, comfort, healthy/creative)
2. difficulty must be "Easy", "Medium", or "Moderate"
3. mood must be one of: "quick", "comfort", "healthy", "creative"
4. Use ONLY ingredients visible in the image (be creative!)
5. Keep steps simple and actionable (3-6 steps each)
6. ${servings ? `All recipes should serve ${servings === '5+' ? '5+' : servings}` : 'Assume cooking for 2 people'}
7. If ingredients are limited, suggest simpler dishes`,

      projects: `You are KanDu, a helpful home project assistant. Analyze this image of the space/area.

${energyContext}

RULES:
1. Pick exactly ONE project or task to focus on
2. Be specific about what you see that needs attention
3. Keep it SHORT (3-4 sentences max)
4. Start with what to tackle
5. Include the first step
6. End with approximate time needed

Format:
**[Project/Task]**
[Why this is the right thing to tackle]
**First step:** [What to do right now]
**Time:** [X minutes]`,

      organizing: `You are KanDu, an organizing assistant. Analyze this image of the messy space.

${energyContext}

RULES:
1. Pick exactly ONE organizing approach - don't overwhelm with options
2. Focus on quick visual improvement
3. Keep it SHORT (3-4 sentences max)
4. "Good enough" beats "perfect"
5. Include the first step
6. End with approximate time needed

Format:
**[Organizing Task]**
[Simple system to follow]
**First step:** [What to do right now]
**Time:** [X minutes]`,

      cleaning: `You are KanDu, a cleaning assistant. Analyze this image of the space.

${energyContext}

RULES:
1. Pick exactly ONE area/task - highest visual impact
2. ${energy === 'quick' ? 'Focus on "guest ready" visible areas only' : 'Can suggest more thorough cleaning'}
3. Keep it SHORT (3-4 sentences max)
4. Be specific about what you see
5. Include the first step
6. End with approximate time needed

Format:
**[Cleaning Task]**
[Why this is the priority]
**First step:** [What to do right now]
**Time:** [X minutes]`,
    };

    return prompts[intent] || prompts.cooking;
  };

  // Analyze the captured image
  const analyzeImage = async (imageUri: string) => {
    if (!activeIntent || !selectedEnergy) return;

    // Ensure the image is in scannedFrames for later regeneration
    setScannedFrames(prev => {
      if (!prev.includes(imageUri)) {
        return [imageUri];
      }
      return prev;
    });

    setFlowState('analyzing');
    setLoading(true);

    try {
      // Read image as base64
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      const prompt = getAnalysisPrompt(activeIntent.id, selectedEnergy, selectedServings, selectedMealType);

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
      console.log('[DoIt] AI Response:', responseText);

      // For cooking, parse JSON response
      if (activeIntent.id === 'cooking') {
        try {
          // Clean up response - remove markdown code blocks if present
          let jsonStr = responseText;
          if (jsonStr.includes('```json')) {
            jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
          } else if (jsonStr.includes('```')) {
            jsonStr = jsonStr.replace(/```\n?/g, '');
          }
          jsonStr = jsonStr.trim();

          const parsed = JSON.parse(jsonStr);
          if (parsed.options && Array.isArray(parsed.options)) {
            // Add icon based on mood
            const optionsWithIcons = parsed.options.map((opt: RecipeOption, idx: number) => ({
              ...opt,
              id: String(idx + 1),
              icon: opt.mood === 'quick' ? 'flash' : opt.mood === 'comfort' ? 'heart' : opt.mood === 'healthy' ? 'leaf' : 'sparkles',
            }));
            setRecipeOptions(optionsWithIcons);
            setSelectedRecipe(null);
            setActiveMoodFilter('all');
          }
        } catch (parseError) {
          console.error('JSON parse error:', parseError);
          console.log('Raw response that failed to parse:', responseText.substring(0, 200));
          // Fallback: try to extract something useful from the text
          // Split by common delimiters to create steps
          const lines = responseText
            .replace(/```[\s\S]*?```/g, '') // Remove code blocks
            .replace(/\*\*/g, '') // Remove bold markers
            .split(/\n+/)
            .filter(line => line.trim().length > 10 && !line.includes('{') && !line.includes('}'))
            .slice(0, 6);

          setRecipeOptions([{
            id: '1',
            name: 'Recipe Suggestion',
            tagline: 'Based on your ingredients',
            time: '30 min',
            difficulty: 'Easy',
            ingredients: ['Check your fridge for ingredients'],
            steps: lines.length > 0 ? lines : ['Follow the AI suggestions to prepare your meal'],
            icon: 'restaurant',
          }]);
        }
      }

      setRecommendation(responseText);
      setFlowState('options');

    } catch (error) {
      console.error('Analysis error:', error);
      Alert.alert('Analysis Failed', 'Could not analyze the image. Please try again.');
      setFlowState('capture');
    } finally {
      setLoading(false);
    }
  };

  // Spot Check analysis - analyzes image and returns visual annotations
  const analyzeSpotCheck = async (imageUri: string, question: string) => {
    setFlowState('analyzing');
    setLoading(true);
    setSpotCheckQuestion(question);
    setAnnotations([]);

    try {
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      // Prompt that asks AI to return annotations with coordinates
      const prompt = `You are KanDu, an AI assistant helping someone with a cooking task. They are showing you an image and asking: "${question}"

Analyze the image and provide:
1. A brief spoken response (2-3 sentences, conversational tone)
2. Visual annotations to highlight specific areas on the image

Return your response as JSON in this exact format:
{
  "response": "Your conversational response here",
  "annotations": [
    {
      "id": "1",
      "type": "circle|checkmark|x|arrow|pointer|highlight",
      "x": 50,
      "y": 50,
      "size": 1,
      "color": "green|yellow|red|blue|white",
      "label": "Optional text label"
    }
  ]
}

Annotation types:
- "circle": Draw attention to an area (use yellow/red for issues, green for good)
- "checkmark": Mark something as good/done (use green)
- "x": Mark something as wrong/problem (use red)
- "arrow": Point from one area to another (requires toX, toY)
- "pointer": Pin/marker on exact spot
- "highlight": Soft highlight/glow on area

Coordinates are percentages (0-100) of image width/height, where (0,0) is top-left.

Be specific and helpful. If checking food doneness, indicate which parts are done vs need more time.
If multiple items, annotate each one.

IMPORTANT: Return ONLY valid JSON, no markdown code blocks.`;

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

      try {
        // Clean up response - remove markdown code blocks if present
        let jsonStr = responseText;
        if (jsonStr.includes('```json')) {
          jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
        } else if (jsonStr.includes('```')) {
          jsonStr = jsonStr.replace(/```\n?/g, '');
        }
        jsonStr = jsonStr.trim();

        const parsed = JSON.parse(jsonStr);

        if (parsed.response) {
          setSpotCheckResponse(parsed.response);
        }

        if (parsed.annotations && Array.isArray(parsed.annotations)) {
          // Add staggered delays for animation sequence
          const annotationsWithDelays = parsed.annotations.map((ann: Annotation, idx: number) => ({
            ...ann,
            delay: idx * 300, // 300ms between each annotation
          }));
          setAnnotations(annotationsWithDelays);
        }

        setFlowState('spotcheck_result');

      } catch (parseError) {
        console.error('JSON parse error:', parseError);
        // Fallback: just show the text response without annotations
        setSpotCheckResponse(responseText);
        setAnnotations([]);
        setFlowState('spotcheck_result');
      }

    } catch (error) {
      console.error('Spot check error:', error);
      Alert.alert('Analysis Failed', 'Could not analyze the image. Please try again.');
      setFlowState('capture');
    } finally {
      setLoading(false);
    }
  };

  // Start a spot check from camera
  const startSpotCheck = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow camera access');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]) {
        setCapturedImage(result.assets[0].uri);
        // For now, use a default question - later integrate voice input
        await analyzeSpotCheck(result.assets[0].uri, 'Does this look done?');
      }
    } catch (error) {
      console.error('Spot check camera error:', error);
      Alert.alert('Error', 'Failed to open camera');
    }
  };

  // Camera/media functions
  const takePhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow camera access');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]) {
        setCapturedImage(result.assets[0].uri);
        setShowMediaOptions(false);
        // Auto-analyze after capture
        await analyzeImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Camera error:', error);
      Alert.alert('Error', 'Failed to open camera');
    }
  };

  const pickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow photo access');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]) {
        setCapturedImage(result.assets[0].uri);
        setCapturedVideo(null);
        setShowMediaOptions(false);
        // Auto-analyze after selection
        await analyzeImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Gallery error:', error);
      Alert.alert('Error', 'Failed to open gallery');
    }
  };

  // Video constants
  const TARGET_VIDEO_SIZE_MB = 6;
  const MAX_FILE_SIZE_BYTES = 7 * 1024 * 1024;

  // Get local file URI for iOS videos from Photos library
  const getLocalVideoUri = async (uri: string): Promise<string> => {
    if (Platform.OS !== 'ios') {
      return uri;
    }

    if (uri.startsWith('file://')) {
      return uri;
    }

    console.log('Converting iOS video URI to local file...', uri.substring(0, 50));

    try {
      if (uri.startsWith('ph://')) {
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status === 'granted') {
          const assetId = uri.replace('ph://', '').split('/')[0];
          try {
            const asset = await MediaLibrary.getAssetInfoAsync(assetId);
            if (asset && asset.localUri) {
              return asset.localUri;
            }
          } catch (assetError) {
            console.log('MediaLibrary.getAssetInfoAsync failed, trying copy fallback...');
          }
        }
      }

      const filename = `video_${Date.now()}.mp4`;
      const destUri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.copyAsync({ from: uri, to: destUri });

      const info = await FileSystem.getInfoAsync(destUri);
      if (info.exists && 'size' in info && info.size && info.size > 1000) {
        return destUri;
      }
      throw new Error('Video copy produced invalid file');
    } catch (error) {
      console.error('Error getting local video URI:', error);
      throw new Error('Could not access video from Photos library');
    }
  };

  // Compress video to target size
  const compressVideo = async (uri: string): Promise<string> => {
    try {
      let workingUri = await getLocalVideoUri(uri);

      const fileInfo = await FileSystem.getInfoAsync(workingUri);
      if (!fileInfo.exists || !('size' in fileInfo) || !fileInfo.size) {
        return workingUri;
      }

      const fileSizeMB = fileInfo.size / (1024 * 1024);
      console.log(`Original video size: ${fileSizeMB.toFixed(2)} MB`);

      if (fileInfo.size <= MAX_FILE_SIZE_BYTES) {
        return workingUri;
      }

      setIsCompressing(true);
      setCompressionProgress(0);
      setCompressionStatus('compressing');

      const compressionRatio = TARGET_VIDEO_SIZE_MB / fileSizeMB;
      let quality: 'low' | 'medium' | 'high' = 'medium';
      if (compressionRatio < 0.3) {
        quality = 'low';
      } else if (compressionRatio < 0.6) {
        quality = 'medium';
      } else {
        quality = 'high';
      }

      const compressedUri = await VideoCompressor.compress(
        workingUri,
        {
          compressionMethod: 'auto',
          maxSize: 720,
          bitrate: quality === 'low' ? 1000000 : quality === 'medium' ? 2000000 : 3000000,
        },
        (progress) => {
          setCompressionProgress(progress);
        }
      );

      const compressedInfo = await FileSystem.getInfoAsync(compressedUri);
      if (compressedInfo.exists && 'size' in compressedInfo && compressedInfo.size) {
        if (compressedInfo.size > MAX_FILE_SIZE_BYTES && quality !== 'low') {
          const recompressedUri = await VideoCompressor.compress(
            compressedUri,
            {
              compressionMethod: 'auto',
              maxSize: 480,
              bitrate: 800000,
            },
            (progress) => {
              setCompressionProgress(0.5 + progress * 0.5);
            }
          );
          setCompressionStatus('complete');
          setTimeout(() => setIsCompressing(false), 800);
          return recompressedUri;
        }
      }

      setCompressionStatus('complete');
      setTimeout(() => setIsCompressing(false), 800);
      return compressedUri;
    } catch (error) {
      console.error('Video compression error:', error);
      setCompressionStatus('error');
      setTimeout(() => setIsCompressing(false), 1500);
      throw error;
    }
  };

  // Analyze video with Gemini
  const analyzeVideo = async (videoUri: string) => {
    if (!activeIntent || !selectedEnergy) return;

    setFlowState('analyzing');
    setLoading(true);

    try {
      const base64 = await FileSystem.readAsStringAsync(videoUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      const prompt = getAnalysisPrompt(activeIntent.id, selectedEnergy, selectedServings, selectedMealType);

      const result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: 'video/mp4',
            data: base64,
          },
        },
      ]);

      const responseText = result.response.text();
      setRecommendation(responseText);

      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: `[Scanned video of ${activeIntent.id === 'cooking' ? 'fridge/pantry' : 'area'}]`,
        timestamp: new Date(),
      };

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date(),
      };

      setMessages([userMessage, assistantMessage]);
      setFlowState('options');
    } catch (error) {
      console.error('Video analysis error:', error);
      Alert.alert('Analysis Failed', 'Could not analyze the video. Please try again.');
      setFlowState('capture');
    } finally {
      setLoading(false);
    }
  };

  // Record video with camera
  const recordVideo = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow camera access');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        quality: 1,
        videoMaxDuration: 60,
      });

      if (!result.canceled && result.assets?.[0]) {
        try {
          const compressedUri = await compressVideo(result.assets[0].uri);
          setCapturedVideo(compressedUri);
          setCapturedImage(null);
          setShowMediaOptions(false);
          await analyzeVideo(compressedUri);
        } catch (error) {
          Alert.alert('Video Processing Failed', 'Could not process the video. Please try again.');
        }
      }
    } catch (error) {
      console.error('Record video error:', error);
      Alert.alert('Error', 'Failed to open camera');
    }
  };

  // Pick video from gallery
  const pickVideo = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow photo access');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['videos'],
        allowsEditing: false,
        quality: 0.8,
        legacy: true,
        presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN,
      });

      if (!result.canceled && result.assets?.[0]) {
        try {
          const compressedUri = await compressVideo(result.assets[0].uri);
          setCapturedVideo(compressedUri);
          setCapturedImage(null);
          setShowMediaOptions(false);
          await analyzeVideo(compressedUri);
        } catch (error) {
          Alert.alert('Video Processing Failed', 'Could not process the video. Please try again.');
        }
      }
    } catch (error: any) {
      console.error('Pick video error:', error);
      if (error?.message?.includes('3164')) {
        Alert.alert(
          'Video Access Issue',
          'iOS is having trouble accessing your videos. Try recording a new video instead.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Failed to open gallery');
      }
    }
  };

  // Live Scan - opens real-time camera view
  const startLiveScan = async () => {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Please allow camera access to use Live Scan');
        return;
      }
    }
    setScannedFrames([]); // Reset frames when entering live scan
    setIsCameraReady(false); // Reset camera ready state
    setFlowState('liveScan');
  };

  // Analyze multiple images with Gemini
  const analyzeMultipleImages = async (imageUris: string[]) => {
    if (!activeIntent || !selectedEnergy || imageUris.length === 0) return;

    setFlowState('analyzing');
    setLoading(true);

    try {
      // Read all images as base64
      const imagePromises = imageUris.map(async (uri) => {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return {
          inlineData: {
            mimeType: 'image/jpeg',
            data: base64,
          },
        };
      });

      const imageData = await Promise.all(imagePromises);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      // Modified prompt for multi-image analysis
      const energyContext = selectedEnergy === 'quick'
        ? 'The user is TIRED and wants the EASIEST option. Minimize effort, time, and cleanup.'
        : 'The user has normal energy and can handle moderate effort.';

      const servingsContext = selectedServings
        ? `SERVING SIZE: Make enough for ${selectedServings === '5+' ? '5 or more people' : selectedServings === '3-4' ? '3-4 people' : selectedServings === '2' ? '2 people' : '1 person (single serving)'}.`
        : '';

      const mealTypeContext = selectedMealType
        ? `MEAL TYPE: This is for ${selectedMealType === 'on-the-go' ? 'an ON-THE-GO meal (portable, easy to eat, no utensils needed ideally)' : selectedMealType === 'breakfast' ? 'BREAKFAST (morning-appropriate, energizing)' : selectedMealType === 'lunch' ? 'LUNCH (midday meal, satisfying but not too heavy)' : selectedMealType === 'dinner' ? 'DINNER (evening meal, can be more elaborate)' : 'a SNACK (light, quick to prepare, smaller portion)'}. Suggest appropriate dishes for this meal type.`
        : '';

      const multiImagePrompt = activeIntent.id === 'cooking'
        ? `You are KanDu, a friendly cooking assistant. I'm showing you ${imageUris.length} images of my kitchen - this might include my fridge, pantry, cabinets, or counters.

${energyContext}
${servingsContext}
${mealTypeContext}

Look at ALL the images together to see everything available. Give exactly 3 meal options based on visible ingredients. Return ONLY valid JSON, no markdown.

JSON FORMAT (return exactly this structure):
{
  "options": [
    {
      "id": "1",
      "name": "Dish Name",
      "tagline": "Short catchy description (5-8 words)",
      "time": "20 min",
      "difficulty": "Easy",
      "mood": "comfort",
      "ingredients": ["ingredient 1", "ingredient 2", "ingredient 3"],
      "steps": ["Step 1 instruction", "Step 2 instruction", "Step 3 instruction"],
      "tips": "Optional pro tip"
    }
  ]
}

RULES:
1. Return EXACTLY 3 options - varied styles (quick, comfort, healthy/creative)
2. difficulty must be "Easy", "Medium", or "Moderate"
3. mood must be one of: "quick", "comfort", "healthy", "creative"
4. Use ONLY ingredients visible across ALL images (be creative!)
5. Keep steps simple and actionable (3-6 steps each)
6. ${selectedServings ? `All recipes should serve ${selectedServings === '5+' ? '5+' : selectedServings}` : 'Assume cooking for 2 people'}
7. If ingredients are limited, suggest simpler dishes
8. ${selectedMealType ? `All suggestions must be appropriate for ${selectedMealType}` : 'Suggest dinner options by default'}`
        : `You are KanDu, helping with ${activeIntent.id}. I'm showing you ${imageUris.length} images of different areas/angles.

${energyContext}

RULES:
1. Look at ALL the images together to understand the full scope
2. Pick exactly ONE task/project that addresses what you see
3. Be specific about what needs attention
4. Keep it SHORT (3-4 sentences max)
5. Include the first step
6. End with approximate time needed

Format:
**[Task/Project]**
[Why this is the right thing to tackle based on all images]
**First step:** [What to do right now]
**Time:** [X minutes]`;

      const result = await model.generateContent([
        { text: multiImagePrompt },
        ...imageData,
      ]);

      const responseText = result.response.text();
      console.log('[DoIt] Multi-image AI Response:', responseText);

      // For cooking, parse JSON response
      if (activeIntent.id === 'cooking') {
        try {
          // Clean up response - remove markdown code blocks if present
          let jsonStr = responseText;
          if (jsonStr.includes('```json')) {
            jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
          } else if (jsonStr.includes('```')) {
            jsonStr = jsonStr.replace(/```\n?/g, '');
          }
          jsonStr = jsonStr.trim();

          const parsed = JSON.parse(jsonStr);
          if (parsed.options && Array.isArray(parsed.options)) {
            // Add icon based on mood
            const optionsWithIcons = parsed.options.map((opt: RecipeOption, idx: number) => ({
              ...opt,
              id: String(idx + 1),
              icon: opt.mood === 'quick' ? 'flash' : opt.mood === 'comfort' ? 'heart' : opt.mood === 'healthy' ? 'leaf' : 'sparkles',
            }));
            setRecipeOptions(optionsWithIcons);
            setSelectedRecipe(null);
            setActiveMoodFilter('all');
          }
        } catch (parseError) {
          console.error('JSON parse error:', parseError);
          console.log('Raw response that failed to parse:', responseText.substring(0, 200));
          // Fallback: try to extract something useful from the text
          const lines = responseText
            .replace(/```[\s\S]*?```/g, '') // Remove code blocks
            .replace(/\*\*/g, '') // Remove bold markers
            .split(/\n+/)
            .filter(line => line.trim().length > 10 && !line.includes('{') && !line.includes('}'))
            .slice(0, 6);

          setRecipeOptions([{
            id: '1',
            name: 'Recipe Suggestion',
            tagline: 'Based on your ingredients',
            time: '30 min',
            difficulty: 'Easy',
            ingredients: ['Check your fridge for ingredients'],
            steps: lines.length > 0 ? lines : ['Follow the AI suggestions to prepare your meal'],
            icon: 'restaurant',
          }]);
        }
      }

      setRecommendation(responseText);
      setFlowState('options');
    } catch (error) {
      console.error('Multi-image analysis error:', error);
      Alert.alert('Analysis Failed', 'Could not analyze the images. Please try again.');
      setFlowState('liveScan');
    } finally {
      setLoading(false);
    }
  };

  // Regenerate recipes with refinements or feedback
  const regenerateWithRefinements = async (feedback?: string) => {
    console.log('[DoIt] Regenerating with scannedFrames:', scannedFrames.length, 'activeIntent:', activeIntent?.id);

    if (!activeIntent) {
      Alert.alert('Error', 'No active intent found. Please start over.');
      return;
    }

    if (scannedFrames.length === 0) {
      Alert.alert('Error', 'No images found. Please scan your ingredients again.');
      return;
    }

    setIsRegenerating(true);
    setShowRefineModal(false);
    console.log('[DoIt] Starting regeneration with refinements...');

    try {
      // Build refinement context
      const skillContext = selectedSkillLevel
        ? `SKILL LEVEL: User is a ${selectedSkillLevel === 'beginner' ? 'BEGINNER - use only simple techniques, no fancy equipment, explain everything clearly' : selectedSkillLevel === 'confident' ? 'CONFIDENT cook - can handle moderate complexity' : 'SKILLED CHEF - bring on complex techniques and creative challenges'}.`
        : '';

      const cuisineContext = selectedCuisine && selectedCuisine !== 'any'
        ? `CUISINE PREFERENCE: Focus on ${selectedCuisine.toUpperCase()} style dishes.`
        : '';

      const dietaryContext = selectedDietary.length > 0
        ? `DIETARY RESTRICTIONS: Must be ${selectedDietary.join(', ')}. Do NOT include any ingredients that violate these restrictions.`
        : '';

      const feedbackContext = feedback
        ? `USER FEEDBACK: "${feedback}" - Please take this into account and suggest different options.`
        : '';

      const energyContext = selectedEnergy === 'quick'
        ? 'The user is TIRED and wants the EASIEST option. Minimize effort, time, and cleanup.'
        : 'The user has normal energy and can handle moderate effort.';

      const servingsContext = selectedServings
        ? `SERVING SIZE: Make enough for ${selectedServings === '5+' ? '5 or more people' : selectedServings === '3-4' ? '3-4 people' : selectedServings === '2' ? '2 people' : '1 person'}.`
        : '';

      const mealTypeContext = selectedMealType
        ? `MEAL TYPE: This is for ${selectedMealType.toUpperCase()}.`
        : '';

      // Read images
      const imagePromises = scannedFrames.map(async (uri) => {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return { inlineData: { mimeType: 'image/jpeg', data: base64 } };
      });

      const imageData = await Promise.all(imagePromises);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      const refinedPrompt = `You are KanDu, a friendly cooking assistant. I'm showing you ${scannedFrames.length} images of my kitchen.

${energyContext}
${servingsContext}
${mealTypeContext}
${skillContext}
${cuisineContext}
${dietaryContext}
${feedbackContext}

The user wants DIFFERENT options than before. Give exactly 3 NEW meal options. Return ONLY valid JSON, no markdown.

JSON FORMAT:
{
  "options": [
    {
      "id": "1",
      "name": "Dish Name",
      "tagline": "Short catchy description (5-8 words)",
      "time": "20 min",
      "difficulty": "Easy",
      "mood": "comfort",
      "ingredients": ["ingredient 1", "ingredient 2"],
      "steps": ["Step 1", "Step 2", "Step 3"],
      "tips": "Optional pro tip"
    }
  ]
}

RULES:
1. Return EXACTLY 3 NEW options different from typical suggestions
2. difficulty must be "Easy", "Medium", or "Moderate"
3. mood must be one of: "quick", "comfort", "healthy", "creative"
4. Use ONLY ingredients visible in the images
5. ${selectedSkillLevel === 'beginner' ? 'Keep ALL steps very simple - no complex techniques' : 'Match complexity to skill level'}
6. ${selectedDietary.length > 0 ? 'STRICTLY follow dietary restrictions' : 'No dietary restrictions'}`;

      const result = await model.generateContent([
        { text: refinedPrompt },
        ...imageData,
      ]);

      const responseText = result.response.text();
      console.log('[DoIt] Refined AI Response:', responseText);

      // Parse JSON response
      let jsonStr = responseText;
      if (jsonStr.includes('```json')) {
        jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (jsonStr.includes('```')) {
        jsonStr = jsonStr.replace(/```\n?/g, '');
      }
      jsonStr = jsonStr.trim();

      const parsed = JSON.parse(jsonStr);
      if (parsed.options && Array.isArray(parsed.options)) {
        const optionsWithIcons = parsed.options.map((opt: RecipeOption, idx: number) => ({
          ...opt,
          id: String(idx + 1),
          icon: opt.mood === 'quick' ? 'flash' : opt.mood === 'comfort' ? 'heart' : opt.mood === 'healthy' ? 'leaf' : 'sparkles',
        }));
        setRecipeOptions(optionsWithIcons);
        setSelectedRecipe(null);
        setActiveMoodFilter('all');
        setFeedbackText(''); // Clear feedback
      }
    } catch (error) {
      console.error('[DoIt] Regeneration error:', error);
      Alert.alert('Error', 'Failed to regenerate options. Please try again.');
    } finally {
      setIsRegenerating(false);
    }
  };

  // Image fetching functions
  const getCachedRecipeImage = async (recipeName: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from('recipe_images')
        .select('image_url')
        .eq('recipe_name', recipeName.toLowerCase().trim())
        .single();

      if (error || !data) return null;
      return data.image_url;
    } catch (error) {
      console.error('[Image] Cache lookup error:', error);
      return null;
    }
  };

  const cacheRecipeImage = async (recipeName: string, imageUrl: string, source: string) => {
    try {
      await supabase.from('recipe_images').insert({
        recipe_name: recipeName.toLowerCase().trim(),
        image_url: imageUrl,
        image_source: source,
      });
    } catch (error) {
      console.error('[Image] Cache save error:', error);
    }
  };

  const searchPexels = async (query: string): Promise<{ url: string; score: number } | null> => {
    if (!PEXELS_API_KEY) return null;

    try {
      const response = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query + ' food')}&per_page=1`,
        {
          headers: {
            Authorization: PEXELS_API_KEY,
          },
        }
      );

      const data = await response.json();
      if (data.photos && data.photos.length > 0) {
        return {
          url: data.photos[0].src.large,
          score: 1, // Pexels doesn't provide relevance score, default to 1
        };
      }
      return null;
    } catch (error) {
      console.error('[Image] Pexels search error:', error);
      return null;
    }
  };

  const searchUnsplash = async (query: string): Promise<{ url: string; score: number } | null> => {
    if (!UNSPLASH_ACCESS_KEY) return null;

    try {
      const response = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query + ' food')}&per_page=1`,
        {
          headers: {
            Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}`,
          },
        }
      );

      const data = await response.json();
      if (data.results && data.results.length > 0) {
        return {
          url: data.results[0].urls.regular,
          score: 1, // Unsplash doesn't provide relevance score, default to 1
        };
      }
      return null;
    } catch (error) {
      console.error('[Image] Unsplash search error:', error);
      return null;
    }
  };

  const fetchRecipeImage = async (recipeName: string): Promise<string | null> => {
    // Check cache first
    const cached = await getCachedRecipeImage(recipeName);
    if (cached) {
      console.log('[Image] Using cached image for:', recipeName);
      return cached;
    }

    console.log('[Image] Fetching new image for:', recipeName);

    // Search both APIs in parallel
    const [pexelsResult, unsplashResult] = await Promise.all([
      searchPexels(recipeName),
      searchUnsplash(recipeName),
    ]);

    // Pick the best result (for now, prefer Pexels if both exist, otherwise take what we got)
    let bestImage: { url: string; source: string } | null = null;

    if (pexelsResult && unsplashResult) {
      // Both found - prefer Pexels (you can add more logic here)
      bestImage = { url: pexelsResult.url, source: 'pexels' };
    } else if (pexelsResult) {
      bestImage = { url: pexelsResult.url, source: 'pexels' };
    } else if (unsplashResult) {
      bestImage = { url: unsplashResult.url, source: 'unsplash' };
    }

    if (bestImage) {
      // Cache it for next time
      await cacheRecipeImage(recipeName, bestImage.url, bestImage.source);
      console.log('[Image] Cached new image from', bestImage.source);
      return bestImage.url;
    }

    console.log('[Image] No image found for:', recipeName);
    return null;
  };

  // Handle press start - track time and prepare for potential hold
  const handlePressIn = () => {
    console.log('[LiveScan] Press started');
    pressStartTimeRef.current = Date.now();
    isLongPressRef.current = false;
  };

  // Capture a single photo from the camera
  const capturePhoto = async (quality: number = 0.8): Promise<string | null> => {
    if (!cameraRef.current) {
      console.log('[LiveScan] No camera ref available');
      return null;
    }

    if (!isCameraReady) {
      console.log('[LiveScan] Camera not ready yet');
      return null;
    }

    try {
      console.log('[LiveScan] Taking picture...');
      // CameraView's takePictureAsync accepts options or no args
      const photo = await cameraRef.current.takePictureAsync({
        quality,
      });
      console.log('[LiveScan] Photo taken:', photo?.uri ? 'success' : 'no uri');
      return photo?.uri || null;
    } catch (error) {
      console.error('[LiveScan] Capture error:', error);
      return null;
    }
  };

  // Handle camera ready
  const handleCameraReady = () => {
    console.log('[LiveScan] Camera is ready');
    setIsCameraReady(true);
  };

  // Handle press end - determine if it was a tap or hold
  const handlePressOut = async () => {
    const pressDuration = Date.now() - pressStartTimeRef.current;
    console.log('[LiveScan] Press ended, duration:', pressDuration, 'isLongPress:', isLongPressRef.current);

    // If it was a long press (hold), stop scanning - stay in liveScan to allow more captures
    if (isLongPressRef.current) {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      setIsScanning(false);
      // Just log - stay in liveScan, user can tap Done when ready
      console.log('[LiveScan] Stopped scanning, have', scannedFrames.length, 'frames. Staying in camera.');
    }
    // If it was a quick tap (< 300ms), take single photo and stay in liveScan
    else if (pressDuration < 300) {
      console.log('[LiveScan] Quick tap detected, capturing single photo');
      const photoUri = await capturePhoto(0.8);

      if (photoUri) {
        console.log('[LiveScan] Single photo captured:', photoUri);
        setCapturedImage(photoUri);
        // Add to scannedFrames - stay in liveScan so user can take more
        setScannedFrames(prev => {
          const newFrames = [...prev, photoUri];
          console.log('[LiveScan] Now have', newFrames.length, 'frames. Staying in camera.');
          return newFrames;
        });
        // Stay in liveScan - user taps Done when ready
      } else {
        console.log('[LiveScan] Failed to capture single photo');
        Alert.alert('Capture Failed', 'Could not capture image. Please try again.');
      }
    }
  };

  // Handle long press - start continuous scanning (adds to existing frames)
  const handleLongPress = async () => {
    console.log('[LiveScan] Long press triggered, isScanning:', isScanning, 'existing frames:', scannedFrames.length);
    if (!cameraRef.current || isScanning) {
      console.log('[LiveScan] Aborting long press - no camera or already scanning');
      return;
    }

    isLongPressRef.current = true;
    setIsScanning(true);
    // DON'T reset frames - we want to ADD to existing captures

    // Capture first frame immediately and add to existing
    const firstPhoto = await capturePhoto(0.6);
    if (firstPhoto) {
      console.log('[LiveScan] Adding new frame to existing', scannedFrames.length, 'frames');
      setScannedFrames(prev => [...prev, firstPhoto]);
    }

    // Continue capturing every 1.5 seconds while held
    scanIntervalRef.current = setInterval(async () => {
      const photo = await capturePhoto(0.6);
      if (photo) {
        setScannedFrames(prev => {
          if (prev.length >= 12) { // Increased max to 12 for multi-location scanning
            console.log('[LiveScan] Max frames reached (12)');
            return prev;
          }
          console.log('[LiveScan] Frame', prev.length + 1, 'captured');
          return [...prev, photo];
        });
      }
    }, 1500);
  };

  // Handle intent selection
  const handleIntentSelect = (intent: typeof INTENT_TILES[0]) => {
    setPendingIntent(intent);
    setShowContextPicker(true);
  };

  // Handle energy selection - go straight to camera
  const handleEnergySelect = (energy: string) => {
    setSelectedEnergy(energy);
    setShowContextPicker(false);

    if (pendingIntent) {
      setActiveIntent(pendingIntent);
      setFlowState('capture');
      // Show media options immediately
      setTimeout(() => setShowMediaOptions(true), 300);
    }
  };

  // Send follow-up message
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
    setFlowState('options');

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      const conversationHistory = messages.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

      const systemContext = `You are KanDu, continuing to help with ${activeIntent?.id || 'a task'}.
Keep responses SHORT (2-3 sentences). Be helpful and direct.
The user's energy level is: ${selectedEnergy === 'quick' ? 'tired, keep it simple' : 'normal'}.
Previous recommendation was about: ${recommendation?.substring(0, 100) || 'a task'}`;

      const chat = model.startChat({
        history: [
          { role: 'user', parts: [{ text: systemContext }] },
          { role: 'model', parts: [{ text: "Got it, I'll keep helping with short, direct responses." }] },
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
        content: "Having trouble connecting. Try again in a moment.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // Quick Spot Check (from welcome screen) - opens live scanner
  const handleQuickSpotCheck = () => {
    setActiveIntent(INTENT_TILES[0]); // Default to cooking context
    setSelectedEnergy('quick');
    setShowSpotCheckScanner(true);
  };

  // Reset to start
  const resetFlow = () => {
    setFlowState('welcome');
    setActiveIntent(null);
    setSelectedEnergy(null);
    setPendingIntent(null);
    setCapturedImage(null);
    setMessages([]);
    setRecommendation(null);
    setShowMediaOptions(false);
  };

  // Render message bubble
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
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          {message.imageUri && (
            <Image source={{ uri: message.imageUri }} style={styles.messageImage} />
          )}
          <Text style={[styles.messageText, isUser && styles.userMessageText]}>
            {message.content}
          </Text>
        </View>
      </View>
    );
  };

  // Welcome screen with intent tiles
  const renderWelcome = () => (
    <View style={styles.welcomeContainer}>
      {/* Hero Gradient Area */}
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
          <Text style={styles.backButtonText}>KanDu</Text>
        </TouchableOpacity>

        {/* Hero Content */}
        <View style={styles.heroContent}>
          <HouseIcon
            icon="bulb"
            size={80}
            gradientColors={['#ffffff', '#fed7aa', '#fdba74']}
          />
          <Text style={styles.heroTitle}>What do you need to do?</Text>
          <Text style={styles.heroSubtitle}>
            Just show me — I'll help you decide
          </Text>
        </View>
      </LinearGradient>

      {/* Intent Tiles */}
      <View style={styles.intentSection}>
        <View style={styles.intentGrid}>
          {INTENT_TILES.map((tile) => (
            <TouchableOpacity
              key={tile.id}
              style={styles.intentTile}
              onPress={() => handleIntentSelect(tile)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={tile.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.intentTileGradient}
              >
                {/* Checkmark watermark */}
                <View style={styles.tileCheckmarkWatermark} pointerEvents="none">
                  <Svg width={200} height={200} viewBox="0 0 100 100">
                    <Path
                      d="M25 50 L40 65 L75 30"
                      fill="none"
                      stroke="rgba(255, 255, 255, 0.08)"
                      strokeWidth={18}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                </View>
                {/* Glass sheen */}
                <LinearGradient
                  colors={[
                    'rgba(255,255,255,0.3)',
                    'rgba(255,255,255,0.1)',
                    'rgba(255,255,255,0)',
                  ]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <Ionicons name={tile.icon as any} size={36} color="#fff" />
                <Text style={styles.intentTileLabel}>{tile.label}</Text>
                <Text style={styles.intentTileSubtext}>{tile.subtext}</Text>
              </LinearGradient>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Spot Check Section */}
      <View style={styles.spotCheckSection}>
        <Text style={styles.sectionTitle}>Spot Check</Text>
        <Text style={styles.sectionSubtitle}>Quick check while you're working</Text>
        <TouchableOpacity
          style={styles.spotCheckButtonFull}
          onPress={handleQuickSpotCheck}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#64748b', '#475569']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.spotCheckButtonGradient}
          >
            <Ionicons name="camera" size={28} color="#fff" />
            <Text style={styles.spotCheckButtonText}>Show me something</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Capture screen (after energy selection)
  const renderCapture = () => (
    <View style={styles.captureContainer}>
      <LinearGradient
        colors={activeIntent?.gradient || ['#FF6B35', '#FFA500']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.captureHero, { paddingTop: insets.top }]}
      >
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

        <TouchableOpacity
          onPress={resetFlow}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={28} color="#ffffff" />
          <Text style={styles.backButtonText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.captureHeroContent}>
          <Ionicons name="scan" size={56} color="#ffffff" />
          <Text style={styles.captureTitle}>{activeIntent?.cameraPrompt}</Text>
          <Text style={styles.captureSubtitle}>{activeIntent?.cameraSubtext}</Text>
          <Text style={styles.energyBadge}>
            {selectedEnergy === 'quick' ? '⚡ Keeping it simple' : '👍 Normal mode'}
          </Text>
        </View>
      </LinearGradient>

      <ScrollView style={styles.captureScrollView} contentContainerStyle={styles.captureScrollContent}>
        {/* Primary Options Row */}
        <View style={styles.captureOptionsRow}>
          <TouchableOpacity style={styles.captureOption} onPress={startLiveScan}>
            <View style={[styles.captureOptionIcon, { backgroundColor: '#10B981' }]}>
              <Ionicons name="scan" size={28} color="#fff" />
            </View>
            <Text style={styles.captureOptionLabel}>Live Scan</Text>
            <Text style={styles.captureOptionHint}>Real-time view</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.captureOption} onPress={takePhoto}>
            <View style={[styles.captureOptionIcon, { backgroundColor: '#FF6B35' }]}>
              <Ionicons name="camera" size={28} color="#fff" />
            </View>
            <Text style={styles.captureOptionLabel}>Take Photo</Text>
            <Text style={styles.captureOptionHint}>Quick snap</Text>
          </TouchableOpacity>
        </View>

        {/* Video Options Row */}
        <View style={styles.captureOptionsRow}>
          <TouchableOpacity style={styles.captureOption} onPress={recordVideo}>
            <View style={[styles.captureOptionIcon, { backgroundColor: '#EF4444' }]}>
              <Ionicons name="videocam" size={28} color="#fff" />
            </View>
            <Text style={styles.captureOptionLabel}>Record Video</Text>
            <Text style={styles.captureOptionHint}>Up to 60 sec</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.captureOption} onPress={pickImage}>
            <View style={[styles.captureOptionIcon, { backgroundColor: '#4A90E2' }]}>
              <Ionicons name="folder-open" size={28} color="#fff" />
            </View>
            <Text style={styles.captureOptionLabel}>From Gallery</Text>
            <Text style={styles.captureOptionHint}>Photo or video</Text>
          </TouchableOpacity>
        </View>

        {/* Upload Video Option */}
        <TouchableOpacity style={styles.uploadVideoButton} onPress={pickVideo}>
          <Ionicons name="cloud-upload-outline" size={22} color="#64748b" />
          <Text style={styles.uploadVideoText}>Upload video from gallery</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Video Compression Modal */}
      <VideoCompressionModal
        visible={isCompressing}
        progress={compressionProgress}
        status={compressionStatus}
      />
    </View>
  );

  // Live Scan screen - real-time camera view
  const renderLiveScan = () => {
    const handleBackPress = () => {
      console.log('[LiveScan] Back button pressed');
      // Clean up if scanning
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
      setIsScanning(false);
      setScannedFrames([]); // Clear frames when going back
      setFlowState('capture');
    };

    const handleDone = () => {
      console.log('[LiveScan] Done pressed with', scannedFrames.length, 'frames');
      if (scannedFrames.length > 0) {
        setCapturedImage(scannedFrames[0]);
        setFlowState('analyzing');
        if (scannedFrames.length === 1) {
          analyzeImage(scannedFrames[0]);
        } else {
          analyzeMultipleImages(scannedFrames);
        }
      }
    };

    const hasPhotos = scannedFrames.length > 0;

    return (
      <View style={styles.liveScanContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.liveScanCamera}
          facing="back"
          onCameraReady={handleCameraReady}
        />

        {/* Corner guides - positioned absolutely, pointer events disabled */}
        <View style={styles.liveScanGuides} pointerEvents="none">
          <View style={[styles.liveScanCorner, styles.liveScanCornerTL]} />
          <View style={[styles.liveScanCorner, styles.liveScanCornerTR]} />
          <View style={[styles.liveScanCorner, styles.liveScanCornerBL]} />
          <View style={[styles.liveScanCorner, styles.liveScanCornerBR]} />
        </View>

        {/* Top overlay with back button and instructions */}
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'transparent']}
          style={[styles.liveScanTopOverlay, { paddingTop: insets.top }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            onPress={handleBackPress}
            style={styles.liveScanBackButton}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={28} color="#ffffff" />
            <Text style={styles.liveScanBackText}>Back</Text>
          </TouchableOpacity>
          <View style={styles.liveScanHeader} pointerEvents="none">
            <Text style={styles.liveScanTitle}>{activeIntent?.cameraPrompt}</Text>
            <Text style={styles.liveScanSubtitle}>
              {isScanning
                ? `Scanning... (${scannedFrames.length} captured)`
                : hasPhotos
                  ? `${scannedFrames.length} photo${scannedFrames.length > 1 ? 's' : ''} - tap for more or Done`
                  : 'Tap or hold to scan'}
            </Text>
          </View>
        </LinearGradient>

        {/* Photo count badge - shows thumbnails when photos exist */}
        {hasPhotos && !isScanning && (
          <View style={styles.photoCountBadge}>
            <View style={styles.photoThumbnailStack}>
              {scannedFrames.slice(-3).map((uri, index) => (
                <Image
                  key={index}
                  source={{ uri }}
                  style={[
                    styles.photoThumbnail,
                    { marginLeft: index > 0 ? -12 : 0, zIndex: index }
                  ]}
                />
              ))}
            </View>
            <Text style={styles.photoCountText}>
              {scannedFrames.length} scanned
            </Text>
          </View>
        )}

        {/* Bottom overlay with capture button */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.7)']}
          style={[styles.liveScanBottomOverlay, { paddingBottom: Math.max(insets.bottom, 20) }]}
          pointerEvents="box-none"
        >
          {/* Energy badge - hide when photos exist to make room */}
          {!hasPhotos && (
            <View style={styles.liveScanEnergyBadge} pointerEvents="none">
              <Ionicons
                name={selectedEnergy === 'quick' ? 'flash' : 'time'}
                size={16}
                color="#ffffff"
              />
              <Text style={styles.liveScanEnergyText}>
                {selectedEnergy === 'quick' ? 'Keeping it simple' : 'Normal mode'}
              </Text>
            </View>
          )}

          {/* Frame counter when scanning */}
          {isScanning && scannedFrames.length > 0 && (
            <View style={styles.frameCounter} pointerEvents="none">
              {scannedFrames.map((_, index) => (
                <View key={index} style={styles.frameDot} />
              ))}
            </View>
          )}

          {/* Bottom action area - capture button and Done button */}
          <View style={styles.liveScanActionRow}>
            {/* Capture button - tap for single, hold for multi-shot */}
            <TouchableOpacity
              style={[
                styles.liveScanCaptureButton,
                isScanning && styles.liveScanCaptureButtonActive,
                !isCameraReady && styles.liveScanCaptureButtonDisabled,
              ]}
              onPressIn={isCameraReady ? handlePressIn : undefined}
              onPressOut={isCameraReady ? handlePressOut : undefined}
              onLongPress={isCameraReady ? handleLongPress : undefined}
              activeOpacity={0.9}
              delayLongPress={300}
              disabled={!isCameraReady}
            >
              <View style={[
                styles.liveScanCaptureOuter,
                isScanning && styles.liveScanCaptureOuterActive,
                !isCameraReady && styles.liveScanCaptureOuterDisabled,
              ]}>
                <LinearGradient
                  colors={isScanning
                    ? ['#EF4444', '#DC2626']
                    : !isCameraReady
                      ? ['#94a3b8', '#64748b']
                      : (activeIntent?.gradient || ['#10B981', '#059669'])}
                  style={styles.liveScanCaptureInner}
                >
                  {!isCameraReady ? (
                    <ActivityIndicator size={28} color="#ffffff" />
                  ) : (
                    <Ionicons
                      name={isScanning ? 'radio-button-on' : hasPhotos ? 'add' : 'scan'}
                      size={32}
                      color="#ffffff"
                    />
                  )}
                </LinearGradient>
              </View>
            </TouchableOpacity>

            {/* Done button - only shows when photos exist */}
            {hasPhotos && !isScanning && (
              <TouchableOpacity
                style={styles.liveScanDoneButton}
                onPress={handleDone}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={activeIntent?.gradient || ['#10B981', '#059669']}
                  style={styles.liveScanDoneGradient}
                >
                  <Ionicons name="checkmark" size={24} color="#ffffff" />
                  <Text style={styles.liveScanDoneText}>Done</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.liveScanCaptureHint} pointerEvents="none">
            {!isCameraReady
              ? 'Initializing camera...'
              : isScanning
                ? 'Release when done'
                : hasPhotos
                  ? 'Scan more areas or tap Done'
                  : 'Tap or hold to scan'}
          </Text>
        </LinearGradient>
      </View>
    );
  };

  // Review screen - shows captured images with option to scan more or analyze
  const renderReview = () => {
    const imageCount = scannedFrames.length;

    const handleScanMore = () => {
      // Reset camera ready state and go back to live scan
      setIsCameraReady(false);
      setFlowState('liveScan');
    };

    const handleAnalyze = () => {
      setFlowState('analyzing');
      if (scannedFrames.length === 1) {
        analyzeImage(scannedFrames[0]);
      } else {
        analyzeMultipleImages(scannedFrames);
      }
    };

    return (
      <View style={styles.reviewContainer}>
        <LinearGradient
          colors={activeIntent?.gradient || ['#FF6B35', '#FFA500']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.reviewHeader, { paddingTop: insets.top }]}
        >
          <TouchableOpacity
            onPress={() => {
              setScannedFrames([]);
              setCapturedImage(null);
              setFlowState('liveScan');
            }}
            style={styles.reviewBackButton}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color="#ffffff" />
            <Text style={styles.reviewBackText}>Retake</Text>
          </TouchableOpacity>
          <Text style={styles.reviewTitle}>
            {imageCount} {imageCount === 1 ? 'photo' : 'photos'} captured
          </Text>
          <Text style={styles.reviewSubtitle}>
            Scan more areas or analyze now
          </Text>
        </LinearGradient>

        {/* Image thumbnails */}
        <ScrollView
          style={styles.reviewScrollView}
          contentContainerStyle={styles.reviewScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.reviewImageGrid}>
            {scannedFrames.map((uri, index) => (
              <View key={index} style={styles.reviewImageWrapper}>
                <Image source={{ uri }} style={styles.reviewImage} />
                <View style={styles.reviewImageNumber}>
                  <Text style={styles.reviewImageNumberText}>{index + 1}</Text>
                </View>
                <TouchableOpacity
                  style={styles.reviewImageDelete}
                  onPress={() => {
                    const newFrames = scannedFrames.filter((_, i) => i !== index);
                    setScannedFrames(newFrames);
                    if (newFrames.length === 0) {
                      setFlowState('liveScan');
                    } else {
                      setCapturedImage(newFrames[0]);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close-circle" size={24} color="#ffffff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>

          {/* Helpful text */}
          <View style={styles.reviewHelpSection}>
            <Ionicons name="bulb-outline" size={20} color="#64748b" />
            <Text style={styles.reviewHelpText}>
              Tip: Scan your fridge, pantry, and cabinets for better suggestions!
            </Text>
          </View>
        </ScrollView>

        {/* Action buttons */}
        <View style={styles.reviewActions}>
          <TouchableOpacity
            style={styles.reviewScanMoreButton}
            onPress={handleScanMore}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle-outline" size={24} color={activeIntent?.gradient[0] || '#FF6B35'} />
            <Text style={[styles.reviewScanMoreText, { color: activeIntent?.gradient[0] || '#FF6B35' }]}>
              Scan More
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.reviewAnalyzeButton, { backgroundColor: activeIntent?.gradient[0] || '#FF6B35' }]}
            onPress={handleAnalyze}
            activeOpacity={0.8}
          >
            <Ionicons name="sparkles" size={24} color="#ffffff" />
            <Text style={styles.reviewAnalyzeText}>
              Find Recipes
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Analyzing screen animations
  const glowPulse = useRef(new Animated.Value(0.3)).current;
  const dot1Opacity = useRef(new Animated.Value(0.3)).current;
  const dot2Opacity = useRef(new Animated.Value(0.3)).current;
  const dot3Opacity = useRef(new Animated.Value(0.3)).current;

  // Glow pulse animation
  useEffect(() => {
    if (flowState !== 'analyzing') return;

    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(glowPulse, {
          toValue: 0.7,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowPulse, {
          toValue: 0.3,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnimation.start();

    return () => pulseAnimation.stop();
  }, [flowState]);

  // Animated dots - staggered wave effect
  useEffect(() => {
    if (flowState !== 'analyzing') return;

    const animateDots = () => {
      dot1Opacity.setValue(0.3);
      dot2Opacity.setValue(0.3);
      dot3Opacity.setValue(0.3);

      Animated.stagger(200, [
        Animated.sequence([
          Animated.timing(dot1Opacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dot1Opacity, {
            toValue: 0.3,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(dot2Opacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dot2Opacity, {
            toValue: 0.3,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(dot3Opacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(dot3Opacity, {
            toValue: 0.3,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => {
        setTimeout(animateDots, 200);
      });
    };

    animateDots();
  }, [flowState]);

  const renderAnalyzing = () => {
    const imageCount = scannedFrames.length || (capturedImage ? 1 : 0);

    return (
      <View style={styles.analyzingContainer}>
        <LinearGradient
          colors={activeIntent?.gradient || ['#FF6B35', '#FFA500']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.analyzingGradient, { paddingTop: insets.top }]}
        >
          <View style={styles.analyzingContent}>
            {/* AnimatedLogo at top with glow effect */}
            <View style={styles.analyzingLogoWrapper}>
              {/* Glow circle behind logo */}
              <Animated.View
                style={[
                  styles.analyzingGlowCircle,
                  { opacity: glowPulse }
                ]}
              >
                <LinearGradient
                  colors={['transparent', 'rgba(255, 255, 255, 0.25)', 'rgba(255, 255, 255, 0.15)', 'transparent']}
                  style={styles.analyzingGlowGradient}
                />
              </Animated.View>
              <AnimatedLogo size={140} isLoading={true} traceDuration={5000} />
            </View>

            {/* Scanned image below the logo */}
            {capturedImage && (
              <View style={styles.analyzingImageContainer}>
                <Image source={{ uri: capturedImage }} style={styles.analyzingImage} />
                {imageCount > 1 && (
                  <View style={styles.imageCountBadge}>
                    <Text style={styles.imageCountText}>{imageCount} images</Text>
                  </View>
                )}
              </View>
            )}

            {/* Text */}
            <Text style={styles.analyzingText}>
              {imageCount > 1 ? `Analyzing ${imageCount} images...` : 'Looking at what you have...'}
            </Text>
            <Text style={styles.analyzingSubtext}>Finding the best recipes for you</Text>

            {/* Animated dots at bottom */}
            <View style={styles.analyzingDotsContainer}>
              <Animated.View style={[styles.analyzingDot, { opacity: dot1Opacity, backgroundColor: '#ffffff' }]} />
              <Animated.View style={[styles.analyzingDot, { opacity: dot2Opacity, backgroundColor: '#ffffff' }]} />
              <Animated.View style={[styles.analyzingDot, { opacity: dot3Opacity, backgroundColor: '#ffffff' }]} />
            </View>
          </View>
        </LinearGradient>
      </View>
    );
  };

  // Options screen - shows recipe/task cards
  const renderOptions = () => {
    // Filter options based on mood filter
    const filteredOptions = activeMoodFilter === 'all'
      ? recipeOptions
      : recipeOptions.filter(opt => opt.mood === activeMoodFilter);

    return (
      <View style={styles.optionsContainer}>
        {/* Header */}
        <LinearGradient
          colors={activeIntent?.gradient || ['#FF6B35', '#FFA500']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.optionsHeader, { paddingTop: insets.top }]}
        >
          <View style={styles.optionsHeaderRow}>
            <TouchableOpacity
              onPress={resetFlow}
              style={styles.optionsBackButton}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={24} color="#ffffff" />
            </TouchableOpacity>
            <View style={styles.optionsHeaderCenter}>
              <Text style={styles.optionsHeaderTitle}>Pick your meal</Text>
              <Text style={styles.optionsHeaderSubtitle}>
                {selectedServings ? `Serves ${selectedServings}` : ''} {selectedEnergy === 'quick' ? '• Quick mode' : ''}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setFlowState('capture')}
              style={styles.optionsRescanButton}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Mood filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.moodFilterContainer}
          >
            {MOOD_FILTERS.map((filter) => (
              <TouchableOpacity
                key={filter.id}
                style={[
                  styles.moodFilterChip,
                  activeMoodFilter === filter.id && styles.moodFilterChipActive,
                ]}
                onPress={() => setActiveMoodFilter(filter.id)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={filter.icon as any}
                  size={16}
                  color={activeMoodFilter === filter.id ? '#ffffff' : 'rgba(255,255,255,0.8)'}
                />
                <Text style={[
                  styles.moodFilterText,
                  activeMoodFilter === filter.id && styles.moodFilterTextActive,
                ]}>
                  {filter.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </LinearGradient>

        {/* Recipe Cards */}
        <ScrollView
          style={styles.optionsScrollView}
          contentContainerStyle={styles.optionsScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option, index) => (
              <TouchableOpacity
                key={option.id}
                style={styles.recipeCard}
                onPress={() => {
                  setSelectedRecipe(option);
                  setFlowState('detail');
                }}
                activeOpacity={0.9}
              >
                <View style={styles.recipeCardHeader}>
                  <View style={[
                    styles.recipeCardIcon,
                    { backgroundColor: activeIntent?.gradient[0] || '#FF6B35' }
                  ]}>
                    <Ionicons name={option.icon as any} size={24} color="#ffffff" />
                  </View>
                  <View style={styles.recipeCardMeta}>
                    <View style={styles.recipeCardBadges}>
                      <View style={styles.recipeTimeBadge}>
                        <Ionicons name="time-outline" size={14} color="#64748b" />
                        <Text style={styles.recipeTimeText}>{option.time}</Text>
                      </View>
                      <View style={[
                        styles.recipeDifficultyBadge,
                        option.difficulty === 'Easy' && styles.difficultyEasy,
                        option.difficulty === 'Medium' && styles.difficultyMedium,
                        option.difficulty === 'Moderate' && styles.difficultyModerate,
                      ]}>
                        <Text style={styles.recipeDifficultyText}>{option.difficulty}</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <Text style={styles.recipeCardName}>{option.name}</Text>
                <Text style={styles.recipeCardTagline}>{option.tagline}</Text>

                {/* Ingredient preview */}
                <View style={styles.ingredientPreview}>
                  {option.ingredients.slice(0, 4).map((ing, i) => (
                    <View key={i} style={styles.ingredientChip}>
                      <Text style={styles.ingredientChipText}>{ing}</Text>
                    </View>
                  ))}
                  {option.ingredients.length > 4 && (
                    <View style={styles.ingredientChipMore}>
                      <Text style={styles.ingredientChipMoreText}>+{option.ingredients.length - 4}</Text>
                    </View>
                  )}
                </View>

                {/* Card number indicator */}
                <View style={styles.recipeCardNumber}>
                  <Text style={styles.recipeCardNumberText}>{index + 1}</Text>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.noOptionsMessage}>
              <Ionicons name="search" size={48} color="#cbd5e1" />
              <Text style={styles.noOptionsText}>No matches for this filter</Text>
              <TouchableOpacity onPress={() => setActiveMoodFilter('all')}>
                <Text style={styles.noOptionsLink}>Show all options</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Refine Section */}
          <View style={styles.refineSection}>
            <Text style={styles.refineSectionTitle}>Not quite right?</Text>

            {/* Quick feedback input */}
            <View style={styles.feedbackInputContainer}>
              <TextInput
                style={styles.feedbackInput}
                placeholder="Tell us what you want instead..."
                placeholderTextColor="#94a3b8"
                value={feedbackText}
                onChangeText={setFeedbackText}
                multiline={false}
                returnKeyType="send"
                onSubmitEditing={() => {
                  if (feedbackText.trim()) {
                    regenerateWithRefinements(feedbackText.trim());
                  }
                }}
              />
              <TouchableOpacity
                style={[
                  styles.feedbackSubmitButton,
                  !feedbackText.trim() && styles.feedbackSubmitButtonDisabled,
                ]}
                onPress={() => {
                  if (feedbackText.trim()) {
                    regenerateWithRefinements(feedbackText.trim());
                  }
                }}
                disabled={!feedbackText.trim() || isRegenerating}
              >
                {isRegenerating ? (
                  <ActivityIndicator size={18} color="#ffffff" />
                ) : (
                  <Ionicons name="arrow-forward" size={18} color="#ffffff" />
                )}
              </TouchableOpacity>
            </View>

            {/* Refine button */}
            <TouchableOpacity
              style={styles.refineButton}
              onPress={() => setShowRefineModal(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="options-outline" size={20} color="#64748b" />
              <Text style={styles.refineButtonText}>Refine with more options</Text>
              <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Refine Modal */}
        <Modal
          visible={showRefineModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowRefineModal(false)}
        >
          <View style={styles.refineModalOverlay}>
            <View style={styles.refineModalContainer}>
              {/* Header */}
              <View style={styles.refineModalHeader}>
                <TouchableOpacity
                  onPress={() => setShowRefineModal(false)}
                  style={styles.refineModalClose}
                >
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
                <Text style={styles.refineModalTitle}>Refine Results</Text>
                <View style={{ width: 24 }} />
              </View>

              <ScrollView style={styles.refineModalScroll} showsVerticalScrollIndicator={false}>
                {/* Skill Level */}
                <Text style={styles.refineOptionTitle}>Your cooking skill</Text>
                <View style={styles.refineOptionRow}>
                  {SKILL_LEVEL_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.refineChip,
                        selectedSkillLevel === option.id && styles.refineChipSelected,
                      ]}
                      onPress={() => setSelectedSkillLevel(
                        selectedSkillLevel === option.id ? null : option.id
                      )}
                    >
                      <Ionicons
                        name={option.icon as any}
                        size={16}
                        color={selectedSkillLevel === option.id ? '#ffffff' : '#64748b'}
                      />
                      <Text style={[
                        styles.refineChipText,
                        selectedSkillLevel === option.id && styles.refineChipTextSelected,
                      ]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Cuisine */}
                <Text style={styles.refineOptionTitle}>Cuisine style</Text>
                <View style={styles.refineOptionRow}>
                  {CUISINE_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.refineChip,
                        selectedCuisine === option.id && styles.refineChipSelected,
                      ]}
                      onPress={() => setSelectedCuisine(
                        selectedCuisine === option.id ? null : option.id
                      )}
                    >
                      <Ionicons
                        name={option.icon as any}
                        size={16}
                        color={selectedCuisine === option.id ? '#ffffff' : '#64748b'}
                      />
                      <Text style={[
                        styles.refineChipText,
                        selectedCuisine === option.id && styles.refineChipTextSelected,
                      ]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Dietary */}
                <Text style={styles.refineOptionTitle}>Dietary needs (select all that apply)</Text>
                <View style={styles.refineOptionRow}>
                  {DIETARY_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.refineChip,
                        selectedDietary.includes(option.id) && styles.refineChipSelected,
                      ]}
                      onPress={() => {
                        if (selectedDietary.includes(option.id)) {
                          setSelectedDietary(selectedDietary.filter(d => d !== option.id));
                        } else {
                          setSelectedDietary([...selectedDietary, option.id]);
                        }
                      }}
                    >
                      <Ionicons
                        name={option.icon as any}
                        size={16}
                        color={selectedDietary.includes(option.id) ? '#ffffff' : '#64748b'}
                      />
                      <Text style={[
                        styles.refineChipText,
                        selectedDietary.includes(option.id) && styles.refineChipTextSelected,
                      ]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              {/* Apply button */}
              <TouchableOpacity
                style={styles.refineApplyButton}
                onPress={() => regenerateWithRefinements()}
                disabled={isRegenerating}
              >
                <LinearGradient
                  colors={activeIntent?.gradient || ['#FF6B35', '#FFA500']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.refineApplyGradient}
                >
                  {isRegenerating ? (
                    <ActivityIndicator size={20} color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="refresh" size={20} color="#ffffff" />
                      <Text style={styles.refineApplyText}>Get New Suggestions</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Regenerating Overlay */}
        {isRegenerating && (
          <View style={styles.regeneratingOverlay}>
            <View style={styles.regeneratingCard}>
              <ActivityIndicator size="large" color="#FF6B35" />
              <Text style={styles.regeneratingText}>Getting new suggestions...</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  // Fetch recipe image when recipe is selected
  useEffect(() => {
    if (selectedRecipe && !selectedRecipe.imageUrl) {
      setLoadingRecipeImage(true);
      fetchRecipeImage(selectedRecipe.name)
        .then(imageUrl => {
          if (imageUrl) {
            setSelectedRecipe(prev => prev ? { ...prev, imageUrl } : null);
          }
        })
        .catch(error => {
          console.error('[Image] Failed to fetch recipe image:', error);
        })
        .finally(() => {
          setLoadingRecipeImage(false);
        });
    }
  }, [selectedRecipe?.id]);

  // Spot Check Result screen - frozen frame with animated annotations
  const renderSpotCheckResult = () => {
    const imageSize = SCREEN_WIDTH - 40; // Full width minus padding

    return (
      <View style={styles.spotCheckResultContainer}>
        {/* Header */}
        <LinearGradient
          colors={['#0f172a', '#1e3a5f']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.spotCheckResultHeader, { paddingTop: insets.top }]}
        >
          <View style={styles.spotCheckHeaderRow}>
            <TouchableOpacity
              onPress={resetFlow}
              style={styles.spotCheckBackButton}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={24} color="#ffffff" />
            </TouchableOpacity>
            <Text style={styles.spotCheckHeaderTitle}>Spot Check</Text>
            <TouchableOpacity
              onPress={startSpotCheck}
              style={styles.spotCheckRetryButton}
              activeOpacity={0.7}
            >
              <Ionicons name="camera" size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Question asked */}
          <View style={styles.spotCheckQuestionBubble}>
            <Ionicons name="chatbubble" size={16} color="rgba(255,255,255,0.6)" />
            <Text style={styles.spotCheckQuestionText}>"{spotCheckQuestion}"</Text>
          </View>
        </LinearGradient>

        {/* Main content - frozen frame with annotations */}
        <ScrollView
          style={styles.spotCheckScrollView}
          contentContainerStyle={styles.spotCheckScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Image container with annotations overlay */}
          <View style={[styles.spotCheckImageWrapper, { width: imageSize, height: imageSize }]}>
            {capturedImage && (
              <>
                <Image
                  source={{ uri: capturedImage }}
                  style={styles.spotCheckImage}
                  resizeMode="cover"
                />
                {/* Animated annotations overlay */}
                <AnimatedAnnotation
                  annotations={annotations}
                  imageWidth={imageSize}
                  imageHeight={imageSize}
                />
              </>
            )}
          </View>

          {/* AI Response */}
          <View style={styles.spotCheckResponseCard}>
            <View style={styles.spotCheckResponseHeader}>
              <View style={styles.spotCheckAvatarIcon}>
                <Ionicons name="checkmark-circle" size={24} color="#ffffff" />
              </View>
              <Text style={styles.spotCheckResponseLabel}>KanDu says</Text>
            </View>
            <Text style={styles.spotCheckResponseText}>
              {spotCheckResponse || 'Analyzing...'}
            </Text>
          </View>

          {/* Action buttons */}
          <View style={styles.spotCheckActions}>
            <TouchableOpacity
              style={styles.spotCheckGotItButton}
              onPress={resetFlow}
              activeOpacity={0.8}
            >
              <Text style={styles.spotCheckGotItText}>Got it</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.spotCheckAskMoreButton}
              onPress={startSpotCheck}
              activeOpacity={0.8}
            >
              <Ionicons name="camera-outline" size={20} color="#3b82f6" />
              <Text style={styles.spotCheckAskMoreText}>Check again</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    );
  };

  // Detail screen - full recipe view
  const renderDetail = () => {
    if (!selectedRecipe) return null;

    return (
      <View style={styles.detailContainer}>
        {/* Recipe Image Background */}
        {selectedRecipe.imageUrl && (
          <Image
            source={{ uri: selectedRecipe.imageUrl }}
            style={styles.recipeImageBackground}
            resizeMode="cover"
          />
        )}

        {/* Header Gradient - fades from color to transparent over image */}
        <LinearGradient
          colors={
            selectedRecipe.imageUrl
              ? [
                  ...(activeIntent?.gradient || ['#FF6B35', '#FFA500']),
                  'rgba(255, 107, 53, 0.7)',
                  'rgba(255, 107, 53, 0.3)',
                  'transparent',
                ]
              : activeIntent?.gradient || ['#FF6B35', '#FFA500']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[
            styles.detailHeader,
            { paddingTop: insets.top },
            selectedRecipe.imageUrl && styles.detailHeaderWithImage,
          ]}
        >
          <View style={styles.detailHeaderRow}>
            <TouchableOpacity
              onPress={() => {
                // If came from Favorites, go back to the previous screen (Favorites)
                if (route.params?.fromFavorites) {
                  navigation.goBack();
                } else {
                  // Otherwise go back to options
                  setFlowState('options');
                }
              }}
              style={styles.detailBackButton}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={24} color="#ffffff" />
              <Text style={styles.detailBackText}>
                {route.params?.fromFavorites ? 'Favorites' : 'Options'}
              </Text>
            </TouchableOpacity>
            <FavoriteButton
              category="recipes"
              itemId={selectedRecipe.id}
              itemName={selectedRecipe.name}
              itemData={{
                id: selectedRecipe.id,
                name: selectedRecipe.name,
                tagline: selectedRecipe.tagline,
                time: selectedRecipe.time,
                difficulty: selectedRecipe.difficulty,
                mood: selectedRecipe.mood,
                ingredients: selectedRecipe.ingredients,
                steps: selectedRecipe.steps,
                tips: selectedRecipe.tips,
                icon: selectedRecipe.icon,
                imageUrl: selectedRecipe.imageUrl,
              }}
              size={26}
              activeColor="#ffffff"
              inactiveColor="rgba(255,255,255,0.6)"
              style={styles.detailFavoriteButton}
            />
          </View>

          <View style={styles.detailHeroContent}>
            {!selectedRecipe.imageUrl && (
              <View style={styles.detailIconLarge}>
                <Ionicons name={selectedRecipe.icon as any} size={40} color="#ffffff" />
              </View>
            )}
            <Text style={styles.detailTitle}>{selectedRecipe.name}</Text>
            <Text style={styles.detailTagline}>{selectedRecipe.tagline}</Text>

            <View style={styles.detailMetaRow}>
              <View style={styles.detailMetaItem}>
                <Ionicons name="time-outline" size={18} color="rgba(255,255,255,0.9)" />
                <Text style={styles.detailMetaText}>{selectedRecipe.time}</Text>
              </View>
              <View style={styles.detailMetaDivider} />
              <View style={styles.detailMetaItem}>
                <Ionicons name="speedometer-outline" size={18} color="rgba(255,255,255,0.9)" />
                <Text style={styles.detailMetaText}>{selectedRecipe.difficulty}</Text>
              </View>
              {selectedServings && (
                <>
                  <View style={styles.detailMetaDivider} />
                  <View style={styles.detailMetaItem}>
                    <Ionicons name="people-outline" size={18} color="rgba(255,255,255,0.9)" />
                    <Text style={styles.detailMetaText}>Serves {selectedServings}</Text>
                  </View>
                </>
              )}
            </View>
          </View>
        </LinearGradient>

        {/* Content */}
        <ScrollView
          style={styles.detailScrollView}
          contentContainerStyle={[
            styles.detailScrollContent,
            selectedRecipe.imageUrl && { paddingTop: 120 }
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Ingredients */}
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>Ingredients</Text>
            <View style={styles.ingredientsList}>
              {selectedRecipe.ingredients.map((ing, i) => (
                <View key={i} style={styles.ingredientRow}>
                  <View style={styles.ingredientBullet} />
                  <Text style={styles.ingredientText}>{ing}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Steps */}
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>Steps</Text>
            {selectedRecipe.steps.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <View style={[styles.stepNumber, { backgroundColor: activeIntent?.gradient[0] || '#FF6B35' }]}>
                  <Text style={styles.stepNumberText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>

          {/* Tips */}
          {selectedRecipe.tips && (
            <View style={styles.tipsCard}>
              <View style={styles.tipsHeader}>
                <Ionicons name="bulb" size={20} color="#f59e0b" />
                <Text style={styles.tipsTitle}>Pro Tip</Text>
              </View>
              <Text style={styles.tipsText}>{selectedRecipe.tips}</Text>
            </View>
          )}

          {/* Start Cooking button */}
          <TouchableOpacity
            style={[styles.startCookingButton, { backgroundColor: activeIntent?.gradient[0] || '#FF6B35' }]}
            onPress={() => setShowCookingSession(true)}
            activeOpacity={0.9}
          >
            <Ionicons name="play" size={24} color="#ffffff" />
            <Text style={styles.startCookingText}>Start Cooking</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  };

  // Context picker modal - energy, servings, meal type, optional household
  const renderContextPicker = () => {
    const isCooking = pendingIntent?.id === 'cooking';

    // Check if we can proceed (energy selected, and servings + meal type if cooking)
    const canProceed = selectedEnergy && (!isCooking || (selectedServings && selectedMealType));

    return (
      <Modal
        visible={showContextPicker}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setShowContextPicker(false);
          setSelectedEnergy(null);
          setSelectedServings(null);
          setSelectedMealType(null);
        }}
      >
        <View style={styles.contextPickerOverlay}>
          <View style={styles.contextPickerContainer}>
            {/* Header */}
            <View style={styles.contextPickerHeader}>
              <TouchableOpacity
                onPress={() => {
                  setShowContextPicker(false);
                  setSelectedEnergy(null);
                  setSelectedServings(null);
                  setSelectedMealType(null);
                }}
                style={styles.contextPickerClose}
              >
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
              <Text style={styles.contextPickerTitle}>
                {isCooking ? "Let's cook!" : `Let's ${pendingIntent?.id || 'go'}!`}
              </Text>
              <View style={{ width: 24 }} />
            </View>

            <ScrollView
              style={styles.contextPickerScroll}
              showsVerticalScrollIndicator={false}
            >
              {/* Energy Level Section */}
              <Text style={styles.contextSectionTitle}>What's your energy like?</Text>
              <View style={styles.energyOptions}>
                {ENERGY_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.id}
                    style={[
                      styles.energyOption,
                      selectedEnergy === option.id && styles.energyOptionSelected,
                    ]}
                    onPress={() => setSelectedEnergy(option.id)}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={option.id === 'quick' ? ['#f59e0b', '#d97706'] : ['#10b981', '#059669']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[
                        styles.energyOptionGradient,
                        selectedEnergy === option.id && styles.energyOptionGradientSelected,
                      ]}
                    >
                      <Ionicons name={option.icon as any} size={28} color="#fff" />
                      <Text style={styles.energyOptionLabel}>{option.label}</Text>
                      <Text style={styles.energyOptionSubtext}>{option.subtext}</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Meal Type Section - only for cooking */}
              {isCooking && (
                <>
                  <Text style={styles.contextSectionTitle}>What meal is this?</Text>
                  <View style={styles.mealTypeOptions}>
                    {MEAL_TYPE_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.id}
                        style={[
                          styles.mealTypeOption,
                          selectedMealType === option.id && [styles.mealTypeOptionSelected, { borderColor: option.color }],
                        ]}
                        onPress={() => setSelectedMealType(option.id)}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={option.icon as any}
                          size={20}
                          color={selectedMealType === option.id ? option.color : '#64748b'}
                        />
                        <Text style={[
                          styles.mealTypeLabel,
                          selectedMealType === option.id && { color: option.color },
                        ]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Servings Section - only for cooking */}
              {isCooking && (
                <>
                  <Text style={styles.contextSectionTitle}>How many servings?</Text>
                  <View style={styles.servingsOptions}>
                    {SERVING_OPTIONS.map((option) => (
                      <TouchableOpacity
                        key={option.id}
                        style={[
                          styles.servingOption,
                          selectedServings === option.id && styles.servingOptionSelected,
                        ]}
                        onPress={() => setSelectedServings(option.id)}
                        activeOpacity={0.8}
                      >
                        <Text style={[
                          styles.servingLabel,
                          selectedServings === option.id && styles.servingLabelSelected,
                        ]}>
                          {option.label}
                        </Text>
                        <Text style={[
                          styles.servingSubtext,
                          selectedServings === option.id && styles.servingSubtextSelected,
                        ]}>
                          {option.subtext}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {/* Optional Household Setup - clearly skippable */}
              {isCooking && (
                <TouchableOpacity
                  style={styles.householdSetupButton}
                  onPress={() => {
                    setShowContextPicker(false);
                    navigation.navigate('HouseholdSetup');
                  }}
                  activeOpacity={0.7}
                >
                  <View style={styles.householdSetupContent}>
                    <Ionicons name="people-outline" size={20} color="#64748b" />
                    <View style={styles.householdSetupText}>
                      <Text style={styles.householdSetupLabel}>Set up household members</Text>
                      <Text style={styles.householdSetupHint}>Optional - save preferences for your family</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                  </View>
                </TouchableOpacity>
              )}
            </ScrollView>

            {/* Continue Button */}
            <TouchableOpacity
              style={[
                styles.contextContinueButton,
                !canProceed && styles.contextContinueButtonDisabled,
              ]}
              onPress={() => {
                if (canProceed) {
                  handleEnergySelect(selectedEnergy!);
                }
              }}
              disabled={!canProceed}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={canProceed
                  ? (pendingIntent?.gradient || ['#FF6B35', '#FF8C42'])
                  : ['#94a3b8', '#94a3b8']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.contextContinueGradient}
              >
                <Text style={styles.contextContinueText}>
                  {isCooking ? 'Scan my kitchen' : 'Continue'}
                </Text>
                <Ionicons name="arrow-forward" size={20} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // Determine what to show based on flow state
  const renderContent = () => {
    switch (flowState) {
      case 'welcome':
        return (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.welcomeScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {renderWelcome()}
          </ScrollView>
        );
      case 'capture':
        return renderCapture();
      case 'liveScan':
        return renderLiveScan();
      case 'review':
        return renderReview();
      case 'analyzing':
        return renderAnalyzing();
      case 'options':
        return renderOptions();
      case 'detail':
        return renderDetail();
      case 'spotcheck_result':
        return renderSpotCheckResult();
      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {renderContextPicker()}
      {renderContent()}

      {/* SpotCheck Scanner Modal - fullscreen live camera experience */}
      <Modal
        visible={showSpotCheckScanner}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowSpotCheckScanner(false)}
      >
        <SpotCheckScanner
          onClose={() => setShowSpotCheckScanner(false)}
          context={activeIntent?.id}
          onComplete={(result) => {
            // Optionally handle result for step-by-step session
            console.log('[DoIt] SpotCheck completed:', result.context);
          }}
        />
      </Modal>

      {/* Cooking Session Modal - step-by-step guided cooking */}
      <Modal
        visible={showCookingSession}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowCookingSession(false)}
      >
        {selectedRecipe && (
          <CookingSession
            recipeName={selectedRecipe.name}
            steps={selectedRecipe.steps}
            ingredients={selectedRecipe.ingredients}
            accentColor={activeIntent?.gradient[0] || '#FF6B35'}
            onClose={() => setShowCookingSession(false)}
            onComplete={() => {
              setShowCookingSession(false);
              Alert.alert(
                'Nice work! 🎉',
                `You've completed ${selectedRecipe.name}. Enjoy your meal!`,
                [{ text: 'Thanks!' }]
              );
            }}
          />
        )}
      </Modal>
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

  // Hero Gradient
  heroGradient: {
    paddingBottom: 24,
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
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 12,
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
  },

  // Intent Tiles
  intentSection: {
    paddingHorizontal: 20,
    marginTop: 8,
  },
  intentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  intentTile: {
    width: (SCREEN_WIDTH - 52) / 2,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  intentTileGradient: {
    paddingVertical: 28,
    paddingHorizontal: 16,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  tileCheckmarkWatermark: {
    position: 'absolute',
    right: -25,
    bottom: -45,
  },
  intentTileLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 12,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  intentTileSubtext: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 4,
    textAlign: 'center',
  },

  // Spot Check Section
  spotCheckSection: {
    paddingHorizontal: 20,
    marginTop: 28,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E5AA8',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 16,
  },
  spotCheckButtonFull: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  spotCheckButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 12,
  },
  spotCheckButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Live Scan Screen
  liveScanContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  liveScanCamera: {
    flex: 1,
  },
  liveScanTopOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  liveScanBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  liveScanBackText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '500',
  },
  liveScanHeader: {
    alignItems: 'center',
    marginTop: 8,
  },
  liveScanTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  liveScanSubtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  liveScanBottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 40,
  },
  liveScanEnergyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    marginBottom: 20,
  },
  liveScanEnergyText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  liveScanCaptureButton: {
    marginBottom: 8,
  },
  liveScanCaptureOuter: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 4,
  },
  liveScanCaptureInner: {
    width: '100%',
    height: '100%',
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveScanCaptureHint: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 10,
  },
  liveScanCaptureButtonActive: {
    transform: [{ scale: 1.1 }],
  },
  liveScanCaptureButtonDisabled: {
    opacity: 0.7,
  },
  liveScanCaptureOuterActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.4)',
    borderWidth: 3,
    borderColor: '#EF4444',
  },
  liveScanCaptureOuterDisabled: {
    backgroundColor: 'rgba(148, 163, 184, 0.3)',
  },
  frameCounter: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  frameDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  liveScanActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  liveScanDoneButton: {
    borderRadius: 28,
    overflow: 'hidden',
  },
  liveScanDoneGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 28,
    gap: 8,
  },
  liveScanDoneText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  photoCountBadge: {
    position: 'absolute',
    top: 100,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  photoThumbnailStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photoThumbnail: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  photoCountText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  liveScanGuides: {
    ...StyleSheet.absoluteFillObject,
    margin: 40,
  },
  liveScanCorner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: 'rgba(255, 255, 255, 0.6)',
  },
  liveScanCornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 8,
  },
  liveScanCornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 8,
  },
  liveScanCornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 8,
  },
  liveScanCornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 8,
  },

  // Capture Screen
  captureContainer: {
    flex: 1,
  },
  captureHero: {
    paddingBottom: 40,
    position: 'relative',
  },
  captureHeroContent: {
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  captureTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 20,
    textAlign: 'center',
  },
  captureSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 8,
    textAlign: 'center',
  },
  energyBadge: {
    marginTop: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    fontSize: 14,
    color: '#ffffff',
    overflow: 'hidden',
  },
  captureScrollView: {
    flex: 1,
  },
  captureScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
  },
  captureOptionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  captureOption: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  captureOptionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  captureOptionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 2,
  },
  captureOptionHint: {
    fontSize: 12,
    color: '#64748b',
  },
  uploadVideoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 8,
    gap: 8,
  },
  uploadVideoText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },

  // Analyzing Screen
  analyzingContainer: {
    flex: 1,
  },
  analyzingGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  analyzingContent: {
    alignItems: 'center',
    padding: 20,
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  analyzingLogoWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
    position: 'relative',
  },
  analyzingGlowCircle: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    overflow: 'hidden',
  },
  analyzingGlowGradient: {
    width: '100%',
    height: '100%',
    borderRadius: 110,
  },
  analyzingDotsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  analyzingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  analyzingLogoContainer: {
    width: 180,
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginBottom: 40,
  },
  analyzingLogo: {
    width: 180,
    height: 180,
  },
  checkmarkContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -40,
    marginLeft: -40,
  },
  analyzingTextNew: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
  },
  loadingDotsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#64748b',
  },
  analyzingSubtextNew: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
  },
  analyzingImageContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  analyzingImage: {
    width: 200,
    height: 200,
    borderRadius: 20,
  },
  imageCountBadge: {
    position: 'absolute',
    bottom: -10,
    right: -10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  imageCountText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  analyzingSpinner: {
    marginBottom: 20,
  },
  analyzingText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  analyzingSubtext: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
  },

  // Chat/Result Header
  chatHeroGradient: {
    paddingBottom: 12,
    position: 'relative',
    overflow: 'hidden',
  },
  chatHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chatBackButton: {
    padding: 4,
  },
  chatHeaderCenter: {
    flex: 1,
    alignItems: 'center',
  },
  chatHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#ffffff',
  },
  chatHeaderSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
  },
  spotCheckMiniButton: {
    padding: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
  },

  // Energy Picker Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  energyPickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  energyPickerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 20,
  },
  energyOptions: {
    flexDirection: 'row',
    gap: 12,
  },
  energyOption: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  energyOptionGradient: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
  energyOptionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 12,
    textAlign: 'center',
  },
  energyOptionSubtext: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 4,
  },
  energyOptionSelected: {
    borderWidth: 3,
    borderColor: '#1E5AA8',
  },
  energyOptionGradientSelected: {
    opacity: 1,
  },

  // Context Picker Modal
  contextPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  contextPickerContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  contextPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  contextPickerClose: {
    padding: 4,
  },
  contextPickerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  contextPickerScroll: {
    paddingHorizontal: 20,
  },
  contextSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#475569',
    marginTop: 20,
    marginBottom: 12,
  },
  mealTypeOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  mealTypeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  mealTypeOptionSelected: {
    backgroundColor: '#ffffff',
    borderWidth: 2,
  },
  mealTypeLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  servingsOptions: {
    flexDirection: 'row',
    gap: 10,
  },
  servingOption: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  servingOptionSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#1E5AA8',
  },
  servingLabel: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  servingLabelSelected: {
    color: '#1E5AA8',
  },
  servingSubtext: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  servingSubtextSelected: {
    color: '#1E5AA8',
  },
  householdSetupButton: {
    marginTop: 24,
    marginBottom: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  householdSetupContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  householdSetupText: {
    flex: 1,
  },
  householdSetupLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#475569',
  },
  householdSetupHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  contextContinueButton: {
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  contextContinueButtonDisabled: {
    opacity: 0.5,
  },
  contextContinueGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 8,
  },
  contextContinueText: {
    fontSize: 17,
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
  messageImage: {
    width: 150,
    height: 150,
    borderRadius: 12,
    marginBottom: 8,
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

  // Input Area
  inputContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#f8fafc',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 6,
  },
  inputIconButton: {
    padding: 8,
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

  // Options screen styles
  optionsContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  optionsHeader: {
    paddingBottom: 16,
  },
  optionsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  optionsBackButton: {
    padding: 8,
  },
  optionsHeaderCenter: {
    flex: 1,
    alignItems: 'center',
  },
  optionsHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  optionsHeaderSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  optionsRescanButton: {
    padding: 8,
  },
  moodFilterContainer: {
    paddingHorizontal: 12,
    gap: 8,
    paddingBottom: 8,
  },
  moodFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    gap: 6,
  },
  moodFilterChipActive: {
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  moodFilterText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  moodFilterTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  optionsScrollView: {
    flex: 1,
  },
  optionsScrollContent: {
    padding: 16,
    paddingBottom: 40,
  },

  // Recipe card styles
  recipeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    position: 'relative',
  },
  recipeCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  recipeCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeCardMeta: {
    flex: 1,
    marginLeft: 12,
  },
  recipeCardBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  recipeTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recipeTimeText: {
    fontSize: 13,
    color: '#64748b',
  },
  recipeDifficultyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  recipeDifficultyText: {
    fontSize: 12,
    fontWeight: '600',
  },
  difficultyEasy: {
    backgroundColor: '#dcfce7',
  },
  difficultyMedium: {
    backgroundColor: '#fef3c7',
  },
  difficultyModerate: {
    backgroundColor: '#fee2e2',
  },
  recipeCardName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  recipeCardTagline: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 12,
  },
  ingredientPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  ingredientChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ingredientChipText: {
    fontSize: 12,
    color: '#475569',
  },
  ingredientChipMore: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ingredientChipMoreText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  recipeCardNumber: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeCardNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
  },

  // No options message
  noOptionsMessage: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noOptionsText: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 12,
  },
  noOptionsLink: {
    fontSize: 14,
    color: '#3b82f6',
    marginTop: 8,
    fontWeight: '500',
  },

  // Mood suggestions
  moodSuggestionsSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  moodSuggestionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 16,
  },
  moodSuggestionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  moodSuggestionCard: {
    width: '47%' as any,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  // Refine section styles
  refineSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  refineSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  feedbackInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingLeft: 16,
    marginBottom: 12,
  },
  feedbackInput: {
    flex: 1,
    fontSize: 15,
    color: '#1e293b',
    paddingVertical: 14,
  },
  feedbackSubmitButton: {
    backgroundColor: '#FF6B35',
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  feedbackSubmitButtonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  refineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  refineButtonText: {
    flex: 1,
    fontSize: 15,
    color: '#64748b',
  },
  // Refine Modal styles
  refineModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  refineModalContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 34,
  },
  refineModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  refineModalClose: {
    padding: 4,
  },
  refineModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  refineModalScroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  refineOptionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 16,
    marginBottom: 10,
  },
  refineOptionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  refineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  refineChipSelected: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35',
  },
  refineChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  refineChipTextSelected: {
    color: '#ffffff',
  },
  refineApplyButton: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 14,
    overflow: 'hidden',
  },
  refineApplyGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  refineApplyText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  regeneratingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  regeneratingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  regeneratingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  moodSuggestionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  moodSuggestionText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#475569',
    textAlign: 'center',
  },

  // Detail screen styles
  detailContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  recipeImageBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 400,
    width: '100%',
  },
  detailHeader: {
    paddingBottom: 24,
  },
  detailHeaderWithImage: {
    paddingBottom: 120,
  },
  detailHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  detailBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  detailFavoriteButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    padding: 8,
  },
  detailBackText: {
    fontSize: 16,
    color: '#ffffff',
    marginLeft: 4,
  },
  detailHeroContent: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  detailIconLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  detailTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  detailTagline: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: 16,
  },
  detailMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailMetaText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  detailMetaDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 12,
  },
  detailScrollView: {
    flex: 1,
  },
  detailScrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  detailSection: {
    marginBottom: 24,
  },
  detailSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  ingredientsList: {},
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  ingredientBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
    marginRight: 12,
  },
  ingredientText: {
    fontSize: 16,
    color: '#334155',
    flex: 1,
  },
  stepRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  stepText: {
    fontSize: 16,
    color: '#334155',
    flex: 1,
    lineHeight: 24,
  },
  tipsCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  tipsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  tipsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#b45309',
  },
  tipsText: {
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
  },
  startCookingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 24,
    gap: 8,
  },
  startCookingText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },

  // Review screen styles
  reviewContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  reviewHeader: {
    paddingBottom: 20,
    paddingHorizontal: 16,
  },
  reviewBackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  reviewBackText: {
    fontSize: 16,
    color: '#ffffff',
    marginLeft: 4,
  },
  reviewTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 16,
  },
  reviewSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  reviewScrollView: {
    flex: 1,
  },
  reviewScrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  reviewImageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  reviewImageWrapper: {
    width: '47%' as any,
    aspectRatio: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
    position: 'relative',
  },
  reviewImage: {
    width: '100%',
    height: '100%',
  },
  reviewImageNumber: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewImageNumberText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  reviewImageDelete: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewHelpSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
    gap: 12,
  },
  reviewHelpText: {
    flex: 1,
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
  },
  reviewActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 32,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 12,
  },
  reviewScanMoreButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  reviewScanMoreText: {
    fontSize: 16,
    fontWeight: '600',
  },
  reviewAnalyzeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  reviewAnalyzeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Spot Check Result styles
  spotCheckResultContainer: {
    flex: 1,
    backgroundColor: '#D4E8ED',
  },
  spotCheckResultHeader: {
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  spotCheckHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  spotCheckBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotCheckHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  spotCheckRetryButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotCheckQuestionBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    alignSelf: 'center',
  },
  spotCheckQuestionText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    fontStyle: 'italic',
  },
  spotCheckScrollView: {
    flex: 1,
  },
  spotCheckScrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  spotCheckImageWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1e293b',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  spotCheckImage: {
    width: '100%',
    height: '100%',
  },
  spotCheckResponseCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    marginTop: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  spotCheckResponseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  spotCheckAvatarIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotCheckResponseLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  spotCheckResponseText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#1e293b',
  },
  spotCheckActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  spotCheckGotItButton: {
    flex: 1,
    backgroundColor: '#22c55e',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  spotCheckGotItText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  spotCheckAskMoreButton: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingVertical: 16,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  spotCheckAskMoreText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
  },
});
