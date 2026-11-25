import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "./useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { useToast } from "./use-toast";
import {
  isViewingMessagingConversation,
  playMessageReceivedSound,
} from "@/lib/messageNotificationSound";
import { applyMessagingEvent } from "@/features/messaging/applyMessagingEvent";
import { setMessagingWsConnected } from "@/features/messaging/wsConnectionState";

export interface Notification {
  id: string;
  userId: string;
  organizationId: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  isRead: boolean;
  createdAt: Date | string;
}

export interface NotificationPopup {
  notification: Notification;
  onClose: () => void;
  onView: () => void;
}

export function useNotifications() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [popupNotification, setPopupNotification] = useState<Notification | null>(null);
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<Set<string>>(new Set());
  const [unreadCount, setUnreadCount] = useState(0);
  const reconnectAttempts = useRef(0);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const staleWatchRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPongAtRef = useRef(Date.now());
  const intentionalCloseRef = useRef(false);

  // Fetch notifications (messaging rows excluded server-side; filter defensively)
  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/notifications");
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      return list.filter((n: Notification) => n.type !== "direct_message");
    },
    enabled: isAuthenticated && !!user,
    refetchOnWindowFocus: true,
    refetchInterval: 60000, // Refetch every minute to catch notifications
  });

  // Fetch unread count
  const { data: unreadCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/notifications/unread-count");
      return await res.json();
    },
    enabled: isAuthenticated && !!user,
    refetchOnWindowFocus: true,
  });

  // Update unread count from query
  useEffect(() => {
    if (unreadCountData) {
      setUnreadCount(unreadCountData.count);
    }
  }, [unreadCountData]);

  // Show most recent unread notification on mount/login (if tenant logs in after notification was created)
  useEffect(() => {
    if (!isAuthenticated || !user || user.role !== "tenant") {
      return;
    }

    // Wait for notifications to load (they might be empty array initially)
    if (!notifications || notifications.length === 0) {
      return;
    }

    // Find the most recent unread notification (excluding dismissed ones)
    const unreadNotifications = notifications.filter(n => 
      !n.isRead && !dismissedNotificationIds.has(n.id)
    );
    
    if (unreadNotifications.length > 0 && !popupNotification) {
      // Sort by createdAt (newest first) and show the most recent one
      const sorted = unreadNotifications.sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });
      
      setPopupNotification(sorted[0]);
    }
  }, [notifications, isAuthenticated, user, popupNotification]);

  // Mark notification as read
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const res = await apiRequest("DELETE", `/api/notifications/${notificationId}`);
      return await res.json();
    },
    onSuccess: (_data, notificationId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      setPopupNotification((prev) => (prev?.id === notificationId ? null : prev));
      setDismissedNotificationIds((prev) => new Set(prev).add(notificationId));
    },
  });

  // WebSocket connection — resilient reconnect + central messaging cache updates
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setMessagingWsConnected(false);
      return;
    }

    intentionalCloseRef.current = false;

    const clearTimers = () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (staleWatchRef.current) {
        clearInterval(staleWatchRef.current);
        staleWatchRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (intentionalCloseRef.current || !isAuthenticated) return;
      if (reconnectTimeoutRef.current) return;
      reconnectAttempts.current += 1;
      const base = Math.min(1000 * Math.pow(2, Math.min(reconnectAttempts.current, 5)), 30_000);
      const jitter = Math.floor(Math.random() * 500);
      const delay = base + jitter;
      console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectTimeoutRef.current = null;
        connectWebSocket();
      }, delay);
    };

    const connectWebSocket = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          reconnectAttempts.current = 0;
          lastPongAtRef.current = Date.now();
          setMessagingWsConnected(true);

          // One sync after (re)connect — active thread only if on /messages/:id
          queryClient.invalidateQueries({ queryKey: ["/api/messaging/unread-count"] });
          queryClient.invalidateQueries({ queryKey: ["/api/messaging/conversations"] });
          const path = window.location.pathname.replace(/\/+$/, "");
          const match = path.match(/^\/messages\/([^/]+)$/);
          if (match?.[1]) {
            queryClient.invalidateQueries({
              queryKey: ["/api/messaging/conversations", match[1], "messages"],
            });
          }

          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(JSON.stringify({ type: "ping" }));
              } catch {
                /* ignore */
              }
            }
          }, 30_000);

          if (staleWatchRef.current) clearInterval(staleWatchRef.current);
          staleWatchRef.current = setInterval(() => {
            if (ws.readyState !== WebSocket.OPEN) return;
            if (Date.now() - lastPongAtRef.current > 70_000) {
              console.warn("[WebSocket] Stale connection — forcing reconnect");
              try {
                ws.close(4000, "stale");
              } catch {
                /* ignore */
              }
            }
          }, 15_000);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === "pong") {
              lastPongAtRef.current = Date.now();
              return;
            }

            if (data.type === "notification") {
              const notification = data.notification as Notification;
              // Messaging uses dedicated badge/dock — never surface in bell toasts
              if (notification.type === "direct_message") {
                return;
              }

              setUnreadCount((prev) => prev + 1);
              queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
              queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });

              const isFinance =
                typeof notification.type === "string" &&
                (notification.type.startsWith("quote_") ||
                  notification.type.startsWith("invoice_"));
              if (isFinance) {
                queryClient.invalidateQueries({
                  queryKey: ["/api/maintenance-finance/pending-count"],
                });
                queryClient.invalidateQueries({
                  queryKey: ["/api/maintenance-finance/tracking"],
                });
              }

              if (user.role === "tenant") {
                setPopupNotification(notification);
              } else {
                toast({
                  title: notification.title,
                  description: notification.message,
                });
              }
              return;
            }

            if (data.type === "unread_count") {
              setUnreadCount(data.count);
              return;
            }

            if (
              data.type === "messaging_message" ||
              data.type === "messaging_receipt" ||
              data.type === "messaging_typing" ||
              data.type === "messaging_presence" ||
              data.type === "messaging_unread_count"
            ) {
              if (
                data.type === "messaging_message" &&
                (data.event === "created" || data.event == null) &&
                data.message?.senderId &&
                data.message.senderId !== user.id &&
                data.message.conversationId &&
                !isViewingMessagingConversation(data.message.conversationId)
              ) {
                playMessageReceivedSound();
              }
              applyMessagingEvent(queryClient, data, user.id);
            }
          } catch {
            // Error parsing message
          }
        };

        ws.onerror = (error) => {
          console.warn("[WebSocket] Connection error:", error);
        };

        ws.onclose = (event) => {
          setMessagingWsConnected(false);
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
            pingIntervalRef.current = null;
          }
          if (staleWatchRef.current) {
            clearInterval(staleWatchRef.current);
            staleWatchRef.current = null;
          }
          wsRef.current = null;

          if (intentionalCloseRef.current) return;
          // Auth failure — do not loop forever
          if (event.code === 1008) {
            console.log("[WebSocket] Authentication failed");
            return;
          }
          scheduleReconnect();
        };
      } catch {
        setMessagingWsConnected(false);
        scheduleReconnect();
      }
    };

    connectWebSocket();

    const onOutbound = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      try {
        wsRef.current.send(JSON.stringify(detail));
      } catch {
        /* ignore */
      }
    };

    const onOnline = () => {
      reconnectAttempts.current = 0;
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        connectWebSocket();
      }
    };

    window.addEventListener("inspect360:messaging-outbound", onOutbound as EventListener);
    window.addEventListener("online", onOnline);

    return () => {
      intentionalCloseRef.current = true;
      window.removeEventListener("inspect360:messaging-outbound", onOutbound as EventListener);
      window.removeEventListener("online", onOnline);
      clearTimers();
      setMessagingWsConnected(false);
      if (wsRef.current) {
        try {
          wsRef.current.close(1000, "unmount");
        } catch {
          /* ignore */
        }
        wsRef.current = null;
      }
    };
  }, [isAuthenticated, user, queryClient, toast]);

  const handleClosePopup = useCallback(() => {
    // Mark notification as read when dismissed and track it as dismissed
    if (popupNotification) {
      if (!popupNotification.isRead) {
        markAsReadMutation.mutate(popupNotification.id);
      }
      // Track this notification as dismissed to prevent it from showing again
      setDismissedNotificationIds(prev => new Set(prev).add(popupNotification.id));
    }
    setPopupNotification(null);
  }, [popupNotification, markAsReadMutation]);

  const handleViewNotification = useCallback((notification: Notification) => {
    // Mark as read
    markAsReadMutation.mutate(notification.id);

    // Handle navigation based on notification type
    if (notification.type === "comparison_report_created" && notification.data?.reportId) {
      window.location.href = `/tenant/comparison-reports/${notification.data.reportId}`;
    } else if (
      notification.type === "inspection_review_requested" &&
      notification.data?.inspectionId
    ) {
      window.location.href = `/tenant/inspection-review/${notification.data.inspectionId}`;
    } else if (
      (notification.type === "quote_customer_accepted" ||
        notification.type === "quote_customer_declined" ||
        notification.type === "quote_customer_changes_requested" ||
        notification.type === "quote_sent") &&
      notification.data?.workOrderId &&
      notification.data?.quoteId
    ) {
      window.location.href = `/work-orders/${notification.data.workOrderId}/quotes/${notification.data.quoteId}`;
    } else if (
      notification.type === "invoice_sent" &&
      notification.data?.workOrderId &&
      notification.data?.invoiceId
    ) {
      window.location.href = `/work-orders/${notification.data.workOrderId}/invoices/${notification.data.invoiceId}`;
    } else if (
      notification.type?.startsWith("quote_") ||
      notification.type?.startsWith("invoice_")
    ) {
      window.location.href = "/maintenance/finance";
    } else if (notification.type === "maintenance_request_message") {
      if (user?.role === "tenant") {
        window.location.href = "/tenant/requests";
      } else {
        window.location.href = "/maintenance";
      }
    } else if (notification.type === "direct_message") {
      const conversationId = notification.data?.conversationId;
      window.location.href = conversationId
        ? `/messages/${conversationId}`
        : "/messages";
    }

    setPopupNotification(null);
  }, [markAsReadMutation, user?.role]);

  return {
    notifications,
    unreadCount,
    popupNotification,
    handleClosePopup,
    handleViewNotification,
    markAsRead: markAsReadMutation.mutate,
    deleteNotification: deleteNotificationMutation.mutate,
    isDeletingNotification: deleteNotificationMutation.isPending,
  };
}

