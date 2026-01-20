import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';

type RootStackParamList = {
  Auth: { mode?: 'login' | 'signup' };
};

interface ProfileMenuProps {
  visible: boolean;
  onClose: () => void;
  onNavigateToHistory: () => void;
}

export default function ProfileMenu({
  visible,
  onClose,
  onNavigateToHistory,
}: ProfileMenuProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, signOut } = useAuth();

  const getUserName = () => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name;
    }
    return user?.email || 'Guest';
  };

  const getUserEmail = () => {
    return user?.email || '';
  };

  const handleSignOut = async () => {
    onClose();
    await signOut();
  };

  const handleSignIn = () => {
    onClose();
    navigation.navigate('Auth', { mode: 'login' });
  };

  const handleHistoryPress = () => {
    onClose();
    onNavigateToHistory();
  };

  // Not logged in - show sign in prompt
  if (!user) {
    return (
      <Modal
        animationType="fade"
        transparent={true}
        visible={visible}
        onRequestClose={onClose}
      >
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={styles.menuContainer} onPress={e => e.stopPropagation()}>
            {/* Guest Section */}
            <View style={styles.userSection}>
              <View style={[styles.avatarContainer, styles.guestAvatar]}>
                <Ionicons name="person-outline" size={24} color="#64748b" />
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>Welcome to KanDu</Text>
                <Text style={styles.userEmail}>Sign in to save your diagnoses</Text>
              </View>
            </View>

            <View style={styles.divider} />

            {/* Sign In Button */}
            <TouchableOpacity
              style={styles.signInButton}
              onPress={handleSignIn}
              activeOpacity={0.7}
            >
              <Ionicons name="log-in-outline" size={24} color="#1E5AA8" />
              <Text style={styles.signInText}>Sign In</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                onClose();
                navigation.navigate('Auth', { mode: 'signup' });
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="person-add-outline" size={24} color="#1E5AA8" />
              <Text style={styles.menuItemText}>Create Account</Text>
              <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  // Logged in - show full menu
  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.menuContainer} onPress={e => e.stopPropagation()}>
          {/* User Info Section */}
          <View style={styles.userSection}>
            <View style={styles.avatarContainer}>
              <Text style={styles.avatarText}>
                {getUserName().charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{getUserName()}</Text>
              <Text style={styles.userEmail}>{getUserEmail()}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Menu Items */}
          <TouchableOpacity
            style={styles.menuItem}
            onPress={handleHistoryPress}
            activeOpacity={0.7}
          >
            <Ionicons name="time-outline" size={24} color="#1E5AA8" />
            <Text style={styles.menuItemText}>Diagnosis History</Text>
            <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {}}
            activeOpacity={0.7}
            disabled
          >
            <Ionicons name="settings-outline" size={24} color="#94a3b8" />
            <Text style={[styles.menuItemText, styles.disabledText]}>Settings</Text>
            <Text style={styles.comingSoon}>Coming Soon</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => {}}
            activeOpacity={0.7}
            disabled
          >
            <Ionicons name="help-circle-outline" size={24} color="#94a3b8" />
            <Text style={[styles.menuItemText, styles.disabledText]}>Help & Support</Text>
            <Text style={styles.comingSoon}>Coming Soon</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Sign Out */}
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out-outline" size={24} color="#ef4444" />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  menuContainer: {
    marginTop: 100,
    marginLeft: 16,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1E5AA8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  userInfo: {
    marginLeft: 12,
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  userEmail: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontSize: 15,
    color: '#1e293b',
    marginLeft: 12,
    flex: 1,
  },
  disabledText: {
    color: '#94a3b8',
  },
  comingSoon: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  signOutText: {
    fontSize: 15,
    color: '#ef4444',
    marginLeft: 12,
    fontWeight: '500',
  },
  guestAvatar: {
    backgroundColor: '#e2e8f0',
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  signInText: {
    fontSize: 15,
    color: '#1E5AA8',
    marginLeft: 12,
    fontWeight: '600',
  },
});
