import type { NavigatorScreenParams } from '@react-navigation/native';

export type AuthStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
  ResetPassword: { email?: string } | undefined;
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

export type WorkOrdersStackParamList = {
  WorkOrdersList: undefined;
  WorkOrderDetail: { workOrderId: string };
};

export type MainTabParamList = {
  Inspections: NavigatorScreenParams<InspectionsStackParamList>;
  Maintenance: NavigatorScreenParams<MaintenanceStackParamList>;
  WorkOrders: NavigatorScreenParams<WorkOrdersStackParamList>;
  Assets: NavigatorScreenParams<AssetsStackParamList>;
};

/** Ops shell: tab bar + profile pushed from top-right avatar (like web). */
export type OpsStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList>;
  Profile: undefined;
};

export type TenantHomeStackParamList = {
  TenantHome: undefined;
  TenantInspectionPreview: { inspectionId: string };
  TenantComparisonPreview: { reportId: string };
};

export type TenantMaintenanceStackParamList = {
  TenantMaintenanceRequests: undefined;
  TenantCreateRequest:
    | {
        title?: string;
        description?: string;
        priority?: 'low' | 'medium' | 'high';
        photoUrls?: string[];
        aiSuggestedFixes?: string;
      }
    | undefined;
  TenantMaintenanceDetail: { requestId: string };
  TenantAiMaintenanceHelp: undefined;
  TenantAiMaintenanceChat: { chatId?: string } | undefined;
};

export type TenantComparisonsStackParamList = {
  TenantComparisonsList: undefined;
  TenantComparisonPreview: { reportId: string };
};

export type TenantCommunityStackParamList = {
  TenantCommunityGroups: undefined;
  TenantCommunityThreads: { groupId: string; groupName: string; isMember?: boolean };
  TenantCommunityThread: { threadId: string; groupName?: string };
};

export type TenantTabParamList = {
  TenantHomeTab: NavigatorScreenParams<TenantHomeStackParamList>;
  TenantMaintenanceTab: NavigatorScreenParams<TenantMaintenanceStackParamList>;
  TenantComparisonsTab: NavigatorScreenParams<TenantComparisonsStackParamList>;
  TenantCommunityTab: NavigatorScreenParams<TenantCommunityStackParamList>;
  TenantProfileTab: NavigatorScreenParams<ProfileStackParamList>;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Onboarding: undefined;
  Main: NavigatorScreenParams<OpsStackParamList>;
  TenantMain: NavigatorScreenParams<TenantTabParamList>;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
