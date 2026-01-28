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
  Modal,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';

import {
  listGuestKits,
  deleteGuestKit,
  updateGuestKit,
  listProperties,
  createProperty,
  GuestKit,
  Property,
  PropertyType,
} from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BASE_URL = 'https://getkandu.com/g/';

// Property type display config
const PROPERTY_TYPE_CONFIG: Record<PropertyType, { label: string; icon: string; gradient: string[] }> = {
  primary_residence: { label: 'Primary Home', icon: 'home', gradient: ['#4FA3FF', '#3AD7C3'] },
  second_home: { label: 'Second Home', icon: 'sunny', gradient: ['#FF8B5E', '#FFB84D'] },
  rental: { label: 'Rental Property', icon: 'bed', gradient: ['#A855F7', '#EC4899'] },
};

export default function GuestModeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [kits, setKits] = useState<GuestKit[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [newPropertyName, setNewPropertyName] = useState('');
  const [newPropertyType, setNewPropertyType] = useState<PropertyType>('primary_residence');
  const [expandedProperties, setExpandedProperties] = useState<Set<string>>(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [kitToMove, setKitToMove] = useState<GuestKit | null>(null);

  const togglePropertyExpanded = (propertyId: string) => {
    setExpandedProperties((prev) => {
      const next = new Set(prev);
      if (next.has(propertyId)) {
        next.delete(propertyId);
      } else {
        next.add(propertyId);
      }
      return next;
    });
  };

  const loadData = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    setError(null);

    try {
      // Load both properties and kits
      const [propsResult, kitsResult] = await Promise.all([
        listProperties(),
        listGuestKits(),
      ]);

      if (propsResult.error) {
        console.error('Properties error:', propsResult.error);
      } else if (propsResult.data) {
        setProperties(propsResult.data.properties || []);
      }

      if (kitsResult.error) {
        setError(kitsResult.error);
      } else if (kitsResult.data) {
        setKits(kitsResult.data.kits || []);
      }
    } catch (err) {
      setError('Failed to load your home guides');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Legacy function for compatibility
  const loadKits = loadData;

  useFocusEffect(
    useCallback(() => {
      loadKits();
    }, [])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadKits(false);
  };

  const handleCreateKit = (propertyId?: string) => {
    navigation.navigate('GuestModeSetup', { propertyId });
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

  const handleMoveKit = (kit: GuestKit) => {
    setKitToMove(kit);
    setShowMoveModal(true);
  };

  const handleMoveToProperty = async (propertyId: string | null) => {
    if (!kitToMove) return;

    const result = await updateGuestKit(kitToMove.id, { property_id: propertyId });
    if (result.error) {
      Alert.alert('Error', result.error);
    } else {
      loadKits();
    }
    setShowMoveModal(false);
    setKitToMove(null);
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

  // Group kits by property
  const getGroupedKits = () => {
    const grouped: { property: Property | null; kits: GuestKit[] }[] = [];

    // Group by property
    properties.forEach((property) => {
      const propertyKits = kits.filter((k) => k.property_id === property.id);
      grouped.push({ property, kits: propertyKits });
    });

    // Ungrouped kits (no property assigned)
    const ungroupedKits = kits.filter((k) => !k.property_id);
    if (ungroupedKits.length > 0) {
      grouped.push({ property: null, kits: ungroupedKits });
    }

    return grouped;
  };

  const handleAddProperty = async () => {
    if (!newPropertyName.trim()) {
      Alert.alert('Required', 'Please enter a property name');
      return;
    }

    const result = await createProperty({
      name: newPropertyName.trim(),
      property_type: newPropertyType,
    });

    if (result.error) {
      Alert.alert('Error', result.error);
    } else {
      setShowAddProperty(false);
      setNewPropertyName('');
      setNewPropertyType('primary_residence');
      loadData();
    }
  };

  const renderPropertyCard = (property: Property) => {
    const config = PROPERTY_TYPE_CONFIG[property.property_type];
    const propertyKits = kits.filter((k) => k.property_id === property.id);
    const isExpanded = expandedProperties.has(property.id);
    const guideCount = propertyKits.length;

    return (
      <View key={property.id} style={styles.propertyCard}>
        {/* Property Header - Tappable to expand */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => togglePropertyExpanded(property.id)}
        >
          <LinearGradient
            colors={config.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.propertyCardHeader}
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

            <View style={styles.propertyCardContent}>
              <View style={styles.propertyIconContainer}>
                <Ionicons name={config.icon as any} size={28} color="#fff" />
              </View>
              <View style={styles.propertyInfo}>
                <Text style={styles.propertyName}>{property.name}</Text>
                <Text style={styles.propertyCardTypeLabel}>{config.label}</Text>
              </View>
              <View style={styles.propertyMeta}>
                <View style={styles.guideCountBadge}>
                  <Text style={styles.guideCountText}>
                    {guideCount} {guideCount === 1 ? 'guide' : 'guides'}
                  </Text>
                </View>
                <Ionicons
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={24}
                  color="rgba(255,255,255,0.8)"
                />
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Expanded content with guides */}
        {isExpanded && (
          <View style={styles.propertyExpanded}>
            {/* Add Guide button */}
            <TouchableOpacity
              style={styles.addGuideToPropertyButton}
              onPress={() => handleCreateKit(property.id)}
            >
              <Ionicons name="add-circle" size={20} color="#1E90FF" />
              <Text style={styles.addGuideToPropertyText}>Add Guide to {property.name}</Text>
            </TouchableOpacity>

            {/* Guides list */}
            {propertyKits.length > 0 ? (
              propertyKits.map((kit) => renderCompactKitCard(kit))
            ) : (
              <View style={styles.noGuidesYet}>
                <Ionicons name="document-text-outline" size={32} color="#cbd5e1" />
                <Text style={styles.noGuidesText}>No guides yet</Text>
                <Text style={styles.noGuidesSubtext}>
                  Create a guide for guests visiting this property
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  // Compact kit card for inside property cards
  const renderCompactKitCard = (kit: GuestKit) => {
    const itemCount = getKitItemCount(kit);
    const isExpired = kit.expires_at && new Date(kit.expires_at) < new Date();

    return (
      <View key={kit.id} style={styles.compactKitCard}>
        <TouchableOpacity
          style={styles.compactKitContent}
          onPress={() => handleViewKit(kit)}
        >
          <View style={styles.compactKitInfo}>
            <Text style={styles.compactKitName}>{kit.display_name}</Text>
            <View style={styles.compactKitMeta}>
              <Text style={styles.compactKitStat}>{itemCount} items</Text>
              {kit.access_pin && (
                <>
                  <Text style={styles.compactKitDot}>•</Text>
                  <Ionicons name="lock-closed" size={12} color="#64748b" />
                </>
              )}
              {(!kit.is_active || isExpired) && (
                <View style={styles.compactInactiveBadge}>
                  <Text style={styles.compactInactiveText}>
                    {isExpired ? 'Expired' : 'Inactive'}
                  </Text>
                </View>
              )}
            </View>
          </View>
          <View style={styles.compactKitActions}>
            <TouchableOpacity
              style={styles.compactActionBtn}
              onPress={() => handleMoveKit(kit)}
            >
              <Ionicons name="swap-horizontal-outline" size={18} color="#8b5cf6" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.compactActionBtn}
              onPress={() => handleShareKit(kit)}
            >
              <Ionicons name="share-outline" size={18} color="#1E90FF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.compactActionBtn}
              onPress={() => handleEditKit(kit)}
            >
              <Ionicons name="create-outline" size={18} color="#64748b" />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  // Render ungrouped guides (legacy guides without property)
  const renderUngroupedKits = () => {
    const ungroupedKits = kits.filter((k) => !k.property_id);
    if (ungroupedKits.length === 0) return null;

    return (
      <View style={styles.ungroupedSection}>
        <View style={styles.ungroupedHeader}>
          <Ionicons name="folder-open-outline" size={20} color="#64748b" />
          <Text style={styles.ungroupedText}>Unassigned Guides</Text>
        </View>
        {ungroupedKits.map(renderKitCard)}
      </View>
    );
  };

  const renderAddPropertyModal = () => (
    <Modal visible={showAddProperty} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Property</Text>
            <TouchableOpacity onPress={() => setShowAddProperty(false)}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          <Text style={styles.modalLabel}>Property Name</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="e.g., Beach House, Downtown Rental"
            value={newPropertyName}
            onChangeText={setNewPropertyName}
            placeholderTextColor="#94a3b8"
          />

          <Text style={styles.modalLabel}>Property Type</Text>
          <View style={styles.propertyTypeSelector}>
            {(Object.keys(PROPERTY_TYPE_CONFIG) as PropertyType[]).map((type) => {
              const config = PROPERTY_TYPE_CONFIG[type];
              const isSelected = newPropertyType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.propertyTypeOption,
                    isSelected && styles.propertyTypeOptionSelected,
                  ]}
                  onPress={() => setNewPropertyType(type)}
                >
                  <LinearGradient
                    colors={isSelected ? config.gradient : ['#f1f5f9', '#f1f5f9']}
                    style={styles.propertyTypeIcon}
                  >
                    <Ionicons
                      name={config.icon as any}
                      size={20}
                      color={isSelected ? '#fff' : '#64748b'}
                    />
                  </LinearGradient>
                  <Text
                    style={[
                      styles.propertyTypeLabel,
                      isSelected && styles.propertyTypeLabelSelected,
                    ]}
                  >
                    {config.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.modalButton} onPress={handleAddProperty}>
            <LinearGradient
              colors={['#1E90FF', '#00CBA9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalButtonGradient}
            >
              <Text style={styles.modalButtonText}>Add Property</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  const renderMoveModal = () => (
    <Modal visible={showMoveModal} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Move Guide</Text>
            <TouchableOpacity onPress={() => { setShowMoveModal(false); setKitToMove(null); }}>
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>

          <Text style={styles.moveModalSubtitle}>
            Select a property for "{kitToMove?.display_name}"
          </Text>

          <ScrollView style={styles.movePropertyList}>
            {/* Unassigned option */}
            <TouchableOpacity
              style={[
                styles.movePropertyOption,
                !kitToMove?.property_id && styles.movePropertyOptionSelected,
              ]}
              onPress={() => handleMoveToProperty(null)}
            >
              <View style={styles.movePropertyIcon}>
                <Ionicons name="folder-open-outline" size={24} color="#64748b" />
              </View>
              <Text style={styles.movePropertyName}>Unassigned</Text>
              {!kitToMove?.property_id && (
                <Ionicons name="checkmark-circle" size={24} color="#10b981" />
              )}
            </TouchableOpacity>

            {/* Property options */}
            {properties.map((property) => {
              const config = PROPERTY_TYPE_CONFIG[property.property_type];
              const isCurrentProperty = kitToMove?.property_id === property.id;
              return (
                <TouchableOpacity
                  key={property.id}
                  style={[
                    styles.movePropertyOption,
                    isCurrentProperty && styles.movePropertyOptionSelected,
                  ]}
                  onPress={() => handleMoveToProperty(property.id)}
                >
                  <LinearGradient
                    colors={config.gradient}
                    style={styles.movePropertyIconGradient}
                  >
                    <Ionicons name={config.icon as any} size={20} color="#fff" />
                  </LinearGradient>
                  <View style={styles.movePropertyInfo}>
                    <Text style={styles.movePropertyName}>{property.name}</Text>
                    <Text style={styles.movePropertyType}>{config.label}</Text>
                  </View>
                  {isCurrentProperty && (
                    <Ionicons name="checkmark-circle" size={24} color="#10b981" />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconContainer}>
        <LinearGradient
          colors={['#4FA3FF', '#3AD7C3']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.emptyIconGradient}
        >
          <Ionicons name="business-outline" size={48} color="#fff" />
        </LinearGradient>
      </View>
      <Text style={styles.emptyTitle}>Welcome to Guest Mode</Text>
      <Text style={styles.emptySubtitle}>
        Create shareable guides for your properties so babysitters, guests, and
        visitors can find everything they need — from WiFi to the water shutoff.
      </Text>
      <Text style={styles.emptyStepText}>Step 1: Add your first property</Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => setShowAddProperty(true)}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={['#1E90FF', '#00CBA9']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.emptyButtonGradient}
        >
          <Ionicons name="add" size={24} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.emptyButtonText}>Add Your First Property</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Property type preview */}
      <View style={styles.propertyTypePreview}>
        {(Object.keys(PROPERTY_TYPE_CONFIG) as PropertyType[]).map((type) => {
          const config = PROPERTY_TYPE_CONFIG[type];
          return (
            <View key={type} style={styles.propertyTypePreviewItem}>
              <LinearGradient
                colors={config.gradient}
                style={styles.propertyTypePreviewIcon}
              >
                <Ionicons name={config.icon as any} size={16} color="#fff" />
              </LinearGradient>
              <Text style={styles.propertyTypePreviewLabel}>{config.label}</Text>
            </View>
          );
        })}
      </View>
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
            onPress={() => handleMoveKit(kit)}
          >
            <Ionicons name="swap-horizontal-outline" size={20} color="#8b5cf6" />
            <Text style={[styles.kitActionText, { color: '#8b5cf6' }]}>Move</Text>
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
          {/* Back button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

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
        ) : properties.length === 0 ? (
          renderEmptyState()
        ) : (
          <>
            {/* Add Property button */}
            <TouchableOpacity
              style={styles.addPropertyButton}
              onPress={() => setShowAddProperty(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle" size={22} color="#A855F7" />
              <Text style={styles.addPropertyButtonText}>Add Another Property</Text>
            </TouchableOpacity>

            {/* Property cards */}
            <Text style={styles.sectionTitle}>Your Properties</Text>
            {properties.map(renderPropertyCard)}

            {/* Ungrouped guides (legacy) */}
            {renderUngroupedKits()}
          </>
        )}
      </ScrollView>

      {/* Add Property Modal */}
      {renderAddPropertyModal()}

      {/* Move Guide Modal */}
      {renderMoveModal()}
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
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
    paddingHorizontal: 4,
  },
  kitActionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 3,
  },
  kitActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E90FF',
  },

  // Action buttons row (replaces single create button)
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  actionButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },

  // Property section styles
  propertySection: {
    marginBottom: 24,
  },
  propertySectionHeader: {
    marginBottom: 12,
  },
  propertyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    gap: 8,
  },
  propertyBadgeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  propertyTypeText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginLeft: 4,
  },
  ungroupedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  ungroupedText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  emptyPropertyState: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  emptyPropertyText: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 12,
  },
  addGuideButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  addGuideText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E90FF',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1e293b',
    marginBottom: 20,
  },
  propertyTypeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  propertyTypeOption: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  propertyTypeOptionSelected: {
    borderColor: '#1E90FF',
    backgroundColor: '#f0f9ff',
  },
  propertyTypeIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  propertyTypeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
    width: '100%',
  },
  propertyTypeLabelSelected: {
    color: '#1E90FF',
  },
  modalButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  modalButtonGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  modalButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },

  // Move modal styles
  moveModalSubtitle: {
    fontSize: 15,
    color: '#64748b',
    marginBottom: 20,
  },
  movePropertyList: {
    maxHeight: 350,
  },
  movePropertyOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    marginBottom: 10,
    gap: 14,
  },
  movePropertyOptionSelected: {
    backgroundColor: '#ecfdf5',
    borderWidth: 2,
    borderColor: '#10b981',
  },
  movePropertyIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  movePropertyIconGradient: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  movePropertyInfo: {
    flex: 1,
  },
  movePropertyName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  movePropertyType: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },

  // Empty state step text
  emptyStepText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E90FF',
    marginBottom: 16,
  },

  // Property type preview in empty state
  propertyTypePreview: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    marginTop: 32,
  },
  propertyTypePreviewItem: {
    alignItems: 'center',
  },
  propertyTypePreviewIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  propertyTypePreviewLabel: {
    fontSize: 11,
    color: '#64748b',
    textAlign: 'center',
  },

  // Add property button (when properties exist)
  addPropertyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: '#faf5ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9d5ff',
    borderStyle: 'dashed',
    marginBottom: 20,
  },
  addPropertyButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#A855F7',
  },

  // Property card styles
  propertyCard: {
    marginBottom: 16,
    borderRadius: 16,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  propertyCardHeader: {
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  propertyCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  propertyIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  propertyInfo: {
    flex: 1,
  },
  propertyName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  propertyCardTypeLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  propertyMeta: {
    alignItems: 'flex-end',
  },
  guideCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 6,
  },
  guideCountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },

  // Property expanded content
  propertyExpanded: {
    padding: 16,
    paddingTop: 8,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  addGuideToPropertyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  addGuideToPropertyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E90FF',
  },
  noGuidesYet: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  noGuidesText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#94a3b8',
    marginTop: 8,
  },
  noGuidesSubtext: {
    fontSize: 13,
    color: '#cbd5e1',
    marginTop: 4,
    textAlign: 'center',
  },

  // Compact kit card (inside property)
  compactKitCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  compactKitContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  compactKitInfo: {
    flex: 1,
  },
  compactKitName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  compactKitMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactKitStat: {
    fontSize: 13,
    color: '#64748b',
  },
  compactKitDot: {
    color: '#cbd5e1',
  },
  compactInactiveBadge: {
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  compactInactiveText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#ef4444',
  },
  compactKitActions: {
    flexDirection: 'row',
    gap: 8,
  },
  compactActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Ungrouped section
  ungroupedSection: {
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
});
