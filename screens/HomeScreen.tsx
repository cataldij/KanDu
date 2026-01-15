import { useState, useLayoutEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import ProfileMenu from '../components/ProfileMenu';
import { SavedDiagnosis, getAllDueFollowUps, updateDiagnosis, getCategoryInfo } from '../services/diagnosisStorage';

type RootStackParamList = {
  Home: undefined;
  Diagnosis: { category: string };
  Results: {
    diagnosis: string;
    category: string;
    description: string;
    imageUri?: string;
    videoUri?: string;
    fromHistory?: boolean;
  };
  DiagnosisHistory: undefined;
  Auth: { mode?: 'login' | 'signup' };
};

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export default function HomeScreen({ navigation }: HomeScreenProps) {
  const { user } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);
  const [dueFollowUps, setDueFollowUps] = useState<SavedDiagnosis[]>([]);
  const [notificationListVisible, setNotificationListVisible] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<SavedDiagnosis | null>(null);
  const [notificationDetailVisible, setNotificationDetailVisible] = useState(false);

  // Load all due follow-ups when screen focuses
  useFocusEffect(
    useCallback(() => {
      const loadFollowUps = async () => {
        if (user) {
          const { data } = await getAllDueFollowUps(user.id);
          setDueFollowUps(data);
        } else {
          setDueFollowUps([]);
        }
      };
      loadFollowUps();
    }, [user])
  );

  const handleBellPress = () => {
    setNotificationListVisible(true);
  };

  const handleNotificationTap = (notification: SavedDiagnosis) => {
    setSelectedNotification(notification);
    setNotificationListVisible(false);
    setNotificationDetailVisible(true);
  };

  const reloadFollowUps = async () => {
    if (user) {
      const { data } = await getAllDueFollowUps(user.id);
      setDueFollowUps(data);
    }
  };

  const handleMarkResolved = async () => {
    if (selectedNotification) {
      await updateDiagnosis(selectedNotification.id, {
        status: 'resolved',
        resolved_at: new Date().toISOString(),
      });

      setNotificationDetailVisible(false);
      setSelectedNotification(null);
      await reloadFollowUps();
    }
  };

  const handleStillWorking = () => {
    setNotificationDetailVisible(false);
    if (selectedNotification) {
      navigation.navigate('Results', {
        diagnosis: JSON.stringify(selectedNotification.diagnosis_data),
        category: selectedNotification.category,
        description: selectedNotification.description,
        fromHistory: true,
      });
    }
    setSelectedNotification(null);
  };

  const handleSnooze = async () => {
    if (selectedNotification) {
      // Snooze for 3 more days
      const snoozeDate = new Date();
      snoozeDate.setDate(snoozeDate.getDate() + 3);

      await updateDiagnosis(selectedNotification.id, {
        follow_up_at: snoozeDate.toISOString(),
      });

      setNotificationDetailVisible(false);
      setSelectedNotification(null);
      await reloadFollowUps();
    }
  };

  // Always set headerBackTitle to KanDu™ immediately on mount
  useLayoutEffect(() => {
    navigation.setOptions({
      headerBackTitle: 'KanDu™',
    });
  }, [navigation]);

  // Add hamburger menu (logged in) or login button (logged out) to header
  useLayoutEffect(() => {
    if (user) {
      navigation.setOptions({
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
            onPress={handleBellPress}
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
    } else {
      navigation.setOptions({
        title: 'Welcome',
        headerLeft: () => (
          <TouchableOpacity
            style={styles.headerLoginButton}
            onPress={() => navigation.navigate('Auth', { mode: 'login' })}
            activeOpacity={0.7}
          >
            <Ionicons name="person-circle-outline" size={24} color="#ffffff" />
            <Text style={styles.headerLoginText}>Login</Text>
          </TouchableOpacity>
        ),
      });
    }
  }, [navigation, user, dueFollowUps, handleBellPress]);
  const categories: Array<{ name: string; emoji: string; id: string; gradient: [string, string] }> = [
    { name: 'Plumbing', emoji: '🚰', id: 'plumbing', gradient: ['#1E90FF', '#00CBA9'] },
    { name: 'Electrical', emoji: '⚡', id: 'electrical', gradient: ['#FF6B35', '#FFA500'] },
    { name: 'Appliances', emoji: '🔧', id: 'appliances', gradient: ['#00CBA9', '#1E90FF'] },
    { name: 'HVAC', emoji: '❄️', id: 'hvac', gradient: ['#4A90E2', '#7B68EE'] },
    { name: 'Automotive', emoji: '🚗', id: 'automotive', gradient: ['#FF6B35', '#E94B3C'] },
    { name: 'Other', emoji: '🏠', id: 'other', gradient: ['#64748b', '#94a3b8'] },
  ];

  const handleCategoryPress = (categoryId: string) => {
    navigation.navigate('Diagnosis', { category: categoryId });
  };

  return (
    <View style={styles.container}>
      {/* Profile Menu Modal */}
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
              <View style={styles.notificationList}>
                {dueFollowUps.map((notification) => (
                  <TouchableOpacity
                    key={notification.id}
                    style={styles.notificationListItem}
                    onPress={() => handleNotificationTap(notification)}
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
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Notification Detail Modal */}
      <Modal
        visible={notificationDetailVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNotificationDetailVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.notificationModal}>
            {selectedNotification && (
              <>
                <View style={styles.notificationHeader}>
                  <Text style={styles.notificationEmoji}>
                    {getCategoryInfo(selectedNotification.category).emoji}
                  </Text>
                  <View style={styles.notificationHeaderText}>
                    <Text style={styles.notificationTitle}>Follow-up Reminder</Text>
                    <Text style={styles.notificationCategory}>
                      {getCategoryInfo(selectedNotification.category).name}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setNotificationDetailVisible(false)}
                    style={styles.notificationClose}
                  >
                    <Ionicons name="close" size={24} color="#64748b" />
                  </TouchableOpacity>
                </View>

                <View style={styles.notificationBody}>
                  <Text style={styles.notificationLabel}>Issue:</Text>
                  <Text style={styles.notificationDescription}>
                    {selectedNotification.description}
                  </Text>

                  <Text style={styles.notificationLabel}>Diagnosis:</Text>
                  <Text style={styles.notificationSummary}>
                    {selectedNotification.diagnosis_data.diagnosis.summary}
                  </Text>

                  <Text style={styles.notificationPrompt}>
                    Has the issue been resolved, or do you need more help?
                  </Text>
                </View>

                <View style={styles.notificationActions}>
                  <TouchableOpacity
                    style={styles.resolvedButton}
                    onPress={handleMarkResolved}
                  >
                    <Ionicons name="checkmark-circle" size={20} color="#10b981" />
                    <Text style={styles.resolvedButtonText}>It's Fixed!</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.stillWorkingButton}
                    onPress={handleStillWorking}
                  >
                    <Ionicons name="build-outline" size={20} color="#2563eb" />
                    <Text style={styles.stillWorkingButtonText}>Still Working</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.snoozeButtonFull}
                  onPress={handleSnooze}
                >
                  <Ionicons name="moon-outline" size={18} color="#64748b" />
                  <Text style={styles.snoozeButtonFullText}>Remind me in 3 days</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Logo Section */}
      <View style={styles.logoSection}>
        {user ? (
          <>
            <Image
              source={require('../assets/KANDU LOGO ONLY TRANSPARENT.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>Don't panic... you KanDu it!</Text>
          </>
        ) : (
          <Image
            source={require('../assets/KANDU Light mode full logo TRANSPARENT.png')}
            style={styles.fullLogo}
            resizeMode="contain"
          />
        )}
      </View>

      {/* Question */}
      <Text style={styles.question}>What needs fixing?</Text>

      {/* Categories Grid */}
      <View style={styles.categoriesContainer}>
        {categories.map((category) => (
          <TouchableOpacity
            key={category.id}
            onPress={() => handleCategoryPress(category.id)}
            activeOpacity={0.8}
            style={styles.categoryButtonWrapper}
          >
            <LinearGradient
              colors={category.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.categoryButton}
            >
              <Text style={styles.emoji}>{category.emoji}</Text>
              <Text style={styles.categoryText}>{category.name}</Text>
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </View>

      {/* Register CTA - only show when logged out */}
      {!user && (
        <View style={styles.registerSection}>
          <TouchableOpacity
            onPress={() => navigation.navigate('Auth', { mode: 'signup' })}
            activeOpacity={0.9}
            style={styles.registerButtonWrapper}
          >
            <LinearGradient
              colors={['#1E90FF', '#00CBA9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.registerButton}
            >
              <View style={styles.registerButtonContent}>
                <Text style={styles.registerButtonText}>Create Free Account</Text>
                <Text style={styles.registerButtonSubtext}>Save your diagnoses & unlock features</Text>
              </View>
              <Ionicons name="arrow-forward-circle" size={28} color="#ffffff" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFB',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  headerMenuButton: {
    padding: 4,
    marginLeft: 8,
  },
  headerLoginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 4,
    marginLeft: 8,
    gap: 4,
  },
  headerLoginText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
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
  logoSection: {
    alignItems: 'center',
    marginBottom: 0,
  },
  logo: {
    width: 400,
    height: 250,
    marginBottom: -70,
    marginTop: -65,
  },
  fullLogo: {
    width: 416,
    height: 234,
    marginBottom: -60,
    marginTop: -50,
  },
  tagline: {
    fontSize: 20,
    color: '#64748b',
    fontStyle: 'italic',
    fontWeight: '500',
    marginBottom: 16,
  },
  question: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E5AA8',
    marginBottom: 20,
    textAlign: 'center',
  },
  categoriesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
    maxWidth: 500,
  },
  categoryButtonWrapper: {
    width: 150,
    height: 150,
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
  categoryButton: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  emoji: {
    fontSize: 52,
    marginBottom: 8,
  },
  categoryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  registerSection: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
  },
  registerButtonWrapper: {
    borderRadius: 16,
    shadowColor: '#1E90FF',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  registerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
  },
  registerButtonContent: {
    flex: 1,
  },
  registerButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  registerButtonSubtext: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  notificationModal: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  notificationEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  notificationHeaderText: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  notificationCategory: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  notificationClose: {
    padding: 4,
  },
  notificationBody: {
    padding: 20,
  },
  notificationLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 16,
  },
  notificationDescription: {
    fontSize: 15,
    color: '#1e293b',
    lineHeight: 22,
  },
  notificationSummary: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
  },
  notificationPrompt: {
    fontSize: 15,
    color: '#f59e0b',
    fontWeight: '600',
    marginTop: 20,
    textAlign: 'center',
  },
  notificationActions: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 8,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  resolvedButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#d1fae5',
    borderWidth: 1,
    borderColor: '#10b981',
    gap: 6,
  },
  resolvedButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10b981',
  },
  stillWorkingButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    gap: 6,
  },
  stillWorkingButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  snoozeButtonFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  snoozeButtonFullText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
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
});
