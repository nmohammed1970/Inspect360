import React from 'react';
import { Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../contexts/AuthContext';
import LoginScreen from '../screens/auth/LoginScreen';
import InspectionsListScreen from '../screens/inspections/InspectionsListScreen';
import InspectionCaptureScreen from '../screens/inspections/InspectionCaptureScreen';
import InspectionReviewScreen from '../screens/inspections/InspectionReviewScreen';
import MaintenanceListScreen from '../screens/maintenance/MaintenanceListScreen';
import MaintenanceDetailScreen from '../screens/maintenance/MaintenanceDetailScreen';
import CreateMaintenanceScreen from '../screens/maintenance/CreateMaintenanceScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import AssetInventoryListScreen from '../screens/assets/AssetInventoryListScreen';
import type {
  RootStackParamList,
  AuthStackParamList,
  MainTabParamList,
  InspectionsStackParamList,
  MaintenanceStackParamList,
  ProfileStackParamList,
  AssetsStackParamList,
} from './types';

// Using simple text icons for now - can be replaced with lucide-react-native or react-native-vector-icons
const ClipboardCheck = ({ size, color }: { size: number; color: string }) => (
  <Text style={{ fontSize: size, color }}>📋</Text>
);
const Wrench = ({ size, color }: { size: number; color: string }) => (
  <Text style={{ fontSize: size, color }}>🔧</Text>
);
const User = ({ size, color }: { size: number; color: string }) => (
  <Text style={{ fontSize: size, color }}>👤</Text>
);
const Package = ({ size, color }: { size: number; color: string }) => (
  <Text style={{ fontSize: size, color }}>📦</Text>
);

const RootStack = createStackNavigator<RootStackParamList>();
const AuthStack = createStackNavigator<AuthStackParamList>();
const MainTabs = createBottomTabNavigator<MainTabParamList>();
const InspectionsStack = createStackNavigator<InspectionsStackParamList>();
const MaintenanceStack = createStackNavigator<MaintenanceStackParamList>();
const ProfileStack = createStackNavigator<ProfileStackParamList>();
const AssetsStack = createStackNavigator<AssetsStackParamList>();

function InspectionsNavigator() {
  return (
    <InspectionsStack.Navigator screenOptions={{ headerShown: true }}>
      <InspectionsStack.Screen
        name="InspectionsList"
        component={InspectionsListScreen}
        options={{ title: 'Inspections' }}
      />
      <InspectionsStack.Screen
        name="InspectionCapture"
        component={InspectionCaptureScreen}
        options={{ title: 'Capture Inspection' }}
      />
      <InspectionsStack.Screen
        name="InspectionReview"
        component={InspectionReviewScreen}
        options={{ title: 'Review Inspection' }}
      />
    </InspectionsStack.Navigator>
  );
}

function MaintenanceNavigator() {
  return (
    <MaintenanceStack.Navigator screenOptions={{ headerShown: true }}>
      <MaintenanceStack.Screen
        name="MaintenanceList"
        component={MaintenanceListScreen}
        options={{ title: 'Maintenance' }}
      />
      <MaintenanceStack.Screen
        name="MaintenanceDetail"
        component={MaintenanceDetailScreen}
        options={{ title: 'Maintenance Details' }}
      />
      <MaintenanceStack.Screen
        name="CreateMaintenance"
        component={CreateMaintenanceScreen}
        options={{ title: 'Create Maintenance' }}
      />
    </MaintenanceStack.Navigator>
  );
}

function ProfileNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: true }}>
      <ProfileStack.Screen
        name="ProfileHome"
        component={ProfileScreen}
        options={{ title: 'Profile' }}
      />
    </ProfileStack.Navigator>
  );
}

function AssetsNavigator() {
  return (
    <AssetsStack.Navigator screenOptions={{ headerShown: true }}>
      <AssetsStack.Screen
        name="AssetInventoryList"
        component={AssetInventoryListScreen}
        options={{ title: 'Asset Inventory' }}
      />
    </AssetsStack.Navigator>
  );
}

function MainNavigator() {
  return (
    <MainTabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#999',
      }}
    >
      <MainTabs.Screen
        name="Inspections"
        component={InspectionsNavigator}
        options={{
          tabBarIcon: ({ color, size }) => (
            <ClipboardCheck size={size} color={color} />
          ),
        }}
      />
      <MainTabs.Screen
        name="Maintenance"
        component={MaintenanceNavigator}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Wrench size={size} color={color} />
          ),
        }}
      />
      <MainTabs.Screen
        name="Assets"
        component={AssetsNavigator}
        options={{
          tabBarIcon: ({ color, size }) => (
            <Package size={size} color={color} />
          ),
        }}
      />
      <MainTabs.Screen
        name="Profile"
        component={ProfileNavigator}
        options={{
          tabBarIcon: ({ color, size }) => (
            <User size={size} color={color} />
          ),
        }}
      />
    </MainTabs.Navigator>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
    </AuthStack.Navigator>
  );
}

export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null; // Or a loading screen
  }

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <RootStack.Screen name="Main" component={MainNavigator} />
        ) : (
          <RootStack.Screen name="Auth" component={AuthNavigator} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

