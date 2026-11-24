import type { Express, Response, NextFunction } from "express";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { isAuthenticated, requireCompanyModule, requireRole } from "../auth";
import { db } from "../db";
import { storage } from "../storage";
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
    async (_req: any, res: Response) => {
      // Owner-approval stage removed; keep endpoint for older clients.
      res.json([]);
    },
  );

  app.get(
    "/api/maintenance-finance/pending-count",
    ...staffGuards,
    async (req: any, res: Response) => {
      try {
        const organizationId = req.user.organizationId as string;

        const [awaitingCustomer, customerAccepted, outstanding, drafts] =
          await Promise.all([
            db
              .select({ id: maintenanceQuotes.id })
              .from(maintenanceQuotes)
              .where(
                and(
                  eq(maintenanceQuotes.organizationId, organizationId),
                  inArray(maintenanceQuotes.status, [
                    "sent",
                    "customer_changes_requested",
                  ]),
                ),
              ),
            db
              .select({ id: maintenanceQuotes.id })
              .from(maintenanceQuotes)
              .where(
                and(
                  eq(maintenanceQuotes.organizationId, organizationId),
                  eq(maintenanceQuotes.status, "accepted"),
                ),
              ),
            db
              .select({ id: maintenanceInvoices.id })
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
              ),
            db
              .select({ id: maintenanceInvoices.id })
              .from(maintenanceInvoices)
              .where(
                and(
                  eq(maintenanceInvoices.organizationId, organizationId),
                  eq(maintenanceInvoices.status, "draft"),
                ),
              ),
          ]);

        const count =
          awaitingCustomer.length +
          customerAccepted.length +
          outstanding.length +
          drafts.length;

        res.json({
          count,
          awaitingCustomer: awaitingCustomer.length,
          customerAccepted: customerAccepted.length,
          outstandingInvoices: outstanding.length,
          draftInvoices: drafts.length,
        });
      } catch (error) {
        console.error("[finance] pending-count failed:", error);
        res.status(500).json({ message: "Failed to load pending count" });
      }
    },
  );

  app.get(
    "/api/maintenance-finance/tracking",
    ...staffGuards,
    async (req: any, res: Response) => {
      try {
        const organizationId = req.user.organizationId as string;

        const [
          awaitingCustomer,
          customerAccepted,
          quoteHistory,
          outstanding,
          drafts,
          invoiceHistory,
        ] = await Promise.all([
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

        const pendingOwnerApproval: typeof awaitingCustomer = [];
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
            pendingOwnerApproval: 0,
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

  app.get(
    "/api/properties/:propertyId/maintenance-finance",
    ...staffGuards,
    async (req: any, res: Response) => {
      try {
        const organizationId = req.user.organizationId as string;
        const property = await storage.getProperty(req.params.propertyId);
        if (!property || property.organizationId !== organizationId) {
          return res.status(404).json({ message: "Property not found" });
        }

        const [quotes, invoices] = await Promise.all([
          db
            .select()
            .from(maintenanceQuotes)
            .where(
              and(
                eq(maintenanceQuotes.organizationId, organizationId),
                eq(maintenanceQuotes.propertyId, property.id),
              ),
            )
            .orderBy(desc(maintenanceQuotes.updatedAt)),
          db
            .select()
            .from(maintenanceInvoices)
            .where(
              and(
                eq(maintenanceInvoices.organizationId, organizationId),
                eq(maintenanceInvoices.propertyId, property.id),
              ),
            )
            .orderBy(desc(maintenanceInvoices.updatedAt)),
        ]);

        res.json({ quotes, invoices });
      } catch (error) {
        console.error("[finance] property finance failed:", error);
        res.status(500).json({ message: "Failed to load property finance" });
      }
    },
  );

  app.get(
    "/api/blocks/:blockId/maintenance-finance",
    ...staffGuards,
    async (req: any, res: Response) => {
      try {
        const organizationId = req.user.organizationId as string;
        const block = await storage.getBlock(req.params.blockId);
        if (!block || block.organizationId !== organizationId) {
          return res.status(404).json({ message: "Block not found" });
        }

        const [quotes, invoices] = await Promise.all([
          db
            .select()
            .from(maintenanceQuotes)
            .where(
              and(
                eq(maintenanceQuotes.organizationId, organizationId),
                eq(maintenanceQuotes.blockId, block.id),
              ),
            )
            .orderBy(desc(maintenanceQuotes.updatedAt)),
          db
            .select()
            .from(maintenanceInvoices)
            .where(
              and(
                eq(maintenanceInvoices.organizationId, organizationId),
                eq(maintenanceInvoices.blockId, block.id),
              ),
            )
            .orderBy(desc(maintenanceInvoices.updatedAt)),
        ]);

        res.json({ quotes, invoices });
      } catch (error) {
        console.error("[finance] block finance failed:", error);
        res.status(500).json({ message: "Failed to load block finance" });
      }
    },
  );
}
