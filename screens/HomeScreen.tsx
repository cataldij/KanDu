import { useState, useLayoutEffect, useCallback, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  Modal,
  ScrollView,
  Platform,
  useWindowDimensions,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
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
  GuestMode: undefined;
};

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

type WebSectionKey = 'how' | 'features' | 'categories' | 'pricing' | 'faq';

const WEB_NAV_ITEMS: Array<{ key: WebSectionKey; label: string }> = [
  { key: 'how', label: 'How it works' },
  { key: 'features', label: 'Capabilities' },
  { key: 'categories', label: 'What we fix' },
  { key: 'pricing', label: 'Pricing' },
  { key: 'faq', label: 'FAQ' },
];

const WEB_HOW_STEPS = [
  {
    title: 'Show the problem',
    description: 'Upload a photo, video, or audio clip in seconds.',
    icon: 'camera',
  },
  {
    title: 'Get instant triage',
    description: 'Know if it is DIY-safe or time to call a pro.',
    icon: 'flash',
  },
  {
    title: 'Fix it with confidence',
    description: 'Get step-by-step guidance, tools, and parts.',
    icon: 'construct',
  },
];

const WEB_FEATURES = [
  {
    title: 'Video + sound analysis',
    description: 'KanDu listens for rattles, squeaks, drips, and hums.',
    icon: 'mic',
  },
  {
    title: 'Fast free diagnosis',
    description: 'Clear answers in about 30 seconds, no waiting room.',
    icon: 'sparkles',
  },
  {
    title: 'Repair game plan',
    description: 'Step-by-step instructions with safety checks.',
    icon: 'list',
  },
  {
    title: 'Parts and tools list',
    description: 'Know exactly what you need before you start.',
    icon: 'hammer',
  },
  {
    title: 'Live expert support',
    description: 'Book a video call when the fix gets tricky.',
    icon: 'videocam',
  },
  {
    title: 'Contractor-ready report',
    description: 'Send pros a clean summary to get faster quotes.',
    icon: 'document-text',
  },
];

const WEB_PRICING = [
  {
    name: 'Free',
    price: '$0',
    tagline: 'Quick triage',
    features: [
      '30 second AI diagnosis',
      'DIY vs. pro guidance',
      'Urgency and safety notes',
    ],
  },
  {
    name: 'Advanced',
    price: '$1.99',
    tagline: 'Detailed repair plan',
    features: [
      'Step-by-step fix',
      'Parts, tools, and costs',
      'Alternative possibilities',
    ],
  },
  {
    name: 'Live Expert',
    price: 'From $15',
    tagline: '15 min video call',
    features: [
      'Real-time troubleshooting',
      'Hands-on guidance',
      'Contractor escalation',
    ],
  },
];

const WEB_FAQ = [
  {
    question: 'Is the first diagnosis really free?',
    answer: 'Yes. The free tier gives you a fast assessment and next step.',
  },
  {
    question: 'What can I upload?',
    answer: 'Photos, video, or just audio. KanDu reads what you see and hear.',
  },
  {
    question: 'What if the fix is unsafe?',
    answer: 'KanDu flags safety risks and tells you when to call a pro.',
  },
  {
    question: 'Can I talk to a real expert?',
    answer: 'Yes. Book a live video session when you need hands-on help.',
  },
];

const WEB_AUDIO_BARS = [10, 22, 14, 28, 16, 32, 18, 26, 14, 24];

const WEB_HERO_CHIPS = ['30s diagnosis', 'Video + audio', '$1.99 advanced'];

const WEB_STATS = [
  {
    value: '30 sec',
    label: 'Average triage time',
    description: 'No appointments or waiting rooms.',
  },
  {
    value: 'DIY-ready',
    label: 'Step-by-step guidance',
    description: 'Clear tools, parts, and safety notes.',
  },
  {
    value: 'Pro-ready',
    label: 'Shareable report',
    description: 'Send clean summaries to contractors.',
  },
];

const WEB_DISPLAY_FONT = '"Fraunces", "Playfair Display", Georgia, serif';
const WEB_BODY_FONT = '"Space Grotesk", "Trebuchet MS", "Gill Sans", sans-serif';

const WEB_SAMPLE = {
  issue: 'Dishwasher makes a loud humming sound',
  summary: 'Likely cause: worn wash pump bearing',
  urgency: 'Fix soon to prevent motor damage.',
  steps: [
    'Shut off power at the breaker.',
    'Remove lower rack and spray arm.',
    'Inspect pump housing for debris.',
    'Replace wash pump if grinding persists.',
  ],
  tools: ['Screwdriver', 'Towel', 'Replacement pump'],
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

  const isWeb = Platform.OS === 'web';

  if (isWeb) {
    return (
      <WebLanding
        navigation={navigation}
        categories={categories}
      />
    );
  }

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
              <ScrollView style={styles.notificationListScroll} showsVerticalScrollIndicator={true}>
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
              </ScrollView>
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
              source={require('../assets/kandu-logo-only.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>Don't panic... you KanDu it!</Text>
          </>
        ) : (
          <Image
            source={require('../assets/kandu-light-full.png')}
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

      {/* Guest Mode Tile */}
      {user && (
        <TouchableOpacity
          onPress={() => navigation.navigate('GuestMode')}
          activeOpacity={0.8}
          style={styles.guestModeTileWrapper}
        >
          <LinearGradient
            colors={['#8B5CF6', '#EC4899']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.guestModeTile}
          >
            <Text style={styles.guestModeTileEmoji}>🏠</Text>
            <Text style={styles.guestModeTileTitle}>Guest Mode</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}

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

type WebLandingProps = HomeScreenProps & {
  categories: Array<{ name: string; emoji: string; id: string; gradient: [string, string] }>;
};

function WebLanding({ navigation, categories }: WebLandingProps) {
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [sectionOffsets, setSectionOffsets] = useState<Record<WebSectionKey, number>>({
    how: 0,
    features: 0,
    categories: 0,
    pricing: 0,
    faq: 0,
  });

  const heroAnim = useRef(new Animated.Value(0)).current;
  const statsAnim = useRef(new Animated.Value(0)).current;
  const sectionAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(180, [
      Animated.timing(heroAnim, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(statsAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(sectionAnim, {
        toValue: 1,
        duration: 800,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [heroAnim, statsAnim, sectionAnim]);

  const isCompact = width < 900;
  const isMobile = width < 720;
  const contentWidth = Math.min(width - 40, 1200);
  const sidePadding = isMobile ? 20 : 48;
  const cardGap = 20;
  const columns = isCompact ? 1 : width < 1150 ? 2 : 3;
  const cardWidth = columns === 1 ? contentWidth : (contentWidth - cardGap * (columns - 1)) / columns;
  const stepWidth = isCompact ? contentWidth : (contentWidth - cardGap * 2) / 3;
  const heroImageWidth = isCompact ? Math.min(width - 80, 360) : 520;
  const heroImageHeight = isCompact ? heroImageWidth * 1.05 : 560;

  const sectionInnerStyle = [webStyles.sectionInner, { paddingHorizontal: sidePadding }];

  const handleScrollTo = (key: WebSectionKey) => {
    const offset = sectionOffsets[key];
    if (scrollRef.current && typeof offset === 'number') {
      scrollRef.current.scrollTo({ y: offset, animated: true });
    }
  };

  const handleStartDiagnosis = () => {
    navigation.navigate('Diagnosis', {} as any);
  };

  const handleSignup = () => {
    navigation.navigate('Auth', { mode: 'signup' });
  };

  const handleLogin = () => {
    navigation.navigate('Auth', { mode: 'login' });
  };

  const heroRevealStyle = {
    opacity: heroAnim,
    transform: [
      {
        translateY: heroAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  };

  const statsRevealStyle = {
    opacity: statsAnim,
    transform: [
      {
        translateY: statsAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [16, 0],
        }),
      },
    ],
  };

  const sectionRevealStyle = {
    opacity: sectionAnim,
    transform: [
      {
        translateY: sectionAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
    ],
  };

  return (
    <View style={webStyles.page}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={webStyles.pageContent}
        showsVerticalScrollIndicator={false}
      >
        <LinearGradient
          colors={['#0b1221', '#0f1c2b', '#102a3a']}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={webStyles.heroGradient}
        >
          <View style={webStyles.heroOrbOne} pointerEvents="none" />
          <View style={webStyles.heroOrbTwo} pointerEvents="none" />
          <View style={webStyles.heroGridLines} pointerEvents="none" />

          <View style={sectionInnerStyle}>
            <View style={webStyles.navBar}>
              <View style={webStyles.brand}>
                <Image
                  source={require('../assets/kandu-logo-only.png')}
                  style={webStyles.brandLogo}
                  resizeMode="contain"
                />
                <Image
                  source={require('../assets/kandu-light-full.png')}
                  style={webStyles.brandWordmark}
                  resizeMode="contain"
                />
              </View>

              {!isCompact && (
                <View style={webStyles.navLinks}>
                  {WEB_NAV_ITEMS.map((item) => (
                    <Pressable
                      key={item.key}
                      onPress={() => handleScrollTo(item.key)}
                      style={({ hovered }) => [
                        webStyles.navLinkButton,
                        hovered && webStyles.navLinkButtonHover,
                      ]}
                    >
                      <Text style={webStyles.navLinkText}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )}

              <View style={webStyles.navCtas}>
                <Pressable
                  onPress={handleLogin}
                  style={({ hovered }) => [
                    webStyles.navGhost,
                    hovered && webStyles.navGhostHover,
                  ]}
                >
                  <Text style={webStyles.navGhostText}>Log in</Text>
                </Pressable>
                <Pressable
                  onPress={handleSignup}
                  style={({ hovered, pressed }) => [
                    webStyles.navCta,
                    hovered && webStyles.navCtaHover,
                    pressed && webStyles.navCtaPressed,
                  ]}
                >
                  <Text style={webStyles.navCtaText}>Create free account</Text>
                </Pressable>
              </View>
            </View>

            <View style={[webStyles.heroGrid, isCompact && webStyles.heroGridStack]}>
              <Animated.View style={[webStyles.heroCopy, heroRevealStyle]}>
                <Text style={webStyles.heroEyebrow}>Before you panic, KanDu.</Text>
                <Text
                  style={[
                    webStyles.heroTitle,
                    isCompact && webStyles.heroTitleMedium,
                    isMobile && webStyles.heroTitleSmall,
                  ]}
                >
                  Fix anything at home with AI that sees, hears, and explains.
                </Text>
                <Text style={webStyles.heroSubtitle}>
                  Upload a photo, video, or audio clip. Get a fast diagnosis,
                  a safe repair plan, or a pro when you need one.
                </Text>
                <View style={[webStyles.heroCtas, isCompact && webStyles.heroCtasStack]}>
                  <Pressable
                    onPress={handleStartDiagnosis}
                    style={({ hovered, pressed }) => [
                      webStyles.ctaPrimary,
                      hovered && webStyles.ctaPrimaryHover,
                      pressed && webStyles.ctaPrimaryPressed,
                    ]}
                  >
                    <Text style={webStyles.ctaPrimaryText}>Start free diagnosis</Text>
                    <Ionicons name="arrow-forward" size={18} color="#08121c" />
                  </Pressable>
                  <Pressable
                    onPress={() => handleScrollTo('how')}
                    style={({ hovered }) => [
                      webStyles.ctaSecondary,
                      hovered && webStyles.ctaSecondaryHover,
                    ]}
                  >
                    <Text style={webStyles.ctaSecondaryText}>See how it works</Text>
                  </Pressable>
                </View>
                <View style={webStyles.heroChips}>
                  {WEB_HERO_CHIPS.map((chip) => (
                    <View key={chip} style={webStyles.heroChip}>
                      <Text style={webStyles.heroChipText}>{chip}</Text>
                    </View>
                  ))}
                </View>
              </Animated.View>

              <Animated.View style={[webStyles.heroVisual, heroRevealStyle]}>
                <View style={webStyles.heroVisualFrame}>
                  <Image
                    source={require('../assets/kandu-together.png')}
                    style={{ width: heroImageWidth, height: heroImageHeight }}
                    resizeMode="contain"
                  />
                </View>
                <View style={webStyles.heroMiniCards}>
                  <View style={webStyles.heroMiniCard}>
                    <Text style={webStyles.heroMiniTitle}>Sound-aware</Text>
                    <Text style={webStyles.heroMiniText}>Detects drips, hums, rattles</Text>
                  </View>
                  <View style={webStyles.heroMiniCard}>
                    <Text style={webStyles.heroMiniTitle}>Pro-ready</Text>
                    <Text style={webStyles.heroMiniText}>Share a clean diagnosis report</Text>
                  </View>
                </View>
              </Animated.View>
            </View>
          </View>
        </LinearGradient>

        <View style={webStyles.heroDivider} />

        <View style={webStyles.sectionLight}>
          <View style={sectionInnerStyle}>
            <Animated.View style={[webStyles.statsGrid, statsRevealStyle]}>
              {WEB_STATS.map((stat) => (
                <View key={stat.label} style={webStyles.statCard}>
                  <Text style={webStyles.statValue}>{stat.value}</Text>
                  <Text style={webStyles.statLabel}>{stat.label}</Text>
                  <Text style={webStyles.statDescription}>{stat.description}</Text>
                </View>
              ))}
            </Animated.View>
          </View>
        </View>

        <View
          style={webStyles.sectionSoft}
          onLayout={(event) =>
            setSectionOffsets((prev) => ({ ...prev, how: event.nativeEvent.layout.y }))
          }
        >
          <View style={sectionInnerStyle}>
            <View style={webStyles.sectionHeader}>
              <Text style={webStyles.sectionEyebrow}>How it works</Text>
              <Text style={webStyles.sectionTitle}>From chaos to calm in three moves.</Text>
              <Text style={webStyles.sectionSubtitle}>
                KanDu analyzes what you see and hear, then tells you the safest next step.
              </Text>
            </View>
            <Animated.View style={[webStyles.stepGrid, sectionRevealStyle]}>
              {WEB_HOW_STEPS.map((step) => (
                <LinearGradient
                  key={step.title}
                  colors={['#ffffff', '#eef6fb']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[webStyles.stepCard, { width: stepWidth }]}
                >
                  <View style={webStyles.stepIcon}>
                    <Ionicons name={step.icon as any} size={26} color="#1e3a8a" />
                  </View>
                  <Text style={webStyles.stepTitle}>{step.title}</Text>
                  <Text style={webStyles.stepDescription}>{step.description}</Text>
                </LinearGradient>
              ))}
            </Animated.View>
          </View>
        </View>

        <View
          style={webStyles.sectionLight}
          onLayout={(event) =>
            setSectionOffsets((prev) => ({ ...prev, features: event.nativeEvent.layout.y }))
          }
        >
          <View style={sectionInnerStyle}>
            <View style={webStyles.sectionHeader}>
              <Text style={webStyles.sectionEyebrow}>Capabilities</Text>
              <Text style={webStyles.sectionTitle}>A repair partner that thinks fast.</Text>
              <Text style={webStyles.sectionSubtitle}>
                Everything you need to diagnose, plan, and finish the job without panic.
              </Text>
            </View>
            <Animated.View style={[webStyles.featureGrid, sectionRevealStyle, { gap: cardGap }]}>
              {WEB_FEATURES.map((feature, index) => (
                <View key={feature.title} style={[webStyles.featureCard, { width: cardWidth }]}>
                  <View style={webStyles.featureIcon}>
                    <Ionicons name={feature.icon as any} size={22} color="#0f172a" />
                  </View>
                  <Text style={webStyles.featureTitle}>{feature.title}</Text>
                  <Text style={webStyles.featureDescription}>{feature.description}</Text>
                  <View style={[webStyles.featureAccent, index % 2 === 0 ? webStyles.accentTeal : webStyles.accentAmber]} />
                </View>
              ))}
            </Animated.View>
          </View>
        </View>

        <View style={webStyles.sectionSoft}>
          <View style={sectionInnerStyle}>
            <View style={webStyles.sectionHeader}>
              <Text style={webStyles.sectionEyebrow}>Live preview</Text>
              <Text style={webStyles.sectionTitle}>A diagnosis you can act on.</Text>
              <Text style={webStyles.sectionSubtitle}>
                KanDu delivers a concise summary, the likely cause, and clear steps so you can move fast.
              </Text>
            </View>
            <Animated.View style={[webStyles.previewGrid, sectionRevealStyle]}>
              <View style={webStyles.previewCard}>
                <Text style={webStyles.previewLabel}>Issue</Text>
                <Text style={webStyles.previewIssue}>{WEB_SAMPLE.issue}</Text>
                <View style={webStyles.previewDivider} />
                <Text style={webStyles.previewLabel}>Diagnosis</Text>
                <Text style={webStyles.previewSummary}>{WEB_SAMPLE.summary}</Text>
                <Text style={webStyles.previewUrgency}>{WEB_SAMPLE.urgency}</Text>
                <View style={webStyles.previewMeta}>
                  <View style={webStyles.previewMetaBlock}>
                    <Text style={webStyles.previewMetaTitle}>Confidence</Text>
                    <Text style={webStyles.previewMetaValue}>84%</Text>
                  </View>
                  <View style={webStyles.previewMetaBlock}>
                    <Text style={webStyles.previewMetaTitle}>Cost</Text>
                    <Text style={webStyles.previewMetaValue}>$35-$90</Text>
                  </View>
                  <View style={webStyles.previewMetaBlock}>
                    <Text style={webStyles.previewMetaTitle}>Time</Text>
                    <Text style={webStyles.previewMetaValue}>45 min</Text>
                  </View>
                </View>
              </View>

              <View style={webStyles.previewSteps}>
                <Text style={webStyles.previewStepsTitle}>Next steps</Text>
                {WEB_SAMPLE.steps.map((step, index) => (
                  <View key={step} style={webStyles.previewStepRow}>
                    <View style={webStyles.previewStepIndex}>
                      <Text style={webStyles.previewStepIndexText}>{index + 1}</Text>
                    </View>
                    <Text style={webStyles.previewStepText}>{step}</Text>
                  </View>
                ))}
                <View style={webStyles.previewTools}>
                  <Text style={webStyles.previewToolsTitle}>Tools & parts</Text>
                  <View style={webStyles.previewToolsList}>
                    {WEB_SAMPLE.tools.map((tool) => (
                      <View key={tool} style={webStyles.previewToolChip}>
                        <Ionicons name="hammer-outline" size={14} color="#0f172a" />
                        <Text style={webStyles.previewToolText}>{tool}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </Animated.View>
          </View>
        </View>

        <LinearGradient
          colors={['#0f172a', '#0b3a4a', '#0f172a']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={webStyles.sectionDark}
        >
          <View style={sectionInnerStyle}>
            <View style={[webStyles.soundGrid, isCompact && webStyles.soundGridStack]}>
              <View style={webStyles.soundCopy}>
                <Text style={webStyles.sectionEyebrow}>Sound analysis</Text>
                <Text style={[webStyles.sectionTitle, webStyles.sectionTitleOnDark]}>
                  Hear what your home is telling you.
                </Text>
                <Text style={[webStyles.sectionSubtitle, webStyles.sectionSubtitleOnDark]}>
                  KanDu recognizes mechanical and environmental sounds so you can catch problems early.
                </Text>
                <View style={webStyles.soundBullets}>
                  {['Rattles, squeaks, and humming', 'Water drips and airflow issues', 'Engine, appliance, and HVAC sounds'].map((item) => (
                    <View key={item} style={webStyles.soundBulletRow}>
                      <Ionicons name="checkmark-circle" size={18} color="#38bdf8" />
                      <Text style={webStyles.soundBulletText}>{item}</Text>
                    </View>
                  ))}
                </View>
              </View>
              <View style={webStyles.soundCard}>
                <Text style={webStyles.soundCardTitle}>Live waveform</Text>
                <View style={webStyles.audioBars}>
                  {WEB_AUDIO_BARS.map((height, index) => (
                    <View
                      key={`bar-${index}`}
                      style={[webStyles.audioBar, { height }]}
                    />
                  ))}
                </View>
                <Text style={webStyles.soundCardFooter}>
                  AI listens and highlights likely culprits.
                </Text>
              </View>
            </View>
          </View>
        </LinearGradient>

        <View
          style={webStyles.sectionSoft}
          onLayout={(event) =>
            setSectionOffsets((prev) => ({ ...prev, categories: event.nativeEvent.layout.y }))
          }
        >
          <View style={sectionInnerStyle}>
            <View style={webStyles.sectionHeader}>
              <Text style={webStyles.sectionEyebrow}>What we fix</Text>
              <Text style={webStyles.sectionTitle}>Everyday problems, covered.</Text>
              <Text style={webStyles.sectionSubtitle}>
                From plumbing leaks to electrical mysteries, KanDu helps you decide the safest move.
              </Text>
            </View>
            <View style={[webStyles.categoryGrid, { gap: 16 }]}>
              {categories.map((category) => (
                <LinearGradient
                  key={category.id}
                  colors={category.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={webStyles.categoryCard}
                >
                  <Text style={webStyles.categoryEmoji}>{category.emoji}</Text>
                  <Text style={webStyles.categoryLabel}>{category.name}</Text>
                </LinearGradient>
              ))}
            </View>
          </View>
        </View>

        <View
          style={webStyles.sectionLight}
          onLayout={(event) =>
            setSectionOffsets((prev) => ({ ...prev, pricing: event.nativeEvent.layout.y }))
          }
        >
          <View style={sectionInnerStyle}>
            <View style={webStyles.sectionHeader}>
              <Text style={webStyles.sectionEyebrow}>Pricing</Text>
              <Text style={webStyles.sectionTitle}>Start free, upgrade when you need depth.</Text>
              <Text style={webStyles.sectionSubtitle}>
                Transparent pricing that saves you time, money, and stress.
              </Text>
            </View>
            <View style={[webStyles.pricingGrid, { gap: 20 }]}>
              {WEB_PRICING.map((plan, index) => {
                const isFeatured = plan.name === 'Advanced';
                return (
                  <View
                    key={plan.name}
                    style={[
                      webStyles.priceCard,
                      isFeatured && webStyles.priceCardFeatured,
                      { width: cardWidth },
                    ]}
                  >
                    {isFeatured && (
                      <LinearGradient
                        colors={['rgba(56, 189, 248, 0.4)', 'rgba(14, 165, 233, 0.1)']}
                        style={StyleSheet.absoluteFill}
                      />
                    )}
                    <Text style={webStyles.priceName}>{plan.name}</Text>
                    <Text style={webStyles.priceValue}>{plan.price}</Text>
                    <Text style={webStyles.priceTagline}>{plan.tagline}</Text>
                    <View style={webStyles.priceDivider} />
                    {plan.features.map((feature) => (
                      <View key={feature} style={webStyles.priceFeatureRow}>
                        <Ionicons
                          name="checkmark"
                          size={16}
                          color={isFeatured ? '#38bdf8' : '#0f172a'}
                        />
                        <Text style={webStyles.priceFeatureText}>{feature}</Text>
                      </View>
                    ))}
                    {index === 0 && (
                      <Pressable
                        onPress={handleStartDiagnosis}
                        style={({ hovered }) => [
                          webStyles.priceCta,
                          hovered && webStyles.priceCtaHover,
                        ]}
                      >
                        <Text style={webStyles.priceCtaText}>Start free</Text>
                      </Pressable>
                    )}
                    {index === 1 && (
                      <Pressable
                        onPress={handleStartDiagnosis}
                        style={({ hovered }) => [
                          webStyles.priceCtaPrimary,
                          hovered && webStyles.priceCtaPrimaryHover,
                        ]}
                      >
                        <Text style={webStyles.priceCtaPrimaryText}>Unlock advanced</Text>
                      </Pressable>
                    )}
                    {index === 2 && (
                      <Pressable
                        onPress={handleSignup}
                        style={({ hovered }) => [
                          webStyles.priceCta,
                          hovered && webStyles.priceCtaHover,
                        ]}
                      >
                        <Text style={webStyles.priceCtaText}>Book an expert</Text>
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        <View
          style={webStyles.sectionSoft}
          onLayout={(event) =>
            setSectionOffsets((prev) => ({ ...prev, faq: event.nativeEvent.layout.y }))
          }
        >
          <View style={sectionInnerStyle}>
            <View style={webStyles.sectionHeader}>
              <Text style={webStyles.sectionEyebrow}>FAQ</Text>
              <Text style={webStyles.sectionTitle}>Quick answers before you jump in.</Text>
            </View>
            <View style={[webStyles.faqGrid, { gap: 18 }]}>
              {WEB_FAQ.map((item) => (
                <View key={item.question} style={webStyles.faqCard}>
                  <Text style={webStyles.faqQuestion}>{item.question}</Text>
                  <Text style={webStyles.faqAnswer}>{item.answer}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <LinearGradient
          colors={['#0b1221', '#102a43']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={webStyles.footerSection}
        >
          <View style={sectionInnerStyle}>
            <View style={webStyles.footerCard}>
              <View style={webStyles.footerBrand}>
                <Image
                  source={require('../assets/kandu-logo-only.png')}
                  style={webStyles.footerLogo}
                  resizeMode="contain"
                />
                <Image
                  source={require('../assets/kandu-light-full.png')}
                  style={webStyles.footerWordmark}
                  resizeMode="contain"
                />
              </View>
              <Text style={webStyles.footerTitle}>Ready to fix it?</Text>
              <Text style={webStyles.footerSubtitle}>
                Get a free diagnosis in about 30 seconds. No calls, no pressure, just clarity.
              </Text>
              <View style={webStyles.footerCtas}>
                <Pressable
                  onPress={handleStartDiagnosis}
                  style={({ hovered }) => [
                    webStyles.footerPrimary,
                    hovered && webStyles.footerPrimaryHover,
                  ]}
                >
                  <Text style={webStyles.footerPrimaryText}>Start free diagnosis</Text>
                </Pressable>
                <Pressable
                  onPress={handleSignup}
                  style={({ hovered }) => [
                    webStyles.footerSecondary,
                    hovered && webStyles.footerSecondaryHover,
                  ]}
                >
                  <Text style={webStyles.footerSecondaryText}>Create account</Text>
                </Pressable>
              </View>
            </View>
            <Text style={webStyles.footerNote}>
              KanDu helps you decide the safest next step. Always follow local safety codes and use licensed professionals when needed.
            </Text>
          </View>
        </LinearGradient>
      </ScrollView>
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
  guestModeTileWrapper: {
    width: 316,
    height: 70,
    marginTop: 16,
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
  guestModeTile: {
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    paddingHorizontal: 20,
    gap: 12,
  },
  guestModeTileEmoji: {
    fontSize: 32,
  },
  guestModeTileTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});

const webStyles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#0b1221',
  },
  pageContent: {
    paddingBottom: 120,
  },
  heroGradient: {
    paddingBottom: 90,
    overflow: 'hidden',
  },
  heroOrbOne: {
    position: 'absolute',
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: 'rgba(56, 189, 248, 0.18)',
    top: -160,
    right: -140,
  },
  heroOrbTwo: {
    position: 'absolute',
    width: 520,
    height: 520,
    borderRadius: 260,
    backgroundColor: 'rgba(45, 212, 191, 0.16)',
    bottom: -220,
    left: -220,
  },
  heroGridLines: {
    position: 'absolute',
    top: 40,
    left: 40,
    right: 40,
    bottom: 40,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 32,
    opacity: 0.5,
  },
  sectionInner: {
    width: '100%',
    maxWidth: 1200,
    alignSelf: 'center',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brandLogo: {
    width: 36,
    height: 36,
  },
  brandWordmark: {
    height: 28,
    width: 160,
  },
  navLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },
  navLinkButton: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  navLinkButtonHover: {
    transform: [{ translateY: -1 }],
  },
  navLinkText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.72)',
    fontFamily: WEB_BODY_FONT,
    letterSpacing: 0.2,
  },
  navCtas: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  navGhost: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  navGhostHover: {
    transform: [{ translateY: -1 }],
  },
  navGhostText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.74)',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '600',
  },
  navCta: {
    backgroundColor: '#38bdf8',
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  navCtaHover: {
    transform: [{ translateY: -1 }],
  },
  navCtaPressed: {
    transform: [{ translateY: 1 }],
  },
  navCtaText: {
    fontSize: 13,
    color: '#08121c',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '700',
  },
  heroGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 40,
    paddingVertical: 32,
  },
  heroGridStack: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  heroCopy: {
    flex: 1,
    maxWidth: 560,
  },
  heroEyebrow: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: '#7dd3fc',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '700',
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 52,
    lineHeight: 60,
    color: '#f8fafc',
    fontFamily: WEB_DISPLAY_FONT,
    fontWeight: '700',
  },
  heroTitleMedium: {
    fontSize: 46,
    lineHeight: 54,
  },
  heroTitleSmall: {
    fontSize: 38,
    lineHeight: 46,
  },
  heroSubtitle: {
    fontSize: 18,
    lineHeight: 30,
    color: 'rgba(255, 255, 255, 0.78)',
    fontFamily: WEB_BODY_FONT,
    marginTop: 18,
  },
  heroCtas: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 28,
    flexWrap: 'wrap',
  },
  heroCtasStack: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  ctaPrimary: {
    backgroundColor: '#38bdf8',
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ctaPrimaryHover: {
    transform: [{ translateY: -2 }],
  },
  ctaPrimaryPressed: {
    transform: [{ translateY: 1 }],
  },
  ctaPrimaryText: {
    color: '#08121c',
    fontSize: 15,
    fontFamily: WEB_BODY_FONT,
    fontWeight: '700',
  },
  ctaSecondary: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  ctaSecondaryHover: {
    transform: [{ translateY: -2 }],
  },
  ctaSecondaryText: {
    color: '#f8fafc',
    fontSize: 15,
    fontFamily: WEB_BODY_FONT,
    fontWeight: '600',
  },
  heroChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 20,
  },
  heroChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  heroChipText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontFamily: WEB_BODY_FONT,
    fontWeight: '600',
  },
  heroVisual: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroVisualFrame: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 32,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  heroMiniCards: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 18,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  heroMiniCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    maxWidth: 220,
  },
  heroMiniTitle: {
    fontSize: 13,
    color: '#f8fafc',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '700',
  },
  heroMiniText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.75)',
    fontFamily: WEB_BODY_FONT,
    marginTop: 4,
  },
  heroDivider: {
    height: 70,
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 44,
    borderTopRightRadius: 44,
    marginTop: -40,
  },
  sectionLight: {
    backgroundColor: '#f8fafc',
    paddingVertical: 72,
  },
  sectionSoft: {
    backgroundColor: '#eef2f6',
    paddingVertical: 72,
  },
  sectionDark: {
    paddingVertical: 80,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'center',
  },
  statCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 22,
    flex: 1,
    minWidth: 220,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  statValue: {
    fontSize: 24,
    fontFamily: WEB_DISPLAY_FONT,
    fontWeight: '700',
    color: '#0f172a',
  },
  statLabel: {
    fontSize: 14,
    fontFamily: WEB_BODY_FONT,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 8,
  },
  statDescription: {
    fontSize: 13,
    fontFamily: WEB_BODY_FONT,
    color: '#475569',
    marginTop: 6,
    lineHeight: 18,
  },
  sectionHeader: {
    marginBottom: 32,
  },
  sectionEyebrow: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: '#2563eb',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '700',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 36,
    lineHeight: 42,
    color: '#0f172a',
    fontFamily: WEB_DISPLAY_FONT,
    fontWeight: '700',
  },
  sectionSubtitle: {
    fontSize: 16,
    lineHeight: 26,
    color: '#475569',
    fontFamily: WEB_BODY_FONT,
    marginTop: 12,
    maxWidth: 620,
  },
  stepGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    justifyContent: 'center',
  },
  stepCard: {
    borderRadius: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    minWidth: 240,
  },
  stepIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  stepTitle: {
    fontSize: 18,
    fontFamily: WEB_BODY_FONT,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    fontFamily: WEB_BODY_FONT,
    color: '#475569',
    lineHeight: 22,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  featureCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 17,
    fontFamily: WEB_BODY_FONT,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  featureDescription: {
    fontSize: 14,
    fontFamily: WEB_BODY_FONT,
    color: '#475569',
    lineHeight: 22,
  },
  featureAccent: {
    height: 4,
    width: 48,
    borderRadius: 999,
    marginTop: 16,
  },
  accentTeal: {
    backgroundColor: '#2dd4bf',
  },
  accentAmber: {
    backgroundColor: '#f59e0b',
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    justifyContent: 'center',
  },
  previewCard: {
    flex: 1,
    minWidth: 280,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.1)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  previewLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: '#64748b',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '700',
  },
  previewIssue: {
    fontSize: 20,
    color: '#0f172a',
    fontFamily: WEB_DISPLAY_FONT,
    fontWeight: '700',
    marginTop: 8,
  },
  previewDivider: {
    height: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.12)',
    marginVertical: 16,
  },
  previewSummary: {
    fontSize: 15,
    color: '#0f172a',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '600',
    marginTop: 8,
  },
  previewUrgency: {
    fontSize: 13,
    color: '#e11d48',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '600',
    marginTop: 6,
  },
  previewMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 18,
  },
  previewMetaBlock: {
    backgroundColor: '#f1f5f9',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 90,
  },
  previewMetaTitle: {
    fontSize: 11,
    color: '#64748b',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '600',
  },
  previewMetaValue: {
    fontSize: 14,
    color: '#0f172a',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '700',
    marginTop: 4,
  },
  previewSteps: {
    flex: 1,
    minWidth: 280,
    backgroundColor: '#0f172a',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  previewStepsTitle: {
    fontSize: 18,
    color: '#f8fafc',
    fontFamily: WEB_DISPLAY_FONT,
    fontWeight: '700',
    marginBottom: 16,
  },
  previewStepRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  previewStepIndex: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#38bdf8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewStepIndexText: {
    fontSize: 12,
    color: '#08121c',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '700',
  },
  previewStepText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(248, 250, 252, 0.86)',
    fontFamily: WEB_BODY_FONT,
    lineHeight: 22,
  },
  previewTools: {
    marginTop: 18,
  },
  previewToolsTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    color: 'rgba(248, 250, 252, 0.6)',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '700',
  },
  previewToolsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  previewToolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f8fafc',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  previewToolText: {
    fontSize: 12,
    color: '#0f172a',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '600',
  },
  soundGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 32,
  },
  soundGridStack: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  soundCopy: {
    flex: 1,
  },
  sectionTitleOnDark: {
    color: '#f8fafc',
  },
  sectionSubtitleOnDark: {
    color: 'rgba(255, 255, 255, 0.72)',
  },
  soundBullets: {
    marginTop: 18,
    gap: 10,
  },
  soundBulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  soundBulletText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.78)',
    fontFamily: WEB_BODY_FONT,
  },
  soundCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    minWidth: 260,
  },
  soundCardTitle: {
    fontSize: 14,
    fontFamily: WEB_BODY_FONT,
    fontWeight: '700',
    color: '#f8fafc',
    marginBottom: 14,
  },
  audioBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    height: 64,
  },
  audioBar: {
    width: 8,
    borderRadius: 6,
    backgroundColor: '#38bdf8',
  },
  soundCardFooter: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    fontFamily: WEB_BODY_FONT,
    marginTop: 12,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  categoryCard: {
    width: 180,
    minWidth: 150,
    maxWidth: 220,
    height: 120,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  categoryEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  categoryLabel: {
    fontSize: 14,
    color: '#ffffff',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '700',
  },
  pricingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  priceCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.1)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    overflow: 'hidden',
  },
  priceCardFeatured: {
    borderColor: 'rgba(56, 189, 248, 0.6)',
    shadowOpacity: 0.18,
  },
  priceName: {
    fontSize: 14,
    color: '#1e293b',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  priceValue: {
    fontSize: 32,
    color: '#0f172a',
    fontFamily: WEB_DISPLAY_FONT,
    fontWeight: '700',
    marginTop: 10,
  },
  priceTagline: {
    fontSize: 14,
    color: '#475569',
    fontFamily: WEB_BODY_FONT,
    marginTop: 6,
  },
  priceDivider: {
    height: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.1)',
    marginVertical: 16,
  },
  priceFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  priceFeatureText: {
    fontSize: 13,
    color: '#475569',
    fontFamily: WEB_BODY_FONT,
    lineHeight: 20,
  },
  priceCta: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#0f172a',
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
  },
  priceCtaHover: {
    transform: [{ translateY: -1 }],
  },
  priceCtaText: {
    fontSize: 13,
    color: '#0f172a',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '700',
  },
  priceCtaPrimary: {
    marginTop: 12,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#38bdf8',
  },
  priceCtaPrimaryHover: {
    transform: [{ translateY: -1 }],
  },
  priceCtaPrimaryText: {
    fontSize: 13,
    color: '#08121c',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '700',
  },
  faqGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  faqCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    flex: 1,
    minWidth: 240,
  },
  faqQuestion: {
    fontSize: 15,
    color: '#0f172a',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '700',
  },
  faqAnswer: {
    fontSize: 13,
    color: '#475569',
    fontFamily: WEB_BODY_FONT,
    marginTop: 8,
    lineHeight: 20,
  },
  footerSection: {
    paddingVertical: 80,
  },
  footerCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 28,
    padding: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  footerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  footerLogo: {
    width: 34,
    height: 34,
  },
  footerWordmark: {
    height: 26,
    width: 150,
  },
  footerTitle: {
    fontSize: 32,
    color: '#f8fafc',
    fontFamily: WEB_DISPLAY_FONT,
    fontWeight: '700',
  },
  footerSubtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.75)',
    fontFamily: WEB_BODY_FONT,
    marginTop: 12,
    lineHeight: 24,
    maxWidth: 520,
  },
  footerCtas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    marginTop: 22,
  },
  footerPrimary: {
    backgroundColor: '#38bdf8',
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  footerPrimaryHover: {
    transform: [{ translateY: -1 }],
  },
  footerPrimaryText: {
    fontSize: 14,
    color: '#08121c',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '700',
  },
  footerSecondary: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  footerSecondaryHover: {
    transform: [{ translateY: -1 }],
  },
  footerSecondaryText: {
    fontSize: 14,
    color: '#f8fafc',
    fontFamily: WEB_BODY_FONT,
    fontWeight: '600',
  },
  footerNote: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: WEB_BODY_FONT,
    marginTop: 18,
    lineHeight: 18,
  },
});
