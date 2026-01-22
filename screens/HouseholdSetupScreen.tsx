/**
 * HouseholdSetupScreen - Manage household members and their dietary preferences
 * Users can add family members, set dietary restrictions, allergies, and preferences
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../services/supabase';
import { useAuth } from '../contexts/AuthContext';

// Types
interface DietaryPreference {
  id?: string;
  member_id?: string;
  preference_type: 'allergy' | 'intolerance' | 'diet' | 'dislike' | 'medical';
  name: string;
  severity?: 'mild' | 'moderate' | 'severe' | 'life-threatening';
  notes?: string;
}

interface HouseholdMember {
  id?: string;
  user_id?: string;
  name: string;
  relationship: string;
  age_group: string;
  is_primary: boolean;
  avatar_emoji: string;
  notes?: string;
  dietary_preferences?: DietaryPreference[];
}

// Constants
const RELATIONSHIPS = [
  { id: 'self', label: 'Me', emoji: '👤' },
  { id: 'spouse', label: 'Spouse/Partner', emoji: '💑' },
  { id: 'child', label: 'Child', emoji: '👶' },
  { id: 'parent', label: 'Parent', emoji: '👴' },
  { id: 'roommate', label: 'Roommate', emoji: '🏠' },
  { id: 'other', label: 'Other', emoji: '👥' },
];

const AGE_GROUPS = [
  { id: 'infant', label: 'Infant (0-1)', emoji: '👶' },
  { id: 'toddler', label: 'Toddler (1-3)', emoji: '🧒' },
  { id: 'child', label: 'Child (4-12)', emoji: '👦' },
  { id: 'teen', label: 'Teen (13-17)', emoji: '🧑' },
  { id: 'adult', label: 'Adult (18-64)', emoji: '🧑‍🦱' },
  { id: 'senior', label: 'Senior (65+)', emoji: '👴' },
];

const AVATAR_EMOJIS = ['👤', '👩', '👨', '👧', '👦', '👶', '👴', '👵', '🧑', '👱', '🧔', '👩‍🦰', '👨‍🦱', '👩‍🦳', '🧑‍🦲'];

const COMMON_ALLERGIES = [
  'Peanuts', 'Tree Nuts', 'Milk', 'Eggs', 'Wheat', 'Soy', 'Fish', 'Shellfish', 'Sesame',
];

const COMMON_DIETS = [
  'Vegetarian', 'Vegan', 'Pescatarian', 'Keto', 'Paleo', 'Gluten-Free', 'Dairy-Free', 'Low-Sodium', 'Low-Sugar', 'Halal', 'Kosher',
];

const PREFERENCE_TYPES = [
  { id: 'allergy', label: 'Allergy', icon: 'warning', color: '#EF4444' },
  { id: 'intolerance', label: 'Intolerance', icon: 'alert-circle', color: '#F59E0B' },
  { id: 'diet', label: 'Diet', icon: 'leaf', color: '#10B981' },
  { id: 'dislike', label: 'Dislike', icon: 'thumbs-down', color: '#6B7280' },
  { id: 'medical', label: 'Medical', icon: 'medical', color: '#8B5CF6' },
];

const SEVERITY_LEVELS = [
  { id: 'mild', label: 'Mild', color: '#FCD34D' },
  { id: 'moderate', label: 'Moderate', color: '#F59E0B' },
  { id: 'severe', label: 'Severe', color: '#EF4444' },
  { id: 'life-threatening', label: 'Life-threatening', color: '#991B1B' },
];

export default function HouseholdSetupScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // State
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal states
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddPreference, setShowAddPreference] = useState(false);
  const [editingMember, setEditingMember] = useState<HouseholdMember | null>(null);
  const [selectedMemberForPreference, setSelectedMemberForPreference] = useState<HouseholdMember | null>(null);

  // Form states
  const [memberName, setMemberName] = useState('');
  const [memberRelationship, setMemberRelationship] = useState('');
  const [memberAgeGroup, setMemberAgeGroup] = useState('adult');
  const [memberEmoji, setMemberEmoji] = useState('👤');
  const [memberNotes, setMemberNotes] = useState('');

  // Preference form states
  const [preferenceType, setPreferenceType] = useState<DietaryPreference['preference_type']>('allergy');
  const [preferenceName, setPreferenceName] = useState('');
  const [preferenceSeverity, setPreferenceSeverity] = useState<DietaryPreference['severity']>('moderate');
  const [preferenceNotes, setPreferenceNotes] = useState('');

  // Load members on mount
  useEffect(() => {
    if (user) {
      loadMembers();
    } else {
      setLoading(false);
    }
  }, [user]);

  const loadMembers = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // Load members
      const { data: membersData, error: membersError } = await supabase
        .from('household_members')
        .select('*')
        .eq('user_id', user.id)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (membersError) throw membersError;

      // Load preferences for each member
      const membersWithPrefs = await Promise.all(
        (membersData || []).map(async (member) => {
          const { data: prefsData } = await supabase
            .from('dietary_preferences')
            .select('*')
            .eq('member_id', member.id);

          return {
            ...member,
            dietary_preferences: prefsData || [],
          };
        })
      );

      setMembers(membersWithPrefs);
    } catch (error) {
      console.error('Error loading household members:', error);
      Alert.alert('Error', 'Failed to load household members');
    } finally {
      setLoading(false);
    }
  };

  const saveMember = async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to save household members');
      return;
    }

    if (!memberName.trim()) {
      Alert.alert('Name Required', 'Please enter a name for this household member');
      return;
    }

    if (!memberRelationship) {
      Alert.alert('Relationship Required', 'Please select a relationship');
      return;
    }

    try {
      setSaving(true);

      const memberData = {
        user_id: user.id,
        name: memberName.trim(),
        relationship: memberRelationship,
        age_group: memberAgeGroup,
        is_primary: memberRelationship === 'self',
        avatar_emoji: memberEmoji,
        notes: memberNotes.trim() || null,
      };

      if (editingMember?.id) {
        // Update existing member
        const { error } = await supabase
          .from('household_members')
          .update(memberData)
          .eq('id', editingMember.id);

        if (error) throw error;
      } else {
        // Insert new member
        const { error } = await supabase
          .from('household_members')
          .insert(memberData);

        if (error) throw error;
      }

      // Reset form and reload
      resetMemberForm();
      setShowAddMember(false);
      await loadMembers();
    } catch (error) {
      console.error('Error saving member:', error);
      Alert.alert('Error', 'Failed to save household member');
    } finally {
      setSaving(false);
    }
  };

  const deleteMember = async (member: HouseholdMember) => {
    if (!member.id) return;

    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${member.name} from your household?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('household_members')
                .delete()
                .eq('id', member.id);

              if (error) throw error;
              await loadMembers();
            } catch (error) {
              console.error('Error deleting member:', error);
              Alert.alert('Error', 'Failed to remove household member');
            }
          },
        },
      ]
    );
  };

  const savePreference = async () => {
    if (!selectedMemberForPreference?.id) return;

    if (!preferenceName.trim()) {
      Alert.alert('Name Required', 'Please enter what the preference is for');
      return;
    }

    try {
      setSaving(true);

      const prefData: any = {
        member_id: selectedMemberForPreference.id,
        preference_type: preferenceType,
        name: preferenceName.trim(),
        notes: preferenceNotes.trim() || null,
      };

      // Only include severity for allergies
      if (preferenceType === 'allergy') {
        prefData.severity = preferenceSeverity;
      }

      const { error } = await supabase
        .from('dietary_preferences')
        .insert(prefData);

      if (error) throw error;

      // Reset form and reload
      resetPreferenceForm();
      setShowAddPreference(false);
      await loadMembers();
    } catch (error) {
      console.error('Error saving preference:', error);
      Alert.alert('Error', 'Failed to save dietary preference');
    } finally {
      setSaving(false);
    }
  };

  const deletePreference = async (preference: DietaryPreference) => {
    if (!preference.id) return;

    try {
      const { error } = await supabase
        .from('dietary_preferences')
        .delete()
        .eq('id', preference.id);

      if (error) throw error;
      await loadMembers();
    } catch (error) {
      console.error('Error deleting preference:', error);
      Alert.alert('Error', 'Failed to remove preference');
    }
  };

  const resetMemberForm = () => {
    setMemberName('');
    setMemberRelationship('');
    setMemberAgeGroup('adult');
    setMemberEmoji('👤');
    setMemberNotes('');
    setEditingMember(null);
  };

  const resetPreferenceForm = () => {
    setPreferenceType('allergy');
    setPreferenceName('');
    setPreferenceSeverity('moderate');
    setPreferenceNotes('');
    setSelectedMemberForPreference(null);
  };

  const openEditMember = (member: HouseholdMember) => {
    setEditingMember(member);
    setMemberName(member.name);
    setMemberRelationship(member.relationship);
    setMemberAgeGroup(member.age_group);
    setMemberEmoji(member.avatar_emoji);
    setMemberNotes(member.notes || '');
    setShowAddMember(true);
  };

  const openAddPreference = (member: HouseholdMember) => {
    setSelectedMemberForPreference(member);
    setShowAddPreference(true);
  };

  const getPreferenceTypeInfo = (type: string) => {
    return PREFERENCE_TYPES.find(t => t.id === type) || PREFERENCE_TYPES[0];
  };

  // Render member card
  const renderMemberCard = (member: HouseholdMember) => (
    <View key={member.id || member.name} style={styles.memberCard}>
      <View style={styles.memberHeader}>
        <View style={styles.memberAvatar}>
          <Text style={styles.memberAvatarEmoji}>{member.avatar_emoji}</Text>
        </View>
        <View style={styles.memberInfo}>
          <Text style={styles.memberName}>{member.name}</Text>
          <Text style={styles.memberRelationship}>
            {RELATIONSHIPS.find(r => r.id === member.relationship)?.label || member.relationship}
            {member.age_group && ` • ${AGE_GROUPS.find(a => a.id === member.age_group)?.label.split(' ')[0] || member.age_group}`}
          </Text>
        </View>
        <View style={styles.memberActions}>
          <TouchableOpacity
            style={styles.memberActionButton}
            onPress={() => openEditMember(member)}
          >
            <Ionicons name="pencil" size={18} color="#64748b" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.memberActionButton}
            onPress={() => deleteMember(member)}
          >
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Dietary Preferences */}
      <View style={styles.preferencesSection}>
        {member.dietary_preferences && member.dietary_preferences.length > 0 ? (
          <View style={styles.preferencesList}>
            {member.dietary_preferences.map((pref, index) => {
              const typeInfo = getPreferenceTypeInfo(pref.preference_type);
              return (
                <View key={pref.id || index} style={styles.preferenceChip}>
                  <Ionicons name={typeInfo.icon as any} size={14} color={typeInfo.color} />
                  <Text style={styles.preferenceChipText}>{pref.name}</Text>
                  {pref.severity && pref.preference_type === 'allergy' && (
                    <View style={[styles.severityDot, { backgroundColor: SEVERITY_LEVELS.find(s => s.id === pref.severity)?.color }]} />
                  )}
                  <TouchableOpacity
                    style={styles.preferenceRemove}
                    onPress={() => deletePreference(pref)}
                  >
                    <Ionicons name="close" size={14} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.noPreferencesText}>No dietary preferences set</Text>
        )}

        <TouchableOpacity
          style={styles.addPreferenceButton}
          onPress={() => openAddPreference(member)}
        >
          <Ionicons name="add" size={18} color="#3B82F6" />
          <Text style={styles.addPreferenceText}>Add preference</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // Add member modal
  const renderAddMemberModal = () => (
    <Modal
      visible={showAddMember}
      animationType="slide"
      transparent
      onRequestClose={() => {
        resetMemberForm();
        setShowAddMember(false);
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                resetMemberForm();
                setShowAddMember(false);
              }}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingMember ? 'Edit Member' : 'Add Member'}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {/* Avatar Picker */}
            <Text style={styles.inputLabel}>Avatar</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiPicker}>
              {AVATAR_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[
                    styles.emojiOption,
                    memberEmoji === emoji && styles.emojiOptionSelected,
                  ]}
                  onPress={() => setMemberEmoji(emoji)}
                >
                  <Text style={styles.emojiOptionText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Name Input */}
            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.textInput}
              value={memberName}
              onChangeText={setMemberName}
              placeholder="Enter name"
              placeholderTextColor="#94a3b8"
            />

            {/* Relationship */}
            <Text style={styles.inputLabel}>Relationship</Text>
            <View style={styles.optionsGrid}>
              {RELATIONSHIPS.map((rel) => (
                <TouchableOpacity
                  key={rel.id}
                  style={[
                    styles.optionButton,
                    memberRelationship === rel.id && styles.optionButtonSelected,
                  ]}
                  onPress={() => setMemberRelationship(rel.id)}
                >
                  <Text style={styles.optionEmoji}>{rel.emoji}</Text>
                  <Text style={[
                    styles.optionLabel,
                    memberRelationship === rel.id && styles.optionLabelSelected,
                  ]}>
                    {rel.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Age Group */}
            <Text style={styles.inputLabel}>Age Group</Text>
            <View style={styles.optionsGrid}>
              {AGE_GROUPS.map((age) => (
                <TouchableOpacity
                  key={age.id}
                  style={[
                    styles.optionButton,
                    memberAgeGroup === age.id && styles.optionButtonSelected,
                  ]}
                  onPress={() => setMemberAgeGroup(age.id)}
                >
                  <Text style={styles.optionEmoji}>{age.emoji}</Text>
                  <Text style={[
                    styles.optionLabel,
                    memberAgeGroup === age.id && styles.optionLabelSelected,
                  ]}>
                    {age.label.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Notes */}
            <Text style={styles.inputLabel}>Notes (optional)</Text>
            <TextInput
              style={[styles.textInput, styles.textAreaInput]}
              value={memberNotes}
              onChangeText={setMemberNotes}
              placeholder="Any additional notes..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={3}
            />
          </ScrollView>

          {/* Save Button */}
          <TouchableOpacity
            style={styles.saveButton}
            onPress={saveMember}
            disabled={saving}
          >
            <LinearGradient
              colors={['#3B82F6', '#2563EB']}
              style={styles.saveButtonGradient}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>
                    {editingMember ? 'Save Changes' : 'Add Member'}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  // Add preference modal
  const renderAddPreferenceModal = () => (
    <Modal
      visible={showAddPreference}
      animationType="slide"
      transparent
      onRequestClose={() => {
        resetPreferenceForm();
        setShowAddPreference(false);
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => {
                resetPreferenceForm();
                setShowAddPreference(false);
              }}
              style={styles.modalCloseButton}
            >
              <Ionicons name="close" size={24} color="#64748b" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              Add Preference for {selectedMemberForPreference?.name}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {/* Preference Type */}
            <Text style={styles.inputLabel}>Type</Text>
            <View style={styles.preferenceTypesRow}>
              {PREFERENCE_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.id}
                  style={[
                    styles.preferenceTypeButton,
                    preferenceType === type.id && styles.preferenceTypeButtonSelected,
                    preferenceType === type.id && { borderColor: type.color },
                  ]}
                  onPress={() => setPreferenceType(type.id as any)}
                >
                  <Ionicons name={type.icon as any} size={20} color={preferenceType === type.id ? type.color : '#64748b'} />
                  <Text style={[
                    styles.preferenceTypeLabel,
                    preferenceType === type.id && { color: type.color },
                  ]}>
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Common Options */}
            {preferenceType === 'allergy' && (
              <>
                <Text style={styles.inputLabel}>Common Allergies</Text>
                <View style={styles.quickOptionsRow}>
                  {COMMON_ALLERGIES.map((allergy) => (
                    <TouchableOpacity
                      key={allergy}
                      style={[
                        styles.quickOption,
                        preferenceName === allergy && styles.quickOptionSelected,
                      ]}
                      onPress={() => setPreferenceName(allergy)}
                    >
                      <Text style={[
                        styles.quickOptionText,
                        preferenceName === allergy && styles.quickOptionTextSelected,
                      ]}>
                        {allergy}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {preferenceType === 'diet' && (
              <>
                <Text style={styles.inputLabel}>Common Diets</Text>
                <View style={styles.quickOptionsRow}>
                  {COMMON_DIETS.map((diet) => (
                    <TouchableOpacity
                      key={diet}
                      style={[
                        styles.quickOption,
                        preferenceName === diet && styles.quickOptionSelected,
                      ]}
                      onPress={() => setPreferenceName(diet)}
                    >
                      <Text style={[
                        styles.quickOptionText,
                        preferenceName === diet && styles.quickOptionTextSelected,
                      ]}>
                        {diet}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Custom Name Input */}
            <Text style={styles.inputLabel}>
              {preferenceType === 'allergy' ? 'Allergen' : preferenceType === 'diet' ? 'Diet Name' : 'What to avoid/prefer'}
            </Text>
            <TextInput
              style={styles.textInput}
              value={preferenceName}
              onChangeText={setPreferenceName}
              placeholder="Type or select above"
              placeholderTextColor="#94a3b8"
            />

            {/* Severity (for allergies only) */}
            {preferenceType === 'allergy' && (
              <>
                <Text style={styles.inputLabel}>Severity</Text>
                <View style={styles.severityRow}>
                  {SEVERITY_LEVELS.map((severity) => (
                    <TouchableOpacity
                      key={severity.id}
                      style={[
                        styles.severityButton,
                        preferenceSeverity === severity.id && styles.severityButtonSelected,
                        preferenceSeverity === severity.id && { borderColor: severity.color, backgroundColor: `${severity.color}15` },
                      ]}
                      onPress={() => setPreferenceSeverity(severity.id as any)}
                    >
                      <View style={[styles.severityIndicator, { backgroundColor: severity.color }]} />
                      <Text style={[
                        styles.severityLabel,
                        preferenceSeverity === severity.id && { color: severity.color },
                      ]}>
                        {severity.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Notes */}
            <Text style={styles.inputLabel}>Notes (optional)</Text>
            <TextInput
              style={[styles.textInput, styles.textAreaInput]}
              value={preferenceNotes}
              onChangeText={setPreferenceNotes}
              placeholder="Any additional details..."
              placeholderTextColor="#94a3b8"
              multiline
              numberOfLines={2}
            />
          </ScrollView>

          {/* Save Button */}
          <TouchableOpacity
            style={styles.saveButton}
            onPress={savePreference}
            disabled={saving}
          >
            <LinearGradient
              colors={['#10B981', '#059669']}
              style={styles.saveButtonGradient}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>Add Preference</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading household...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <LinearGradient
        colors={['#3B82F6', '#2563EB']}
        style={styles.header}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
        >
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>My Household</Text>
          <Text style={styles.headerSubtitle}>
            Manage family members and dietary preferences
          </Text>
        </View>
      </LinearGradient>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {!user && (
          <View style={styles.signInPrompt}>
            <Ionicons name="person-circle-outline" size={48} color="#94a3b8" />
            <Text style={styles.signInPromptText}>
              Sign in to save your household members and preferences
            </Text>
            <TouchableOpacity
              style={styles.signInButton}
              onPress={() => navigation.navigate('Auth' as never)}
            >
              <Text style={styles.signInButtonText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        )}

        {user && members.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={64} color="#cbd5e1" />
            <Text style={styles.emptyStateTitle}>No household members yet</Text>
            <Text style={styles.emptyStateText}>
              Add yourself and your family members to personalize recipe recommendations
            </Text>
          </View>
        )}

        {members.map(renderMemberCard)}

        {/* Add Member Button */}
        {user && (
          <TouchableOpacity
            style={styles.addMemberButton}
            onPress={() => setShowAddMember(true)}
          >
            <LinearGradient
              colors={['#f8fafc', '#f1f5f9']}
              style={styles.addMemberButtonGradient}
            >
              <Ionicons name="add-circle" size={24} color="#3B82F6" />
              <Text style={styles.addMemberButtonText}>Add Household Member</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color="#3B82F6" />
          <Text style={styles.infoText}>
            Your household preferences help KanDu suggest recipes that work for everyone.
            We'll avoid allergens and respect dietary restrictions automatically.
          </Text>
        </View>
      </ScrollView>

      {/* Modals */}
      {renderAddMemberModal()}
      {renderAddPreferenceModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 12,
  },
  backButton: {
    marginLeft: -8,
    marginBottom: 8,
  },
  headerContent: {
    marginTop: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 4,
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },

  // Sign In Prompt
  signInPrompt: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 20,
  },
  signInPromptText: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  signInButton: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  signInButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 20,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginTop: 16,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },

  // Member Card
  memberCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarEmoji: {
    fontSize: 24,
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1e293b',
  },
  memberRelationship: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  memberActions: {
    flexDirection: 'row',
    gap: 8,
  },
  memberActionButton: {
    padding: 8,
  },

  // Preferences Section
  preferencesSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  preferencesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  preferenceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  preferenceChipText: {
    fontSize: 13,
    color: '#475569',
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  preferenceRemove: {
    marginLeft: 2,
  },
  noPreferencesText: {
    fontSize: 14,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  addPreferenceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 4,
  },
  addPreferenceText: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '500',
  },

  // Add Member Button
  addMemberButton: {
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  addMemberButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  addMemberButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
  },

  // Info Card
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 20,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e293b',
    flex: 1,
    textAlign: 'center',
  },
  modalContent: {
    paddingHorizontal: 20,
    maxHeight: 500,
  },

  // Form Inputs
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
    marginTop: 16,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1e293b',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  textAreaInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // Emoji Picker
  emojiPicker: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  emojiOption: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  emojiOptionSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  emojiOptionText: {
    fontSize: 24,
  },

  // Options Grid
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionButton: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    minWidth: 80,
  },
  optionButtonSelected: {
    borderColor: '#3B82F6',
    backgroundColor: '#EFF6FF',
  },
  optionEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  optionLabel: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
  },
  optionLabelSelected: {
    color: '#3B82F6',
    fontWeight: '600',
  },

  // Preference Types
  preferenceTypesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  preferenceTypeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 6,
  },
  preferenceTypeButtonSelected: {
    backgroundColor: '#fff',
  },
  preferenceTypeLabel: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },

  // Quick Options
  quickOptionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickOption: {
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quickOptionSelected: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  quickOptionText: {
    fontSize: 13,
    color: '#64748b',
  },
  quickOptionTextSelected: {
    color: '#3B82F6',
    fontWeight: '500',
  },

  // Severity
  severityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  severityButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 6,
  },
  severityButtonSelected: {
    backgroundColor: '#fff',
  },
  severityIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  severityLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },

  // Save Button
  saveButton: {
    marginHorizontal: 20,
    marginVertical: 20,
    borderRadius: 16,
    overflow: 'hidden',
  },
  saveButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
