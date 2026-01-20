/**
 * LearnItScreen - "How does it work?"
 * Users can scan items with camera, type, or use voice to learn how things work
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

interface LearnResult {
  itemName: string;
  overview: string;
  howItWorks: string[];
  funFacts: string[];
  maintenanceTips?: string[];
  relatedItems?: string[];
}

// Popular categories for quick access
const POPULAR_CATEGORIES = [
  { id: 'appliances', icon: '🔌', label: 'Appliances', examples: 'Refrigerator, Washer, Dryer' },
  { id: 'hvac', icon: '❄️', label: 'HVAC', examples: 'AC, Furnace, Thermostat' },
  { id: 'plumbing', icon: '🚰', label: 'Plumbing', examples: 'Water Heater, Toilet, Faucet' },
  { id: 'electrical', icon: '⚡', label: 'Electrical', examples: 'Circuit Breaker, Outlet, Switch' },
  { id: 'automotive', icon: '🚗', label: 'Automotive', examples: 'Engine, Brakes, Battery' },
  { id: 'tools', icon: '🔧', label: 'Tools', examples: 'Drill, Saw, Wrench' },
];

export default function LearnItScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [mode, setMode] = useState<'input' | 'camera' | 'result'>('input');
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LearnResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'Learn It',
      headerStyle: {
        backgroundColor: '#4A90E2',
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
        setError('Camera permission is required to scan items');
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

      const prompt = `You are a helpful expert that explains how things work in a clear, engaging way.

Look at this image and identify what item/object is shown. Then explain how it works.

Return your response as a JSON object with this exact structure:
{
  "itemName": "Name of the item",
  "overview": "Brief 2-3 sentence overview of what this item is and its primary purpose",
  "howItWorks": [
    "Step 1 of how it works",
    "Step 2 of how it works",
    "Step 3 of how it works"
  ],
  "funFacts": [
    "Interesting fact 1",
    "Interesting fact 2"
  ],
  "maintenanceTips": [
    "Tip 1 for maintaining this item",
    "Tip 2 for maintaining this item"
  ],
  "relatedItems": ["Related item 1", "Related item 2"]
}

Make the explanation accessible to someone with no technical background. Be engaging and informative.
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
      const parsed = JSON.parse(cleanedResponse) as LearnResult;

      setResult(parsed);
      setSearchText(parsed.itemName);
      animateTransition('result');
    } catch (err) {
      console.error('Image analysis error:', err);
      setError('Failed to analyze image. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query?: string) => {
    const searchQuery = query || searchText.trim();
    if (!searchQuery) return;

    setLoading(true);
    setError(null);

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

      const prompt = `You are a helpful expert that explains how things work in a clear, engaging way.

The user wants to learn about: "${searchQuery}"

Explain how this item/system works in detail.

Return your response as a JSON object with this exact structure:
{
  "itemName": "Proper name of the item",
  "overview": "Brief 2-3 sentence overview of what this item is and its primary purpose",
  "howItWorks": [
    "Step 1 of how it works",
    "Step 2 of how it works",
    "Step 3 of how it works",
    "Step 4 if needed",
    "Step 5 if needed"
  ],
  "funFacts": [
    "Interesting fact 1",
    "Interesting fact 2",
    "Interesting fact 3"
  ],
  "maintenanceTips": [
    "Tip 1 for maintaining/caring for this item",
    "Tip 2 for maintaining/caring for this item"
  ],
  "relatedItems": ["Related item 1", "Related item 2", "Related item 3"]
}

Make the explanation accessible to someone with no technical background. Be engaging and informative.
IMPORTANT: Return ONLY valid JSON, no markdown formatting.`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const cleanedResponse = responseText.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanedResponse) as LearnResult;

      setResult(parsed);
      setSearchText(parsed.itemName);
      animateTransition('result');
    } catch (err) {
      console.error('Search error:', err);
      setError('Failed to get information. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryPress = (category: typeof POPULAR_CATEGORIES[0]) => {
    setSearchText(category.examples.split(',')[0].trim());
    handleSearch(category.examples.split(',')[0].trim());
  };

  const handleNewSearch = () => {
    setResult(null);
    setSearchText('');
    animateTransition('input');
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
              <Text style={styles.cameraTitle}>Point at an item</Text>
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
  if (mode === 'result' && result) {
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
            colors={['#4A90E2', '#7B68EE']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.resultHeader}
          >
            <HouseIcon
              icon="bulb"
              size={72}
              gradientColors={['#ffffff', '#e0e7ff', '#c7d2fe']}
            />
            <Text style={styles.resultTitle}>{result.itemName}</Text>
          </LinearGradient>

          {/* Overview */}
          <View style={styles.resultSection}>
            <Text style={styles.resultSectionTitle}>Overview</Text>
            <Text style={styles.resultOverview}>{result.overview}</Text>
          </View>

          {/* How It Works */}
          <View style={styles.resultSection}>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="cog" size={24} color="#4A90E2" />
              <Text style={styles.resultSectionTitle}>How It Works</Text>
            </View>
            {result.howItWorks.map((step, index) => (
              <View key={index} style={styles.stepItem}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>

          {/* Fun Facts */}
          {result.funFacts && result.funFacts.length > 0 && (
            <View style={styles.resultSection}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="sparkles" size={24} color="#FFA500" />
                <Text style={styles.resultSectionTitle}>Fun Facts</Text>
              </View>
              {result.funFacts.map((fact, index) => (
                <View key={index} style={styles.factItem}>
                  <Text style={styles.factBullet}>✨</Text>
                  <Text style={styles.factText}>{fact}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Maintenance Tips */}
          {result.maintenanceTips && result.maintenanceTips.length > 0 && (
            <View style={styles.resultSection}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="construct" size={24} color="#10b981" />
                <Text style={styles.resultSectionTitle}>Maintenance Tips</Text>
              </View>
              {result.maintenanceTips.map((tip, index) => (
                <View key={index} style={styles.tipItem}>
                  <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                  <Text style={styles.tipText}>{tip}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Related Items */}
          {result.relatedItems && result.relatedItems.length > 0 && (
            <View style={styles.resultSection}>
              <View style={styles.sectionHeaderRow}>
                <Ionicons name="link" size={24} color="#7B68EE" />
                <Text style={styles.resultSectionTitle}>Related Topics</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.relatedScroll}
              >
                {result.relatedItems.map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.relatedItem}
                    onPress={() => {
                      setSearchText(item);
                      handleSearch(item);
                    }}
                  >
                    <Text style={styles.relatedItemText}>{item}</Text>
                    <Ionicons name="arrow-forward" size={16} color="#4A90E2" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.newSearchButton}
              onPress={handleNewSearch}
            >
              <Ionicons name="search" size={20} color="#fff" />
              <Text style={styles.newSearchButtonText}>Learn Something New</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.fixItButton}
              onPress={() => navigation.navigate('Diagnosis', { category: 'other' })}
            >
              <Ionicons name="construct" size={20} color="#4A90E2" />
              <Text style={styles.fixItButtonText}>Need to Fix It?</Text>
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
          colors={['#4A90E2', '#7B68EE']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroSection}
        >
          <HouseIcon
            icon="bulb"
            size={84}
            gradientColors={['#ffffff', '#e0e7ff', '#c7d2fe']}
          />
          <Text style={styles.heroTitle}>How does it work?</Text>
          <Text style={styles.heroSubtitle}>
            Scan, type, or ask about anything in your home
          </Text>
        </LinearGradient>

        {/* Search Input */}
        <View style={styles.searchSection}>
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={24} color="#94a3b8" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="What do you want to learn about?"
              placeholderTextColor="#94a3b8"
              value={searchText}
              onChangeText={setSearchText}
              onSubmitEditing={() => handleSearch()}
              returnKeyType="search"
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}>
                <Ionicons name="close-circle" size={24} color="#94a3b8" />
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.inputActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleCameraPress}
            >
              <Ionicons name="camera" size={24} color="#4A90E2" />
              <Text style={styles.actionButtonText}>Scan</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleGalleryPress}
            >
              <Ionicons name="images" size={24} color="#4A90E2" />
              <Text style={styles.actionButtonText}>Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.searchButton, !searchText.trim() && styles.searchButtonDisabled]}
              onPress={() => handleSearch()}
              disabled={!searchText.trim() || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="arrow-forward" size={20} color="#fff" />
                  <Text style={styles.searchButtonText}>Learn</Text>
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

        {/* Popular Categories */}
        <View style={styles.categoriesSection}>
          <Text style={styles.categoriesSectionTitle}>Popular Topics</Text>
          <View style={styles.categoriesGrid}>
            {POPULAR_CATEGORIES.map((category) => (
              <TouchableOpacity
                key={category.id}
                style={styles.categoryCard}
                onPress={() => handleCategoryPress(category)}
                activeOpacity={0.7}
              >
                <Text style={styles.categoryIcon}>{category.icon}</Text>
                <Text style={styles.categoryLabel}>{category.label}</Text>
                <Text style={styles.categoryExamples} numberOfLines={1}>
                  {category.examples}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Example Prompts */}
        <View style={styles.examplesSection}>
          <Text style={styles.examplesSectionTitle}>Try asking about...</Text>
          <View style={styles.exampleChips}>
            {[
              'How does a refrigerator work?',
              'How does an air conditioner cool?',
              'How does a toilet flush?',
              'How do circuit breakers work?',
            ].map((example, index) => (
              <TouchableOpacity
                key={index}
                style={styles.exampleChip}
                onPress={() => {
                  setSearchText(example);
                  handleSearch(example);
                }}
              >
                <Text style={styles.exampleChipText}>{example}</Text>
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

  // Search Section
  searchSection: {
    paddingHorizontal: 20,
    marginTop: -15,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
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
    color: '#4A90E2',
  },
  searchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A90E2',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  searchButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  searchButtonText: {
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
  categoryExamples: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },

  // Examples Section
  examplesSection: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  examplesSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 12,
  },
  exampleChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  exampleChip: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  exampleChipText: {
    fontSize: 14,
    color: '#4A90E2',
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
    borderColor: '#4A90E2',
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
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
    textAlign: 'center',
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
  resultOverview: {
    fontSize: 16,
    color: '#475569',
    lineHeight: 24,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4A90E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
  },
  factItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8,
  },
  factBullet: {
    fontSize: 16,
  },
  factText: {
    flex: 1,
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 10,
  },
  tipText: {
    flex: 1,
    fontSize: 15,
    color: '#475569',
    lineHeight: 22,
  },
  relatedScroll: {
    marginTop: 8,
  },
  relatedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginRight: 12,
    gap: 8,
  },
  relatedItemText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4A90E2',
  },
  actionButtons: {
    paddingHorizontal: 20,
    marginTop: 24,
    gap: 12,
  },
  newSearchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A90E2',
    paddingVertical: 16,
    borderRadius: 16,
    gap: 8,
  },
  newSearchButtonText: {
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
    borderColor: '#4A90E2',
    gap: 8,
  },
  fixItButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4A90E2',
  },
});
