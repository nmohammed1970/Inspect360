import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
};

export type InspectionsStackParamList = {
  InspectionsList: undefined;
  InspectionCapture: { inspectionId: string };
  InspectionReview: { inspectionId: string };
  InspectionReport: { inspectionId: string };
};

export type MaintenanceStackParamList = {
  MaintenanceList: undefined;
  MaintenanceDetail: { requestId: string };
  CreateMaintenance: { 
    requestId?: string;
    inspectionId?: string; 
    propertyId?: string;
    blockId?: string;
    fieldLabel?: string; 
    photos?: string[];
    entryId?: string;
    sectionTitle?: string;
  } | undefined;
};

export type ProfileStackParamList = {
  ProfileHome: undefined;
  EditProfile: undefined;
  Documents: undefined;
  ChangePassword: undefined;
};

export type AssetsStackParamList = {
  AssetInventoryList: { 
    propertyId?: string; 
    blockId?: string; 
    autoOpen?: boolean;
    inspectionId?: string;
  } | undefined;
  AssetDetail: { assetId: string; propertyId: string };
};

export type MainTabParamList = {
  Inspections: NavigatorScreenParams<InspectionsStackParamList>;
  Maintenance: NavigatorScreenParams<MaintenanceStackParamList>;
  Profile: NavigatorScreenParams<ProfileStackParamList>;
  Assets: NavigatorScreenParams<AssetsStackParamList>;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

