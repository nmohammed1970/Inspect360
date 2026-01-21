import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ClipboardList, Wrench, Package, User } from 'lucide-react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
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

// Inspections Stack
import InspectionsListScreen from '../screens/inspections/InspectionsListScreen';
import CreateInspectionScreen from '../screens/inspections/CreateInspectionScreen';
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
        name="CreateInspection" 
        component={CreateInspectionScreen}
        options={{ headerShown: false }}
      />
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
  
  return (
    <MainTabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#00D5CC',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: {
          paddingBottom: Math.max(insets.bottom, 8),
          height: 60 + Math.max(insets.bottom, 8),
        },
      }}
    >
      <MainTabs.Screen 
        name="Inspections" 
        component={InspectionsNavigator}
        options={{
          tabBarIcon: ({ color, size }) => <ClipboardList size={size} color={color} />,
        }}
      />
      <MainTabs.Screen 
        name="Maintenance" 
        component={MaintenanceNavigator}
        options={{
          tabBarIcon: ({ color, size }) => <Wrench size={size} color={color} />,
        }}
      />
      <MainTabs.Screen 
        name="Assets" 
        component={AssetsNavigator}
        options={{
          tabBarIcon: ({ color, size }) => <Package size={size} color={color} />,
        }}
      />
      <MainTabs.Screen 
        name="Profile" 
        component={ProfileNavigator}
        options={{
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
    </MainTabs.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) return null;

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <RootStack.Navigator screenOptions={{ headerShown: false }}>
          {isAuthenticated ? (
            <RootStack.Screen name="Main" component={MainTabNavigator} />
          ) : (
            <RootStack.Screen name="Auth" component={AuthNavigator} />
          )}
        </RootStack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
