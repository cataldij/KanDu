import { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';

type RootStackParamList = {
  Home: undefined;
  Auth: { mode?: 'login' | 'signup' };
};

type AuthScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Auth'>;
  route: RouteProp<RootStackParamList, 'Auth'>;
};

export default function AuthScreen({ navigation, route }: AuthScreenProps) {
  const mode = route.params?.mode;
  const [isLogin, setIsLogin] = useState(mode !== 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { user, signIn, signUp, signInWithGoogle } = useAuth();

  // Navigate back when user becomes authenticated
  useEffect(() => {
    if (user) {
      navigation.goBack();
    }
  }, [user, navigation]);

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Missing Fields', 'Please enter your email and password');
      return;
    }

    if (!isLogin && !name) {
      Alert.alert('Missing Fields', 'Please enter your name');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address');
      return;
    }

    // Password validation for signup
    if (!isLogin && password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(email, password);
        if (error) {
          Alert.alert('Login Failed', error.message);
        }
        // If successful, auth state change will auto-navigate
      } else {
        const { error } = await signUp(email, password, name);
        if (error) {
          Alert.alert('Sign Up Failed', error.message);
        }
        // If email confirmation is disabled, user is auto logged in
        // The auth state change listener will handle navigation
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      Alert.alert('Google Sign In Failed', 'Something went wrong. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Logo */}
        <View style={styles.logoSection}>
          <Image
            source={require('../assets/kandu-light-full.png')}
            style={styles.fullLogo}
            resizeMode="contain"
          />
        </View>

        {/* Auth Form */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>
            {isLogin ? 'Welcome Back!' : 'Create Account'}
          </Text>
          <Text style={styles.formSubtitle}>
            {isLogin
              ? 'Sign in to access your free diagnosis'
              : 'Sign up to get your free diagnosis'}
          </Text>

          {!isLogin && (
            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your name"
                placeholderTextColor="#94a3b8"
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            </View>
          )}

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor="#94a3b8"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Password</Text>
            <TextInput
              style={styles.input}
              placeholder={isLogin ? 'Enter your password' : 'Create a password (6+ chars)'}
              placeholderTextColor="#94a3b8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            onPress={handleAuth}
            disabled={loading}
            activeOpacity={0.8}
            style={styles.buttonWrapper}
          >
            <LinearGradient
              colors={loading ? ['#9ca3af', '#9ca3af'] : ['#1E90FF', '#00CBA9']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.button}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.buttonText}>
                  {isLogin ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>
              {isLogin ? "Don't have an account?" : 'Already have an account?'}
            </Text>
            <TouchableOpacity onPress={() => setIsLogin(!isLogin)}>
              <Text style={styles.switchLink}>
                {isLogin ? 'Sign Up' : 'Sign In'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google Sign In */}
          <TouchableOpacity
            onPress={handleGoogleSignIn}
            disabled={googleLoading}
            activeOpacity={0.8}
            style={styles.googleButton}
          >
            {googleLoading ? (
              <ActivityIndicator color="#1e293b" size="small" />
            ) : (
              <>
                <Ionicons name="logo-google" size={20} color="#EA4335" style={styles.googleIcon} />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Features */}
        <View style={styles.featuresSection}>
          <Text style={styles.featuresTitle}>Why Create an Account?</Text>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🔍</Text>
            <Text style={styles.featureText}>Get a FREE AI-powered diagnosis</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>📱</Text>
            <Text style={styles.featureText}>Save your diagnosis history</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🛒</Text>
            <Text style={styles.featureText}>Quick access to part recommendations</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>💰</Text>
            <Text style={styles.featureText}>Unlock premium repair guides</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#E8F4F8',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 10,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 0,
  },
  fullLogo: {
    width: 416,
    height: 234,
    marginBottom: -70,
    marginTop: -70,
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  formTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#1E5AA8',
    textAlign: 'center',
    marginBottom: 8,
  },
  formSubtitle: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E5AA8',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1e293b',
    borderWidth: 2,
    borderColor: '#e2e8f0',
  },
  buttonWrapper: {
    marginTop: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  button: {
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    gap: 8,
  },
  switchText: {
    fontSize: 14,
    color: '#64748b',
  },
  switchLink: {
    fontSize: 14,
    color: '#1E5AA8',
    fontWeight: 'bold',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e2e8f0',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#94a3b8',
    fontSize: 14,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
  },
  googleIcon: {
    marginRight: 12,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e293b',
  },
  featuresSection: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E5AA8',
    marginBottom: 16,
    textAlign: 'center',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  featureIcon: {
    fontSize: 24,
  },
  featureText: {
    fontSize: 15,
    color: '#475569',
    flex: 1,
  },
});
