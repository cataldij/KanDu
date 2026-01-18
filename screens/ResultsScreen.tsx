import { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
  Image,
  Modal,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import * as Location from 'expo-location';
import * as Clipboard from 'expo-clipboard';
import { FreeDiagnosis, AdvancedDiagnosis, getAdvancedDiagnosis } from '../services/gemini';
import { generatePrimaryLink, getLinksForCategory, AffiliateLink } from '../services/affiliate';
import { useAuth } from '../contexts/AuthContext';
import { saveDiagnosis, updateDiagnosis } from '../services/diagnosisStorage';
import { LocalPro, getLocalPros, generateCallScript, buildMapsSearchUrl } from '../services/localPros';
import DiagnosisLoadingOverlay, { ADVANCED_LOADING_MESSAGES } from '../components/DiagnosisLoadingOverlay';

const { width: screenWidth } = Dimensions.get('window');

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
    isAdvanced?: boolean;
  };
  Auth: undefined;
  GuidedFixDisclaimer: {
    category: string;
    diagnosisSummary: string;
    likelyCause?: string;
    originalImageUri?: string;
  };
  GuidedFix: {
    category: string;
    diagnosisSummary: string;
    likelyCause?: string;
    originalImageUri?: string;
  };
};

type ResultsScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Results'>;
  route: RouteProp<RootStackParamList, 'Results'>;
};

export default function ResultsScreen({ navigation, route }: ResultsScreenProps) {
  const { diagnosis: diagnosisString, category, description, imageUri, videoUri, fromHistory, isAdvanced: initialIsAdvanced } = route.params;
  const parsedDiagnosis = JSON.parse(diagnosisString);


  const [diagnosis, setDiagnosis] = useState<FreeDiagnosis | AdvancedDiagnosis>(parsedDiagnosis);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeComplete, setUpgradeComplete] = useState(false); // For particle burst animation
  const [isAdvanced, setIsAdvanced] = useState(initialIsAdvanced || false);
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [currentVideoQuery, setCurrentVideoQuery] = useState('');
  const [shopModalVisible, setShopModalVisible] = useState(false);
  const [currentShopUrl, setCurrentShopUrl] = useState('');
  const [currentShopRetailer, setCurrentShopRetailer] = useState('');

  // Local Pros state
  const [localPros, setLocalPros] = useState<LocalPro[]>([]);
  const [localProsLoading, setLocalProsLoading] = useState(false);
  const [localProsError, setLocalProsError] = useState<string | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);

  // Call Script Modal state
  const [callScriptModalVisible, setCallScriptModalVisible] = useState(false);
  const [callScriptText, setCallScriptText] = useState('');

  const { user } = useAuth();
  const hasSavedRef = useRef(false);
  const savedDiagnosisIdRef = useRef<string | null>(null);

  // Save diagnosis to history when user is logged in (skip if viewing from history)
  useEffect(() => {
    const saveToHistory = async () => {
      if (user && !hasSavedRef.current && !fromHistory) {
        hasSavedRef.current = true;
        const { error, data } = await saveDiagnosis(
          user.id,
          category,
          description,
          diagnosis,
          isAdvanced
        );
        if (error) {
          console.log('Failed to save diagnosis to history:', error.message);
        } else if (data) {
          // Store the saved diagnosis ID so we can update it if user upgrades
          savedDiagnosisIdRef.current = data.id;
        }
      }
    };
    saveToHistory();
  }, [user, category, description, diagnosis, isAdvanced, fromHistory]);

  // Update saved diagnosis when user upgrades to advanced
  useEffect(() => {
    const updateSavedDiagnosis = async () => {
      if (isAdvanced && savedDiagnosisIdRef.current && user) {
        const { error } = await updateDiagnosis(savedDiagnosisIdRef.current, {
          diagnosis_data: diagnosis,
          is_advanced: true,
        });
        if (error) {
          console.log('Failed to update diagnosis to advanced:', error.message);
        }
      }
    };
    updateSavedDiagnosis();
  }, [isAdvanced, diagnosis, user]);

  // Always show local help section - users can decide if they want to use it
  const shouldShowLocalHelp = true;

  useEffect(() => {
    const loadLocalPros = async () => {
      if (!shouldShowLocalHelp || !user) return;

      setLocalProsLoading(true);
      setLocalProsError(null);

      try {
        // Request location permission
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== 'granted') {
          setLocationDenied(true);
          setLocalProsLoading(false);
          return;
        }

        // Get current location
        let location;
        try {
          location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
        } catch (locError) {
          console.log('Location error, trying last known:', locError);
          // Try getting last known location as fallback
          location = await Location.getLastKnownPositionAsync();
          if (!location) {
            setLocalProsError('Could not determine your location');
            setLocalProsLoading(false);
            return;
          }
        }

        const { latitude, longitude } = location.coords;

        // Build query text from diagnosis (truncate to stay under 200 char limit)
        const fullQuery = `${diagnosis.diagnosis.summary} ${diagnosis.diagnosis.likelyCauses?.[0] || ''}`;
        const queryText = fullQuery.substring(0, 180);

        // Fetch local pros
        const pros = await getLocalPros({
          category,
          queryText,
          lat: latitude,
          lng: longitude,
        });

        setLocalPros(pros);
      } catch (error) {
        console.log('[LocalPros] Error loading:', error);
        // Simplify error message for user display
        let errorMsg = 'Could not load local professionals';
        if (error instanceof Error) {
          // Extract the most useful part of the error
          if (error.message.includes('rate limit') || error.message.includes('limit reached')) {
            errorMsg = 'Search limit reached. Try again later.';
          } else if (error.message.includes('authentication') || error.message.includes('sign in')) {
            errorMsg = 'Please sign in to find local pros.';
          } else if (error.message.includes('network') || error.message.includes('fetch')) {
            errorMsg = 'Network error. Check your connection.';
          } else {
            // Log full error for debugging but show generic message
            console.log('Full local pros error:', error.message);
            errorMsg = 'Service temporarily unavailable';
          }
        }
        setLocalProsError(errorMsg);
      } finally {
        setLocalProsLoading(false);
      }
    };

    // Run in background - don't block the screen
    loadLocalPros();
  }, [shouldShowLocalHelp, user, category, diagnosis]);

  // Get detected item label for call script
  const getDetectedItem = (): string | undefined => {
    if (!isAdvanced && (diagnosis as FreeDiagnosis).detectedItem?.label) {
      return (diagnosis as FreeDiagnosis).detectedItem?.label;
    }
    if (isAdvanced && 'detailedAnalysis' in diagnosis.diagnosis && diagnosis.diagnosis.productIdentification) {
      return `${diagnosis.diagnosis.productIdentification.brand} ${diagnosis.diagnosis.productIdentification.model}`;
    }
    return undefined;
  };

  // Handle showing call script modal
  const handleShowCallScript = () => {
    const script = generateCallScript({
      detectedItem: getDetectedItem(),
      diagnosisSummary: diagnosis.diagnosis.summary,
      likelyCause: diagnosis.diagnosis.likelyCauses?.[0],
    });
    setCallScriptText(script);
    setCallScriptModalVisible(true);
  };

  // Handle copying call script from modal
  const handleCopyCallScript = async () => {
    await Clipboard.setStringAsync(callScriptText);
    Alert.alert('Copied!', 'Call script copied to clipboard.');
  };

  // Handle call action
  const handleCallPro = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  // Handle directions action
  const handleGetDirections = (mapsUrl: string) => {
    Linking.openURL(mapsUrl);
  };

  // Handle fallback maps search
  const handleFallbackMapsSearch = () => {
    const url = buildMapsSearchUrl(category, diagnosis.diagnosis.summary);
    Linking.openURL(url);
  };

  const getCategoryEmoji = () => {
    const emojis: Record<string, string> = {
      appliances: '🔧',
      hvac: '❄️',
      plumbing: '🚰',
      electrical: '⚡',
    };
    return emojis[category] || '🔧';
  };

  const getUrgencyColor = () => {
    switch (diagnosis.triage.urgency) {
      case 'immediate':
        return '#ef4444';
      case 'soon':
        return '#f59e0b';
      case 'can_wait':
        return '#10b981';
      default:
        return '#64748b';
    }
  };

  const getUrgencyText = () => {
    switch (diagnosis.triage.urgency) {
      case 'immediate':
        return 'Fix Immediately';
      case 'soon':
        return 'Fix Soon';
      case 'can_wait':
        return 'Can Wait';
      default:
        return 'Unknown';
    }
  };

  const getRiskColor = () => {
    switch (diagnosis.triage.riskLevel) {
      case 'high':
        return '#ef4444';
      case 'medium':
        return '#f59e0b';
      case 'low':
        return '#10b981';
      default:
        return '#64748b';
    }
  };

  const handleUpgrade = async () => {
    // TODO: Add Stripe payment here before calling API
    // For now, just call the advanced diagnosis directly

    setIsUpgrading(true);
    setUpgradeComplete(false);

    try {
      console.log('Starting advanced diagnosis...');
      const advancedDiag = await getAdvancedDiagnosis({
        category,
        description,
        imageUri,
        videoUri,
      });

      console.log('Advanced diagnosis received:', JSON.stringify(advancedDiag).substring(0, 200));

      // Update the diagnosis IMMEDIATELY so UI updates underneath the overlay
      setDiagnosis(advancedDiag);
      setIsAdvanced(true);

      // Then trigger particle burst animation (overlay stays visible)
      setUpgradeComplete(true);

    } catch (error) {
      console.error('Advanced diagnosis error:', error);
      setIsUpgrading(false);
      setUpgradeComplete(false);
      Alert.alert(
        'Upgrade Failed',
        error instanceof Error ? error.message : 'Something went wrong. Please try again.'
      );
    }
  };

  // Called when particle burst animation completes for upgrade
  const handleUpgradeAnimationComplete = () => {
    // Just clean up the overlay state - UI already updated
    setIsUpgrading(false);
    setUpgradeComplete(false);
    // Show success message after overlay is gone
    setTimeout(() => {
      Alert.alert('Success!', 'You now have the advanced diagnosis with detailed repair instructions.');
    }, 100);
  };

  const openYouTubeSearch = (searchQuery: string) => {
    setCurrentVideoQuery(searchQuery);
    setVideoModalVisible(true);
  };

  const openYouTubeExternal = (searchQuery: string) => {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
    Linking.openURL(url);
  };

  const openAffiliateLink = (searchTerms: string) => {
    const link = generatePrimaryLink(searchTerms, category);
    setCurrentShopUrl(link.url);
    setCurrentShopRetailer(link.displayName);
    setShopModalVisible(true);
  };

  const openAffiliateLinkWithRetailer = (link: AffiliateLink) => {
    setCurrentShopUrl(link.url);
    setCurrentShopRetailer(link.displayName);
    setShopModalVisible(true);
  };

  const openShopExternal = () => {
    Linking.openURL(currentShopUrl);
  };

  // If user is not logged in, show teaser with register prompt
  if (!user) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.header}>
          <Image
            source={require('../assets/kandu-logo-only.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.titleRow}>
            <Text style={styles.emoji}>{getCategoryEmoji()}</Text>
            <Text style={styles.title}>Diagnosis Preview</Text>
          </View>
        </View>

        {/* Teaser Diagnosis Card */}
        <View style={styles.diagnosisCard}>
          <View style={styles.diagnosisHeader}>
            <Text style={styles.diagnosisLabel}>Quick Assessment</Text>
            <View style={styles.badgeRow}>
              <View style={[styles.urgencyBadge, { backgroundColor: getUrgencyColor() }]}>
                <Text style={styles.urgencyText}>{getUrgencyText()}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.diagnosisText}>{diagnosis.diagnosis.summary}</Text>

          {/* Blurred/locked content teaser */}
          <View style={styles.lockedContent}>
            <Text style={styles.lockedIcon}>🔒</Text>
            <Text style={styles.lockedTitle}>Full Diagnosis Locked</Text>
            <Text style={styles.lockedDescription}>
              Register for FREE to unlock:
            </Text>
            <View style={styles.lockedFeatures}>
              <Text style={styles.lockedFeatureText}>✓ Likely causes & solutions</Text>
              <Text style={styles.lockedFeatureText}>✓ DIY vs. Pro recommendation</Text>
              <Text style={styles.lockedFeatureText}>✓ Safety warnings</Text>
              <Text style={styles.lockedFeatureText}>✓ Helpful repair videos</Text>
              <Text style={styles.lockedFeatureText}>✓ Next steps to fix it</Text>
            </View>
          </View>
        </View>

        {/* Register CTA */}
        <View style={styles.registerCard}>
          <Text style={styles.registerTitle}>Get Your Complete Free Diagnosis</Text>
          <Text style={styles.registerDescription}>
            Create a free account to see the full analysis, safety warnings, repair videos, and step-by-step guidance.
          </Text>

          <TouchableOpacity
            onPress={() => navigation.navigate('Auth')}
            activeOpacity={0.8}
            style={styles.registerButtonWrapper}
          >
            <LinearGradient
              colors={['#1E90FF', '#00CBA9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.registerButton}
            >
              <Text style={styles.registerButtonText}>Register for Free</Text>
              <Text style={styles.registerButtonSubtext}>Takes less than 30 seconds</Text>
            </LinearGradient>
          </TouchableOpacity>

          <Text style={styles.registerNote}>
            Already have an account?{' '}
            <Text style={styles.registerLink} onPress={() => navigation.navigate('Auth')}>
              Sign In
            </Text>
          </Text>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={styles.secondaryButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Image
          source={require('../assets/kandu-logo-only.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.titleRow}>
          <Text style={styles.emoji}>{getCategoryEmoji()}</Text>
          <Text style={styles.title}>{isAdvanced ? 'Advanced Repair Guide' : 'Free Diagnosis'}</Text>
        </View>
        {isAdvanced && <Text style={styles.subtitle}>Premium $1.99 Analysis</Text>}
      </View>

      {/* Diagnosis Section */}
      <View style={styles.diagnosisCard}>
        <View style={styles.diagnosisHeader}>
          <Text style={styles.diagnosisLabel}>Diagnosis</Text>
          <View style={styles.badgeRow}>
            <View style={[styles.urgencyBadge, { backgroundColor: getUrgencyColor() }]}>
              <Text style={styles.urgencyText}>{getUrgencyText()}</Text>
            </View>
            <View style={[styles.urgencyBadge, { backgroundColor: getRiskColor(), marginLeft: 8 }]}>
              <Text style={styles.urgencyText}>{diagnosis.triage.riskLevel.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* Detected Item (Free tier) - Show at top for visibility */}
        {!isAdvanced && (diagnosis as FreeDiagnosis).detectedItem?.label && (
          <View style={styles.detectedItemSection}>
            <Text style={styles.detectedItemLabel}>🔍 Detected:</Text>
            <Text style={styles.detectedItemText}>{(diagnosis as FreeDiagnosis).detectedItem?.label}</Text>
          </View>
        )}

        <Text style={styles.diagnosisText}>{diagnosis.diagnosis.summary}</Text>

        {/* Product Identification (Advanced only) */}
        {isAdvanced && 'detailedAnalysis' in diagnosis.diagnosis && diagnosis.diagnosis.productIdentification && (
          <View style={styles.productIdSection}>
            <Text style={styles.productIdTitle}>🔍 Product Identified:</Text>
            <Text style={styles.productIdText}>
              {diagnosis.diagnosis.productIdentification.brand} - {diagnosis.diagnosis.productIdentification.model}
            </Text>
            <Text style={styles.confidenceText}>
              Confidence: {diagnosis.diagnosis.productIdentification.confidence}
            </Text>
          </View>
        )}

        {/* Detailed Analysis (Advanced only) */}
        {isAdvanced && 'detailedAnalysis' in diagnosis.diagnosis && (
          <View style={styles.detailedAnalysisSection}>
            <Text style={styles.sectionTitle}>📋 Detailed Analysis</Text>
            <Text style={styles.detailedAnalysisText}>{diagnosis.diagnosis.detailedAnalysis}</Text>
          </View>
        )}

        {/* Likely Causes */}
        {diagnosis.diagnosis.likelyCauses && diagnosis.diagnosis.likelyCauses.length > 0 && (
          <View style={styles.causesSection}>
            <Text style={styles.causesTitle}>Likely Causes:</Text>
            {diagnosis.diagnosis.likelyCauses.map((cause, index) => (
              <Text key={index} style={styles.causeText}>• {cause}</Text>
            ))}
          </View>
        )}

        <View style={styles.quickInfo}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>DIY-able?</Text>
            <Text style={[styles.infoValue, { color: diagnosis.triage.isDIYable ? '#10b981' : '#ef4444' }]}>
              {diagnosis.triage.isDIYable ? 'Yes ✓' : 'No - Call a Pro'}
            </Text>
          </View>
        </View>
      </View>

      {/* Safety Warnings */}
      {diagnosis.safetyWarnings && diagnosis.safetyWarnings.length > 0 && (
        <View style={styles.safetyCard}>
          <Text style={styles.safetyTitle}>⚠️ Safety Warnings</Text>
          {diagnosis.safetyWarnings.map((warning, index) => (
            <Text key={index} style={styles.safetyWarning}>
              • {warning}
            </Text>
          ))}
        </View>
      )}

      {/* YouTube Videos */}
      {diagnosis.youtubeVideos && diagnosis.youtubeVideos.length > 0 && (
        <View style={styles.youtubeCard}>
          <Text style={styles.youtubeCardTitle}>📺 Helpful Repair Videos</Text>
          {diagnosis.youtubeVideos.map((video, index) => (
            <TouchableOpacity
              key={index}
              style={styles.videoItem}
              onPress={() => openYouTubeSearch(video.searchQuery)}
            >
              <View style={styles.videoContent}>
                <Text style={styles.videoTitle}>{video.title}</Text>
                <Text style={styles.videoRelevance}>{video.relevance}</Text>
              </View>
              <Text style={styles.videoArrow}>▶</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Next Steps (Free tier only) */}
      {!isAdvanced && 'nextSteps' in diagnosis && diagnosis.nextSteps && diagnosis.nextSteps.length > 0 && (
        <View style={styles.nextStepsCard}>
          <Text style={styles.nextStepsTitle}>✅ What To Do Next</Text>
          {diagnosis.nextSteps.map((step, index) => (
            <Text key={index} style={styles.nextStepText}>• {step}</Text>
          ))}
        </View>
      )}

      {/* Local Help Section */}
      {shouldShowLocalHelp && (
        <View style={styles.localHelpCard}>
          <Text style={styles.localHelpTitle}>📍 Local Help Near You</Text>

          {/* View Call Script Button */}
          <TouchableOpacity
            style={styles.callScriptButton}
            onPress={handleShowCallScript}
            activeOpacity={0.8}
          >
            <Text style={styles.callScriptButtonText}>📋 View Call Script</Text>
            <Text style={styles.callScriptHint}>Know what to say when you call</Text>
          </TouchableOpacity>

          {/* Loading State */}
          {localProsLoading && (
            <View style={styles.localHelpLoading}>
              <ActivityIndicator size="small" color="#1E5AA8" />
              <Text style={styles.localHelpLoadingText}>Finding professionals near you...</Text>
            </View>
          )}

          {/* Location Denied Fallback */}
          {locationDenied && !localProsLoading && (
            <View style={styles.locationDeniedCard}>
              <Text style={styles.locationDeniedText}>
                Location access needed to find nearby pros
              </Text>
              <TouchableOpacity
                style={styles.mapsSearchButton}
                onPress={handleFallbackMapsSearch}
                activeOpacity={0.8}
              >
                <Text style={styles.mapsSearchButtonText}>🗺️ Search on Google Maps</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Error State */}
          {localProsError && !localProsLoading && (
            <View style={styles.localHelpError}>
              <Text style={styles.localHelpErrorText}>{localProsError}</Text>
              <TouchableOpacity
                style={styles.mapsSearchButton}
                onPress={handleFallbackMapsSearch}
                activeOpacity={0.8}
              >
                <Text style={styles.mapsSearchButtonText}>🗺️ Search on Google Maps</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Empty State */}
          {!localProsLoading && !localProsError && !locationDenied && localPros.length === 0 && (
            <View style={styles.localHelpEmpty}>
              <Text style={styles.localHelpEmptyText}>No professionals found nearby</Text>
              <TouchableOpacity
                style={styles.mapsSearchButton}
                onPress={handleFallbackMapsSearch}
                activeOpacity={0.8}
              >
                <Text style={styles.mapsSearchButtonText}>🗺️ Search on Google Maps</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Local Pros List */}
          {!localProsLoading && localPros.length > 0 && (
            <View style={styles.localProsList}>
              {localPros.map((pro) => (
                <View key={pro.placeId} style={styles.localProCard}>
                  <View style={styles.localProHeader}>
                    <Text style={styles.localProName}>{pro.name}</Text>
                    {pro.openNow !== undefined && (
                      <View style={[
                        styles.openBadge,
                        { backgroundColor: pro.openNow ? '#10b981' : '#ef4444' }
                      ]}>
                        <Text style={styles.openBadgeText}>
                          {pro.openNow ? 'Open' : 'Closed'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Rating */}
                  {pro.rating && (
                    <View style={styles.ratingRow}>
                      <Text style={styles.ratingStars}>
                        {'★'.repeat(Math.round(pro.rating))}
                        {'☆'.repeat(5 - Math.round(pro.rating))}
                      </Text>
                      <Text style={styles.ratingText}>
                        {pro.rating.toFixed(1)} ({pro.userRatingsTotal || 0} reviews)
                      </Text>
                    </View>
                  )}

                  {/* Address */}
                  {pro.address && (
                    <Text style={styles.localProAddress}>{pro.address}</Text>
                  )}

                  {/* Action Buttons */}
                  <View style={styles.localProActions}>
                    {pro.phone && (
                      <TouchableOpacity
                        style={styles.callButton}
                        onPress={() => handleCallPro(pro.phone!)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.callButtonText}>📞 Call</Text>
                      </TouchableOpacity>
                    )}
                    {pro.mapsUrl && (
                      <TouchableOpacity
                        style={styles.directionsButton}
                        onPress={() => handleGetDirections(pro.mapsUrl!)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.directionsButtonText}>🗺️ Directions</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Advanced Sections */}
      {isAdvanced && (diagnosis as AdvancedDiagnosis).stepByStep && (
        <View style={styles.advancedCard}>
          <Text style={styles.advancedSectionTitle}>🛠️ Step-by-Step Repair Instructions</Text>

          {/* Live Guidance CTA */}
          <TouchableOpacity
            onPress={() => navigation.navigate('GuidedFixDisclaimer', {
              category,
              diagnosisSummary: diagnosis.diagnosis.summary,
              likelyCause: diagnosis.diagnosis.likelyCauses?.[0],
              originalImageUri: imageUri,
            })}
            activeOpacity={0.8}
            style={styles.liveGuidanceButtonWrapper}
          >
            <LinearGradient
              colors={['#10b981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.liveGuidanceButton}
            >
              <View style={styles.liveGuidanceContent}>
                <Ionicons name="videocam" size={28} color="#ffffff" />
                <View style={styles.liveGuidanceTextContainer}>
                  <Text style={styles.liveGuidanceButtonText}>We KanDu this together</Text>
                  <Text style={styles.liveGuidanceButtonSubtext}>I'll guide you step by step using your camera</Text>
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {(diagnosis as AdvancedDiagnosis).stepByStep.map((step, index) => (
            <View key={index} style={styles.stepItem}>
              <Text style={styles.stepNumber}>{index + 1}</Text>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>
      )}

      {isAdvanced && (diagnosis as AdvancedDiagnosis).partsList && (diagnosis as AdvancedDiagnosis).partsList.length > 0 && (
        <View style={styles.advancedCard}>
          <Text style={styles.advancedSectionTitle}>🔩 Parts You'll Need</Text>
          {(diagnosis as AdvancedDiagnosis).partsList.map((part, index) => (
            <View key={index} style={styles.partItemCard}>
              <View style={styles.partInfo}>
                <Text style={styles.partName}>{part.name}</Text>
                {part.partNumber && <Text style={styles.partNumber}>Part #: {part.partNumber}</Text>}
                <Text style={styles.partCost}>{part.estimatedCost}</Text>
              </View>
              <TouchableOpacity
                style={styles.shopButton}
                onPress={() => openAffiliateLink(part.searchTerms || part.name)}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#FF9900', '#FF6600']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.shopButtonGradient}
                >
                  <Text style={styles.shopButtonText}>🛒 Shop</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {isAdvanced && 'toolsList' in diagnosis && diagnosis.toolsList && diagnosis.toolsList.length > 0 && (
        <View style={styles.advancedCard}>
          <Text style={styles.advancedSectionTitle}>🔨 Tools Required</Text>
          {diagnosis.toolsList.map((tool, index) => (
            <View key={index} style={styles.toolItemCard}>
              <View style={styles.toolInfo}>
                <View style={styles.toolNameRow}>
                  <Text style={styles.toolName}>{tool.name}</Text>
                  {tool.required && <Text style={styles.requiredBadge}>Required</Text>}
                </View>
                {tool.estimatedCost && <Text style={styles.toolCost}>{tool.estimatedCost}</Text>}
              </View>
              <TouchableOpacity
                style={styles.shopButtonSmall}
                onPress={() => openAffiliateLink(tool.searchTerms || tool.name)}
                activeOpacity={0.8}
              >
                <Text style={styles.shopButtonSmallText}>Shop →</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {isAdvanced && 'detailedSafety' in diagnosis && diagnosis.detailedSafety && diagnosis.detailedSafety.length > 0 && (
        <View style={styles.advancedCard}>
          <Text style={styles.advancedSectionTitle}>🛡️ Detailed Safety Instructions</Text>
          {diagnosis.detailedSafety.map((safety, index) => (
            <Text key={index} style={styles.detailedSafetyText}>• {safety}</Text>
          ))}
        </View>
      )}

      {isAdvanced && 'troubleshooting' in diagnosis && diagnosis.troubleshooting && diagnosis.troubleshooting.length > 0 && (
        <View style={styles.advancedCard}>
          <Text style={styles.advancedSectionTitle}>🔧 Troubleshooting</Text>
          {diagnosis.troubleshooting.map((tip, index) => (
            <Text key={index} style={styles.troubleshootingText}>• {tip}</Text>
          ))}
        </View>
      )}

      {!isAdvanced && (
        <View style={styles.upgradeCard}>
          <Text style={styles.upgradeTitle}>Want a Personalized Repair Guide?</Text>
          <Text style={styles.upgradeDescription}>
            Get detailed step-by-step instructions tailored to YOUR specific issue, plus exact parts with model numbers
          </Text>

          <View style={styles.upgradeFeatures}>
            <View style={styles.feature}>
              <Text style={styles.featureIcon}>✅</Text>
              <Text style={styles.featureText}>Product identification (brand/model)</Text>
            </View>
            <View style={styles.feature}>
              <Text style={styles.featureIcon}>✅</Text>
              <Text style={styles.featureText}>Detailed step-by-step repair guide</Text>
            </View>
            <View style={styles.feature}>
              <Text style={styles.featureIcon}>✅</Text>
              <Text style={styles.featureText}>Parts list with exact part numbers</Text>
            </View>
            <View style={styles.feature}>
              <Text style={styles.featureIcon}>✅</Text>
              <Text style={styles.featureText}>Complete tools checklist</Text>
            </View>
            <View style={styles.feature}>
              <Text style={styles.featureIcon}>✅</Text>
              <Text style={styles.featureText}>Comprehensive safety guide</Text>
            </View>
            <View style={styles.feature}>
              <Text style={styles.featureIcon}>✅</Text>
              <Text style={styles.featureText}>Troubleshooting tips</Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleUpgrade}
            disabled={isUpgrading}
            activeOpacity={0.8}
            style={styles.upgradeButtonWrapper}
          >
            <LinearGradient
              colors={isUpgrading ? ['#9ca3af', '#9ca3af'] : ['#FF6B35', '#FFA500']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.upgradeButton}
            >
              {isUpgrading ? (
                <>
                  <ActivityIndicator color="#ffffff" size="small" style={{ marginRight: 12 }} />
                  <Text style={styles.upgradeButtonText}>Upgrading...</Text>
                </>
              ) : (
                <>
                  <Text style={styles.upgradeButtonText}>Get Advanced Repair Guide - $1.99</Text>
                  <Text style={styles.upgradeButtonSubtext}>Unlock detailed step-by-step instructions</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={styles.secondaryButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>

      {/* YouTube Video Modal */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={videoModalVisible}
        onRequestClose={() => setVideoModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setVideoModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>✕ Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.openExternalButton}
              onPress={() => {
                setVideoModalVisible(false);
                openYouTubeExternal(currentVideoQuery);
              }}
            >
              <Text style={styles.openExternalButtonText}>Open in YouTube</Text>
            </TouchableOpacity>
          </View>
          <WebView
            source={{
              uri: `https://www.youtube.com/results?search_query=${encodeURIComponent(currentVideoQuery)}`,
            }}
            style={styles.webView}
            allowsFullscreenVideo={true}
            javaScriptEnabled={true}
            domStorageEnabled={true}
          />
        </View>
      </Modal>

      {/* Shop Modal */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={shopModalVisible}
        onRequestClose={() => setShopModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.shopModalHeader}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShopModalVisible(false)}
            >
              <Text style={styles.closeButtonText}>✕ Close</Text>
            </TouchableOpacity>
            <Text style={styles.shopModalTitle}>{currentShopRetailer}</Text>
            <TouchableOpacity
              style={styles.openBrowserButton}
              onPress={() => {
                setShopModalVisible(false);
                openShopExternal();
              }}
            >
              <Text style={styles.openBrowserButtonText}>Open in Browser</Text>
            </TouchableOpacity>
          </View>
          <WebView
            source={{ uri: currentShopUrl }}
            style={styles.webView}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            renderLoading={() => (
              <View style={styles.webViewLoading}>
                <ActivityIndicator size="large" color="#1E5AA8" />
                <Text style={styles.loadingText}>Loading {currentShopRetailer}...</Text>
              </View>
            )}
          />
        </View>
      </Modal>

      {/* Call Script Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={callScriptModalVisible}
        onRequestClose={() => setCallScriptModalVisible(false)}
      >
        <View style={styles.callScriptModalOverlay}>
          <View style={styles.callScriptModal}>
            <View style={styles.callScriptModalHeader}>
              <Text style={styles.callScriptModalTitle}>📞 Call Script</Text>
              <TouchableOpacity
                style={styles.callScriptCloseButton}
                onPress={() => setCallScriptModalVisible(false)}
              >
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.callScriptContent}>
              <Text style={styles.callScriptModalText}>{callScriptText}</Text>
            </ScrollView>

            <View style={styles.callScriptModalActions}>
              <TouchableOpacity
                style={styles.callScriptCopyButton}
                onPress={handleCopyCallScript}
                activeOpacity={0.8}
              >
                <Ionicons name="copy-outline" size={20} color="#ffffff" />
                <Text style={styles.callScriptCopyButtonText}>Copy to Clipboard</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Advanced Diagnosis Loading Overlay */}
      <DiagnosisLoadingOverlay
        visible={isUpgrading}
        isLoading={!upgradeComplete}
        onAnimationComplete={handleUpgradeAnimationComplete}
        messages={ADVANCED_LOADING_MESSAGES}
        subtitle="Upgrading to advanced analysis..."
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8F4F8',
  },
  contentContainer: {
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logo: {
    width: 180,
    height: 120,
    marginBottom: -35,
    marginTop: -30,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emoji: {
    fontSize: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E5AA8',
  },
  subtitle: {
    fontSize: 14,
    color: '#FF6B35',
    marginTop: 6,
    fontWeight: '600',
  },
  diagnosisCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#C2E7EC',
  },
  diagnosisHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  diagnosisLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E5AA8',
  },
  badgeRow: {
    flexDirection: 'row',
  },
  urgencyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  urgencyText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  diagnosisText: {
    fontSize: 16,
    color: '#1e293b',
    lineHeight: 24,
    marginBottom: 16,
  },
  detectedItemSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#3b82f6',
  },
  detectedItemLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E5AA8',
    marginRight: 8,
  },
  detectedItemText: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '500',
    flex: 1,
  },
  productIdSection: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#17A2B8',
  },
  productIdTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1E5AA8',
    marginBottom: 6,
  },
  productIdText: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '600',
  },
  confidenceText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  detailedAnalysisSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E5AA8',
    marginBottom: 8,
  },
  detailedAnalysisText: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 22,
  },
  causesSection: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
  },
  causesTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#78350f',
    marginBottom: 6,
  },
  causeText: {
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
    marginBottom: 4,
  },
  quickInfo: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  infoValue: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  safetyCard: {
    backgroundColor: '#fee2e2',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#ef4444',
  },
  safetyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#991b1b',
    marginBottom: 12,
  },
  safetyWarning: {
    fontSize: 14,
    color: '#7f1d1d',
    lineHeight: 20,
    marginBottom: 8,
  },
  youtubeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#ff0000',
  },
  youtubeCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ff0000',
    marginBottom: 16,
  },
  videoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    marginBottom: 12,
  },
  videoContent: {
    flex: 1,
  },
  videoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  videoRelevance: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
  },
  videoArrow: {
    fontSize: 20,
    color: '#ff0000',
    marginLeft: 12,
  },
  nextStepsCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  nextStepsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#166534',
    marginBottom: 12,
  },
  nextStepText: {
    fontSize: 14,
    color: '#14532d',
    lineHeight: 20,
    marginBottom: 8,
  },
  advancedCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#C2E7EC',
  },
  advancedSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E5AA8',
    marginBottom: 16,
  },
  stepItem: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#17A2B8',
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 32,
    marginRight: 12,
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    color: '#1e293b',
    lineHeight: 22,
  },
  partItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  partItemCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  partInfo: {
    flex: 1,
    marginRight: 12,
  },
  partName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  partNumber: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 4,
  },
  whereToBuy: {
    fontSize: 13,
    color: '#17A2B8',
  },
  partCost: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#10b981',
    marginTop: 4,
  },
  shopButton: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  shopButtonGradient: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  shopButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  toolItemCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toolInfo: {
    flex: 1,
    marginRight: 12,
  },
  toolNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  toolName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  requiredBadge: {
    backgroundColor: '#ef4444',
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: 'hidden',
  },
  toolCost: {
    fontSize: 13,
    color: '#10b981',
    fontWeight: '600',
    marginTop: 4,
  },
  shopButtonSmall: {
    backgroundColor: '#1E5AA8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  shopButtonSmallText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  toolText: {
    fontSize: 15,
    color: '#1e293b',
    lineHeight: 24,
    marginBottom: 4,
  },
  detailedSafetyText: {
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 22,
    marginBottom: 8,
  },
  troubleshootingText: {
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 22,
    marginBottom: 8,
  },
  upgradeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    borderWidth: 3,
    borderColor: '#17A2B8',
  },
  upgradeTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1E5AA8',
    marginBottom: 8,
  },
  upgradeDescription: {
    fontSize: 15,
    color: '#64748b',
    marginBottom: 20,
    lineHeight: 22,
  },
  upgradeFeatures: {
    marginBottom: 20,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  featureText: {
    fontSize: 15,
    color: '#1e293b',
    flex: 1,
  },
  upgradeButtonWrapper: {
    borderRadius: 16,
    shadowColor: '#FF6B35',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  upgradeButton: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
  },
  upgradeButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  upgradeButtonSubtext: {
    color: '#ffffff',
    fontSize: 13,
    marginTop: 4,
    opacity: 0.9,
  },
  actionButtons: {
    gap: 12,
  },
  secondaryButton: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#C2E7EC',
  },
  secondaryButtonText: {
    color: '#1E5AA8',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#1E5AA8',
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#ef4444',
    borderRadius: 8,
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  openExternalButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#ff0000',
    borderRadius: 8,
  },
  openExternalButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  webView: {
    flex: 1,
    backgroundColor: '#000',
  },
  shopModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: '#1E5AA8',
  },
  shopModalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  openBrowserButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#FF9900',
    borderRadius: 8,
  },
  openBrowserButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  webViewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  // Teaser/Register styles
  lockedContent: {
    marginTop: 20,
    padding: 20,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  lockedIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  lockedTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E5AA8',
    marginBottom: 8,
  },
  lockedDescription: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 12,
  },
  lockedFeatures: {
    alignSelf: 'stretch',
  },
  lockedFeatureText: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 6,
    paddingLeft: 8,
  },
  registerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    borderWidth: 3,
    borderColor: '#00CBA9',
    alignItems: 'center',
  },
  registerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1E5AA8',
    marginBottom: 8,
    textAlign: 'center',
  },
  registerDescription: {
    fontSize: 15,
    color: '#64748b',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 22,
  },
  registerButtonWrapper: {
    width: '100%',
    borderRadius: 16,
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  registerButton: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  registerButtonSubtext: {
    color: '#ffffff',
    fontSize: 13,
    marginTop: 4,
    opacity: 0.9,
  },
  registerNote: {
    marginTop: 16,
    fontSize: 14,
    color: '#64748b',
  },
  registerLink: {
    color: '#1E5AA8',
    fontWeight: 'bold',
  },
  // Local Help styles
  localHelpCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#10b981',
  },
  localHelpTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#166534',
    marginBottom: 16,
  },
  callScriptButton: {
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#10b981',
    alignItems: 'center',
  },
  callScriptButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#166534',
  },
  callScriptHint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  localHelpLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  localHelpLoadingText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#64748b',
  },
  locationDeniedCard: {
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  locationDeniedText: {
    fontSize: 14,
    color: '#92400e',
    textAlign: 'center',
    marginBottom: 12,
  },
  mapsSearchButton: {
    backgroundColor: '#1E5AA8',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  mapsSearchButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  localHelpError: {
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  localHelpErrorText: {
    fontSize: 14,
    color: '#991b1b',
    textAlign: 'center',
    marginBottom: 12,
  },
  localHelpEmpty: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  localHelpEmptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 12,
  },
  localProsList: {
    gap: 12,
  },
  localProCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
  },
  localProHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  localProName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
    marginRight: 8,
  },
  openBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  openBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  ratingStars: {
    fontSize: 14,
    color: '#f59e0b',
    marginRight: 6,
  },
  ratingText: {
    fontSize: 13,
    color: '#64748b',
  },
  localProAddress: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 12,
  },
  localProActions: {
    flexDirection: 'row',
    gap: 10,
  },
  callButton: {
    flex: 1,
    backgroundColor: '#10b981',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  callButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  directionsButton: {
    flex: 1,
    backgroundColor: '#1E5AA8',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  directionsButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  // Live Guidance Button styles
  liveGuidanceButtonWrapper: {
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  liveGuidanceButton: {
    borderRadius: 16,
    padding: 18,
  },
  liveGuidanceContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  liveGuidanceTextContainer: {
    flex: 1,
  },
  liveGuidanceButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  liveGuidanceButtonSubtext: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
  },
  // Call Script Modal styles
  callScriptModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  callScriptModal: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  callScriptModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  callScriptModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E5AA8',
  },
  callScriptCloseButton: {
    padding: 4,
  },
  callScriptContent: {
    padding: 20,
    maxHeight: 400,
  },
  callScriptModalText: {
    fontSize: 16,
    color: '#1e293b',
    lineHeight: 26,
  },
  callScriptModalActions: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  callScriptCopyButton: {
    backgroundColor: '#10b981',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  callScriptCopyButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
