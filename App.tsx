import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Updates from 'expo-updates';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import HomeScreen from './screens/HomeScreen';
import DiagnosisScreen from './screens/DiagnosisScreen';
import ResultsScreen from './screens/ResultsScreen';
import AuthScreen from './screens/AuthScreen';
import DiagnosisHistoryScreen from './screens/DiagnosisHistoryScreen';
import GuidedFixDisclaimerScreen from './screens/GuidedFixDisclaimerScreen';
import GuidedFixScreen from './screens/GuidedFixScreen';
import StartupCinematicOverlay from './components/StartupCinematicOverlay';

export type RootStackParamList = {
  Home: undefined;
  Diagnosis: { category: string };
  Results: {
    diagnosis: string;
    category: string;
    description: string;
    imageUri?: string;
    videoUri?: string;
    fromHistory?: boolean;
  };
  Auth: { mode?: 'login' | 'signup' };
  DiagnosisHistory: undefined;
  GuidedFixDisclaimer: {
    category: string;
    diagnosisSummary: string;
    likelyCause?: string;
    originalImageUri?: string;
  };
  GuidedFix: {
    category: string;
    diagnosisSummary: string;
    likelyCause?: string;
    originalImageUri?: string;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppNavigator() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1E5AA8" />
      </View>
    );
  }

  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerStyle: {
          backgroundColor: '#0f4c81',
        },
        headerTintColor: '#ffffff',
        headerTitleStyle: {
          fontWeight: '700',
          fontSize: 22,
          letterSpacing: 0.5,
        },
        headerShadowVisible: true,
        headerBlurEffect: 'dark',
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'KanDu™', headerBackTitle: 'KanDu™' }}
      />
      <Stack.Screen
        name="Diagnosis"
        component={DiagnosisScreen}
        options={{ title: 'Diagnose' }}
      />
      <Stack.Screen
        name="Results"
        component={ResultsScreen}
        options={{ title: 'Diagnosis Results' }}
      />
      <Stack.Screen
        name="Auth"
        component={AuthScreen}
        options={{
          title: 'Sign In',
          presentation: 'modal',
        }}
      />
      <Stack.Screen
        name="DiagnosisHistory"
        component={DiagnosisHistoryScreen}
        options={{ title: 'My Diagnoses' }}
      />
      <Stack.Screen
        name="GuidedFixDisclaimer"
        component={GuidedFixDisclaimerScreen}
        options={{ title: 'Live Guidance', presentation: 'modal' }}
      />
      <Stack.Screen
        name="GuidedFix"
        component={GuidedFixScreen}
        options={{
          title: 'Guided Fix',
          headerShown: false,
          presentation: 'card',
          contentStyle: { backgroundColor: '#000000' },
          animation: 'slide_from_right',
        }}
      />
    </Stack.Navigator>
  );
}

export default function App() {
  // Show cinematic splash on cold start
  const [showSplash, setShowSplash] = useState(true);

  // Check for OTA updates on app launch
  useEffect(() => {
    async function checkForUpdates() {
      try {
        // Only check in production builds (not dev client)
        if (!__DEV__) {
          console.log('[Updates] Checking for updates...');
          const update = await Updates.checkForUpdateAsync();

          if (update.isAvailable) {
            console.log('[Updates] New update available, downloading...');
            await Updates.fetchUpdateAsync();
            console.log('[Updates] Update downloaded, reloading...');
            await Updates.reloadAsync();
          } else {
            console.log('[Updates] App is up to date');
          }
        }
      } catch (error) {
        // Don't crash the app if update check fails
        console.log('[Updates] Error checking for updates:', error);
      }
    }

    checkForUpdates();
  }, []);

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="auto" />
        <AppNavigator />
        {/* Cinematic splash overlay - shows on cold start */}
        <StartupCinematicOverlay
          visible={showSplash}
          onComplete={handleSplashComplete}
        />
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E8F4F8',
  },
});
