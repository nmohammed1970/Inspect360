import type { Express, Response, NextFunction } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { isAuthenticated, requireCompanyModule, requireRole } from "../auth";
import { db } from "../db";
import {
  maintenanceInvoices,
  maintenanceQuotes,
} from "@shared/schema";

function rejectTenant(req: any, res: Response, next: NextFunction) {
  if (req.user?.role === "tenant") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

export function registerMaintenanceFinanceRoutes(app: Express) {
  const ownerGuards = [
    isAuthenticated,
    requireCompanyModule("maintenance"),
    rejectTenant,
    requireRole("owner"),
  ] as const;

  const staffGuards = [
    isAuthenticated,
    requireCompanyModule("maintenance"),
    rejectTenant,
  ] as const;

  app.get(
    "/api/maintenance-finance/pending-owner-approvals",
    ...ownerGuards,
    async (req: any, res: Response) => {
      try {
        const organizationId = req.user.organizationId as string;
        const rows = await db
          .select()
          .from(maintenanceQuotes)
          .where(
            and(
              eq(maintenanceQuotes.organizationId, organizationId),
              eq(maintenanceQuotes.status, "pending_owner_approval"),
            ),
          )
          .orderBy(desc(maintenanceQuotes.submittedAt));
        res.json(rows);
      } catch (error) {
        console.error("[finance] pending approvals failed:", error);
        res.status(500).json({ message: "Failed to load pending approvals" });
      }
    },
  );

  app.get(
    "/api/maintenance-finance/tracking",
    ...staffGuards,
    async (req: any, res: Response) => {
      try {
        const organizationId = req.user.organizationId as string;
        const awaitingCustomer = await db
          .select()
          .from(maintenanceQuotes)
          .where(
            and(
              eq(maintenanceQuotes.organizationId, organizationId),
              inArray(maintenanceQuotes.status, [
                "sent",
                "customer_changes_requested",
              ]),
            ),
          )
          .orderBy(desc(maintenanceQuotes.sentAt));

        const readyToConvert = await db
          .select()
          .from(maintenanceQuotes)
          .where(
            and(
              eq(maintenanceQuotes.organizationId, organizationId),
              eq(maintenanceQuotes.status, "accepted"),
            ),
          )
          .orderBy(desc(maintenanceQuotes.customerDecidedAt));

        const unpaidInvoices = await db
          .select()
          .from(maintenanceInvoices)
          .where(
            and(
              eq(maintenanceInvoices.organizationId, organizationId),
              inArray(maintenanceInvoices.paymentStatus, ["unpaid", "partially_paid"]),
              inArray(maintenanceInvoices.status, ["draft", "sent"]),
            ),
          )
          .orderBy(desc(maintenanceInvoices.createdAt));

        res.json({
          awaitingCustomer,
          readyToConvert,
          unpaidInvoices,
        });
      } catch (error) {
        console.error("[finance] tracking failed:", error);
        res.status(500).json({ message: "Failed to load tracking" });
      }
    },
  );
}
