import { useState, useLayoutEffect, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';
import ProfileMenu from '../components/ProfileMenu';
import { SavedDiagnosis, getDueFollowUp, getCategoryInfo } from '../services/diagnosisStorage';

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
  const [dueFollowUp, setDueFollowUp] = useState<SavedDiagnosis | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Load due follow-up when screen focuses
  useFocusEffect(
    useCallback(() => {
      const loadFollowUp = async () => {
        if (user) {
          const { data } = await getDueFollowUp(user.id);
          setDueFollowUp(data);
          setBannerDismissed(false);
        } else {
          setDueFollowUp(null);
        }
      };
      loadFollowUp();
    }, [user])
  );

  const handleFollowUpPress = () => {
    if (dueFollowUp) {
      navigation.navigate('Results', {
        diagnosis: JSON.stringify(dueFollowUp.diagnosis_data),
        category: dueFollowUp.category,
        description: dueFollowUp.description,
        fromHistory: true,
      });
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
  }, [navigation, user]);
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

      {/* Follow-up Banner */}
      {user && dueFollowUp && !bannerDismissed && (
        <View style={styles.followUpBanner}>
          <View style={styles.followUpContent}>
            <Text style={styles.followUpEmoji}>
              {getCategoryInfo(dueFollowUp.category).emoji}
            </Text>
            <View style={styles.followUpText}>
              <Text style={styles.followUpTitle}>Any updates?</Text>
              <Text style={styles.followUpSummary} numberOfLines={1}>
                {dueFollowUp.diagnosis_data.diagnosis.summary}
              </Text>
            </View>
          </View>
          <View style={styles.followUpActions}>
            <TouchableOpacity
              style={styles.followUpButton}
              onPress={handleFollowUpPress}
            >
              <Text style={styles.followUpButtonText}>Update</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.followUpDismiss}
              onPress={() => setBannerDismissed(true)}
            >
              <Ionicons name="close" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>
        </View>
      )}

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
  followUpBanner: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: '#f59e0b',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
    width: '100%',
  },
  followUpContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  followUpEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  followUpText: {
    flex: 1,
  },
  followUpTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#92400e',
    marginBottom: 2,
  },
  followUpSummary: {
    fontSize: 13,
    color: '#78350f',
  },
  followUpActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  followUpButton: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  followUpButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  followUpDismiss: {
    padding: 4,
  },
});
