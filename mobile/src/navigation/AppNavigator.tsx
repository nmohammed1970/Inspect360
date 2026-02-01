import React, { useState, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ClipboardList, Wrench, Package, User } from 'lucide-react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { colors } from '../theme';
import { moderateScale } from '../utils/responsive';
import { isOnboardingCompleted } from '../utils/onboarding';
import type {
  RootStackParamList,
  AuthStackParamList,
  MainTabParamList,
  InspectionsStackParamList,
  MaintenanceStackParamList,
  ProfileStackParamList,
  AssetsStackParamList,
} from './types';

// Auth Stack
import LoginScreen from '../screens/auth/LoginScreen';

// Onboarding
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';

// Inspections Stack
import InspectionsListScreen from '../screens/inspections/InspectionsListScreen';
import InspectionCaptureScreen from '../screens/inspections/InspectionCaptureScreen';
import InspectionReviewScreen from '../screens/inspections/InspectionReviewScreen';
import InspectionReportScreen from '../screens/inspections/InspectionReportScreen';

// Maintenance Stack
import MaintenanceListScreen from '../screens/maintenance/MaintenanceListScreen';
import MaintenanceDetailScreen from '../screens/maintenance/MaintenanceDetailScreen';
import CreateMaintenanceScreen from '../screens/maintenance/CreateMaintenanceScreen';

// Profile Stack
import ProfileScreen from '../screens/profile/ProfileScreen';

// Assets Stack
import AssetInventoryListScreen from '../screens/assets/AssetInventoryListScreen';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const InspectionsStack = createNativeStackNavigator<InspectionsStackParamList>();
const MaintenanceStack = createNativeStackNavigator<MaintenanceStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const AssetsStack = createNativeStackNavigator<AssetsStackParamList>();
const MainTabs = createBottomTabNavigator<MainTabParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
    </AuthStack.Navigator>
  );
}

function InspectionsNavigator() {
  return (
    <InspectionsStack.Navigator screenOptions={{ headerShown: false }}>
      <InspectionsStack.Screen name="InspectionsList" component={InspectionsListScreen} />
      <InspectionsStack.Screen
        name="InspectionCapture"
        component={InspectionCaptureScreen}
        options={{ headerShown: false }}
      />
      <InspectionsStack.Screen
        name="InspectionReview"
        component={InspectionReviewScreen}
        options={{ headerShown: false }}
      />
      <InspectionsStack.Screen
        name="InspectionReport"
        component={InspectionReportScreen}
        options={{ headerShown: false }}
      />
    </InspectionsStack.Navigator>
  );
}

function MaintenanceNavigator() {
  return (
    <MaintenanceStack.Navigator screenOptions={{ headerShown: false }}>
      <MaintenanceStack.Screen name="MaintenanceList" component={MaintenanceListScreen} />
      <MaintenanceStack.Screen
        name="MaintenanceDetail"
        component={MaintenanceDetailScreen}
        options={{ headerShown: false }}
      />
      <MaintenanceStack.Screen
        name="CreateMaintenance"
        component={CreateMaintenanceScreen}
        options={{ headerShown: false }}
      />
    </MaintenanceStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileHome" component={ProfileScreen} />
    </ProfileStack.Navigator>
  );
}

function AssetsNavigator() {
  return (
    <AssetsStack.Navigator screenOptions={{ headerShown: false }}>
      <AssetsStack.Screen name="AssetInventoryList" component={AssetInventoryListScreen} />
    </AssetsStack.Navigator>
  );
}

function MainTabNavigator() {
  const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
  const theme = useTheme();
  // Ensure themeColors is always defined - use default colors if theme not available
  const themeColors = (theme && theme.colors) ? theme.colors : colors;

  return (
    <MainTabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: themeColors.primary.DEFAULT,
        tabBarInactiveTintColor: themeColors.text.secondary,
        tabBarStyle: {
          backgroundColor: themeColors.card.DEFAULT,
          borderTopColor: themeColors.border.DEFAULT,
          paddingBottom: Math.max(insets.bottom, moderateScale(8, 0.3)),
          height: moderateScale(60, 0.2) + Math.max(insets.bottom, moderateScale(8, 0.3)),
          paddingTop: moderateScale(8, 0.3),
        },
      }}
    >
      <MainTabs.Screen
        name="Inspections"
        component={InspectionsNavigator}
        options={{
          tabBarIcon: ({ color, size }) => <ClipboardList size={moderateScale(size || 24, 0.2)} color={color} />,
        }}
      />
      <MainTabs.Screen
        name="Maintenance"
        component={MaintenanceNavigator}
        options={{
          tabBarIcon: ({ color, size }) => <Wrench size={moderateScale(size || 24, 0.2)} color={color} />,
        }}
      />
      <MainTabs.Screen
        name="Assets"
        component={AssetsNavigator}
        options={{
          tabBarIcon: ({ color, size }) => <Package size={moderateScale(size || 24, 0.2)} color={color} />,
        }}
      />
      <MainTabs.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{
          tabBarIcon: ({ color, size }) => <User size={moderateScale(size || 24, 0.2)} color={color} />,
        }}
      />
    </MainTabs.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { isDark } = useTheme();
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  // Function to check onboarding status - can be called from anywhere
  const checkOnboardingStatus = React.useCallback(async () => {
    if (isAuthenticated && !isLoading && user?.id) {
      try {
        setCheckingOnboarding(true);
        // Check if this specific user has completed onboarding
        const completed = await isOnboardingCompleted(user.id);
        setShowOnboarding(!completed);
        setOnboardingChecked(true);
        setCheckingOnboarding(false);
        if (__DEV__) {
          console.log(`[AppNavigator] User ${user.id} onboarding status: ${completed ? 'completed' : 'not completed'}, showOnboarding: ${!completed}`);
        }
      } catch (error) {
        console.error('[AppNavigator] Error checking onboarding:', error);
        setShowOnboarding(false);
        setOnboardingChecked(true);
        setCheckingOnboarding(false);
      }
    } else if (!isAuthenticated) {
      setCheckingOnboarding(false);
      setShowOnboarding(false);
      setOnboardingChecked(false);
    } else if (isAuthenticated && !user?.id) {
      // User is authenticated but no user ID - wait for user data
      console.log('[AppNavigator] User authenticated but no user ID yet, waiting...');
      setCheckingOnboarding(true);
      setOnboardingChecked(false);
    }
  }, [isAuthenticated, isLoading, user?.id, user?.email]);

  // Check onboarding status when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      checkOnboardingStatus();
    } else if (!isAuthenticated) {
      setCheckingOnboarding(false);
      setShowOnboarding(false);
      setOnboardingChecked(false);
    }
  }, [isAuthenticated, user?.id, checkOnboardingStatus]);

  // Show loading screen until we know onboarding status
  if (isLoading || (isAuthenticated && checkingOnboarding)) {
    return (
      <SafeAreaProvider>
        <NavigationContainer>
          <RootStack.Navigator screenOptions={{ headerShown: false }}>
            <RootStack.Screen name="Auth" component={AuthNavigator} />
          </RootStack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    );
  }

  if (__DEV__) {
    console.log('[AppNavigator] Render - isAuthenticated:', isAuthenticated, 'showOnboarding:', showOnboarding, 'onboardingChecked:', onboardingChecked);
  }

  // Determine initial route based on onboarding status
  const getInitialRoute = () => {
    if (!isAuthenticated) return 'Auth';
    if (isAuthenticated && onboardingChecked) {
      return showOnboarding ? 'Onboarding' : 'Main';
    }
    // If authenticated but onboarding not checked yet, default to Auth (shouldn't reach here due to loading check)
    return 'Auth';
  };

  // Determine which screens to render
  const shouldRenderAuth = !isAuthenticated;
  const shouldRenderOnboarding = isAuthenticated && onboardingChecked;
  const initialRoute = getInitialRoute();

  return (
    <NavigationContainer>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <RootStack.Navigator 
        key={`nav-${isAuthenticated}-${showOnboarding}-${onboardingChecked}`} // Force re-render when status changes
        screenOptions={{ headerShown: false }}
        initialRouteName={initialRoute}
      >
        {/* Always register Auth screen - it's needed for initial route when not authenticated */}
        <RootStack.Screen name="Auth" component={AuthNavigator} />
        
        {/* Only register authenticated screens when we know the onboarding status */}
        {shouldRenderOnboarding && (
          <>
            <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
            <RootStack.Screen name="Main" component={MainTabNavigator} />
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
