import { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import {
  SavedDiagnosis,
  DiagnosisStatus,
  getUserDiagnoses,
  deleteDiagnosis,
  updateDiagnosis,
  getCategoryInfo,
  formatDiagnosisDate,
} from '../services/diagnosisStorage';

type RootStackParamList = {
  Home: undefined;
  DiagnosisHistory: undefined;
  Results: {
    diagnosis: string;
    category: string;
    description: string;
    imageUri?: string;
    videoUri?: string;
    fromHistory?: boolean;
  };
};

type DiagnosisHistoryScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'DiagnosisHistory'>;
};

export default function DiagnosisHistoryScreen({ navigation }: DiagnosisHistoryScreenProps) {
  const { user } = useAuth();
  const [diagnoses, setDiagnoses] = useState<SavedDiagnosis[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [resolveModalVisible, setResolveModalVisible] = useState(false);
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<SavedDiagnosis | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');

  const loadDiagnoses = useCallback(async () => {
    if (!user) return;

    const { data, error } = await getUserDiagnoses(user.id);
    if (error) {
      console.error('Failed to load diagnoses:', error);
    } else {
      setDiagnoses(data);
    }
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => {
    loadDiagnoses();
  }, [loadDiagnoses]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDiagnoses();
  };

  const handleViewDiagnosis = (diagnosis: SavedDiagnosis) => {
    navigation.navigate('Results', {
      diagnosis: JSON.stringify(diagnosis.diagnosis_data),
      category: diagnosis.category,
      description: diagnosis.description,
      fromHistory: true,
    });
  };

  const handleDeleteDiagnosis = (diagnosis: SavedDiagnosis) => {
    Alert.alert(
      'Delete Diagnosis',
      'Are you sure you want to delete this diagnosis? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await deleteDiagnosis(diagnosis.id);
            if (error) {
              Alert.alert('Error', 'Failed to delete diagnosis');
            } else {
              setDiagnoses(prev => prev.filter(d => d.id !== diagnosis.id));
            }
          },
        },
      ]
    );
  };

  const handleStatusAction = (diagnosis: SavedDiagnosis) => {
    if (diagnosis.status === 'resolved') {
      // Reopen if already resolved
      Alert.alert(
        'Reopen Issue',
        'Do you want to mark this issue as open again?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reopen',
            onPress: async () => {
              const { data, error } = await updateDiagnosis(diagnosis.id, {
                status: 'open',
                resolution_note: null,
                resolved_at: null,
              });
              if (error) {
                Alert.alert('Error', 'Failed to update status');
              } else if (data) {
                setDiagnoses(prev => prev.map(d => d.id === diagnosis.id ? data : d));
              }
            },
          },
        ]
      );
    } else {
      // Show resolve modal
      setSelectedDiagnosis(diagnosis);
      setResolutionNote('');
      setResolveModalVisible(true);
    }
  };

  const handleResolve = async () => {
    if (!selectedDiagnosis) return;

    const { data, error } = await updateDiagnosis(selectedDiagnosis.id, {
      status: 'resolved',
      resolution_note: resolutionNote.trim() || null,
      resolved_at: new Date().toISOString(),
    });

    if (error) {
      Alert.alert('Error', 'Failed to mark as resolved');
    } else if (data) {
      setDiagnoses(prev => prev.map(d => d.id === selectedDiagnosis.id ? data : d));
      setResolveModalVisible(false);
      setSelectedDiagnosis(null);
      setResolutionNote('');
    }
  };

  const handleToggleWatching = async (diagnosis: SavedDiagnosis) => {
    const newStatus: DiagnosisStatus = diagnosis.status === 'watching' ? 'open' : 'watching';
    const { data, error } = await updateDiagnosis(diagnosis.id, { status: newStatus });

    if (error) {
      Alert.alert('Error', 'Failed to update status');
    } else if (data) {
      setDiagnoses(prev => prev.map(d => d.id === diagnosis.id ? data : d));
    }
  };

  const renderDiagnosisItem = ({ item }: { item: SavedDiagnosis }) => {
    const categoryInfo = getCategoryInfo(item.category);
    const diagData = item.diagnosis_data;
    const status = item.status || 'open';

    return (
      <TouchableOpacity
        style={[
          styles.diagnosisCard,
          status === 'resolved' && styles.resolvedCard,
        ]}
        onPress={() => handleViewDiagnosis(item)}
        onLongPress={() => handleDeleteDiagnosis(item)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryEmoji}>{categoryInfo.emoji}</Text>
            <Text style={styles.categoryName}>{categoryInfo.name}</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) }]}>
              <Text style={styles.statusBadgeText}>{getStatusLabel(status)}</Text>
            </View>
            <View style={styles.dateBadge}>
              <Text style={styles.dateText}>{formatDiagnosisDate(item.created_at)}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.diagnosisSummary} numberOfLines={3}>
          {diagData.diagnosis.summary}
        </Text>

        {item.resolution_note && (
          <View style={styles.resolutionNoteContainer}>
            <Text style={styles.resolutionNoteLabel}>What fixed it:</Text>
            <Text style={styles.resolutionNoteText}>{item.resolution_note}</Text>
          </View>
        )}

        <View style={styles.cardFooter}>
          <View style={styles.badges}>
            {item.is_advanced && (
              <View style={styles.advancedBadge}>
                <Text style={styles.advancedBadgeText}>Advanced</Text>
              </View>
            )}
            <View style={[
              styles.urgencyBadge,
              { backgroundColor: getUrgencyColor(diagData.triage.urgency) }
            ]}>
              <Text style={styles.urgencyBadgeText}>
                {formatUrgency(diagData.triage.urgency)}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={[
              styles.statusActionButton,
              status === 'resolved' ? styles.reopenButton : styles.resolveButton,
            ]}
            onPress={() => handleStatusAction(item)}
          >
            <Text style={styles.statusActionText}>
              {status === 'resolved' ? 'Reopen' : 'Mark Fixed'}
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1E5AA8" />
        <Text style={styles.loadingText}>Loading your diagnoses...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {diagnoses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>No Diagnoses Yet</Text>
          <Text style={styles.emptyDescription}>
            Your diagnosis history will appear here after you get your first diagnosis.
          </Text>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation.navigate('Home')}
          >
            <LinearGradient
              colors={['#1E90FF', '#00CBA9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.emptyButton}
            >
              <Text style={styles.emptyButtonText}>Get Your First Diagnosis</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={diagnoses}
          renderItem={renderDiagnosisItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#1E5AA8']}
              tintColor="#1E5AA8"
            />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={styles.listHeaderText}>
                {diagnoses.length} {diagnoses.length === 1 ? 'diagnosis' : 'diagnoses'}
              </Text>
              <Text style={styles.listHeaderHint}>Long press to delete</Text>
            </View>
          }
        />
      )}

      {/* Resolve Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={resolveModalVisible}
        onRequestClose={() => setResolveModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Mark as Fixed</Text>
            <Text style={styles.modalSubtitle}>
              What fixed the issue? (optional)
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g., Replaced the filter, tightened connection..."
              value={resolutionNote}
              onChangeText={setResolutionNote}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setResolveModalVisible(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalResolveButton}
                onPress={handleResolve}
              >
                <LinearGradient
                  colors={['#10b981', '#059669']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.modalResolveGradient}
                >
                  <Text style={styles.modalResolveText}>Mark Fixed</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getUrgencyColor(urgency: string): string {
  switch (urgency) {
    case 'immediate':
      return '#ef4444';
    case 'soon':
      return '#f59e0b';
    case 'can_wait':
      return '#10b981';
    default:
      return '#64748b';
  }
}

function formatUrgency(urgency: string): string {
  switch (urgency) {
    case 'immediate':
      return 'Urgent';
    case 'soon':
      return 'Soon';
    case 'can_wait':
      return 'Can Wait';
    default:
      return 'Unknown';
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'resolved':
      return '#10b981';
    case 'watching':
      return '#f59e0b';
    case 'open':
    default:
      return '#3b82f6';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'resolved':
      return 'Fixed';
    case 'watching':
      return 'Watching';
    case 'open':
    default:
      return 'Open';
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8F4F8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E8F4F8',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#64748b',
  },
  listContainer: {
    padding: 16,
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  listHeaderText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '600',
  },
  listHeaderHint: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  diagnosisCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#C2E7EC',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  categoryEmoji: {
    fontSize: 18,
    marginRight: 6,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E5AA8',
  },
  dateBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  dateText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  diagnosisSummary: {
    fontSize: 15,
    color: '#1e293b',
    lineHeight: 22,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
  },
  advancedBadge: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  advancedBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  urgencyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  urgencyBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  viewText: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1E5AA8',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  emptyButton: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  emptyButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  resolvedCard: {
    opacity: 0.75,
    borderColor: '#10b981',
  },
  resolutionNoteContainer: {
    backgroundColor: '#f0fdf4',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#10b981',
  },
  resolutionNoteLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
    marginBottom: 4,
  },
  resolutionNoteText: {
    fontSize: 13,
    color: '#14532d',
    lineHeight: 18,
  },
  statusActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  resolveButton: {
    backgroundColor: '#10b981',
  },
  reopenButton: {
    backgroundColor: '#64748b',
  },
  statusActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1E5AA8',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalInput: {
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    minHeight: 100,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
  },
  modalResolveButton: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalResolveGradient: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalResolveText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
});
