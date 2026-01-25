/**
 * ZoneSetup Component
 *
 * Manages zones for a guest kit - allows adding zones,
 * capturing 360° scans, and recording pathways.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  GuestKitZone,
  ZoneType,
  ZONE_TYPES,
  ZoneImage,
  PathwayImage,
} from '../services/api';
import GuidedZoneScan from './GuidedZoneScan';
import PathwayCapture from './PathwayCapture';

export interface ZoneSetupProps {
  zones: GuestKitZone[];
  onZonesChange: (zones: GuestKitZone[]) => void;
  kitId?: string; // If kit already exists
}

// Predefined zone suggestions based on common safety item locations
const SUGGESTED_ZONES: { type: ZoneType; name: string; items: string[] }[] = [
  { type: 'basement', name: 'Basement', items: ['Water Shutoff', 'Electrical Panel', 'Water Heater'] },
  { type: 'garage', name: 'Garage', items: ['Fire Extinguisher', 'Circuit Breaker', 'Gas Shutoff'] },
  { type: 'utility_room', name: 'Utility Room', items: ['Furnace', 'Water Heater', 'HVAC Controls'] },
  { type: 'laundry', name: 'Laundry Room', items: ['Washer/Dryer', 'Water Shutoff'] },
  { type: 'outdoor', name: 'Outdoor/Yard', items: ['Pool Controls', 'Sprinkler Shutoff', 'Gas Meter'] },
];

export default function ZoneSetup({ zones, onZonesChange, kitId }: ZoneSetupProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showZoneScan, setShowZoneScan] = useState(false);
  const [showPathwayCapture, setShowPathwayCapture] = useState(false);
  const [activeZone, setActiveZone] = useState<GuestKitZone | null>(null);
  const [customZoneName, setCustomZoneName] = useState('');
  const [selectedType, setSelectedType] = useState<ZoneType | null>(null);

  const handleAddZone = (type: ZoneType, name?: string) => {
    const zoneName = name || ZONE_TYPES[type].name;

    // Check if zone already exists
    if (zones.some(z => z.name.toLowerCase() === zoneName.toLowerCase())) {
      Alert.alert('Zone Exists', `You already have a zone named "${zoneName}".`);
      return;
    }

    const newZone: GuestKitZone = {
      id: `temp-${Date.now()}`, // Temporary ID until saved
      kit_id: kitId || '',
      name: zoneName,
      zone_type: type,
      icon_name: ZONE_TYPES[type].icon,
      zone_images: [],
      zone_scan_complete: false,
      pathway_images: [],
      pathway_complete: false,
      display_order: zones.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    onZonesChange([...zones, newZone]);
    setShowAddModal(false);
    setCustomZoneName('');
    setSelectedType(null);

    // Start scanning the zone
    setActiveZone(newZone);
    setShowPathwayCapture(true);
  };

  const handleRemoveZone = (zoneId: string) => {
    Alert.alert(
      'Remove Zone',
      'Are you sure you want to remove this zone? Items assigned to it will need to be reassigned.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            onZonesChange(zones.filter(z => z.id !== zoneId));
          },
        },
      ]
    );
  };

  const handlePathwayComplete = (images: PathwayImage[]) => {
    if (!activeZone) return;

    const updatedZones = zones.map(z => {
      if (z.id === activeZone.id) {
        return {
          ...z,
          pathway_images: images,
          pathway_complete: images.length > 0,
        };
      }
      return z;
    });

    onZonesChange(updatedZones);
    setShowPathwayCapture(false);

    // Now start the zone scan
    setShowZoneScan(true);
  };

  const handleZoneScanComplete = (images: ZoneImage[]) => {
    if (!activeZone) return;

    const updatedZones = zones.map(z => {
      if (z.id === activeZone.id) {
        return {
          ...z,
          zone_images: images,
          zone_scan_complete: images.length === 4,
        };
      }
      return z;
    });

    onZonesChange(updatedZones);
    setShowZoneScan(false);
    setActiveZone(null);
  };

  const handleStartScan = (zone: GuestKitZone) => {
    setActiveZone(zone);
    if (!zone.pathway_complete) {
      setShowPathwayCapture(true);
    } else {
      setShowZoneScan(true);
    }
  };

  const getZoneStatus = (zone: GuestKitZone) => {
    if (zone.zone_scan_complete && zone.pathway_complete) {
      return { status: 'complete', color: '#22c55e', label: 'Ready' };
    }
    if (zone.pathway_complete || zone.zone_scan_complete) {
      return { status: 'partial', color: '#f59e0b', label: 'Incomplete' };
    }
    return { status: 'pending', color: '#94a3b8', label: 'Not scanned' };
  };

  const usedTypes = zones.map(z => z.zone_type);
  const availableSuggestions = SUGGESTED_ZONES.filter(s => !usedTypes.includes(s.type));

  return (
    <View style={styles.container}>
      {/* Zone List */}
      {zones.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="map-outline" size={48} color="#cbd5e1" />
          <Text style={styles.emptyTitle}>No zones yet</Text>
          <Text style={styles.emptyText}>
            Add zones where your safety items are located (basement, garage, etc.)
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.zoneList}>
          {zones.map((zone) => {
            const status = getZoneStatus(zone);
            const zoneInfo = ZONE_TYPES[zone.zone_type as ZoneType];

            return (
              <View key={zone.id} style={styles.zoneCard}>
                <View style={styles.zoneHeader}>
                  <View style={[styles.zoneIcon, { backgroundColor: `${status.color}20` }]}>
                    <Ionicons
                      name={zoneInfo?.icon as any || 'location'}
                      size={24}
                      color={status.color}
                    />
                  </View>
                  <View style={styles.zoneInfo}>
                    <Text style={styles.zoneName}>{zone.name}</Text>
                    <View style={styles.statusRow}>
                      <View style={[styles.statusDot, { backgroundColor: status.color }]} />
                      <Text style={[styles.statusText, { color: status.color }]}>
                        {status.label}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveZone(zone.id)}
                  >
                    <Ionicons name="trash-outline" size={20} color="#94a3b8" />
                  </TouchableOpacity>
                </View>

                {/* Scan details */}
                <View style={styles.scanDetails}>
                  <View style={styles.scanItem}>
                    <Ionicons
                      name={zone.pathway_complete ? 'checkmark-circle' : 'ellipse-outline'}
                      size={18}
                      color={zone.pathway_complete ? '#22c55e' : '#cbd5e1'}
                    />
                    <Text style={styles.scanLabel}>
                      Pathway ({zone.pathway_images?.length || 0} waypoints)
                    </Text>
                  </View>
                  <View style={styles.scanItem}>
                    <Ionicons
                      name={zone.zone_scan_complete ? 'checkmark-circle' : 'ellipse-outline'}
                      size={18}
                      color={zone.zone_scan_complete ? '#22c55e' : '#cbd5e1'}
                    />
                    <Text style={styles.scanLabel}>
                      360° Scan ({zone.zone_images?.length || 0}/4 angles)
                    </Text>
                  </View>
                </View>

                {/* Action button */}
                <TouchableOpacity
                  style={[
                    styles.scanButton,
                    status.status === 'complete' && styles.rescanButton,
                  ]}
                  onPress={() => handleStartScan(zone)}
                >
                  <Ionicons
                    name={status.status === 'complete' ? 'refresh' : 'camera'}
                    size={18}
                    color={status.status === 'complete' ? '#64748b' : '#fff'}
                  />
                  <Text
                    style={[
                      styles.scanButtonText,
                      status.status === 'complete' && styles.rescanButtonText,
                    ]}
                  >
                    {status.status === 'complete' ? 'Rescan' : 'Start Scan'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Add Zone Button */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setShowAddModal(true)}
      >
        <Ionicons name="add-circle" size={24} color="#fff" />
        <Text style={styles.addButtonText}>Add Zone</Text>
      </TouchableOpacity>

      {/* Add Zone Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Zone</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowAddModal(false);
                  setCustomZoneName('');
                  setSelectedType(null);
                }}
              >
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSubtitle}>
              Select a zone where safety items are located
            </Text>

            <ScrollView style={styles.zoneOptions}>
              {/* Suggested zones */}
              {availableSuggestions.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Suggested</Text>
                  {availableSuggestions.map((suggestion) => {
                    const zoneInfo = ZONE_TYPES[suggestion.type];
                    return (
                      <TouchableOpacity
                        key={suggestion.type}
                        style={styles.zoneOption}
                        onPress={() => handleAddZone(suggestion.type)}
                      >
                        <View style={styles.zoneOptionIcon}>
                          <Ionicons
                            name={zoneInfo.icon as any}
                            size={24}
                            color="#2563eb"
                          />
                        </View>
                        <View style={styles.zoneOptionInfo}>
                          <Text style={styles.zoneOptionName}>{suggestion.name}</Text>
                          <Text style={styles.zoneOptionItems}>
                            Common: {suggestion.items.join(', ')}
                          </Text>
                        </View>
                        <Ionicons name="add" size={24} color="#2563eb" />
                      </TouchableOpacity>
                    );
                  })}
                </>
              )}

              {/* Custom zone */}
              <Text style={styles.sectionLabel}>Custom Zone</Text>
              <View style={styles.customZoneForm}>
                <TextInput
                  style={styles.customInput}
                  placeholder="Zone name (e.g., Pool House)"
                  value={customZoneName}
                  onChangeText={setCustomZoneName}
                />
                <View style={styles.typeSelector}>
                  {(Object.keys(ZONE_TYPES) as ZoneType[]).map((type) => {
                    const info = ZONE_TYPES[type];
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.typeChip,
                          selectedType === type && styles.typeChipActive,
                        ]}
                        onPress={() => setSelectedType(type)}
                      >
                        <Ionicons
                          name={info.icon as any}
                          size={16}
                          color={selectedType === type ? '#fff' : '#64748b'}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity
                  style={[
                    styles.addCustomButton,
                    (!customZoneName.trim() || !selectedType) && styles.addCustomButtonDisabled,
                  ]}
                  onPress={() => {
                    if (customZoneName.trim() && selectedType) {
                      handleAddZone(selectedType, customZoneName.trim());
                    }
                  }}
                  disabled={!customZoneName.trim() || !selectedType}
                >
                  <Text style={styles.addCustomText}>Add Custom Zone</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Pathway Capture Modal */}
      {activeZone && (
        <PathwayCapture
          zoneName={activeZone.name}
          visible={showPathwayCapture}
          existingImages={activeZone.pathway_images || []}
          onComplete={handlePathwayComplete}
          onCancel={() => {
            setShowPathwayCapture(false);
            setActiveZone(null);
          }}
        />
      )}

      {/* Zone Scan Modal */}
      {activeZone && (
        <GuidedZoneScan
          zoneName={activeZone.name}
          zoneType={activeZone.zone_type as ZoneType}
          visible={showZoneScan}
          onComplete={handleZoneScanComplete}
          onCancel={() => {
            setShowZoneScan(false);
            setActiveZone(null);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
  },
  zoneList: {
    flex: 1,
  },
  zoneCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  zoneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  zoneIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoneInfo: {
    flex: 1,
    marginLeft: 12,
  },
  zoneName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
  },
  removeButton: {
    padding: 8,
  },
  scanDetails: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    gap: 8,
  },
  scanItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scanLabel: {
    fontSize: 14,
    color: '#64748b',
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  rescanButton: {
    backgroundColor: '#f1f5f9',
  },
  rescanButtonText: {
    color: '#64748b',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  zoneOptions: {
    padding: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginTop: 8,
  },
  zoneOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    marginBottom: 8,
  },
  zoneOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#dbeafe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoneOptionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  zoneOptionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  zoneOptionItems: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  customZoneForm: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    marginBottom: 40,
  },
  customInput: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  typeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  typeChip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  typeChipActive: {
    backgroundColor: '#2563eb',
  },
  addCustomButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  addCustomButtonDisabled: {
    backgroundColor: '#cbd5e1',
  },
  addCustomText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
