
/**
 * RecipesScreen - Recipe tracking library with auto-replenishment
 * Styled to match ShoppingListScreen (hero gradient + ghost checkmark)
 */

import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { useAuth } from '../contexts/AuthContext';
import {
  Recipe,
  RecipeCategory,
  CookingHistory,
  createRecipe,
  getRecipes,
  cookRecipe,
  getCookingHistory,
  toggleRecipeFavorite,
  deleteRecipe,
} from '../services/api';

type CategoryFilter = 'all' | RecipeCategory;

const CATEGORY_OPTIONS: Array<{ id: CategoryFilter; label: string; color: string }> = [
  { id: 'all', label: 'All', color: '#f97316' },
  { id: 'breakfast', label: 'Breakfast', color: '#f59e0b' },
  { id: 'lunch', label: 'Lunch', color: '#22c55e' },
  { id: 'dinner', label: 'Dinner', color: '#ef4444' },
  { id: 'snack', label: 'Snack', color: '#a855f7' },
  { id: 'dessert', label: 'Dessert', color: '#ec4899' },
  { id: 'beverage', label: 'Beverage', color: '#38bdf8' },
  { id: 'other', label: 'Other', color: '#94a3b8' },
];

const CATEGORY_ICONS: Record<RecipeCategory, keyof typeof Ionicons.glyphMap> = {
  breakfast: 'sunny',
  lunch: 'leaf',
  dinner: 'moon',
  snack: 'nutrition',
  dessert: 'ice-cream',
  beverage: 'cafe',
  other: 'ellipsis-horizontal',
};

const HERO_GRADIENT = ['#0f172a', '#f97316', '#9a3412'];

const formatCookedDate = (dateStr?: string | null) => {
  if (!dateStr) return 'Never cooked';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const parseOptionalInt = (value: string): number | undefined => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export default function RecipesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');

  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<CookingHistory[]>([]);
  const [cookServings, setCookServings] = useState('');
  const [cookNotes, setCookNotes] = useState('');
  const [cookRating, setCookRating] = useState<number | null>(null);
  const [autoReplenish, setAutoReplenish] = useState(true);

  const [createVisible, setCreateVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newRecipeName, setNewRecipeName] = useState('');
  const [newRecipeDescription, setNewRecipeDescription] = useState('');
  const [newRecipeCategory, setNewRecipeCategory] = useState<RecipeCategory>('dinner');
  const [newRecipeCuisine, setNewRecipeCuisine] = useState('');
  const [newRecipeServings, setNewRecipeServings] = useState('');
  const [newRecipePrep, setNewRecipePrep] = useState('');
  const [newRecipeCook, setNewRecipeCook] = useState('');
  const [ingredients, setIngredients] = useState<
    Array<{ name: string; quantityText: string; category: string; optional: boolean }>
  >([]);
  const [ingredientName, setIngredientName] = useState('');
  const [ingredientAmount, setIngredientAmount] = useState('');
  const [ingredientCategory, setIngredientCategory] = useState('');
  const [ingredientOptional, setIngredientOptional] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      loadRecipes();
    }, [user])
  );

  const loadRecipes = async () => {
    if (!user) {
      setLoading(false);
      setRecipes([]);
      return;
    }

    setLoading(true);
    const { data, error } = await getRecipes();
    if (error) {
      console.error('Failed to load recipes:', error);
    }
    setRecipes(data || []);
    setLoading(false);
  };
  const filteredRecipes = useMemo(() => {
    const searchLower = searchText.trim().toLowerCase();
    return recipes.filter((recipe) => {
      if (categoryFilter !== 'all' && recipe.category !== categoryFilter) return false;
      if (!searchLower) return true;
      return (
        recipe.name.toLowerCase().includes(searchLower) ||
        recipe.description?.toLowerCase().includes(searchLower) ||
        recipe.cuisine?.toLowerCase().includes(searchLower)
      );
    });
  }, [recipes, categoryFilter, searchText]);

  const openDetail = async (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setCookServings(recipe.servings?.toString() || '');
    setCookNotes('');
    setCookRating(null);
    setAutoReplenish(true);
    setDetailVisible(true);

    setHistoryLoading(true);
    const { data } = await getCookingHistory({ recipeId: recipe.id, limit: 5 });
    setHistory(data || []);
    setHistoryLoading(false);
  };

  const handleCookRecipe = async () => {
    if (!selectedRecipe) return;
    const { data, error } = await cookRecipe(selectedRecipe.id, {
      servings: parseOptionalInt(cookServings),
      notes: cookNotes || undefined,
      rating: cookRating || undefined,
      autoReplenish,
    });

    if (error) {
      Alert.alert('Cook failed', error);
      return;
    }

    Alert.alert('Saved', 'Cooking history updated and shopping list replenished.');
    setDetailVisible(false);
    await loadRecipes();
  };

  const handleToggleFavorite = async (recipe: Recipe) => {
    const { data, error } = await toggleRecipeFavorite(recipe.id, !recipe.is_favorite);
    if (error || !data) {
      Alert.alert('Error', error || 'Unable to update favorite');
      return;
    }
    setRecipes((prev) => prev.map((r) => (r.id === recipe.id ? data : r)));
    setSelectedRecipe((prev) => (prev && prev.id === recipe.id ? data : prev));
  };

  const handleDeleteRecipe = async (recipe: Recipe) => {
    Alert.alert(
      'Delete recipe?',
      'This will remove the recipe and its ingredients.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteRecipe(recipe.id);
            if (error) {
              Alert.alert('Delete failed', error);
              return;
            }
            setDetailVisible(false);
            await loadRecipes();
          },
        },
      ]
    );
  };

  const resetCreateForm = () => {
    setNewRecipeName('');
    setNewRecipeDescription('');
    setNewRecipeCategory('dinner');
    setNewRecipeCuisine('');
    setNewRecipeServings('');
    setNewRecipePrep('');
    setNewRecipeCook('');
    setIngredients([]);
    setIngredientName('');
    setIngredientAmount('');
    setIngredientCategory('');
    setIngredientOptional(false);
  };

  const addIngredient = () => {
    if (!ingredientName.trim()) return;
    setIngredients((prev) => [
      ...prev,
      {
        name: ingredientName.trim(),
        quantityText: ingredientAmount.trim(),
        category: ingredientCategory.trim(),
        optional: ingredientOptional,
      },
    ]);
    setIngredientName('');
    setIngredientAmount('');
    setIngredientCategory('');
    setIngredientOptional(false);
  };

  const removeIngredient = (index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateRecipe = async () => {
    if (!newRecipeName.trim()) {
      Alert.alert('Missing name', 'Please enter a recipe name.');
      return;
    }
    if (ingredients.length === 0) {
      Alert.alert('Missing ingredients', 'Add at least one ingredient.');
      return;
    }

    setCreating(true);
    const { data, error } = await createRecipe(
      {
        name: newRecipeName.trim(),
        description: newRecipeDescription.trim() || undefined,
        category: newRecipeCategory,
        cuisine: newRecipeCuisine.trim() || undefined,
        servings: parseOptionalInt(newRecipeServings),
        prep_time_minutes: parseOptionalInt(newRecipePrep),
        cook_time_minutes: parseOptionalInt(newRecipeCook),
      },
      ingredients.map((ing) => ({
        ingredient_name: ing.name,
        quantity_text: ing.quantityText || undefined,
        category: ing.category || undefined,
        is_optional: ing.optional,
      }))
    );
    setCreating(false);

    if (error || !data) {
      Alert.alert('Create failed', error || 'Unable to create recipe');
      return;
    }

    resetCreateForm();
    setCreateVisible(false);
    await loadRecipes();
  };

  const renderHeroWatermark = () => (
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
  );

  const renderWatermark = () => (
    <View style={styles.watermarkContainer} pointerEvents="none">
      <Svg width={300} height={300} viewBox="0 0 100 100" style={styles.watermark}>
        <Path
          d="M20 55 L40 75 L80 25"
          stroke="rgba(255,255,255,0.03)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#f97316" />
        <Text style={styles.loadingText}>Loading recipes...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="restaurant" size={48} color="#94a3b8" />
        <Text style={styles.emptyTitle}>Sign in to save recipes</Text>
        <Text style={styles.emptySubtitle}>
          Your recipe library and auto-replenishment will appear here.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={HERO_GRADIENT}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.heroGradient, { paddingTop: insets.top }]}
      >
        <LinearGradient
          pointerEvents="none"
          colors={[
            'rgba(255,255,255,0.25)',
            'rgba(255,255,255,0.10)',
            'rgba(255,255,255,0.00)',
          ]}
          locations={[0, 0.45, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {renderHeroWatermark()}

        <View style={styles.heroControls}>
          <TouchableOpacity
            style={styles.heroBackButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.heroTitleContainer}>
            <Ionicons name="restaurant" size={26} color="#ffffff" style={{ marginRight: 10 }} />
            <Text style={styles.heroTitle}>Recipes</Text>
          </View>
          <TouchableOpacity
            style={styles.heroAction}
            onPress={() => {
              resetCreateForm();
              setCreateVisible(true);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={26} color="#ffffff" />
          </TouchableOpacity>
        </View>

        <View style={styles.heroStats}>
          <Text style={styles.heroStatLabel}>Library size</Text>
          <Text style={styles.heroStatValue}>{recipes.length} recipes</Text>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="rgba(255,255,255,0.8)" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search recipes, cuisines, ingredients"
            placeholderTextColor="rgba(255,255,255,0.6)"
            value={searchText}
            onChangeText={setSearchText}
          />
        </View>
      </LinearGradient>

      <View style={styles.content}>
        {renderWatermark()}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {CATEGORY_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.id}
              onPress={() => setCategoryFilter(option.id)}
              style={[
                styles.filterChip,
                categoryFilter === option.id && styles.filterChipActive,
                categoryFilter === option.id && { borderColor: option.color },
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  categoryFilter === option.id && { color: option.color },
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <ScrollView contentContainerStyle={styles.listContent}>
          {filteredRecipes.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="restaurant-outline" size={48} color="#94a3b8" />
              <Text style={styles.emptyTitle}>No recipes yet</Text>
              <Text style={styles.emptySubtitle}>
                Add your first recipe to start tracking cooking history.
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                onPress={() => {
                  resetCreateForm();
                  setCreateVisible(true);
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.emptyButtonText}>Add a recipe</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredRecipes.map((recipe) => {
              const category = recipe.category || 'other';
              const categoryStyle = CATEGORY_OPTIONS.find((c) => c.id === category)?.color || '#f97316';
              return (
                <TouchableOpacity
                  key={recipe.id}
                  style={styles.recipeCard}
                  onPress={() => openDetail(recipe)}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={['#1f2937', '#111827']}
                    style={styles.recipeCardGradient}
                  >
                    <View style={styles.recipeCardHeader}>
                      <View style={[styles.recipeIcon, { backgroundColor: `${categoryStyle}22` }]}>
                        <Ionicons name={CATEGORY_ICONS[category]} size={22} color={categoryStyle} />
                      </View>
                      <View style={styles.recipeCardInfo}>
                        <Text style={styles.recipeName}>{recipe.name}</Text>
                        <Text style={styles.recipeMeta}>
                          {recipe.cuisine || 'Home style'} · {recipe.servings || 4} servings
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleToggleFavorite(recipe)}
                        style={styles.favoriteButton}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={recipe.is_favorite ? 'heart' : 'heart-outline'}
                          size={20}
                          color={recipe.is_favorite ? '#f43f5e' : '#ffffff'}
                        />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.recipeStatsRow}>
                      <View style={styles.recipeStat}>
                        <Ionicons name="time-outline" size={16} color="#fbbf24" />
                        <Text style={styles.recipeStatText}>
                          {recipe.prep_time_minutes || 0}m prep · {recipe.cook_time_minutes || 0}m cook
                        </Text>
                      </View>
                      <View style={styles.recipeStat}>
                        <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
                        <Text style={styles.recipeStatText}>
                          {recipe.times_cooked || 0} cooked
                        </Text>
                      </View>
                    </View>

                    <View style={styles.recipeFooter}>
                      <Text style={styles.recipeFooterText}>
                        Last cooked: {formatCookedDate(recipe.last_cooked_at)}
                      </Text>
                      <View style={styles.recipeFooterAction}>
                        <Text style={styles.recipeFooterActionText}>View</Text>
                        <Ionicons name="chevron-forward" size={16} color="#ffffff" />
                      </View>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      </View>
      {/* Detail Modal */}
      <Modal visible={detailVisible} animationType="slide" onRequestClose={() => setDetailVisible(false)}>
        <LinearGradient
          colors={HERO_GRADIENT}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.heroGradient, { paddingTop: insets.top }]}
        >
          <LinearGradient
            pointerEvents="none"
            colors={[
              'rgba(255,255,255,0.25)',
              'rgba(255,255,255,0.10)',
              'rgba(255,255,255,0.00)',
            ]}
            locations={[0, 0.45, 1]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {renderHeroWatermark()}

          <View style={styles.heroControls}>
            <TouchableOpacity
              style={styles.heroBackButton}
              onPress={() => setDetailVisible(false)}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={24} color="#ffffff" />
            </TouchableOpacity>
            <View style={styles.heroTitleContainer}>
              <Ionicons name="restaurant" size={26} color="#ffffff" style={{ marginRight: 10 }} />
              <Text style={styles.heroTitle}>Recipe Details</Text>
            </View>
            <View style={{ width: 36 }} />
          </View>
        </LinearGradient>

        <ScrollView contentContainerStyle={styles.detailContent}>
          {selectedRecipe && (
            <>
              <View style={styles.detailHeader}>
                <Text style={styles.detailTitle}>{selectedRecipe.name}</Text>
                <Text style={styles.detailSubtitle}>
                  {selectedRecipe.cuisine || 'Home style'} · {selectedRecipe.servings || 4} servings
                </Text>
              </View>

              {selectedRecipe.description ? (
                <Text style={styles.detailDescription}>{selectedRecipe.description}</Text>
              ) : null}

              <View style={styles.detailRow}>
                <View style={styles.detailChip}>
                  <Ionicons name="time-outline" size={16} color="#fbbf24" />
                  <Text style={styles.detailChipText}>
                    {selectedRecipe.prep_time_minutes || 0}m prep
                  </Text>
                </View>
                <View style={styles.detailChip}>
                  <Ionicons name="flame" size={16} color="#f97316" />
                  <Text style={styles.detailChipText}>
                    {selectedRecipe.cook_time_minutes || 0}m cook
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.detailChip}
                  onPress={() => handleToggleFavorite(selectedRecipe)}
                >
                  <Ionicons
                    name={selectedRecipe.is_favorite ? 'heart' : 'heart-outline'}
                    size={16}
                    color={selectedRecipe.is_favorite ? '#f43f5e' : '#94a3b8'}
                  />
                  <Text style={styles.detailChipText}>Favorite</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Ingredients</Text>
                {(selectedRecipe.ingredients || []).map((ing) => (
                  <View key={ing.id} style={styles.ingredientRow}>
                    <Ionicons
                      name={ing.is_optional ? 'ellipse-outline' : 'checkmark-circle'}
                      size={18}
                      color={ing.is_optional ? '#94a3b8' : '#22c55e'}
                    />
                    <Text style={styles.ingredientText}>
                      {ing.quantity_text ? `${ing.quantity_text} ` : ''}
                      {ing.ingredient_name}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Cook this recipe</Text>
                <View style={styles.detailField}>
                  <Text style={styles.detailLabel}>Servings made</Text>
                  <TextInput
                    style={styles.detailInput}
                    keyboardType="number-pad"
                    value={cookServings}
                    onChangeText={setCookServings}
                    placeholder="4"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={styles.detailField}>
                  <Text style={styles.detailLabel}>Notes</Text>
                  <TextInput
                    style={[styles.detailInput, styles.detailInputMultiline]}
                    value={cookNotes}
                    onChangeText={setCookNotes}
                    placeholder="Add adjustments or notes"
                    placeholderTextColor="#94a3b8"
                    multiline
                  />
                </View>
                <View style={styles.ratingRow}>
                  <Text style={styles.detailLabel}>Rating</Text>
                  <View style={styles.ratingStars}>
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <TouchableOpacity key={rating} onPress={() => setCookRating(rating)}>
                        <Ionicons
                          name={cookRating && cookRating >= rating ? 'star' : 'star-outline'}
                          size={24}
                          color="#f59e0b"
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <View style={styles.switchRow}>
                  <Text style={styles.detailLabel}>Auto-replenish ingredients</Text>
                  <Switch
                    value={autoReplenish}
                    onValueChange={setAutoReplenish}
                    thumbColor={autoReplenish ? '#f97316' : '#94a3b8'}
                    trackColor={{ true: 'rgba(249,115,22,0.4)', false: '#e5e7eb' }}
                  />
                </View>
                <TouchableOpacity
                  style={styles.cookButton}
                  onPress={handleCookRecipe}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={['#f97316', '#ea580c']}
                    style={styles.cookButtonGradient}
                  >
                    <Ionicons name="checkmark" size={20} color="#ffffff" />
                    <Text style={styles.cookButtonText}>I cooked this</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Recent history</Text>
                {historyLoading ? (
                  <ActivityIndicator color="#f97316" />
                ) : history.length === 0 ? (
                  <Text style={styles.historyEmpty}>No cooking history yet.</Text>
                ) : (
                  history.map((entry) => (
                    <View key={entry.id} style={styles.historyRow}>
                      <View>
                        <Text style={styles.historyTitle}>
                          {new Date(entry.cooked_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </Text>
                        <Text style={styles.historySubtitle}>
                          {entry.servings_made} servings · {entry.auto_replenished ? 'Auto-replenished' : 'Manual'}
                        </Text>
                      </View>
                      {entry.rating ? (
                        <View style={styles.historyRating}>
                          <Ionicons name="star" size={16} color="#f59e0b" />
                          <Text style={styles.historyRatingText}>{entry.rating}</Text>
                        </View>
                      ) : null}
                    </View>
                  ))
                )}
              </View>

              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteRecipe(selectedRecipe)}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={18} color="#ef4444" />
                <Text style={styles.deleteButtonText}>Delete recipe</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </Modal>

      {/* Create Modal */}
      <Modal visible={createVisible} animationType="slide" onRequestClose={() => setCreateVisible(false)}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <LinearGradient
            colors={HERO_GRADIENT}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[styles.heroGradient, { paddingTop: insets.top }]}
          >
            <LinearGradient
              pointerEvents="none"
              colors={[
                'rgba(255,255,255,0.25)',
                'rgba(255,255,255,0.10)',
                'rgba(255,255,255,0.00)',
              ]}
              locations={[0, 0.45, 1]}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.8, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {renderHeroWatermark()}

            <View style={styles.heroControls}>
              <TouchableOpacity
                style={styles.heroBackButton}
                onPress={() => setCreateVisible(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="close" size={24} color="#ffffff" />
              </TouchableOpacity>
              <View style={styles.heroTitleContainer}>
                <Ionicons name="add-circle" size={26} color="#ffffff" style={{ marginRight: 10 }} />
                <Text style={styles.heroTitle}>New Recipe</Text>
              </View>
              <View style={{ width: 36 }} />
            </View>
          </LinearGradient>

          <ScrollView contentContainerStyle={styles.detailContent}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recipe details</Text>
              <View style={styles.detailField}>
                <Text style={styles.detailLabel}>Name</Text>
                <TextInput
                  style={styles.detailInput}
                  value={newRecipeName}
                  onChangeText={setNewRecipeName}
                  placeholder="Chicken fajitas"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={styles.detailField}>
                <Text style={styles.detailLabel}>Description</Text>
                <TextInput
                  style={[styles.detailInput, styles.detailInputMultiline]}
                  value={newRecipeDescription}
                  onChangeText={setNewRecipeDescription}
                  placeholder="Quick weeknight meal"
                  placeholderTextColor="#94a3b8"
                  multiline
                />
              </View>
              <View style={styles.detailField}>
                <Text style={styles.detailLabel}>Cuisine</Text>
                <TextInput
                  style={styles.detailInput}
                  value={newRecipeCuisine}
                  onChangeText={setNewRecipeCuisine}
                  placeholder="Mexican"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={styles.detailField}>
                <Text style={styles.detailLabel}>Category</Text>
                <View style={styles.categoryRow}>
                  {CATEGORY_OPTIONS.filter((c) => c.id !== 'all').map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[
                        styles.categoryChip,
                        newRecipeCategory === option.id && styles.categoryChipActive,
                        newRecipeCategory === option.id && { borderColor: option.color },
                      ]}
                      onPress={() => setNewRecipeCategory(option.id as RecipeCategory)}
                    >
                      <Text
                        style={[
                          styles.categoryChipText,
                          newRecipeCategory === option.id && { color: option.color },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.detailFieldRow}>
                <View style={styles.detailFieldHalf}>
                  <Text style={styles.detailLabel}>Servings</Text>
                  <TextInput
                    style={styles.detailInput}
                    value={newRecipeServings}
                    onChangeText={setNewRecipeServings}
                    keyboardType="number-pad"
                    placeholder="4"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={styles.detailFieldHalf}>
                  <Text style={styles.detailLabel}>Prep (min)</Text>
                  <TextInput
                    style={styles.detailInput}
                    value={newRecipePrep}
                    onChangeText={setNewRecipePrep}
                    keyboardType="number-pad"
                    placeholder="10"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={styles.detailFieldHalf}>
                  <Text style={styles.detailLabel}>Cook (min)</Text>
                  <TextInput
                    style={styles.detailInput}
                    value={newRecipeCook}
                    onChangeText={setNewRecipeCook}
                    keyboardType="number-pad"
                    placeholder="20"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Ingredients</Text>
              <View style={styles.detailField}>
                <Text style={styles.detailLabel}>Ingredient</Text>
                <TextInput
                  style={styles.detailInput}
                  value={ingredientName}
                  onChangeText={setIngredientName}
                  placeholder="Bell pepper"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={styles.detailField}>
                <Text style={styles.detailLabel}>Amount</Text>
                <TextInput
                  style={styles.detailInput}
                  value={ingredientAmount}
                  onChangeText={setIngredientAmount}
                  placeholder="2 cups"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={styles.detailField}>
                <Text style={styles.detailLabel}>Category</Text>
                <TextInput
                  style={styles.detailInput}
                  value={ingredientCategory}
                  onChangeText={setIngredientCategory}
                  placeholder="produce"
                  placeholderTextColor="#94a3b8"
                />
              </View>
              <View style={styles.switchRow}>
                <Text style={styles.detailLabel}>Optional ingredient</Text>
                <Switch
                  value={ingredientOptional}
                  onValueChange={setIngredientOptional}
                  thumbColor={ingredientOptional ? '#f97316' : '#94a3b8'}
                  trackColor={{ true: 'rgba(249,115,22,0.4)', false: '#e5e7eb' }}
                />
              </View>
              <TouchableOpacity style={styles.addIngredientButton} onPress={addIngredient}>
                <Ionicons name="add" size={18} color="#ffffff" />
                <Text style={styles.addIngredientText}>Add ingredient</Text>
              </TouchableOpacity>

              {ingredients.map((ing, idx) => (
                <View key={`${ing.name}-${idx}`} style={styles.ingredientRow}>
                  <View style={styles.ingredientInfo}>
                    <Text style={styles.ingredientText}>
                      {ing.quantityText ? `${ing.quantityText} ` : ''}
                      {ing.name}
                    </Text>
                    <Text style={styles.ingredientMeta}>
                      {ing.category || 'general'} · {ing.optional ? 'optional' : 'required'}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => removeIngredient(idx)}>
                    <Ionicons name="close-circle" size={20} color="#ef4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.cookButton}
              onPress={handleCreateRecipe}
              disabled={creating}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#f97316', '#ea580c']} style={styles.cookButtonGradient}>
                {creating ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color="#ffffff" />
                    <Text style={styles.cookButtonText}>Save recipe</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f172a',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.6)',
    marginTop: 12,
    fontSize: 15,
  },
  heroGradient: {
    paddingBottom: 90,
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
  heroControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  heroBackButton: {
    padding: 8,
  },
  heroTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
  },
  heroAction: {
    padding: 8,
  },
  heroStats: {
    paddingHorizontal: 20,
    marginTop: 18,
  },
  heroStatLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  heroStatValue: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 6,
  },
  searchContainer: {
    marginHorizontal: 20,
    marginTop: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 15,
  },
  content: {
    flex: 1,
    backgroundColor: '#0b1220',
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  watermarkContainer: {
    position: 'absolute',
    right: -50,
    bottom: 100,
    opacity: 0.5,
  },
  watermark: {
    transform: [{ rotate: '-15deg' }],
  },
  filterRow: {
    marginBottom: 16,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 10,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  filterChipText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 120,
  },
  recipeCard: {
    marginBottom: 16,
    borderRadius: 18,
    overflow: 'hidden',
  },
  recipeCardGradient: {
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  recipeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recipeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  recipeCardInfo: {
    flex: 1,
  },
  recipeName: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
  },
  recipeMeta: {
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
    fontSize: 13,
  },
  favoriteButton: {
    padding: 6,
  },
  recipeStatsRow: {
    marginTop: 12,
    gap: 8,
  },
  recipeStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recipeStatText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
  },
  recipeFooter: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recipeFooterText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  recipeFooterAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recipeFooterActionText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    color: '#e2e8f0',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 8,
  },
  emptyButton: {
    marginTop: 16,
    backgroundColor: '#f97316',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
  },
  emptyButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  detailContent: {
    padding: 20,
    paddingBottom: 40,
    backgroundColor: '#0b1220',
  },
  detailHeader: {
    marginBottom: 12,
  },
  detailTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  detailSubtitle: {
    color: '#94a3b8',
    marginTop: 6,
  },
  detailDescription: {
    color: '#e2e8f0',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
  },
  detailChipText: {
    color: '#e2e8f0',
    fontSize: 12,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    justifyContent: 'space-between',
  },
  ingredientInfo: {
    flex: 1,
  },
  ingredientText: {
    color: '#e2e8f0',
    fontSize: 14,
  },
  ingredientMeta: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  detailField: {
    marginBottom: 12,
  },
  detailFieldRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  detailFieldHalf: {
    flex: 1,
    minWidth: 100,
  },
  detailLabel: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 6,
  },
  detailInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 14,
  },
  detailInputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  ratingStars: {
    flexDirection: 'row',
    gap: 4,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cookButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  cookButtonGradient: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
  },
  cookButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  historyTitle: {
    color: '#ffffff',
    fontWeight: '600',
  },
  historySubtitle: {
    color: '#94a3b8',
    marginTop: 4,
  },
  historyRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  historyRatingText: {
    color: '#f59e0b',
    fontWeight: '600',
  },
  historyEmpty: {
    color: '#94a3b8',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  deleteButtonText: {
    color: '#ef4444',
    fontWeight: '600',
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(15,23,42,0.4)',
  },
  categoryChipActive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  categoryChipText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
  },
  addIngredientButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#334155',
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  addIngredientText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});

