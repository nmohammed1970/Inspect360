import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "./useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../lib/queryClient";
import { useToast } from "./use-toast";

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
  const [unreadCount, setUnreadCount] = useState(0);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Fetch notifications
  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/notifications");
      const data = await res.json();
      return data;
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

    // Find the most recent unread notification
    const unreadNotifications = notifications.filter(n => !n.isRead);
    
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

  // WebSocket connection
  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    const connectWebSocket = () => {
      // Determine WebSocket URL based on current location
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;

      // Don't attempt connection if already connected
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        return;
      }

      try {
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          reconnectAttempts.current = 0;
          
          // Send ping to keep connection alive
          const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            } else {
              clearInterval(pingInterval);
            }
          }, 30000); // Ping every 30 seconds

          wsRef.current = ws;
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === "notification") {
              const notification = data.notification as Notification;

              // Update unread count
              setUnreadCount(prev => prev + 1);

              // Invalidate queries to fetch latest notifications
              queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
              queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });

              // Show popup for tenant users
              if (user.role === "tenant") {
                setPopupNotification(notification);
              } else {
                // Show toast for other users
                toast({
                  title: notification.title,
                  description: notification.message,
                });
              }
            } else if (data.type === "unread_count") {
              setUnreadCount(data.count);
            } else if (data.type === "pong") {
              // Keepalive response
            }
          } catch (error) {
            // Error parsing message
          }
        };

        ws.onerror = (error) => {
          // WebSocket error - log for debugging but don't show to user
          // The onclose handler will handle reconnection
          console.warn("[WebSocket] Connection error:", error);
        };

        ws.onclose = (event) => {
          wsRef.current = null;

          // Don't reconnect if it was a normal closure (code 1000) or authentication failure (1008)
          if (event.code === 1000 || event.code === 1008) {
            console.log("[WebSocket] Connection closed normally or authentication failed");
            return;
          }

          // Attempt to reconnect if we haven't exceeded max attempts
          if (reconnectAttempts.current < maxReconnectAttempts && isAuthenticated && user) {
            reconnectAttempts.current++;
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000); // Exponential backoff, max 30s
            
            console.log(`[WebSocket] Attempting to reconnect in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              connectWebSocket();
            }, delay);
          } else if (reconnectAttempts.current >= maxReconnectAttempts) {
            console.warn("[WebSocket] Max reconnection attempts reached");
          }
        };
      } catch (error) {
        // Failed to create WebSocket connection
      }
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [isAuthenticated, user, queryClient, toast]);

  const handleClosePopup = useCallback(() => {
    setPopupNotification(null);
  }, []);

  const handleViewNotification = useCallback((notification: Notification) => {
    // Mark as read
    markAsReadMutation.mutate(notification.id);

    // Handle navigation based on notification type
    if (notification.type === "comparison_report_created" && notification.data?.reportId) {
      window.location.href = `/tenant/comparison-reports/${notification.data.reportId}`;
    }

    setPopupNotification(null);
  }, [markAsReadMutation]);

  return {
    notifications,
    unreadCount,
    popupNotification,
    handleClosePopup,
    handleViewNotification,
    markAsRead: markAsReadMutation.mutate,
  };
}

