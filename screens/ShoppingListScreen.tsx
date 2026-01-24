/**
 * ShoppingListScreen - View and manage shopping lists
 * Supports both grocery lists (from fridge scans) and hardware lists (from repairs)
 * Includes camera scan feature to detect low items and generate shopping lists
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Alert,
  TextInput,
  Share,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { useNavigation, useFocusEffect, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  getShoppingLists,
  getShoppingListWithItems,
  toggleShoppingListItem,
  deleteShoppingListItem,
  addShoppingListItem,
  deleteShoppingList,
  scanInventory,
  createShoppingListFromScan,
  ShoppingList,
  ShoppingListItem,
  ItemPriority,
  ScanType,
  InventoryScanResult,
  InventoryItem,
} from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Flow states for the screen
type ScreenMode = 'lists' | 'scanType' | 'scanning' | 'analyzing' | 'results';

// Priority colors
const PRIORITY_COLORS: Record<ItemPriority, string> = {
  critical: '#EF4444',
  normal: '#3B82F6',
  optional: '#9CA3AF',
};

// Category icons
const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  dairy: 'water',
  produce: 'leaf',
  meat: 'nutrition',
  condiments: 'flask',
  beverages: 'cafe',
  grains: 'grid',
  frozen: 'snow',
  tools: 'hammer',
  hardware: 'construct',
  electrical: 'flash',
  plumbing: 'water',
  cleaning: 'sparkles',
  other: 'ellipsis-horizontal',
};

// Scan type options
const SCAN_TYPES: Array<{
  id: ScanType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  description: string;
  gradient: [string, string];
}> = [
  {
    id: 'refrigerator',
    label: 'Refrigerator',
    icon: 'snow',
    description: 'Scan your fridge for low items',
    gradient: ['#3B82F6', '#1D4ED8'],
  },
  {
    id: 'pantry',
    label: 'Pantry',
    icon: 'grid',
    description: 'Check pantry staples',
    gradient: ['#F59E0B', '#D97706'],
  },
  {
    id: 'toolbox',
    label: 'Toolbox',
    icon: 'hammer',
    description: 'Inventory your tools',
    gradient: ['#10B981', '#059669'],
  },
  {
    id: 'garage',
    label: 'Garage',
    icon: 'car',
    description: 'Check garage supplies',
    gradient: ['#8B5CF6', '#7C3AED'],
  },
];

// Quantity level colors
const QUANTITY_COLORS: Record<string, string> = {
  full: '#22C55E',
  good: '#84CC16',
  half: '#F59E0B',
  low: '#EF4444',
  empty: '#DC2626',
  unknown: '#9CA3AF',
};

export default function ShoppingListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ShoppingList'>>();
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  // Screen mode
  const [mode, setMode] = useState<ScreenMode>('lists');
  const [selectedScanType, setSelectedScanType] = useState<ScanType>('refrigerator');

  // Lists state
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [selectedList, setSelectedList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');

  // Scan state
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<InventoryScanResult | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCreatingList, setIsCreatingList] = useState(false);

  // Load lists on focus
  useFocusEffect(
    useCallback(() => {
      if (mode === 'lists') {
        loadLists();
      }
    }, [mode])
  );

  // Load a specific list if passed via route params
  useFocusEffect(
    useCallback(() => {
      const listId = route.params?.listId;
      if (listId && lists.length > 0) {
        const list = lists.find(l => l.id === listId);
        if (list) {
          loadListItems(list);
        }
      }
    }, [route.params?.listId, lists])
  );

  const loadLists = async () => {
    setLoading(true);
    const result = await getShoppingLists();
    if (result.data) {
      setLists(result.data);
      // Auto-select first list if none selected
      if (result.data.length > 0 && !selectedList) {
        loadListItems(result.data[0]);
      }
    }
    setLoading(false);
  };

  const loadListItems = async (list: ShoppingList) => {
    setSelectedList(list);
    setLoadingItems(true);
    const result = await getShoppingListWithItems(list.id);
    if (result.data) {
      setItems(result.data.items);
    }
    setLoadingItems(false);
  };

  const handleToggleItem = async (item: ShoppingListItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Optimistic update
    setItems(prev =>
      prev.map(i =>
        i.id === item.id ? { ...i, is_checked: !i.is_checked } : i
      )
    );

    const result = await toggleShoppingListItem(item.id, !item.is_checked);
    if (result.error) {
      // Revert on error
      setItems(prev =>
        prev.map(i =>
          i.id === item.id ? { ...i, is_checked: item.is_checked } : i
        )
      );
    }
  };

  const handleDeleteItem = async (item: ShoppingListItem) => {
    Alert.alert(
      'Remove Item',
      `Remove "${item.item_name}" from the list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setItems(prev => prev.filter(i => i.id !== item.id));
            await deleteShoppingListItem(item.id);
          },
        },
      ]
    );
  };

  const handleAddItem = async () => {
    if (!newItemName.trim() || !selectedList) return;

    setAddingItem(false);
    const result = await addShoppingListItem(selectedList.id, {
      item_name: newItemName.trim(),
      priority: 'normal',
    });

    if (result.data) {
      setItems(prev => [...prev, result.data!]);
    }
    setNewItemName('');
  };

  const handleDeleteList = async () => {
    if (!selectedList) return;

    Alert.alert(
      'Delete List',
      `Delete "${selectedList.name}" and all its items?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            await deleteShoppingList(selectedList.id);
            setSelectedList(null);
            setItems([]);
            loadLists();
          },
        },
      ]
    );
  };

  const handleShareList = async () => {
    if (!selectedList || items.length === 0) return;

    const uncheckedItems = items.filter(i => !i.is_checked);
    const checkedItems = items.filter(i => i.is_checked);

    let listText = `${selectedList.name}\n\n`;

    if (uncheckedItems.length > 0) {
      listText += 'To Buy:\n';
      uncheckedItems.forEach(item => {
        listText += `[ ] ${item.item_name}`;
        if (item.quantity) listText += ` (${item.quantity})`;
        listText += '\n';
      });
    }

    if (checkedItems.length > 0) {
      listText += '\nAlready Got:\n';
      checkedItems.forEach(item => {
        listText += `[x] ${item.item_name}\n`;
      });
    }

    listText += '\n---\nCreated with KanDu';

    try {
      await Share.share({
        message: listText,
        title: selectedList.name,
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  // ============================================
  // SCAN FUNCTIONS
  // ============================================

  const startScan = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Camera Permission', 'Camera access is required to scan items.');
        return;
      }
    }
    setMode('scanType');
  };

  const selectScanType = (type: ScanType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedScanType(type);
    setCapturedImage(null);
    setScanResult(null);
    setMode('scanning');
  };

  const handleCameraReady = () => {
    setIsCameraReady(true);
  };

  const capturePhoto = async () => {
    if (!cameraRef.current || !isCameraReady) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
      });

      if (photo?.uri) {
        setCapturedImage(photo.uri);
        analyzeImage(photo.uri);
      }
    } catch (error) {
      console.error('Capture error:', error);
      Alert.alert('Capture Failed', 'Could not capture photo. Please try again.');
    }
  };

  const analyzeImage = async (imageUri: string) => {
    setMode('analyzing');

    try {
      // Read image as base64
      const base64 = await FileSystem.readAsStringAsync(imageUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const result = await scanInventory(base64, selectedScanType);

      if (result.error) {
        Alert.alert('Scan Failed', result.error);
        setMode('scanning');
        return;
      }

      if (result.data) {
        setScanResult(result.data);
        setMode('results');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      Alert.alert('Analysis Failed', 'Could not analyze the image. Please try again.');
      setMode('scanning');
    }
  };

  const retakeScan = () => {
    setCapturedImage(null);
    setScanResult(null);
    setMode('scanning');
  };

  const createListFromScan = async () => {
    if (!scanResult) return;

    setIsCreatingList(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await createShoppingListFromScan(scanResult);

    setIsCreatingList(false);

    if (result.error) {
      Alert.alert('Error', result.error);
      return;
    }

    if (result.data) {
      // Refresh lists and select the new one
      await loadLists();
      loadListItems(result.data.list);
      setMode('lists');
      setScanResult(null);
      setCapturedImage(null);
    }
  };

  const cancelScan = () => {
    setMode('lists');
    setCapturedImage(null);
    setScanResult(null);
  };

  // Group items by category
  const groupedItems = items.reduce((acc, item) => {
    const category = item.category || 'other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, ShoppingListItem[]>);

  const uncheckedCount = items.filter(i => !i.is_checked).length;
  const checkedCount = items.filter(i => i.is_checked).length;

  // Render checkmark watermark
  const renderWatermark = () => (
    <View style={styles.watermarkContainer} pointerEvents="none">
      <Svg width={300} height={300} viewBox="0 0 100 100" style={styles.watermark}>
        <Path
          d="M20 55 L40 75 L80 25"
          stroke="rgba(255,255,255,0.03)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );

  // ============================================
  // RENDER SCAN TYPE SELECTOR
  // ============================================
  const renderScanTypeSelector = () => (
    <View style={styles.scanTypeContainer}>
      <LinearGradient
        colors={['#1E5AA8', '#0d3a6e']}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={cancelScan}
          >
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.headerTitleContainer}>
            <Ionicons name="scan" size={24} color="#ffffff" style={{ marginRight: 10 }} />
            <Text style={styles.headerTitle}>Scan Inventory</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scanTypeScrollView}
        contentContainerStyle={styles.scanTypeContent}
      >
        <Text style={styles.scanTypePrompt}>What would you like to scan?</Text>

        {SCAN_TYPES.map((type) => (
          <TouchableOpacity
            key={type.id}
            style={styles.scanTypeCard}
            onPress={() => selectScanType(type.id)}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={type.gradient}
              style={styles.scanTypeGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <View style={styles.scanTypeIconContainer}>
                <Ionicons name={type.icon} size={32} color="#ffffff" />
              </View>
              <View style={styles.scanTypeInfo}>
                <Text style={styles.scanTypeLabel}>{type.label}</Text>
                <Text style={styles.scanTypeDescription}>{type.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.7)" />
            </LinearGradient>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  // ============================================
  // RENDER CAMERA VIEW
  // ============================================
  const renderCameraView = () => {
    const scanTypeInfo = SCAN_TYPES.find(t => t.id === selectedScanType);

    return (
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          onCameraReady={handleCameraReady}
        />

        {/* Top overlay */}
        <LinearGradient
          colors={['rgba(0,0,0,0.7)', 'transparent']}
          style={styles.cameraTopOverlay}
        >
          <View style={[styles.cameraHeader, { paddingTop: insets.top }]}>
            <TouchableOpacity
              style={styles.cameraBackButton}
              onPress={() => setMode('scanType')}
            >
              <Ionicons name="arrow-back" size={24} color="#ffffff" />
            </TouchableOpacity>
            <View style={styles.cameraHeaderCenter}>
              <Ionicons name={scanTypeInfo?.icon || 'scan'} size={20} color="#ffffff" />
              <Text style={styles.cameraTitle}>Scan {scanTypeInfo?.label}</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>
        </LinearGradient>

        {/* Bottom overlay with capture button */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)']}
          style={styles.cameraBottomOverlay}
        >
          <Text style={styles.cameraInstructions}>
            Point at your {scanTypeInfo?.label.toLowerCase()} and tap to scan
          </Text>

          <TouchableOpacity
            style={styles.captureButton}
            onPress={capturePhoto}
            activeOpacity={0.7}
          >
            <View style={styles.captureButtonInner}>
              <Ionicons name="scan" size={32} color="#1E5AA8" />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelScanButton}
            onPress={cancelScan}
          >
            <Text style={styles.cancelScanText}>Cancel</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
  };

  // ============================================
  // RENDER ANALYZING VIEW
  // ============================================
  const renderAnalyzingView = () => (
    <View style={styles.analyzingContainer}>
      <LinearGradient colors={['#1a1a2e', '#16213e']} style={StyleSheet.absoluteFill} />

      {capturedImage && (
        <Image source={{ uri: capturedImage }} style={styles.analyzingImage} />
      )}

      <View style={styles.analyzingOverlay}>
        <View style={styles.analyzingCard}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.analyzingTitle}>Analyzing...</Text>
          <Text style={styles.analyzingSubtext}>
            Identifying items and checking quantities
          </Text>
        </View>
      </View>
    </View>
  );

  // ============================================
  // RENDER SCAN RESULTS
  // ============================================
  const renderScanResults = () => {
    if (!scanResult) return null;

    const lowItems = scanResult.inventory.filter(i => i.needsRestock);
    const okItems = scanResult.inventory.filter(i => !i.needsRestock);

    return (
      <View style={styles.resultsContainer}>
        <LinearGradient colors={['#1a1a2e', '#16213e']} style={StyleSheet.absoluteFill} />
        {renderWatermark()}

        <LinearGradient
          colors={['#1E5AA8', '#0d3a6e']}
          style={styles.headerGradient}
        >
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={retakeScan}
            >
              <Ionicons name="refresh" size={24} color="#ffffff" />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Ionicons name="checkmark-circle" size={24} color="#22C55E" style={{ marginRight: 10 }} />
              <Text style={styles.headerTitle}>Scan Results</Text>
            </View>
            <TouchableOpacity
              style={styles.backButton}
              onPress={cancelScan}
            >
              <Ionicons name="close" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <ScrollView
          style={styles.resultsScrollView}
          contentContainerStyle={[styles.resultsContent, { paddingBottom: insets.bottom + 100 }]}
        >
          {/* Summary Card */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryText}>{scanResult.summary}</Text>
            <View style={styles.summaryStats}>
              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatNumber}>{scanResult.totalItemsDetected}</Text>
                <Text style={styles.summaryStatLabel}>Items Found</Text>
              </View>
              <View style={styles.summaryStatDivider} />
              <View style={styles.summaryStat}>
                <Text style={[styles.summaryStatNumber, { color: '#EF4444' }]}>
                  {scanResult.itemsNeedingRestock}
                </Text>
                <Text style={styles.summaryStatLabel}>Need Restock</Text>
              </View>
            </View>
          </View>

          {/* Shopping List Preview */}
          {scanResult.shoppingList.length > 0 && (
            <View style={styles.resultsSection}>
              <Text style={styles.resultsSectionTitle}>
                <Ionicons name="cart" size={18} color="#3B82F6" /> Shopping List
              </Text>
              {scanResult.shoppingList.map((item, index) => (
                <View key={index} style={styles.shoppingItemPreview}>
                  <View style={styles.shoppingItemLeft}>
                    <View
                      style={[
                        styles.priorityDot,
                        { backgroundColor: PRIORITY_COLORS[item.priority] },
                      ]}
                    />
                    <View>
                      <Text style={styles.shoppingItemName}>{item.itemName}</Text>
                      <Text style={styles.shoppingItemQuantity}>{item.suggestedQuantity}</Text>
                    </View>
                  </View>
                  {item.reason && (
                    <Text style={styles.shoppingItemReason}>{item.reason}</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Low Items */}
          {lowItems.length > 0 && (
            <View style={styles.resultsSection}>
              <Text style={styles.resultsSectionTitle}>
                <Ionicons name="warning" size={18} color="#EF4444" /> Running Low
              </Text>
              {lowItems.map((item, index) => (
                <View key={index} style={styles.inventoryItem}>
                  <View style={styles.inventoryItemLeft}>
                    <View
                      style={[
                        styles.quantityIndicator,
                        { backgroundColor: QUANTITY_COLORS[item.quantityLevel] },
                      ]}
                    />
                    <View>
                      <Text style={styles.inventoryItemName}>{item.name}</Text>
                      <Text style={styles.inventoryItemDetail}>
                        {item.quantityEstimate || item.quantityLevel}
                        {item.location ? ` • ${item.location}` : ''}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.inventoryItemCategory}>{item.category}</Text>
                </View>
              ))}
            </View>
          )}

          {/* OK Items */}
          {okItems.length > 0 && (
            <View style={styles.resultsSection}>
              <Text style={styles.resultsSectionTitle}>
                <Ionicons name="checkmark-circle" size={18} color="#22C55E" /> Well Stocked
              </Text>
              {okItems.map((item, index) => (
                <View key={index} style={[styles.inventoryItem, styles.inventoryItemOk]}>
                  <View style={styles.inventoryItemLeft}>
                    <View
                      style={[
                        styles.quantityIndicator,
                        { backgroundColor: QUANTITY_COLORS[item.quantityLevel] },
                      ]}
                    />
                    <View>
                      <Text style={[styles.inventoryItemName, { opacity: 0.7 }]}>{item.name}</Text>
                      <Text style={styles.inventoryItemDetail}>
                        {item.quantityEstimate || item.quantityLevel}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Create List Button */}
        {scanResult.shoppingList.length > 0 && (
          <View style={[styles.createListButtonContainer, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity
              style={styles.createListButton}
              onPress={createListFromScan}
              disabled={isCreatingList}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#22C55E', '#16A34A']}
                style={styles.createListButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {isCreatingList ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="add-circle" size={24} color="#ffffff" />
                    <Text style={styles.createListButtonText}>
                      Create Shopping List ({scanResult.shoppingList.length} items)
                    </Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // ============================================
  // RENDER LISTS VIEW
  // ============================================
  const renderListsView = () => {
    if (loading) {
      return (
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <LinearGradient colors={['#1a1a2e', '#16213e']} style={StyleSheet.absoluteFill} />
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Loading lists...</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <LinearGradient colors={['#1a1a2e', '#16213e']} style={StyleSheet.absoluteFill} />
        {renderWatermark()}

        {/* Gradient Header */}
        <LinearGradient
          colors={['#1E5AA8', '#0d3a6e']}
          style={styles.headerGradient}
        >
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="arrow-back" size={24} color="#ffffff" />
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Ionicons name="cart" size={24} color="#ffffff" style={{ marginRight: 10 }} />
              <Text style={styles.headerTitle}>Shopping Lists</Text>
            </View>
            <View style={styles.headerActions}>
              {selectedList && (
                <>
                  <TouchableOpacity
                    style={styles.headerAction}
                    onPress={handleShareList}
                  >
                    <Ionicons name="share-outline" size={22} color="#ffffff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.headerAction}
                    onPress={handleDeleteList}
                  >
                    <Ionicons name="trash-outline" size={22} color="#ffffff" />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </LinearGradient>

        {/* List tabs */}
        {lists.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsContainer}
            contentContainerStyle={styles.tabsContent}
          >
            {lists.map(list => (
              <TouchableOpacity
                key={list.id}
                style={[
                  styles.listTab,
                  selectedList?.id === list.id && styles.listTabActive,
                ]}
                onPress={() => loadListItems(list)}
              >
                <Ionicons
                  name={list.list_type === 'hardware' ? 'hammer' : 'cart'}
                  size={16}
                  color={selectedList?.id === list.id ? '#ffffff' : 'rgba(255,255,255,0.6)'}
                />
                <Text
                  style={[
                    styles.listTabText,
                    selectedList?.id === list.id && styles.listTabTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {list.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Empty state */}
        {lists.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cart-outline" size={64} color="rgba(255,255,255,0.3)" />
            <Text style={styles.emptyTitle}>No Shopping Lists</Text>
            <Text style={styles.emptySubtext}>
              Scan your fridge or pantry to generate a shopping list
            </Text>
            <TouchableOpacity
              style={styles.emptyStateScanButton}
              onPress={startScan}
            >
              <LinearGradient
                colors={['#3B82F6', '#2563EB']}
                style={styles.emptyStateScanButtonGradient}
              >
                <Ionicons name="scan" size={20} color="#ffffff" />
                <Text style={styles.emptyStateScanButtonText}>Scan Now</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : loadingItems ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
          </View>
        ) : (
          <>
            {/* Progress bar */}
            {items.length > 0 && (
              <View style={styles.progressContainer}>
                <View style={styles.progressBar}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${(checkedCount / items.length) * 100}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {checkedCount}/{items.length} items
                </Text>
              </View>
            )}

            {/* Items list */}
            <ScrollView
              style={styles.itemsList}
              contentContainerStyle={[
                styles.itemsContent,
                { paddingBottom: insets.bottom + 100 },
              ]}
            >
              {Object.entries(groupedItems).map(([category, categoryItems]) => (
                <View key={category} style={styles.categorySection}>
                  <View style={styles.categoryHeader}>
                    <Ionicons
                      name={CATEGORY_ICONS[category] || 'ellipsis-horizontal'}
                      size={16}
                      color="rgba(255,255,255,0.5)"
                    />
                    <Text style={styles.categoryTitle}>
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </Text>
                  </View>

                  {categoryItems.map(item => (
                    <TouchableOpacity
                      key={item.id}
                      style={[
                        styles.itemRow,
                        item.is_checked && styles.itemRowChecked,
                      ]}
                      onPress={() => handleToggleItem(item)}
                      onLongPress={() => handleDeleteItem(item)}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          item.is_checked && styles.checkboxChecked,
                        ]}
                      >
                        {item.is_checked && (
                          <Ionicons name="checkmark" size={14} color="#ffffff" />
                        )}
                      </View>

                      <View style={styles.itemInfo}>
                        <Text
                          style={[
                            styles.itemName,
                            item.is_checked && styles.itemNameChecked,
                          ]}
                        >
                          {item.item_name}
                        </Text>
                        {item.quantity && (
                          <Text style={styles.itemQuantity}>{item.quantity}</Text>
                        )}
                        {item.notes && (
                          <Text style={styles.itemNotes}>{item.notes}</Text>
                        )}
                      </View>

                      {item.priority !== 'normal' && (
                        <View
                          style={[
                            styles.priorityBadge,
                            { backgroundColor: PRIORITY_COLORS[item.priority] + '20' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.priorityText,
                              { color: PRIORITY_COLORS[item.priority] },
                            ]}
                          >
                            {item.priority}
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              ))}

              {/* Add item button */}
              {addingItem ? (
                <View style={styles.addItemContainer}>
                  <TextInput
                    style={styles.addItemInput}
                    placeholder="Item name..."
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    value={newItemName}
                    onChangeText={setNewItemName}
                    onSubmitEditing={handleAddItem}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={styles.addItemButton}
                    onPress={handleAddItem}
                  >
                    <Ionicons name="add" size={24} color="#ffffff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setAddingItem(false);
                      setNewItemName('');
                    }}
                  >
                    <Ionicons name="close" size={24} color="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => setAddingItem(true)}
                >
                  <Ionicons name="add" size={20} color="#3B82F6" />
                  <Text style={styles.addButtonText}>Add item</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </>
        )}

        {/* Floating Scan Button */}
        {lists.length > 0 && (
          <TouchableOpacity
            style={[styles.floatingScanButton, { bottom: insets.bottom + 24 }]}
            onPress={startScan}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#3B82F6', '#2563EB']}
              style={styles.floatingScanButtonGradient}
            >
              <Ionicons name="scan" size={24} color="#ffffff" />
              <Text style={styles.floatingScanButtonText}>Scan</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ============================================
  // MAIN RENDER
  // ============================================
  switch (mode) {
    case 'scanType':
      return renderScanTypeSelector();
    case 'scanning':
      return renderCameraView();
    case 'analyzing':
      return renderAnalyzingView();
    case 'results':
      return renderScanResults();
    default:
      return renderListsView();
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: 'rgba(255,255,255,0.6)',
    marginTop: 12,
    fontSize: 15,
  },
  watermarkContainer: {
    position: 'absolute',
    right: -50,
    bottom: 100,
    opacity: 0.5,
  },
  watermark: {
    transform: [{ rotate: '-15deg' }],
  },
  headerGradient: {
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerAction: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabsContainer: {
    maxHeight: 50,
    marginBottom: 8,
  },
  tabsContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  listTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginRight: 8,
  },
  listTabActive: {
    backgroundColor: '#3B82F6',
  },
  listTabText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    maxWidth: 100,
  },
  listTabTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  emptyStateScanButton: {
    marginTop: 24,
    borderRadius: 12,
    overflow: 'hidden',
  },
  emptyStateScanButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  emptyStateScanButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#22C55E',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
  },
  itemsList: {
    flex: 1,
  },
  itemsContent: {
    paddingHorizontal: 16,
  },
  categorySection: {
    marginBottom: 20,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    paddingLeft: 4,
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  itemRowChecked: {
    opacity: 0.5,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#22C55E',
    borderColor: '#22C55E',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '500',
  },
  itemNameChecked: {
    textDecorationLine: 'line-through',
    color: 'rgba(255,255,255,0.5)',
  },
  itemQuantity: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  itemNotes: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 4,
    fontStyle: 'italic',
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    borderStyle: 'dashed',
    marginTop: 8,
  },
  addButtonText: {
    fontSize: 15,
    color: '#3B82F6',
    fontWeight: '500',
  },
  addItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  addItemInput: {
    flex: 1,
    height: 48,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#ffffff',
  },
  addItemButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingScanButton: {
    position: 'absolute',
    right: 20,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  floatingScanButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  floatingScanButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Scan Type Selector styles
  scanTypeContainer: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  scanTypeScrollView: {
    flex: 1,
  },
  scanTypeContent: {
    padding: 20,
  },
  scanTypePrompt: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 20,
  },
  scanTypeCard: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  scanTypeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  scanTypeIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  scanTypeInfo: {
    flex: 1,
  },
  scanTypeLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  scanTypeDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },

  // Camera styles
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  cameraTopOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingBottom: 40,
  },
  cameraHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  cameraBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraHeaderCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  cameraTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
  },
  cameraBottomOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 60,
    paddingBottom: 40,
    alignItems: 'center',
  },
  cameraInstructions: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 24,
    textAlign: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  captureButtonInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#1E5AA8',
  },
  cancelScanButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  cancelScanText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
  },

  // Analyzing styles
  analyzingContainer: {
    flex: 1,
  },
  analyzingImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.3,
  },
  analyzingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  analyzingCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
  },
  analyzingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 16,
  },
  analyzingSubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 8,
    textAlign: 'center',
  },

  // Results styles
  resultsContainer: {
    flex: 1,
  },
  resultsScrollView: {
    flex: 1,
  },
  resultsContent: {
    padding: 16,
  },
  summaryCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  summaryText: {
    fontSize: 15,
    color: '#ffffff',
    lineHeight: 22,
    marginBottom: 16,
  },
  summaryStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryStat: {
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  summaryStatNumber: {
    fontSize: 28,
    fontWeight: '700',
    color: '#22C55E',
  },
  summaryStatLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 4,
  },
  summaryStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  resultsSection: {
    marginBottom: 24,
  },
  resultsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 12,
  },
  shoppingItemPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  shoppingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  shoppingItemName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#ffffff',
  },
  shoppingItemQuantity: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  shoppingItemReason: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    fontStyle: 'italic',
  },
  inventoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  inventoryItemOk: {
    opacity: 0.6,
  },
  inventoryItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  quantityIndicator: {
    width: 4,
    height: 32,
    borderRadius: 2,
    marginRight: 12,
  },
  inventoryItemName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#ffffff',
  },
  inventoryItemDetail: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  inventoryItemCategory: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'capitalize',
  },
  createListButtonContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: 'rgba(26, 26, 46, 0.95)',
  },
  createListButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  createListButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  createListButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
});
