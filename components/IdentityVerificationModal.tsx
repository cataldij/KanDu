/**
 * Identity Verification Modal
 *
 * Shows when the AI detects an item and needs user confirmation.
 * This prevents the "keeps asking about the candle" bug because
 * once confirmed, the state machine transitions to IDENTITY_CONFIRMED
 * and will never show this modal again.
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface IdentityVerificationModalProps {
  visible: boolean;
  detectedItem: string;
  expectedItem: string;
  onConfirm: () => void;
  onCorrect: (correctItem: string) => void;
  onCancel: () => void;
}

export default function IdentityVerificationModal({
  visible,
  detectedItem,
  expectedItem,
  onConfirm,
  onCorrect,
  onCancel,
}: IdentityVerificationModalProps) {
  const [showCorrectionInput, setShowCorrectionInput] = useState(false);
  const [correctedItem, setCorrectedItem] = useState('');

  const handleConfirm = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onConfirm();
    setShowCorrectionInput(false);
    setCorrectedItem('');
  };

  const handleDeny = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setShowCorrectionInput(true);
  };

  const handleSubmitCorrection = () => {
    if (correctedItem.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCorrect(correctedItem.trim());
      setShowCorrectionInput(false);
      setCorrectedItem('');
    }
  };

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowCorrectionInput(false);
    setCorrectedItem('');
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modal}>
            {/* Icon */}
            <View style={styles.iconContainer}>
              <Ionicons name="help-circle" size={64} color="#2563eb" />
            </View>

            {/* Title */}
            <Text style={styles.title}>Verify Item</Text>

            {/* Message */}
            {!showCorrectionInput ? (
              <>
                <Text style={styles.message}>
                  I see: <Text style={styles.detectedText}>{detectedItem || 'unknown item'}</Text>
                </Text>
                <Text style={styles.subMessage}>
                  Is this correct?
                </Text>

                {/* Buttons */}
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.button, styles.denyButton]}
                    onPress={handleDeny}
                  >
                    <Text style={styles.buttonText}>No</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.confirmButton]}
                    onPress={handleConfirm}
                  >
                    <Text style={styles.buttonText}>Yes</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.message}>
                  What item are you working on?
                </Text>

                {/* Input */}
                <TextInput
                  style={styles.input}
                  value={correctedItem}
                  onChangeText={setCorrectedItem}
                  placeholder={expectedItem || 'Enter item name'}
                  placeholderTextColor="#9ca3af"
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmitCorrection}
                />

                {/* Buttons */}
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.button, styles.cancelButton]}
                    onPress={() => setShowCorrectionInput(false)}
                  >
                    <Text style={styles.buttonText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.button, styles.confirmButton]}
                    onPress={handleSubmitCorrection}
                    disabled={!correctedItem.trim()}
                  >
                    <Text style={styles.buttonText}>Continue</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Close button */}
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleCancel}
            >
              <Ionicons name="close" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 8,
  },
  detectedText: {
    fontWeight: 'bold',
    color: '#2563eb',
  },
  subMessage: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1f2937',
    marginBottom: 24,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButton: {
    backgroundColor: '#10b981',
  },
  denyButton: {
    backgroundColor: '#ef4444',
  },
  cancelButton: {
    backgroundColor: '#6b7280',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 4,
  },
});
