/**
 * ShoppingListBudgetCard - Shows estimated total and budget progress
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

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
  const budgetProgress = budget ? Math.min((estimatedTotal / budget) * 100, 100) : 0;
  const isOverBudget = budget ? estimatedTotal > budget : false;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSetBudget();
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="wallet" size={20} color="#3B82F6" />
          <Text style={styles.title}>Budget Tracker</Text>
        </View>
        <TouchableOpacity
          onPress={handlePress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="settings-outline" size={20} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.amountRow}>
          <View>
            <Text style={styles.label}>Estimated Total</Text>
            <Text style={[styles.amount, isOverBudget && styles.amountOver]}>
              {formatCurrency(estimatedTotal)}
            </Text>
          </View>

          {budget && (
            <View style={styles.budgetSection}>
              <Text style={styles.label}>of {formatCurrency(budget)}</Text>
              <Text style={[styles.percentage, isOverBudget && styles.percentageOver]}>
                {budgetProgress.toFixed(0)}%
              </Text>
            </View>
          )}
        </View>

        {budget ? (
          <View style={styles.progressBarContainer}>
            <View
              style={[
                styles.progressBar,
                isOverBudget && styles.progressBarOver,
                { width: `${budgetProgress}%` },
              ]}
            />
          </View>
        ) : (
          <TouchableOpacity style={styles.setBudgetButton} onPress={handlePress}>
            <Ionicons name="add-circle-outline" size={16} color="#3B82F6" />
            <Text style={styles.setBudgetText}>Set Budget</Text>
          </TouchableOpacity>
        )}

        {isOverBudget && (
          <View style={styles.warningBanner}>
            <Ionicons name="warning" size={14} color="#EF4444" />
            <Text style={styles.warningText}>
              Over budget by {formatCurrency(estimatedTotal - (budget || 0))}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  content: {
    gap: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  label: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 4,
  },
  amount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10B981',
  },
  amountOver: {
    color: '#EF4444',
  },
  budgetSection: {
    alignItems: 'flex-end',
  },
  percentage: {
    fontSize: 18,
    fontWeight: '600',
    color: '#10B981',
  },
  percentageOver: {
    color: '#EF4444',
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  progressBarOver: {
    backgroundColor: '#EF4444',
  },
  setBudgetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
    borderStyle: 'dashed',
  },
  setBudgetText: {
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
