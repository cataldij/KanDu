/**
 * GuestModeScreen - Main hub for Guest Mode feature
 *
 * Allows homeowners to create and manage shareable home guides
 * for babysitters, guests, and Airbnb visitors.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Share,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';

import { listGuestKits, deleteGuestKit, GuestKit } from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BASE_URL = 'https://kandu.app/g/';

export default function GuestModeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [kits, setKits] = useState<GuestKit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadKits = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError(null);

    try {
      const result = await listGuestKits();
      if (result.error) {
        setError(result.error);
      } else if (result.data) {
        setKits(result.data.kits || []);
      }
    } catch (err) {
      setError('Failed to load your home guides');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadKits();
    }, [])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadKits(false);
  };

  const handleCreateKit = () => {
    navigation.navigate('GuestModeSetup');
  };

  const handleEditKit = (kit: GuestKit) => {
    navigation.navigate('GuestModeSetup', { kitId: kit.id, editMode: true });
  };

  const handleDeleteKit = (kit: GuestKit) => {
    Alert.alert(
      'Delete Home Guide',
      `Are you sure you want to delete "${kit.display_name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteGuestKit(kit.id);
            if (result.error) {
              Alert.alert('Error', result.error);
            } else {
              loadKits();
            }
          },
        },
      ]
    );
  };

  const handleShareKit = async (kit: GuestKit) => {
    const shareUrl = `${BASE_URL}${kit.slug}`;
    try {
      await Share.share({
        message: `Here's everything you need to know about my home: ${shareUrl}`,
        url: shareUrl,
      });
    } catch (err) {
      console.error('Share error:', err);
    }
  };

  const handleCopyLink = async (kit: GuestKit) => {
    const shareUrl = `${BASE_URL}${kit.slug}`;
    await Clipboard.setStringAsync(shareUrl);
    Alert.alert('Copied!', 'Link copied to clipboard');
  };

  const handleViewKit = (kit: GuestKit) => {
    navigation.navigate('GuestKitDetail', { kitId: kit.id });
  };

  const getKitItemCount = (kit: any) => {
    // The kit includes guest_kit_items count from the join
    return kit.guest_kit_items?.[0]?.count || 0;
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <LinearGradient
          colors={['#4FA3FF', '#3AD7C3']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.emptyIconGradient}
        >
          <Ionicons name="home-outline" size={48} color="#fff" />
        </LinearGradient>
      </View>
      <Text style={styles.emptyTitle}>No Home Guides Yet</Text>
      <Text style={styles.emptySubtitle}>
        Create a shareable guide so babysitters, guests, and visitors can find
        everything they need — from the WiFi password to the water shutoff.
      </Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={handleCreateKit}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={['#1E90FF', '#00CBA9']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.emptyButtonGradient}
        >
          <Ionicons name="add" size={24} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.emptyButtonText}>Create Your First Guide</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );

  const renderKitCard = (kit: GuestKit) => {
    const itemCount = getKitItemCount(kit);
    const isExpired = kit.expires_at && new Date(kit.expires_at) < new Date();
    const isRental = kit.kit_type === 'rental';

    return (
      <TouchableOpacity
        key={kit.id}
        style={styles.kitCard}
        onPress={() => handleViewKit(kit)}
        activeOpacity={0.9}
      >
        <LinearGradient
          colors={isRental ? ['#FF8B5E', '#FFB84D'] : ['#4FA3FF', '#3AD7C3']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.kitCardGradient}
        >
          {/* Glass sheen overlay */}
          <LinearGradient
            colors={[
              'rgba(255,255,255,0.3)',
              'rgba(255,255,255,0.1)',
              'rgba(255,255,255,0)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />

          {/* Checkmark watermark */}
          <View style={styles.cardCheckmarkWatermark} pointerEvents="none">
            <Svg width={120} height={120} viewBox="0 0 100 100">
              <Path
                d="M25 50 L40 65 L75 30"
                fill="none"
                stroke="rgba(255, 255, 255, 0.08)"
                strokeWidth={14}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </View>

          <View style={styles.kitCardContent}>
            <View style={styles.kitCardHeader}>
              <View style={styles.kitTypeContainer}>
                <Ionicons
                  name={isRental ? 'bed-outline' : 'home-outline'}
                  size={20}
                  color="#fff"
                />
                <Text style={styles.kitTypeText}>
                  {isRental ? 'Rental' : 'Home'}
                </Text>
              </View>
              {!kit.is_active || isExpired ? (
                <View style={styles.inactiveBadge}>
                  <Text style={styles.inactiveBadgeText}>
                    {isExpired ? 'Expired' : 'Inactive'}
                  </Text>
                </View>
              ) : (
                <View style={styles.activeBadge}>
                  <View style={styles.activeDot} />
                  <Text style={styles.activeBadgeText}>Active</Text>
                </View>
              )}
            </View>

            <Text style={styles.kitName}>{kit.display_name}</Text>

            <View style={styles.kitStats}>
              <View style={styles.kitStat}>
                <Ionicons name="location-outline" size={16} color="rgba(255,255,255,0.8)" />
                <Text style={styles.kitStatText}>{itemCount} items</Text>
              </View>
              {kit.access_pin && (
                <View style={styles.kitStat}>
                  <Ionicons name="lock-closed-outline" size={16} color="rgba(255,255,255,0.8)" />
                  <Text style={styles.kitStatText}>PIN protected</Text>
                </View>
              )}
            </View>

            <View style={styles.kitLinkContainer}>
              <Text style={styles.kitLinkLabel}>Share link:</Text>
              <Text style={styles.kitLink} numberOfLines={1}>
                kandu.app/g/{kit.slug}
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* Action buttons */}
        <View style={styles.kitActions}>
          <TouchableOpacity
            style={styles.kitActionButton}
            onPress={() => handleShareKit(kit)}
          >
            <Ionicons name="share-outline" size={20} color="#1E90FF" />
            <Text style={styles.kitActionText}>Share</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.kitActionButton}
            onPress={() => handleCopyLink(kit)}
          >
            <Ionicons name="copy-outline" size={20} color="#1E90FF" />
            <Text style={styles.kitActionText}>Copy</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.kitActionButton}
            onPress={() => handleEditKit(kit)}
          >
            <Ionicons name="create-outline" size={20} color="#1E90FF" />
            <Text style={styles.kitActionText}>Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.kitActionButton}
            onPress={() => handleDeleteKit(kit)}
          >
            <Ionicons name="trash-outline" size={20} color="#ef4444" />
            <Text style={[styles.kitActionText, { color: '#ef4444' }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Hero Header with Gradient */}
      <LinearGradient
        colors={['#0f172a', '#6A9BD6', '#D4E8ED']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.heroGradient}
      >
        {/* Glass sheen overlay */}
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

        {/* Large ghost checkmark watermark */}
        <View style={styles.heroCheckmarkWatermark} pointerEvents="none">
          <Svg width={800} height={400} viewBox="25 30 50 30">
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

        <View style={styles.heroContent}>
          <View style={styles.heroTitleRow}>
            <Ionicons name="people-outline" size={32} color="#fff" />
            <Text style={styles.heroTitle}>Guest Mode</Text>
          </View>
          <Text style={styles.heroSubtitle}>
            Create shareable guides for babysitters, guests, and visitors
          </Text>
        </View>
      </LinearGradient>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#1E90FF" />
            <Text style={styles.loadingText}>Loading your home guides...</Text>
          </View>
        ) : error ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => loadKits()}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        ) : kits.length === 0 ? (
          renderEmptyState()
        ) : (
          <>
            {/* Create new button */}
            <TouchableOpacity
              style={styles.createButton}
              onPress={handleCreateKit}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#1E90FF', '#00CBA9']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.createButtonGradient}
              >
                <Ionicons name="add-circle-outline" size={24} color="#fff" />
                <Text style={styles.createButtonText}>Create New Guide</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Kit list */}
            <Text style={styles.sectionTitle}>Your Home Guides</Text>
            {kits.map(renderKitCard)}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#D4E8ED',
  },
  heroGradient: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    position: 'relative',
    overflow: 'hidden',
  },
  heroCheckmarkWatermark: {
    position: 'absolute',
    top: -50,
    right: -200,
    opacity: 1,
  },
  heroContent: {
    zIndex: 1,
  },
  heroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginLeft: 12,
  },
  heroSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 22,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
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
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyIconContainer: {
    marginBottom: 24,
  },
  emptyIconGradient: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  emptyButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  emptyButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  emptyButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  createButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
  },
  createButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  createButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
  },
  kitCard: {
    marginBottom: 20,
    borderRadius: 20,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
    overflow: 'hidden',
  },
  kitCardGradient: {
    padding: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  cardCheckmarkWatermark: {
    position: 'absolute',
    bottom: -20,
    right: -20,
  },
  kitCardContent: {
    zIndex: 1,
  },
  kitCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  kitTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  kitTypeText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
    marginRight: 6,
  },
  activeBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  inactiveBadge: {
    backgroundColor: 'rgba(239,68,68,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  inactiveBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  kitName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
  },
  kitStats: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  kitStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kitStatText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  kitLinkContainer: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  kitLinkLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginRight: 8,
  },
  kitLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    flex: 1,
  },
  kitActions: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  kitActionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    flexDirection: 'row',
    gap: 6,
  },
  kitActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E90FF',
  },
});
