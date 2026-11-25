import type { Express, Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  maintenanceQuoteLines,
  maintenanceQuotes,
} from "@shared/schema";
import { findValidQuoteToken } from "./quoteLifecycle";
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
      const { quote } = loaded;
      const { parseRecipientDecisionBody, applyQuoteRecipientDecision } = await import(
        "./quoteRecipientDecision"
      );
      const { reason } = parseRecipientDecisionBody(req.body);
      const result = await applyQuoteRecipientDecision({
        quote,
        decision,
        reason,
        req,
      });
      res.json({ status: result.status, message: "Response recorded" });
    } catch (error: any) {
      console.error("[public-quote] decide failed:", error);
      const status = typeof error?.status === "number" ? error.status : 500;
      res.status(status).json({ message: error?.message || "Failed to record response" });
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
