/**
 * PathwayCapture Component
 *
 * Guides users through capturing waypoint images along a route
 * from kitchen to a destination zone.
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
  TextInput,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { PathwayImage } from '../services/api';

export interface PathwayCaptureProps {
  zoneName: string;
  visible: boolean;
  onComplete: (images: PathwayImage[]) => void;
  onCancel: () => void;
  existingImages?: PathwayImage[];
}

// Suggested waypoint labels
const SUGGESTED_LABELS = [
  'Hallway',
  'Doorway',
  'Top of stairs',
  'Bottom of stairs',
  'Turn left',
  'Turn right',
  'End of hall',
  'Through door',
  'Past living room',
  'Near bathroom',
];

export default function PathwayCapture({
  zoneName,
  visible,
  onComplete,
  onCancel,
  existingImages = [],
}: PathwayCaptureProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [capturedImages, setCapturedImages] = useState<PathwayImage[]>(existingImages);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [currentLabel, setCurrentLabel] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setCapturedImages(existingImages);
      setShowPreview(existingImages.length > 0);
      setCurrentLabel('');
      setPendingImageUri(null);
    }
  }, [visible, existingImages]);

  const handleCapture = async () => {
    if (!cameraRef.current || isCapturing) return;

    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: false,
      });

      if (photo?.uri) {
        setPendingImageUri(photo.uri);
        setShowLabelModal(true);
      }
    } catch (error) {
      console.error('Failed to capture photo:', error);
      Alert.alert('Error', 'Failed to capture photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  };

  const handleAddLabel = () => {
    if (!pendingImageUri || !currentLabel.trim()) {
      Alert.alert('Label Required', 'Please add a label for this waypoint.');
      return;
    }

    const newImage: PathwayImage = {
      url: pendingImageUri,
      sequence: capturedImages.length + 1,
      label: currentLabel.trim(),
    };

    setCapturedImages([...capturedImages, newImage]);
    setPendingImageUri(null);
    setCurrentLabel('');
    setShowLabelModal(false);
  };

  const handleRemoveWaypoint = (index: number) => {
    const updated = capturedImages.filter((_, i) => i !== index);
    // Re-sequence
    const resequenced = updated.map((img, i) => ({ ...img, sequence: i + 1 }));
    setCapturedImages(resequenced);
  };

  const handleComplete = () => {
    if (capturedImages.length === 0) {
      Alert.alert(
        'No Waypoints',
        'Add at least one waypoint photo to help guests navigate.',
        [
          { text: 'Add Waypoints', style: 'cancel' },
          { text: 'Skip', onPress: () => onComplete([]) },
        ]
      );
      return;
    }
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
            To capture the pathway, we need access to your camera.
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

  return (
    <Modal visible={visible} animationType="slide">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel} style={styles.closeButton}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Path to {zoneName}</Text>
          <TouchableOpacity
            style={styles.previewToggle}
            onPress={() => setShowPreview(!showPreview)}
          >
            <Ionicons
              name={showPreview ? 'camera' : 'images'}
              size={24}
              color="#fff"
            />
          </TouchableOpacity>
        </View>

        {showPreview ? (
          // Preview/edit waypoints
          <ScrollView style={styles.previewContainer}>
            <View style={styles.instructionBanner}>
              <Ionicons name="walk" size={24} color="#2563eb" />
              <Text style={styles.instructionText}>
                Walk from kitchen to {zoneName}, taking photos at key turns and landmarks
              </Text>
            </View>

            {capturedImages.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="footsteps" size={48} color="#cbd5e1" />
                <Text style={styles.emptyText}>No waypoints yet</Text>
                <Text style={styles.emptySubtext}>
                  Tap the camera to start capturing the path
                </Text>
              </View>
            ) : (
              <View style={styles.waypointList}>
                {/* Start point */}
                <View style={styles.pathNode}>
                  <View style={styles.nodeIcon}>
                    <Ionicons name="home" size={20} color="#22c55e" />
                  </View>
                  <Text style={styles.nodeLabel}>Kitchen (Start)</Text>
                </View>
                <View style={styles.pathLine} />

                {/* Waypoints */}
                {capturedImages.map((img, index) => (
                  <View key={index}>
                    <View style={styles.waypointItem}>
                      <Image source={{ uri: img.url }} style={styles.waypointImage} />
                      <View style={styles.waypointInfo}>
                        <Text style={styles.waypointSequence}>Step {img.sequence}</Text>
                        <Text style={styles.waypointLabel}>{img.label}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.removeButton}
                        onPress={() => handleRemoveWaypoint(index)}
                      >
                        <Ionicons name="trash-outline" size={20} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.pathLine} />
                  </View>
                ))}

                {/* End point */}
                <View style={styles.pathNode}>
                  <View style={[styles.nodeIcon, styles.destinationIcon]}>
                    <Ionicons name="flag" size={20} color="#2563eb" />
                  </View>
                  <Text style={styles.nodeLabel}>{zoneName}</Text>
                </View>
              </View>
            )}

            <View style={styles.previewActions}>
              <TouchableOpacity
                style={styles.addMoreButton}
                onPress={() => setShowPreview(false)}
              >
                <Ionicons name="camera" size={20} color="#2563eb" />
                <Text style={styles.addMoreText}>Add Waypoint</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.doneButton}
                onPress={handleComplete}
              >
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.doneButtonText}>
                  {capturedImages.length === 0 ? 'Skip' : 'Done'}
                </Text>
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

                {/* Waypoint count badge */}
                {capturedImages.length > 0 && (
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>
                      {capturedImages.length} waypoint{capturedImages.length !== 1 ? 's' : ''}
                    </Text>
                  </View>
                )}
              </CameraView>
            </View>

            {/* Instructions */}
            <View style={styles.cameraInstructions}>
              <Text style={styles.cameraTitle}>
                Capture Waypoint #{capturedImages.length + 1}
              </Text>
              <Text style={styles.cameraSubtitle}>
                Point at a landmark along the path (doorway, turn, stairs)
              </Text>
            </View>

            {/* Capture button */}
            <View style={styles.captureContainer}>
              <TouchableOpacity
                style={styles.viewWaypointsButton}
                onPress={() => setShowPreview(true)}
              >
                <Ionicons name="images" size={24} color="#fff" />
                {capturedImages.length > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{capturedImages.length}</Text>
                  </View>
                )}
              </TouchableOpacity>

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

              <TouchableOpacity
                style={styles.doneSmallButton}
                onPress={handleComplete}
              >
                <Ionicons name="checkmark" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Label Modal */}
        <Modal visible={showLabelModal} transparent animationType="fade">
          <View style={styles.labelModalOverlay}>
            <View style={styles.labelModal}>
              <Text style={styles.labelTitle}>Label this waypoint</Text>

              {pendingImageUri && (
                <Image source={{ uri: pendingImageUri }} style={styles.labelPreview} />
              )}

              <TextInput
                style={styles.labelInput}
                placeholder="e.g., Turn left at hallway"
                value={currentLabel}
                onChangeText={setCurrentLabel}
                autoFocus
              />

              <Text style={styles.suggestionsLabel}>Quick picks:</Text>
              <View style={styles.suggestions}>
                {SUGGESTED_LABELS.map((label) => (
                  <TouchableOpacity
                    key={label}
                    style={[
                      styles.suggestionChip,
                      currentLabel === label && styles.suggestionChipActive,
                    ]}
                    onPress={() => setCurrentLabel(label)}
                  >
                    <Text
                      style={[
                        styles.suggestionText,
                        currentLabel === label && styles.suggestionTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.labelActions}>
                <TouchableOpacity
                  style={styles.labelCancelButton}
                  onPress={() => {
                    setShowLabelModal(false);
                    setPendingImageUri(null);
                    setCurrentLabel('');
                  }}
                >
                  <Text style={styles.labelCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.labelAddButton,
                    !currentLabel.trim() && styles.labelAddButtonDisabled,
                  ]}
                  onPress={handleAddLabel}
                  disabled={!currentLabel.trim()}
                >
                  <Text style={styles.labelAddText}>Add Waypoint</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  previewToggle: {
    padding: 8,
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
  countBadge: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  countText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cameraInstructions: {
    backgroundColor: '#fff',
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  cameraTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  cameraSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
  },
  captureContainer: {
    backgroundColor: '#000',
    paddingVertical: 24,
    paddingHorizontal: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewWaypointsButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
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
  doneSmallButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#22c55e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  instructionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#eff6ff',
    padding: 16,
    margin: 16,
    borderRadius: 12,
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: '#1e40af',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#94a3b8',
    marginTop: 4,
  },
  waypointList: {
    padding: 16,
  },
  pathNode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  nodeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#dcfce7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  destinationIcon: {
    backgroundColor: '#dbeafe',
  },
  nodeLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  pathLine: {
    width: 2,
    height: 20,
    backgroundColor: '#cbd5e1',
    marginLeft: 19,
  },
  waypointItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  waypointImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  waypointInfo: {
    flex: 1,
    marginLeft: 12,
  },
  waypointSequence: {
    fontSize: 12,
    color: '#64748b',
  },
  waypointLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  removeButton: {
    padding: 8,
  },
  previewActions: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingBottom: 40,
  },
  addMoreButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2563eb',
  },
  addMoreText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '600',
  },
  doneButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    backgroundColor: '#22c55e',
    borderRadius: 12,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  labelModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  labelModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  labelTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  labelPreview: {
    width: '100%',
    height: 150,
    borderRadius: 12,
    marginBottom: 16,
  },
  labelInput: {
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
  },
  suggestionsLabel: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 8,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  suggestionChip: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  suggestionChipActive: {
    backgroundColor: '#2563eb',
  },
  suggestionText: {
    fontSize: 14,
    color: '#64748b',
  },
  suggestionTextActive: {
    color: '#fff',
  },
  labelActions: {
    flexDirection: 'row',
    gap: 12,
  },
  labelCancelButton: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  labelCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  labelAddButton: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#2563eb',
  },
  labelAddButtonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  labelAddText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
