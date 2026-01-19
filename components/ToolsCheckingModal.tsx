/**
 * Tools Checking Modal
 *
 * Shows before each step that requires tools/materials.
 * User checks off items they DON'T have.
 * If missing items, triggers plan regeneration with substitutes.
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface ToolsCheckingModalProps {
  visible: boolean;
  stepNumber: number;
  toolsNeeded: string[];
  materialsNeeded: string[];
  onHaveAll: () => void;
  onMissing: (missingItems: string[]) => void;
  onCancel: () => void;
}

export default function ToolsCheckingModal({
  visible,
  stepNumber,
  toolsNeeded,
  materialsNeeded,
  onHaveAll,
  onMissing,
  onCancel,
}: ToolsCheckingModalProps) {
  const [missingItems, setMissingItems] = useState<Set<string>>(new Set());

  const allItems = [...toolsNeeded, ...materialsNeeded];

  const toggleItem = (item: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMissingItems((prev) => {
      const next = new Set(prev);
      if (next.has(item)) {
        next.delete(item);
      } else {
        next.add(item);
      }
      return next;
    });
  };

  const handleContinue = () => {
    if (missingItems.size > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      onMissing(Array.from(missingItems));
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onHaveAll();
    }
    setMissingItems(new Set());
  };

  const handleCancel = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMissingItems(new Set());
    onCancel();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Ionicons name="hammer" size={32} color="#2563eb" />
            </View>
            <Text style={styles.title}>Items Needed for Step {stepNumber}</Text>
            <Text style={styles.subtitle}>
              Check any items you DON'T have
            </Text>
          </View>

          {/* Items List */}
          <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
            {toolsNeeded.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>🔧 Tools</Text>
                {toolsNeeded.map((tool, index) => (
                  <TouchableOpacity
                    key={`tool-${index}`}
                    style={styles.itemRow}
                    onPress={() => toggleItem(tool)}
                  >
                    <View style={styles.checkbox}>
                      {missingItems.has(tool) && (
                        <Ionicons name="checkmark" size={18} color="#fff" />
                      )}
                    </View>
                    <Text style={[
                      styles.itemText,
                      missingItems.has(tool) && styles.itemTextChecked,
                    ]}>
                      {tool}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {materialsNeeded.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>📦 Materials</Text>
                {materialsNeeded.map((material, index) => (
                  <TouchableOpacity
                    key={`material-${index}`}
                    style={styles.itemRow}
                    onPress={() => toggleItem(material)}
                  >
                    <View style={styles.checkbox}>
                      {missingItems.has(material) && (
                        <Ionicons name="checkmark" size={18} color="#fff" />
                      )}
                    </View>
                    <Text style={[
                      styles.itemText,
                      missingItems.has(material) && styles.itemTextChecked,
                    ]}>
                      {material}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {missingItems.size > 0 && (
              <View style={styles.warningBox}>
                <Ionicons name="information-circle" size={20} color="#f59e0b" />
                <Text style={styles.warningText}>
                  We'll find alternative steps for the {missingItems.size} item(s) you don't have
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleCancel}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.continueButton]}
              onPress={handleContinue}
            >
              <Text style={styles.buttonText}>
                {missingItems.size > 0 ? 'Find Alternatives' : 'Continue'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    padding: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  listContainer: {
    padding: 20,
    maxHeight: 400,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d1d5db',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  itemText: {
    fontSize: 16,
    color: '#1f2937',
    flex: 1,
  },
  itemTextChecked: {
    color: '#9ca3af',
    textDecorationLine: 'line-through',
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#6b7280',
  },
  continueButton: {
    backgroundColor: '#2563eb',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
