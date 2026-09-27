import { apiRequestJson, getAPI_URL } from './api';
import * as ImageManipulator from 'expo-image-manipulator';

export type TenantTenancyResponse = {
  tenancy: {
    id: string;
    leaseStartDate?: string | null;
    leaseEndDate?: string | null;
    monthlyRent?: string | null;
    depositAmount?: string | null;
    isActive?: boolean | null;
    notes?: string | null;
    propertyId?: string | null;
    blockId?: string | null;
  };
  property?: {
    id: string;
    name?: string | null;
    address?: string | null;
    sqft?: number | null;
  } | null;
  block?: {
    id: string;
    name?: string | null;
    address?: string | null;
  } | null;
};

export type TenantCheckInInspection = {
  id: string;
  type?: string | null;
  status?: string | null;
  tenantApprovalStatus?: string | null;
  propertyId?: string | null;
  completedDate?: string | null;
  scheduledDate?: string | null;
};

export type TenantComparisonReport = {
  id: string;
  status?: string | null;
  tenantSignature?: string | null;
  operatorSignature?: string | null;
  propertyId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  propertyName?: string | null;
  totalEstimatedCost?: string | number | null;
  checkInInspectionId?: string | null;
  checkOutInspectionId?: string | null;
  property?: {
    id?: string;
    name?: string | null;
    address?: string | null;
  } | null;
};

export type TenantComparisonComment = {
  id: string;
  userId?: string;
  authorName?: string | null;
  authorRole?: string | null;
  content: string;
  isInternal?: boolean;
  createdAt?: string;
};

export type TenantMaintenanceRequest = {
  id: string;
  title?: string | null;
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  createdAt?: string | null;
  propertyId?: string | null;
  photoUrls?: string[] | null;
  aiSuggestedFixes?: string | null;
  assignedTo?: { firstName?: string; lastName?: string } | string | null;
};

export type CreateTenantMaintenancePayload = {
  title: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  photoUrls?: string[];
  aiSuggestedFixes?: string;
};

export type TenantMaintenanceChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string | null;
  aiSuggestedFixes?: string | null;
  createdAt: string;
};

export type TenantMaintenanceChat = {
  id: string;
  title: string;
  status: string;
  maintenanceRequestId?: string | null;
  createdAt: string;
  messages?: TenantMaintenanceChatMessage[];
};

export type TenantPortalOrganization = {
  id: string;
  name?: string | null;
  logoUrl?: string | null;
  brandingName?: string | null;
  brandingPrimaryColor?: string | null;
  updatedAt?: string | null;
  tenantPortalMaintenanceEnabled?: boolean | null;
  tenantPortalComparisonEnabled?: boolean | null;
  tenantPortalCommunityEnabled?: boolean | null;
  tenantPortalChatbotEnabled?: boolean | null;
};

export type TenantCommunityGroup = {
  id: string;
  name: string;
  description?: string | null;
  coverImageUrl?: string | null;
  memberCount?: number;
  postCount?: number;
  isMember?: boolean;
  status?: string | null;
};

export type TenantCommunityRules = {
  rules: string | null;
  version: number;
  hasAccepted: boolean;
};

export type TenantCommunityThread = {
  id: string;
  title: string;
  content: string;
  createdBy: string;
  creatorName: string;
  viewCount: number;
  replyCount: number;
  isPinned: boolean;
  isLocked: boolean;
  status: string;
  createdAt: string;
  lastActivityAt: string;
};

export type TenantCommunityPost = {
  id: string;
  content: string;
  createdBy: string;
  creatorName: string;
  isEdited: boolean;
  createdAt: string;
  attachments?: { id: string; fileUrl: string; fileName: string }[];
};

export type TenantCommunityThreadDetail = TenantCommunityThread & {
  group?: { id: string; name: string };
  posts?: TenantCommunityPost[];
  attachments?: { id: string; fileUrl: string; fileName: string }[];
};

export type TenantChatConversation = {
  id: string;
  title?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type TenantChatMessage = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | string;
  content: string;
  createdAt: string;
};

/**
 * Normalize camera/gallery assets to JPEG so OpenAI + object storage get a supported format.
 * iPhone photos are often HEIC — vision APIs reject those.
 */
export async function ensureJpegUri(uri: string): Promise<{ uri: string; mimeType: string }> {
  try {
    const result = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 0.85,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return { uri: result.uri, mimeType: 'image/jpeg' };
  } catch (e) {
    console.warn('[ensureJpegUri] manipulateAsync failed, using original:', e);
    return { uri, mimeType: 'image/jpeg' };
  }
}

/** Upload a local image URI to object storage; returns `/objects/...` path. */
export async function uploadTenantObject(
  uri: string,
  _mimeType: string = 'image/jpeg',
): Promise<string> {
  const { uri: uploadUri } = await ensureJpegUri(uri);

  const uploadUrlResponse = await fetch(`${getAPI_URL()}/api/objects/upload`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!uploadUrlResponse.ok) throw new Error('Failed to get upload URL');
  const { uploadURL } = await uploadUrlResponse.json();

  // Prefer arrayBuffer over blob — RN's Response.blob() copies via base64 and warns.
  const fileResponse = await fetch(uploadUri);
  const body = await fileResponse.arrayBuffer();
  const put = await fetch(uploadURL, {
    method: 'PUT',
    body,
    headers: { 'Content-Type': 'image/jpeg' },
  });
  if (!put.ok) throw new Error('Failed to upload file');

  let objectPath = uploadURL as string;
  if (objectPath.includes('?objectId=') || objectPath.includes('&objectId=')) {
    try {
      const objectId = new URL(uploadURL, getAPI_URL()).searchParams.get('objectId');
      if (objectId) objectPath = `/objects/${objectId}`;
    } catch {
      const match = String(uploadURL).match(/[?&]objectId=([^&]+)/);
      if (match?.[1]) objectPath = `/objects/${match[1]}`;
    }
  } else if (objectPath.includes('/objects/')) {
    const match = objectPath.match(/\/objects\/[^?]+/);
    if (match) objectPath = match[0];
  }

  const absoluteUrl = objectPath.startsWith('http')
    ? objectPath
    : `${getAPI_URL()}${objectPath.startsWith('/') ? objectPath : `/${objectPath}`}`;

  const acl = await fetch(`${getAPI_URL()}/api/objects/set-acl`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photoUrl: absoluteUrl }),
  });
  if (!acl.ok) throw new Error('Failed to finalize upload');
  const data = await acl.json().catch(() => ({}));
  return (data.objectPath as string) || objectPath;
}

export const tenantService = {
  getTenancy(): Promise<TenantTenancyResponse> {
    return apiRequestJson<TenantTenancyResponse>('GET', '/api/tenant/tenancy');
  },

  getCheckIns(): Promise<TenantCheckInInspection[]> {
    return apiRequestJson<TenantCheckInInspection[]>('GET', '/api/tenant/check-ins');
  },

  getComparisonReports(): Promise<TenantComparisonReport[]> {
    return apiRequestJson<TenantComparisonReport[]>('GET', '/api/tenant/comparison-reports');
  },

  getComparisonReport(id: string): Promise<any> {
    return apiRequestJson<any>('GET', `/api/tenant/comparison-reports/${id}`);
  },

  getComparisonComments(reportId: string): Promise<TenantComparisonComment[]> {
    return apiRequestJson<TenantComparisonComment[]>(
      'GET',
      `/api/tenant/comparison-reports/${reportId}/comments`,
    );
  },

  addComparisonComment(reportId: string, content: string): Promise<TenantComparisonComment> {
    return apiRequestJson<TenantComparisonComment>(
      'POST',
      `/api/tenant/comparison-reports/${reportId}/comments`,
      { content },
    );
  },

  /** Signature must be a PNG data URL (same as web tenant portal). */
  signComparisonReport(reportId: string, signature: string): Promise<any> {
    return apiRequestJson('POST', `/api/tenant/comparison-reports/${reportId}/sign`, { signature });
  },

  disputeComparisonItem(
    reportId: string,
    itemId: string,
    reason: string,
  ): Promise<{ item: any; message?: string; aiCostNotes?: string }> {
    return apiRequestJson('POST', `/api/tenant/comparison-reports/${reportId}/items/${itemId}/dispute`, {
      reason,
    });
  },

  getMaintenanceRequests(): Promise<TenantMaintenanceRequest[]> {
    return apiRequestJson<TenantMaintenanceRequest[]>('GET', '/api/tenant/maintenance-requests');
  },

  createMaintenanceRequest(payload: CreateTenantMaintenancePayload): Promise<TenantMaintenanceRequest> {
    return apiRequestJson<TenantMaintenanceRequest>('POST', '/api/tenant/maintenance-requests', payload);
  },

  getMaintenanceChats(): Promise<TenantMaintenanceChat[]> {
    return apiRequestJson<TenantMaintenanceChat[]>('GET', '/api/tenant/maintenance-chats');
  },

  getMaintenanceChat(chatId: string): Promise<TenantMaintenanceChat> {
    return apiRequestJson<TenantMaintenanceChat>('GET', `/api/tenant/maintenance-chats/${chatId}`);
  },

  sendMaintenanceChatMessage(data: {
    chatId?: string;
    message: string;
    imageUrl?: string;
  }): Promise<{
    chatId: string;
    userMessage: TenantMaintenanceChatMessage;
    assistantMessage: TenantMaintenanceChatMessage;
  }> {
    return apiRequestJson('POST', '/api/tenant/maintenance-chat/message', data);
  },

  createMaintenanceRequestFromChat(chatId: string): Promise<TenantMaintenanceRequest> {
    return apiRequestJson<TenantMaintenanceRequest>('POST', '/api/tenant/maintenance-chat/create-request', {
      chatId,
    });
  },

  analyzeMaintenanceImage(imageUrl: string, issueDescription: string): Promise<{ suggestedFixes: string }> {
    return apiRequestJson<{ suggestedFixes: string }>('POST', '/api/maintenance/analyze-image', {
      imageUrl,
      issueDescription,
    });
  },

  getOrganization(organizationId: string): Promise<TenantPortalOrganization> {
    return apiRequestJson<TenantPortalOrganization>('GET', `/api/organizations/${organizationId}`);
  },

  getCommunityGroups(): Promise<TenantCommunityGroup[]> {
    return apiRequestJson<TenantCommunityGroup[]>('GET', '/api/tenant-portal/community/groups');
  },

  getCommunityRules(): Promise<TenantCommunityRules> {
    return apiRequestJson<TenantCommunityRules>('GET', '/api/tenant-portal/community/rules');
  },

  acceptCommunityRules(): Promise<any> {
    return apiRequestJson('POST', '/api/tenant-portal/community/rules/accept');
  },

  joinCommunityGroup(groupId: string): Promise<any> {
    return apiRequestJson('POST', `/api/tenant-portal/community/groups/${groupId}/join`);
  },

  createCommunityGroup(data: { name: string; description?: string }): Promise<TenantCommunityGroup> {
    return apiRequestJson<TenantCommunityGroup>('POST', '/api/tenant-portal/community/groups', data);
  },

  getCommunityThreads(groupId: string): Promise<TenantCommunityThread[]> {
    return apiRequestJson<TenantCommunityThread[]>(
      'GET',
      `/api/tenant-portal/community/groups/${groupId}/threads`,
    );
  },

  getCommunityThread(threadId: string): Promise<TenantCommunityThreadDetail> {
    return apiRequestJson<TenantCommunityThreadDetail>(
      'GET',
      `/api/tenant-portal/community/threads/${threadId}`,
    );
  },

  createCommunityThread(
    groupId: string,
    data: { title: string; content: string },
  ): Promise<TenantCommunityThread> {
    return apiRequestJson<TenantCommunityThread>(
      'POST',
      `/api/tenant-portal/community/groups/${groupId}/threads`,
      data,
    );
  },

  createCommunityPost(threadId: string, data: { content: string }): Promise<TenantCommunityPost> {
    return apiRequestJson<TenantCommunityPost>(
      'POST',
      `/api/tenant-portal/community/threads/${threadId}/posts`,
      data,
    );
  },

  flagCommunityContent(data: {
    threadId?: string;
    postId?: string;
    reason: string;
    details?: string;
  }): Promise<any> {
    return apiRequestJson('POST', '/api/tenant-portal/community/flag', data);
  },

  getChatConversations(): Promise<TenantChatConversation[]> {
    return apiRequestJson<TenantChatConversation[]>('GET', '/api/chat/conversations');
  },

  createChatConversation(title: string): Promise<TenantChatConversation> {
    return apiRequestJson<TenantChatConversation>('POST', '/api/chat/conversations', { title });
  },

  getChatMessages(conversationId: string): Promise<TenantChatMessage[]> {
    return apiRequestJson<TenantChatMessage[]>(
      'GET',
      `/api/chat/conversations/${conversationId}/messages`,
    );
  },

  sendChatMessage(conversationId: string, content: string): Promise<TenantChatMessage> {
    return apiRequestJson<TenantChatMessage>(
      'POST',
      `/api/chat/conversations/${conversationId}/messages`,
      { content },
    );
  },

  forgotPassword(email: string): Promise<{ message?: string }> {
    return apiRequestJson<{ message?: string }>('POST', '/api/forgot-password', { email });
  },
};
