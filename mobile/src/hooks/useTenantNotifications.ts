import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { getAPI_URL } from '../services/api';
import {
  notificationsService,
  type AppNotification,
} from '../services/notifications';

function buildWsUrl(): string {
  const api = getAPI_URL().replace(/\/$/, '');
  if (api.startsWith('https://')) return `wss://${api.slice('https://'.length)}/ws`;
  if (api.startsWith('http://')) return `ws://${api.slice('http://'.length)}/ws`;
  return `wss://${api}/ws`;
}

/**
 * Tenant notifications: REST poll (reliable) + WebSocket (live), matching web useNotifications.
 * Native cookie jar from credentials:include fetch is used for /ws when the platform shares it.
 */
export function useTenantNotifications() {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const isTenant = user?.role === 'tenant';
  const enabled = isAuthenticated && !!user && isTenant;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const [popupNotification, setPopupNotification] = useState<AppNotification | null>(null);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<Set<string>>(
    () => new Set(),
  );
  const dismissedRef = useRef<Set<string>>(new Set());
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    dismissedRef.current = dismissedNotificationIds;
  }, [dismissedNotificationIds]);

  const notificationsQuery = useQuery({
    queryKey: ['/api/notifications'],
    queryFn: () => notificationsService.list(),
    enabled,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  const unreadQuery = useQuery({
    queryKey: ['/api/notifications/unread-count'],
    queryFn: () => notificationsService.unreadCount(),
    enabled,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (unreadQuery.data?.count != null) {
      setUnreadCount(unreadQuery.data.count);
    }
  }, [unreadQuery.data?.count]);

  const notifications = notificationsQuery.data ?? [];

  // Show most recent unread on login / load (parity with web)
  useEffect(() => {
    if (!enabled || notifications.length === 0) return;
    if (popupNotification) return;

    const unread = notifications
      .filter((n) => !n.isRead && !dismissedNotificationIds.has(n.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    if (unread.length > 0) {
      setPopupNotification(unread[0]);
    }
  }, [enabled, notifications, popupNotification, dismissedNotificationIds]);

  const markAsReadMutation = useMutation({
    mutationFn: (id: string) => notificationsService.markRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
    },
  });

  const invalidateRelated = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['/api/notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['/api/notifications/unread-count'] });
    void queryClient.invalidateQueries({ queryKey: ['/api/tenant/check-ins'] });
    void queryClient.invalidateQueries({ queryKey: ['/api/tenant/comparison-reports'] });
  }, [queryClient]);

  const connectWebSocket = useCallback(() => {
    if (!enabled) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const wsUrl = buildWsUrl();
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        reconnectAttempts.current = 0;
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30_000);
        wsRef.current = ws;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data));
            if (data.type === 'notification') {
            const notification = data.notification as AppNotification;
            setUnreadCount((prev) => prev + 1);
            invalidateRelated();
            if (!dismissedRef.current.has(notification.id)) {
              setPopupNotification(notification);
            }
          } else if (data.type === 'unread_count') {
            setUnreadCount(typeof data.count === 'number' ? data.count : 0);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        // onclose handles reconnect
      };

      ws.onclose = (event) => {
        wsRef.current = null;
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        if (event.code === 1000 || event.code === 1008) return;
        if (reconnectAttempts.current < maxReconnectAttempts && enabled) {
          reconnectAttempts.current += 1;
          const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30_000);
          reconnectTimeoutRef.current = setTimeout(() => connectWebSocket(), delay);
        }
      };
    } catch (error) {
      console.warn('[TenantNotifications] WebSocket connect failed:', error);
    }
  }, [enabled, invalidateRelated]);

  const disconnectWebSocket = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close(1000);
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      disconnectWebSocket();
      return;
    }
    connectWebSocket();
    return () => disconnectWebSocket();
  }, [enabled, connectWebSocket, disconnectWebSocket]);

  // Refresh when app returns to foreground
  useEffect(() => {
    if (!enabled) return;
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        void notificationsQuery.refetch();
        void unreadQuery.refetch();
        connectWebSocket();
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [enabled, notificationsQuery, unreadQuery, connectWebSocket]);

  const handleClosePopup = useCallback(() => {
    if (popupNotification) {
      if (!popupNotification.isRead) {
        markAsReadMutation.mutate(popupNotification.id);
      }
      setDismissedNotificationIds((prev) => new Set(prev).add(popupNotification.id));
    }
    setPopupNotification(null);
  }, [popupNotification, markAsReadMutation]);

  const handleViewNotification = useCallback(
    (notification: AppNotification) => {
      markAsReadMutation.mutate(notification.id);
      setDismissedNotificationIds((prev) => new Set(prev).add(notification.id));
      setPopupNotification(null);
      return notification;
    },
    [markAsReadMutation],
  );

  return {
    notifications,
    unreadCount,
    popupNotification,
    handleClosePopup,
    handleViewNotification,
    markAsRead: markAsReadMutation.mutate,
    isLoading: notificationsQuery.isLoading,
  };
}
