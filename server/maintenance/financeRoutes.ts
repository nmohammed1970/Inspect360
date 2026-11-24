import type { Express, Response, NextFunction } from "express";
import { and, desc, eq, inArray, or } from "drizzle-orm";
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

const HISTORY_LIMIT = 40;

export function registerMaintenanceFinanceRoutes(app: Express) {
  const ownerGuards = [
    isAuthenticated,
    requireCompanyModule("maintenance"),
    rejectTenant,
    requireRole("owner", "maintenance_admin"),
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
        const isOwner =
          req.user.role === "owner" || req.user.role === "maintenance_admin";

        const [
          pendingOwnerApproval,
          awaitingCustomer,
          customerAccepted,
          quoteHistory,
          outstanding,
          drafts,
          invoiceHistory,
        ] = await Promise.all([
          isOwner
            ? db
                .select()
                .from(maintenanceQuotes)
                .where(
                  and(
                    eq(maintenanceQuotes.organizationId, organizationId),
                    eq(maintenanceQuotes.status, "pending_owner_approval"),
                  ),
                )
                .orderBy(desc(maintenanceQuotes.submittedAt))
            : Promise.resolve([]),
          db
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
            .orderBy(desc(maintenanceQuotes.sentAt)),
          db
            .select()
            .from(maintenanceQuotes)
            .where(
              and(
                eq(maintenanceQuotes.organizationId, organizationId),
                eq(maintenanceQuotes.status, "accepted"),
              ),
            )
            .orderBy(desc(maintenanceQuotes.customerDecidedAt)),
          db
            .select()
            .from(maintenanceQuotes)
            .where(
              and(
                eq(maintenanceQuotes.organizationId, organizationId),
                inArray(maintenanceQuotes.status, [
                  "declined",
                  "converted",
                  "owner_rejected",
                  "cancelled",
                  "superseded",
                  "expired",
                ]),
              ),
            )
            .orderBy(desc(maintenanceQuotes.updatedAt))
            .limit(HISTORY_LIMIT),
          db
            .select()
            .from(maintenanceInvoices)
            .where(
              and(
                eq(maintenanceInvoices.organizationId, organizationId),
                inArray(maintenanceInvoices.paymentStatus, [
                  "unpaid",
                  "partially_paid",
                ]),
                inArray(maintenanceInvoices.status, ["draft", "sent"]),
              ),
            )
            .orderBy(desc(maintenanceInvoices.updatedAt)),
          db
            .select()
            .from(maintenanceInvoices)
            .where(
              and(
                eq(maintenanceInvoices.organizationId, organizationId),
                eq(maintenanceInvoices.status, "draft"),
              ),
            )
            .orderBy(desc(maintenanceInvoices.updatedAt)),
          db
            .select()
            .from(maintenanceInvoices)
            .where(
              and(
                eq(maintenanceInvoices.organizationId, organizationId),
                or(
                  eq(maintenanceInvoices.paymentStatus, "paid"),
                  eq(maintenanceInvoices.status, "void"),
                ),
              ),
            )
            .orderBy(desc(maintenanceInvoices.updatedAt))
            .limit(HISTORY_LIMIT),
        ]);

        const quotes = {
          pendingOwnerApproval,
          awaitingCustomer,
          customerAccepted,
          history: quoteHistory,
        };
        const invoices = {
          outstanding,
          drafts,
          history: invoiceHistory,
        };

        res.json({
          quotes,
          invoices,
          counts: {
            pendingOwnerApproval: pendingOwnerApproval.length,
            awaitingCustomer: awaitingCustomer.length,
            customerAccepted: customerAccepted.length,
            quoteHistory: quoteHistory.length,
            outstandingInvoices: outstanding.length,
            draftInvoices: drafts.length,
            invoiceHistory: invoiceHistory.length,
          },
          // Back-compat aliases (older clients)
          awaitingCustomer,
          readyToConvert: customerAccepted,
          unpaidInvoices: outstanding,
        });
      } catch (error) {
        console.error("[finance] tracking failed:", error);
        res.status(500).json({ message: "Failed to load tracking" });
      }
    },
  );
}
