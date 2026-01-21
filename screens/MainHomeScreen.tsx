/**
 * MainHomeScreen - Main logged-in home screen for KanDu
 * Matches the clean, bright aesthetic of the rest of the app
 */

import React, { useLayoutEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
  FlatList,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import ProfileMenu from '../components/ProfileMenu';
import HouseIcon from '../components/HouseIcon';
import {
  SavedDiagnosis,
  getCategoryInfo,
  formatDiagnosisDate,
  getAllDueFollowUps,
} from '../services/diagnosisStorage';
import { getArticleImages, ArticleImage } from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TIPS_PER_PAGE = 6; // 3 columns x 2 rows

interface ActionCard {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtext: string;
  gradient: [string, string];
  route: keyof RootStackParamList;
}

// Milkier gradient colors - softer, less saturated for premium airy look
const ACTION_CARDS: ActionCard[] = [
  {
    id: 'fix',
    icon: 'construct',
    label: 'Fix It',
    subtext: 'Diagnose & Repair',
    gradient: ['#4FA3FF', '#3AD7C3'], // Softened blue → teal
    route: 'Diagnosis',
  },
  {
    id: 'learn',
    icon: 'bulb',
    label: 'Learn It',
    subtext: 'How does it work?',
    gradient: ['#6BA3E8', '#9B8AF5'], // Softened blue → purple
    route: 'LearnIt',
  },
  {
    id: 'plan',
    icon: 'clipboard',
    label: 'Plan It',
    subtext: 'Project planning',
    gradient: ['#3AD7C3', '#4FA3FF'], // Softened teal → blue
    route: 'PlanIt',
  },
  {
    id: 'do',
    icon: 'chatbubbles',
    label: 'Do It',
    subtext: 'AI home assistant',
    gradient: ['#FF8B5E', '#FFB84D'], // Softened orange → yellow
    route: 'DoIt',
  },
];

function getStatusColor(status: string): string {
  switch (status) {
    case 'resolved':
      return '#10b981';
    case 'watching':
      return '#f59e0b';
    case 'open':
    default:
      return '#3b82f6';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'resolved':
      return 'Fixed';
    case 'watching':
      return 'Watching';
    case 'open':
    default:
      return 'Open';
  }
}

function getUrgencyColor(urgency: string): string {
  switch (urgency) {
    case 'immediate':
      return '#ef4444';
    case 'soon':
      return '#f59e0b';
    case 'can_wait':
      return '#10b981';
    default:
      return '#64748b';
  }
}

function formatUrgency(urgency: string): string {
  switch (urgency) {
    case 'immediate':
      return 'Urgent';
    case 'soon':
      return 'Soon';
    case 'can_wait':
      return 'Can Wait';
    default:
      return 'Unknown';
  }
}

interface DailyTip {
  title: string;
  description: string;
  category: string;
  icon: string;
  imageUrl?: string;
  fullImageUrl?: string; // For article hero images
}

export default function MainHomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  // Get user's first name for welcome message
  const fullName = user?.user_metadata?.full_name || '';
  const firstName = fullName.split(' ')[0] || 'Friend';
  const [menuVisible, setMenuVisible] = useState(false);
  const [inProgressItems, setInProgressItems] = useState<SavedDiagnosis[]>([]);
  const [dueFollowUps, setDueFollowUps] = useState<SavedDiagnosis[]>([]);
  const [notificationListVisible, setNotificationListVisible] = useState(false);
  const [dailyTips, setDailyTips] = useState<DailyTip[]>([]);
  const [loadingTip, setLoadingTip] = useState(false);
  const [currentTipPage, setCurrentTipPage] = useState(0);
  const tipsListRef = useRef<FlatList>(null);

  // Calculate grid dimensions
  const gridPadding = 20;
  const gridGap = 8;
  const tileWidth = (SCREEN_WIDTH - (gridPadding * 2) - (gridGap * 2)) / 3;
  const pageWidth = SCREEN_WIDTH - (gridPadding * 2);

  // Disable the default navigation header - we use a custom hero header instead
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  // Load data when screen focuses
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [user])
  );

  const loadData = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;

      // Load in-progress items (status != resolved)
      const { data: inProgress } = await supabase
        .from('diagnoses')
        .select('*')
        .eq('user_id', currentUser.id)
        .neq('status', 'resolved')
        .order('created_at', { ascending: false })
        .limit(5);

      if (inProgress) {
        setInProgressItems(inProgress);
      }

      // Load due follow-ups for notifications
      const { data: followUps } = await getAllDueFollowUps(currentUser.id);
      if (followUps) {
        setDueFollowUps(followUps);
      }

      // Load daily tip
      loadDailyTip();
    } catch (error) {
      console.error('Error loading data:', error);
    }
  };

  const loadDailyTip = async () => {
    // Version the cache so OTA updates force a refresh
    const TIPS_VERSION = 'v4'; // Bump this when tips change
    const today = new Date().toDateString();
    const cacheKey = `dailyTips_${TIPS_VERSION}`;
    const dateKey = `dailyTipsDate_${TIPS_VERSION}`;

    const cachedTips = await AsyncStorage.getItem(cacheKey);
    const cachedDate = await AsyncStorage.getItem(dateKey);

    if (cachedTips && cachedDate === today) {
      setDailyTips(JSON.parse(cachedTips));
      return;
    }

    // Clear old cache keys
    await AsyncStorage.multiRemove(['dailyTips', 'dailyTipsDate', 'dailyTips_v1', 'dailyTipsDate_v1', 'dailyTips_v2', 'dailyTipsDate_v2', 'dailyTips_v3', 'dailyTipsDate_v3']);

    setLoadingTip(true);
    try {
      // Simple DIY tasks anyone can do at home - 12 tips for 2 pages of 6
      const baseTips: Omit<DailyTip, 'imageUrl' | 'fullImageUrl'>[] = [
        {
          title: 'Replace HVAC Filter',
          description: 'Change your air filter in 5 minutes - breathe cleaner air and lower your energy bill.',
          category: 'DIY',
          icon: '❄️',
        },
        {
          title: 'Fix Leaky Faucet',
          description: 'Stop that annoying drip yourself - save water and money with a simple washer replacement.',
          category: 'DIY',
          icon: '🚰',
        },
        {
          title: 'Install Smart Outlet',
          description: 'Control your lights from your phone - no electrician needed, just 10 minutes.',
          category: 'DIY',
          icon: '⚡',
        },
        {
          title: 'Unclog Drain',
          description: 'Clear slow drains without harsh chemicals - simple tools get the job done fast.',
          category: 'DIY',
          icon: '🔧',
        },
        {
          title: 'Caulk Bathtub',
          description: 'Seal gaps around your tub - prevent mold and water damage in one afternoon.',
          category: 'DIY',
          icon: '🛁',
        },
        {
          title: 'Replace Doorknob',
          description: 'Upgrade old hardware yourself - modern locks installed in 15 minutes.',
          category: 'DIY',
          icon: '🚪',
        },
        {
          title: 'Patch Drywall',
          description: 'Fix holes in walls like a pro - smooth finish with basic supplies.',
          category: 'DIY',
          icon: '🏠',
        },
        {
          title: 'Install Shelf',
          description: 'Mount floating shelves securely - add storage and style in 30 minutes.',
          category: 'DIY',
          icon: '📚',
        },
        {
          title: 'Replace Showerhead',
          description: 'Upgrade your shower experience - install a new head with just your hands.',
          category: 'DIY',
          icon: '🚿',
        },
        {
          title: 'Clean Garbage Disposal',
          description: 'Freshen and sharpen blades - ice cubes and citrus do the trick.',
          category: 'DIY',
          icon: '🍋',
        },
        {
          title: 'Reset Circuit Breaker',
          description: 'Safely restore power when a breaker trips - no electrician required.',
          category: 'DIY',
          icon: '⚡',
        },
        {
          title: 'Fix Running Toilet',
          description: 'Stop wasting water with a simple flapper or fill valve adjustment.',
          category: 'DIY',
          icon: '🚽',
        },
      ];

      // Pick 12 rotating tips based on day of year (2 pages of 6)
      const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
      const startIndex = dayOfYear % baseTips.length;

      // Get 12 consecutive tips (wrapping around if needed)
      const selectedBaseTips: Omit<DailyTip, 'imageUrl' | 'fullImageUrl'>[] = [];
      for (let i = 0; i < 12; i++) {
        selectedBaseTips.push(baseTips[(startIndex + i) % baseTips.length]);
      }

      // Fallback images in case API fails
      const fallbackImages: Record<string, { thumbnail: string; full: string }> = {
        'Replace HVAC Filter': { thumbnail: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=400&h=400&fit=crop', full: 'https://images.unsplash.com/photo-1585771724684-38269d6639fd?w=1080' },
        'Fix Leaky Faucet': { thumbnail: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400&h=400&fit=crop', full: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=1080' },
        'Install Smart Outlet': { thumbnail: 'https://images.unsplash.com/photo-1545259741-2ea3ebf61fa3?w=400&h=400&fit=crop', full: 'https://images.unsplash.com/photo-1545259741-2ea3ebf61fa3?w=1080' },
        'Unclog Drain': { thumbnail: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=400&h=400&fit=crop', full: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=1080' },
        'Caulk Bathtub': { thumbnail: 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=400&h=400&fit=crop', full: 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1080' },
        'Replace Doorknob': { thumbnail: 'https://images.unsplash.com/photo-1558346648-9757f2fa4474?w=400&h=400&fit=crop', full: 'https://images.unsplash.com/photo-1558346648-9757f2fa4474?w=1080' },
        'Patch Drywall': { thumbnail: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=400&h=400&fit=crop', full: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=1080' },
        'Install Shelf': { thumbnail: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=400&h=400&fit=crop', full: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?w=1080' },
        'Replace Showerhead': { thumbnail: 'https://images.unsplash.com/photo-1564540586988-aa4e53c3d799?w=400&h=400&fit=crop', full: 'https://images.unsplash.com/photo-1564540586988-aa4e53c3d799?w=1080' },
        'Clean Garbage Disposal': { thumbnail: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=400&fit=crop', full: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1080' },
        'Reset Circuit Breaker': { thumbnail: 'https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=400&h=400&fit=crop', full: 'https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=1080' },
        'Fix Running Toilet': { thumbnail: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=400&h=400&fit=crop', full: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=1080' },
      };

      // Try to fetch AI-powered images from Unsplash
      let selectedTips: DailyTip[];
      try {
        const titles = selectedBaseTips.map(t => t.title);
        const { data, error } = await getArticleImages(titles);

        if (data && data.images && !error) {
          // Map API images to tips
          const imageMap = new Map(data.images.map(img => [img.title, { thumbnail: img.thumbnailUrl, full: img.fullUrl }]));
          selectedTips = selectedBaseTips.map(tip => ({
            ...tip,
            imageUrl: imageMap.get(tip.title)?.thumbnail || fallbackImages[tip.title]?.thumbnail || 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=400&fit=crop',
            fullImageUrl: imageMap.get(tip.title)?.full || fallbackImages[tip.title]?.full || 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1080',
          }));
          console.log('[MainHome] Loaded AI-powered images for tips');
        } else {
          throw new Error(error || 'Failed to fetch images');
        }
      } catch (apiError) {
        console.log('[MainHome] API image fetch failed, using fallbacks:', apiError);
        // Use fallback images
        selectedTips = selectedBaseTips.map(tip => ({
          ...tip,
          imageUrl: fallbackImages[tip.title]?.thumbnail || 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400&h=400&fit=crop',
          fullImageUrl: fallbackImages[tip.title]?.full || 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1080',
        }));
      }

      setDailyTips(selectedTips);

      // Cache it with versioned keys
      await AsyncStorage.setItem(cacheKey, JSON.stringify(selectedTips));
      await AsyncStorage.setItem(dateKey, today);
    } catch (error) {
      console.error('Error loading daily tip:', error);
    } finally {
      setLoadingTip(false);
    }
  };

  const handleCardPress = (route: keyof RootStackParamList) => {
    if (route === 'Diagnosis') {
      // Navigate without category to show category selection screen
      navigation.navigate('Diagnosis', {} as any);
    } else {
      navigation.navigate(route as any);
    }
  };

  const handleDiagnosisPress = (item: SavedDiagnosis) => {
    navigation.navigate('Results', {
      diagnosis: JSON.stringify(item.diagnosis_data),
      category: item.category,
      description: item.description,
      fromHistory: true,
      isAdvanced: item.is_advanced,
    });
  };

  const handleTipPress = (tip: DailyTip) => {
    navigation.navigate('Article', {
      title: tip.title,
      category: tip.category,
      icon: tip.icon,
      shortDescription: tip.description,
      heroImageUrl: tip.fullImageUrl,
    });
  };

  // Handle scroll events for pagination dots
  const handleTipsScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const page = Math.round(offsetX / pageWidth);
    setCurrentTipPage(page);
  };

  // Group tips into pages of 6
  const tipPages = [];
  for (let i = 0; i < dailyTips.length; i += TIPS_PER_PAGE) {
    tipPages.push(dailyTips.slice(i, i + TIPS_PER_PAGE));
  }

  // Render a single tip tile
  const renderTipTile = (tip: DailyTip, index: number) => (
    <TouchableOpacity
      key={index}
      style={[styles.tipSquare, { width: tileWidth, height: tileWidth }]}
      activeOpacity={0.8}
      onPress={() => handleTipPress(tip)}
    >
      <Image
        source={{ uri: tip.imageUrl }}
        style={styles.tipSquareImage}
      />
      <LinearGradient
        colors={['transparent', 'rgba(0, 0, 0, 0.75)']}
        style={styles.tipSquareGradient}
      >
        <Text style={styles.tipSquareTitle}>{tip.title}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );

  // Render a page of 6 tips (3x2 grid)
  const renderTipPage = ({ item: pageTips, index }: { item: DailyTip[]; index: number }) => (
    <View style={[styles.tipPage, { width: pageWidth }]}>
      <View style={styles.tipRow}>
        {pageTips.slice(0, 3).map((tip, i) => renderTipTile(tip, index * TIPS_PER_PAGE + i))}
      </View>
      <View style={styles.tipRow}>
        {pageTips.slice(3, 6).map((tip, i) => renderTipTile(tip, index * TIPS_PER_PAGE + 3 + i))}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Hero Gradient Area - Milky/airy gradient that fades into the background */}
      <LinearGradient
        colors={['#0f172a', '#6A9BD6', '#D4E8ED']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.heroGradient, { paddingTop: insets.top }]}
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

        {/* Ghost checkmark watermark (KanDu brand SVG) - centered, full size */}
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

        {/* Floating controls: house menu + welcome left, notifications right */}
        <View style={styles.heroControls}>
          <View style={styles.menuAndWelcome}>
            <TouchableOpacity
              onPress={() => setMenuVisible(true)}
              activeOpacity={0.7}
            >
              <HouseIcon
                icon="menu"
                iconColor="#ffffff"
                size={56}
                gradientColors={['#ffffff', '#e0e7ff', '#c7d2fe']}
              />
            </TouchableOpacity>

            {/* Welcome Message - next to menu */}
            <View style={styles.welcomeContainer}>
              <Text style={styles.welcomeText}>Welcome, {firstName}</Text>
              <Text style={styles.welcomeTagline}>You KanDu it!</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.heroIconButton}
            onPress={() => setNotificationListVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications-outline" size={26} color="#ffffff" />
            {dueFollowUps.length > 0 && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>{dueFollowUps.length}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </LinearGradient>


      {/* Profile Menu */}
      <ProfileMenu
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onNavigateToHistory={() => navigation.navigate('DiagnosisHistory')}
      />

      {/* Notification List Modal */}
      <Modal
        visible={notificationListVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNotificationListVisible(false)}
      >
        <TouchableOpacity
          style={styles.notificationOverlay}
          activeOpacity={1}
          onPress={() => setNotificationListVisible(false)}
        >
          <View style={styles.notificationListModal}>
            <View style={styles.notificationListHeader}>
              <Text style={styles.notificationListTitle}>Notifications</Text>
              <TouchableOpacity
                onPress={() => setNotificationListVisible(false)}
                style={styles.notificationClose}
              >
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            {dueFollowUps.length === 0 ? (
              <View style={styles.emptyNotifications}>
                <Ionicons name="checkmark-circle-outline" size={64} color="#cbd5e1" />
                <Text style={styles.emptyNotificationsText}>All caught up!</Text>
                <Text style={styles.emptyNotificationsSubtext}>No pending follow-ups</Text>
              </View>
            ) : (
              <ScrollView style={styles.notificationListScroll} showsVerticalScrollIndicator={true}>
                <View style={styles.notificationList}>
                  {dueFollowUps.map((notification) => (
                    <TouchableOpacity
                      key={notification.id}
                      style={styles.notificationListItem}
                      onPress={() => {
                        setNotificationListVisible(false);
                        handleDiagnosisPress(notification);
                      }}
                    >
                      <Text style={styles.notificationListEmoji}>
                        {getCategoryInfo(notification.category).emoji}
                      </Text>
                      <View style={styles.notificationListContent}>
                        <Text style={styles.notificationListItemTitle} numberOfLines={1}>
                          {notification.description}
                        </Text>
                        <Text style={styles.notificationListItemSubtitle} numberOfLines={1}>
                          {notification.diagnosis_data.diagnosis.summary}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Main action cards - 2x2 grid */}
        <View style={styles.cardsContainer}>
          <View style={styles.cardsGrid}>
            {ACTION_CARDS.map((card) => (
              <TouchableOpacity
                key={card.id}
                onPress={() => handleCardPress(card.route)}
                activeOpacity={0.8}
                style={styles.cardWrapper}
              >
                <LinearGradient
                  colors={card.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.card}
                >
                  {/* Checkmark watermark - KanDu style, bottom-right, partially clipped */}
                  <View style={styles.cardCheckmarkWatermark} pointerEvents="none">
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
                  {/* Glass sheen overlay */}
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
                  <Ionicons name={card.icon} size={40} color="#FFFFFF" />
                  <Text style={styles.cardLabel}>{card.label}</Text>
                  <Text style={styles.cardSubtext}>{card.subtext}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* In Progress section */}
        {inProgressItems.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>In Progress</Text>
              <TouchableOpacity onPress={() => navigation.navigate('DiagnosisHistory')}>
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.inProgressScroll}
            >
              {inProgressItems.map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.diagnosisCardCompact,
                    index === inProgressItems.length - 1 && styles.lastCard,
                  ]}
                  onPress={() => handleDiagnosisPress(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.compactHeader}>
                    <View style={styles.categoryBadge}>
                      <Text style={styles.categoryEmojiSmall}>{getCategoryInfo(item.category).emoji}</Text>
                      <Text style={styles.categoryNameSmall}>{getCategoryInfo(item.category).name}</Text>
                    </View>
                    <View style={styles.compactBadges}>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status || 'open') }]}>
                        <Text style={styles.statusBadgeText}>{getStatusLabel(item.status || 'open')}</Text>
                      </View>
                      <View style={[
                        styles.urgencyBadge,
                        { backgroundColor: getUrgencyColor(item.diagnosis_data.triage.urgency) }
                      ]}>
                        <Text style={styles.urgencyBadgeText}>
                          {formatUrgency(item.diagnosis_data.triage.urgency)}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.diagnosisSummaryCompact} numberOfLines={2}>
                    {item.diagnosis_data.diagnosis.summary}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* KanDu it Yourself section - Swipeable 3x2 Grid */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>KanDu it Yourself 🛠️</Text>
          </View>
          {loadingTip ? (
            <View style={styles.tipLoadingCard}>
              <Text style={styles.tipLoadingText}>Loading tips...</Text>
            </View>
          ) : tipPages.length > 0 ? (
            <View>
              <FlatList
                ref={tipsListRef}
                data={tipPages}
                renderItem={renderTipPage}
                keyExtractor={(_, index) => `page-${index}`}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={handleTipsScroll}
                scrollEventThrottle={16}
                decelerationRate="fast"
                snapToInterval={pageWidth}
                snapToAlignment="start"
                contentContainerStyle={styles.tipsContainer}
              />
              {/* Pagination Dots */}
              {tipPages.length > 1 && (
                <View style={styles.paginationDots}>
                  {tipPages.map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.paginationDot,
                        currentTipPage === index && styles.paginationDotActive,
                      ]}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : null}
        </View>

        {/* Bottom spacing */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#D4E8ED',
  },
  heroGradient: {
    paddingBottom: 110,
    marginTop: -8,
    position: 'relative',
    overflow: 'hidden',
  },
  heroControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  heroIconButton: {
    padding: 8,
    position: 'relative',
  },
  heroWatermark: {
    position: 'absolute',
    top: 20,
    right: -270,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 0,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  headerTitleText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerTitleItalic: {
    fontSize: 22,
    fontWeight: '700',
    fontStyle: 'italic',
    color: '#ffffff',
  },
  uWithTm: {
    position: 'relative',
  },
  tmSymbol: {
    position: 'absolute',
    fontSize: 8,
    fontWeight: '700',
    color: '#ffffff',
    top: 3,
    right: -2,
  },
  headerMenuButton: {
    padding: 4,
    marginLeft: 8,
  },
  headerNotificationButton: {
    padding: 4,
    marginRight: 8,
    position: 'relative',
  },
  notificationBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#f59e0b',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notificationBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  notificationOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: 8,
  },
  notificationListModal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: 340,
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  notificationListHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  notificationListTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  notificationClose: {
    padding: 4,
  },
  emptyNotifications: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyNotificationsText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 16,
  },
  emptyNotificationsSubtext: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  notificationListScroll: {
    maxHeight: 400,
  },
  notificationList: {
    paddingBottom: 20,
  },
  notificationListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  notificationListEmoji: {
    fontSize: 28,
  },
  notificationListContent: {
    flex: 1,
  },
  notificationListItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  notificationListItemSubtitle: {
    fontSize: 13,
    color: '#64748b',
  },
  menuAndWelcome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  welcomeContainer: {
    justifyContent: 'center',
  },
  welcomeText: {
    fontSize: 18,
    fontWeight: '400',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  welcomeTagline: {
    fontSize: 15,
    fontWeight: '300',
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
    paddingLeft: 12,
    fontStyle: 'italic',
  },
  cardsContainer: {
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  cardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
  },
  cardWrapper: {
    width: 165,
    height: 165,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  card: {
    flex: 1,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    overflow: 'hidden',
  },
  cardCheckmarkWatermark: {
    position: 'absolute',
    right: -25,
    bottom: -45,
  },
  cardLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 12,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  cardSubtext: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 4,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.15)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E5AA8',
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E90FF',
  },
  diagnosisCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#C2E7EC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  categoryEmoji: {
    fontSize: 18,
    marginRight: 6,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E5AA8',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  diagnosisSummary: {
    fontSize: 15,
    color: '#1e293b',
    lineHeight: 22,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
  },
  advancedBadge: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  advancedBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  urgencyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  urgencyBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  dateText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  // Compact diagnosis cards
  inProgressScroll: {
    paddingRight: 20,
  },
  diagnosisCardCompact: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
    width: 280,
    minHeight: 100,
    borderWidth: 2,
    borderColor: '#C2E7EC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  lastCard: {
    marginRight: 0,
  },
  compactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryEmojiSmall: {
    fontSize: 16,
    marginRight: 6,
  },
  categoryNameSmall: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E5AA8',
  },
  compactBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  diagnosisSummaryCompact: {
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 20,
  },
  // You KanDu It tip section - Swipeable 3x2 Grid
  tipsContainer: {
    // Container for the horizontal FlatList
  },
  tipPage: {
    // Each page of 6 tips
  },
  tipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tipSquare: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
    marginHorizontal: 4,
  },
  tipSquareImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  tipSquareGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    justifyContent: 'flex-end',
    padding: 8,
  },
  tipSquareTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 14,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  paginationDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#cbd5e1',
    marginHorizontal: 4,
  },
  paginationDotActive: {
    backgroundColor: '#1E90FF',
    width: 24,
  },
  tipLoadingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  tipLoadingText: {
    fontSize: 14,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
});
