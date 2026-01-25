/**
 * GuidedZoneScan Component
 *
 * Guides users through capturing 4 angles of a zone (basement, garage, etc.)
 * Similar to GuidedKitchenScan but without the exit step.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { ZoneImage, ZoneType, ZONE_TYPES } from '../services/api';

export interface GuidedZoneScanProps {
  zoneName: string;
  zoneType: ZoneType;
  visible: boolean;
  onComplete: (images: ZoneImage[]) => void;
  onCancel: () => void;
}

interface ScanStep {
  angle: ZoneImage['angle'];
  title: string;
  instruction: string;
  icon: string;
  rotation: number;
}

const SCAN_STEPS: ScanStep[] = [
  {
    angle: 'front',
    title: 'Front View',
    instruction: 'Stand at the entrance and face into the zone',
    icon: 'arrow-up',
    rotation: 0,
  },
  {
    angle: 'right',
    title: 'Right Side',
    instruction: 'Turn 90° to your right',
    icon: 'arrow-forward',
    rotation: 90,
  },
  {
    angle: 'back',
    title: 'Back View',
    instruction: 'Turn another 90° (now facing opposite the entrance)',
    icon: 'arrow-down',
    rotation: 180,
  },
  {
    angle: 'left',
    title: 'Left Side',
    instruction: 'Turn 90° more to complete the circle',
    icon: 'arrow-back',
    rotation: 270,
  },
];

export default function GuidedZoneScan({
  zoneName,
  zoneType,
  visible,
  onComplete,
  onCancel,
}: GuidedZoneScanProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [currentStep, setCurrentStep] = useState(0);
  const [capturedImages, setCapturedImages] = useState<ZoneImage[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setCurrentStep(0);
      setCapturedImages([]);
      setShowPreview(false);
    }
  }, [visible]);

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;

    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
      });

      if (photo?.uri) {
        const step = SCAN_STEPS[currentStep];
        const newImage: ZoneImage = {
          url: photo.uri,
          angle: step.angle,
          description: step.title,
        };

        const newImages = [...capturedImages, newImage];
        setCapturedImages(newImages);

        if (currentStep < SCAN_STEPS.length - 1) {
          setCurrentStep(currentStep + 1);
        } else {
          setShowPreview(true);
        }
      }
    } catch (error) {
      console.error('Failed to capture photo:', error);
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRetake = (index: number) => {
    // Go back to that step
    setCurrentStep(index);
    setCapturedImages(capturedImages.slice(0, index));
    setShowPreview(false);
  };

  const handleComplete = () => {
    onComplete(capturedImages);
  };

  if (!permission) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} animationType="slide">
        <View style={styles.permissionContainer}>
          <Ionicons name="camera-outline" size={64} color="#64748b" />
          <Text style={styles.permissionTitle}>Camera Access Needed</Text>
          <Text style={styles.permissionText}>
            To scan your {zoneName.toLowerCase()}, we need access to your camera.
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

  const step = SCAN_STEPS[currentStep];
  const zoneInfo = ZONE_TYPES[zoneType];

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Ionicons name={zoneInfo?.icon as any || 'location'} size={20} color="#fff" />
            <Text style={styles.headerTitle}>Scan {zoneName}</Text>
          </View>
          <View style={styles.stepIndicator}>
            <Text style={styles.stepText}>{currentStep + 1}/{SCAN_STEPS.length}</Text>
          </View>
        </View>

        {showPreview ? (
          // Preview all captured images
          <ScrollView style={styles.previewContainer}>
            <Text style={styles.previewTitle}>Review Your Scan</Text>
            <Text style={styles.previewSubtitle}>
              Tap any image to retake it
            </Text>

            <View style={styles.previewGrid}>
              {capturedImages.map((img, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.previewItem}
                  onPress={() => handleRetake(index)}
                >
                  <Image source={{ uri: img.url }} style={styles.previewImage} />
                  <View style={styles.previewLabel}>
                    <Ionicons
                      name={SCAN_STEPS[index].icon as any}
                      size={16}
                      color="#fff"
                    />
                    <Text style={styles.previewLabelText}>
                      {SCAN_STEPS[index].title}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.previewActions}>
              <TouchableOpacity
                style={styles.retakeAllButton}
                onPress={() => {
                  setCurrentStep(0);
                  setCapturedImages([]);
                  setShowPreview(false);
                }}
              >
                <Ionicons name="refresh" size={20} color="#64748b" />
                <Text style={styles.retakeAllText}>Start Over</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.completeButton}
                onPress={handleComplete}
              >
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.completeButtonText}>Looks Good!</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          // Camera view
          <>
            <View style={styles.cameraContainer}>
              <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
              >
                {/* Frame guide */}
                <View style={styles.frameGuide}>
                  <View style={[styles.corner, styles.topLeft]} />
                  <View style={[styles.corner, styles.topRight]} />
                  <View style={[styles.corner, styles.bottomLeft]} />
                  <View style={[styles.corner, styles.bottomRight]} />
                </View>
              </CameraView>
            </View>

            {/* Instructions */}
            <View style={styles.instructionContainer}>
              {/* Compass showing rotation */}
              <View style={styles.compass}>
                {SCAN_STEPS.map((s, i) => (
                  <View
                    key={i}
                    style={[
                      styles.compassDot,
                      {
                        transform: [
                          { rotate: `${s.rotation}deg` },
                          { translateY: -30 },
                        ],
                      },
                      i === currentStep && styles.compassDotActive,
                      i < currentStep && styles.compassDotDone,
                    ]}
                  />
                ))}
                <View style={styles.compassCenter}>
                  <Ionicons
                    name={step.icon as any}
                    size={24}
                    color="#2563eb"
                    style={{ transform: [{ rotate: `${step.rotation}deg` }] }}
                  />
                </View>
              </View>

              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepInstruction}>{step.instruction}</Text>

              {/* Progress dots */}
              <View style={styles.progressDots}>
                {SCAN_STEPS.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      i === currentStep && styles.dotActive,
                      i < currentStep && styles.dotComplete,
                    ]}
                  />
                ))}
              </View>
            </View>

            {/* Capture button */}
            <View style={styles.captureContainer}>
              <TouchableOpacity
                style={styles.captureButton}
                onPress={handleCapture}
                disabled={isCapturing}
              >
                {isCapturing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <View style={styles.captureInner} />
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 24,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 16,
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  cancelButtonText: {
    color: '#64748b',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  closeButton: {
    padding: 8,
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  stepIndicator: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  stepText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  frameGuide: {
    flex: 1,
    margin: 40,
  },
  corner: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#fff',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 12,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 12,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 12,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 12,
  },
  instructionContainer: {
    backgroundColor: '#fff',
    paddingVertical: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  compass: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  compassDot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#e2e8f0',
  },
  compassDotActive: {
    backgroundColor: '#2563eb',
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  compassDotDone: {
    backgroundColor: '#22c55e',
  },
  compassCenter: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  stepInstruction: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 16,
  },
  progressDots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
  },
  dotActive: {
    backgroundColor: '#2563eb',
    width: 24,
  },
  dotComplete: {
    backgroundColor: '#22c55e',
  },
  captureContainer: {
    backgroundColor: '#000',
    paddingVertical: 24,
    alignItems: 'center',
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: '#000',
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 24,
  },
  previewTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
    marginTop: 24,
  },
  previewSubtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  previewItem: {
    width: '47%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  previewLabelText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  previewActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    paddingBottom: 40,
  },
  retakeAllButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  retakeAllText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  completeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    backgroundColor: '#22c55e',
    borderRadius: 12,
  },
  completeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
