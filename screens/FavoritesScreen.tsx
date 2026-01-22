/**
 * FavoritesScreen - Displays user's favorited items across categories
 * Matches the MainHomeScreen aesthetic with glass sheen and checkmark watermark
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Favorite category definitions with gradients matching the app style
interface FavoriteCategory {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtext: string;
  gradient: [string, string];
  emptyMessage: string;
}

const FAVORITE_CATEGORIES: FavoriteCategory[] = [
  {
    id: 'recipes',
    icon: 'restaurant',
    label: 'Recipes',
    subtext: 'Saved meals & dishes',
    gradient: ['#FF8B5E', '#FFB84D'],
    emptyMessage: 'No favorite recipes yet',
  },
  {
    id: 'projects',
    icon: 'construct',
    label: 'Projects',
    subtext: 'DIY & home projects',
    gradient: ['#4FA3FF', '#3AD7C3'],
    emptyMessage: 'No favorite projects yet',
  },
  {
    id: 'articles',
    icon: 'book',
    label: 'Articles',
    subtext: 'Guides & tutorials',
    gradient: ['#6BA3E8', '#9B8AF5'],
    emptyMessage: 'No favorite articles yet',
  },
  {
    id: 'tools',
    icon: 'hammer',
    label: 'Tools',
    subtext: 'Recommended tools',
    gradient: ['#3AD7C3', '#4FA3FF'],
    emptyMessage: 'No favorite tools yet',
  },
];

interface FavoriteItem {
  id: string;
  category: string;
  item_id: string;
  item_name: string;
  item_data: any;
  created_at: string;
}

export default function FavoritesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const [favorites, setFavorites] = useState<Record<string, FavoriteItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Fetch favorites when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchFavorites();
    }, [user])
  );

  const fetchFavorites = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('favorites')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by category
      const grouped: Record<string, FavoriteItem[]> = {};
      FAVORITE_CATEGORIES.forEach(cat => {
        grouped[cat.id] = [];
      });

      data?.forEach(item => {
        if (grouped[item.category]) {
          grouped[item.category].push(item);
        }
      });

      setFavorites(grouped);
    } catch (error) {
      console.error('Error fetching favorites:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeFavorite = async (favoriteId: string, category: string) => {
    try {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('id', favoriteId);

      if (error) throw error;

      // Update local state
      setFavorites(prev => ({
        ...prev,
        [category]: prev[category].filter(item => item.id !== favoriteId),
      }));
    } catch (error) {
      console.error('Error removing favorite:', error);
    }
  };

  const getCategoryCount = (categoryId: string) => {
    return favorites[categoryId]?.length || 0;
  };

  const renderCategoryCard = (category: FavoriteCategory) => {
    const count = getCategoryCount(category.id);

    return (
      <TouchableOpacity
        key={category.id}
        style={styles.categoryCard}
        onPress={() => setSelectedCategory(category.id)}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={category.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.categoryGradient}
        >
          {/* Glass sheen overlay for cards */}
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
          {/* Checkmark watermark on cards */}
          <View style={styles.cardCheckmarkWatermark} pointerEvents="none">
            <Svg width={120} height={120} viewBox="0 0 100 100">
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
          <View style={styles.categoryIconContainer}>
            <Ionicons name={category.icon} size={28} color="#ffffff" />
          </View>
          <View style={styles.categoryInfo}>
            <Text style={styles.categoryLabel}>{category.label}</Text>
            <Text style={styles.categorySubtext}>{category.subtext}</Text>
          </View>
          <View style={styles.categoryCount}>
            <Text style={styles.countText}>{count}</Text>
            <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.8)" />
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const handleFavoriteItemPress = (item: FavoriteItem) => {
    // Navigate based on category
    switch (item.category) {
      case 'recipes':
        // Check if recipe data has required fields (ingredients, steps)
        if (item.item_data && item.item_data.ingredients && item.item_data.steps) {
          navigation.navigate('DoIt', { favoriteRecipe: item.item_data });
        } else {
          // Recipe was saved before full data storage was implemented
          Alert.alert(
            'Recipe Unavailable',
            'This recipe was saved before we started storing full recipe details. Please remove it and re-favorite it from the Do It section.',
            [{ text: 'OK' }]
          );
        }
        break;
      case 'articles':
        // Navigate to Article screen
        if (item.item_data) {
          navigation.navigate('Article', {
            title: item.item_data.title || item.item_name,
            category: item.item_data.category || 'DIY',
            icon: item.item_data.icon || '📖',
            shortDescription: item.item_data.description || '',
          });
        }
        break;
      case 'projects':
      case 'tools':
        // Coming soon - for now just show a message or do nothing
        break;
    }
  };

  const renderFavoriteItem = (item: FavoriteItem, category: FavoriteCategory) => {
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.favoriteItem}
        onPress={() => handleFavoriteItemPress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.favoriteIconBg, { backgroundColor: category.gradient[0] + '20' }]}>
          <Ionicons name={category.icon} size={24} color={category.gradient[0]} />
        </View>
        <View style={styles.favoriteInfo}>
          <Text style={styles.favoriteName} numberOfLines={1}>{item.item_name}</Text>
          <Text style={styles.favoriteDate}>
            Saved {new Date(item.created_at).toLocaleDateString()}
          </Text>
        </View>
        <View style={styles.favoriteActions}>
          <TouchableOpacity
            style={styles.removeButton}
            onPress={(e) => {
              e.stopPropagation();
              removeFavorite(item.id, category.id);
            }}
            activeOpacity={0.7}
          >
            <Ionicons name="heart" size={24} color="#ef4444" />
          </TouchableOpacity>
          <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
        </View>
      </TouchableOpacity>
    );
  };

  const renderCategoryDetail = () => {
    const category = FAVORITE_CATEGORIES.find(c => c.id === selectedCategory);
    if (!category) return null;

    const items = favorites[category.id] || [];

    return (
      <View style={styles.detailContainer}>
        {/* Header */}
        <LinearGradient
          colors={category.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.detailHeader, { paddingTop: insets.top + 10 }]}
        >
          {/* Glass sheen overlay */}
          <LinearGradient
            colors={[
              'rgba(255,255,255,0.35)',
              'rgba(255,255,255,0.14)',
              'rgba(255,255,255,0.00)',
            ]}
            locations={[0, 0.45, 1]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setSelectedCategory(null)}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={24} color="#ffffff" />
            <Text style={styles.backText}>Favorites</Text>
          </TouchableOpacity>
          <View style={styles.detailHeaderContent}>
            <View style={styles.detailIconLarge}>
              <Ionicons name={category.icon} size={40} color="#ffffff" />
            </View>
            <Text style={styles.detailTitle}>{category.label}</Text>
            <Text style={styles.detailSubtitle}>
              {items.length} {items.length === 1 ? 'item' : 'items'} saved
            </Text>
          </View>
        </LinearGradient>

        {/* Items List */}
        <ScrollView
          style={styles.detailScrollView}
          contentContainerStyle={styles.detailScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {items.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.emptyIconBg, { backgroundColor: category.gradient[0] + '15' }]}>
                <Ionicons name={category.icon} size={48} color={category.gradient[0]} />
              </View>
              <Text style={styles.emptyTitle}>{category.emptyMessage}</Text>
              <Text style={styles.emptySubtext}>
                Items you favorite will appear here
              </Text>
            </View>
          ) : (
            items.map(item => renderFavoriteItem(item, category))
          )}
        </ScrollView>
      </View>
    );
  };

  // Show category detail if selected
  if (selectedCategory) {
    return renderCategoryDetail();
  }

  // Main favorites screen with categories
  return (
    <View style={styles.container}>
      {/* Header with gradient, glass sheen, and checkmark watermark - matching MainHomeScreen */}
      <LinearGradient
        colors={['#0f172a', '#6A9BD6', '#D4E8ED']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + 10 }]}
      >
        {/* Glass sheen overlay - creates frosted glass effect */}
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

        {/* Ghost checkmark watermark - KanDu brand (same size as MainHomeScreen) */}
        <View style={styles.headerWatermark} pointerEvents="none">
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

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#ffffff" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <View style={styles.headerIconContainer}>
            <Ionicons name="heart" size={36} color="#ffffff" />
          </View>
          <Text style={styles.headerTitle}>My Favorites</Text>
          <Text style={styles.headerSubtitle}>
            Your saved items across KanDu
          </Text>
        </View>
      </LinearGradient>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading favorites...</Text>
        </View>
      ) : !user ? (
        <View style={styles.signInPrompt}>
          <View style={styles.signInIconBg}>
            <Ionicons name="person-outline" size={48} color="#64748b" />
          </View>
          <Text style={styles.signInTitle}>Sign in to save favorites</Text>
          <Text style={styles.signInSubtext}>
            Create an account to save your favorite recipes, projects, and more
          </Text>
          <TouchableOpacity
            style={styles.signInButton}
            onPress={() => navigation.navigate('Auth', { mode: 'login' })}
            activeOpacity={0.8}
          >
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.sectionTitle}>Categories</Text>
          {FAVORITE_CATEGORIES.map(renderCategoryCard)}

          {/* Quick Stats */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>
                {Object.values(favorites).reduce((acc, items) => acc + items.length, 0)}
              </Text>
              <Text style={styles.statLabel}>Total Favorites</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>
                {Object.values(favorites).filter(items => items.length > 0).length}
              </Text>
              <Text style={styles.statLabel}>Categories Used</Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#D4E8ED',
  },
  header: {
    paddingBottom: 30,
    paddingHorizontal: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  headerWatermark: {
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
    marginBottom: 20,
  },
  backText: {
    fontSize: 16,
    color: '#ffffff',
    marginLeft: 4,
    fontWeight: '500',
  },
  headerContent: {
    alignItems: 'center',
  },
  headerIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E5AA8',
    marginBottom: 16,
  },
  categoryCard: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  categoryGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    overflow: 'hidden',
    position: 'relative',
  },
  cardCheckmarkWatermark: {
    position: 'absolute',
    right: -15,
    bottom: -25,
  },
  categoryIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  categoryInfo: {
    flex: 1,
    marginLeft: 16,
    zIndex: 1,
  },
  categoryLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  categorySubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  categoryCount: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  countText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    marginRight: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 2,
    borderColor: '#C2E7EC',
  },
  statNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
  },
  signInPrompt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  signInIconBg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  signInTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  signInSubtext: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  signInButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  // Detail view styles
  detailContainer: {
    flex: 1,
    backgroundColor: '#D4E8ED',
  },
  detailHeader: {
    paddingBottom: 30,
    paddingHorizontal: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  detailHeaderContent: {
    alignItems: 'center',
  },
  detailIconLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  detailSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  detailScrollView: {
    flex: 1,
  },
  detailScrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  favoriteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 2,
    borderColor: '#C2E7EC',
  },
  favoriteIconBg: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  favoriteInfo: {
    flex: 1,
    marginLeft: 12,
  },
  favoriteName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  favoriteDate: {
    fontSize: 13,
    color: '#64748b',
  },
  removeButton: {
    padding: 8,
  },
  favoriteActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIconBg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
  },
});
