import type { Express, Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  maintenanceQuoteLines,
  maintenanceQuotes,
} from "@shared/schema";
import { customerDecisionSchema } from "@shared/maintenanceQuoteConstants";
import {
  appendWorkOrderEvent,
  findValidQuoteToken,
  onQuoteAccepted,
  publicAppBaseUrl,
  revokeActiveQuoteTokens,
  transitionOrThrow,
} from "./quoteLifecycle";
import { sendQuoteCustomerResponseEmail } from "./maintenanceFinanceEmails";
import {
  loadPublicOrgBrand,
  loadPublicWorkContext,
} from "./publicFinanceContext";


async function loadPublicQuote(rawToken: string) {
  const tokenRow = await findValidQuoteToken(rawToken);
  if (!tokenRow) return null;
  const [quote] = await db
    .select()
    .from(maintenanceQuotes)
    .where(
      and(
        eq(maintenanceQuotes.id, tokenRow.quoteId),
        eq(maintenanceQuotes.organizationId, tokenRow.organizationId),
      ),
    )
    .limit(1);
  if (!quote) return null;
  const lines = await db
    .select()
    .from(maintenanceQuoteLines)
    .where(eq(maintenanceQuoteLines.quoteId, quote.id))
    .orderBy(asc(maintenanceQuoteLines.sortOrder));
  return { tokenRow, quote, lines };
}

export function registerPublicMaintenanceQuoteRoutes(app: Express) {
  app.get("/api/public/maintenance-quotes/:token", async (req, res: Response) => {
    try {
      const loaded = await loadPublicQuote(req.params.token);
      if (!loaded) {
        return res.status(404).json({ message: "Link is invalid or expired" });
      }
      const { tokenRow, quote, lines } = loaded;
      if (!tokenRow.viewedAt) {
        const { maintenanceQuoteShareTokens } = await import("@shared/schema");
        await db
          .update(maintenanceQuoteShareTokens)
          .set({ viewedAt: new Date() })
          .where(eq(maintenanceQuoteShareTokens.id, tokenRow.id));
      }

      const [organization, work] = await Promise.all([
        loadPublicOrgBrand(quote.organizationId),
        loadPublicWorkContext(quote.workOrderId, quote.organizationId),
      ]);

      res.json({
        quoteReference: quote.quoteReference,
        versionNumber: quote.versionNumber,
        status: quote.status,
        currency: quote.currency,
        recipientName: quote.recipientName,
        recipientEmail: quote.recipientEmail,
        recipientPhone: quote.recipientPhone,
        recipientAddress: quote.recipientAddress,
        scopeDescription: quote.scopeDescription,
        subtotalMinor: quote.subtotalMinor,
        taxMinor: quote.taxMinor,
        totalMinor: quote.totalMinor,
        expiresAt: tokenRow.expiresAt,
        canRespond: quote.status === "sent",
        organization,
        work,
        lines: lines.map((l) => ({
          name: l.name,
          description: l.description,
          category: l.category,
          unit: l.unit,
          quantity: Number(l.quantity),
          unitPriceMinor: l.unitPriceMinor,
          vatRate: l.vatRate,
          lineNetMinor: l.lineNetMinor,
          lineTaxMinor: l.lineTaxMinor,
          lineTotalMinor: l.lineTotalMinor,
        })),
      });
    } catch (error) {
      console.error("[public-quote] get failed:", error);
      res.status(500).json({ message: "Failed to load quotation" });
    }
  });

  app.get("/api/public/maintenance-quotes/:token/pdf", async (req, res: Response) => {
    try {
      const loaded = await loadPublicQuote(req.params.token);
      if (!loaded) {
        return res.status(404).json({ message: "Link is invalid or expired" });
      }
      const { quote, lines } = loaded;
      const work = await loadPublicWorkContext(quote.workOrderId, quote.organizationId);
      const { buildQuotePdfBuffer } = await import("./buildDocumentPdf");
      const pdf = await buildQuotePdfBuffer({
        quote,
        lines,
        issueTitle: work?.issueTitle,
        locationLabel: work?.locationLabel,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${pdf.filename}"`);
      res.send(pdf.buffer);
    } catch (error) {
      console.error("[public-quote] pdf failed:", error);
      res.status(500).json({ message: "Failed to generate quotation PDF" });
    }
  });

  async function decide(
    req: any,
    res: Response,
    decision: "accept" | "decline" | "request_changes",
  ) {
    try {
      const loaded = await loadPublicQuote(req.params.token);
      if (!loaded) {
        return res.status(404).json({ message: "Link is invalid or expired" });
      }
      const { quote, lines } = loaded;
      if (quote.status !== "sent") {
        return res.status(409).json({ message: "This quotation is no longer awaiting a response" });
      }

      const parsed = customerDecisionSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid payload" });
      }
      const reason = parsed.data.reason?.trim() || null;
      if (decision !== "accept" && !reason) {
        return res.status(400).json({ message: "Please provide a brief reason" });
      }

      const statusMap = {
        accept: "accepted",
        decline: "declined",
        request_changes: "customer_changes_requested",
      } as const;
      const nextStatus = statusMap[decision];
      transitionOrThrow(quote.status, nextStatus, "customer");

      const [updated] = await db
        .update(maintenanceQuotes)
        .set({
          status: nextStatus,
          customerDecision: decision,
          customerDecisionReason: reason,
          customerDecidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(maintenanceQuotes.id, quote.id))
        .returning();

      await revokeActiveQuoteTokens(quote.id);
      await appendWorkOrderEvent({
        organizationId: quote.organizationId,
        workOrderId: quote.workOrderId,
        eventType: `quote_customer_${decision}`,
        payload: { quoteId: quote.id, nextStatus, reason },
      });

      if (decision === "accept") {
        await onQuoteAccepted(updated);
      }

      try {
        const ownerUsers = await storage.getUsersByOrganization(quote.organizationId);
        const owners = (ownerUsers || []).filter(
          (u: any) =>
            (u.role === "owner" || u.role === "maintenance_admin") && u.email,
        );
        const baseUrl = publicAppBaseUrl(req);
        const work = await loadPublicWorkContext(quote.workOrderId, quote.organizationId);
        for (const owner of owners.slice(0, 5)) {
          await sendQuoteCustomerResponseEmail({
            to: owner.email,
            organizationId: quote.organizationId,
            workOrderId: quote.workOrderId,
            quoteId: quote.id,
            quoteReference: quote.quoteReference,
            decision,
            reason,
            currency: quote.currency,
            subtotalMinor: quote.subtotalMinor,
            taxMinor: quote.taxMinor,
            totalMinor: quote.totalMinor,
            lines,
            issueTitle: work?.issueTitle,
            locationLabel: work?.locationLabel,
            baseUrl,
          });
        }
      } catch (emailErr) {
        console.warn("[public-quote] notify failed:", emailErr);
      }

      res.json({ status: nextStatus, message: "Response recorded" });
    } catch (error: any) {
      console.error("[public-quote] decide failed:", error);
      res.status(500).json({ message: error?.message || "Failed to record response" });
    }
  }

  app.post("/api/public/maintenance-quotes/:token/accept", (req, res) =>
    decide(req, res, "accept"),
  );
  app.post("/api/public/maintenance-quotes/:token/decline", (req, res) =>
    decide(req, res, "decline"),
  );
  app.post("/api/public/maintenance-quotes/:token/request-changes", (req, res) =>
    decide(req, res, "request_changes"),
  );
}
