/**
 * GuestLinkViewScreen - The guest experience when opening a shared link
 *
 * This is what babysitters, guests, and Airbnb visitors see.
 * Includes scan-based navigation with AI assistance.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
  TextInput,
  Linking,
  Dimensions,
  Modal,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Gyroscope } from 'expo-sensors';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Polygon, Circle as SvgCircle } from 'react-native-svg';

// Create animated Path component for countdown ring
const AnimatedPath = Animated.createAnimatedComponent(Path);

import {
  getGuestKitBySlug,
  logGuestItemView,
  scanNavigate,
  warmupGuestFunction,
  prepareGuestCache,
  GuestKit,
  GuestKitItem,
  NavigationResponse,
} from '../services/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Priority colors
const PRIORITY_COLORS = {
  critical: '#ef4444',
  important: '#f59e0b',
  helpful: '#10b981',
};

interface ScanResult {
  navigation: NavigationResponse;
  item: {
    name: string;
    instructions?: string;
    warning?: string;
    destination_image_url?: string;
    control_image_url?: string;
  };
}

export default function GuestLinkViewScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const cameraRef = useRef<CameraView>(null);

  const { slug } = route.params || {};

  const [kit, setKit] = useState<GuestKit | null>(null);
  const [items, setItems] = useState<GuestKitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // PIN state
  const [requiresPin, setRequiresPin] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  // Navigation state
  const [selectedItem, setSelectedItem] = useState<GuestKitItem | null>(null);
  const [showNavigation, setShowNavigation] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [currentStep, setCurrentStep] = useState(1);

  // Gemini context cache for fast navigation (3-5x speedup)
  const [cacheId, setCacheId] = useState<string | null>(null);
  const [cacheReady, setCacheReady] = useState(false);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // AR overlay state for camera view
  const [cameraHighlight, setCameraHighlight] = useState<{
    region: { x: number; y: number; width: number; height: number };
    description: string;
    arrived: boolean;
    instruction: string;
  } | null>(null);
  const highlightPulse = useRef(new Animated.Value(1)).current;

  // Floor arrow direction state
  const [moveDirection, setMoveDirection] = useState<
    'forward' | 'left' | 'right' | 'slight_left' | 'slight_right' | 'back' | 'arrived' | null
  >(null);
  const arrowBounce = useRef(new Animated.Value(0)).current;
  const arrowOpacity = useRef(new Animated.Value(0)).current;

  // Auto-scan state for continuous navigation
  const [autoScanEnabled, setAutoScanEnabled] = useState(true);
  const [frozenFrame, setFrozenFrame] = useState<string | null>(null); // Base64 image for freeze frame
  const scanProgress = useRef(new Animated.Value(0)).current;
  const autoScanTimer = useRef<NodeJS.Timeout | null>(null);
  const scanAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  // Gyroscope-based stabilization state
  const [isStabilized, setIsStabilized] = useState(false);
  const [gyroEnabled, setGyroEnabled] = useState(true);
  const gyroSubscription = useRef<any>(null);
  const stabilizeTimeout = useRef<NodeJS.Timeout | null>(null);
  const lastMovementTime = useRef<number>(Date.now());
  const stabilizeProgress = useRef(new Animated.Value(0)).current;

  // Spring animation for arrow rotation
  const arrowRotation = useRef(new Animated.Value(0)).current;
  const previousDirection = useRef<string | null>(null);

  // Constants for stabilization detection
  const GYRO_THRESHOLD = 0.15; // rad/s - below this is considered "still"
  const STABILIZE_DURATION = 500; // ms - how long to hold still before scanning

  // Pulsing animation for highlight overlay
  useEffect(() => {
    if (cameraHighlight) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(highlightPulse, {
            toValue: 1.1,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(highlightPulse, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [cameraHighlight]);

  // Floor arrow animation - gentle bouncing motion + spring rotation
  useEffect(() => {
    if (moveDirection && moveDirection !== 'arrived') {
      // Fade in
      Animated.timing(arrowOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Calculate target rotation
      const targetRotation = getArrowRotationDegrees(moveDirection);

      // Spring animation for smooth rotation when direction changes
      if (previousDirection.current !== moveDirection) {
        // Haptic feedback when direction changes
        if (previousDirection.current !== null) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        previousDirection.current = moveDirection;

        Animated.spring(arrowRotation, {
          toValue: targetRotation,
          tension: 40,
          friction: 7,
          useNativeDriver: true,
        }).start();
      }

      // Bouncing animation to suggest movement
      const bounce = Animated.loop(
        Animated.sequence([
          Animated.timing(arrowBounce, {
            toValue: -15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(arrowBounce, {
            toValue: 0,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      bounce.start();
      return () => bounce.stop();
    } else {
      // Fade out
      Animated.timing(arrowOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [moveDirection]);

  // Gyroscope-based stabilization detection
  // When user holds phone still for STABILIZE_DURATION, trigger scan
  useEffect(() => {
    if (showCamera && autoScanEnabled && !frozenFrame && !scanning && gyroEnabled) {
      // Set up gyroscope
      Gyroscope.setUpdateInterval(100); // 10 Hz updates

      gyroSubscription.current = Gyroscope.addListener((data) => {
        // Calculate total rotation rate
        const rotationRate = Math.sqrt(
          data.x * data.x + data.y * data.y + data.z * data.z
        );

        if (rotationRate > GYRO_THRESHOLD) {
          // User is moving - reset stabilization
          lastMovementTime.current = Date.now();
          if (isStabilized) {
            setIsStabilized(false);
          }
          // Reset progress animation
          stabilizeProgress.setValue(0);
          // Clear any pending scan
          if (stabilizeTimeout.current) {
            clearTimeout(stabilizeTimeout.current);
            stabilizeTimeout.current = null;
          }
        } else {
          // User is holding still - check how long
          const stillDuration = Date.now() - lastMovementTime.current;

          // Animate progress toward 100%
          const progress = Math.min(stillDuration / STABILIZE_DURATION, 1);
          stabilizeProgress.setValue(progress);

          if (stillDuration >= STABILIZE_DURATION && !isStabilized && !scanning) {
            // User has been still long enough - trigger scan!
            setIsStabilized(true);
            // Haptic feedback to indicate scan is triggering
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            handleAutoScan();
          }
        }
      });

      return () => {
        if (gyroSubscription.current) {
          gyroSubscription.current.remove();
          gyroSubscription.current = null;
        }
        if (stabilizeTimeout.current) {
          clearTimeout(stabilizeTimeout.current);
        }
      };
    } else {
      // Clean up when camera is closed
      if (gyroSubscription.current) {
        gyroSubscription.current.remove();
        gyroSubscription.current = null;
      }
    }
  }, [showCamera, autoScanEnabled, frozenFrame, scanning, gyroEnabled, isStabilized]);

  // Cleanup on camera close
  useEffect(() => {
    if (!showCamera) {
      setFrozenFrame(null);
      setAutoScanEnabled(true);
      scanProgress.setValue(0);
      stabilizeProgress.setValue(0);
      setIsStabilized(false);
      previousDirection.current = null;
      arrowRotation.setValue(0);
      if (scanAnimationRef.current) {
        scanAnimationRef.current.stop();
      }
      if (gyroSubscription.current) {
        gyroSubscription.current.remove();
        gyroSubscription.current = null;
      }
    }
  }, [showCamera]);

  useEffect(() => {
    if (slug) {
      loadKit();
    }
  }, [slug]);

  const loadKit = async (pin?: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await getGuestKitBySlug(slug, pin);
      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        if (result.data.requiresPin && !result.data.kit) {
          setRequiresPin(true);
        } else if (result.data.kit) {
          setKit(result.data.kit);
          setItems(result.data.items || []);
          setRequiresPin(false);

          // Pre-cache reference images for fast navigation (fire-and-forget)
          // This runs in background while user browses the kit
          const kitId = result.data.kit.id;
          console.log('[GuestLinkView] Starting cache preparation for kit:', kitId);
          prepareGuestCache(kitId).then((cacheResult) => {
            if (cacheResult.data?.cacheId) {
              console.log('[GuestLinkView] Cache ready:', cacheResult.data.cacheId);
              setCacheId(cacheResult.data.cacheId);
              setCacheReady(true);
            } else {
              console.log('[GuestLinkView] Cache not created:', cacheResult.data?.message);
            }
          }).catch((err) => {
            console.log('[GuestLinkView] Cache preparation failed:', err);
          });
        }
      }
    } catch (err) {
      setError('Failed to load guide');
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = () => {
    if (pinInput.length !== 4) {
      setPinError(true);
      return;
    }
    setPinError(false);
    loadKit(pinInput);
  };

  const handleSelectItem = async (item: GuestKitItem) => {
    setSelectedItem(item);
    setShowNavigation(true);
    setCurrentStep(1);
    setScanResult(null);

    // Log view for analytics
    if (kit) {
      logGuestItemView(kit.id, item.id);
    }
  };

  const handleStartScan = async () => {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        Alert.alert(
          'Camera Required',
          'Camera access is needed to help you navigate.',
          [{ text: 'OK' }]
        );
        return;
      }
    }
    // Warmup the Edge Function to eliminate cold start delay
    // Fire-and-forget - don't await, let it run in background
    warmupGuestFunction();

    // Reset state for fresh navigation
    setFrozenFrame(null);
    setAutoScanEnabled(true);
    setCameraHighlight(null);
    setMoveDirection(null);
    setShowCamera(true);
  };

  // Core scan function - used by both auto and manual scan
  const performScan = async (isAutoScan = false): Promise<boolean> => {
    if (!cameraRef.current || !kit || !selectedItem) return false;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.5,
      });

      if (!photo?.base64) return false;

      const result = await scanNavigate(
        kit.id,
        selectedItem.id,
        photo.base64,
        currentStep,
        cacheId // Pass cached context for 3-5x faster scans
      );

      if (result.error) {
        if (!isAutoScan) {
          Alert.alert('Scan Failed', result.error);
        }
        return false;
      }

      if (result.data) {
        setScanResult(result.data);

        // Set the floor arrow direction
        if (result.data.navigation.arrived) {
          setMoveDirection('arrived');
          // Strong haptic feedback for arrival!
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          // FREEZE FRAME: Stop auto-scan and show captured image
          setAutoScanEnabled(false);
          setFrozenFrame(`data:image/jpeg;base64,${photo.base64}`);
        } else if (result.data.navigation.move_direction) {
          setMoveDirection(result.data.navigation.move_direction);
          // Reset stabilization for next scan cycle
          setIsStabilized(false);
          stabilizeProgress.setValue(0);
          lastMovementTime.current = Date.now();
        } else {
          setMoveDirection('forward');
          // Reset stabilization for next scan cycle
          setIsStabilized(false);
          stabilizeProgress.setValue(0);
          lastMovementTime.current = Date.now();
        }

        // Update instruction overlay
        const highlightData = {
          region: result.data.navigation.highlight?.region || { x: 0.5, y: 0.5, width: 0, height: 0 },
          description: result.data.navigation.highlight?.description || '',
          arrived: result.data.navigation.arrived,
          instruction: result.data.navigation.next_instruction,
        };
        setCameraHighlight(highlightData);

        if (!result.data.navigation.arrived) {
          setCurrentStep(result.data.navigation.step_number + 1);
        }

        return result.data.navigation.arrived;
      }

      return false;
    } catch (err) {
      if (!isAutoScan) {
        Alert.alert('Scan Error', 'Please try again');
      }
      return false;
    }
  };

  // Auto-scan triggered by timer
  const handleAutoScan = async () => {
    if (scanning || frozenFrame) return;
    setScanning(true);
    await performScan(true);
    setScanning(false);
  };

  // Manual scan (user taps button) - also resets the auto-scan timer
  const handleCaptureScan = async () => {
    if (scanning) return;

    // Stop current auto-scan animation
    if (scanAnimationRef.current) {
      scanAnimationRef.current.stop();
    }
    scanProgress.setValue(0);

    setScanning(true);
    await performScan(false);
    setScanning(false);
  };

  const handleCloseCamera = () => {
    setShowCamera(false);
    setCameraHighlight(null);
    setMoveDirection(null);
    setFrozenFrame(null);
    setAutoScanEnabled(true);
    setIsStabilized(false);
    stabilizeProgress.setValue(0);
  };

  const handleContinueToResults = () => {
    setShowCamera(false);
    setCameraHighlight(null);
    setMoveDirection(null);
    setFrozenFrame(null);
    setAutoScanEnabled(true);
    setIsStabilized(false);
    stabilizeProgress.setValue(0);
  };

  // Get rotation angle for floor arrow based on direction
  const getArrowRotationDegrees = (direction: string | null): number => {
    switch (direction) {
      case 'forward': return 0;
      case 'slight_right': return 45;
      case 'right': return 90;
      case 'back': return 180;
      case 'slight_left': return -45;
      case 'left': return -90;
      default: return 0;
    }
  };

  const handleCallHomeowner = () => {
    if (kit?.homeowner_phone) {
      Linking.openURL(`tel:${kit.homeowner_phone}`);
    }
  };

  const handleCopyWifi = async () => {
    if (kit?.wifi_password) {
      await Clipboard.setStringAsync(kit.wifi_password);
      Alert.alert('Copied!', 'WiFi password copied to clipboard');
    }
  };

  const getItemIcon = (item: GuestKitItem) => {
    return item.icon_name || 'location';
  };

  const getItemName = (item: GuestKitItem) => {
    const names: Record<string, string> = {
      water_shutoff: 'Water Shutoff',
      gas_shutoff: 'Gas Shutoff',
      electrical_panel: 'Electrical Panel',
      fire_extinguisher: 'Fire Extinguisher',
      first_aid: 'First Aid Kit',
      emergency_exits: 'Emergency Exits',
      thermostat: 'Thermostat',
      water_heater: 'Water Heater',
      furnace: 'Furnace',
    };
    return item.custom_name || names[item.item_type] || item.item_type;
  };

  const groupItemsByPriority = () => {
    const groups = {
      critical: items.filter((i) => i.priority === 'critical'),
      important: items.filter((i) => i.priority === 'important'),
      helpful: items.filter((i) => i.priority === 'helpful'),
    };
    return groups;
  };

  // ============================================
  // RENDER: Loading / Error / PIN states
  // ============================================

  if (loading) {
    return (
      <View style={[styles.container, styles.centerContainer]}>
        <ActivityIndicator size="large" color="#1E90FF" />
        <Text style={styles.loadingText}>Loading guide...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.centerContainer]}>
        <Ionicons name="alert-circle-outline" size={64} color="#ef4444" />
        <Text style={styles.errorTitle}>Oops!</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (requiresPin) {
    return (
      <View style={[styles.container, styles.centerContainer]}>
        <LinearGradient
          colors={['#4FA3FF', '#3AD7C3']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.pinIconContainer}
        >
          <Ionicons name="lock-closed" size={40} color="#fff" />
        </LinearGradient>
        <Text style={styles.pinTitle}>Enter PIN</Text>
        <Text style={styles.pinSubtitle}>
          This guide is protected. Enter the PIN to continue.
        </Text>
        <TextInput
          style={[styles.pinInput, pinError && styles.pinInputError]}
          value={pinInput}
          onChangeText={(text) => {
            setPinInput(text.replace(/\D/g, '').slice(0, 4));
            setPinError(false);
          }}
          placeholder="• • • •"
          placeholderTextColor="#94a3b8"
          keyboardType="number-pad"
          maxLength={4}
          textAlign="center"
        />
        <TouchableOpacity style={styles.pinButton} onPress={handlePinSubmit}>
          <LinearGradient
            colors={['#1E90FF', '#00CBA9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.pinButtonGradient}
          >
            <Text style={styles.pinButtonText}>Continue</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  if (!kit) {
    return (
      <View style={[styles.container, styles.centerContainer]}>
        <Ionicons name="home-outline" size={64} color="#94a3b8" />
        <Text style={styles.errorTitle}>Guide Not Found</Text>
        <Text style={styles.errorText}>This link may be invalid or expired.</Text>
      </View>
    );
  }

  // ============================================
  // RENDER: Camera scan modal with AR overlay
  // ============================================

  if (showCamera) {
    // Calculate AR highlight box position based on normalized coordinates (0-1)
    const getHighlightStyle = () => {
      if (!cameraHighlight?.region || cameraHighlight.region.width === 0) {
        return null;
      }
      const { x, y, width, height } = cameraHighlight.region;
      // Coordinates are normalized 0-1, scale to screen
      const boxWidth = Math.max(width * SCREEN_WIDTH, 80);
      const boxHeight = Math.max(height * SCREEN_HEIGHT, 80);
      const boxLeft = x * SCREEN_WIDTH - boxWidth / 2;
      const boxTop = y * SCREEN_HEIGHT - boxHeight / 2;

      return {
        position: 'absolute' as const,
        left: Math.max(10, Math.min(boxLeft, SCREEN_WIDTH - boxWidth - 10)),
        top: Math.max(insets.top + 80, Math.min(boxTop, SCREEN_HEIGHT - boxHeight - 200)),
        width: boxWidth,
        height: boxHeight,
      };
    };

    const highlightStyle = getHighlightStyle();

    // Countdown ring dimensions
    const ringSize = 50;
    const ringStrokeWidth = 4;
    const ringRadius = (ringSize - ringStrokeWidth) / 2;
    const ringCircumference = 2 * Math.PI * ringRadius;

    return (
      <View style={styles.cameraContainer}>
        {/* Frozen frame overlay when arrived */}
        {frozenFrame && (
          <Image
            source={{ uri: frozenFrame }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        )}

        {/* Live camera (hidden when frozen) */}
        {!frozenFrame && (
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
          />
        )}

        {/* Overlay content (works on both frozen and live) */}
        <View style={[styles.cameraOverlay, StyleSheet.absoluteFill]}>
          {/* Header with countdown ring */}
          <View style={[styles.cameraHeader, { paddingTop: insets.top + 16 }]}>
            <TouchableOpacity
              style={styles.cameraCloseButton}
              onPress={handleCloseCamera}
            >
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>

            {/* Center: Title or Stabilization Indicator */}
            <View style={styles.cameraHeaderCenter}>
              {!frozenFrame && autoScanEnabled && !scanning ? (
                <View style={styles.stabilizeContainer}>
                  <Svg width={ringSize} height={ringSize} style={styles.countdownRing}>
                    {/* Background circle */}
                    <Path
                      d={`M ${ringSize/2} ${ringStrokeWidth/2} A ${ringRadius} ${ringRadius} 0 1 1 ${ringSize/2 - 0.01} ${ringStrokeWidth/2}`}
                      fill="none"
                      stroke="rgba(255,255,255,0.2)"
                      strokeWidth={ringStrokeWidth}
                    />
                    {/* Progress circle - fills as user holds still */}
                    <AnimatedPath
                      d={`M ${ringSize/2} ${ringStrokeWidth/2} A ${ringRadius} ${ringRadius} 0 1 1 ${ringSize/2 - 0.01} ${ringStrokeWidth/2}`}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth={ringStrokeWidth}
                      strokeLinecap="round"
                      strokeDasharray={`${ringCircumference}`}
                      strokeDashoffset={stabilizeProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [ringCircumference, 0],
                      })}
                    />
                  </Svg>
                  <View style={styles.countdownInner}>
                    <Ionicons name="hand-left-outline" size={16} color="#fff" />
                  </View>
                  <Text style={styles.holdSteadyText}>Hold steady</Text>
                </View>
              ) : scanning ? (
                <View style={styles.scanningIndicator}>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.scanningText}>Scanning...</Text>
                </View>
              ) : (
                <Text style={styles.cameraTitle}>
                  {cameraHighlight?.arrived ? 'Found it!' : 'Navigating...'}
                </Text>
              )}
            </View>

            <View style={{ width: 44 }} />
          </View>

            {/* AR Highlight Overlay */}
            {highlightStyle && cameraHighlight && (
              <Animated.View
                style={[
                  styles.arHighlightBox,
                  highlightStyle,
                  {
                    transform: [{ scale: highlightPulse }],
                    borderColor: cameraHighlight.arrived ? '#10b981' : '#1E90FF',
                    backgroundColor: cameraHighlight.arrived
                      ? 'rgba(16, 185, 129, 0.2)'
                      : 'rgba(30, 144, 255, 0.15)',
                  },
                ]}
              >
                {/* Corner accents */}
                <View style={[styles.arCorner, styles.arCornerTL,
                  { borderColor: cameraHighlight.arrived ? '#10b981' : '#1E90FF' }]} />
                <View style={[styles.arCorner, styles.arCornerTR,
                  { borderColor: cameraHighlight.arrived ? '#10b981' : '#1E90FF' }]} />
                <View style={[styles.arCorner, styles.arCornerBL,
                  { borderColor: cameraHighlight.arrived ? '#10b981' : '#1E90FF' }]} />
                <View style={[styles.arCorner, styles.arCornerBR,
                  { borderColor: cameraHighlight.arrived ? '#10b981' : '#1E90FF' }]} />

                {/* Icon in center */}
                <View style={[
                  styles.arIconContainer,
                  { backgroundColor: cameraHighlight.arrived ? '#10b981' : '#1E90FF' }
                ]}>
                  <Ionicons
                    name={cameraHighlight.arrived ? 'checkmark' : 'location'}
                    size={24}
                    color="#fff"
                  />
                </View>
              </Animated.View>
            )}

            {/* Scan frame (shown when no highlight) */}
            {!cameraHighlight && (
              <View style={styles.scanFrame}>
                <View style={styles.scanCorner} />
                <View style={[styles.scanCorner, styles.scanCornerTR]} />
                <View style={[styles.scanCorner, styles.scanCornerBL]} />
                <View style={[styles.scanCorner, styles.scanCornerBR]} />
              </View>
            )}

            {/* Floor Arrow - AR direction indicator */}
            {moveDirection && moveDirection !== 'arrived' && (
              <Animated.View
                style={[
                  styles.floorArrowContainer,
                  {
                    opacity: arrowOpacity,
                    transform: [
                      { translateY: arrowBounce },
                      { rotate: arrowRotation.interpolate({
                          inputRange: [-180, 180],
                          outputRange: ['-180deg', '180deg'],
                        })
                      },
                    ],
                  },
                ]}
              >
                <Svg width={120} height={160} viewBox="0 0 120 160">
                  <Defs>
                    <SvgLinearGradient id="arrowGradient" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor="#1E90FF" stopOpacity="0.9" />
                      <Stop offset="0.5" stopColor="#00CBA9" stopOpacity="0.7" />
                      <Stop offset="1" stopColor="#00CBA9" stopOpacity="0.3" />
                    </SvgLinearGradient>
                    <SvgLinearGradient id="arrowGlow" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0" stopColor="#fff" stopOpacity="0.4" />
                      <Stop offset="1" stopColor="#fff" stopOpacity="0" />
                    </SvgLinearGradient>
                  </Defs>
                  {/* Arrow shadow for depth */}
                  <Polygon
                    points="60,10 20,70 45,70 45,150 75,150 75,70 100,70"
                    fill="rgba(0,0,0,0.3)"
                    transform="translate(2, 4)"
                  />
                  {/* Main arrow body */}
                  <Polygon
                    points="60,10 20,70 45,70 45,150 75,150 75,70 100,70"
                    fill="url(#arrowGradient)"
                  />
                  {/* Highlight/glow on left edge */}
                  <Path
                    d="M60 10 L20 70 L45 70 L45 150"
                    stroke="url(#arrowGlow)"
                    strokeWidth="3"
                    fill="none"
                  />
                  {/* Inner chevron for extra emphasis */}
                  <Polygon
                    points="60,30 40,60 50,60 50,100 70,100 70,60 80,60"
                    fill="rgba(255,255,255,0.25)"
                  />
                </Svg>
              </Animated.View>
            )}

            {/* Instruction overlay when highlight is shown */}
            {cameraHighlight && (
              <View style={styles.arInstructionOverlay}>
                <View style={[
                  styles.arInstructionCard,
                  cameraHighlight.arrived && styles.arInstructionCardSuccess
                ]}>
                  {cameraHighlight.arrived ? (
                    <>
                      <Ionicons name="checkmark-circle" size={28} color="#10b981" />
                      <Text style={styles.arInstructionTitle}>
                        {getItemName(selectedItem!)} Found!
                      </Text>
                      {cameraHighlight.description && (
                        <Text style={styles.arInstructionText}>
                          {cameraHighlight.description}
                        </Text>
                      )}
                    </>
                  ) : (
                    <>
                      <Ionicons name="navigate" size={24} color="#1E90FF" />
                      <Text style={styles.arInstructionText}>
                        {cameraHighlight.instruction}
                      </Text>
                      {cameraHighlight.description && (
                        <View style={styles.arLookForBox}>
                          <Ionicons name="eye" size={16} color="#64748b" />
                          <Text style={styles.arLookForText}>
                            Look for: {cameraHighlight.description}
                          </Text>
                        </View>
                      )}
                    </>
                  )}
                </View>
              </View>
            )}

            {/* Bottom controls */}
            <View style={[styles.cameraBottom, { paddingBottom: insets.bottom + 20 }]}>
              {!cameraHighlight ? (
                <>
                  <Text style={styles.cameraHint}>
                    Looking for: {getItemName(selectedItem!)}
                  </Text>
                  <TouchableOpacity
                    style={styles.scanButton}
                    onPress={handleCaptureScan}
                    disabled={scanning}
                  >
                    <LinearGradient
                      colors={['#1E90FF', '#00CBA9']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.scanButtonGradient}
                    >
                      {scanning ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="scan" size={24} color="#fff" />
                          <Text style={styles.scanButtonText}>Scan Location</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              ) : cameraHighlight.arrived ? (
                <TouchableOpacity
                  style={styles.scanButton}
                  onPress={handleContinueToResults}
                >
                  <LinearGradient
                    colors={['#10b981', '#059669']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.scanButtonGradient}
                  >
                    <Ionicons name="checkmark-circle" size={24} color="#fff" />
                    <Text style={styles.scanButtonText}>View Details</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <View style={styles.arButtonRow}>
                  <TouchableOpacity
                    style={[styles.scanButton, { flex: 1, marginRight: 8 }]}
                    onPress={handleCaptureScan}
                    disabled={scanning}
                  >
                    <LinearGradient
                      colors={['#1E90FF', '#00CBA9']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.scanButtonGradient}
                    >
                      {scanning ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="refresh" size={24} color="#fff" />
                          <Text style={styles.scanButtonText}>Scan Again</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.arSecondaryButton}
                    onPress={handleContinueToResults}
                  >
                    <Ionicons name="document-text" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        </View>
      );
    }

  // ============================================
  // RENDER: Navigation modal
  // ============================================

  if (showNavigation && selectedItem) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Navigation header */}
        <LinearGradient
          colors={['#0f172a', '#1e3a5f']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.navHeader}
        >
          <TouchableOpacity
            style={styles.navBackButton}
            onPress={() => {
              setShowNavigation(false);
              setSelectedItem(null);
              setScanResult(null);
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.navHeaderTitle}>Finding: {getItemName(selectedItem)}</Text>
        </LinearGradient>

        <ScrollView
          style={styles.navContent}
          contentContainerStyle={styles.navContentContainer}
        >
          {/* Scan result */}
          {scanResult ? (
            <View style={styles.resultCard}>
              {scanResult.navigation.arrived ? (
                <>
                  {/* Arrived! */}
                  <View style={styles.arrivedHeader}>
                    <LinearGradient
                      colors={['#10b981', '#059669']}
                      style={styles.arrivedIcon}
                    >
                      <Ionicons name="checkmark" size={32} color="#fff" />
                    </LinearGradient>
                    <Text style={styles.arrivedTitle}>Found It!</Text>
                  </View>

                  {selectedItem.destination_image_url && (
                    <Image
                      source={{ uri: selectedItem.destination_image_url }}
                      style={styles.resultImage}
                      resizeMode="cover"
                    />
                  )}

                  {selectedItem.instructions && (
                    <View style={styles.instructionsBox}>
                      <Text style={styles.instructionsLabel}>Instructions:</Text>
                      <Text style={styles.instructionsText}>
                        {selectedItem.instructions}
                      </Text>
                    </View>
                  )}

                  {selectedItem.warning_text && (
                    <View style={styles.warningBox}>
                      <Ionicons name="warning" size={20} color="#f59e0b" />
                      <Text style={styles.warningText}>{selectedItem.warning_text}</Text>
                    </View>
                  )}

                  {selectedItem.control_image_url && (
                    <View style={styles.controlImageSection}>
                      <Text style={styles.controlImageLabel}>Close-up:</Text>
                      <Image
                        source={{ uri: selectedItem.control_image_url }}
                        style={styles.controlImage}
                        resizeMode="cover"
                      />
                    </View>
                  )}
                </>
              ) : (
                <>
                  {/* Navigation instruction */}
                  <View style={styles.stepHeader}>
                    <Text style={styles.stepNumber}>
                      Step {scanResult.navigation.step_number}
                    </Text>
                    <View style={styles.confidenceBadge}>
                      <Text style={styles.confidenceText}>
                        {Math.round(scanResult.navigation.confidence * 100)}% confident
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.instructionText}>
                    {scanResult.navigation.next_instruction}
                  </Text>

                  {scanResult.navigation.highlight && (
                    <View style={styles.highlightBox}>
                      <Ionicons name="eye" size={20} color="#1E90FF" />
                      <Text style={styles.highlightText}>
                        Look for: {scanResult.navigation.highlight.description}
                      </Text>
                    </View>
                  )}

                  {scanResult.navigation.warning && (
                    <View style={styles.warningBox}>
                      <Ionicons name="warning" size={20} color="#f59e0b" />
                      <Text style={styles.warningText}>
                        {scanResult.navigation.warning}
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
          ) : (
            <>
              {/* Initial state - show item info */}
              <View style={styles.itemInfoCard}>
                {selectedItem.destination_image_url && (
                  <Image
                    source={{ uri: selectedItem.destination_image_url }}
                    style={styles.itemImage}
                    resizeMode="cover"
                  />
                )}

                <View style={styles.itemInfoContent}>
                  <Text style={styles.itemInfoTitle}>{getItemName(selectedItem)}</Text>

                  {selectedItem.hint && (
                    <View style={styles.hintBox}>
                      <Ionicons name="location" size={18} color="#64748b" />
                      <Text style={styles.hintText}>{selectedItem.hint}</Text>
                    </View>
                  )}

                  {selectedItem.route_description && (
                    <View style={styles.routeBox}>
                      <Text style={styles.routeLabel}>How to get there:</Text>
                      <Text style={styles.routeText}>{selectedItem.route_description}</Text>
                    </View>
                  )}
                </View>
              </View>
            </>
          )}

          {/* Scan button */}
          {!scanResult?.navigation.arrived && (
            <TouchableOpacity
              style={styles.bigScanButton}
              onPress={handleStartScan}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#1E90FF', '#00CBA9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.bigScanButtonGradient}
              >
                <Ionicons name="scan" size={24} color="#fff" />
                <Text style={styles.bigScanButtonText}>
                  {scanResult ? 'Scan Again' : 'Scan to Navigate'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {/* Help button */}
          {kit.homeowner_phone && (
            <TouchableOpacity
              style={styles.callButton}
              onPress={handleCallHomeowner}
            >
              <Ionicons name="call" size={20} color="#1E90FF" />
              <Text style={styles.callButtonText}>Call {kit.homeowner_name || 'Owner'}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    );
  }

  // ============================================
  // RENDER: Main guide view
  // ============================================

  const groupedItems = groupItemsByPriority();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <LinearGradient
        colors={
          kit.kit_type === 'rental'
            ? ['#FF8B5E', '#FFB84D', '#FFE5B4']
            : ['#0f172a', '#6A9BD6', '#D4E8ED']
        }
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.header}
      >
        {/* Glass sheen */}
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

        {/* Checkmark watermark */}
        <View style={styles.headerCheckmark} pointerEvents="none">
          <Svg width={600} height={300} viewBox="25 30 50 30">
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

        {/* Back button */}
        <TouchableOpacity
          style={styles.headerBackButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <Text style={styles.welcomeText}>Welcome to</Text>
          <Text style={styles.homeName}>{kit.display_name}</Text>

          {/* Quick actions */}
          <View style={styles.quickActions}>
            {kit.wifi_network && (
              <TouchableOpacity style={styles.quickAction} onPress={handleCopyWifi}>
                <Ionicons name="wifi" size={20} color="#fff" />
                <Text style={styles.quickActionText}>WiFi</Text>
              </TouchableOpacity>
            )}

            {kit.homeowner_phone && (
              <TouchableOpacity style={styles.quickAction} onPress={handleCallHomeowner}>
                <Ionicons name="call" size={20} color="#fff" />
                <Text style={styles.quickActionText}>Call</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </LinearGradient>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Emergency button */}
        {groupedItems.critical.length > 0 && (
          <View style={styles.emergencySection}>
            <Text style={styles.emergencyTitle}>🚨 Emergency Items</Text>
            <Text style={styles.emergencySubtitle}>
              Tap to find critical safety items
            </Text>
            {groupedItems.critical.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.emergencyCard}
                onPress={() => handleSelectItem(item)}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={['#ef4444', '#dc2626']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.emergencyCardGradient}
                >
                  <Ionicons name={getItemIcon(item) as any} size={28} color="#fff" />
                  <View style={styles.emergencyCardContent}>
                    <Text style={styles.emergencyCardTitle}>{getItemName(item)}</Text>
                    {item.hint && (
                      <Text style={styles.emergencyCardHint} numberOfLines={1}>
                        {item.hint}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.7)" />
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Other items */}
        {(groupedItems.important.length > 0 || groupedItems.helpful.length > 0) && (
          <View style={styles.itemsSection}>
            <Text style={styles.sectionTitle}>Find in Home</Text>
            {[...groupedItems.important, ...groupedItems.helpful].map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.itemCard}
                onPress={() => handleSelectItem(item)}
                activeOpacity={0.9}
              >
                <View
                  style={[
                    styles.itemIconContainer,
                    { backgroundColor: PRIORITY_COLORS[item.priority] + '20' },
                  ]}
                >
                  <Ionicons
                    name={getItemIcon(item) as any}
                    size={24}
                    color={PRIORITY_COLORS[item.priority]}
                  />
                </View>
                <View style={styles.itemCardContent}>
                  <Text style={styles.itemCardTitle}>{getItemName(item)}</Text>
                  {item.hint && (
                    <Text style={styles.itemCardHint} numberOfLines={1}>
                      {item.hint}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Rental-specific info */}
        {kit.kit_type === 'rental' && (
          <>
            {(kit.checkin_instructions || kit.checkout_instructions) && (
              <View style={styles.rentalInfoSection}>
                {kit.checkin_instructions && (
                  <View style={styles.infoCard}>
                    <Text style={styles.infoCardTitle}>📥 Check-in</Text>
                    <Text style={styles.infoCardText}>{kit.checkin_instructions}</Text>
                  </View>
                )}
                {kit.checkout_instructions && (
                  <View style={styles.infoCard}>
                    <Text style={styles.infoCardTitle}>📤 Check-out</Text>
                    <Text style={styles.infoCardText}>{kit.checkout_instructions}</Text>
                  </View>
                )}
                {kit.house_rules && (
                  <View style={styles.infoCard}>
                    <Text style={styles.infoCardTitle}>📋 House Rules</Text>
                    <Text style={styles.infoCardText}>{kit.house_rules}</Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}

        {/* Powered by */}
        <View style={styles.poweredBy}>
          <Text style={styles.poweredByText}>Powered by</Text>
          <Text style={styles.poweredByBrand}>KanDu</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#D4E8ED',
  },
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 16,
  },
  errorText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
  },

  // PIN screen
  pinIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  pinTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  pinSubtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
  },
  pinInput: {
    width: 200,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 16,
    padding: 16,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 16,
    marginBottom: 24,
  },
  pinInputError: {
    borderColor: '#ef4444',
  },
  pinButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  pinButtonGradient: {
    paddingVertical: 16,
    paddingHorizontal: 48,
  },
  pinButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    position: 'relative',
    overflow: 'hidden',
  },
  headerBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  headerCheckmark: {
    position: 'absolute',
    top: -50,
    right: -150,
  },
  headerContent: {
    zIndex: 1,
  },
  welcomeText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
  },
  homeName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 16,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
  },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 8,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },

  // Emergency section
  emergencySection: {
    marginBottom: 24,
  },
  emergencyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  emergencySubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 12,
  },
  emergencyCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
  },
  emergencyCardGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 16,
  },
  emergencyCardContent: {
    flex: 1,
  },
  emergencyCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  emergencyCardHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },

  // Items section
  itemsSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    gap: 14,
  },
  itemIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemCardContent: {
    flex: 1,
  },
  itemCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  itemCardHint: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },

  // Rental info
  rentalInfoSection: {
    gap: 12,
    marginBottom: 24,
  },
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  infoCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  infoCardText: {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 20,
  },

  // Powered by
  poweredBy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 20,
  },
  poweredByText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  poweredByBrand: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E90FF',
  },

  // Camera
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'space-between',
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  cameraCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  cameraHeaderCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownContainer: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stabilizeContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownRing: {
    position: 'absolute',
    transform: [{ rotate: '-90deg' }],
  },
  countdownInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  holdSteadyText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
    opacity: 0.9,
  },
  scanningIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  scanningText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  scanFrame: {
    width: SCREEN_WIDTH * 0.8,
    height: SCREEN_WIDTH * 0.8,
    alignSelf: 'center',
    position: 'relative',
  },
  scanCorner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#1E90FF',
    borderTopWidth: 4,
    borderLeftWidth: 4,
    top: 0,
    left: 0,
  },
  scanCornerTR: {
    top: 0,
    left: undefined,
    right: 0,
    borderLeftWidth: 0,
    borderRightWidth: 4,
  },
  scanCornerBL: {
    top: undefined,
    bottom: 0,
    borderTopWidth: 0,
    borderBottomWidth: 4,
  },
  scanCornerBR: {
    top: undefined,
    left: undefined,
    bottom: 0,
    right: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },

  // Floor Arrow styles
  floorArrowContainer: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT * 0.28, // Position in lower third of screen
    alignSelf: 'center',
    // Add perspective effect
    shadowColor: '#1E90FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },

  cameraBottom: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  cameraHint: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 16,
  },
  scanButton: {
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
  },
  scanButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  scanButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },

  // AR Overlay styles
  arHighlightBox: {
    borderWidth: 3,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  arCorner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderWidth: 4,
  },
  arCornerTL: {
    top: -2,
    left: -2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 12,
  },
  arCornerTR: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 12,
  },
  arCornerBL: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 12,
  },
  arCornerBR: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 12,
  },
  arIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  arInstructionOverlay: {
    position: 'absolute',
    top: 100, // Moved to top, below header
    left: 20,
    right: 20,
  },
  arInstructionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.6)', // 60% transparent
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  arInstructionCardSuccess: {
    backgroundColor: 'rgba(240, 253, 244, 0.7)', // 70% transparent green tint
    borderWidth: 2,
    borderColor: '#10b981',
  },
  arInstructionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#10b981',
    marginTop: 8,
    textAlign: 'center',
  },
  arInstructionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 22,
  },
  arLookForBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(241, 245, 249, 0.7)', // Slightly transparent
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 12,
    gap: 8,
  },
  arLookForText: {
    fontSize: 14,
    color: '#64748b',
    flex: 1,
  },
  arButtonRow: {
    flexDirection: 'row',
    width: '100%',
    alignItems: 'center',
  },
  arSecondaryButton: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Navigation view
  navHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 16,
  },
  navBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  navContent: {
    flex: 1,
  },
  navContentContainer: {
    padding: 20,
  },
  resultCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
  },
  arrivedHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  arrivedIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  arrivedTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10b981',
  },
  resultImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
  },
  instructionsBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  instructionsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 8,
  },
  instructionsText: {
    fontSize: 16,
    color: '#15803d',
    lineHeight: 24,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
  },
  controlImageSection: {
    marginTop: 8,
  },
  controlImageLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 8,
  },
  controlImage: {
    width: '100%',
    height: 150,
    borderRadius: 12,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E90FF',
  },
  confidenceBadge: {
    backgroundColor: '#f0f9ff',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  confidenceText: {
    fontSize: 12,
    color: '#1E90FF',
  },
  instructionText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    lineHeight: 26,
    marginBottom: 16,
  },
  highlightBox: {
    flexDirection: 'row',
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  highlightText: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
  },
  itemInfoCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
  },
  itemImage: {
    width: '100%',
    height: 180,
  },
  itemInfoContent: {
    padding: 20,
  },
  itemInfoTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  hintText: {
    fontSize: 14,
    color: '#64748b',
  },
  routeBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 14,
  },
  routeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 6,
  },
  routeText: {
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 20,
  },
  bigScanButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  bigScanButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 10,
  },
  bigScanButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 14,
    gap: 8,
  },
  callButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E90FF',
  },
});
