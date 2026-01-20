/**
 * PlanItScreen - Project Planning with "Surprise Me" feature
 * Users can describe their project vision or get random project ideas
 */

import React, { useState, useRef, useLayoutEffect } from 'react';
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
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { readAsStringAsync, EncodingType } from 'expo-file-system';
import HouseIcon from '../components/HouseIcon';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_API_KEY || '');

interface ProjectPlan {
  projectName: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  estimatedTime: string;
  estimatedCost: string;
  materials: { item: string; estimatedCost?: string }[];
  tools: string[];
  steps: { title: string; description: string }[];
  tips: string[];
  safetyNotes?: string[];
}

// Project categories
const PROJECT_CATEGORIES = [
  { id: 'paint', icon: '🎨', label: 'Painting', description: 'Walls, furniture, cabinets' },
  { id: 'organize', icon: '📦', label: 'Organization', description: 'Storage, closets, garage' },
  { id: 'outdoor', icon: '🌱', label: 'Outdoor', description: 'Landscaping, patio, deck' },
  { id: 'bathroom', icon: '🚿', label: 'Bathroom', description: 'Updates, fixtures, tile' },
  { id: 'kitchen', icon: '🍳', label: 'Kitchen', description: 'Cabinets, backsplash, faucet' },
  { id: 'decor', icon: '🖼️', label: 'Decor', description: 'Shelves, lighting, accent walls' },
];

// Random project ideas for "Surprise Me"
const SURPRISE_PROJECTS = [
  'Create a cozy reading nook with built-in shelving',
  'Build a backyard fire pit area',
  'Install a smart home lighting system',
  'Create a home coffee bar',
  'Build floating shelves for your living room',
  'Create a mudroom organization system',
  'Install a tile backsplash in the kitchen',
  'Build a raised garden bed',
  'Create a home office space in a closet',
  'Install crown molding in a room',
  'Build a window seat with storage',
  'Create an accent wall with wood planks',
  'Install a new bathroom vanity',
  'Build a pergola for your patio',
  'Create a pet washing station in the garage',
  'Install under-cabinet lighting in the kitchen',
  'Build a deck railing planter box',
  'Create a charging station for electronics',
  'Install a ceiling fan',
  'Build a headboard with integrated lighting',
];

export default function PlanItScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [mode, setMode] = useState<'input' | 'camera' | 'result'>('input');
  const [projectText, setProjectText] = useState('');
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<ProjectPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const surpriseAnim = useRef(new Animated.Value(1)).current;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Plan It',
      headerStyle: {
        backgroundColor: '#00CBA9',
      },
    });
  }, [navigation]);

  const animateTransition = (toMode: 'input' | 'camera' | 'result') => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: -50,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setMode(toMode);
      slideAnim.setValue(50);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const handleCameraPress = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setError('Camera permission is required to scan your space');
        return;
      }
    }
    animateTransition('camera');
  };

  const handleGalleryPress = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      analyzeImage(result.assets[0].uri);
    }
  };

  const handleCapture = async () => {
    if (cameraRef.current && cameraReady) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          base64: true,
        });
        if (photo?.uri) {
          animateTransition('input');
          analyzeImage(photo.uri, photo.base64);
        }
      } catch (err) {
        console.error('Camera capture error:', err);
        setError('Failed to capture image');
      }
    }
  };

  const analyzeImage = async (uri: string, base64Data?: string) => {
    setLoading(true);
    setError(null);

    try {
      let imageBase64 = base64Data;
      if (!imageBase64) {
        imageBase64 = await readAsStringAsync(uri, {
          encoding: EncodingType.Base64,
        });
      }

      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      const prompt = `You are a helpful home improvement expert. Look at this image of a space and suggest an exciting DIY project the homeowner could do to improve it.

Create a detailed project plan based on what you see. Consider the current state of the space and suggest something achievable for a DIY enthusiast.

Return your response as a JSON object with this exact structure:
{
  "projectName": "Name of the project",
  "description": "Brief 2-3 sentence description of the project and why it would improve the space",
  "difficulty": "Easy" or "Medium" or "Hard",
  "estimatedTime": "Time estimate (e.g., '2-4 hours', '1 weekend')",
  "estimatedCost": "Cost range (e.g., '$50-100')",
  "materials": [
    { "item": "Material 1", "estimatedCost": "$X" },
    { "item": "Material 2", "estimatedCost": "$X" }
  ],
  "tools": ["Tool 1", "Tool 2"],
  "steps": [
    { "title": "Step 1 title", "description": "Detailed description of step 1" },
    { "title": "Step 2 title", "description": "Detailed description of step 2" }
  ],
  "tips": ["Pro tip 1", "Pro tip 2"],
  "safetyNotes": ["Safety note 1", "Safety note 2"]
}

Make the project achievable for someone with basic DIY skills. Be specific and practical.
IMPORTANT: Return ONLY valid JSON, no markdown formatting.`;

      const result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            mimeType: 'image/jpeg',
            data: imageBase64,
          },
        },
      ]);

      const responseText = result.response.text();
      const cleanedResponse = responseText.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanedResponse) as ProjectPlan;

      setPlan(parsed);
      animateTransition('result');
    } catch (err) {
      console.error('Image analysis error:', err);
      setError('Failed to analyze image. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePlanProject = async (query?: string) => {
    const projectQuery = query || projectText.trim();
    if (!projectQuery) return;

    setLoading(true);
    setError(null);

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      const prompt = `You are a helpful home improvement expert. The user wants to do this project: "${projectQuery}"

Create a detailed, actionable project plan for them.

Return your response as a JSON object with this exact structure:
{
  "projectName": "Official name of the project",
  "description": "Brief 2-3 sentence description of the project and its benefits",
  "difficulty": "Easy" or "Medium" or "Hard",
  "estimatedTime": "Time estimate (e.g., '2-4 hours', '1 weekend')",
  "estimatedCost": "Cost range (e.g., '$50-100', '$200-500')",
  "materials": [
    { "item": "Material 1", "estimatedCost": "$X" },
    { "item": "Material 2", "estimatedCost": "$X" }
  ],
  "tools": ["Tool 1", "Tool 2", "Tool 3"],
  "steps": [
    { "title": "Step 1 title", "description": "Detailed description of step 1" },
    { "title": "Step 2 title", "description": "Detailed description of step 2" },
    { "title": "Step 3 title", "description": "Detailed description of step 3" }
  ],
  "tips": ["Pro tip 1", "Pro tip 2", "Pro tip 3"],
  "safetyNotes": ["Safety note 1", "Safety note 2"]
}

Make the plan achievable for someone with basic DIY skills. Be specific, practical, and encouraging.
IMPORTANT: Return ONLY valid JSON, no markdown formatting.`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const cleanedResponse = responseText.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanedResponse) as ProjectPlan;

      setPlan(parsed);
      setProjectText(parsed.projectName);
      animateTransition('result');
    } catch (err) {
      console.error('Planning error:', err);
      setError('Failed to create plan. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSurpriseMe = () => {
    // Animate the button
    Animated.sequence([
      Animated.timing(surpriseAnim, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(surpriseAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    // Pick a random project
    const randomIndex = Math.floor(Math.random() * SURPRISE_PROJECTS.length);
    const randomProject = SURPRISE_PROJECTS[randomIndex];
    setProjectText(randomProject);
    handlePlanProject(randomProject);
  };

  const handleCategoryPress = (category: typeof PROJECT_CATEGORIES[0]) => {
    const prompt = `A ${category.label.toLowerCase()} project for my home - ${category.description}`;
    setProjectText(prompt);
    handlePlanProject(prompt);
  };

  const handleNewPlan = () => {
    setPlan(null);
    setProjectText('');
    animateTransition('input');
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy':
        return '#10b981';
      case 'Medium':
        return '#f59e0b';
      case 'Hard':
        return '#ef4444';
      default:
        return '#64748b';
    }
  };

  // Camera View
  if (mode === 'camera') {
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          onCameraReady={() => setCameraReady(true)}
        >
          <View style={styles.cameraOverlay}>
            <View style={styles.cameraHeader}>
              <TouchableOpacity
                style={styles.cameraBackButton}
                onPress={() => animateTransition('input')}
              >
                <Ionicons name="arrow-back" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.cameraTitle}>Scan your space</Text>
              <View style={{ width: 40 }} />
            </View>

            <View style={styles.cameraFrame}>
              <View style={[styles.cameraCorner, styles.topLeft]} />
              <View style={[styles.cameraCorner, styles.topRight]} />
              <View style={[styles.cameraCorner, styles.bottomLeft]} />
              <View style={[styles.cameraCorner, styles.bottomRight]} />
            </View>

            <View style={styles.cameraControls}>
              <TouchableOpacity
                style={styles.galleryButton}
                onPress={handleGalleryPress}
              >
                <Ionicons name="images" size={28} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.captureButton}
                onPress={handleCapture}
                disabled={!cameraReady}
              >
                <View style={styles.captureButtonInner} />
              </TouchableOpacity>

              <View style={{ width: 56 }} />
            </View>
          </View>
        </CameraView>
      </View>
    );
  }

  // Result View
  if (mode === 'result' && plan) {
    return (
      <Animated.View
        style={[
          styles.container,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.resultContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <LinearGradient
            colors={['#00CBA9', '#1E90FF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.resultHeader}
          >
            <HouseIcon
              icon="clipboard"
              size={72}
              gradientColors={['#ffffff', '#a7f3d0', '#6ee7b7']}
            />
            <Text style={styles.resultTitle}>{plan.projectName}</Text>
            <View style={styles.resultBadges}>
              <View style={[styles.difficultyBadge, { backgroundColor: getDifficultyColor(plan.difficulty) }]}>
                <Text style={styles.badgeText}>{plan.difficulty}</Text>
              </View>
              <View style={styles.timeBadge}>
                <Ionicons name="time-outline" size={14} color="#fff" />
                <Text style={styles.badgeText}>{plan.estimatedTime}</Text>
              </View>
              <View style={styles.costBadge}>
                <Text style={styles.badgeText}>{plan.estimatedCost}</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Description */}
          <View style={styles.resultSection}>
            <Text style={styles.resultDescription}>{plan.description}</Text>
          </View>

          {/* Materials */}
          <View style={styles.resultSection}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="cart" size={24} color="#00CBA9" />
              <Text style={styles.resultSectionTitle}>Materials</Text>
            </View>
            {plan.materials.map((material, index) => (
              <View key={index} style={styles.materialItem}>
                <View style={styles.checkbox}>
                  <Ionicons name="square-outline" size={20} color="#94a3b8" />
                </View>
                <Text style={styles.materialText}>{material.item}</Text>
                {material.estimatedCost && (
                  <Text style={styles.materialCost}>{material.estimatedCost}</Text>
                )}
              </View>
            ))}
          </View>

          {/* Tools */}
          <View style={styles.resultSection}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="construct" size={24} color="#1E90FF" />
              <Text style={styles.resultSectionTitle}>Tools Needed</Text>
            </View>
            <View style={styles.toolsGrid}>
              {plan.tools.map((tool, index) => (
                <View key={index} style={styles.toolChip}>
                  <Ionicons name="build-outline" size={16} color="#1E90FF" />
                  <Text style={styles.toolText}>{tool}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Steps */}
          <View style={styles.resultSection}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="list" size={24} color="#7B68EE" />
              <Text style={styles.resultSectionTitle}>Step-by-Step Guide</Text>
            </View>
            {plan.steps.map((step, index) => (
              <View key={index} style={styles.stepItem}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDescription}>{step.description}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Pro Tips */}
          {plan.tips && plan.tips.length > 0 && (
            <View style={styles.resultSection}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="bulb" size={24} color="#FFA500" />
                <Text style={styles.resultSectionTitle}>Pro Tips</Text>
              </View>
              {plan.tips.map((tip, index) => (
                <View key={index} style={styles.tipItem}>
                  <Text style={styles.tipBullet}>💡</Text>
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Safety Notes */}
          {plan.safetyNotes && plan.safetyNotes.length > 0 && (
            <View style={[styles.resultSection, styles.safetySection]}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="warning" size={24} color="#ef4444" />
                <Text style={styles.resultSectionTitle}>Safety Notes</Text>
              </View>
              {plan.safetyNotes.map((note, index) => (
                <View key={index} style={styles.safetyItem}>
                  <Ionicons name="alert-circle" size={18} color="#ef4444" />
                  <Text style={styles.safetyText}>{note}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.newPlanButton}
              onPress={handleNewPlan}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.newPlanButtonText}>Plan Another Project</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.fixItButton}
              onPress={() => navigation.navigate('Diagnosis', { category: 'other' })}
            >
              <Ionicons name="construct" size={20} color="#00CBA9" />
              <Text style={styles.fixItButtonText}>Need Help Fixing Something?</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </Animated.View>
    );
  }

  // Input View (default)
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Animated.ScrollView
        style={[
          styles.scrollView,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
        contentContainerStyle={styles.inputContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero Section */}
        <LinearGradient
          colors={['#00CBA9', '#1E90FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroSection}
        >
          <HouseIcon
            icon="clipboard"
            size={84}
            gradientColors={['#ffffff', '#a7f3d0', '#6ee7b7']}
          />
          <Text style={styles.heroTitle}>Plan Your Project</Text>
          <Text style={styles.heroSubtitle}>
            Describe your vision or scan your space
          </Text>
        </LinearGradient>

        {/* Surprise Me Button */}
        <Animated.View
          style={[
            styles.surpriseContainer,
            { transform: [{ scale: surpriseAnim }] },
          ]}
        >
          <TouchableOpacity
            style={styles.surpriseButton}
            onPress={handleSurpriseMe}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#FF6B35', '#FFA500']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.surpriseGradient}
            >
              <Ionicons name="shuffle" size={28} color="#fff" />
              <View style={styles.surpriseTextContainer}>
                <Text style={styles.surpriseText}>Surprise Me!</Text>
                <Text style={styles.surpriseSubtext}>Get a random project idea</Text>
              </View>
              <Ionicons name="sparkles" size={24} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>

        {/* Project Input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>Or describe your project idea:</Text>
          <View style={styles.textInputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder="e.g., I want to paint my living room blue..."
              placeholderTextColor="#94a3b8"
              value={projectText}
              onChangeText={setProjectText}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          <View style={styles.inputActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleCameraPress}
            >
              <Ionicons name="camera" size={24} color="#00CBA9" />
              <Text style={styles.actionButtonText}>Scan Space</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleGalleryPress}
            >
              <Ionicons name="images" size={24} color="#00CBA9" />
              <Text style={styles.actionButtonText}>Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.planButton, !projectText.trim() && styles.planButtonDisabled]}
              onPress={() => handlePlanProject()}
              disabled={!projectText.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                  <Text style={styles.planButtonText}>Plan</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Error Message */}
        {error && (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle" size={20} color="#ef4444" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Project Categories */}
        <View style={styles.categoriesSection}>
          <Text style={styles.categoriesSectionTitle}>Project Categories</Text>
          <View style={styles.categoriesGrid}>
            {PROJECT_CATEGORIES.map((category) => (
              <TouchableOpacity
                key={category.id}
                style={styles.categoryCard}
                onPress={() => handleCategoryPress(category)}
                activeOpacity={0.7}
              >
                <Text style={styles.categoryIcon}>{category.icon}</Text>
                <Text style={styles.categoryLabel}>{category.label}</Text>
                <Text style={styles.categoryDescription} numberOfLines={1}>
                  {category.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </Animated.ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8F4F8',
  },
  scrollView: {
    flex: 1,
  },
  inputContent: {
    paddingBottom: 20,
  },
  resultContent: {
    paddingBottom: 20,
  },

  // Hero Section
  heroSection: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
    textAlign: 'center',
  },

  // Surprise Me Button
  surpriseContainer: {
    paddingHorizontal: 20,
    marginTop: -15,
  },
  surpriseButton: {
    borderRadius: 16,
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  surpriseGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 12,
  },
  surpriseTextContainer: {
    flex: 1,
  },
  surpriseText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  surpriseSubtext: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
  },

  // Input Section
  inputSection: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 12,
  },
  textInputContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  textInput: {
    fontSize: 16,
    color: '#1e293b',
    minHeight: 80,
  },
  inputActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00CBA9',
  },
  planButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00CBA9',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  planButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  planButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

  // Error
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    marginHorizontal: 20,
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#ef4444',
  },

  // Categories Section
  categoriesSection: {
    paddingHorizontal: 20,
    marginTop: 32,
  },
  categoriesSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 16,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryCard: {
    width: (SCREEN_WIDTH - 52) / 2,
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
  categoryIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  categoryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  categoryDescription: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },

  // Camera Styles
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'space-between',
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  cameraBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  cameraFrame: {
    width: SCREEN_WIDTH - 80,
    height: SCREEN_WIDTH - 80,
    alignSelf: 'center',
    position: 'relative',
  },
  cameraCorner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#00CBA9',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  cameraControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingBottom: 50,
    paddingHorizontal: 40,
  },
  galleryButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
  },

  // Result Styles
  resultHeader: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  resultTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
    textAlign: 'center',
  },
  resultBadges: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  difficultyBadge: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 4,
  },
  costBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  resultSection: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  safetySection: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  resultSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  resultDescription: {
    fontSize: 16,
    color: '#475569',
    lineHeight: 24,
  },
  materialItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  materialText: {
    flex: 1,
    fontSize: 15,
    color: '#1e293b',
  },
  materialCost: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748b',
  },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  toolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
  },
  toolText: {
    fontSize: 14,
    color: '#1E90FF',
    fontWeight: '500',
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    gap: 12,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#7B68EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8,
  },
  tipBullet: {
    fontSize: 16,
  },
  tipText: {
    flex: 1,
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
  },
  safetyItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 10,
  },
  safetyText: {
    flex: 1,
    fontSize: 15,
    color: '#991b1b',
    lineHeight: 22,
  },
  actionButtons: {
    paddingHorizontal: 20,
    marginTop: 24,
    gap: 12,
  },
  newPlanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00CBA9',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  newPlanButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  fixItButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#00CBA9',
    gap: 8,
  },
  fixItButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#00CBA9',
  },
});
