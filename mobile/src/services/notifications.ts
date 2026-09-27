import { apiRequestJson } from './api';

export type AppNotification = {
  id: string;
  userId: string;
  organizationId: string;
  type: string;
  title: string;
  message: string;
  data?: {
    reportId?: string;
    inspectionId?: string;
    [key: string]: unknown;
  };
  isRead: boolean;
  createdAt: string | Date;
};

export const notificationsService = {
  list(): Promise<AppNotification[]> {
    return apiRequestJson<AppNotification[]>('GET', '/api/notifications');
  },

  unreadCount(): Promise<{ count: number }> {
    return apiRequestJson<{ count: number }>('GET', '/api/notifications/unread-count');
  },

  markRead(notificationId: string): Promise<any> {
    return apiRequestJson('PATCH', `/api/notifications/${notificationId}/read`);
  },
};
