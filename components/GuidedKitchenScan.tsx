/**
 * GuidedKitchenScan - Multi-angle capture for home base (kitchen)
 *
 * Walks user through capturing 5 images:
 * 1. Front - Main view (facing sink/counter)
 * 2. Right - 90° clockwise
 * 3. Back - 180° (opposite direction)
 * 4. Left - 270° clockwise
 * 5. Exit - Main doorway/exit from kitchen
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
  Animated,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Circle, G } from 'react-native-svg';
import { supabase } from '../services/supabase';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface KitchenImage {
  url: string;
  angle: 'front' | 'right' | 'back' | 'left' | 'exit';
  description?: string;
}

interface GuidedKitchenScanProps {
  visible: boolean;
  onComplete: (images: KitchenImage[]) => void;
  onCancel: () => void;
  existingImages?: KitchenImage[];
}

interface ScanStep {
  angle: KitchenImage['angle'];
  title: string;
  instruction: string;
  icon: string;
  rotation: number; // Degrees to show in compass
}

const SCAN_STEPS: ScanStep[] = [
  {
    angle: 'front',
    title: 'Front View',
    instruction: 'Stand in the center of your kitchen.\nFace your main counter or sink area.',
    icon: 'arrow-up',
    rotation: 0,
  },
  {
    angle: 'right',
    title: 'Right Side',
    instruction: 'Turn 90° to your RIGHT.\nKeep the same spot, just rotate.',
    icon: 'arrow-forward',
    rotation: 90,
  },
  {
    angle: 'back',
    title: 'Back View',
    instruction: 'Turn another 90° to your RIGHT.\nYou should face the opposite wall now.',
    icon: 'arrow-down',
    rotation: 180,
  },
  {
    angle: 'left',
    title: 'Left Side',
    instruction: 'Turn 90° RIGHT again.\nAlmost done with the 360°!',
    icon: 'arrow-back',
    rotation: 270,
  },
  {
    angle: 'exit',
    title: 'Main Exit',
    instruction: 'Now point at the main doorway\nwhere guests will enter/exit.',
    icon: 'exit-outline',
    rotation: -1, // Special case - no compass rotation
  },
];

export default function GuidedKitchenScan({
  visible,
  onComplete,
  onCancel,
  existingImages = [],
}: GuidedKitchenScanProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [currentStep, setCurrentStep] = useState(0);
  const [capturedImages, setCapturedImages] = useState<KitchenImage[]>(existingImages);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  // Upload image to Supabase storage
  const uploadImageToStorage = async (localUri: string, angle: string): Promise<string | null> => {
    try {
      console.log(`[KitchenScan] Uploading ${angle} image...`);

      // Fetch the local file
      const response = await fetch(localUri);
      const blob = await response.blob();

      // Convert blob to ArrayBuffer (React Native fix)
      const arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result instanceof ArrayBuffer) {
            resolve(reader.result);
          } else {
            reject(new Error('Failed to read blob as ArrayBuffer'));
          }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
      });

      const fileName = `kitchen-${angle}-${Date.now()}.jpg`;
      const filePath = `kitchen-scans/${fileName}`;

      console.log(`[KitchenScan] Uploading to ${filePath}, size: ${arrayBuffer.byteLength} bytes`);

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        console.error('[KitchenScan] Upload error:', uploadError);
        return null;
      }

      const { data: urlData } = supabase.storage
        .from('images')
        .getPublicUrl(filePath);

      console.log(`[KitchenScan] Upload success: ${urlData.publicUrl}`);
      return urlData.publicUrl;
    } catch (err) {
      console.error('[KitchenScan] Upload failed:', err);
      return null;
    }
  };

  // Pulse animation for capture button
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Compass rotation animation when step changes
  useEffect(() => {
    const step = SCAN_STEPS[currentStep];
    if (step.rotation >= 0) {
      Animated.spring(rotateAnim, {
        toValue: step.rotation,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();
    }
  }, [currentStep]);

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing || isUploading) return;

    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (photo?.uri) {
        const step = SCAN_STEPS[currentStep];

        // Upload to Supabase storage
        setIsUploading(true);
        const cloudUrl = await uploadImageToStorage(photo.uri, step.angle);
        setIsUploading(false);

        if (!cloudUrl) {
          console.error('[KitchenScan] Failed to upload, using local URI as fallback');
        }

        const newImage: KitchenImage = {
          url: cloudUrl || photo.uri, // Use cloud URL, fallback to local
          angle: step.angle,
          description: step.title,
        };

        const updated = [...capturedImages];
        // Replace if exists, otherwise add
        const existingIndex = updated.findIndex(img => img.angle === step.angle);
        if (existingIndex >= 0) {
          updated[existingIndex] = newImage;
        } else {
          updated.push(newImage);
        }
        setCapturedImages(updated);

        // Move to next step or show preview
        if (currentStep < SCAN_STEPS.length - 1) {
          setCurrentStep(currentStep + 1);
        } else {
          setShowPreview(true);
        }
      }
    } catch (err) {
      console.error('Failed to capture:', err);
    } finally {
      setIsCapturing(false);
      setIsUploading(false);
    }
  };

  const handleRetake = (angle: KitchenImage['angle']) => {
    const stepIndex = SCAN_STEPS.findIndex(s => s.angle === angle);
    if (stepIndex >= 0) {
      setCurrentStep(stepIndex);
      setShowPreview(false);
    }
  };

  const handleComplete = () => {
    onComplete(capturedImages);
  };

  const getCurrentImage = () => {
    const step = SCAN_STEPS[currentStep];
    return capturedImages.find(img => img.angle === step.angle);
  };

  if (!visible) return null;

  if (!permission?.granted) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={80} color="#1E5AA8" />
          <Text style={styles.permissionTitle}>Camera Access Needed</Text>
          <Text style={styles.permissionText}>
            We need camera access to capture your kitchen from multiple angles.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Grant Access</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  // Preview mode - show all captured images
  if (showPreview) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={styles.previewContainer}>
          <LinearGradient
            colors={['#0f172a', '#1e3a5f']}
            style={styles.previewHeader}
          >
            <Text style={styles.previewTitle}>Review Your Kitchen Scan</Text>
            <Text style={styles.previewSubtitle}>
              Tap any image to retake it
            </Text>
          </LinearGradient>

          <View style={styles.previewGrid}>
            {SCAN_STEPS.map((step) => {
              const image = capturedImages.find(img => img.angle === step.angle);
              return (
                <TouchableOpacity
                  key={step.angle}
                  style={styles.previewItem}
                  onPress={() => handleRetake(step.angle)}
                >
                  {image ? (
                    <Image source={{ uri: image.url }} style={styles.previewImage} />
                  ) : (
                    <View style={styles.previewMissing}>
                      <Ionicons name="camera-outline" size={32} color="#94a3b8" />
                    </View>
                  )}
                  <View style={styles.previewLabel}>
                    <Ionicons name={step.icon as any} size={16} color="#fff" />
                    <Text style={styles.previewLabelText}>{step.title}</Text>
                  </View>
                  {image && (
                    <View style={styles.retakeIcon}>
                      <Ionicons name="refresh" size={16} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.previewActions}>
            <TouchableOpacity
              style={styles.previewCancelButton}
              onPress={onCancel}
            >
              <Text style={styles.previewCancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.previewCompleteButton,
                capturedImages.length < 4 && styles.previewCompleteDisabled,
              ]}
              onPress={handleComplete}
              disabled={capturedImages.length < 4}
            >
              <LinearGradient
                colors={capturedImages.length >= 4 ? ['#10b981', '#059669'] : ['#94a3b8', '#64748b']}
                style={styles.previewCompleteGradient}
              >
                <Ionicons name="checkmark" size={24} color="#fff" />
                <Text style={styles.previewCompleteText}>
                  {capturedImages.length >= 4 ? 'Complete Scan' : `Need ${4 - capturedImages.length} more`}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // Camera capture mode
  const step = SCAN_STEPS[currentStep];
  const existingCapture = getCurrentImage();

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
        >
          {/* Top overlay with instructions */}
          <LinearGradient
            colors={['rgba(0,0,0,0.8)', 'transparent']}
            style={styles.topOverlay}
          >
            <TouchableOpacity style={styles.closeButton} onPress={onCancel}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>

            <View style={styles.stepIndicator}>
              {SCAN_STEPS.map((_, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.stepDot,
                    idx === currentStep && styles.stepDotActive,
                    idx < currentStep && styles.stepDotComplete,
                  ]}
                />
              ))}
            </View>

            <Text style={styles.stepTitle}>{step.title}</Text>
            <Text style={styles.stepInstruction}>{step.instruction}</Text>
          </LinearGradient>

          {/* Compass indicator (for 360° steps) */}
          {step.rotation >= 0 && (
            <View style={styles.compassContainer}>
              <Svg width={100} height={100} viewBox="0 0 100 100">
                {/* Compass circle */}
                <Circle
                  cx="50"
                  cy="50"
                  r="45"
                  fill="rgba(0,0,0,0.5)"
                  stroke="rgba(255,255,255,0.3)"
                  strokeWidth="2"
                />
                {/* Direction markers */}
                <G rotation={0} origin="50, 50">
                  <Path d="M50 10 L50 20" stroke="#fff" strokeWidth="2" />
                  <Path d="M90 50 L80 50" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
                  <Path d="M50 90 L50 80" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
                  <Path d="M10 50 L20 50" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
                </G>
                {/* Arrow pointing current direction */}
                <Animated.View
                  style={{
                    transform: [{
                      rotate: rotateAnim.interpolate({
                        inputRange: [0, 360],
                        outputRange: ['0deg', '360deg'],
                      }),
                    }],
                  }}
                >
                  <G>
                    <Path
                      d="M50 15 L45 35 L50 30 L55 35 Z"
                      fill="#10b981"
                    />
                  </G>
                </Animated.View>
              </Svg>
              <Text style={styles.compassLabel}>
                {step.rotation === 0 ? 'START' : `${step.rotation}°`}
              </Text>
            </View>
          )}

          {/* Center frame guide */}
          <View style={styles.frameGuide}>
            <View style={[styles.frameCorner, styles.frameTopLeft]} />
            <View style={[styles.frameCorner, styles.frameTopRight]} />
            <View style={[styles.frameCorner, styles.frameBottomLeft]} />
            <View style={[styles.frameCorner, styles.frameBottomRight]} />
          </View>

          {/* Bottom controls */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.bottomOverlay}
          >
            {/* Skip button */}
            {currentStep > 0 && (
              <TouchableOpacity
                style={styles.skipButton}
                onPress={() => setShowPreview(true)}
              >
                <Text style={styles.skipText}>Review All</Text>
              </TouchableOpacity>
            )}

            {/* Capture button */}
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                style={[
                  styles.captureButton,
                  (isCapturing || isUploading) && styles.captureButtonDisabled,
                ]}
                onPress={handleCapture}
                disabled={isCapturing || isUploading}
              >
                <View style={styles.captureButtonInner}>
                  {isUploading ? (
                    <ActivityIndicator size="large" color="#1E5AA8" />
                  ) : existingCapture ? (
                    <Ionicons name="refresh" size={32} color="#1E5AA8" />
                  ) : (
                    <Ionicons name="camera" size={32} color="#1E5AA8" />
                  )}
                </View>
              </TouchableOpacity>
            </Animated.View>

            {/* Progress text */}
            <Text style={styles.progressText}>
              {isUploading ? 'Uploading...' : `${currentStep + 1} of ${SCAN_STEPS.length}`}
            </Text>
          </LinearGradient>
        </CameraView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  topOverlay: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  stepDotActive: {
    backgroundColor: '#10b981',
    width: 24,
  },
  stepDotComplete: {
    backgroundColor: '#10b981',
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  stepInstruction: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 24,
  },
  compassContainer: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.35,
    right: 20,
    alignItems: 'center',
  },
  compassLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  frameGuide: {
    position: 'absolute',
    top: '30%',
    left: '10%',
    right: '10%',
    bottom: '30%',
  },
  frameCorner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  frameTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
  },
  frameTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
  },
  frameBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
  },
  frameBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
  },
  bottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 40,
    paddingBottom: 50,
    alignItems: 'center',
  },
  skipButton: {
    position: 'absolute',
    left: 30,
    bottom: 70,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
  },
  skipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressText: {
    position: 'absolute',
    right: 30,
    bottom: 70,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
  },
  // Permission screen
  permissionContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 24,
    marginBottom: 12,
  },
  permissionText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  permissionButton: {
    backgroundColor: '#1E5AA8',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: '#64748b',
    fontSize: 16,
  },
  // Preview screen
  previewContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  previewHeader: {
    paddingTop: 60,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  previewTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  previewSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
  },
  previewGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 12,
  },
  previewItem: {
    width: (SCREEN_WIDTH - 48) / 2,
    height: (SCREEN_WIDTH - 48) / 2,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
  },
  previewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  previewMissing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  previewLabelText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  retakeIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewActions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  previewCancelButton: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
  },
  previewCancelText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  previewCompleteButton: {
    flex: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewCompleteDisabled: {
    opacity: 0.6,
  },
  previewCompleteGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  previewCompleteText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
