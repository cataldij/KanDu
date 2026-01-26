/**
 * QuickAddBar - Horizontal bar with frequently bought items for quick adding
 */

import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface QuickAddBarProps {
  frequentItems: Array<{ item_name: string; count: number }>;
  onAddItem: (itemName: string) => void;
  loading?: boolean;
}

export default function QuickAddBar({
  frequentItems,
  onAddItem,
  loading = false,
}: QuickAddBarProps) {
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Ionicons name="flash" size={16} color="#F59E0B" />
          <Text style={styles.title}>Quick Add</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#94a3b8" />
        </View>
      </View>
    );
  }

  if (frequentItems.length === 0) {
    return null;
  }

  const handleAddItem = (itemName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAddItem(itemName);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="flash" size={16} color="#F59E0B" />
        <Text style={styles.title}>Quick Add</Text>
        <Text style={styles.subtitle}>Tap to add frequently bought items</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {frequentItems.map((item, index) => (
          <TouchableOpacity
            key={index}
            style={styles.chip}
            onPress={() => handleAddItem(item.item_name)}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle" size={16} color="#10B981" />
            <Text style={styles.chipText} numberOfLines={1}>
              {item.item_name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F59E0B',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 11,
    color: '#64748b',
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10B981',
    maxWidth: 120,
  },
  loadingContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
});
