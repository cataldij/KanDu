/**
 * Escalation Modal
 *
 * Shows when AI has low confidence for 4+ consecutive frames.
 * Offers helpful actions to improve detection or escalate to expert.
 *
 * This prevents the "stuck in low confidence loop" frustration.
 */

import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

type EscalationAction = 'flashlight' | 'camera_switch' | 'photo_mode' | 'expert' | 'dismiss';

interface EscalationModalProps {
  visible: boolean;
  issue: 'low_confidence' | 'repeated_instruction' | 'user_request';
  lowConfidenceCount?: number;
  onAction: (action: EscalationAction) => void;
}

export default function EscalationModal({
  visible,
  issue,
  lowConfidenceCount,
  onAction,
}: EscalationModalProps) {

  const handleAction = (action: EscalationAction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAction(action);
  };

  const getMessage = () => {
    switch (issue) {
      case 'low_confidence':
        return `I'm having trouble seeing clearly (${lowConfidenceCount || 0} frames). Try one of these:`;
      case 'repeated_instruction':
        return "I keep giving the same instruction. Let's try a different approach:";
      case 'user_request':
        return 'How would you like to proceed?';
      default:
        return 'Having trouble? Try one of these options:';
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => handleAction('dismiss')}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <Ionicons name="help-circle-outline" size={64} color="#f59e0b" />
          </View>

          {/* Title */}
          <Text style={styles.title}>Need Help?</Text>

          {/* Message */}
          <Text style={styles.message}>{getMessage()}</Text>

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleAction('flashlight')}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="flashlight" size={28} color="#2563eb" />
              </View>
              <Text style={styles.actionLabel}>Turn on Flashlight</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleAction('camera_switch')}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="camera-reverse" size={28} color="#2563eb" />
              </View>
              <Text style={styles.actionLabel}>Switch Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleAction('photo_mode')}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="image" size={28} color="#2563eb" />
              </View>
              <Text style={styles.actionLabel}>Take Still Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleAction('expert')}
            >
              <View style={styles.actionIcon}>
                <Ionicons name="people" size={28} color="#10b981" />
              </View>
              <Text style={styles.actionLabel}>Ask an Expert</Text>
            </TouchableOpacity>
          </View>

          {/* Dismiss Button */}
          <TouchableOpacity
            style={styles.dismissButton}
            onPress={() => handleAction('dismiss')}
          >
            <Text style={styles.dismissButtonText}>Keep Trying</Text>
          </TouchableOpacity>
        </View>
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
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  actionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    width: '48%',
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  actionIcon: {
    marginBottom: 8,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'center',
  },
  dismissButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  dismissButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
});
