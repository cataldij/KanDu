/**
 * ShoppingListBudgetCard - Compact budget tracker bar
 * Redesigned for minimal vertical space
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ShoppingListBudgetCardProps {
  estimatedTotal: number;
  budget: number | null;
  currency: string;
  onSetBudget: () => void;
}

export default function ShoppingListBudgetCard({
  estimatedTotal,
  budget,
  currency = 'USD',
  onSetBudget,
}: ShoppingListBudgetCardProps) {
  const [expanded, setExpanded] = useState(false);
  const budgetProgress = budget ? Math.min((estimatedTotal / budget) * 100, 100) : 0;
  const isOverBudget = budget ? estimatedTotal > budget : false;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const handleSetBudget = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSetBudget();
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  // Compact single-line view
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.compactBar}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        {/* Left: Estimated Total */}
        <View style={styles.totalSection}>
          <Ionicons name="wallet" size={16} color={isOverBudget ? '#EF4444' : '#10B981'} />
          <Text style={[styles.totalLabel, isOverBudget && styles.overBudgetText]}>
            Est: {formatCurrency(estimatedTotal)}
          </Text>
        </View>

        {/* Middle: Progress bar (if budget set) */}
        {budget && (
          <View style={styles.progressSection}>
            <View style={styles.progressBarContainer}>
              <View
                style={[
                  styles.progressBar,
                  isOverBudget && styles.progressBarOver,
                  { width: `${budgetProgress}%` },
                ]}
              />
            </View>
          </View>
        )}

        {/* Right: Budget or Set Budget */}
        <View style={styles.budgetSection}>
          {budget ? (
            <Text style={[styles.budgetLabel, isOverBudget && styles.overBudgetText]}>
              / {formatCurrency(budget)}
            </Text>
          ) : (
            <TouchableOpacity
              style={styles.setBudgetChip}
              onPress={handleSetBudget}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="add" size={14} color="#3B82F6" />
              <Text style={styles.setBudgetChipText}>Budget</Text>
            </TouchableOpacity>
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color="#64748b"
          />
        </View>
      </TouchableOpacity>

      {/* Expanded details */}
      {expanded && (
        <View style={styles.expandedContent}>
          <View style={styles.expandedRow}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>Estimated Total</Text>
              <Text style={[styles.statValue, isOverBudget && styles.overBudgetText]}>
                {formatCurrency(estimatedTotal)}
              </Text>
            </View>

            {budget && (
              <>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Budget</Text>
                  <Text style={styles.statValue}>{formatCurrency(budget)}</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Remaining</Text>
                  <Text style={[styles.statValue, isOverBudget && styles.overBudgetText]}>
                    {isOverBudget ? '-' : ''}{formatCurrency(Math.abs(budget - estimatedTotal))}
                  </Text>
                </View>
              </>
            )}
          </View>

          <TouchableOpacity
            style={styles.editBudgetButton}
            onPress={handleSetBudget}
          >
            <Ionicons name="create-outline" size={14} color="#3B82F6" />
            <Text style={styles.editBudgetText}>
              {budget ? 'Edit Budget' : 'Set Budget'}
            </Text>
          </TouchableOpacity>

          {isOverBudget && (
            <View style={styles.warningBanner}>
              <Ionicons name="warning" size={14} color="#EF4444" />
              <Text style={styles.warningText}>
                Over budget by {formatCurrency(estimatedTotal - (budget || 0))}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    overflow: 'hidden',
  },
  compactBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  totalSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  overBudgetText: {
    color: '#EF4444',
  },
  progressSection: {
    flex: 1,
    paddingHorizontal: 8,
  },
  progressBarContainer: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 2,
  },
  progressBarOver: {
    backgroundColor: '#EF4444',
  },
  budgetSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  budgetLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#94a3b8',
  },
  setBudgetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderRadius: 6,
  },
  setBudgetChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
  },
  expandedContent: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 10,
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  editBudgetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderRadius: 8,
  },
  editBudgetText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3B82F6',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239,68,68,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  warningText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#EF4444',
  },
});
