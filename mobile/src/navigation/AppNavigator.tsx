import React, { useState, useEffect } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { DefaultTheme, DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  ClipboardList,
  Wrench,
  Package,
  Home,
  FileCheck,
  Users,
  Clipboard,
} from 'lucide-react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth, isTenantRole } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTenantPortalFlags } from '../hooks/useTenantPortalFlags';
import { useTenantEntitlement } from '../hooks/useTenantEntitlement';
import { colors } from '../theme';
import { moderateScale } from '../utils/responsive';
import { isOnboardingCompleted } from '../utils/onboarding';
import { tenantTabNavigationRef } from './tenantTabNavigation';
import type {
  RootStackParamList,
  AuthStackParamList,
  MainTabParamList,
  OpsStackParamList,
  InspectionsStackParamList,
  MaintenanceStackParamList,
  WorkOrdersStackParamList,
  ProfileStackParamList,
  AssetsStackParamList,
  TenantTabParamList,
  TenantHomeStackParamList,
  TenantMaintenanceStackParamList,
  TenantComparisonsStackParamList,
  TenantCommunityStackParamList,
} from './types';
import type { NavigationProp } from '@react-navigation/native';

import LoginScreen from '../screens/auth/LoginScreen';

/** Paint a contrast strip in the Android gesture inset so the system handle stays visible on light UIs. */
function TabBarSystemContrast({
  barColor,
  insetColor,
  insetHeight,
}: {
  barColor: string;
  insetColor: string;
  insetHeight: number;
}) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={{ flex: 1, backgroundColor: barColor }} />
      {Platform.OS === 'android' && insetHeight > 0 ? (
        <View style={{ height: insetHeight, backgroundColor: insetColor }} />
      ) : null}
    </View>
  );
}

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const InspectionsStack = createNativeStackNavigator<InspectionsStackParamList>();
const MaintenanceStack = createNativeStackNavigator<MaintenanceStackParamList>();
const WorkOrdersStack = createNativeStackNavigator<WorkOrdersStackParamList>();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const AssetsStack = createNativeStackNavigator<AssetsStackParamList>();
const MainTabs = createBottomTabNavigator<MainTabParamList>();
const OpsStack = createNativeStackNavigator<OpsStackParamList>();

const TenantTabs = createBottomTabNavigator<TenantTabParamList>();
const TenantHomeStack = createNativeStackNavigator<TenantHomeStackParamList>();
const TenantMaintenanceStackNav = createNativeStackNavigator<TenantMaintenanceStackParamList>();
const TenantComparisonsStackNav = createNativeStackNavigator<TenantComparisonsStackParamList>();
const TenantCommunityStackNav = createNativeStackNavigator<TenantCommunityStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator id="AuthStack" screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen
        name="ForgotPassword"
        getComponent={() => require('../screens/auth/ForgotPasswordScreen').default}
      />
      <AuthStack.Screen
        name="ResetPassword"
        getComponent={() => require('../screens/auth/ResetPasswordScreen').default}
      />
    </AuthStack.Navigator>
  );
}

function InspectionsNavigator() {
  return (
    <InspectionsStack.Navigator id="InspectionsStack" screenOptions={{ headerShown: false }}>
      <InspectionsStack.Screen
        name="InspectionsList"
        getComponent={() => require('../screens/inspections/InspectionsListScreen').default}
      />
      <InspectionsStack.Screen
        name="InspectionCapture"
        getComponent={() => require('../screens/inspections/InspectionCaptureScreen').default}
        options={{ headerShown: false }}
      />
      <InspectionsStack.Screen
        name="InspectionReview"
        getComponent={() => require('../screens/inspections/InspectionReviewScreen').default}
        options={{ headerShown: false }}
      />
      <InspectionsStack.Screen
        name="InspectionReport"
        getComponent={() => require('../screens/inspections/InspectionReportScreen').default}
        options={{ headerShown: false }}
      />
    </InspectionsStack.Navigator>
  );
}

function MaintenanceNavigator() {
  return (
    <MaintenanceStack.Navigator id="MaintenanceStack" screenOptions={{ headerShown: false }}>
      <MaintenanceStack.Screen
        name="MaintenanceList"
        getComponent={() => require('../screens/maintenance/MaintenanceListScreen').default}
      />
      <MaintenanceStack.Screen
        name="MaintenanceDetail"
        getComponent={() => require('../screens/maintenance/MaintenanceDetailScreen').default}
        options={{ headerShown: false }}
      />
      <MaintenanceStack.Screen
        name="CreateMaintenance"
        getComponent={() => require('../screens/maintenance/CreateMaintenanceScreen').default}
        options={{ headerShown: false }}
      />
    </MaintenanceStack.Navigator>
  );
}

function WorkOrdersNavigator() {
  return (
    <WorkOrdersStack.Navigator id="WorkOrdersStack" screenOptions={{ headerShown: false }}>
      <WorkOrdersStack.Screen
        name="WorkOrdersList"
        getComponent={() => require('../screens/workOrders/WorkOrdersListScreen').default}
      />
      <WorkOrdersStack.Screen
        name="WorkOrderDetail"
        getComponent={() => require('../screens/workOrders/WorkOrderDetailScreen').default}
      />
    </WorkOrdersStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator id="ProfileStack" screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen
        name="ProfileHome"
        getComponent={() => require('../screens/profile/ProfileScreen').default}
      />
    </ProfileStack.Navigator>
  );
}

function AssetsNavigator() {
  return (
    <AssetsStack.Navigator id="AssetsStack" screenOptions={{ headerShown: false }}>
      <AssetsStack.Screen
        name="AssetInventoryList"
        getComponent={() => require('../screens/assets/AssetInventoryListScreen').default}
      />
    </AssetsStack.Navigator>
  );
}

function MainTabNavigator() {
  const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
  const theme = useTheme();
  const themeColors = theme && theme.colors ? theme.colors : colors;
  const isDark = !!theme?.isDark;
  const barColor = themeColors.card.DEFAULT;
  const insetColor = isDark ? '#000000' : '#E8E8E8';
  const bottomInset = Math.max(insets.bottom, moderateScale(8, 0.3));

  return (
    <MainTabs.Navigator
      id="MainTabs"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: themeColors.background },
        tabBarActiveTintColor: themeColors.primary.DEFAULT,
        tabBarInactiveTintColor: themeColors.text.secondary,
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopColor: themeColors.border.DEFAULT,
          paddingBottom: bottomInset,
          height: moderateScale(60, 0.2) + bottomInset,
          paddingTop: moderateScale(8, 0.3),
        },
        tabBarBackground: () => (
          <TabBarSystemContrast
            barColor={barColor}
            insetColor={insetColor}
            insetHeight={insets.bottom}
          />
        ),
        tabBarLabelStyle: {
          fontSize: moderateScale(10, 0.2),
          maxWidth: moderateScale(72, 0.3),
        },
        tabBarAllowFontScaling: true,
      }}
    >
      <MainTabs.Screen
        name="Inspections"
        component={InspectionsNavigator}
        options={{
          tabBarIcon: ({ color, size }) => (
            <ClipboardList size={moderateScale(size || 24, 0.2)} color={color} />
          ),
        }}
      />
      <MainTabs.Screen
        name="Maintenance"
        component={MaintenanceNavigator}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Wrench size={moderateScale(size || 24, 0.2)} color={color} />
          ),
        }}
      />
      <MainTabs.Screen
        name="WorkOrders"
        component={WorkOrdersNavigator}
        options={{
          title: 'Work Orders',
          tabBarIcon: ({ color, size }) => (
            <Clipboard size={moderateScale(size || 24, 0.2)} color={color} />
          ),
        }}
      />
      <MainTabs.Screen
        name="Assets"
        component={AssetsNavigator}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Package size={moderateScale(size || 24, 0.2)} color={color} />
          ),
        }}
      />
    </MainTabs.Navigator>
  );
}

function OpsNavigator() {
  return (
    <OpsStack.Navigator id="OpsStack" screenOptions={{ headerShown: false }}>
      <OpsStack.Screen name="Tabs" component={MainTabNavigator} />
      <OpsStack.Screen
        name="Profile"
        getComponent={() => require('../screens/profile/ProfileScreen').default}
      />
    </OpsStack.Navigator>
  );
}

function TenantHomeNavigator() {
  return (
    <TenantHomeStack.Navigator id="TenantHomeStack" screenOptions={{ headerShown: false }}>
      <TenantHomeStack.Screen
        name="TenantHome"
        getComponent={() => require('../screens/tenant/TenantHomeScreen').default}
      />
      <TenantHomeStack.Screen
        name="TenantInspectionPreview"
        getComponent={() => require('../screens/tenant/TenantInspectionPreviewScreen').default}
      />
      <TenantHomeStack.Screen
        name="TenantComparisonPreview"
        getComponent={() => require('../screens/tenant/TenantComparisonPreviewScreen').default}
      />
    </TenantHomeStack.Navigator>
  );
}

function TenantMaintenanceTabNavigator() {
  return (
    <TenantMaintenanceStackNav.Navigator id="TenantMaintenanceStack" screenOptions={{ headerShown: false }}>
      <TenantMaintenanceStackNav.Screen
        name="TenantMaintenanceRequests"
        getComponent={() => require('../screens/tenant/TenantMaintenanceRequestsScreen').default}
      />
      <TenantMaintenanceStackNav.Screen
        name="TenantCreateRequest"
        getComponent={() => require('../screens/tenant/TenantCreateRequestScreen').default}
      />
      <TenantMaintenanceStackNav.Screen
        name="TenantMaintenanceDetail"
        getComponent={() => require('../screens/tenant/TenantMaintenanceDetailScreen').default}
      />
      <TenantMaintenanceStackNav.Screen
        name="TenantAiMaintenanceHelp"
        getComponent={() => require('../screens/tenant/TenantAiMaintenanceHelpScreen').default}
      />
      <TenantMaintenanceStackNav.Screen
        name="TenantAiMaintenanceChat"
        getComponent={() =>
          require('../screens/tenant/TenantAiMaintenanceHelpScreen').TenantAiMaintenanceChatScreen
        }
      />
    </TenantMaintenanceStackNav.Navigator>
  );
}

function TenantComparisonsNavigator() {
  return (
    <TenantComparisonsStackNav.Navigator id="TenantComparisonsStack" screenOptions={{ headerShown: false }}>
      <TenantComparisonsStackNav.Screen
        name="TenantComparisonsList"
        getComponent={() => require('../screens/tenant/TenantComparisonsListScreen').default}
      />
      <TenantComparisonsStackNav.Screen
        name="TenantComparisonPreview"
        getComponent={() => require('../screens/tenant/TenantComparisonPreviewScreen').default}
      />
    </TenantComparisonsStackNav.Navigator>
  );
}

function TenantCommunityNavigator() {
  return (
    <TenantCommunityStackNav.Navigator id="TenantCommunityStack" screenOptions={{ headerShown: false }}>
      <TenantCommunityStackNav.Screen
        name="TenantCommunityGroups"
        getComponent={() => require('../screens/tenant/TenantCommunityGroupsScreen').default}
      />
      <TenantCommunityStackNav.Screen
        name="TenantCommunityThreads"
        getComponent={() => require('../screens/tenant/TenantCommunityThreadsScreen').default}
      />
      <TenantCommunityStackNav.Screen
        name="TenantCommunityThread"
        getComponent={() => require('../screens/tenant/TenantCommunityThreadScreen').default}
      />
    </TenantCommunityStackNav.Navigator>
  );
}

function TenantMainNavigator() {
  const insets = useSafeAreaInsets() || { top: 0, bottom: 0, left: 0, right: 0 };
  const theme = useTheme();
  const themeColors = theme && theme.colors ? theme.colors : colors;
  const isDark = !!theme?.isDark;
  const flags = useTenantPortalFlags();
  const { locked: entitlementLocked } = useTenantEntitlement();
  const activeColor = flags.brandingPrimaryColor || themeColors.primary.DEFAULT;
  const TenantAIChatbot = require('../components/TenantAIChatbot').default;
  const TenantEntitlementLockHost = require('../components/TenantEntitlementLockHost').default;
  const TenantNotificationHost = require('../components/TenantNotificationHost').default;
  const barColor = themeColors.card.DEFAULT;
  const insetColor = isDark ? '#000000' : '#E8E8E8';
  const bottomInset = Math.max(insets.bottom, moderateScale(8, 0.3));

  const captureTabNav = (navigation: NavigationProp<TenantTabParamList>) => {
    tenantTabNavigationRef.current = navigation;
  };

  // When entitlement is locked, hide module tabs (Home + Profile remain) — parity with web locked paths
  const showMaintenance = flags.maintenanceEnabled && !entitlementLocked;
  const showComparison = flags.comparisonEnabled && !entitlementLocked;
  const showCommunity = flags.communityEnabled && !entitlementLocked;

  return (
    <View style={{ flex: 1 }}>
      <TenantTabs.Navigator
        id="TenantTabs"
        screenListeners={({ navigation }) => ({
          focus: () => captureTabNav(navigation as NavigationProp<TenantTabParamList>),
          state: () => captureTabNav(navigation as NavigationProp<TenantTabParamList>),
        })}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: themeColors.background },
          tabBarActiveTintColor: activeColor,
          tabBarInactiveTintColor: themeColors.text.secondary,
          tabBarStyle: {
            backgroundColor: 'transparent',
            borderTopColor: themeColors.border.DEFAULT,
            paddingBottom: bottomInset,
            height: moderateScale(60, 0.2) + bottomInset,
            paddingTop: moderateScale(8, 0.3),
          },
          tabBarBackground: () => (
            <TabBarSystemContrast
              barColor={barColor}
              insetColor={insetColor}
              insetHeight={insets.bottom}
            />
          ),
          tabBarLabelStyle: {
            fontSize: moderateScale(10, 0.2),
            maxWidth: moderateScale(64, 0.3),
          },
          tabBarAllowFontScaling: true,
        }}
      >
        <TenantTabs.Screen
          name="TenantHomeTab"
          component={TenantHomeNavigator}
          options={{
            title: 'Home',
            tabBarIcon: ({ color, size }) => (
              <Home size={moderateScale(size || 24, 0.2)} color={color} />
            ),
          }}
        />
        {showMaintenance ? (
          <TenantTabs.Screen
            name="TenantMaintenanceTab"
            component={TenantMaintenanceTabNavigator}
            options={{
              title: 'Maintenance',
              tabBarIcon: ({ color, size }) => (
                <Wrench size={moderateScale(size || 24, 0.2)} color={color} />
              ),
            }}
          />
        ) : null}
        {showComparison ? (
          <TenantTabs.Screen
            name="TenantComparisonsTab"
            component={TenantComparisonsNavigator}
            options={{
              title: 'Reports',
              tabBarIcon: ({ color, size }) => (
                <FileCheck size={moderateScale(size || 24, 0.2)} color={color} />
              ),
            }}
          />
        ) : null}
        {showCommunity ? (
          <TenantTabs.Screen
            name="TenantCommunityTab"
            component={TenantCommunityNavigator}
            options={{
              title: 'Community',
              tabBarIcon: ({ color, size }) => (
                <Users size={moderateScale(size || 24, 0.2)} color={color} />
              ),
            }}
          />
        ) : null}
        <TenantTabs.Screen
          name="TenantProfileTab"
          component={ProfileNavigator}
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, size }) => (
              <User size={moderateScale(size || 24, 0.2)} color={color} />
            ),
          }}
        />
      </TenantTabs.Navigator>
      <TenantAIChatbot />
      <TenantEntitlementLockHost />
      <TenantNotificationHost />
    </View>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const theme = useTheme();
  const themeColors = theme?.colors ?? colors;
  const isDark = !!theme?.isDark;
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  const isTenant = isTenantRole(user?.role);

  const navigationTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: themeColors.background,
      card: themeColors.background,
      border: themeColors.border?.DEFAULT ?? (isDark ? '#333' : '#e5e5e5'),
      text: themeColors.text?.primary ?? (isDark ? '#fff' : '#111'),
      primary: themeColors.primary?.DEFAULT ?? DefaultTheme.colors.primary,
    },
  };

  const stackScreenOptions = {
    headerShown: false as const,
    contentStyle: { backgroundColor: themeColors.background },
    // Native-stack statusBarStyle crashes iOS Expo Go — Android only.
    // 'dark' = dark icons on light chrome; 'light' = light icons on dark chrome.
    ...(Platform.OS === 'android'
      ? {
          statusBarStyle: (isDark ? 'light' : 'dark') as 'light' | 'dark',
          statusBarBackgroundColor: themeColors.background,
        }
      : {}),
  };

  const checkOnboardingStatus = React.useCallback(async () => {
    if (isAuthenticated && !isLoading && user?.id) {
      try {
        setCheckingOnboarding(true);
        // Tenants skip ops onboarding and go straight to the tenant portal
        if (isTenantRole(user.role)) {
          setShowOnboarding(false);
          setOnboardingChecked(true);
          setCheckingOnboarding(false);
          return;
        }
        const completed = await isOnboardingCompleted(user.id);
        setShowOnboarding(!completed);
        setOnboardingChecked(true);
        setCheckingOnboarding(false);
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
      setCheckingOnboarding(true);
      setOnboardingChecked(false);
    }
  }, [isAuthenticated, isLoading, user?.id, user?.role]);

  useEffect(() => {
    if (isAuthenticated && user?.id) {
      checkOnboardingStatus();
    } else if (!isAuthenticated) {
      setCheckingOnboarding(false);
      setShowOnboarding(false);
      setOnboardingChecked(false);
    }
  }, [isAuthenticated, user?.id, checkOnboardingStatus]);

  if (isLoading || (isAuthenticated && checkingOnboarding)) {
    return (
      <SafeAreaProvider>
        <NavigationContainer theme={navigationTheme}>
          <RootStack.Navigator id="RootStackLoading" screenOptions={stackScreenOptions}>
            <RootStack.Screen name="Auth" component={AuthNavigator} />
          </RootStack.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    );
  }

  const getInitialRoute = (): keyof RootStackParamList => {
    if (!isAuthenticated) return 'Auth';
    if (isAuthenticated && onboardingChecked) {
      if (isTenant) return 'TenantMain';
      return showOnboarding ? 'Onboarding' : 'Main';
    }
    return 'Auth';
  };

  const shouldRenderAuthenticated = isAuthenticated && onboardingChecked;
  const initialRoute = getInitialRoute();

  return (
    <NavigationContainer theme={navigationTheme}>
      <RootStack.Navigator
        id="RootStack"
        key={`nav-${isAuthenticated}-${isTenant}-${showOnboarding}-${onboardingChecked}`}
        screenOptions={stackScreenOptions}
        initialRouteName={initialRoute}
      >
        <RootStack.Screen name="Auth" component={AuthNavigator} />

        {shouldRenderAuthenticated && (
          <>
            {!isTenant && (
              <RootStack.Screen
                name="Onboarding"
                getComponent={() => require('../screens/onboarding/OnboardingScreen').default}
              />
            )}
            {!isTenant && <RootStack.Screen name="Main" component={OpsNavigator} />}
            {isTenant && <RootStack.Screen name="TenantMain" component={TenantMainNavigator} />}
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
