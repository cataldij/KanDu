/**
 * MainHomeScreen - Main logged-in home screen for KanDu
 * Matches the clean, bright aesthetic of the rest of the app
 */

import React, { useLayoutEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';
import ProfileMenu from '../components/ProfileMenu';
import {
  SavedDiagnosis,
  getCategoryInfo,
  formatDiagnosisDate,
  getAllDueFollowUps,
} from '../services/diagnosisStorage';

interface ActionCard {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtext: string;
  gradient: [string, string];
  route: keyof RootStackParamList | 'Diagnosis';
}

const ACTION_CARDS: ActionCard[] = [
  {
    id: 'fix',
    icon: 'construct',
    label: 'Fix it',
    subtext: 'Step-by-step guidance',
    gradient: ['#1E90FF', '#00CBA9'],
    route: 'Home',
  },
  {
    id: 'diagnose',
    icon: 'search',
    label: 'Diagnose it',
    subtext: "What's wrong?",
    gradient: ['#00CBA9', '#1E90FF'],
    route: 'Diagnosis',
  },
  {
    id: 'learn',
    icon: 'school',
    label: 'Learn it',
    subtext: 'Understand how it works',
    gradient: ['#4A90E2', '#7B68EE'],
    route: 'Home',
  },
  {
    id: 'do',
    icon: 'rocket',
    label: 'Do it',
    subtext: 'Get help with a project',
    gradient: ['#FF6B35', '#FFA500'],
    route: 'Home',
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
}

export default function MainHomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);
  const [inProgressItems, setInProgressItems] = useState<SavedDiagnosis[]>([]);
  const [dueFollowUps, setDueFollowUps] = useState<SavedDiagnosis[]>([]);
  const [notificationListVisible, setNotificationListVisible] = useState(false);
  const [dailyTips, setDailyTips] = useState<DailyTip[]>([]);
  const [loadingTip, setLoadingTip] = useState(false);

  // Set up header with menu and notifications
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: 'KanDu™',
      headerLeft: () => (
        <TouchableOpacity
          style={styles.headerMenuButton}
          onPress={() => setMenuVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="menu" size={28} color="#ffffff" />
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity
          style={styles.headerNotificationButton}
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
      ),
    });
  }, [navigation, dueFollowUps]);

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
    const TIPS_VERSION = 'v2'; // Bump this when tips change
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
    await AsyncStorage.multiRemove(['dailyTips', 'dailyTipsDate', 'dailyTips_v1', 'dailyTipsDate_v1']);

    setLoadingTip(true);
    try {
      // Simple DIY tasks anyone can do at home
      const tips: DailyTip[] = [
        {
          title: 'Replace HVAC Filter',
          description: 'Change your air filter in 5 minutes - breathe cleaner air and lower your energy bill.',
          category: 'DIY',
          icon: '❄️',
          imageUrl: 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?w=400&h=400&fit=crop',
        },
        {
          title: 'Fix Leaky Faucet',
          description: 'Stop that annoying drip yourself - save water and money with a simple washer replacement.',
          category: 'DIY',
          icon: '🚰',
          imageUrl: 'https://images.unsplash.com/photo-1585704032915-c3400ca199e7?w=400&h=400&fit=crop',
        },
        {
          title: 'Install Smart Outlet',
          description: 'Control your lights from your phone - no electrician needed, just 10 minutes.',
          category: 'DIY',
          icon: '⚡',
          imageUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=400&fit=crop',
        },
        {
          title: 'Unclog Drain',
          description: 'Clear slow drains without harsh chemicals - simple tools get the job done fast.',
          category: 'DIY',
          icon: '🔧',
          imageUrl: 'https://images.unsplash.com/photo-1607472586893-edb57bdc0e39?w=400&h=400&fit=crop',
        },
        {
          title: 'Caulk Bathtub',
          description: 'Seal gaps around your tub - prevent mold and water damage in one afternoon.',
          category: 'DIY',
          icon: '🛁',
          imageUrl: 'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=400&h=400&fit=crop',
        },
        {
          title: 'Replace Doorknob',
          description: 'Upgrade old hardware yourself - modern locks installed in 15 minutes.',
          category: 'DIY',
          icon: '🚪',
          imageUrl: 'https://images.unsplash.com/photo-1506976785307-8732e854ad03?w=400&h=400&fit=crop',
        },
        {
          title: 'Patch Drywall',
          description: 'Fix holes in walls like a pro - smooth finish with basic supplies.',
          category: 'DIY',
          icon: '🏠',
          imageUrl: 'https://images.unsplash.com/photo-1581858707511-0294aad0c9df?w=400&h=400&fit=crop',
        },
        {
          title: 'Install Shelf',
          description: 'Mount floating shelves securely - add storage and style in 30 minutes.',
          category: 'DIY',
          icon: '📚',
          imageUrl: 'https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=400&h=400&fit=crop',
        },
        {
          title: 'Replace Showerhead',
          description: 'Upgrade your shower experience - install a new head with just your hands.',
          category: 'DIY',
          icon: '🚿',
          imageUrl: 'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=400&h=400&fit=crop',
        },
        {
          title: 'Clean Garbage Disposal',
          description: 'Freshen and sharpen blades - ice cubes and citrus do the trick.',
          category: 'DIY',
          icon: '🍋',
          imageUrl: 'https://images.unsplash.com/photo-1585659722983-3a675dabf23d?w=400&h=400&fit=crop',
        },
      ];

      // Pick 9 rotating tips based on day of year
      const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
      const startIndex = dayOfYear % tips.length;

      // Get 9 consecutive tips (wrapping around if needed)
      const selectedTips: DailyTip[] = [];
      for (let i = 0; i < 9; i++) {
        selectedTips.push(tips[(startIndex + i) % tips.length]);
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

  const handleCardPress = (route: keyof RootStackParamList | 'Diagnosis') => {
    if (route === 'Diagnosis') {
      navigation.navigate('Diagnosis', { category: 'other' });
    } else {
      // @ts-ignore
      navigation.navigate(route);
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
    });
  };

  return (
    <View style={styles.container}>
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
        {/* Logo Section */}
        <View style={styles.logoSection}>
          <Image
            source={require('../assets/kandu-logo-only.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.tagline}>You KanDu it!</Text>
        </View>

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

        {/* KanDu it Yourself section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>KanDu it Yourself 🛠️</Text>
          </View>
          {loadingTip ? (
            <View style={styles.tipLoadingCard}>
              <Text style={styles.tipLoadingText}>Loading tips...</Text>
            </View>
          ) : dailyTips.length > 0 ? (
            <View style={styles.tipsGrid}>
              {dailyTips.map((tip, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.tipSquare}
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
              ))}
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
    backgroundColor: '#E8F4F8',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 20,
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
  logoSection: {
    alignItems: 'center',
    marginBottom: 10,
  },
  logo: {
    width: 280,
    height: 180,
    marginBottom: -50,
    marginTop: -30,
  },
  tagline: {
    fontSize: 20,
    color: '#64748b',
    fontStyle: 'italic',
    fontWeight: '500',
    marginBottom: 24,
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
  // You KanDu It tip section - 3x3 Grid
  tipsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  tipSquare: {
    width: '31.5%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f1f5f9',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
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
