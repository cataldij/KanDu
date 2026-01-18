import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';

type RootStackParamList = {
  Home: undefined;
  Results: {
    diagnosis: string;
    category: string;
    description: string;
    imageUri?: string;
    videoUri?: string;
    fromHistory?: boolean;
  };
  GuidedFix: {
    category: string;
    diagnosisSummary: string;
    likelyCause?: string;
    originalImageUri?: string;
  };
  GuidedFixDisclaimer: {
    category: string;
    diagnosisSummary: string;
    likelyCause?: string;
    originalImageUri?: string;
  };
};

type GuidedFixDisclaimerScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'GuidedFixDisclaimer'>;
  route: RouteProp<RootStackParamList, 'GuidedFixDisclaimer'>;
};

export default function GuidedFixDisclaimerScreen({
  navigation,
  route,
}: GuidedFixDisclaimerScreenProps) {
  const { category, diagnosisSummary, likelyCause, originalImageUri } = route.params;
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const handleStartGuidedFix = () => {
    if (!agreedToTerms) return;

    // Use replace so GuidedFix takes over and dismisses the disclaimer modal
    navigation.replace('GuidedFix', {
      category,
      diagnosisSummary,
      likelyCause,
      originalImageUri,
    });
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Image
          source={require('../assets/kandu-logo-only.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Let's fix this together</Text>
        <Text style={styles.subtitle}>AI-guided live repair assistance</Text>
      </View>

      <View style={styles.infoCard}>
        <View style={styles.infoSection}>
          <Ionicons name="videocam" size={32} color="#1E5AA8" />
          <Text style={styles.infoTitle}>How This Works</Text>
          <Text style={styles.infoText}>
            I'll guide you step by step using your camera. Point your phone at the problem and I'll
            tell you exactly what to do.
          </Text>
        </View>

        <View style={styles.infoSection}>
          <Ionicons name="volume-high" size={32} color="#10b981" />
          <Text style={styles.infoTitle}>Voice Guidance</Text>
          <Text style={styles.infoText}>
            I'll speak instructions out loud so you can keep your hands free. You can mute anytime.
          </Text>
        </View>

        <View style={styles.infoSection}>
          <Ionicons name="shield-checkmark" size={32} color="#f59e0b" />
          <Text style={styles.infoTitle}>Safety First</Text>
          <Text style={styles.infoText}>
            I'll watch for safety hazards and stop you immediately if something looks dangerous.
          </Text>
        </View>
      </View>

      <View style={styles.disclaimerCard}>
        <Ionicons name="information-circle" size={24} color="#ef4444" />
        <Text style={styles.disclaimerText}>
          This is AI guidance only — not professional advice. Stop immediately if anything feels
          unsafe.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.checkboxContainer}
        onPress={() => setAgreedToTerms(!agreedToTerms)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, agreedToTerms && styles.checkboxChecked]}>
          {agreedToTerms && <Ionicons name="checkmark" size={20} color="#ffffff" />}
        </View>
        <Text style={styles.checkboxLabel}>I understand and want to continue</Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={handleStartGuidedFix}
        disabled={!agreedToTerms}
        activeOpacity={0.8}
        style={styles.startButtonWrapper}
      >
        <LinearGradient
          colors={agreedToTerms ? ['#1E90FF', '#00CBA9'] : ['#9ca3af', '#9ca3af']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.startButton}
        >
          <Ionicons name="videocam" size={24} color="#ffffff" />
          <Text style={styles.startButtonText}>Start Guided Fix</Text>
        </LinearGradient>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
        <Text style={styles.cancelButtonText}>Maybe Later</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFB',
  },
  contentContainer: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logo: {
    width: 120,
    height: 80,
    marginBottom: -20,
    marginTop: -20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1E5AA8',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
  },
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    gap: 24,
  },
  infoSection: {
    alignItems: 'center',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    marginTop: 12,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
  },
  disclaimerCard: {
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  disclaimerText: {
    flex: 1,
    fontSize: 14,
    color: '#7f1d1d',
    lineHeight: 20,
    fontWeight: '500',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '500',
  },
  startButtonWrapper: {
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
    borderRadius: 16,
    gap: 12,
  },
  startButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  cancelButton: {
    padding: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
});
