import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Updates from 'expo-updates';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import HomeScreen from './screens/HomeScreen';
import MainHomeScreen from './screens/MainHomeScreen';
import DiagnosisScreen from './screens/DiagnosisScreen';
import ResultsScreen from './screens/ResultsScreen';
import AuthScreen from './screens/AuthScreen';
import DiagnosisHistoryScreen from './screens/DiagnosisHistoryScreen';
import GuidedFixDisclaimerScreen from './screens/GuidedFixDisclaimerScreen';
// STATE MACHINE VERSION - porting all features piece by piece
import GuidedFixScreen from './screens/GuidedFixScreenNew';
// import GuidedFixScreen from './screens/GuidedFixScreen'; // OLD VERSION (reference)
import ArticleScreen from './screens/ArticleScreen';
import LearnItScreen from './screens/LearnItScreen';
import PlanItScreen from './screens/PlanItScreen';
import DoItScreen from './screens/DoItScreen';
import HouseholdSetupScreen from './screens/HouseholdSetupScreen';
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
  Article: {
    title: string;
    category: string;
    icon: string;
    shortDescription: string;
  };
  LearnIt: undefined;
  PlanIt: undefined;
  DoIt: undefined;
  HouseholdSetup: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppNavigator() {
  const { user, loading } = useAuth();

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
        },
        headerBackTitle: 'KanDu™',
        headerShadowVisible: true,
        headerBlurEffect: 'dark',
      }}
    >
      <Stack.Screen
        name="Home"
        component={user ? MainHomeScreen : HomeScreen}
        options={{ headerShown: false }}
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
      <Stack.Screen
        name="Article"
        component={ArticleScreen}
        options={{ title: 'You KanDu It' }}
      />
      <Stack.Screen
        name="LearnIt"
        component={LearnItScreen}
        options={{ title: 'Learn It' }}
      />
      <Stack.Screen
        name="PlanIt"
        component={PlanItScreen}
        options={{ title: 'Plan It' }}
      />
      <Stack.Screen
        name="DoIt"
        component={DoItScreen}
        options={{ title: 'Do It' }}
      />
      <Stack.Screen
        name="HouseholdSetup"
        component={HouseholdSetupScreen}
        options={{
          title: 'Household',
          presentation: 'modal',
          headerShown: false,
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
        // Check for updates in both dev and production
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
