/**
 * ItemQuantityStepper - Quick +/- buttons for adjusting item quantities
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface ItemQuantityStepperProps {
  quantity: string | null | undefined;
  onQuantityChange: (newQuantity: string) => void;
  disabled?: boolean;
}

// Parse quantity string to extract number
function parseQuantity(qty: string | null | undefined): number {
  if (!qty) return 1;
  const match = qty.match(/^(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 1;
}

// Get unit from quantity string
function getUnit(qty: string | null | undefined): string {
  if (!qty) return '';
  const unit = qty.replace(/^\d+(?:\.\d+)?\s*/, '');
  return unit;
}

export default function ItemQuantityStepper({
  quantity,
  onQuantityChange,
  disabled = false,
}: ItemQuantityStepperProps) {
  const currentValue = parseQuantity(quantity);
  const unit = getUnit(quantity);

  const handleIncrement = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newValue = currentValue + 1;
    const newQuantity = unit ? `${newValue} ${unit}` : `${newValue}`;
    onQuantityChange(newQuantity);
  };

  const handleDecrement = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newValue = Math.max(0, currentValue - 1);
    const newQuantity = unit ? `${newValue} ${unit}` : `${newValue}`;
    onQuantityChange(newQuantity);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={handleDecrement}
        disabled={disabled}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="remove-circle" size={24} color={disabled ? '#64748b' : '#EF4444'} />
      </TouchableOpacity>

      <Text style={styles.value}>
        {currentValue}{unit && <Text style={styles.unit}> {unit}</Text>}
      </Text>

      <TouchableOpacity
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={handleIncrement}
        disabled={disabled}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="add-circle" size={24} color={disabled ? '#64748b' : '#10B981'} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  button: {
    padding: 4,
  },
  buttonDisabled: {
    opacity: 0.3,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    minWidth: 60,
    textAlign: 'center',
  },
  unit: {
    fontSize: 14,
    fontWeight: '400',
    color: '#94a3b8',
  },
});
