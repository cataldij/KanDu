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
  Modal,
  KeyboardAvoidingView,
  Platform,
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
  updateShoppingListItem,
  scanInventory,
  createShoppingList,
  createShoppingListFromScan,
  ShoppingList,
  ShoppingListItem,
  ItemPriority,
  ScanType,
  InventoryScanResult,
  InventoryItem,
} from '../services/api';
import AnimatedLogo from '../components/AnimatedLogo';

// Speech recognition (optional - requires dev build)
let ExpoSpeechRecognitionModule: any = null;
try {
  const speechRecognition = require('expo-speech-recognition');
  ExpoSpeechRecognitionModule = speechRecognition.ExpoSpeechRecognitionModule;
} catch (e) {
  console.log('[ShoppingList] Speech recognition not available');
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Flow states for the screen
type ScreenMode = 'listOverview' | 'listDetail' | 'scanType' | 'scanning' | 'analyzing' | 'results';

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
  const [mode, setMode] = useState<ScreenMode>('listOverview');
  const [selectedScanType, setSelectedScanType] = useState<ScanType>('refrigerator');

  // Lists state
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [selectedList, setSelectedList] = useState<ShoppingList | null>(null);
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPriority, setNewItemPriority] = useState<ItemPriority>('normal');

  // Edit item state
  const [editingItem, setEditingItem] = useState<ShoppingListItem | null>(null);
  const [editedItemName, setEditedItemName] = useState('');

  // Scan state - now supports multiple images
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [scanResult, setScanResult] = useState<InventoryScanResult | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // Track items manually added from inventory to shopping list
  const [manuallyAddedItems, setManuallyAddedItems] = useState<Set<string>>(new Set());

  // Voice input state
  const [isListening, setIsListening] = useState(false);
  const voiceListenersRef = useRef<any[]>([]);

  // Create list modal state
  const [showCreateListModal, setShowCreateListModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListType, setNewListType] = useState<'grocery' | 'hardware'>('grocery');
  const [isCreatingManualList, setIsCreatingManualList] = useState(false);

  // Load lists on focus
  useFocusEffect(
    useCallback(() => {
      if (mode === 'listOverview' || mode === 'listDetail') {
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
    }
    setLoading(false);
  };

  const loadListItems = async (list: ShoppingList) => {
    setSelectedList(list);
    setMode('listDetail');
    setLoadingItems(true);
    const result = await getShoppingListWithItems(list.id);
    if (result.data) {
      setItems(result.data.items);
    }
    setLoadingItems(false);
  };

  const goBackToListOverview = () => {
    setSelectedList(null);
    setItems([]);
    setMode('listOverview');
  };

  const handleCreateManualList = async () => {
    if (!newListName.trim()) {
      Alert.alert('Error', 'Please enter a list name');
      return;
    }

    setIsCreatingManualList(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const result = await createShoppingList(
      newListName.trim(),
      newListType,
      'manual',
      'Created manually'
    );

    setIsCreatingManualList(false);

    if (result.error) {
      Alert.alert('Error', result.error);
      return;
    }

    if (result.data) {
      // Close modal and reset state
      setShowCreateListModal(false);
      setNewListName('');
      setNewListType('grocery');

      // Refresh lists and navigate to the new list
      await loadLists();
      loadListItems(result.data);
    }
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
      priority: newItemPriority,
    });

    if (result.data) {
      setItems(prev => [...prev, result.data!]);
    }
    setNewItemName('');
    setNewItemPriority('normal');
  };

  // Voice input functions
  const cleanupVoiceListeners = () => {
    voiceListenersRef.current.forEach(listener => listener?.remove?.());
    voiceListenersRef.current = [];
  };

  const startVoiceInput = async () => {
    if (!ExpoSpeechRecognitionModule) {
      Alert.alert('Not Available', 'Voice input requires a development build with native modules.');
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setIsListening(true);

      // Request permissions
      const { status } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Microphone access is required for voice input.');
        setIsListening(false);
        return;
      }

      // Set up listeners
      const resultListener = ExpoSpeechRecognitionModule.addListener('result', (event: any) => {
        if (event.results && event.results.length > 0) {
          const transcript = event.results[0]?.transcript || '';
          setNewItemName(transcript);
        }
        if (event.isFinal) {
          cleanupVoiceListeners();
          setIsListening(false);
        }
      });

      const errorListener = ExpoSpeechRecognitionModule.addListener('error', () => {
        cleanupVoiceListeners();
        setIsListening(false);
      });

      const endListener = ExpoSpeechRecognitionModule.addListener('end', () => {
        cleanupVoiceListeners();
        setIsListening(false);
      });

      voiceListenersRef.current = [resultListener, errorListener, endListener];

      // Start listening
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
      });
    } catch (error) {
      console.error('[ShoppingList] Voice input error:', error);
      setIsListening(false);
      Alert.alert('Error', 'Could not start voice input. Please try again.');
    }
  };

  const stopVoiceInput = () => {
    if (ExpoSpeechRecognitionModule) {
      ExpoSpeechRecognitionModule.stop();
    }
    cleanupVoiceListeners();
    setIsListening(false);
  };

  const startEditingItem = (item: ShoppingListItem) => {
    setEditingItem(item);
    setEditedItemName(item.item_name);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSaveEdit = async () => {
    if (!editingItem || !editedItemName.trim()) {
      setEditingItem(null);
      setEditedItemName('');
      return;
    }

    // Optimistic update
    const newName = editedItemName.trim();
    setItems(prev =>
      prev.map(i =>
        i.id === editingItem.id ? { ...i, item_name: newName } : i
      )
    );

    // Save to database
    const result = await updateShoppingListItem(editingItem.id, { item_name: newName });
    if (result.error) {
      // Revert on error
      setItems(prev =>
        prev.map(i =>
          i.id === editingItem.id ? { ...i, item_name: editingItem.item_name } : i
        )
      );
    }

    setEditingItem(null);
    setEditedItemName('');
  };

  const cancelEdit = () => {
    setEditingItem(null);
    setEditedItemName('');
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
            goBackToListOverview();
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
    setCapturedImages([]);
    setScanResult(null);
    setMode('scanning');
  };

  const handleCameraReady = () => {
    setIsCameraReady(true);
  };

  const capturePhoto = async () => {
    if (!cameraRef.current || !isCameraReady || isCapturing) return;

    setIsCapturing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
      });

      if (photo?.uri) {
        // Add to array of captured images
        setCapturedImages(prev => [...prev, photo.uri]);
      }
    } catch (error) {
      console.error('Capture error:', error);
      Alert.alert('Capture Failed', 'Could not capture photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  };

  const removeImage = (index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCapturedImages(prev => prev.filter((_, i) => i !== index));
  };

  const finishCapturing = () => {
    if (capturedImages.length === 0) {
      Alert.alert('No Images', 'Please capture at least one image before analyzing.');
      return;
    }
    analyzeImages();
  };

  const analyzeImages = async () => {
    setMode('analyzing');

    try {
      // Read all images as base64
      const base64Images: string[] = [];
      for (const uri of capturedImages) {
        const base64 = await FileSystem.readAsStringAsync(uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        base64Images.push(base64);
      }

      const result = await scanInventory(base64Images, selectedScanType);

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
      Alert.alert('Analysis Failed', 'Could not analyze the images. Please try again.');
      setMode('scanning');
    }
  };

  const retakeScan = () => {
    setCapturedImages([]);
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
      // Refresh lists and navigate to the new list
      await loadLists();
      loadListItems(result.data.list);
      setScanResult(null);
      setCapturedImages([]);
    }
  };

  const cancelScan = () => {
    setMode('listOverview');
    setCapturedImages([]);
    setScanResult(null);
    setManuallyAddedItems(new Set());
  };

  // Add an inventory item to the shopping list from scan results
  const addInventoryItemToList = (item: InventoryItem) => {
    if (!scanResult) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Create a shopping item from the inventory item
    const newShoppingItem = {
      itemName: item.name,
      searchTerms: item.brand ? `${item.brand} ${item.genericName || item.name}` : item.name,
      genericAlternative: item.genericName || item.name,
      brand: item.brand,
      size: item.size,
      suggestedQuantity: '1',
      category: item.category,
      priority: 'normal' as ItemPriority,
      reason: 'Added manually',
    };

    // Add to the scan result's shopping list
    setScanResult(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        shoppingList: [...prev.shoppingList, newShoppingItem],
      };
    });

    // Track that this item was manually added
    setManuallyAddedItems(prev => new Set(prev).add(item.name));
  };

  // Check if an inventory item is already in the shopping list
  const isItemInShoppingList = (itemName: string): boolean => {
    if (!scanResult) return false;
    return scanResult.shoppingList.some(
      si => si.itemName.toLowerCase() === itemName.toLowerCase()
    ) || manuallyAddedItems.has(itemName);
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

  // Render ghost checkmark watermark in hero gradient (KanDu brand style - same as MainHomeScreen)
  const renderHeroWatermark = () => (
    <View style={styles.heroWatermark} pointerEvents="none">
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
  );

  // Render subtle watermark for content area
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
      {/* Hero Gradient Area */}
      <LinearGradient
        colors={['#0f172a', '#1E5AA8', '#1a1a2e']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[styles.heroGradient, { paddingTop: insets.top }]}
      >
        {/* Glass sheen overlay */}
        <LinearGradient
          pointerEvents="none"
          colors={[
            'rgba(255,255,255,0.25)',
            'rgba(255,255,255,0.10)',
            'rgba(255,255,255,0.00)',
          ]}
          locations={[0, 0.45, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Ghost checkmark watermark */}
        {renderHeroWatermark()}

        <View style={styles.heroControls}>
          <TouchableOpacity
            style={styles.heroBackButton}
            onPress={cancelScan}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <View style={styles.heroTitleContainer}>
            <Ionicons name="scan" size={26} color="#ffffff" style={{ marginRight: 10 }} />
            <Text style={styles.heroTitle}>Scan Inventory</Text>
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
            {/* Photo count badge */}
            {capturedImages.length > 0 && (
              <View style={styles.photoCountBadge}>
                <Text style={styles.photoCountText}>{capturedImages.length}</Text>
              </View>
            )}
            {capturedImages.length === 0 && <View style={{ width: 40 }} />}
          </View>
        </LinearGradient>

        {/* Captured images thumbnail strip */}
        {capturedImages.length > 0 && (
          <View style={styles.thumbnailStrip}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbnailContent}>
              {capturedImages.map((uri, index) => (
                <View key={index} style={styles.thumbnailContainer}>
                  <Image source={{ uri }} style={styles.thumbnail} />
                  <TouchableOpacity
                    style={styles.thumbnailRemove}
                    onPress={() => removeImage(index)}
                  >
                    <Ionicons name="close" size={14} color="#ffffff" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Bottom overlay with capture button */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)']}
          style={styles.cameraBottomOverlay}
        >
          <Text style={styles.cameraInstructions}>
            {capturedImages.length === 0
              ? `Take photos of your ${scanTypeInfo?.label.toLowerCase()}`
              : `${capturedImages.length} photo${capturedImages.length > 1 ? 's' : ''} captured. Add more or tap Done.`
            }
          </Text>

          <View style={styles.captureRow}>
            {/* Cancel button on left */}
            <TouchableOpacity
              style={styles.cancelScanButtonSide}
              onPress={cancelScan}
            >
              <Ionicons name="close" size={24} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>

            {/* Capture button in center */}
            <TouchableOpacity
              style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
              onPress={capturePhoto}
              activeOpacity={0.7}
              disabled={isCapturing}
            >
              <View style={styles.captureButtonInner}>
                <Ionicons name="camera" size={32} color="#1E5AA8" />
              </View>
            </TouchableOpacity>

            {/* Done button on right (only visible when images captured) */}
            {capturedImages.length > 0 ? (
              <TouchableOpacity
                style={styles.doneButton}
                onPress={finishCapturing}
              >
                <LinearGradient
                  colors={['#22C55E', '#16A34A']}
                  style={styles.doneButtonGradient}
                >
                  <Ionicons name="checkmark" size={20} color="#ffffff" />
                  <Text style={styles.doneButtonText}>Done</Text>
                </LinearGradient>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 80 }} />
            )}
          </View>
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

      {/* Show first captured image as background, or a grid if multiple */}
      {capturedImages.length === 1 && (
        <Image source={{ uri: capturedImages[0] }} style={styles.analyzingImage} />
      )}
      {capturedImages.length > 1 && (
        <View style={styles.analyzingImageGrid}>
          {capturedImages.slice(0, 4).map((uri, index) => (
            <Image key={index} source={{ uri }} style={styles.analyzingImageGridItem} />
          ))}
        </View>
      )}

      <View style={styles.analyzingOverlay}>
        <View style={styles.analyzingCard}>
          <AnimatedLogo size={100} isLoading={true} />
          <Text style={styles.analyzingTitle}>Analyzing...</Text>
          <Text style={styles.analyzingSubtext}>
            {capturedImages.length > 1
              ? `Processing ${capturedImages.length} photos`
              : 'Identifying items and checking quantities'
            }
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

    const lowItems = scanResult.inventory.filter(i => i.needsRestock && i.quantityLevel !== 'unknown');
    const unknownItems = scanResult.inventory.filter(i => i.quantityLevel === 'unknown');
    const okItems = scanResult.inventory.filter(i => !i.needsRestock && i.quantityLevel !== 'unknown');

    return (
      <View style={styles.resultsContainer}>
        <LinearGradient colors={['#1a1a2e', '#16213e']} style={StyleSheet.absoluteFill} />

        {/* Hero Gradient Area - Green for success */}
        <LinearGradient
          colors={['#0f172a', '#16A34A', '#1a1a2e']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.heroGradient, { paddingTop: insets.top }]}
        >
          {/* Glass sheen overlay */}
          <LinearGradient
            pointerEvents="none"
            colors={[
              'rgba(255,255,255,0.25)',
              'rgba(255,255,255,0.10)',
              'rgba(255,255,255,0.00)',
            ]}
            locations={[0, 0.45, 1]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Ghost checkmark watermark */}
          {renderHeroWatermark()}

          <View style={styles.heroControls}>
            <TouchableOpacity
              style={styles.heroBackButton}
              onPress={retakeScan}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh" size={24} color="#ffffff" />
            </TouchableOpacity>
            <View style={styles.heroTitleContainer}>
              <Ionicons name="checkmark-circle" size={26} color="#ffffff" style={{ marginRight: 10 }} />
              <Text style={styles.heroTitle}>Scan Results</Text>
            </View>
            <TouchableOpacity
              style={styles.heroBackButton}
              onPress={cancelScan}
              activeOpacity={0.7}
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
              {lowItems.map((item, index) => {
                const alreadyInList = isItemInShoppingList(item.name);
                return (
                  <View key={index} style={styles.inventoryItem}>
                    <View style={styles.inventoryItemLeft}>
                      <View
                        style={[
                          styles.quantityIndicator,
                          { backgroundColor: QUANTITY_COLORS[item.quantityLevel] },
                        ]}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inventoryItemName}>{item.name}</Text>
                        <Text style={styles.inventoryItemDetail}>
                          {item.quantityEstimate || item.quantityLevel}
                          {item.location ? ` • ${item.location}` : ''}
                        </Text>
                      </View>
                    </View>
                    {alreadyInList ? (
                      <View style={styles.addedBadge}>
                        <Ionicons name="checkmark" size={14} color="#22C55E" />
                        <Text style={styles.addedBadgeText}>Added</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.addToListButton}
                        onPress={() => addInventoryItemToList(item)}
                      >
                        <Ionicons name="add" size={18} color="#3B82F6" />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* OK Items - Also allow adding these */}
          {okItems.length > 0 && (
            <View style={styles.resultsSection}>
              <Text style={styles.resultsSectionTitle}>
                <Ionicons name="checkmark-circle" size={18} color="#22C55E" /> Well Stocked
              </Text>
              <Text style={styles.resultsSectionSubtitle}>
                Tap + to add any item to your shopping list
              </Text>
              {okItems.map((item, index) => {
                const alreadyInList = isItemInShoppingList(item.name);
                return (
                  <View key={index} style={[styles.inventoryItem, styles.inventoryItemOk]}>
                    <View style={styles.inventoryItemLeft}>
                      <View
                        style={[
                          styles.quantityIndicator,
                          { backgroundColor: QUANTITY_COLORS[item.quantityLevel] },
                        ]}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.inventoryItemName, { opacity: 0.7 }]}>{item.name}</Text>
                        <Text style={styles.inventoryItemDetail}>
                          {item.quantityEstimate || item.quantityLevel}
                        </Text>
                      </View>
                    </View>
                    {alreadyInList ? (
                      <View style={styles.addedBadge}>
                        <Ionicons name="checkmark" size={14} color="#22C55E" />
                        <Text style={styles.addedBadgeText}>Added</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.addToListButton}
                        onPress={() => addInventoryItemToList(item)}
                      >
                        <Ionicons name="add" size={18} color="#3B82F6" />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* Unknown Quantity Items - Items we couldn't determine quantity for */}
          {unknownItems.length > 0 && (
            <View style={styles.resultsSection}>
              <Text style={styles.resultsSectionTitle}>
                <Ionicons name="help-circle" size={18} color="#9CA3AF" /> Unknown Quantity
              </Text>
              <Text style={styles.resultsSectionSubtitle}>
                Couldn't determine how much is left. Tap + if you need to restock.
              </Text>
              {unknownItems.map((item, index) => {
                const alreadyInList = isItemInShoppingList(item.name);
                return (
                  <View key={index} style={[styles.inventoryItem, styles.inventoryItemUnknown]}>
                    <View style={styles.inventoryItemLeft}>
                      <View style={styles.unknownQuantityIcon}>
                        <Ionicons name="help" size={16} color="#9CA3AF" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.inventoryItemName}>{item.name}</Text>
                        <Text style={styles.inventoryItemDetail}>
                          Quantity unknown
                          {item.location ? ` • ${item.location}` : ''}
                        </Text>
                      </View>
                    </View>
                    {alreadyInList ? (
                      <View style={styles.addedBadge}>
                        <Ionicons name="checkmark" size={14} color="#22C55E" />
                        <Text style={styles.addedBadgeText}>Added</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.addToListButton}
                        onPress={() => addInventoryItemToList(item)}
                      >
                        <Ionicons name="add" size={18} color="#3B82F6" />
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
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
  // RENDER LISTS VIEW (Detail View - shows items in selected list)
  // ============================================
  const renderListsView = () => {
    if (!selectedList) {
      // Safety fallback - should not happen
      return renderListOverview();
    }

    return (
      <View style={styles.container}>
        {/* Background */}
        <LinearGradient colors={['#1a1a2e', '#16213e']} style={StyleSheet.absoluteFill} />

        {/* Hero Gradient Area */}
        <LinearGradient
          colors={['#0f172a', '#1E5AA8', '#1a1a2e']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.heroGradient, { paddingTop: insets.top }]}
        >
          <LinearGradient
            pointerEvents="none"
            colors={[
              'rgba(255,255,255,0.25)',
              'rgba(255,255,255,0.10)',
              'rgba(255,255,255,0.00)',
            ]}
            locations={[0, 0.45, 1]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {renderHeroWatermark()}

          {/* Header with back button */}
          <View style={styles.heroControls}>
            <TouchableOpacity
              style={styles.heroBackButton}
              onPress={goBackToListOverview}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={24} color="#ffffff" />
            </TouchableOpacity>

            <View style={styles.heroTitleContainer}>
              <Ionicons
                name={selectedList.list_type === 'hardware' ? 'hammer' : 'cart'}
                size={24}
                color="#ffffff"
                style={{ marginRight: 10 }}
              />
              <Text style={styles.heroTitle} numberOfLines={1}>
                {selectedList.name}
              </Text>
            </View>

            <View style={styles.heroActions}>
              <TouchableOpacity
                style={styles.heroAction}
                onPress={handleShareList}
                activeOpacity={0.7}
              >
                <Ionicons name="share-outline" size={22} color="#ffffff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.heroAction}
                onPress={handleDeleteList}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={22} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>

        {loadingItems ? (
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
                    editingItem?.id === item.id ? (
                      // Edit mode
                      <View key={item.id} style={[styles.itemRow, styles.itemRowEditing]}>
                        <TextInput
                          style={styles.editItemInput}
                          value={editedItemName}
                          onChangeText={setEditedItemName}
                          onSubmitEditing={handleSaveEdit}
                          autoFocus
                          selectTextOnFocus
                        />
                        <TouchableOpacity
                          style={styles.editSaveButton}
                          onPress={handleSaveEdit}
                        >
                          <Ionicons name="checkmark" size={20} color="#ffffff" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.editCancelButton}
                          onPress={cancelEdit}
                        >
                          <Ionicons name="close" size={20} color="rgba(255,255,255,0.7)" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      // Normal mode
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

                        {/* Edit button */}
                        <TouchableOpacity
                          style={styles.editItemButton}
                          onPress={() => startEditingItem(item)}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons name="pencil" size={16} color="rgba(255,255,255,0.4)" />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    )
                  ))}
                </View>
              ))}

              {/* Add item button */}
              {addingItem ? (
                <View style={styles.addItemWrapper}>
                  <View style={styles.addItemContainer}>
                    <TextInput
                      style={styles.addItemInput}
                      placeholder={isListening ? "Listening..." : "Item name or tap mic..."}
                      placeholderTextColor="rgba(255,255,255,0.4)"
                      value={newItemName}
                      onChangeText={setNewItemName}
                      onSubmitEditing={handleAddItem}
                      autoFocus={!isListening}
                      editable={!isListening}
                    />
                    {/* Voice input button */}
                    <TouchableOpacity
                      style={[
                        styles.voiceInputButton,
                        isListening && styles.voiceInputButtonActive,
                      ]}
                      onPress={isListening ? stopVoiceInput : startVoiceInput}
                    >
                      <Ionicons
                        name={isListening ? "stop" : "mic"}
                        size={20}
                        color={isListening ? "#ffffff" : "#3B82F6"}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.addItemButton}
                      onPress={handleAddItem}
                    >
                      <Ionicons name="add" size={24} color="#ffffff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.cancelButton}
                      onPress={() => {
                        if (isListening) stopVoiceInput();
                        setAddingItem(false);
                        setNewItemName('');
                        setNewItemPriority('normal');
                      }}
                    >
                      <Ionicons name="close" size={24} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  </View>
                  {/* Priority selector */}
                  <View style={styles.prioritySelector}>
                    <Text style={styles.prioritySelectorLabel}>Priority:</Text>
                    {(['critical', 'normal', 'optional'] as ItemPriority[]).map((priority) => (
                      <TouchableOpacity
                        key={priority}
                        style={[
                          styles.priorityOption,
                          newItemPriority === priority && styles.priorityOptionActive,
                          { borderColor: PRIORITY_COLORS[priority] },
                          newItemPriority === priority && { backgroundColor: PRIORITY_COLORS[priority] + '30' },
                        ]}
                        onPress={() => setNewItemPriority(priority)}
                      >
                        <View
                          style={[
                            styles.priorityOptionDot,
                            { backgroundColor: PRIORITY_COLORS[priority] },
                          ]}
                        />
                        <Text
                          style={[
                            styles.priorityOptionText,
                            newItemPriority === priority && { color: '#ffffff' },
                          ]}
                        >
                          {priority.charAt(0).toUpperCase() + priority.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
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
      </View>
    );
  };

  // ============================================
  // RENDER LIST OVERVIEW (List Cards View)
  // ============================================
  const renderListOverview = () => {
    if (loading) {
      return (
        <View style={styles.container}>
          <LinearGradient colors={['#1a1a2e', '#16213e']} style={StyleSheet.absoluteFill} />
          <LinearGradient
            colors={['#0f172a', '#1E5AA8', '#1a1a2e']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[styles.heroGradient, { paddingTop: insets.top }]}
          >
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.00)']}
              locations={[0, 0.45, 1]}
              start={{ x: 0.2, y: 0 }}
              end={{ x: 0.8, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {renderHeroWatermark()}
            <View style={styles.heroControls}>
              <TouchableOpacity style={styles.heroBackButton} onPress={() => navigation.goBack()}>
                <Ionicons name="arrow-back" size={24} color="#ffffff" />
              </TouchableOpacity>
              <View style={styles.heroTitleContainer}>
                <Ionicons name="cart" size={26} color="#ffffff" style={{ marginRight: 10 }} />
                <Text style={styles.heroTitle}>Shopping Lists</Text>
              </View>
              <View style={{ width: 40 }} />
            </View>
          </LinearGradient>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text style={styles.loadingText}>Loading lists...</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <LinearGradient colors={['#1a1a2e', '#16213e']} style={StyleSheet.absoluteFill} />

        {/* Hero Gradient Area */}
        <LinearGradient
          colors={['#0f172a', '#1E5AA8', '#1a1a2e']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.heroGradient, { paddingTop: insets.top }]}
        >
          <LinearGradient
            pointerEvents="none"
            colors={[
              'rgba(255,255,255,0.25)',
              'rgba(255,255,255,0.10)',
              'rgba(255,255,255,0.00)',
            ]}
            locations={[0, 0.45, 1]}
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {renderHeroWatermark()}

          <View style={styles.heroControls}>
            <TouchableOpacity
              style={styles.heroBackButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={24} color="#ffffff" />
            </TouchableOpacity>

            <View style={styles.heroTitleContainer}>
              <Ionicons name="cart" size={26} color="#ffffff" style={{ marginRight: 10 }} />
              <Text style={styles.heroTitle}>Shopping Lists</Text>
            </View>

            <TouchableOpacity
              style={styles.heroBackButton}
              onPress={() => setShowCreateListModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={28} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* List Cards or Empty State */}
        {lists.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cart-outline" size={64} color="rgba(255,255,255,0.3)" />
            <Text style={styles.emptyTitle}>No Shopping Lists</Text>
            <Text style={styles.emptySubtext}>
              Scan your fridge or pantry, or create a list manually
            </Text>
            <View style={styles.emptyStateButtons}>
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
              <TouchableOpacity
                style={styles.emptyStateCreateButton}
                onPress={() => setShowCreateListModal(true)}
              >
                <Ionicons name="add" size={20} color="#3B82F6" />
                <Text style={styles.emptyStateCreateButtonText}>Create List</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <ScrollView
            style={styles.listCardsScrollView}
            contentContainerStyle={[styles.listCardsContent, { paddingBottom: insets.bottom + 100 }]}
          >
            <Text style={styles.listCardsHeader}>
              Tap a list to view items
            </Text>

            {lists.map(list => {
              const listType = list.list_type === 'hardware' ? 'hammer' : 'cart';
              const itemCount = list.item_count || 0;
              const completedCount = list.completed_count || 0;
              const progress = itemCount > 0 ? (completedCount / itemCount) * 100 : 0;

              return (
                <TouchableOpacity
                  key={list.id}
                  style={styles.listCard}
                  onPress={() => loadListItems(list)}
                  activeOpacity={0.7}
                >
                  <LinearGradient
                    colors={list.list_type === 'hardware'
                      ? ['rgba(16, 185, 129, 0.15)', 'rgba(16, 185, 129, 0.05)']
                      : ['rgba(59, 130, 246, 0.15)', 'rgba(59, 130, 246, 0.05)']}
                    style={styles.listCardGradient}
                  >
                    <View style={styles.listCardHeader}>
                      <View style={[
                        styles.listCardIcon,
                        { backgroundColor: list.list_type === 'hardware' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(59, 130, 246, 0.2)' }
                      ]}>
                        <Ionicons
                          name={listType}
                          size={24}
                          color={list.list_type === 'hardware' ? '#10B981' : '#3B82F6'}
                        />
                      </View>
                      <View style={styles.listCardInfo}>
                        <Text style={styles.listCardTitle}>{list.name}</Text>
                        <Text style={styles.listCardSubtitle}>
                          {itemCount === 0
                            ? 'No items'
                            : `${itemCount - completedCount} of ${itemCount} items remaining`}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={24} color="rgba(255,255,255,0.4)" />
                    </View>

                    {itemCount > 0 && (
                      <View style={styles.listCardProgress}>
                        <View style={styles.listCardProgressBar}>
                          <View
                            style={[
                              styles.listCardProgressFill,
                              { width: `${progress}%` }
                            ]}
                          />
                        </View>
                        <Text style={styles.listCardProgressText}>
                          {Math.round(progress)}% complete
                        </Text>
                      </View>
                    )}

                    {list.source_name && (
                      <Text style={styles.listCardSource}>
                        From: {list.source_name}
                      </Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Floating Scan Button */}
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

        {/* Create List Modal */}
        <Modal
          visible={showCreateListModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowCreateListModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <TouchableOpacity
              style={styles.modalOverlay}
              activeOpacity={1}
              onPress={() => setShowCreateListModal(false)}
            >
              <TouchableOpacity
                activeOpacity={1}
                onPress={(e) => e.stopPropagation()}
                style={styles.modalContent}
              >
                <LinearGradient
                  colors={['#1E293B', '#0F172A']}
                  style={styles.modalGradient}
                >
                  <Text style={styles.modalTitle}>Create New List</Text>

                  <Text style={styles.modalLabel}>List Name</Text>
                  <TextInput
                    style={styles.modalInput}
                    placeholder="e.g., Weekly Groceries"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    value={newListName}
                    onChangeText={setNewListName}
                    autoFocus
                  />

                  <Text style={styles.modalLabel}>List Type</Text>
                  <View style={styles.modalTypeSelector}>
                    <TouchableOpacity
                      style={[
                        styles.modalTypeOption,
                        newListType === 'grocery' && styles.modalTypeOptionSelected,
                      ]}
                      onPress={() => setNewListType('grocery')}
                    >
                      <Ionicons
                        name="cart"
                        size={24}
                        color={newListType === 'grocery' ? '#3B82F6' : 'rgba(255,255,255,0.5)'}
                      />
                      <Text
                        style={[
                          styles.modalTypeText,
                          newListType === 'grocery' && styles.modalTypeTextSelected,
                        ]}
                      >
                        Grocery
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.modalTypeOption,
                        newListType === 'hardware' && styles.modalTypeOptionSelected,
                      ]}
                      onPress={() => setNewListType('hardware')}
                    >
                      <Ionicons
                        name="hammer"
                        size={24}
                        color={newListType === 'hardware' ? '#10B981' : 'rgba(255,255,255,0.5)'}
                      />
                      <Text
                        style={[
                          styles.modalTypeText,
                          newListType === 'hardware' && styles.modalTypeTextSelected,
                        ]}
                      >
                        Hardware
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.modalButtons}>
                    <TouchableOpacity
                      style={styles.modalCancelButton}
                      onPress={() => {
                        setShowCreateListModal(false);
                        setNewListName('');
                        setNewListType('grocery');
                      }}
                    >
                      <Text style={styles.modalCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.modalCreateButton,
                        !newListName.trim() && styles.modalCreateButtonDisabled,
                      ]}
                      onPress={handleCreateManualList}
                      disabled={!newListName.trim() || isCreatingManualList}
                    >
                      {isCreatingManualList ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <Text style={styles.modalCreateText}>Create</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    );
  };

  // ============================================
  // MAIN RENDER
  // ============================================
  switch (mode) {
    case 'listOverview':
      return renderListOverview();
    case 'listDetail':
      return renderListsView();
    case 'scanType':
      return renderScanTypeSelector();
    case 'scanning':
      return renderCameraView();
    case 'analyzing':
      return renderAnalyzingView();
    case 'results':
      return renderScanResults();
    default:
      return renderListOverview();
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
  // Hero gradient styles (matching MainHomeScreen)
  heroGradient: {
    paddingBottom: 90,
    position: 'relative',
    overflow: 'hidden',
  },
  heroWatermark: {
    position: 'absolute',
    top: 20,
    right: -270,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroControls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  heroBackButton: {
    padding: 8,
  },
  heroTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
  },
  heroActions: {
    flexDirection: 'row',
    gap: 8,
  },
  heroAction: {
    padding: 8,
  },
  // Legacy header styles (keeping for compatibility)
  headerGradient: {
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  headerWatermark: {
    position: 'absolute',
    top: -30,
    right: -180,
    opacity: 1,
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

  // Multi-image capture styles
  photoCountBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoCountText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  thumbnailStrip: {
    position: 'absolute',
    top: 100,
    left: 0,
    right: 0,
    height: 80,
  },
  thumbnailContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  thumbnailContainer: {
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 30,
  },
  cancelScanButtonSide: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  doneButton: {
    borderRadius: 25,
    overflow: 'hidden',
  },
  doneButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  doneButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Analyzing styles
  analyzingContainer: {
    flex: 1,
  },
  analyzingImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.3,
  },
  analyzingImageGrid: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    flexWrap: 'wrap',
    opacity: 0.3,
  },
  analyzingImageGridItem: {
    width: '50%',
    height: '50%',
  },
  analyzingOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  analyzingCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 24,
    paddingHorizontal: 40,
    paddingTop: 20,
    paddingBottom: 32,
    alignItems: 'center',
  },
  analyzingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: -20,
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
  inventoryItemUnknown: {
    borderWidth: 1,
    borderColor: 'rgba(156, 163, 175, 0.3)',
    borderStyle: 'dashed',
  },
  unknownQuantityIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(156, 163, 175, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
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

  // Add item with priority selector
  addItemWrapper: {
    marginTop: 8,
  },
  prioritySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  prioritySelectorLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginRight: 4,
  },
  priorityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  priorityOptionActive: {
    borderWidth: 1.5,
  },
  priorityOptionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  priorityOptionText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
  },

  // Edit item styles
  itemRowEditing: {
    borderWidth: 1,
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  editItemInput: {
    flex: 1,
    fontSize: 16,
    color: '#ffffff',
    paddingVertical: 0,
    marginRight: 8,
  },
  editSaveButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editCancelButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
  },
  editItemButton: {
    padding: 4,
    marginLeft: 8,
  },

  // Scan results - add to list button
  resultsSectionSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  addToListButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  addedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  addedBadgeText: {
    fontSize: 12,
    color: '#22C55E',
    fontWeight: '500',
  },

  // Voice input button
  voiceInputButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  voiceInputButtonActive: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },

  // List Cards Overview styles
  listCardsScrollView: {
    flex: 1,
  },
  listCardsContent: {
    padding: 20,
  },
  listCardsHeader: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 16,
    textAlign: 'center',
  },
  listCard: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  listCardGradient: {
    padding: 16,
  },
  listCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  listCardInfo: {
    flex: 1,
  },
  listCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  listCardSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  listCardProgress: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listCardProgressBar: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  listCardProgressFill: {
    height: '100%',
    backgroundColor: '#22C55E',
    borderRadius: 3,
  },
  listCardProgressText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    minWidth: 80,
  },
  listCardSource: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 10,
    fontStyle: 'italic',
  },

  // Empty state buttons
  emptyStateButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  emptyStateCreateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  emptyStateCreateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
  },

  // Create List Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    maxWidth: 360,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalGradient: {
    padding: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 24,
    textAlign: 'center',
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    marginBottom: 20,
  },
  modalTypeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  modalTypeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalTypeOptionSelected: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderColor: 'rgba(59, 130, 246, 0.4)',
  },
  modalTypeText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  modalTypeTextSelected: {
    color: '#ffffff',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  modalCreateButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#3B82F6',
    alignItems: 'center',
  },
  modalCreateButtonDisabled: {
    opacity: 0.5,
  },
  modalCreateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
