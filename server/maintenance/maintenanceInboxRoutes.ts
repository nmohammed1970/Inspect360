import type { Express, Response } from "express";
import { isAuthenticated, requireCompanyModule, requireRole } from "../auth";
import { storage } from "../storage";
import { buildMaintenanceInbox } from "./maintenanceInbox";

export function registerMaintenanceInboxRoutes(app: Express) {
  app.get(
    "/api/dashboard/maintenance-inbox",
    isAuthenticated,
    requireCompanyModule("maintenance"),
    requireRole("owner", "maintenance_admin"),
    async (req: any, res: Response) => {
      try {
        const user = await storage.getUser(req.user.id);
        if (!user?.organizationId) {
          return res.status(403).json({ message: "No organization found" });
        }

        const filterBlockId = (req.query.blockId as string | undefined) || undefined;
        const filterPropertyId =
          (req.query.propertyId as string | undefined) || undefined;

        const result = await buildMaintenanceInbox({
          organizationId: user.organizationId,
          filterBlockId: filterBlockId === "all" ? undefined : filterBlockId,
          filterPropertyId: filterPropertyId === "all" ? undefined : filterPropertyId,
        });

        res.json(result);
      } catch (error) {
        console.error("[maintenance-inbox] failed:", error);
        res.status(500).json({ message: "Failed to load maintenance inbox" });
      }
    },
  );
}
