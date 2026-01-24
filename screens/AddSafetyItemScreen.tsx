/**
 * AddSafetyItemScreen - Add or edit a safety item in a guest kit
 *
 * Allows selecting item type, adding photos, and instructions
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import Svg, { Path } from 'react-native-svg';

import {
  addGuestKitItem,
  updateGuestKitItem,
  getGuestKit,
  GuestKitItem,
  GuestKitItemType,
} from '../services/api';
import { supabase } from '../services/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Item categories with their types
const ITEM_CATEGORIES = {
  safety: {
    title: '🚨 Safety & Emergency',
    items: [
      { type: 'water_shutoff', name: 'Water Shutoff', icon: 'water' },
      { type: 'gas_shutoff', name: 'Gas Shutoff', icon: 'flame' },
      { type: 'electrical_panel', name: 'Electrical Panel', icon: 'flash' },
      { type: 'fire_extinguisher', name: 'Fire Extinguisher', icon: 'bonfire' },
      { type: 'first_aid', name: 'First Aid Kit', icon: 'medkit' },
      { type: 'emergency_exits', name: 'Emergency Exits', icon: 'exit' },
      { type: 'smoke_detector', name: 'Smoke Detector', icon: 'alert-circle' },
      { type: 'co_detector', name: 'CO Detector', icon: 'warning' },
    ],
  },
  utilities: {
    title: '🔧 Utilities',
    items: [
      { type: 'thermostat', name: 'Thermostat', icon: 'thermometer' },
      { type: 'water_heater', name: 'Water Heater', icon: 'water' },
      { type: 'furnace', name: 'Furnace', icon: 'flame' },
      { type: 'ac_unit', name: 'AC Unit', icon: 'snow' },
      { type: 'circuit_breaker', name: 'Circuit Breaker', icon: 'flash' },
    ],
  },
  appliances: {
    title: '🏠 Appliances',
    items: [
      { type: 'washer_dryer', name: 'Washer & Dryer', icon: 'shirt' },
      { type: 'dishwasher', name: 'Dishwasher', icon: 'cafe' },
      { type: 'oven', name: 'Oven', icon: 'flame' },
      { type: 'garbage_disposal', name: 'Garbage Disposal', icon: 'trash' },
      { type: 'coffee_maker', name: 'Coffee Maker', icon: 'cafe' },
      { type: 'tv_remote', name: 'TV & Remote', icon: 'tv' },
    ],
  },
  info: {
    title: '📋 Information',
    items: [
      { type: 'wifi_router', name: 'WiFi Router', icon: 'wifi' },
      { type: 'garage_door', name: 'Garage Door', icon: 'car' },
      { type: 'door_locks', name: 'Door Locks', icon: 'key' },
      { type: 'trash_recycling', name: 'Trash & Recycling', icon: 'trash-bin' },
      { type: 'pool_controls', name: 'Pool Controls', icon: 'water' },
      { type: 'hot_tub', name: 'Hot Tub', icon: 'water' },
      { type: 'custom', name: 'Custom Item', icon: 'add-circle' },
    ],
  },
};

// Priority options
const PRIORITIES = [
  { value: 'critical', label: 'Critical', color: '#ef4444', description: 'Emergency items' },
  { value: 'important', label: 'Important', color: '#f59e0b', description: 'Should know' },
  { value: 'helpful', label: 'Helpful', color: '#10b981', description: 'Nice to have' },
];

interface FormData {
  item_type: string;
  custom_name: string;
  hint: string;
  overview_image_url?: string;
  destination_image_url?: string;
  control_image_url?: string;
  instructions: string;
  warning_text: string;
  route_description: string;
  priority: 'critical' | 'important' | 'helpful';
}

export default function AddSafetyItemScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { kitId, itemId, editMode } = route.params || {};

  const [step, setStep] = useState<'select' | 'details'>('select');
  const [loading, setLoading] = useState(editMode);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);

  const [data, setData] = useState<FormData>({
    item_type: '',
    custom_name: '',
    hint: '',
    overview_image_url: undefined,
    destination_image_url: undefined,
    control_image_url: undefined,
    instructions: '',
    warning_text: '',
    route_description: '',
    priority: 'important',
  });

  useEffect(() => {
    if (editMode && itemId) {
      loadExistingItem();
    }
  }, [editMode, itemId]);

  const loadExistingItem = async () => {
    setLoading(true);
    const result = await getGuestKit(kitId);
    if (result.error) {
      Alert.alert('Error', result.error);
      navigation.goBack();
    } else if (result.data) {
      const item = result.data.items.find((i) => i.id === itemId);
      if (item) {
        setData({
          item_type: item.item_type,
          custom_name: item.custom_name || '',
          hint: item.hint || '',
          overview_image_url: item.overview_image_url || undefined,
          destination_image_url: item.destination_image_url || undefined,
          control_image_url: item.control_image_url || undefined,
          instructions: item.instructions || '',
          warning_text: item.warning_text || '',
          route_description: item.route_description || '',
          priority: item.priority || 'important',
        });
        setStep('details');
      }
    }
    setLoading(false);
  };

  const updateData = (field: keyof FormData, value: any) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const getSelectedItemInfo = () => {
    for (const category of Object.values(ITEM_CATEGORIES)) {
      const item = category.items.find((i) => i.type === data.item_type);
      if (item) return item;
    }
    return null;
  };

  const handleSelectType = (type: string) => {
    updateData('item_type', type);
    setStep('details');
  };

  const handlePickImage = async (field: 'overview_image_url' | 'destination_image_url' | 'control_image_url') => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadImage(result.assets[0].uri, field);
    }
  };

  const handleTakePhoto = async (field: 'overview_image_url' | 'destination_image_url' | 'control_image_url') => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your camera.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadImage(result.assets[0].uri, field);
    }
  };

  const uploadImage = async (uri: string, field: 'overview_image_url' | 'destination_image_url' | 'control_image_url') => {
    setUploadingImage(field);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();

      const fileName = `item-${field}-${Date.now()}.jpg`;
      const filePath = `guest-kits/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, blob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from('images')
        .getPublicUrl(filePath);

      updateData(field, urlData.publicUrl);
    } catch (err) {
      console.error('Upload error:', err);
      Alert.alert('Upload Failed', 'Could not upload the image. Please try again.');
    } finally {
      setUploadingImage(null);
    }
  };

  const handleSave = async () => {
    if (!data.destination_image_url) {
      Alert.alert('Required', 'Please add at least a destination photo.');
      return;
    }

    setSaving(true);
    try {
      if (editMode && itemId) {
        const result = await updateGuestKitItem(itemId, data);
        if (result.error) {
          Alert.alert('Error', result.error);
        } else {
          navigation.goBack();
        }
      } else {
        const result = await addGuestKitItem({
          kit_id: kitId,
          ...data,
        });
        if (result.error) {
          Alert.alert('Error', result.error);
        } else {
          navigation.goBack();
        }
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderImagePicker = (
    field: 'overview_image_url' | 'destination_image_url' | 'control_image_url',
    label: string,
    description: string,
    required = false
  ) => {
    const imageUrl = data[field];
    const isUploading = uploadingImage === field;

    return (
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>
          {label} {required && <Text style={styles.required}>*</Text>}
        </Text>
        <Text style={styles.inputDescription}>{description}</Text>

        {imageUrl ? (
          <View style={styles.imagePreviewContainer}>
            <Image
              source={{ uri: imageUrl }}
              style={styles.imagePreview}
              resizeMode="cover"
            />
            <TouchableOpacity
              style={styles.removeImageButton}
              onPress={() => updateData(field, null)}
            >
              <Ionicons name="close-circle" size={28} color="#ef4444" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.imagePickerButtons}>
            <TouchableOpacity
              style={styles.imagePickerButton}
              onPress={() => handleTakePhoto(field)}
              disabled={isUploading}
            >
              {isUploading ? (
                <ActivityIndicator color="#1E90FF" />
              ) : (
                <>
                  <Ionicons name="camera-outline" size={28} color="#1E90FF" />
                  <Text style={styles.imagePickerButtonText}>Camera</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.imagePickerButton}
              onPress={() => handlePickImage(field)}
              disabled={isUploading}
            >
              <Ionicons name="images-outline" size={28} color="#1E90FF" />
              <Text style={styles.imagePickerButtonText}>Gallery</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderSelectStep = () => (
    <ScrollView
      style={styles.content}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.selectTitle}>What would you like to add?</Text>
      <Text style={styles.selectSubtitle}>
        Choose the type of item guests will need to find
      </Text>

      {Object.entries(ITEM_CATEGORIES).map(([categoryKey, category]) => (
        <View key={categoryKey} style={styles.categorySection}>
          <Text style={styles.categoryTitle}>{category.title}</Text>
          <View style={styles.itemGrid}>
            {category.items.map((item) => (
              <TouchableOpacity
                key={item.type}
                style={styles.itemTypeCard}
                onPress={() => handleSelectType(item.type)}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={
                    categoryKey === 'safety'
                      ? ['#ef4444', '#dc2626']
                      : categoryKey === 'utilities'
                      ? ['#f59e0b', '#d97706']
                      : categoryKey === 'appliances'
                      ? ['#6366f1', '#4f46e5']
                      : ['#10b981', '#059669']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.itemTypeIconContainer}
                >
                  <Ionicons name={item.icon as any} size={24} color="#fff" />
                </LinearGradient>
                <Text style={styles.itemTypeName}>{item.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );

  const renderDetailsStep = () => {
    const selectedItem = getSelectedItemInfo();

    return (
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.selectedItemHeader}>
          <LinearGradient
            colors={['#1E90FF', '#00CBA9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.selectedItemIcon}
          >
            <Ionicons
              name={(selectedItem?.icon || 'location') as any}
              size={28}
              color="#fff"
            />
          </LinearGradient>
          <View style={styles.selectedItemInfo}>
            <Text style={styles.selectedItemName}>
              {selectedItem?.name || 'Custom Item'}
            </Text>
            {!editMode && (
              <TouchableOpacity onPress={() => setStep('select')}>
                <Text style={styles.changeTypeLink}>Change type</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.formCard}>
          {/* Custom name for 'custom' type */}
          {data.item_type === 'custom' && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                Item Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.textInput}
                value={data.custom_name}
                onChangeText={(text) => updateData('custom_name', text)}
                placeholder="e.g., Tool Cabinet"
                placeholderTextColor="#94a3b8"
              />
            </View>
          )}

          {/* Location hint */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Location Hint</Text>
            <Text style={styles.inputDescription}>
              Help guests know where to look
            </Text>
            <TextInput
              style={styles.textInput}
              value={data.hint}
              onChangeText={(text) => updateData('hint', text)}
              placeholder="e.g., Under the kitchen sink, left side"
              placeholderTextColor="#94a3b8"
            />
          </View>

          {/* Photos */}
          {renderImagePicker(
            'destination_image_url',
            'Destination Photo',
            'Photo of the actual item',
            true
          )}

          {renderImagePicker(
            'control_image_url',
            'Control Close-up (Optional)',
            'Close-up of the valve, switch, or button'
          )}

          {renderImagePicker(
            'overview_image_url',
            'Area Overview (Optional)',
            'Wide shot showing the general location'
          )}

          {/* Instructions */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Instructions</Text>
            <Text style={styles.inputDescription}>
              What should the guest do when they find it?
            </Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={data.instructions}
              onChangeText={(text) => updateData('instructions', text)}
              placeholder="e.g., Turn the red valve clockwise until it stops"
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Warning */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Safety Warning (Optional)</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={data.warning_text}
              onChangeText={(text) => updateData('warning_text', text)}
              placeholder="e.g., If you smell gas, leave immediately and call 911"
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={2}
            />
          </View>

          {/* Route description */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>How to Get There (Optional)</Text>
            <Text style={styles.inputDescription}>
              Directions from the kitchen to this item
            </Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={data.route_description}
              onChangeText={(text) => updateData('route_description', text)}
              placeholder="e.g., From the kitchen, go through the white door and down the stairs. It's on the left wall."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Priority */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Priority Level</Text>
            <View style={styles.prioritySelector}>
              {PRIORITIES.map((priority) => (
                <TouchableOpacity
                  key={priority.value}
                  style={[
                    styles.priorityOption,
                    data.priority === priority.value && {
                      borderColor: priority.color,
                      backgroundColor: priority.color + '15',
                    },
                  ]}
                  onPress={() => updateData('priority', priority.value)}
                >
                  <View
                    style={[
                      styles.priorityDot,
                      { backgroundColor: priority.color },
                    ]}
                  />
                  <View style={styles.priorityInfo}>
                    <Text
                      style={[
                        styles.priorityLabel,
                        data.priority === priority.value && { color: priority.color },
                      ]}
                    >
                      {priority.label}
                    </Text>
                    <Text style={styles.priorityDescription}>
                      {priority.description}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
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

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <LinearGradient
        colors={['#0f172a', '#6A9BD6', '#D4E8ED']}
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
          <Svg width={400} height={200} viewBox="25 30 50 30">
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
            onPress={() => {
              if (step === 'details' && !editMode) {
                setStep('select');
              } else {
                navigation.goBack();
              }
            }}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {editMode ? 'Edit Item' : 'Add Safety Item'}
          </Text>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      {/* Content */}
      {step === 'select' ? renderSelectStep() : renderDetailsStep()}

      {/* Save button (only on details step) */}
      {step === 'details' && (
        <View style={[styles.bottomButtons, { paddingBottom: insets.bottom + 16 }]}>
          <TouchableOpacity
            style={styles.saveButton}
            onPress={handleSave}
            activeOpacity={0.8}
            disabled={saving}
          >
            <LinearGradient
              colors={['#10b981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.saveButtonGradient}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>
                    {editMode ? 'Save Changes' : 'Add Item'}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  headerCheckmark: {
    position: 'absolute',
    top: -30,
    right: -100,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  selectTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  selectSubtitle: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 24,
  },
  categorySection: {
    marginBottom: 24,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
  },
  itemGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  itemTypeCard: {
    width: (SCREEN_WIDTH - 64) / 3,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  itemTypeIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  itemTypeName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e293b',
    textAlign: 'center',
  },
  selectedItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    gap: 16,
  },
  selectedItemIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedItemInfo: {
    flex: 1,
  },
  selectedItemName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  changeTypeLink: {
    fontSize: 14,
    color: '#1E90FF',
    marginTop: 4,
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  required: {
    color: '#ef4444',
  },
  inputDescription: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1e293b',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  imagePreviewContainer: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: 160,
    borderRadius: 16,
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#fff',
    borderRadius: 14,
  },
  imagePickerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  imagePickerButton: {
    flex: 1,
    backgroundColor: '#f0f9ff',
    borderWidth: 2,
    borderColor: '#1E90FF',
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePickerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E90FF',
    marginTop: 6,
  },
  prioritySelector: {
    gap: 10,
  },
  priorityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  priorityDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  priorityInfo: {
    flex: 1,
  },
  priorityLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  priorityDescription: {
    fontSize: 12,
    color: '#64748b',
  },
  bottomButtons: {
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: '#D4E8ED',
  },
  saveButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  saveButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 8,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
});
