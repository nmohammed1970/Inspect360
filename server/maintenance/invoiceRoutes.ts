import type { Express, Response, NextFunction } from "express";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { isAuthenticated, requireCompanyModule, requireRole } from "../auth";
import { db } from "../db";
import { storage } from "../storage";
import {
  buildWorkOrderIdentity,
  canAccessWorkOrder,
} from "../workOrderAccess";
import { sendInvoiceToCustomerEmail } from "./maintenanceFinanceEmails";
import {
  maintenanceInvoiceLines,
  maintenanceInvoicePayments,
  maintenanceInvoiceShareTokens,
  maintenanceInvoices,
  type MaintenanceInvoice,
  type MaintenanceInvoiceLine,
} from "@shared/schema";
import {
  computeQuoteLine,
  computeQuoteTotals,
  computePaymentSummary,
} from "@shared/maintenanceFinanceMath";
import {
  INVOICE_SHARE_TOKEN_TTL_MS,
  invoiceHeaderPatchSchema,
  invoiceLinesReplaceSchema,
  invoicePaymentCreateSchema,
} from "@shared/maintenanceQuoteConstants";
import {
  appendWorkOrderEvent,
  publicAppBaseUrl,
} from "./quoteLifecycle";

function orgId(req: any): string {
  return req.user.organizationId as string;
}

function rejectTenant(req: any, res: Response, next: NextFunction) {
  if (req.user?.role === "tenant") {
    return res.status(403).json({ message: "Tenants cannot access invoices" });
  }
  next();
}

const guards = [isAuthenticated, requireCompanyModule("maintenance"), rejectTenant] as const;
const ownerGuards = [...guards, requireRole("owner")] as const;

function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

function serializeLine(row: MaintenanceInvoiceLine) {
  return { ...row, quantity: row.quantity == null ? 0 : Number(row.quantity) };
}

async function assertWoAccess(user: any, workOrderId: string) {
  const workOrder = await storage.getWorkOrder(workOrderId);
  if (!workOrder || workOrder.organizationId !== user.organizationId) {
    return { error: 404 as const, message: "Work order not found" };
  }
  const orgContacts = await storage.getContactsByOrganization(user.organizationId);
  const identity = buildWorkOrderIdentity({
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role || "",
    email: user.email,
    orgContacts,
  });
  if (!canAccessWorkOrder(identity, workOrder)) {
    return { error: 403 as const, message: "Forbidden" };
  }
  return { workOrder };
}

async function getInvoice(organizationId: string, workOrderId: string, invoiceId: string) {
  const [row] = await db
    .select()
    .from(maintenanceInvoices)
    .where(
      and(
        eq(maintenanceInvoices.id, invoiceId),
        eq(maintenanceInvoices.workOrderId, workOrderId),
        eq(maintenanceInvoices.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row;
}

async function loadLines(invoiceId: string) {
  return db
    .select()
    .from(maintenanceInvoiceLines)
    .where(eq(maintenanceInvoiceLines.invoiceId, invoiceId))
    .orderBy(asc(maintenanceInvoiceLines.sortOrder));
}

async function loadInvoiceWoContext(workOrderId: string, organizationId: string) {
  const workOrder = await storage.getWorkOrder(workOrderId);
  if (!workOrder || workOrder.organizationId !== organizationId) return null;
  const request = await storage.getMaintenanceRequest(workOrder.maintenanceRequestId);
  let property: Awaited<ReturnType<typeof storage.getProperty>> | null = null;
  let block: Awaited<ReturnType<typeof storage.getBlock>> | null = null;
  if (request?.propertyId) {
    property = (await storage.getProperty(request.propertyId)) || null;
    if (property?.blockId) {
      block = (await storage.getBlock(property.blockId)) || null;
    }
  }
  if (request?.blockId && !block) {
    block = (await storage.getBlock(request.blockId)) || null;
  }
  return {
    issueTitle: request?.title || "Maintenance work",
    locationLabel:
      property?.name || property?.address || block?.name || "Work order location",
  };
}

async function refreshPaymentStatus(invoice: MaintenanceInvoice) {
  const payments = await db
    .select()
    .from(maintenanceInvoicePayments)
    .where(eq(maintenanceInvoicePayments.invoiceId, invoice.id));
  const summary = computePaymentSummary(
    invoice.totalMinor,
    payments.map((p) => p.amountMinor),
  );
  const [updated] = await db
    .update(maintenanceInvoices)
    .set({
      paidMinor: summary.paidMinor,
      paymentStatus: summary.status,
      updatedAt: new Date(),
    })
    .where(eq(maintenanceInvoices.id, invoice.id))
    .returning();
  return { invoice: updated, payments, summary };
}

export function registerMaintenanceInvoiceRoutes(app: Express) {
  app.get(
    "/api/work-orders/:workOrderId/invoices",
    ...guards,
    async (req: any, res: Response) => {
      try {
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) return res.status(access.error).json({ message: access.message });
        const rows = await db
          .select()
          .from(maintenanceInvoices)
          .where(
            and(
              eq(maintenanceInvoices.workOrderId, req.params.workOrderId),
              eq(maintenanceInvoices.organizationId, orgId(req)),
            ),
          )
          .orderBy(desc(maintenanceInvoices.createdAt));
        res.json(rows);
      } catch (error) {
        console.error("[invoices] list failed:", error);
        res.status(500).json({ message: "Failed to list invoices" });
      }
    },
  );

  app.get(
    "/api/work-orders/:workOrderId/invoices/:invoiceId",
    ...guards,
    async (req: any, res: Response) => {
      try {
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) return res.status(access.error).json({ message: access.message });
        const invoice = await getInvoice(orgId(req), req.params.workOrderId, req.params.invoiceId);
        if (!invoice) return res.status(404).json({ message: "Invoice not found" });
        const lines = await loadLines(invoice.id);
        const payments = await db
          .select()
          .from(maintenanceInvoicePayments)
          .where(eq(maintenanceInvoicePayments.invoiceId, invoice.id))
          .orderBy(desc(maintenanceInvoicePayments.paidAt));
        res.json({ ...invoice, lines: lines.map(serializeLine), payments });
      } catch (error) {
        console.error("[invoices] get failed:", error);
        res.status(500).json({ message: "Failed to load invoice" });
      }
    },
  );

  app.patch(
    "/api/work-orders/:workOrderId/invoices/:invoiceId",
    ...ownerGuards,
    async (req: any, res: Response) => {
      try {
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) return res.status(access.error).json({ message: access.message });
        const invoice = await getInvoice(orgId(req), req.params.workOrderId, req.params.invoiceId);
        if (!invoice) return res.status(404).json({ message: "Invoice not found" });
        if (invoice.status !== "draft") {
          return res.status(409).json({ message: "Only draft invoices can be edited" });
        }
        if ("workOrderId" in (req.body || {})) {
          return res.status(400).json({ message: "work_order_id cannot be changed" });
        }
        const parsed = invoiceHeaderPatchSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid update", errors: parsed.error.flatten() });
        }
        const d = parsed.data;
        const [updated] = await db
          .update(maintenanceInvoices)
          .set({
            recipientName: d.recipientName !== undefined ? d.recipientName : invoice.recipientName,
            recipientEmail: d.recipientEmail !== undefined ? d.recipientEmail : invoice.recipientEmail,
            recipientPhone: d.recipientPhone !== undefined ? d.recipientPhone : invoice.recipientPhone,
            recipientAddress:
              d.recipientAddress !== undefined ? d.recipientAddress : invoice.recipientAddress,
            notes: d.notes !== undefined ? d.notes : invoice.notes,
            dueAt:
              d.dueAt !== undefined
                ? d.dueAt
                  ? new Date(d.dueAt)
                  : null
                : invoice.dueAt,
            updatedAt: new Date(),
          })
          .where(eq(maintenanceInvoices.id, invoice.id))
          .returning();
        const lines = await loadLines(invoice.id);
        res.json({ ...updated, lines: lines.map(serializeLine) });
      } catch (error) {
        console.error("[invoices] patch failed:", error);
        res.status(500).json({ message: "Failed to update invoice" });
      }
    },
  );

  app.put(
    "/api/work-orders/:workOrderId/invoices/:invoiceId/lines",
    ...ownerGuards,
    async (req: any, res: Response) => {
      try {
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) return res.status(access.error).json({ message: access.message });
        const invoice = await getInvoice(orgId(req), req.params.workOrderId, req.params.invoiceId);
        if (!invoice) return res.status(404).json({ message: "Invoice not found" });
        if (invoice.status !== "draft") {
          return res.status(409).json({ message: "Only draft invoices can be edited" });
        }
        const parsed = invoiceLinesReplaceSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid lines", errors: parsed.error.flatten() });
        }
        const computed = parsed.data.lines.map((line, index) => {
          const maths = computeQuoteLine({
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            vatRate: line.vatRate,
          });
          return {
            invoiceId: invoice.id,
            sortOrder: index,
            name: line.name.trim(),
            description: line.description ?? null,
            sku: line.sku ?? null,
            category: line.category,
            unit: line.unit,
            quantity: String(line.quantity),
            unitPriceMinor: line.unitPriceMinor,
            vatRate: line.vatRate,
            lineNetMinor: maths.lineNetMinor,
            lineTaxMinor: maths.lineTaxMinor,
            lineTotalMinor: maths.lineTotalMinor,
          };
        });
        const totals = computeQuoteTotals(
          computed.map((l) => ({
            lineNetMinor: l.lineNetMinor,
            lineTaxMinor: l.lineTaxMinor,
            lineTotalMinor: l.lineTotalMinor,
          })),
        );
        const saved = await db.transaction(async (tx) => {
          await tx
            .delete(maintenanceInvoiceLines)
            .where(eq(maintenanceInvoiceLines.invoiceId, invoice.id));
          let inserted: MaintenanceInvoiceLine[] = [];
          if (computed.length) {
            inserted = await tx.insert(maintenanceInvoiceLines).values(computed).returning();
          }
          const [updated] = await tx
            .update(maintenanceInvoices)
            .set({
              subtotalMinor: totals.subtotalMinor,
              taxMinor: totals.taxMinor,
              totalMinor: totals.totalMinor,
              updatedAt: new Date(),
            })
            .where(eq(maintenanceInvoices.id, invoice.id))
            .returning();
          return { invoice: updated, lines: inserted };
        });
        res.json({ ...saved.invoice, lines: saved.lines.map(serializeLine) });
      } catch (error) {
        console.error("[invoices] lines failed:", error);
        res.status(500).json({ message: "Failed to save invoice lines" });
      }
    },
  );

  app.post(
    "/api/work-orders/:workOrderId/invoices/:invoiceId/send",
    ...ownerGuards,
    async (req: any, res: Response) => {
      try {
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) return res.status(access.error).json({ message: access.message });
        const invoice = await getInvoice(orgId(req), req.params.workOrderId, req.params.invoiceId);
        if (!invoice) return res.status(404).json({ message: "Invoice not found" });
        if (invoice.status !== "draft" && invoice.status !== "sent") {
          return res.status(409).json({ message: "Invoice cannot be sent in this status" });
        }
        if (!(invoice.recipientEmail || "").trim()) {
          return res.status(400).json({ message: "Recipient email is required" });
        }

        await db
          .update(maintenanceInvoiceShareTokens)
          .set({ revokedAt: new Date() })
          .where(
            and(
              eq(maintenanceInvoiceShareTokens.invoiceId, invoice.id),
              isNull(maintenanceInvoiceShareTokens.revokedAt),
            ),
          );

        const rawToken = randomBytes(32).toString("base64url");
        const expiresAt = new Date(Date.now() + INVOICE_SHARE_TOKEN_TTL_MS);
        await db.insert(maintenanceInvoiceShareTokens).values({
          invoiceId: invoice.id,
          organizationId: orgId(req),
          tokenHash: hashToken(rawToken),
          expiresAt,
          createdByUserId: req.user.id,
        });

        const [updated] = await db
          .update(maintenanceInvoices)
          .set({ status: "sent", sentAt: new Date(), updatedAt: new Date() })
          .where(eq(maintenanceInvoices.id, invoice.id))
          .returning();

        const link = `${publicAppBaseUrl(req)}/public/invoices/${rawToken}`;
        await appendWorkOrderEvent({
          organizationId: orgId(req),
          workOrderId: invoice.workOrderId,
          eventType: "invoice_sent",
          actorUserId: req.user.id,
          payload: { invoiceId: invoice.id },
        });

        const lines = await loadLines(invoice.id);
        const ctx = await loadInvoiceWoContext(invoice.workOrderId, orgId(req));
        let emailSent = false;
        let emailError: string | null = null;
        try {
          const { buildInvoicePdfBuffer } = await import("./buildDocumentPdf");
          const pdf = await buildInvoicePdfBuffer({ invoice: updated, lines });
          await sendInvoiceToCustomerEmail({
            to: invoice.recipientEmail!,
            recipientName: invoice.recipientName,
            organizationId: orgId(req),
            workOrderId: invoice.workOrderId,
            invoiceId: invoice.id,
            invoiceReference: invoice.invoiceReference,
            currency: invoice.currency,
            subtotalMinor: updated.subtotalMinor,
            taxMinor: updated.taxMinor,
            totalMinor: updated.totalMinor,
            lines,
            dueAt: updated.dueAt,
            publicLink: link,
            issueTitle: ctx?.issueTitle,
            locationLabel: ctx?.locationLabel,
            attachments: [{ filename: pdf.filename, content: pdf.buffer }],
            baseUrl: publicAppBaseUrl(req),
          });
          emailSent = true;
        } catch (emailErr: any) {
          emailError = emailErr?.message || "Email failed";
          console.warn("[invoices] send email failed:", emailErr);
        }

        res.json({ ...updated, publicLink: link, emailSent, emailError });
      } catch (error) {
        console.error("[invoices] send failed:", error);
        res.status(500).json({ message: "Failed to send invoice" });
      }
    },
  );

  app.get(
    "/api/work-orders/:workOrderId/invoices/:invoiceId/pdf",
    ...guards,
    async (req: any, res: Response) => {
      try {
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) return res.status(access.error).json({ message: access.message });
        const invoice = await getInvoice(orgId(req), req.params.workOrderId, req.params.invoiceId);
        if (!invoice) return res.status(404).json({ message: "Invoice not found" });
        const lines = await loadLines(invoice.id);
        const { buildInvoicePdfBuffer } = await import("./buildDocumentPdf");
        const pdf = await buildInvoicePdfBuffer({ invoice, lines });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${pdf.filename}"`);
        res.send(pdf.buffer);
      } catch (error) {
        console.error("[invoices] pdf failed:", error);
        res.status(500).json({ message: "Failed to generate invoice PDF" });
      }
    },
  );

  app.post(
    "/api/work-orders/:workOrderId/invoices/:invoiceId/void",
    ...ownerGuards,
    async (req: any, res: Response) => {
      try {
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) return res.status(access.error).json({ message: access.message });
        const invoice = await getInvoice(orgId(req), req.params.workOrderId, req.params.invoiceId);
        if (!invoice) return res.status(404).json({ message: "Invoice not found" });
        if (invoice.status === "void") {
          return res.status(409).json({ message: "Invoice already void" });
        }
        if (invoice.paidMinor > 0) {
          return res.status(409).json({ message: "Cannot void an invoice with payments" });
        }
        const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
        if (!reason) return res.status(400).json({ message: "Void reason is required" });

        const [updated] = await db
          .update(maintenanceInvoices)
          .set({
            status: "void",
            voidedAt: new Date(),
            voidReason: reason,
            updatedAt: new Date(),
          })
          .where(eq(maintenanceInvoices.id, invoice.id))
          .returning();

        await appendWorkOrderEvent({
          organizationId: orgId(req),
          workOrderId: invoice.workOrderId,
          eventType: "invoice_voided",
          actorUserId: req.user.id,
          payload: { invoiceId: invoice.id, reason },
        });

        res.json(updated);
      } catch (error) {
        console.error("[invoices] void failed:", error);
        res.status(500).json({ message: "Failed to void invoice" });
      }
    },
  );

  app.get(
    "/api/work-orders/:workOrderId/invoices/:invoiceId/payments",
    ...ownerGuards,
    async (req: any, res: Response) => {
      try {
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) return res.status(access.error).json({ message: access.message });
        const invoice = await getInvoice(orgId(req), req.params.workOrderId, req.params.invoiceId);
        if (!invoice) return res.status(404).json({ message: "Invoice not found" });
        const payments = await db
          .select()
          .from(maintenanceInvoicePayments)
          .where(eq(maintenanceInvoicePayments.invoiceId, invoice.id))
          .orderBy(desc(maintenanceInvoicePayments.paidAt));
        res.json(payments);
      } catch (error) {
        console.error("[invoices] payments list failed:", error);
        res.status(500).json({ message: "Failed to list payments" });
      }
    },
  );

  app.post(
    "/api/work-orders/:workOrderId/invoices/:invoiceId/payments",
    ...ownerGuards,
    async (req: any, res: Response) => {
      try {
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) return res.status(access.error).json({ message: access.message });
        const invoice = await getInvoice(orgId(req), req.params.workOrderId, req.params.invoiceId);
        if (!invoice) return res.status(404).json({ message: "Invoice not found" });
        if (invoice.status === "void") {
          return res.status(409).json({ message: "Cannot record payment on a void invoice" });
        }
        const parsed = invoicePaymentCreateSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ message: "Invalid payment", errors: parsed.error.flatten() });
        }
        const data = parsed.data;
        if (invoice.paidMinor + data.amountMinor > invoice.totalMinor) {
          return res.status(400).json({ message: "Payment would exceed invoice total" });
        }

        const [payment] = await db
          .insert(maintenanceInvoicePayments)
          .values({
            invoiceId: invoice.id,
            organizationId: orgId(req),
            amountMinor: data.amountMinor,
            paidAt: new Date(data.paidAt),
            method: data.method,
            reference: data.reference ?? null,
            notes: data.notes ?? null,
            recordedByUserId: req.user.id,
          })
          .returning();

        const refreshed = await refreshPaymentStatus(invoice);
        await appendWorkOrderEvent({
          organizationId: orgId(req),
          workOrderId: invoice.workOrderId,
          eventType: "invoice_payment_recorded",
          actorUserId: req.user.id,
          payload: {
            invoiceId: invoice.id,
            paymentId: payment.id,
            amountMinor: data.amountMinor,
            paymentStatus: refreshed.summary.status,
          },
        });

        res.status(201).json({
          payment,
          invoice: refreshed.invoice,
          summary: refreshed.summary,
        });
      } catch (error) {
        console.error("[invoices] payment failed:", error);
        res.status(500).json({ message: "Failed to record payment" });
      }
    },
  );

  // Public invoice view
  app.get("/api/public/maintenance-invoices/:token", async (req, res: Response) => {
    try {
      const tokenHash = hashToken(req.params.token);
      const [tokenRow] = await db
        .select()
        .from(maintenanceInvoiceShareTokens)
        .where(eq(maintenanceInvoiceShareTokens.tokenHash, tokenHash))
        .limit(1);
      if (!tokenRow || tokenRow.revokedAt || tokenRow.expiresAt.getTime() < Date.now()) {
        return res.status(404).json({ message: "Link is invalid or expired" });
      }
      const [invoice] = await db
        .select()
        .from(maintenanceInvoices)
        .where(eq(maintenanceInvoices.id, tokenRow.invoiceId))
        .limit(1);
      if (!invoice || invoice.status === "void") {
        return res.status(404).json({ message: "Invoice not found" });
      }
      const lines = await loadLines(invoice.id);
      if (!tokenRow.viewedAt) {
        await db
          .update(maintenanceInvoiceShareTokens)
          .set({ viewedAt: new Date() })
          .where(eq(maintenanceInvoiceShareTokens.id, tokenRow.id));
      }
      res.json({
        invoiceReference: invoice.invoiceReference,
        status: invoice.status,
        currency: invoice.currency,
        recipientName: invoice.recipientName,
        notes: invoice.notes,
        subtotalMinor: invoice.subtotalMinor,
        taxMinor: invoice.taxMinor,
        totalMinor: invoice.totalMinor,
        paymentStatus: invoice.paymentStatus,
        paidMinor: invoice.paidMinor,
        lines: lines.map(serializeLine),
      });
    } catch (error) {
      console.error("[public-invoice] get failed:", error);
      res.status(500).json({ message: "Failed to load invoice" });
    }
  });

  app.get("/api/public/maintenance-invoices/:token/pdf", async (req, res: Response) => {
    try {
      const tokenHash = hashToken(req.params.token);
      const [tokenRow] = await db
        .select()
        .from(maintenanceInvoiceShareTokens)
        .where(eq(maintenanceInvoiceShareTokens.tokenHash, tokenHash))
        .limit(1);
      if (!tokenRow || tokenRow.revokedAt || tokenRow.expiresAt.getTime() < Date.now()) {
        return res.status(404).json({ message: "Link is invalid or expired" });
      }
      const [invoice] = await db
        .select()
        .from(maintenanceInvoices)
        .where(eq(maintenanceInvoices.id, tokenRow.invoiceId))
        .limit(1);
      if (!invoice || invoice.status === "void") {
        return res.status(404).json({ message: "Invoice not found" });
      }
      const lines = await loadLines(invoice.id);
      const { buildInvoicePdfBuffer } = await import("./buildDocumentPdf");
      const pdf = await buildInvoicePdfBuffer({ invoice, lines });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${pdf.filename}"`);
      res.send(pdf.buffer);
    } catch (error) {
      console.error("[public-invoice] pdf failed:", error);
      res.status(500).json({ message: "Failed to generate invoice PDF" });
    }
  });
}
