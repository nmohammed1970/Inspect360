import type { Express, Response, NextFunction } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { isAuthenticated, requireCompanyModule, requireRole } from "../auth";
import { db } from "../db";
import { storage } from "../storage";
import {
  buildWorkOrderIdentity,
  canAccessWorkOrder,
  type WorkOrderIdentity,
} from "../workOrderAccess";
import { sendQuoteToCustomerEmail } from "./maintenanceFinanceEmails";
import {
  maintenanceQuoteLines,
  maintenanceQuotes,
  maintenanceDocumentSequences,
  type MaintenanceQuote,
  type MaintenanceQuoteLine,
} from "@shared/schema";
import {
  computeQuoteLine,
  computeQuoteTotals,
} from "@shared/maintenanceFinanceMath";
import {
  formatQuoteReference,
  isQuoteEditable,
  isQuoteRevisable,
  quoteHeaderPatchSchema,
  quoteLinesReplaceSchema,
} from "@shared/maintenanceQuoteConstants";
import { MAINTENANCE_PRICE_BOOK_CURRENCIES } from "@shared/maintenancePriceBookConstants";
import {
  appendWorkOrderEvent,
  createQuoteShareToken,
  publicAppBaseUrl,
  resolveWorkOrderLocation,
  transitionOrThrow,
} from "./quoteLifecycle";
import {
  defaultRecipientForWorkOrder,
  listQuoteCustomerCandidates,
  resolveRecipientUserInOrg,
} from "./quoteCustomerRecipients";

function orgId(req: any): string {
  return req.user.organizationId as string;
}

function rejectTenant(req: any, res: Response, next: NextFunction) {
  if (req.user?.role === "tenant") {
    return res.status(403).json({ message: "Tenants cannot access quotations" });
  }
  next();
}

const quoteGuards = [
  isAuthenticated,
  requireCompanyModule("maintenance"),
  rejectTenant,
] as const;

async function loadIdentity(user: {
  id: string;
  organizationId: string;
  role?: string | null;
  email?: string | null;
}): Promise<WorkOrderIdentity> {
  const orgContacts = await storage.getContactsByOrganization(user.organizationId);
  return buildWorkOrderIdentity({
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role || "",
    email: user.email,
    orgContacts,
  });
}

async function assertWoAccess(
  user: { id: string; organizationId: string; role?: string | null; email?: string | null },
  workOrderId: string,
) {
  const workOrder = await storage.getWorkOrder(workOrderId);
  if (!workOrder || workOrder.organizationId !== user.organizationId) {
    return { error: 404 as const, message: "Work order not found" };
  }
  const identity = await loadIdentity(user);
  if (!canAccessWorkOrder(identity, workOrder)) {
    return { error: 403 as const, message: "Forbidden" };
  }
  return { workOrder, identity };
}

function serializeLine(row: MaintenanceQuoteLine) {
  return {
    ...row,
    quantity: row.quantity == null ? 0 : Number(row.quantity),
  };
}

function serializeQuote(row: MaintenanceQuote, lines?: MaintenanceQuoteLine[]) {
  return {
    ...row,
    lines: lines ? lines.map(serializeLine) : undefined,
  };
}

async function allocateQuoteNumber(
  organizationId: string,
  year: number,
): Promise<{ quoteNumber: number; quoteReference: string }> {
  return db.transaction(async (tx) => {
    const existing = await tx.execute(sql`
      SELECT id, next_value
      FROM maintenance_document_sequences
      WHERE organization_id = ${organizationId}
        AND document_type = 'quote'
        AND year = ${year}
      FOR UPDATE
    `);

    let nextValue: number;
    if (!existing.rows || existing.rows.length === 0) {
      nextValue = 1;
      await tx.insert(maintenanceDocumentSequences).values({
        organizationId,
        documentType: "quote",
        year,
        nextValue: 2,
        updatedAt: new Date(),
      });
    } else {
      const row = existing.rows[0] as { id: string; next_value: number };
      nextValue = Number(row.next_value) || 1;
      await tx
        .update(maintenanceDocumentSequences)
        .set({ nextValue: nextValue + 1, updatedAt: new Date() })
        .where(eq(maintenanceDocumentSequences.id, row.id));
    }

    return {
      quoteNumber: nextValue,
      quoteReference: formatQuoteReference(year, nextValue),
    };
  });
}

async function loadWoContext(workOrderId: string, organizationId: string) {
  const workOrder = await storage.getWorkOrder(workOrderId);
  if (!workOrder || workOrder.organizationId !== organizationId) return null;

  const request = await storage.getMaintenanceRequest(workOrder.maintenanceRequestId);
  let property: Awaited<ReturnType<typeof storage.getProperty>> | null = null;
  let block: Awaited<ReturnType<typeof storage.getBlock>> | null = null;
  let landlord: Awaited<ReturnType<typeof storage.getContact>> | null = null;
  let assigneeName: string | null = null;

  if (request?.propertyId) {
    property = (await storage.getProperty(request.propertyId)) || null;
    if (property?.landlordContactId) {
      landlord = (await storage.getContact(property.landlordContactId)) || null;
    }
    if (property?.blockId) {
      block = (await storage.getBlock(property.blockId)) || null;
    }
  }
  if (request?.blockId && !block) {
    block = (await storage.getBlock(request.blockId)) || null;
  }

  if (workOrder.assignedToId) {
    const user = await storage.getUser(workOrder.assignedToId);
    if (user) {
      assigneeName =
        [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
        user.email ||
        null;
    } else {
      const contact = await storage.getContact(workOrder.assignedToId);
      if (contact) {
        assigneeName =
          [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
          contact.companyName ||
          null;
      }
    }
  }

  return {
    workOrder,
    request,
    property,
    block,
    landlord,
    assigneeName,
    locationLabel:
      property?.name ||
      property?.address ||
      block?.name ||
      "Work order location",
    issueTitle: request?.title || "Maintenance work",
  };
}

function contactSnapshot(contact: NonNullable<Awaited<ReturnType<typeof storage.getContact>>>) {
  const name =
    [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() ||
    contact.companyName ||
    null;
  const addressParts = [
    contact.address,
    contact.city,
    contact.state,
    contact.postalCode,
    contact.country,
  ].filter(Boolean);
  return {
    recipientContactId: contact.id,
    recipientName: name,
    recipientEmail: contact.email || null,
    recipientPhone: contact.phone || null,
    recipientAddress: addressParts.length ? addressParts.join(", ") : null,
  };
}

async function getQuoteForWo(
  organizationId: string,
  workOrderId: string,
  quoteId: string,
): Promise<MaintenanceQuote | undefined> {
  const [row] = await db
    .select()
    .from(maintenanceQuotes)
    .where(
      and(
        eq(maintenanceQuotes.id, quoteId),
        eq(maintenanceQuotes.workOrderId, workOrderId),
        eq(maintenanceQuotes.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row;
}

async function loadLines(quoteId: string): Promise<MaintenanceQuoteLine[]> {
  return db
    .select()
    .from(maintenanceQuoteLines)
    .where(eq(maintenanceQuoteLines.quoteId, quoteId))
    .orderBy(asc(maintenanceQuoteLines.sortOrder), asc(maintenanceQuoteLines.createdAt));
}

export function registerMaintenanceQuoteRoutes(app: Express) {
  app.get(
    "/api/work-orders/:workOrderId/customer-candidates",
    ...quoteGuards,
    async (req: any, res: Response) => {
      try {
        const organizationId = orgId(req);
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }

        const workOrder = await storage.getWorkOrder(req.params.workOrderId);
        if (!workOrder || workOrder.organizationId !== organizationId) {
          return res.status(404).json({ message: "Work order not found" });
        }

        const [candidates, defaultRecipient] = await Promise.all([
          listQuoteCustomerCandidates(organizationId),
          defaultRecipientForWorkOrder(workOrder),
        ]);

        res.json({ candidates, defaultRecipient });
      } catch (error) {
        console.error("[quotes] customer-candidates failed:", error);
        res.status(500).json({ message: "Failed to load customers" });
      }
    },
  );

  app.get(
    "/api/work-orders/:workOrderId/quotes",
    ...quoteGuards,
    async (req: any, res: Response) => {
      try {
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }

        const rows = await db
          .select()
          .from(maintenanceQuotes)
          .where(
            and(
              eq(maintenanceQuotes.workOrderId, req.params.workOrderId),
              eq(maintenanceQuotes.organizationId, orgId(req)),
            ),
          )
          .orderBy(desc(maintenanceQuotes.createdAt));

        res.json(rows.map((r) => serializeQuote(r)));
      } catch (error) {
        console.error("[quotes] list failed:", error);
        res.status(500).json({ message: "Failed to list quotes" });
      }
    },
  );

  app.post(
    "/api/work-orders/:workOrderId/quotes",
    ...quoteGuards,
    async (req: any, res: Response) => {
      try {
        const organizationId = orgId(req);
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }

        const org = await storage.getOrganization(organizationId);
        const preferred = org?.preferredCurrency || "GBP";
        const currency = (
          MAINTENANCE_PRICE_BOOK_CURRENCIES as readonly string[]
        ).includes(preferred)
          ? preferred
          : "GBP";

        const ctx = await loadWoContext(req.params.workOrderId, organizationId);
        const year = new Date().getFullYear();
        const { quoteNumber, quoteReference } = await allocateQuoteNumber(
          organizationId,
          year,
        );

        const defaultRecipient = ctx?.workOrder
          ? await defaultRecipientForWorkOrder(ctx.workOrder)
          : null;
        const location = await resolveWorkOrderLocation(req.params.workOrderId);

        const [quote] = await db
          .insert(maintenanceQuotes)
          .values({
            organizationId,
            workOrderId: req.params.workOrderId,
            propertyId: location.propertyId,
            blockId: location.blockId,
            status: "draft",
            quoteNumber,
            quoteReference,
            versionNumber: 1,
            quoteType: "original",
            currency: currency as "GBP" | "USD" | "EUR" | "AED",
            recipientContactId: null,
            recipientUserId: defaultRecipient?.recipientUserId ?? null,
            recipientName: defaultRecipient?.recipientName ?? null,
            recipientEmail: defaultRecipient?.recipientEmail ?? null,
            recipientPhone: defaultRecipient?.recipientPhone ?? null,
            recipientAddress: null,
            scopeDescription: ctx?.request?.description || ctx?.issueTitle || null,
            preparedByUserId: req.user.id,
            subtotalMinor: 0,
            taxMinor: 0,
            totalMinor: 0,
          })
          .returning();

        // Start with one empty line so the editor always has a row
        const blank = computeQuoteLine({
          quantity: 1,
          unitPriceMinor: 0,
          vatRate: "standard_20",
        });
        const [line] = await db
          .insert(maintenanceQuoteLines)
          .values({
            quoteId: quote.id,
            sortOrder: 0,
            name: "",
            description: null,
            category: "labour",
            unit: "hour",
            quantity: "1",
            unitPriceMinor: 0,
            vatRate: "standard_20",
            lineNetMinor: blank.lineNetMinor,
            lineTaxMinor: blank.lineTaxMinor,
            lineTotalMinor: blank.lineTotalMinor,
            priceBookItemId: null,
          })
          .returning();

        res.status(201).json(serializeQuote(quote, [line]));
      } catch (error) {
        console.error("[quotes] create failed:", error);
        res.status(500).json({ message: "Failed to create quote" });
      }
    },
  );

  app.get(
    "/api/work-orders/:workOrderId/quotes/:quoteId",
    ...quoteGuards,
    async (req: any, res: Response) => {
      try {
        const organizationId = orgId(req);
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }

        const quote = await getQuoteForWo(
          organizationId,
          req.params.workOrderId,
          req.params.quoteId,
        );
        if (!quote) {
          return res.status(404).json({ message: "Quote not found" });
        }

        const [lines, ctx, preparer] = await Promise.all([
          loadLines(quote.id),
          loadWoContext(req.params.workOrderId, organizationId),
          storage.getUser(quote.preparedByUserId),
        ]);

        const preparedByName = preparer
          ? [preparer.firstName, preparer.lastName].filter(Boolean).join(" ").trim() ||
            preparer.email ||
            null
          : null;

        res.json({
          ...serializeQuote(quote, lines),
          preparedByName,
          context: ctx
            ? {
                workOrderId: ctx.workOrder.id,
                workOrderStatus: ctx.workOrder.status,
                issueTitle: ctx.issueTitle,
                locationLabel: ctx.locationLabel,
                propertyId: ctx.property?.id ?? null,
                propertyName: ctx.property?.name ?? null,
                propertyAddress: ctx.property?.address ?? null,
                blockId: ctx.block?.id ?? null,
                blockName: ctx.block?.name ?? null,
                assigneeName: ctx.assigneeName,
                maintenanceRequestId: ctx.request?.id ?? null,
              }
            : null,
        });
      } catch (error) {
        console.error("[quotes] get failed:", error);
        res.status(500).json({ message: "Failed to load quote" });
      }
    },
  );

  app.patch(
    "/api/work-orders/:workOrderId/quotes/:quoteId",
    ...quoteGuards,
    async (req: any, res: Response) => {
      try {
        const organizationId = orgId(req);
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }

        const quote = await getQuoteForWo(
          organizationId,
          req.params.workOrderId,
          req.params.quoteId,
        );
        if (!quote) {
          return res.status(404).json({ message: "Quote not found" });
        }
        const recipientOnlyStatuses = ["sent"];
        const fullEdit = isQuoteEditable(quote.status);
        const recipientOnly = recipientOnlyStatuses.includes(quote.status);
        if (!fullEdit && !recipientOnly) {
          return res.status(409).json({ message: "Quote is not editable in this status" });
        }

        if ("workOrderId" in (req.body || {}) || "work_order_id" in (req.body || {})) {
          return res.status(400).json({ message: "work_order_id cannot be changed" });
        }

        const parsed = quoteHeaderPatchSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            message: "Invalid quote update",
            errors: parsed.error.flatten(),
          });
        }

        const data = parsed.data;
        const recipientKeys = [
          "recipientUserId",
          "recipientContactId",
          "recipientName",
          "recipientEmail",
          "recipientPhone",
          "recipientAddress",
        ] as const;
        const touchesRecipient = recipientKeys.some((key) => data[key] !== undefined);
        if (touchesRecipient) {
          const role = req.user?.role || "";
          if (role !== "owner" && role !== "maintenance_admin") {
            return res.status(403).json({
              message: "Only owners and maintenance admins can change the quote customer",
            });
          }
        }

        const patch: Partial<MaintenanceQuote> = { updatedAt: new Date() };

        if (data.recipientUserId !== undefined) {
          const snap = await resolveRecipientUserInOrg(organizationId, data.recipientUserId);
          if (data.recipientUserId && !snap?.recipientUserId) {
            return res.status(400).json({ message: "Invalid customer selection" });
          }
          if (snap) {
            patch.recipientUserId = snap.recipientUserId;
            patch.recipientContactId = null;
            patch.recipientName = snap.recipientName;
            patch.recipientEmail = snap.recipientEmail;
            patch.recipientPhone = snap.recipientPhone;
            patch.recipientAddress = null;
          }
        }
        if (data.recipientContactId !== undefined) {
          patch.recipientContactId = data.recipientContactId;
        }
        if (data.recipientName !== undefined) patch.recipientName = data.recipientName;
        if (data.recipientEmail !== undefined) patch.recipientEmail = data.recipientEmail;
        if (data.recipientPhone !== undefined) patch.recipientPhone = data.recipientPhone;
        if (data.recipientAddress !== undefined) {
          patch.recipientAddress = data.recipientAddress;
        }
        if (fullEdit) {
          if (data.scopeDescription !== undefined) {
            patch.scopeDescription = data.scopeDescription;
          }
          if (data.engineerNotes !== undefined) patch.engineerNotes = data.engineerNotes;
          if (data.validUntil !== undefined) {
            patch.validUntil =
              data.validUntil == null || data.validUntil === ""
                ? null
                : new Date(data.validUntil);
          }
        }

        const [updated] = await db
          .update(maintenanceQuotes)
          .set(patch)
          .where(eq(maintenanceQuotes.id, quote.id))
          .returning();

        const lines = await loadLines(quote.id);
        res.json(serializeQuote(updated, lines));
      } catch (error) {
        console.error("[quotes] patch failed:", error);
        res.status(500).json({ message: "Failed to update quote" });
      }
    },
  );

  app.put(
    "/api/work-orders/:workOrderId/quotes/:quoteId/lines",
    ...quoteGuards,
    async (req: any, res: Response) => {
      try {
        const organizationId = orgId(req);
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }

        const quote = await getQuoteForWo(
          organizationId,
          req.params.workOrderId,
          req.params.quoteId,
        );
        if (!quote) {
          return res.status(404).json({ message: "Quote not found" });
        }
        if (!isQuoteEditable(quote.status)) {
          return res.status(409).json({ message: "Quote is not editable in this status" });
        }

        const parsed = quoteLinesReplaceSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({
            message: "Invalid lines",
            errors: parsed.error.flatten(),
          });
        }

        const computedLines = parsed.data.lines.map((line, index) => {
          const maths = computeQuoteLine({
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            vatRate: line.vatRate,
          });
          return {
            quoteId: quote.id,
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
            priceBookItemId: line.priceBookItemId ?? null,
          };
        });

        const totals = computeQuoteTotals(
          computedLines.map((l) => ({
            lineNetMinor: l.lineNetMinor,
            lineTaxMinor: l.lineTaxMinor,
            lineTotalMinor: l.lineTotalMinor,
          })),
        );

        const saved = await db.transaction(async (tx) => {
          await tx
            .delete(maintenanceQuoteLines)
            .where(eq(maintenanceQuoteLines.quoteId, quote.id));

          let inserted: MaintenanceQuoteLine[] = [];
          if (computedLines.length > 0) {
            inserted = await tx
              .insert(maintenanceQuoteLines)
              .values(computedLines)
              .returning();
          }

          const [updated] = await tx
            .update(maintenanceQuotes)
            .set({
              subtotalMinor: totals.subtotalMinor,
              taxMinor: totals.taxMinor,
              totalMinor: totals.totalMinor,
              updatedAt: new Date(),
            })
            .where(eq(maintenanceQuotes.id, quote.id))
            .returning();

          return { quote: updated, lines: inserted };
        });

        res.json(serializeQuote(saved.quote, saved.lines));
      } catch (error) {
        console.error("[quotes] lines replace failed:", error);
        res.status(500).json({ message: "Failed to save quote lines" });
      }
    },
  );

  app.post(
    "/api/work-orders/:workOrderId/quotes/:quoteId/submit",
    ...quoteGuards,
    async (_req: any, res: Response) => {
      return res.status(410).json({
        message: "Submit for owner approval is removed. Use Send to customer instead.",
      });
    },
  );

  app.post(
    "/api/work-orders/:workOrderId/quotes/:quoteId/owner-decision",
    ...quoteGuards,
    async (_req: any, res: Response) => {
      return res.status(410).json({
        message: "Owner approval is removed. Send the quote directly to the customer.",
      });
    },
  );

  app.post(
    "/api/work-orders/:workOrderId/quotes/:quoteId/send",
    ...quoteGuards,
    requireRole("owner", "maintenance_admin", "contractor"),
    async (req: any, res: Response) => {
      try {
        const organizationId = orgId(req);
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }

        const quote = await getQuoteForWo(
          organizationId,
          req.params.workOrderId,
          req.params.quoteId,
        );
        if (!quote) return res.status(404).json({ message: "Quote not found" });

        const isResend = quote.status === "sent";
        if (quote.status !== "draft" && !isResend) {
          return res.status(409).json({
            message: "Only draft quotes can be sent to the customer (or resent when already sent)",
          });
        }
        if (!isResend) {
          const sendActor =
            req.user.role === "owner" || req.user.role === "maintenance_admin"
              ? "owner"
              : "staff";
          transitionOrThrow(quote.status, "sent", sendActor);

          const lines = await loadLines(quote.id);
          const namedLines = lines.filter((l) => (l.name || "").trim().length > 0);
          if (namedLines.length === 0) {
            return res.status(400).json({
              message: "Add at least one named line before sending",
            });
          }
        }

        if (!(quote.recipientName || "").trim() || !(quote.recipientEmail || "").trim()) {
          return res.status(400).json({
            message: "Recipient name and email are required before sending",
          });
        }

        const { rawToken, expiresAt } = await createQuoteShareToken({
          quoteId: quote.id,
          organizationId,
          createdByUserId: req.user.id,
        });

        const firstSendPatch = !isResend
          ? {
              submittedAt: new Date(),
              submittedByUserId: req.user.id as string,
            }
          : {};

        const [updated] = await db
          .update(maintenanceQuotes)
          .set({
            status: "sent",
            sentAt: new Date(),
            expiresAt,
            updatedAt: new Date(),
            ...firstSendPatch,
          })
          .where(eq(maintenanceQuotes.id, quote.id))
          .returning();

        const base = publicAppBaseUrl(req);
        const link = `${base}/public/quotes/${rawToken}`;

        await appendWorkOrderEvent({
          organizationId,
          workOrderId: quote.workOrderId,
          eventType: isResend ? "quote_resent" : "quote_sent",
          actorUserId: req.user.id,
          payload: { quoteId: quote.id, expiresAt: expiresAt.toISOString() },
        });

        const lines = await loadLines(quote.id);
        const ctx = await loadWoContext(quote.workOrderId, organizationId);
        let emailSent = false;
        let emailError: string | null = null;
        try {
          const { buildQuotePdfBuffer } = await import("./buildDocumentPdf");
          const pdf = await buildQuotePdfBuffer({
            quote: updated,
            lines,
            issueTitle: ctx?.issueTitle,
            locationLabel: ctx?.locationLabel,
          });
          await sendQuoteToCustomerEmail({
            to: quote.recipientEmail!,
            recipientName: quote.recipientName,
            organizationId,
            quoteReference: quote.quoteReference,
            currency: quote.currency,
            subtotalMinor: updated.subtotalMinor,
            taxMinor: updated.taxMinor,
            totalMinor: updated.totalMinor,
            lines,
            publicLink: link,
            expiresAt,
            isResend,
            issueTitle: ctx?.issueTitle,
            locationLabel: ctx?.locationLabel,
            attachments: [{ filename: pdf.filename, content: pdf.buffer }],
          });
          emailSent = true;
        } catch (emailErr: any) {
          emailError = emailErr?.message || "Email failed";
          console.warn("[quotes] send email failed:", emailErr);
          await appendWorkOrderEvent({
            organizationId,
            workOrderId: quote.workOrderId,
            eventType: "quote_send_email_failed",
            actorUserId: req.user.id,
            payload: { quoteId: quote.id, error: emailError },
          });
        }

        res.json({
          ...serializeQuote(updated, lines),
          publicLink: link,
          emailSent,
          emailError,
        });
      } catch (error: any) {
        console.error("[quotes] send failed:", error);
        res.status(500).json({ message: error?.message || "Failed to send quote" });
      }
    },
  );

  app.post(
    "/api/work-orders/:workOrderId/quotes/:quoteId/resend",
    ...quoteGuards,
    requireRole("owner", "maintenance_admin", "contractor"),
    async (req: any, res: Response) => {
      // Alias of send (handles status === sent).
      try {
        const organizationId = orgId(req);
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }
        const quote = await getQuoteForWo(
          organizationId,
          req.params.workOrderId,
          req.params.quoteId,
        );
        if (!quote) return res.status(404).json({ message: "Quote not found" });
        if (quote.status !== "sent") {
          return res.status(409).json({ message: "Quote cannot be resent in this status" });
        }
        if (!(quote.recipientName || "").trim() || !(quote.recipientEmail || "").trim()) {
          return res.status(400).json({ message: "Recipient name and email are required" });
        }
        const { rawToken, expiresAt } = await createQuoteShareToken({
          quoteId: quote.id,
          organizationId,
          createdByUserId: req.user.id,
        });
        const [updated] = await db
          .update(maintenanceQuotes)
          .set({ status: "sent", sentAt: new Date(), expiresAt, updatedAt: new Date() })
          .where(eq(maintenanceQuotes.id, quote.id))
          .returning();
        const link = `${publicAppBaseUrl(req)}/public/quotes/${rawToken}`;
        await appendWorkOrderEvent({
          organizationId,
          workOrderId: quote.workOrderId,
          eventType: "quote_resent",
          actorUserId: req.user.id,
          payload: { quoteId: quote.id },
        });
        const lines = await loadLines(quote.id);
        const ctx = await loadWoContext(quote.workOrderId, organizationId);
        let emailSent = false;
        let emailError: string | null = null;
        try {
          const { buildQuotePdfBuffer } = await import("./buildDocumentPdf");
          const pdf = await buildQuotePdfBuffer({
            quote: updated,
            lines,
            issueTitle: ctx?.issueTitle,
            locationLabel: ctx?.locationLabel,
          });
          await sendQuoteToCustomerEmail({
            to: quote.recipientEmail!,
            recipientName: quote.recipientName,
            organizationId,
            quoteReference: quote.quoteReference,
            currency: quote.currency,
            subtotalMinor: updated.subtotalMinor,
            taxMinor: updated.taxMinor,
            totalMinor: updated.totalMinor,
            lines,
            publicLink: link,
            expiresAt,
            isResend: true,
            issueTitle: ctx?.issueTitle,
            locationLabel: ctx?.locationLabel,
            attachments: [{ filename: pdf.filename, content: pdf.buffer }],
          });
          emailSent = true;
        } catch (emailErr: any) {
          emailError = emailErr?.message || "Email failed";
          console.warn("[quotes] resend email failed:", emailErr);
        }
        res.json({
          ...serializeQuote(updated, lines),
          publicLink: link,
          emailSent,
          emailError,
        });
      } catch (error: any) {
        console.error("[quotes] resend failed:", error);
        res.status(500).json({ message: error?.message || "Failed to resend quote" });
      }
    },
  );

  app.get(
    "/api/work-orders/:workOrderId/quotes/:quoteId/pdf",
    ...quoteGuards,
    async (req: any, res: Response) => {
      try {
        const organizationId = orgId(req);
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }
        const quote = await getQuoteForWo(
          organizationId,
          req.params.workOrderId,
          req.params.quoteId,
        );
        if (!quote) return res.status(404).json({ message: "Quote not found" });
        const lines = await loadLines(quote.id);
        const ctx = await loadWoContext(quote.workOrderId, organizationId);
        const { buildQuotePdfBuffer } = await import("./buildDocumentPdf");
        const pdf = await buildQuotePdfBuffer({
          quote,
          lines,
          issueTitle: ctx?.issueTitle,
          locationLabel: ctx?.locationLabel,
        });
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${pdf.filename}"`,
        );
        res.send(pdf.buffer);
      } catch (error) {
        console.error("[quotes] pdf failed:", error);
        res.status(500).json({ message: "Failed to generate quote PDF" });
      }
    },
  );

  app.post(
    "/api/work-orders/:workOrderId/quotes/:quoteId/revise",
    ...quoteGuards,
    async (req: any, res: Response) => {
      try {
        const organizationId = orgId(req);
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }

        const quote = await getQuoteForWo(
          organizationId,
          req.params.workOrderId,
          req.params.quoteId,
        );
        if (!quote) return res.status(404).json({ message: "Quote not found" });
        if (!isQuoteRevisable(quote.status)) {
          return res.status(409).json({ message: "Quote cannot be revised in this status" });
        }

        transitionOrThrow(quote.status, "superseded", "staff");

        const lines = await loadLines(quote.id);
        const nextVersion = quote.versionNumber + 1;

        const draft = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(maintenanceQuotes)
            .values({
              organizationId,
              workOrderId: quote.workOrderId,
              propertyId: quote.propertyId,
              blockId: quote.blockId,
              status: "draft",
              quoteNumber: quote.quoteNumber,
              quoteReference: quote.quoteReference,
              versionNumber: nextVersion,
              quoteType: quote.quoteType === "variation" ? "variation" : "revision",
              currency: quote.currency,
              recipientContactId: quote.recipientContactId,
              recipientUserId: quote.recipientUserId,
              recipientName: quote.recipientName,
              recipientEmail: quote.recipientEmail,
              recipientPhone: quote.recipientPhone,
              recipientAddress: quote.recipientAddress,
              scopeDescription: quote.scopeDescription,
              engineerNotes: quote.engineerNotes,
              validUntil: quote.validUntil,
              subtotalMinor: quote.subtotalMinor,
              taxMinor: quote.taxMinor,
              totalMinor: quote.totalMinor,
              preparedByUserId: req.user.id,
              parentQuoteId: quote.id,
              variationOfQuoteId: quote.variationOfQuoteId,
            })
            .returning();

          if (lines.length > 0) {
            await tx.insert(maintenanceQuoteLines).values(
              lines.map((line, index) => ({
                quoteId: created.id,
                sortOrder: index,
                name: line.name,
                description: line.description,
                sku: line.sku,
                category: line.category,
                unit: line.unit,
                quantity: String(line.quantity),
                unitPriceMinor: line.unitPriceMinor,
                vatRate: line.vatRate,
                lineNetMinor: line.lineNetMinor,
                lineTaxMinor: line.lineTaxMinor,
                lineTotalMinor: line.lineTotalMinor,
                priceBookItemId: line.priceBookItemId,
              })),
            );
          }

          await tx
            .update(maintenanceQuotes)
            .set({
              status: "superseded",
              supersededByQuoteId: created.id,
              updatedAt: new Date(),
            })
            .where(eq(maintenanceQuotes.id, quote.id));

          return created;
        });

        await appendWorkOrderEvent({
          organizationId,
          workOrderId: quote.workOrderId,
          eventType: "quote_revised",
          actorUserId: req.user.id,
          payload: { fromQuoteId: quote.id, toQuoteId: draft.id },
        });

        const newLines = await loadLines(draft.id);
        res.status(201).json(serializeQuote(draft, newLines));
      } catch (error: any) {
        console.error("[quotes] revise failed:", error);
        res.status(500).json({ message: error?.message || "Failed to revise quote" });
      }
    },
  );

  app.post(
    "/api/work-orders/:workOrderId/quotes/:quoteId/variation",
    ...quoteGuards,
    async (req: any, res: Response) => {
      try {
        const organizationId = orgId(req);
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }

        const quote = await getQuoteForWo(
          organizationId,
          req.params.workOrderId,
          req.params.quoteId,
        );
        if (!quote) return res.status(404).json({ message: "Quote not found" });
        if (quote.status !== "accepted" && quote.status !== "converted") {
          return res.status(409).json({
            message: "Variations can only be created from accepted or converted quotes",
          });
        }

        const year = new Date().getFullYear();
        const { quoteNumber, quoteReference } = await allocateQuoteNumber(organizationId, year);
        const lines = await loadLines(quote.id);

        const [created] = await db
          .insert(maintenanceQuotes)
          .values({
            organizationId,
            workOrderId: quote.workOrderId,
            propertyId: quote.propertyId,
            blockId: quote.blockId,
            status: "draft",
            quoteNumber,
            quoteReference,
            versionNumber: 1,
            quoteType: "variation",
            currency: quote.currency,
            recipientContactId: quote.recipientContactId,
            recipientUserId: quote.recipientUserId,
            recipientName: quote.recipientName,
            recipientEmail: quote.recipientEmail,
            recipientPhone: quote.recipientPhone,
            recipientAddress: quote.recipientAddress,
            scopeDescription: quote.scopeDescription,
            preparedByUserId: req.user.id,
            variationOfQuoteId: quote.id,
            parentQuoteId: quote.id,
            subtotalMinor: 0,
            taxMinor: 0,
            totalMinor: 0,
          })
          .returning();

        if (lines.length > 0) {
          const blankish = lines.map((line, index) => ({
            quoteId: created.id,
            sortOrder: index,
            name: line.name,
            description: line.description,
            sku: line.sku,
            category: line.category,
            unit: line.unit,
            quantity: String(line.quantity),
            unitPriceMinor: line.unitPriceMinor,
            vatRate: line.vatRate,
            lineNetMinor: line.lineNetMinor,
            lineTaxMinor: line.lineTaxMinor,
            lineTotalMinor: line.lineTotalMinor,
            priceBookItemId: line.priceBookItemId,
          }));
          await db.insert(maintenanceQuoteLines).values(blankish);
          const totals = computeQuoteTotals(
            blankish.map((l) => ({
              lineNetMinor: l.lineNetMinor,
              lineTaxMinor: l.lineTaxMinor,
              lineTotalMinor: l.lineTotalMinor,
            })),
          );
          await db
            .update(maintenanceQuotes)
            .set({
              subtotalMinor: totals.subtotalMinor,
              taxMinor: totals.taxMinor,
              totalMinor: totals.totalMinor,
            })
            .where(eq(maintenanceQuotes.id, created.id));
        }

        await appendWorkOrderEvent({
          organizationId,
          workOrderId: quote.workOrderId,
          eventType: "quote_variation_created",
          actorUserId: req.user.id,
          payload: { fromQuoteId: quote.id, toQuoteId: created.id },
        });

        const newLines = await loadLines(created.id);
        const [fresh] = await db
          .select()
          .from(maintenanceQuotes)
          .where(eq(maintenanceQuotes.id, created.id))
          .limit(1);
        res.status(201).json(serializeQuote(fresh, newLines));
      } catch (error: any) {
        console.error("[quotes] variation failed:", error);
        res.status(500).json({ message: error?.message || "Failed to create variation" });
      }
    },
  );

  app.post(
    "/api/work-orders/:workOrderId/quotes/:quoteId/convert-to-invoice",
    ...quoteGuards,
    requireRole("owner", "maintenance_admin", "contractor"),
    async (req: any, res: Response) => {
      try {
        const { convertQuoteToInvoice } = await import("./invoiceService");
        const organizationId = orgId(req);
        const access = await assertWoAccess(req.user, req.params.workOrderId);
        if ("error" in access) {
          return res.status(access.error).json({ message: access.message });
        }

        const quote = await getQuoteForWo(
          organizationId,
          req.params.workOrderId,
          req.params.quoteId,
        );
        if (!quote) return res.status(404).json({ message: "Quote not found" });

        const result = await convertQuoteToInvoice({
          quote,
          actorUserId: req.user.id,
          actorRole: req.user.role || "",
        });
        res.status(201).json(result);
      } catch (error: any) {
        console.error("[quotes] convert failed:", error);
        const status = error?.statusCode || 500;
        res.status(status).json({ message: error?.message || "Failed to convert quote" });
      }
    },
  );
}
