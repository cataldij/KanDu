/**
 * ArchivedListsModal - Shows past shopping lists with "Shop Again" option
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { ShoppingList } from '../services/api';

interface ArchivedListsModalProps {
  visible: boolean;
  archivedLists: ShoppingList[];
  loading: boolean;
  onClose: () => void;
  onShopAgain: (list: ShoppingList) => void;
}

export default function ArchivedListsModal({
  visible,
  archivedLists,
  loading,
  onClose,
  onShopAgain,
}: ArchivedListsModalProps) {
  const handleShopAgain = (list: ShoppingList) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onShopAgain(list);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContent}>
          <LinearGradient
            colors={['#3B82F6', '#1D4ED8']}
            style={styles.headerGradient}
          >
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Ionicons name="time-outline" size={24} color="#ffffff" />
                <Text style={styles.headerTitle}>Shop Again</Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color="#ffffff" />
              </TouchableOpacity>
            </View>
            <Text style={styles.headerSubtitle}>
              Recreate a list from your shopping history
            </Text>
          </LinearGradient>

          <ScrollView style={styles.listContainer} contentContainerStyle={styles.listContent}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text style={styles.loadingText}>Loading past lists...</Text>
              </View>
            ) : archivedLists.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Ionicons name="file-tray-outline" size={64} color="#64748b" />
                <Text style={styles.emptyTitle}>No Past Lists</Text>
                <Text style={styles.emptyText}>
                  Complete a shopping list and it will appear here for quick recreation
                </Text>
              </View>
            ) : (
              archivedLists.map(list => (
                <TouchableOpacity
                  key={list.id}
                  style={styles.listCard}
                  onPress={() => handleShopAgain(list)}
                  activeOpacity={0.7}
                >
                  <View style={styles.listCardHeader}>
                    <View style={styles.listCardLeft}>
                      <Ionicons
                        name={list.list_type === 'grocery' ? 'cart' : 'hammer'}
                        size={20}
                        color="#3B82F6"
                      />
                      <View style={styles.listCardInfo}>
                        <Text style={styles.listCardTitle} numberOfLines={1}>
                          {list.name}
                        </Text>
                        <View style={styles.listCardMeta}>
                          <Text style={styles.listCardMetaText}>
                            {formatDate(list.completed_at || list.updated_at)}
                          </Text>
                          <Text style={styles.listCardDot}>•</Text>
                          <Text style={styles.listCardMetaText}>
                            {list.item_count} {list.item_count === 1 ? 'item' : 'items'}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                  </View>

                  <View style={styles.shopAgainButton}>
                    <Ionicons name="refresh" size={16} color="#3B82F6" />
                    <Text style={styles.shopAgainButtonText}>Shop Again</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
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
  modalContent: {
    maxHeight: '80%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#1a1a2e',
  },
  headerGradient: {
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  loadingContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: '#94a3b8',
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    maxWidth: 280,
  },
  listCard: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  listCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  listCardInfo: {
    flex: 1,
  },
  listCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  listCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  listCardMetaText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  listCardDot: {
    fontSize: 12,
    color: '#64748b',
  },
  shopAgainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: 'rgba(59,130,246,0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.3)',
  },
  shopAgainButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
});
