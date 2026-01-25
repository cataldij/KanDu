/**
 * RecipeDiscovery - Help users decide what to cook
 * Supports mood-based, cuisine-based, and specific dish searches
 * Integrates with AI for recipe suggestions and shopping list creation
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { suggestRecipes, RecipeSuggestion } from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Mood options
const MOOD_OPTIONS = [
  { id: 'comfort', label: 'Comfort', emoji: '🍝', description: 'Warm & cozy' },
  { id: 'light', label: 'Light', emoji: '🥗', description: 'Fresh & healthy' },
  { id: 'bold', label: 'Bold', emoji: '🌶️', description: 'Flavorful & spicy' },
  { id: 'quick', label: 'Quick', emoji: '⚡', description: 'Under 30 min' },
];

// Cuisine options
const CUISINE_OPTIONS = [
  { id: 'italian', label: 'Italian', emoji: '🇮🇹' },
  { id: 'mexican', label: 'Mexican', emoji: '🇲🇽' },
  { id: 'thai', label: 'Thai', emoji: '🇹🇭' },
  { id: 'japanese', label: 'Japanese', emoji: '🇯🇵' },
  { id: 'chinese', label: 'Chinese', emoji: '🇨🇳' },
  { id: 'indian', label: 'Indian', emoji: '🇮🇳' },
  { id: 'american', label: 'American', emoji: '🇺🇸' },
  { id: 'mediterranean', label: 'Mediterranean', emoji: '🫒' },
];

type DiscoveryStep = 'craving' | 'loading' | 'suggestions' | 'detail';

interface Props {
  mealType: string;
  servings: string;
  energy: string;
  accentColor?: string;
  onClose: () => void;
  onStartCooking: (recipe: RecipeSuggestion) => void;
  onAddToShoppingList: (recipe: RecipeSuggestion, missingIngredients: string[]) => void;
}

export default function RecipeDiscovery({
  mealType,
  servings,
  energy,
  accentColor = '#f59e0b',
  onClose,
  onStartCooking,
  onAddToShoppingList,
}: Props) {
  const insets = useSafeAreaInsets();
  const searchInputRef = useRef<TextInput>(null);

  // State
  const [step, setStep] = useState<DiscoveryStep>('craving');
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedCuisine, setSelectedCuisine] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<RecipeSuggestion[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeSuggestion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle mood selection
  const handleMoodSelect = async (moodId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMood(moodId);
    setSelectedCuisine(null);
    await fetchSuggestions({ mood: moodId });
  };

  // Handle cuisine selection
  const handleCuisineSelect = async (cuisineId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedCuisine(cuisineId);
    setSelectedMood(null);
    await fetchSuggestions({ cuisine: cuisineId });
  };

  // Handle search submission
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await fetchSuggestions({ specificDish: searchQuery.trim() });
  };

  // Handle surprise me
  const handleSurpriseMe = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedMood(null);
    setSelectedCuisine(null);
    await fetchSuggestions({ surprise: true });
  };

  // Fetch recipe suggestions from AI
  const fetchSuggestions = async (params: {
    mood?: string;
    cuisine?: string;
    specificDish?: string;
    surprise?: boolean;
  }) => {
    setIsLoading(true);
    setStep('loading');
    setError(null);

    try {
      const result = await suggestRecipes({
        mealType,
        servings,
        energy,
        ...params,
      });

      if (result.error) {
        setError(result.error);
        setStep('craving');
      } else if (result.data && result.data.length > 0) {
        setSuggestions(result.data);
        setStep('suggestions');
      } else {
        setError('No recipes found. Try a different search.');
        setStep('craving');
      }
    } catch (err) {
      setError('Something went wrong. Please try again.');
      setStep('craving');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle recipe selection
  const handleRecipeSelect = (recipe: RecipeSuggestion) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedRecipe(recipe);
    setStep('detail');
  };

  // Handle back navigation
  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 'detail') {
      setStep('suggestions');
      setSelectedRecipe(null);
    } else if (step === 'suggestions') {
      setStep('craving');
      setSuggestions([]);
      setSelectedMood(null);
      setSelectedCuisine(null);
    } else {
      onClose();
    }
  };

  // Get missing ingredients (simple heuristic - mark less common items as "need")
  const getMissingIngredients = (recipe: RecipeSuggestion): string[] => {
    const commonPantryItems = [
      'salt', 'pepper', 'olive oil', 'vegetable oil', 'butter', 'garlic',
      'onion', 'sugar', 'flour', 'eggs', 'milk', 'water',
    ];

    return recipe.ingredients.filter(ing => {
      const lowerIng = ing.name.toLowerCase();
      return !commonPantryItems.some(pantry => lowerIng.includes(pantry));
    }).map(ing => ing.name);
  };

  // Render craving selection screen
  const renderCravingScreen = () => (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <Text style={styles.mainTitle}>What are you craving?</Text>
      <Text style={styles.subtitle}>
        {mealType} for {servings} • {energy} effort
      </Text>

      {/* Mood Section */}
      <Text style={styles.sectionTitle}>MOOD</Text>
      <View style={styles.moodGrid}>
        {MOOD_OPTIONS.map((mood) => (
          <TouchableOpacity
            key={mood.id}
            style={[
              styles.moodCard,
              selectedMood === mood.id && styles.moodCardSelected,
            ]}
            onPress={() => handleMoodSelect(mood.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.moodEmoji}>{mood.emoji}</Text>
            <Text style={styles.moodLabel}>{mood.label}</Text>
            <Text style={styles.moodDescription}>{mood.description}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Cuisine Section */}
      <Text style={styles.sectionTitle}>CUISINE</Text>
      <View style={styles.cuisineGrid}>
        {CUISINE_OPTIONS.map((cuisine) => (
          <TouchableOpacity
            key={cuisine.id}
            style={[
              styles.cuisineChip,
              selectedCuisine === cuisine.id && styles.cuisineChipSelected,
            ]}
            onPress={() => handleCuisineSelect(cuisine.id)}
            activeOpacity={0.7}
          >
            <Text style={styles.cuisineEmoji}>{cuisine.emoji}</Text>
            <Text style={[
              styles.cuisineLabel,
              selectedCuisine === cuisine.id && styles.cuisineLabelSelected,
            ]}>
              {cuisine.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search Section */}
      <Text style={styles.sectionTitle}>OR TELL ME</Text>
      <View style={styles.searchContainer}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={20} color="#64748b" style={styles.searchIcon} />
          <TextInput
            ref={searchInputRef}
            style={styles.searchInput}
            placeholder="Chicken parmesan, stir fry..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              style={styles.clearButton}
            >
              <Ionicons name="close-circle" size={20} color="#94a3b8" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.searchButton, !searchQuery.trim() && styles.searchButtonDisabled]}
          onPress={handleSearch}
          disabled={!searchQuery.trim()}
        >
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Surprise Me */}
      <TouchableOpacity
        style={styles.surpriseButton}
        onPress={handleSurpriseMe}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={['#8b5cf6', '#7c3aed']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.surpriseGradient}
        >
          <Ionicons name="shuffle" size={24} color="#fff" />
          <Text style={styles.surpriseText}>Surprise me!</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Error message */}
      {error && (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={20} color="#ef4444" />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </ScrollView>
  );

  // Render loading screen
  const renderLoadingScreen = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={accentColor} />
      <Text style={styles.loadingText}>Finding perfect recipes...</Text>
      <Text style={styles.loadingSubtext}>
        {selectedMood && `Looking for ${selectedMood} food`}
        {selectedCuisine && `Exploring ${selectedCuisine} cuisine`}
        {searchQuery && `Searching for "${searchQuery}"`}
        {!selectedMood && !selectedCuisine && !searchQuery && 'Picking something great'}
      </Text>
    </View>
  );

  // Render suggestions screen
  const renderSuggestionsScreen = () => (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 20 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.suggestionsTitle}>Here's what I suggest</Text>
      <Text style={styles.suggestionsSubtitle}>
        Tap a recipe to see ingredients
      </Text>

      {suggestions.map((recipe, index) => (
        <TouchableOpacity
          key={index}
          style={styles.recipeCard}
          onPress={() => handleRecipeSelect(recipe)}
          activeOpacity={0.7}
        >
          <LinearGradient
            colors={['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.03)']}
            style={styles.recipeCardGradient}
          >
            <View style={styles.recipeCardHeader}>
              <Text style={styles.recipeCardEmoji}>{recipe.emoji || '🍽️'}</Text>
              <View style={styles.recipeCardInfo}>
                <Text style={styles.recipeCardName}>{recipe.name}</Text>
                <Text style={styles.recipeCardMeta}>
                  {recipe.prepTime + recipe.cookTime} min • {recipe.difficulty}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.4)" />
            </View>
            {recipe.description && (
              <Text style={styles.recipeCardDescription} numberOfLines={2}>
                {recipe.description}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      ))}

      {/* Try different button */}
      <TouchableOpacity
        style={styles.tryDifferentButton}
        onPress={() => {
          setStep('craving');
          setSuggestions([]);
        }}
      >
        <Ionicons name="refresh" size={20} color="#64748b" />
        <Text style={styles.tryDifferentText}>Show me different ideas</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // Render recipe detail screen
  const renderDetailScreen = () => {
    if (!selectedRecipe) return null;

    const missingIngredients = getMissingIngredients(selectedRecipe);
    const hasAllIngredients = missingIngredients.length === 0;

    return (
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Recipe Header */}
        <View style={styles.detailHeader}>
          <Text style={styles.detailEmoji}>{selectedRecipe.emoji || '🍽️'}</Text>
          <Text style={styles.detailName}>{selectedRecipe.name}</Text>
          <View style={styles.detailMeta}>
            <View style={styles.detailMetaItem}>
              <Ionicons name="time-outline" size={16} color="#94a3b8" />
              <Text style={styles.detailMetaText}>
                {selectedRecipe.prepTime + selectedRecipe.cookTime} min
              </Text>
            </View>
            <View style={styles.detailMetaItem}>
              <Ionicons name="speedometer-outline" size={16} color="#94a3b8" />
              <Text style={styles.detailMetaText}>{selectedRecipe.difficulty}</Text>
            </View>
            <View style={styles.detailMetaItem}>
              <Ionicons name="people-outline" size={16} color="#94a3b8" />
              <Text style={styles.detailMetaText}>{selectedRecipe.servings} servings</Text>
            </View>
          </View>
        </View>

        {/* Description */}
        {selectedRecipe.description && (
          <Text style={styles.detailDescription}>{selectedRecipe.description}</Text>
        )}

        {/* Ingredients */}
        <Text style={styles.ingredientsTitle}>Ingredients</Text>
        <View style={styles.ingredientsList}>
          {selectedRecipe.ingredients.map((ing, index) => {
            const isLikelyHave = !missingIngredients.includes(ing.name);
            return (
              <View key={index} style={styles.ingredientItem}>
                <View style={[
                  styles.ingredientCheck,
                  isLikelyHave ? styles.ingredientCheckHave : styles.ingredientCheckNeed,
                ]}>
                  <Ionicons
                    name={isLikelyHave ? 'checkmark' : 'add'}
                    size={14}
                    color={isLikelyHave ? '#22c55e' : '#f59e0b'}
                  />
                </View>
                <Text style={styles.ingredientName}>
                  {ing.quantity} {ing.unit} {ing.name}
                </Text>
                <Text style={styles.ingredientStatus}>
                  {isLikelyHave ? 'likely have' : 'may need'}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Status Banner */}
        <View style={[
          styles.statusBanner,
          hasAllIngredients ? styles.statusBannerGood : styles.statusBannerNeed,
        ]}>
          <Ionicons
            name={hasAllIngredients ? 'checkmark-circle' : 'cart'}
            size={24}
            color={hasAllIngredients ? '#22c55e' : '#f59e0b'}
          />
          <Text style={[
            styles.statusBannerText,
            hasAllIngredients ? styles.statusBannerTextGood : styles.statusBannerTextNeed,
          ]}>
            {hasAllIngredients
              ? 'You likely have everything!'
              : `You may need ${missingIngredients.length} items`}
          </Text>
        </View>
      </ScrollView>
    );
  };

  // Render bottom action buttons for detail view
  const renderDetailActions = () => {
    if (!selectedRecipe || step !== 'detail') return null;

    const missingIngredients = getMissingIngredients(selectedRecipe);

    return (
      <View style={[styles.detailActions, { paddingBottom: insets.bottom + 16 }]}>
        {missingIngredients.length > 0 && (
          <TouchableOpacity
            style={styles.addToListButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onAddToShoppingList(selectedRecipe, missingIngredients);
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="cart-outline" size={20} color="#f59e0b" />
            <Text style={styles.addToListText}>Add {missingIngredients.length} to list</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.letsCookButton}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            onStartCooking(selectedRecipe);
          }}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[accentColor, accentColor]}
            style={styles.letsCookGradient}
          >
            <Ionicons name="flame" size={20} color="#fff" />
            <Text style={styles.letsCookText}>Let's cook!</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={['#1a1a2e', '#16213e']}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {step === 'craving' && 'Find a Recipe'}
          {step === 'loading' && 'Searching...'}
          {step === 'suggestions' && 'Recipe Ideas'}
          {step === 'detail' && 'Recipe Details'}
        </Text>
        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {step === 'craving' && renderCravingScreen()}
      {step === 'loading' && renderLoadingScreen()}
      {step === 'suggestions' && renderSuggestionsScreen()}
      {step === 'detail' && renderDetailScreen()}

      {/* Bottom Actions */}
      {renderDetailActions()}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  closeButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },

  // Craving Screen
  mainTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 32,
    textTransform: 'capitalize',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 8,
  },

  // Mood Grid
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  moodCard: {
    width: (SCREEN_WIDTH - 52) / 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  moodCardSelected: {
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245,158,11,0.15)',
  },
  moodEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  moodLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  moodDescription: {
    fontSize: 12,
    color: '#94a3b8',
  },

  // Cuisine Grid
  cuisineGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 24,
  },
  cuisineChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  cuisineChipSelected: {
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245,158,11,0.15)',
  },
  cuisineEmoji: {
    fontSize: 18,
  },
  cuisineLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  cuisineLabelSelected: {
    color: '#f59e0b',
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#fff',
  },
  clearButton: {
    padding: 4,
  },
  searchButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonDisabled: {
    opacity: 0.5,
  },

  // Surprise Me
  surpriseButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  surpriseGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  surpriseText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },

  // Error
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.15)',
    padding: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: '#ef4444',
  },

  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginTop: 20,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 8,
    textTransform: 'capitalize',
  },

  // Suggestions
  suggestionsTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  suggestionsSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    marginBottom: 24,
  },
  recipeCard: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  recipeCardGradient: {
    padding: 16,
  },
  recipeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recipeCardEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  recipeCardInfo: {
    flex: 1,
  },
  recipeCardName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  recipeCardMeta: {
    fontSize: 13,
    color: '#94a3b8',
  },
  recipeCardDescription: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 12,
    lineHeight: 20,
  },
  tryDifferentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 8,
  },
  tryDifferentText: {
    fontSize: 15,
    color: '#64748b',
  },

  // Detail Screen
  detailHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  detailEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  detailName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  detailMeta: {
    flexDirection: 'row',
    gap: 16,
  },
  detailMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailMetaText: {
    fontSize: 13,
    color: '#94a3b8',
  },
  detailDescription: {
    fontSize: 15,
    color: '#94a3b8',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },

  // Ingredients
  ingredientsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
  },
  ingredientsList: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 4,
    marginBottom: 16,
  },
  ingredientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  ingredientCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ingredientCheckHave: {
    backgroundColor: 'rgba(34,197,94,0.2)',
  },
  ingredientCheckNeed: {
    backgroundColor: 'rgba(245,158,11,0.2)',
  },
  ingredientName: {
    flex: 1,
    fontSize: 15,
    color: '#fff',
  },
  ingredientStatus: {
    fontSize: 12,
    color: '#64748b',
  },

  // Status Banner
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
  },
  statusBannerGood: {
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  statusBannerNeed: {
    backgroundColor: 'rgba(245,158,11,0.15)',
  },
  statusBannerText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
  },
  statusBannerTextGood: {
    color: '#22c55e',
  },
  statusBannerTextNeed: {
    color: '#f59e0b',
  },

  // Detail Actions
  detailActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: 'rgba(26,26,46,0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  addToListButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  addToListText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#f59e0b',
  },
  letsCookButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  letsCookGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  letsCookText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});
