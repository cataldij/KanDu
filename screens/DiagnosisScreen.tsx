import { useState, useRef, useLayoutEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  InteractionManager,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { getFreeDiagnosis } from '../services/gemini';

type RootStackParamList = {
  Home: undefined;
  Diagnosis: { category: string };
  Results: {
    diagnosis: string;
    category: string;
    description: string;
    imageUri?: string;
    videoUri?: string;
  };
};

type DiagnosisScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Diagnosis'>;
  route: RouteProp<RootStackParamList, 'Diagnosis'>;
};

export default function DiagnosisScreen({ navigation, route }: DiagnosisScreenProps) {
  const { category } = route.params;
  const [image, setImage] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showMediaSheet, setShowMediaSheet] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Override back button to always show KanDu™
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -8 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={28} color="#ffffff" />
          <Text style={{ color: '#ffffff', fontSize: 17 }}>KanDu™</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const openMediaSheet = () => {
    setShowMediaSheet(true);
  };

  const closeMediaSheet = () => {
    setShowMediaSheet(false);
  };

  const handleMediaOption = (action: () => Promise<void>) => {
    setShowMediaSheet(false);
    // Wait for modal animation to complete before launching picker
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        action();
      }, 100);
    });
  };

  const pickImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Please allow access to your photos');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImage(result.assets[0].uri);
        setVideo(null);
      }
    } catch (error: any) {
      console.error('Error picking image:', error);
      Alert.alert('Error', `Failed to open gallery: ${error.message || 'Unknown error'}`);
    }
  };

  const takePhoto = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Please allow access to your camera');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImage(result.assets[0].uri);
        setVideo(null);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to open camera. Please try again.');
    }
  };

  const pickVideo = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Please allow access to your photos');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setVideo(result.assets[0].uri);
        setImage(null);
      }
    } catch (error) {
      console.error('Error picking video:', error);
      Alert.alert('Error', 'Failed to open gallery. Please try again.');
    }
  };

  const recordVideo = async () => {
    try {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Please allow access to your camera');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setVideo(result.assets[0].uri);
        setImage(null);
      }
    } catch (error) {
      console.error('Error recording video:', error);
      Alert.alert('Error', 'Failed to open camera. Please try again.');
    }
  };

  const analyzeProblem = async () => {
    if (!image && !video && !description) {
      Alert.alert('Missing Information', 'Please add a photo, video, or description of the problem');
      return;
    }

    setIsAnalyzing(true);

    try {
      const diagnosis = await getFreeDiagnosis({
        category,
        description,
        imageUri: image || undefined,
        videoUri: video || undefined,
      });

      setIsAnalyzing(false);
      navigation.navigate('Results', {
        diagnosis: JSON.stringify(diagnosis),
        category,
        description,
        imageUri: image || undefined,
        videoUri: video || undefined,
      });
    } catch (error) {
      setIsAnalyzing(false);
      Alert.alert(
        'Analysis Failed',
        error instanceof Error ? error.message : 'Something went wrong. Please try again.'
      );
    }
  };

  const getCategoryEmoji = () => {
    const emojis: Record<string, string> = {
      appliances: '🔧',
      hvac: '❄️',
      plumbing: '🚰',
      electrical: '⚡',
      automotive: '🚗',
      other: '🏠',
    };
    return emojis[category] || '🔧';
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardAvoid}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 20}
    >
      <ScrollView
        ref={scrollViewRef}
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header with Logo */}
      <View style={styles.header}>
        <Image
          source={require('../assets/KANDU LOGO ONLY TRANSPARENT.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.headerText}>
          <Text style={styles.emoji}>{getCategoryEmoji()}</Text>
          <Text style={styles.title}>
            {category.charAt(0).toUpperCase() + category.slice(1)}
          </Text>
        </View>
        <Text style={styles.subtitle}>Show us what's wrong</Text>
      </View>

      {/* Upload Section */}
      <View style={styles.uploadSection}>
        {image || video ? (
          <View style={styles.previewContainer}>
            {image ? (
              <Image source={{ uri: image }} style={styles.mediaPreview} />
            ) : video ? (
              <Video
                source={{ uri: video }}
                style={styles.mediaPreview}
                useNativeControls
                resizeMode={ResizeMode.CONTAIN}
                isLooping
              />
            ) : null}
            <View style={styles.previewActions}>
              <TouchableOpacity
                style={styles.changeMediaButton}
                onPress={openMediaSheet}
              >
                <Text style={styles.changeMediaText}>Change</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => {
                  setImage(null);
                  setVideo(null);
                }}
              >
                <Text style={styles.removeButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.addMediaButton}
            onPress={openMediaSheet}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={['rgba(30, 90, 168, 0.08)', 'rgba(30, 90, 168, 0.15)']}
              style={styles.addMediaGradient}
            >
              <View style={styles.addMediaIconContainer}>
                <Text style={styles.addMediaIcon}>+</Text>
              </View>
              <Text style={styles.addMediaTitle}>Add Photo or Video</Text>
              <Text style={styles.addMediaSubtitle}>Tap to capture or upload</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>

      {/* Description Section */}
      <View style={styles.descriptionSection}>
        <Text style={styles.sectionTitle}>✍️ Describe the Issue</Text>
        <TextInput
          style={styles.textInput}
          placeholder="What's happening? Any sounds, smells, or when it started?"
          placeholderTextColor="#94a3b8"
          multiline
          numberOfLines={5}
          value={description}
          onChangeText={setDescription}
          textAlignVertical="top"
          onFocus={() => {
            // Scroll just enough to show the text input above keyboard
            setTimeout(() => {
              scrollViewRef.current?.scrollTo({ y: 200, animated: true });
            }, 300);
          }}
        />
        <Text style={styles.helperText}>
          Tip: More details = better diagnosis!
        </Text>
      </View>

      {/* Analyze Button */}
      <TouchableOpacity
        style={styles.analyzeButtonWrapper}
        onPress={analyzeProblem}
        disabled={isAnalyzing}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={isAnalyzing ? ['#9ca3af', '#9ca3af'] : ['#1E90FF', '#00CBA9']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.analyzeButton}
        >
          {isAnalyzing ? (
            <>
              <ActivityIndicator color="#ffffff" size="small" style={{ marginRight: 12 }} />
              <Text style={styles.analyzeButtonText}>Analyzing...</Text>
            </>
          ) : (
            <>
              <Text style={styles.analyzeButtonText}>Get Free Diagnosis</Text>
              <Text style={styles.analyzeButtonSubtext}>Powered by AI • ~30 seconds</Text>
            </>
          )}
        </LinearGradient>
      </TouchableOpacity>
      </ScrollView>

      {/* Media Action Sheet */}
      <Modal
        visible={showMediaSheet}
        transparent
        animationType="none"
        onRequestClose={closeMediaSheet}
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity
            style={styles.sheetBackdrop}
            activeOpacity={1}
            onPress={closeMediaSheet}
          />
          <View style={styles.sheetContainer}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add Media</Text>

            <View style={styles.sheetOptions}>
              <TouchableOpacity
                style={styles.sheetOption}
                onPress={() => handleMediaOption(takePhoto)}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={['#1E90FF', '#00CBA9']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.sheetOptionIcon}
                >
                  <Ionicons name="camera" size={28} color="#ffffff" />
                </LinearGradient>
                <Text style={styles.sheetOptionText}>Camera</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetOption}
                onPress={() => handleMediaOption(pickImage)}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={['#00CBA9', '#1E90FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.sheetOptionIcon}
                >
                  <Ionicons name="images" size={28} color="#ffffff" />
                </LinearGradient>
                <Text style={styles.sheetOptionText}>Gallery</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetOption}
                onPress={() => handleMediaOption(recordVideo)}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={['#FF6B35', '#FFA500']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.sheetOptionIcon}
                >
                  <Ionicons name="videocam" size={28} color="#ffffff" />
                </LinearGradient>
                <Text style={styles.sheetOptionText}>Record</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetOption}
                onPress={() => handleMediaOption(pickVideo)}
                activeOpacity={0.7}
              >
                <LinearGradient
                  colors={['#FFA500', '#FF6B35']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.sheetOptionIcon}
                >
                  <Ionicons name="film" size={28} color="#ffffff" />
                </LinearGradient>
                <Text style={styles.sheetOptionText}>Videos</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.sheetCancelButton}
              onPress={closeMediaSheet}
              activeOpacity={0.7}
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardAvoid: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#F8FAFB',
  },
  contentContainer: {
    padding: 20,
    paddingTop: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  logo: {
    width: 180,
    height: 120,
    marginBottom: -35,
    marginTop: -30,
  },
  headerText: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emoji: {
    fontSize: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1E5AA8',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 8,
  },
  uploadSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E5AA8',
    marginBottom: 16,
  },
  addMediaButton: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#1E5AA8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  addMediaGradient: {
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(30, 90, 168, 0.3)',
    borderStyle: 'dashed',
  },
  addMediaIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1E5AA8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#1E5AA8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  addMediaIcon: {
    fontSize: 32,
    color: '#ffffff',
    fontWeight: '300',
    marginTop: -2,
  },
  addMediaTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E5AA8',
    marginBottom: 4,
  },
  addMediaSubtitle: {
    fontSize: 14,
    color: '#94a3b8',
  },
  previewContainer: {
    alignItems: 'center',
  },
  mediaPreview: {
    width: '100%',
    height: 240,
    borderRadius: 20,
    marginBottom: 12,
    backgroundColor: '#000',
  },
  previewActions: {
    flexDirection: 'row',
    gap: 12,
  },
  changeMediaButton: {
    backgroundColor: '#1E5AA8',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  changeMediaText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 15,
  },
  removeButton: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  removeButtonText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 15,
  },
  descriptionSection: {
    marginBottom: 24,
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: '#1e293b',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    minHeight: 120,
  },
  helperText: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 8,
    fontStyle: 'italic',
  },
  analyzeButtonWrapper: {
    marginBottom: 32,
    borderRadius: 16,
    shadowColor: '#1E90FF',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  analyzeButton: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
  },
  analyzeButtonText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  analyzeButtonSubtext: {
    color: '#ffffff',
    fontSize: 13,
    marginTop: 4,
    opacity: 0.9,
  },
  // Action Sheet Styles
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingBottom: 40,
    paddingHorizontal: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1E5AA8',
    textAlign: 'center',
    marginBottom: 24,
  },
  sheetOptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  sheetOption: {
    alignItems: 'center',
    flex: 1,
  },
  sheetOptionIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  sheetOptionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
  sheetCancelButton: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  sheetCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
});
