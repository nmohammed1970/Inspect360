import { eq } from "drizzle-orm";
import { db } from "../db";
import {
  maintenanceQuoteLines,
  maintenanceQuotes,
  type MaintenanceQuote,
  type MaintenanceQuoteLine,
} from "@shared/schema";
import { customerDecisionSchema } from "@shared/maintenanceQuoteConstants";
import {
  appendWorkOrderEvent,
  onQuoteAccepted,
  publicAppBaseUrl,
  revokeActiveQuoteTokens,
  transitionOrThrow,
} from "./quoteLifecycle";
import { sendQuoteCustomerResponseEmail } from "./maintenanceFinanceEmails";
import { loadPublicWorkContext } from "./publicFinanceContext";
import { resolveQuoteStaffNotifyRecipients } from "./resolveQuoteStaffNotifyRecipients";
import {
  notifyFinanceUsers,
  quoteCustomerDecisionNotifyType,
  quoteCustomerDecisionTitle,
} from "./notifyFinanceUsers";

export type RecipientDecision = "accept" | "decline" | "request_changes";

const STATUS_MAP = {
  accept: "accepted",
  decline: "declined",
  request_changes: "customer_changes_requested",
} as const;

export function parseRecipientDecisionBody(body: unknown): {
  reason: string | null;
} {
  const parsed = customerDecisionSchema.safeParse(body || {});
  if (!parsed.success) {
    throw Object.assign(new Error("Invalid payload"), { status: 400 });
  }
  return { reason: parsed.data.reason?.trim() || null };
}

/**
 * Apply accept / decline / request_changes on a sent quote.
 * Used by public token page and authenticated owner/admin in-app.
 */
export async function applyQuoteRecipientDecision(input: {
  quote: MaintenanceQuote;
  decision: RecipientDecision;
  reason: string | null;
  actorUserId?: string | null;
  req?: { protocol?: string; get?: (h: string) => string };
}): Promise<{ status: string; quote: MaintenanceQuote }> {
  if (input.quote.status !== "sent") {
    throw Object.assign(
      new Error("This quotation is no longer awaiting a response"),
      { status: 409 },
    );
  }
  if (input.decision !== "accept" && !input.reason) {
    throw Object.assign(new Error("Please provide a brief reason"), { status: 400 });
  }

  const nextStatus = STATUS_MAP[input.decision];
  transitionOrThrow(input.quote.status, nextStatus, "customer");

  const [updated] = await db
    .update(maintenanceQuotes)
    .set({
      status: nextStatus,
      customerDecision: input.decision,
      customerDecisionReason: input.reason,
      customerDecidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(maintenanceQuotes.id, input.quote.id))
    .returning();

  await revokeActiveQuoteTokens(input.quote.id);
  await appendWorkOrderEvent({
    organizationId: input.quote.organizationId,
    workOrderId: input.quote.workOrderId,
    eventType: `quote_customer_${input.decision}`,
    actorUserId: input.actorUserId ?? null,
    payload: {
      quoteId: input.quote.id,
      nextStatus,
      reason: input.reason,
      via: input.actorUserId ? "authenticated" : "public_token",
    },
  });

  if (input.decision === "accept") {
    await onQuoteAccepted(updated);
  }

  try {
    const lines: MaintenanceQuoteLine[] = await db
      .select()
      .from(maintenanceQuoteLines)
      .where(eq(maintenanceQuoteLines.quoteId, input.quote.id));

    const baseUrl = publicAppBaseUrl(input.req);
    const work = await loadPublicWorkContext(
      input.quote.workOrderId,
      input.quote.organizationId,
    );
    const recipients = await resolveQuoteStaffNotifyRecipients(input.quote);

    const emailPayload = {
      organizationId: input.quote.organizationId,
      workOrderId: input.quote.workOrderId,
      quoteId: input.quote.id,
      quoteReference: input.quote.quoteReference,
      decision: input.decision,
      reason: input.reason,
      currency: input.quote.currency,
      subtotalMinor: input.quote.subtotalMinor,
      taxMinor: input.quote.taxMinor,
      totalMinor: input.quote.totalMinor,
      lines,
      issueTitle: work?.issueTitle,
      locationLabel: work?.locationLabel,
      baseUrl,
    } as const;

    const emailTargets = [
      ...recipients.ownersAdmins.slice(0, 5),
      ...recipients.fieldStaff,
    ].filter((r) => !!(r.email || "").trim());

    const emailed = new Set<string>();
    for (const target of emailTargets) {
      const to = target.email!.trim();
      const key = to.toLowerCase();
      if (emailed.has(key)) continue;
      emailed.add(key);
      await sendQuoteCustomerResponseEmail({ to, ...emailPayload });
    }

    const decisionLabel =
      input.decision === "accept"
        ? "accepted"
        : input.decision === "decline"
          ? "declined"
          : "requested changes on";
    await notifyFinanceUsers({
      userIds: recipients.notifyUserIds,
      organizationId: input.quote.organizationId,
      type: quoteCustomerDecisionNotifyType(input.decision),
      title: quoteCustomerDecisionTitle(input.decision),
      message: `Recipient ${decisionLabel} ${input.quote.quoteReference}${
        work?.issueTitle ? ` — ${work.issueTitle}` : ""
      }`,
      data: {
        workOrderId: input.quote.workOrderId,
        quoteId: input.quote.id,
        quoteReference: input.quote.quoteReference,
        decision: input.decision,
      },
    });
  } catch (emailErr) {
    console.warn("[quote-recipient-decision] notify failed:", emailErr);
  }

  return { status: nextStatus, quote: updated };
}
