/**
 * GuestKitDetailScreen - View and manage items in a guest kit
 *
 * Shows all safety items and allows adding/editing/deleting
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  Image,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import Svg, { Path } from 'react-native-svg';

import {
  getGuestKit,
  deleteGuestKitItem,
  GuestKit,
  GuestKitItem,
  GuestKitItemType,
} from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BASE_URL = 'https://kandu.app/g/';

// Priority colors
const PRIORITY_COLORS: Record<string, readonly [string, string]> = {
  critical: ['#ef4444', '#dc2626'],
  important: ['#f59e0b', '#d97706'],
  helpful: ['#10b981', '#059669'],
};

// Priority icons
const PRIORITY_ICONS = {
  critical: 'alert-circle',
  important: 'warning',
  helpful: 'information-circle',
};

export default function GuestKitDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { kitId, isNew } = route.params || {};

  const [kit, setKit] = useState<GuestKit | null>(null);
  const [items, setItems] = useState<GuestKitItem[]>([]);
  const [itemTypes, setItemTypes] = useState<Record<string, GuestKitItemType>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadKit = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getGuestKit(kitId);
      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        setKit(result.data.kit);
        setItems(result.data.items || []);
        setItemTypes(result.data.itemTypes || {});
      }
    } catch (err) {
      setError('Failed to load guide');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (kitId) {
        loadKit();
      }
    }, [kitId])
  );

  const handleShareKit = async () => {
    if (!kit) return;
    const shareUrl = `${BASE_URL}${kit.slug}`;
    const ownerName = kit.homeowner_name ? `\n\n- ${kit.homeowner_name}` : '';

    try {
      await Share.share({
        message: `Here's your guide to my home with everything you need to know:\n\n${shareUrl}\n\nTap the link to find safety items, WiFi info, and more.${ownerName}`,
        url: shareUrl,
        title: `${kit.display_name} - Home Guide`,
      });
    } catch (err) {
      console.error('Share error:', err);
    }
  };

  const handleCopyLink = async () => {
    if (!kit) return;
    const shareUrl = `${BASE_URL}${kit.slug}`;
    await Clipboard.setStringAsync(shareUrl);
    Alert.alert('Copied!', 'Link copied to clipboard');
  };

  const handleEditKit = () => {
    navigation.navigate('GuestModeSetup', { kitId, editMode: true });
  };

  const handleAddItem = () => {
    navigation.navigate('AddSafetyItem', { kitId });
  };

  const handleEditItem = (item: GuestKitItem) => {
    navigation.navigate('AddSafetyItem', { kitId, itemId: item.id, editMode: true });
  };

  const handleDeleteItem = (item: GuestKitItem) => {
    const itemName = item.custom_name || itemTypes[item.item_type]?.name || 'Item';
    Alert.alert(
      'Delete Item',
      `Are you sure you want to delete "${itemName}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteGuestKitItem(item.id);
            if (result.error) {
              Alert.alert('Error', result.error);
            } else {
              loadKit();
            }
          },
        },
      ]
    );
  };

  const handlePreviewGuest = () => {
    if (!kit) return;
    navigation.navigate('GuestLinkView', { slug: kit.slug });
  };

  const getItemName = (item: GuestKitItem) => {
    return item.custom_name || itemTypes[item.item_type]?.name || item.item_type;
  };

  const getItemIcon = (item: GuestKitItem) => {
    return item.icon_name || itemTypes[item.item_type]?.icon || 'location';
  };

  const groupItemsByCategory = () => {
    const groups: Record<string, GuestKitItem[]> = {
      safety: [],
      utilities: [],
      appliances: [],
      info: [],
    };

    items.forEach((item) => {
      const category = item.category || 'info';
      if (!groups[category]) groups[category] = [];
      groups[category].push(item);
    });

    return groups;
  };

  const getCategoryTitle = (category: string) => {
    const titles: Record<string, string> = {
      safety: '🚨 Safety & Emergency',
      utilities: '🔧 Utilities',
      appliances: '🏠 Appliances',
      info: '📋 Information',
    };
    return titles[category] || category;
  };

  const renderItemCard = (item: GuestKitItem) => {
    const priorityColors = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS.helpful;

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.itemCard}
        onPress={() => handleEditItem(item)}
        activeOpacity={0.9}
      >
        <View style={styles.itemCardLeft}>
          <LinearGradient
            colors={priorityColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.itemIconContainer}
          >
            <Ionicons
              name={getItemIcon(item) as any}
              size={24}
              color="#fff"
            />
          </LinearGradient>

          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{getItemName(item)}</Text>
            {item.hint && (
              <Text style={styles.itemHint} numberOfLines={1}>
                {item.hint}
              </Text>
            )}
            <View style={styles.itemBadges}>
              <View
                style={[
                  styles.priorityBadge,
                  { backgroundColor: priorityColors[0] + '20' },
                ]}
              >
                <Ionicons
                  name={PRIORITY_ICONS[item.priority] as any}
                  size={12}
                  color={priorityColors[0]}
                />
                <Text style={[styles.priorityText, { color: priorityColors[0] }]}>
                  {item.priority}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.itemCardRight}>
          {item.destination_image_url && (
            <Image
              source={{ uri: item.destination_image_url }}
              style={styles.itemThumbnail}
              resizeMode="cover"
            />
          )}
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeleteItem(item)}
          >
            <Ionicons name="trash-outline" size={18} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color="#1E90FF" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (error || !kit) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
        <Text style={styles.errorText}>{error || 'Guide not found'}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.retryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const groupedItems = groupItemsByCategory();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <LinearGradient
        colors={
          kit.kit_type === 'rental'
            ? ['#FF8B5E', '#FFB84D', '#FFD699']
            : ['#0f172a', '#6A9BD6', '#D4E8ED']
        }
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.header}
      >
        {/* Glass sheen */}
        <LinearGradient
          colors={[
            'rgba(255,255,255,0.35)',
            'rgba(255,255,255,0.14)',
            'rgba(255,255,255,0.00)',
          ]}
          locations={[0, 0.45, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Checkmark watermark */}
        <View style={styles.headerCheckmark} pointerEvents="none">
          <Svg width={600} height={300} viewBox="25 30 50 30">
            <Path
              d="M38 46 L46 54 L62 38"
              fill="none"
              stroke="rgba(255, 255, 255, 0.08)"
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>

        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={styles.headerTitle}>
            <Ionicons
              name={kit.kit_type === 'rental' ? 'bed-outline' : 'home-outline'}
              size={24}
              color="#fff"
            />
            <Text style={styles.headerTitleText}>{kit.display_name}</Text>
          </View>

          <TouchableOpacity style={styles.editButton} onPress={handleEditKit}>
            <Ionicons name="create-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Quick actions */}
        {/* Primary action - Send to Guest (opens native share sheet) */}
        <TouchableOpacity
          style={styles.sendToGuestButton}
          onPress={handleShareKit}
          activeOpacity={0.8}
        >
          <Ionicons name="paper-plane" size={20} color="#1E90FF" />
          <Text style={styles.sendToGuestText}>Send to Guest</Text>
        </TouchableOpacity>

        {/* Secondary actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickAction} onPress={handleCopyLink}>
            <Ionicons name="copy-outline" size={20} color="#fff" />
            <Text style={styles.quickActionText}>Copy Link</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.quickAction} onPress={handlePreviewGuest}>
            <Ionicons name="eye-outline" size={20} color="#fff" />
            <Text style={styles.quickActionText}>Preview</Text>
          </TouchableOpacity>
        </View>

        {/* Link display */}
        <View style={styles.linkContainer}>
          <Ionicons name="link-outline" size={16} color="rgba(255,255,255,0.7)" />
          <Text style={styles.linkText}>kandu.app/g/{kit.slug}</Text>
        </View>
      </LinearGradient>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* New guide banner */}
        {isNew && (
          <View style={styles.newGuideBanner}>
            <Ionicons name="checkmark-circle" size={24} color="#10b981" />
            <View style={styles.newGuideBannerContent}>
              <Text style={styles.newGuideBannerTitle}>Guide Created!</Text>
              <Text style={styles.newGuideBannerText}>
                Now add safety items so guests can find important things in your
                home.
              </Text>
            </View>
          </View>
        )}

        {/* Add item button */}
        <TouchableOpacity
          style={styles.addItemButton}
          onPress={handleAddItem}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#1E90FF', '#00CBA9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.addItemButtonGradient}
          >
            <Ionicons name="add-circle-outline" size={24} color="#fff" />
            <Text style={styles.addItemButtonText}>Add Safety Item</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Items list */}
        {items.length === 0 ? (
          <View style={styles.emptyItems}>
            <Ionicons name="location-outline" size={48} color="#94a3b8" />
            <Text style={styles.emptyItemsTitle}>No Items Yet</Text>
            <Text style={styles.emptyItemsText}>
              Add safety items like water shutoffs, fire extinguishers, and
              more so guests can find them easily.
            </Text>
          </View>
        ) : (
          <>
            {Object.entries(groupedItems).map(([category, categoryItems]) => {
              if (categoryItems.length === 0) return null;
              return (
                <View key={category} style={styles.categorySection}>
                  <Text style={styles.categoryTitle}>
                    {getCategoryTitle(category)}
                  </Text>
                  {categoryItems.map(renderItemCard)}
                </View>
              );
            })}
          </>
        )}

        {/* Stats */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Guide Stats</Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{items.length}</Text>
              <Text style={styles.statLabel}>Items</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {items.filter((i) => i.priority === 'critical').length}
              </Text>
              <Text style={styles.statLabel}>Critical</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>
                {kit.access_pin ? 'Yes' : 'No'}
              </Text>
              <Text style={styles.statLabel}>PIN</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#D4E8ED',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E90FF',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  headerCheckmark: {
    position: 'absolute',
    top: -50,
    right: -150,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitleText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    gap: 6,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  newGuideBanner: {
    flexDirection: 'row',
    backgroundColor: '#f0fdf4',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  newGuideBannerContent: {
    flex: 1,
  },
  newGuideBannerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 4,
  },
  newGuideBannerText: {
    fontSize: 14,
    color: '#15803d',
    lineHeight: 20,
  },
  addItemButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
  },
  addItemButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  addItemButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  emptyItems: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#fff',
    borderRadius: 20,
  },
  emptyItemsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyItemsText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  categorySection: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  itemCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  itemHint: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 6,
  },
  itemBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 4,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  itemCardRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  itemThumbnail: {
    width: 50,
    height: 50,
    borderRadius: 8,
  },
  deleteButton: {
    padding: 8,
  },
  statsCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginTop: 8,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E90FF',
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#e2e8f0',
  },
  // Send to Guest button
  sendToGuestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 25,
    marginBottom: 12,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sendToGuestText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E90FF',
  },
});
