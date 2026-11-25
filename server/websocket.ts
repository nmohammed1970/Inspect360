import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import type { DatabaseStorage } from "./storage";
import { getUserIdFromRequest } from "./auth";

export interface NotificationMessage {
  type: "notification";
  notification: {
    id: string;
    userId: string;
    organizationId: string;
    type: string;
    title: string;
    message: string;
    data?: any;
    isRead: boolean;
    createdAt: Date;
  };
}

// Map to store active WebSocket connections by userId
const connections = new Map<string, Set<WebSocket>>();

export function setupWebSocketServer(server: Server, storage: DatabaseStorage) {
  const wss = new WebSocketServer({ 
    server,
    path: "/ws",
    perMessageDeflate: false, // Disable compression to avoid issues
    clientTracking: true
  });

  wss.on("connection", async (ws: WebSocket, req) => {
    // Extract user ID from session cookies
    let userId: string | null = null;
    
    try {
      userId = await getUserIdFromRequest(req);
    } catch (error) {
      console.error("[WebSocket] Error getting session:", error);
      try {
        ws.close(1008, "Authentication failed");
      } catch (closeError) {
        // Connection might already be closed
      }
      return;
    }

    if (!userId) {
      console.warn("[WebSocket] Connection attempt without authentication");
      try {
        ws.close(1008, "Authentication required");
      } catch (closeError) {
        // Connection might already be closed
      }
      return;
    }

    // Add connection to user's connection set
    if (!connections.has(userId)) {
      connections.set(userId, new Set());
    }
    connections.get(userId)!.add(ws);

    console.log(`[WebSocket] User ${userId} connected. Total connections: ${connections.size}`);

    // Send current unread notification count on connection
    try {
      const count = await storage.getUnreadNotificationCount(userId);
      ws.send(JSON.stringify({
        type: "unread_count",
        count
      }));
    } catch (error) {
      console.error("[WebSocket] Error fetching unread count:", error);
    }

    ws.on("close", () => {
      if (userId) {
        const userConnections = connections.get(userId);
        if (userConnections) {
          userConnections.delete(ws);
          if (userConnections.size === 0) {
            connections.delete(userId);
          }
        }
      }
      console.log(`[WebSocket] User ${userId} disconnected. Total connections: ${connections.size}`);
    });

    ws.on("error", (error) => {
      console.error(`[WebSocket] Error for user ${userId}:`, error);
      // Try to clean up on error
      try {
        if (userId) {
          const userConnections = connections.get(userId);
          if (userConnections) {
            userConnections.delete(ws);
            if (userConnections.size === 0) {
              connections.delete(userId);
            }
          }
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
    });

    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Handle ping/pong for keepalive (+ presence heartbeat)
        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          if (userId) {
            try {
              const { touchLastSeen } = await import("./messaging/service");
              await touchLastSeen(userId);
            } catch {
              // ignore presence write failures
            }
          }
          return;
        }

        if (!userId) return;

        if (data.type === "messaging_typing" && typeof data.conversationId === "string") {
          const { handleTypingEvent } = await import("./messaging/service");
          await handleTypingEvent({
            userId,
            conversationId: data.conversationId,
            isTyping: Boolean(data.isTyping),
          });
          return;
        }

        if (data.type === "messaging_ack_delivered" && typeof data.messageId === "string") {
          const { ackMessageDelivered } = await import("./messaging/service");
          await ackMessageDelivered({ userId, messageId: data.messageId });
        }
      } catch (error) {
        console.error("[WebSocket] Error parsing message:", error);
      }
    });
  });

  wss.on("error", (error) => {
    console.error("[WebSocket] Server error:", error);
  });

  wss.on("listening", () => {
    console.log("[WebSocket] Server listening on /ws");
  });

  console.log("[WebSocket] Server initialized on /ws");
}

// Function to send notification to a specific user
export function sendNotificationToUser(userId: string, notification: NotificationMessage["notification"]) {
  const userConnections = connections.get(userId);
  
  if (!userConnections || userConnections.size === 0) {
    console.log(`[WebSocket] User ${userId} has no active connections. Notification will be delivered on next connection.`);
    return;
  }

  const message: NotificationMessage = {
    type: "notification",
    notification
  };

  // Send to all connections for this user (in case they're logged in on multiple devices)
  let sentCount = 0;
  userConnections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
        sentCount++;
      } catch (error) {
        console.error(`[WebSocket] Error sending notification to user ${userId}:`, error);
      }
    }
  });

  console.log(`[WebSocket] Sent notification to user ${userId} on ${sentCount} connection(s)`);
}

// Function to update unread count for a user
export function updateUnreadCount(userId: string, count: number) {
  const userConnections = connections.get(userId);
  
  if (!userConnections || userConnections.size === 0) {
    return;
  }

  userConnections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({
          type: "unread_count",
          count
        }));
      } catch (error) {
        console.error(`[WebSocket] Error sending unread count to user ${userId}:`, error);
      }
    }
  });
}

/** Generic WS payload fanout to all open connections for a user. */
export function sendWsPayloadToUser(userId: string, payload: Record<string, unknown>) {
  const userConnections = connections.get(userId);
  if (!userConnections || userConnections.size === 0) return;

  const raw = JSON.stringify(payload);
  userConnections.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(raw);
      } catch (error) {
        console.error(`[WebSocket] Error sending payload to user ${userId}:`, error);
      }
    }
  });
}

export function isUserConnected(userId: string): boolean {
  const userConnections = connections.get(userId);
  if (!userConnections || userConnections.size === 0) return false;
  for (const ws of userConnections) {
    if (ws.readyState === WebSocket.OPEN) return true;
  }
  return false;
}

