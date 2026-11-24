import type { Express, Response } from "express";
import { isAuthenticated, requireCompanyModule, requireRole } from "../auth";
import { storage } from "../storage";
import { notifyMaintenanceRequestMessage } from "./notifyMaintenanceRequestMessage";

const MAX_BODY_LEN = 4000;

function normalizeBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const body = raw.trim();
  if (!body) return null;
  if (body.length > MAX_BODY_LEN) return null;
  return body;
}

export function registerMaintenanceMessageRoutes(app: Express) {
  const staffGuards = [
    isAuthenticated,
    requireCompanyModule("maintenance"),
    requireRole("owner", "maintenance_admin", "contractor", "clerk"),
  ] as const;

  async function loadStaffRequest(req: any, res: Response) {
    const user = await storage.getUser(req.user.id);
    if (!user?.organizationId) {
      res.status(403).json({ message: "No organization found" });
      return null;
    }
    const request = await storage.getMaintenanceRequest(req.params.id);
    if (!request || request.organizationId !== user.organizationId) {
      res.status(404).json({ message: "Maintenance request not found" });
      return null;
    }
    return { user, request };
  }

  async function loadTenantRequest(req: any, res: Response) {
    const user = await storage.getUser(req.user.id);
    if (!user?.organizationId) {
      res.status(403).json({ message: "No organization found" });
      return null;
    }
    if (user.role !== "tenant") {
      res.status(403).json({ message: "Forbidden" });
      return null;
    }
    const request = await storage.getMaintenanceRequest(req.params.id);
    if (
      !request ||
      request.organizationId !== user.organizationId ||
      request.reportedBy !== user.id
    ) {
      res.status(404).json({ message: "Maintenance request not found" });
      return null;
    }
    return { user, request };
  }

  app.get(
    "/api/maintenance/:id/messages",
    ...staffGuards,
    async (req: any, res: Response) => {
      try {
        const loaded = await loadStaffRequest(req, res);
        if (!loaded) return;
        const messages = await storage.getMaintenanceRequestMessages(loaded.request.id);
        res.json(messages);
      } catch (error) {
        console.error("[mr-messages] staff list failed:", error);
        res.status(500).json({ message: "Failed to load discussion" });
      }
    },
  );

  app.post(
    "/api/maintenance/:id/messages",
    ...staffGuards,
    async (req: any, res: Response) => {
      try {
        const loaded = await loadStaffRequest(req, res);
        if (!loaded) return;
        const body = normalizeBody(req.body?.body);
        if (!body) {
          return res.status(400).json({
            message: `Message body is required (max ${MAX_BODY_LEN} characters)`,
          });
        }

        const message = await storage.createMaintenanceRequestMessage({
          organizationId: loaded.request.organizationId,
          maintenanceRequestId: loaded.request.id,
          authorUserId: loaded.user.id,
          body,
        });

        await notifyMaintenanceRequestMessage({
          organizationId: loaded.request.organizationId,
          maintenanceRequestId: loaded.request.id,
          messageId: message.id,
          requestTitle: loaded.request.title,
          authorUserId: loaded.user.id,
          authorRole: loaded.user.role,
          reportedBy: loaded.request.reportedBy,
          assignedTo: loaded.request.assignedTo,
        });

        const messages = await storage.getMaintenanceRequestMessages(loaded.request.id);
        const created = messages.find((m) => m.id === message.id) || {
          ...message,
          author: {
            id: loaded.user.id,
            firstName: loaded.user.firstName,
            lastName: loaded.user.lastName,
            role: loaded.user.role,
          },
        };
        res.status(201).json(created);
      } catch (error) {
        console.error("[mr-messages] staff post failed:", error);
        res.status(500).json({ message: "Failed to post message" });
      }
    },
  );

  app.get(
    "/api/tenant/maintenance-requests/:id/messages",
    isAuthenticated,
    requireCompanyModule("maintenance"),
    async (req: any, res: Response) => {
      try {
        const loaded = await loadTenantRequest(req, res);
        if (!loaded) return;
        const messages = await storage.getMaintenanceRequestMessages(loaded.request.id);
        res.json(messages);
      } catch (error) {
        console.error("[mr-messages] tenant list failed:", error);
        res.status(500).json({ message: "Failed to load discussion" });
      }
    },
  );

  app.post(
    "/api/tenant/maintenance-requests/:id/messages",
    isAuthenticated,
    requireCompanyModule("maintenance"),
    async (req: any, res: Response) => {
      try {
        const loaded = await loadTenantRequest(req, res);
        if (!loaded) return;
        const body = normalizeBody(req.body?.body);
        if (!body) {
          return res.status(400).json({
            message: `Message body is required (max ${MAX_BODY_LEN} characters)`,
          });
        }

        const message = await storage.createMaintenanceRequestMessage({
          organizationId: loaded.request.organizationId,
          maintenanceRequestId: loaded.request.id,
          authorUserId: loaded.user.id,
          body,
        });

        await notifyMaintenanceRequestMessage({
          organizationId: loaded.request.organizationId,
          maintenanceRequestId: loaded.request.id,
          messageId: message.id,
          requestTitle: loaded.request.title,
          authorUserId: loaded.user.id,
          authorRole: loaded.user.role,
          reportedBy: loaded.request.reportedBy,
          assignedTo: loaded.request.assignedTo,
        });

        const messages = await storage.getMaintenanceRequestMessages(loaded.request.id);
        const created = messages.find((m) => m.id === message.id) || {
          ...message,
          author: {
            id: loaded.user.id,
            firstName: loaded.user.firstName,
            lastName: loaded.user.lastName,
            role: loaded.user.role,
          },
        };
        res.status(201).json(created);
      } catch (error) {
        console.error("[mr-messages] tenant post failed:", error);
        res.status(500).json({ message: "Failed to post message" });
      }
    },
  );
}
