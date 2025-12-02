import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import type { DatabaseStorage } from "./storage";
import { getSession } from "./auth";

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
    path: "/ws"
  });

  wss.on("connection", async (ws: WebSocket, req) => {
    // Extract session from cookies
    let userId: string | null = null;
    
    try {
      const session = await getSession(req);
      if (session && session.user && session.user.id) {
        userId = session.user.id;
      }
    } catch (error) {
      console.error("[WebSocket] Error getting session:", error);
      ws.close(1008, "Authentication failed");
      return;
    }

    if (!userId) {
      ws.close(1008, "Authentication required");
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
    });

    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        // Handle ping/pong for keepalive
        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        }
      } catch (error) {
        console.error("[WebSocket] Error parsing message:", error);
      }
    });
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

