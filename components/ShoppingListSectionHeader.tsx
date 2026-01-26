/**
 * ShoppingListSectionHeader - Collapsible section header for smart-sorted lists
 * Shows store sections (Produce, Dairy, Frozen, etc.) with item counts
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface ShoppingListSectionHeaderProps {
  title: string;
  itemCount: number;
  isExpanded: boolean;
  onToggle: () => void;
}

// Section emoji mapping
const SECTION_EMOJIS: Record<string, string> = {
  'Produce': '🥬',
  'Floral': '💐',
  'Bakery': '🥖',
  'Deli': '🥩',
  'Meat & Seafood': '🍖',
  'Dairy': '🥛',
  'Pantry': '🥫',
  'Dry Goods': '📦',
  'Beverages': '🥤',
  'Household': '🧹',
  'Health & Beauty': '💊',
  'Frozen Foods': '❄️',
  'Frozen': '❄️',
};

export default function ShoppingListSectionHeader({
  title,
  itemCount,
  isExpanded,
  onToggle,
}: ShoppingListSectionHeaderProps) {
  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onToggle();
  };

  const emoji = SECTION_EMOJIS[title] || '📍';

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handleToggle}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <View style={styles.leftSection}>
          <Text style={styles.emoji}>{emoji}</Text>
          <View style={styles.textContainer}>
            <Text style={styles.title}>{title.toUpperCase()}</Text>
            <Text style={styles.itemCount}>
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </Text>
          </View>
        </View>
        <Ionicons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={24}
          color="#94a3b8"
        />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  emoji: {
    fontSize: 28,
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  itemCount: {
    fontSize: 12,
    color: '#94a3b8',
  },
});
