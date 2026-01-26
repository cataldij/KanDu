/**
 * GuestModeSetupScreen - Create or edit a guest kit
 *
 * Multi-step setup flow for creating home guides
 */

import React, { useState, useEffect, useRef } from 'react';
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
  createGuestKit,
  updateGuestKit,
  getGuestKit,
  listGuestKits,
  getGuestKitZones,
  createGuestKitZone,
  updateGuestKitZone,
  GuestKit,
  HomeBaseImage,
  GuestKitZone,
  ZoneImage,
  PathwayImage,
} from '../services/api';
import { supabase } from '../services/supabase';
import GuidedKitchenScan, { KitchenImage } from '../components/GuidedKitchenScan';
import ZoneSetup from '../components/ZoneSetup';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type KitType = 'home' | 'rental';

interface SetupData {
  display_name: string;
  kit_type: KitType;
  homeowner_name: string;
  homeowner_phone: string;
  show_phone_to_guest: boolean;
  home_base_image_url?: string; // Legacy single image
  home_base_images: KitchenImage[]; // Multi-angle kitchen scan
  home_base_scan_complete: boolean;
  home_base_description: string;
  wifi_network: string;
  wifi_password: string;
  address: string;
  show_address: boolean;
  checkin_instructions: string;
  checkout_instructions: string;
  house_rules: string;
  access_pin: string;
  expires_at?: string;
}

const STEPS = ['Basics', 'Home Base', 'Zones', 'Contact', 'Extras', 'Review'];

/**
 * Upload a local image URI to Supabase Storage and return the public URL
 */
async function uploadImageToStorage(
  localUri: string,
  folder: string,
  filename: string
): Promise<string> {
  // If already a public URL, return as-is
  if (localUri.startsWith('http://') || localUri.startsWith('https://')) {
    return localUri;
  }

  const response = await fetch(localUri);
  const blob = await response.blob();

  const filePath = `${folder}/${filename}`;

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

  return urlData.publicUrl;
}

export default function GuestModeSetupScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const { kitId, editMode } = route.params || {};

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(editMode);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showGuidedScan, setShowGuidedScan] = useState(false);
  const [zones, setZones] = useState<GuestKitZone[]>([]);

  const [data, setData] = useState<SetupData>({
    display_name: '',
    kit_type: 'home',
    homeowner_name: '',
    homeowner_phone: '',
    show_phone_to_guest: true,
    home_base_image_url: undefined,
    home_base_images: [],
    home_base_scan_complete: false,
    home_base_description: 'Kitchen',
    wifi_network: '',
    wifi_password: '',
    address: '',
    show_address: false,
    checkin_instructions: '',
    checkout_instructions: '',
    house_rules: '',
    access_pin: '',
    expires_at: undefined,
  });

  useEffect(() => {
    if (editMode && kitId) {
      loadExistingKit();
    } else {
      // Pre-populate from most recent kit for faster setup
      prefillFromExistingKit();
    }
  }, [editMode, kitId]);

  const prefillFromExistingKit = async () => {
    try {
      const result = await listGuestKits();
      if (result.data?.kits && result.data.kits.length > 0) {
        // Use the most recent kit to pre-fill property-level fields
        const latestKit = result.data.kits[0];
        setData((prev) => ({
          ...prev,
          // Pre-fill contact info
          homeowner_name: latestKit.homeowner_name || '',
          homeowner_phone: latestKit.homeowner_phone || '',
          show_phone_to_guest: latestKit.show_phone_to_guest ?? true,
          // Pre-fill property info
          wifi_network: latestKit.wifi_network || '',
          wifi_password: latestKit.wifi_password || '',
          address: latestKit.address || '',
          show_address: latestKit.show_address ?? false,
          // Pre-fill rental-specific info
          checkin_instructions: latestKit.checkin_instructions || '',
          checkout_instructions: latestKit.checkout_instructions || '',
          house_rules: latestKit.house_rules || '',
          // REUSE the kitchen scan - it's the same kitchen!
          home_base_images: (latestKit.home_base_images as KitchenImage[]) || [],
          home_base_scan_complete: latestKit.home_base_scan_complete ?? false,
          home_base_description: latestKit.home_base_description || 'Kitchen',
        }));
      }
    } catch (err) {
      console.log('No existing kits to prefill from:', err);
    }
  };

  const loadExistingKit = async () => {
    setLoading(true);
    const result = await getGuestKit(kitId);
    if (result.error) {
      Alert.alert('Error', result.error);
      navigation.goBack();
    } else if (result.data) {
      const kit = result.data.kit;
      setData({
        display_name: kit.display_name || '',
        kit_type: kit.kit_type || 'home',
        homeowner_name: kit.homeowner_name || '',
        homeowner_phone: kit.homeowner_phone || '',
        show_phone_to_guest: kit.show_phone_to_guest ?? true,
        home_base_image_url: kit.home_base_image_url || undefined,
        home_base_images: (kit.home_base_images as KitchenImage[]) || [],
        home_base_scan_complete: kit.home_base_scan_complete ?? false,
        home_base_description: kit.home_base_description || 'Kitchen',
        wifi_network: kit.wifi_network || '',
        wifi_password: kit.wifi_password || '',
        address: kit.address || '',
        show_address: kit.show_address ?? false,
        checkin_instructions: kit.checkin_instructions || '',
        checkout_instructions: kit.checkout_instructions || '',
        house_rules: kit.house_rules || '',
        access_pin: kit.access_pin || '',
        expires_at: kit.expires_at || undefined,
      });

      // Load zones for this kit
      const zonesResult = await getGuestKitZones(kitId);
      if (zonesResult.data?.zones) {
        setZones(zonesResult.data.zones);
      }
    }
    setLoading(false);
  };

  const updateData = (field: keyof SetupData, value: any) => {
    setData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadImage(result.assets[0].uri);
    }
  };

  const handleTakePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your camera.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      await uploadImage(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri: string) => {
    setUploadingImage(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();

      const fileName = `home-base-${Date.now()}.jpg`;
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

      updateData('home_base_image_url', urlData.publicUrl);
    } catch (err) {
      console.error('Upload error:', err);
      Alert.alert('Upload Failed', 'Could not upload the image. Please try again.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleNext = () => {
    // Validate current step
    if (currentStep === 0) {
      if (!data.display_name.trim()) {
        Alert.alert('Required', 'Please enter a name for your home guide.');
        return;
      }
    }

    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    } else {
      navigation.goBack();
    }
  };

  const handleSave = async () => {
    if (!data.display_name.trim()) {
      Alert.alert('Required', 'Please enter a name for your home guide.');
      setCurrentStep(0);
      return;
    }

    setSaving(true);
    try {
      // Generate a unique folder for this kit
      const kitFolder = `guest-kits/${Date.now()}`;

      // Upload kitchen scan images to storage
      const uploadedKitchenImages: KitchenImage[] = [];
      for (const img of data.home_base_images) {
        try {
          const publicUrl = await uploadImageToStorage(
            img.url,
            kitFolder,
            `kitchen-${img.angle}.jpg`
          );
          uploadedKitchenImages.push({
            ...img,
            url: publicUrl,
          });
        } catch (err) {
          console.error(`Failed to upload kitchen ${img.angle} image:`, err);
          // Keep original URL on failure
          uploadedKitchenImages.push(img);
        }
      }

      // Prepare kit data with uploaded images
      const kitData = {
        ...data,
        home_base_images: uploadedKitchenImages,
      };

      let savedKitId: string;

      if (editMode && kitId) {
        const result = await updateGuestKit(kitId, kitData);
        if (result.error) {
          Alert.alert('Error', result.error);
          setSaving(false);
          return;
        }
        savedKitId = kitId;
      } else {
        const result = await createGuestKit(kitData);
        if (result.error) {
          Alert.alert('Error', result.error);
          setSaving(false);
          return;
        }
        if (!result.data?.kit?.id) {
          Alert.alert('Error', 'Failed to create guide');
          setSaving(false);
          return;
        }
        savedKitId = result.data.kit.id;
      }

      // Save zones with uploaded images
      for (const zone of zones) {
        const isTemporaryZone = zone.id.startsWith('temp-');
        const zoneFolder = `${kitFolder}/zone-${zone.name.toLowerCase().replace(/\s+/g, '-')}`;

        // Upload zone images
        const uploadedZoneImages: ZoneImage[] = [];
        for (const img of zone.zone_images || []) {
          try {
            const publicUrl = await uploadImageToStorage(
              img.url,
              zoneFolder,
              `zone-${img.angle}.jpg`
            );
            uploadedZoneImages.push({ ...img, url: publicUrl });
          } catch (err) {
            console.error(`Failed to upload zone ${img.angle} image:`, err);
            uploadedZoneImages.push(img);
          }
        }

        // Upload pathway images
        const uploadedPathwayImages: PathwayImage[] = [];
        for (const img of zone.pathway_images || []) {
          try {
            const publicUrl = await uploadImageToStorage(
              img.url,
              zoneFolder,
              `pathway-${img.sequence}.jpg`
            );
            uploadedPathwayImages.push({ ...img, url: publicUrl });
          } catch (err) {
            console.error(`Failed to upload pathway ${img.sequence} image:`, err);
            uploadedPathwayImages.push(img);
          }
        }

        const zoneData = {
          ...zone,
          kit_id: savedKitId,
          zone_images: uploadedZoneImages,
          pathway_images: uploadedPathwayImages,
        };

        if (isTemporaryZone) {
          // Create new zone
          const { id, ...zoneWithoutId } = zoneData;
          const result = await createGuestKitZone(zoneWithoutId);
          if (result.error) {
            console.error('Failed to create zone:', result.error);
          }
        } else {
          // Update existing zone
          const result = await updateGuestKitZone(zone.id, {
            zone_images: uploadedZoneImages,
            pathway_images: uploadedPathwayImages,
            zone_scan_complete: zoneData.zone_scan_complete,
            pathway_complete: zoneData.pathway_complete,
          });
          if (result.error) {
            console.error('Failed to update zone:', result.error);
          }
        }
      }

      // Navigate to detail screen
      if (editMode) {
        navigation.navigate('GuestKitDetail', { kitId: savedKitId });
      } else {
        navigation.replace('GuestKitDetail', { kitId: savedKitId, isNew: true });
      }
    } catch (err) {
      console.error('Save error:', err);
      Alert.alert('Error', 'Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderStepIndicator = () => (
    <View style={styles.stepIndicator}>
      {STEPS.map((step, index) => (
        <React.Fragment key={step}>
          <TouchableOpacity
            style={[
              styles.stepDot,
              index === currentStep && styles.stepDotActive,
              index < currentStep && styles.stepDotCompleted,
            ]}
            onPress={() => index < currentStep && setCurrentStep(index)}
          >
            {index < currentStep ? (
              <Ionicons name="checkmark" size={14} color="#fff" />
            ) : (
              <Text
                style={[
                  styles.stepNumber,
                  index === currentStep && styles.stepNumberActive,
                ]}
              >
                {index + 1}
              </Text>
            )}
          </TouchableOpacity>
          {index < STEPS.length - 1 && (
            <View
              style={[
                styles.stepLine,
                index < currentStep && styles.stepLineCompleted,
              ]}
            />
          )}
        </React.Fragment>
      ))}
    </View>
  );

  const renderBasicsStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Let's get started!</Text>
      <Text style={styles.stepDescription}>
        Give your home guide a name and choose the type.
      </Text>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Guide Name</Text>
        <TextInput
          style={styles.textInput}
          value={data.display_name}
          onChangeText={(text) => updateData('display_name', text)}
          placeholder="e.g., The Smith Home"
          placeholderTextColor="#94a3b8"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Guide Type</Text>
        <View style={styles.typeSelector}>
          <TouchableOpacity
            style={[
              styles.typeOption,
              data.kit_type === 'home' && styles.typeOptionSelected,
            ]}
            onPress={() => updateData('kit_type', 'home')}
          >
            <LinearGradient
              colors={
                data.kit_type === 'home'
                  ? ['#4FA3FF', '#3AD7C3']
                  : ['#f1f5f9', '#f1f5f9']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.typeOptionGradient}
            >
              <Ionicons
                name="home"
                size={32}
                color={data.kit_type === 'home' ? '#fff' : '#64748b'}
              />
              <Text
                style={[
                  styles.typeOptionText,
                  data.kit_type === 'home' && styles.typeOptionTextSelected,
                ]}
              >
                Home
              </Text>
              <Text
                style={[
                  styles.typeOptionSubtext,
                  data.kit_type === 'home' && styles.typeOptionSubtextSelected,
                ]}
              >
                For babysitters & guests
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.typeOption,
              data.kit_type === 'rental' && styles.typeOptionSelected,
            ]}
            onPress={() => updateData('kit_type', 'rental')}
          >
            <LinearGradient
              colors={
                data.kit_type === 'rental'
                  ? ['#FF8B5E', '#FFB84D']
                  : ['#f1f5f9', '#f1f5f9']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.typeOptionGradient}
            >
              <Ionicons
                name="bed"
                size={32}
                color={data.kit_type === 'rental' ? '#fff' : '#64748b'}
              />
              <Text
                style={[
                  styles.typeOptionText,
                  data.kit_type === 'rental' && styles.typeOptionTextSelected,
                ]}
              >
                Rental
              </Text>
              <Text
                style={[
                  styles.typeOptionSubtext,
                  data.kit_type === 'rental' && styles.typeOptionSubtextSelected,
                ]}
              >
                For Airbnb & VRBO
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const handleGuidedScanComplete = (images: KitchenImage[]) => {
    console.log('[GuestModeSetup] Received images from scan:', images.length);
    images.forEach((img, i) => {
      console.log(`  [${i}] ${img.angle}: ${img.url?.substring(0, 80)}`);
    });
    setData((prev) => ({
      ...prev,
      home_base_images: images,
      home_base_scan_complete: images.length >= 4,
    }));
    setShowGuidedScan(false);
  };

  const renderHomeBaseStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Scan Your Kitchen</Text>
      <Text style={styles.stepDescription}>
        We'll guide you through capturing your kitchen from multiple angles.
        This helps guests navigate your home accurately.
      </Text>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Starting Location Name</Text>
        <TextInput
          style={styles.textInput}
          value={data.home_base_description}
          onChangeText={(text) => updateData('home_base_description', text)}
          placeholder="e.g., Kitchen"
          placeholderTextColor="#94a3b8"
        />
      </View>

      {/* Show scan status or button */}
      {data.home_base_images.length > 0 ? (
        <View style={styles.scanCompleteContainer}>
          <View style={styles.scanCompleteHeader}>
            <Ionicons
              name={data.home_base_scan_complete ? 'checkmark-circle' : 'alert-circle'}
              size={24}
              color={data.home_base_scan_complete ? '#10b981' : '#f59e0b'}
            />
            <Text style={styles.scanCompleteTitle}>
              {data.home_base_scan_complete
                ? 'Kitchen Scan Complete!'
                : `${data.home_base_images.length} of 4 angles captured`}
            </Text>
          </View>

          {/* Preview grid of captured images */}
          <View style={styles.scanPreviewGrid}>
            {data.home_base_images.slice(0, 4).map((img, idx) => {
              console.log(`[Preview] Image ${idx}: ${img.angle} - ${img.url?.substring(0, 50)}...`);
              return (
                <View key={idx} style={styles.scanPreviewItem}>
                  {/* Placeholder background */}
                  <View style={styles.scanPreviewPlaceholder}>
                    <Ionicons name="image-outline" size={32} color="#94a3b8" />
                    <Text style={styles.scanPreviewPlaceholderText}>Loading...</Text>
                  </View>
                  {/* Actual image */}
                  {img.url && (
                    <Image
                      source={{ uri: img.url }}
                      style={[styles.scanPreviewImage, { position: 'absolute', top: 0, left: 0 }]}
                      onError={(e) => console.error(`[Preview] Image load error for ${img.angle}:`, e.nativeEvent.error)}
                      onLoad={() => console.log(`[Preview] Image loaded: ${img.angle}`)}
                    />
                  )}
                  <View style={styles.scanPreviewLabelContainer}>
                    <Ionicons name="camera" size={12} color="#fff" />
                    <Text style={styles.scanPreviewLabelText}>{img.description || img.angle}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.rescanButton}
            onPress={() => setShowGuidedScan(true)}
          >
            <Ionicons name="refresh" size={20} color="#1E90FF" />
            <Text style={styles.rescanButtonText}>Rescan Kitchen</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.startScanButton}
          onPress={() => setShowGuidedScan(true)}
        >
          <LinearGradient
            colors={['#1E5AA8', '#3b82f6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.startScanButtonGradient}
          >
            <Ionicons name="scan" size={32} color="#fff" />
            <Text style={styles.startScanButtonTitle}>Start 360° Kitchen Scan</Text>
            <Text style={styles.startScanButtonSubtitle}>
              Takes about 30 seconds
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Info box */}
      <View style={styles.infoBox}>
        <Ionicons name="information-circle" size={20} color="#3b82f6" />
        <Text style={styles.infoBoxText}>
          The guided scan captures 5 angles of your kitchen so guests can
          orient themselves from any direction.
        </Text>
      </View>
    </View>
  );

  const renderContactStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Contact Information</Text>
      <Text style={styles.stepDescription}>
        Let guests know how to reach you if they need help.
      </Text>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Your Name</Text>
        <TextInput
          style={styles.textInput}
          value={data.homeowner_name}
          onChangeText={(text) => updateData('homeowner_name', text)}
          placeholder="e.g., John Smith"
          placeholderTextColor="#94a3b8"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>Phone Number</Text>
        <TextInput
          style={styles.textInput}
          value={data.homeowner_phone}
          onChangeText={(text) => updateData('homeowner_phone', text)}
          placeholder="e.g., (555) 123-4567"
          placeholderTextColor="#94a3b8"
          keyboardType="phone-pad"
        />
      </View>

      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => updateData('show_phone_to_guest', !data.show_phone_to_guest)}
      >
        <View
          style={[
            styles.checkbox,
            data.show_phone_to_guest && styles.checkboxChecked,
          ]}
        >
          {data.show_phone_to_guest && (
            <Ionicons name="checkmark" size={16} color="#fff" />
          )}
        </View>
        <Text style={styles.checkboxLabel}>Show phone number to guests</Text>
      </TouchableOpacity>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>PIN Protection (Optional)</Text>
        <TextInput
          style={styles.textInput}
          value={data.access_pin}
          onChangeText={(text) => updateData('access_pin', text.replace(/\D/g, '').slice(0, 4))}
          placeholder="4-digit PIN"
          placeholderTextColor="#94a3b8"
          keyboardType="number-pad"
          maxLength={4}
        />
        <Text style={styles.inputHint}>
          Add a PIN for extra security. You'll share it separately.
        </Text>
      </View>
    </View>
  );

  const renderExtrasStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>
        {data.kit_type === 'rental' ? 'Rental Details' : 'Additional Info'}
      </Text>
      <Text style={styles.stepDescription}>
        {data.kit_type === 'rental'
          ? 'Help your guests have a great stay.'
          : 'Add any extra details for your guests.'}
      </Text>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>WiFi Network</Text>
        <TextInput
          style={styles.textInput}
          value={data.wifi_network}
          onChangeText={(text) => updateData('wifi_network', text)}
          placeholder="Network name"
          placeholderTextColor="#94a3b8"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>WiFi Password</Text>
        <TextInput
          style={styles.textInput}
          value={data.wifi_password}
          onChangeText={(text) => updateData('wifi_password', text)}
          placeholder="Password"
          placeholderTextColor="#94a3b8"
        />
      </View>

      {data.kit_type === 'rental' && (
        <>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Check-in Instructions</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={data.checkin_instructions}
              onChangeText={(text) => updateData('checkin_instructions', text)}
              placeholder="e.g., Check-in is at 3 PM. The lockbox code is..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Check-out Instructions</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={data.checkout_instructions}
              onChangeText={(text) => updateData('checkout_instructions', text)}
              placeholder="e.g., Please check out by 11 AM. Leave keys on..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>House Rules</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              value={data.house_rules}
              onChangeText={(text) => updateData('house_rules', text)}
              placeholder="e.g., No smoking. Quiet hours after 10 PM..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={3}
            />
          </View>
        </>
      )}
    </View>
  );

  const renderReviewStep = () => (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>Review Your Guide</Text>
      <Text style={styles.stepDescription}>
        Make sure everything looks good before saving.
      </Text>

      <View style={styles.reviewCard}>
        <LinearGradient
          colors={
            data.kit_type === 'rental'
              ? ['#FF8B5E', '#FFB84D']
              : ['#4FA3FF', '#3AD7C3']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.reviewCardGradient}
        >
          <View style={styles.reviewCardContent}>
            <Text style={styles.reviewCardTitle}>{data.display_name || 'Untitled'}</Text>
            <Text style={styles.reviewCardType}>
              {data.kit_type === 'rental' ? 'Rental Property' : 'Home'}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.reviewDetails}>
          <View style={styles.reviewRow}>
            <Ionicons name="location-outline" size={20} color="#64748b" />
            <Text style={styles.reviewLabel}>Home Base:</Text>
            <Text style={styles.reviewValue}>{data.home_base_description}</Text>
          </View>

          <View style={styles.reviewRow}>
            <Ionicons name="person-outline" size={20} color="#64748b" />
            <Text style={styles.reviewLabel}>Contact:</Text>
            <Text style={styles.reviewValue}>
              {data.homeowner_name || 'Not set'}
            </Text>
          </View>

          {data.wifi_network && (
            <View style={styles.reviewRow}>
              <Ionicons name="wifi-outline" size={20} color="#64748b" />
              <Text style={styles.reviewLabel}>WiFi:</Text>
              <Text style={styles.reviewValue}>{data.wifi_network}</Text>
            </View>
          )}

          {data.access_pin && (
            <View style={styles.reviewRow}>
              <Ionicons name="lock-closed-outline" size={20} color="#64748b" />
              <Text style={styles.reviewLabel}>PIN Protected:</Text>
              <Text style={styles.reviewValue}>Yes (****)</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.nextStepsInfo}>
        <Ionicons name="information-circle-outline" size={24} color="#1E90FF" />
        <Text style={styles.nextStepsText}>
          After saving, you'll be able to add safety items like water shutoffs,
          fire extinguishers, and more.
        </Text>
      </View>
    </View>
  );

  const renderZonesStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Add Zones</Text>
      <Text style={styles.stepDescription}>
        Add zones where your safety items are located (basement, garage, etc.).
        Items in the same zone will share the same navigation path.
      </Text>

      <ZoneSetup
        zones={zones}
        onZonesChange={setZones}
        kitId={kitId}
      />
    </View>
  );

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0:
        return renderBasicsStep();
      case 1:
        return renderHomeBaseStep();
      case 2:
        return renderZonesStep();
      case 3:
        return renderContactStep();
      case 4:
        return renderExtrasStep();
      case 5:
        return renderReviewStep();
      default:
        return null;
    }
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
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {editMode ? 'Edit Guide' : 'Create Guide'}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {renderStepIndicator()}

        <Text style={styles.stepLabel}>{STEPS[currentStep]}</Text>
      </LinearGradient>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {renderCurrentStep()}
      </ScrollView>

      {/* Bottom buttons */}
      <View style={[styles.bottomButtons, { paddingBottom: insets.bottom + 16 }]}>
        {currentStep < STEPS.length - 1 ? (
          <TouchableOpacity
            style={styles.nextButton}
            onPress={handleNext}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#1E90FF', '#00CBA9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.nextButtonGradient}
            >
              <Text style={styles.nextButtonText}>Continue</Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.nextButton}
            onPress={handleSave}
            activeOpacity={0.8}
            disabled={saving}
          >
            <LinearGradient
              colors={['#10b981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.nextButtonGradient}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.nextButtonText}>
                    {editMode ? 'Save Changes' : 'Create Guide'}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>

      {/* Guided Kitchen Scan Modal */}
      <GuidedKitchenScan
        visible={showGuidedScan}
        onComplete={handleGuidedScanComplete}
        onCancel={() => setShowGuidedScan(false)}
        existingImages={data.home_base_images}
      />
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
    paddingBottom: 24,
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
    marginBottom: 20,
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
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: '#fff',
  },
  stepDotCompleted: {
    backgroundColor: '#10b981',
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.7)',
  },
  stepNumberActive: {
    color: '#1E90FF',
  },
  stepLine: {
    width: 30,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 4,
  },
  stepLineCompleted: {
    backgroundColor: '#10b981',
  },
  stepLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  stepContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 16,
    color: '#64748b',
    lineHeight: 24,
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
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
    minHeight: 100,
    textAlignVertical: 'top',
  },
  inputHint: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 6,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  typeOption: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
  },
  typeOptionSelected: {
    // Shadow handled by gradient
  },
  typeOptionGradient: {
    padding: 20,
    alignItems: 'center',
    borderRadius: 16,
  },
  typeOptionText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 12,
  },
  typeOptionTextSelected: {
    color: '#fff',
  },
  typeOptionSubtext: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 4,
  },
  typeOptionSubtextSelected: {
    color: 'rgba(255,255,255,0.8)',
  },
  imagePreviewContainer: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
  },
  imagePreview: {
    width: '100%',
    height: 180,
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
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePickerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E90FF',
    marginTop: 8,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#1E90FF',
    borderColor: '#1E90FF',
  },
  checkboxLabel: {
    fontSize: 16,
    color: '#1e293b',
  },
  reviewCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
  },
  reviewCardGradient: {
    padding: 20,
  },
  reviewCardContent: {
    // Content styling
  },
  reviewCardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  reviewCardType: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  reviewDetails: {
    backgroundColor: '#fff',
    padding: 16,
    gap: 12,
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewLabel: {
    fontSize: 14,
    color: '#64748b',
    marginLeft: 8,
    marginRight: 4,
  },
  reviewValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  nextStepsInfo: {
    flexDirection: 'row',
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'flex-start',
    gap: 12,
  },
  nextStepsText: {
    flex: 1,
    fontSize: 14,
    color: '#1e293b',
    lineHeight: 20,
  },
  bottomButtons: {
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: '#D4E8ED',
  },
  nextButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  nextButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    gap: 8,
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  // Guided Kitchen Scan styles
  scanCompleteContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  scanCompleteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  scanCompleteTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  scanPreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  scanPreviewItem: {
    width: (SCREEN_WIDTH - 80) / 2,
    height: 120,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
    borderWidth: 2,
    borderColor: '#cbd5e1',
  },
  scanPreviewImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  scanPreviewLabelContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 6,
  },
  scanPreviewLabelText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  scanPreviewPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
  },
  scanPreviewPlaceholderText: {
    marginTop: 4,
    fontSize: 10,
    color: '#94a3b8',
  },
  scanPreviewLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 2,
  },
  rescanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  rescanButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E90FF',
  },
  startScanButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  startScanButtonGradient: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  startScanButtonTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginTop: 12,
  },
  startScanButtonSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 12,
    gap: 10,
    alignItems: 'flex-start',
  },
  infoBoxText: {
    flex: 1,
    fontSize: 13,
    color: '#1e293b',
    lineHeight: 18,
  },
});
