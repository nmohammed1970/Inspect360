import { createHmac, timingSafeEqual } from "crypto";
import { and, eq } from "drizzle-orm";
import {
  communicationChannelEvents,
  communicationMessages,
} from "@shared/schema";
import { db } from "../db";

export type ChannelProvider = "email" | "whatsapp" | "stub";

export type InboundChannelPayload = {
  provider: ChannelProvider;
  externalEventId: string;
  providerMessageId?: string;
  fromAddress?: string;
  toAddress?: string;
  subject?: string;
  body: string;
  receivedAt?: string;
  organizationId?: string | null;
  tenantIdHint?: string | null;
  metadata?: Record<string, unknown>;
};

export type OutboundSendResult = {
  deliveryStatus: "queued" | "sent" | "failed" | "unknown";
  providerMessageId?: string | null;
  errorMessage?: string | null;
};

/** Shared mailbox adapter interface — Phase 2 stubs until live providers are wired. */
export interface ChannelAdapter {
  readonly provider: ChannelProvider;
  send(params: {
    to: string;
    body: string;
    subject?: string;
    templateName?: string;
    organizationId: string;
  }): Promise<OutboundSendResult>;
  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean;
}

export class StubChannelAdapter implements ChannelAdapter {
  readonly provider: ChannelProvider = "stub";

  async send(): Promise<OutboundSendResult> {
    return {
      deliveryStatus: "queued",
      providerMessageId: `stub-${Date.now()}`,
    };
  }

  verifyWebhookSignature(): boolean {
    return true;
  }
}

export class EmailChannelAdapter implements ChannelAdapter {
  readonly provider: ChannelProvider = "email";

  constructor(private secret = process.env.COMMUNICATIONS_EMAIL_WEBHOOK_SECRET || "") {}

  async send(params: {
    to: string;
    body: string;
    subject?: string;
    organizationId: string;
  }): Promise<OutboundSendResult> {
    // Live SMTP/API not configured — queue for admin retry UI.
    if (!process.env.COMMUNICATIONS_EMAIL_API_KEY) {
      return {
        deliveryStatus: "queued",
        providerMessageId: null,
        errorMessage: "Email provider not configured",
      };
    }
    void params;
    return { deliveryStatus: "sent", providerMessageId: `email-${Date.now()}` };
  }

  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    if (!this.secret) return process.env.NODE_ENV !== "production";
    if (!signature) return false;
    const expected = createHmac("sha256", this.secret).update(rawBody).digest("hex");
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(signature.replace(/^sha256=/, ""));
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}

export class WhatsAppChannelAdapter implements ChannelAdapter {
  readonly provider: ChannelProvider = "whatsapp";

  constructor(private secret = process.env.COMMUNICATIONS_WHATSAPP_WEBHOOK_SECRET || "") {}

  async send(params: {
    to: string;
    body: string;
    templateName?: string;
    organizationId: string;
  }): Promise<OutboundSendResult> {
    // Personal WhatsApp scrape is forbidden; Business API templates only when configured.
    if (!process.env.COMMUNICATIONS_WHATSAPP_TOKEN) {
      return {
        deliveryStatus: "queued",
        providerMessageId: null,
        errorMessage: "WhatsApp Business API not configured",
      };
    }
    if (!params.templateName && process.env.NODE_ENV === "production") {
      return {
        deliveryStatus: "failed",
        errorMessage: "WhatsApp outbound requires an approved template",
      };
    }
    return { deliveryStatus: "sent", providerMessageId: `wa-${Date.now()}` };
  }

  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    if (!this.secret) return process.env.NODE_ENV !== "production";
    if (!signature) return false;
    const expected = createHmac("sha256", this.secret).update(rawBody).digest("hex");
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(signature.replace(/^sha256=/, ""));
      return a.length === b.length && timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}

const adapters: Record<ChannelProvider, ChannelAdapter> = {
  stub: new StubChannelAdapter(),
  email: new EmailChannelAdapter(),
  whatsapp: new WhatsAppChannelAdapter(),
};

export function getChannelAdapter(provider: ChannelProvider): ChannelAdapter {
  return adapters[provider] || adapters.stub;
}

/** Idempotent webhook intake — duplicate externalEventId returns existing row. */
export async function ingestChannelWebhook(params: {
  provider: ChannelProvider;
  externalEventId: string;
  payload: Record<string, unknown>;
  organizationId?: string | null;
  correlationId?: string | null;
}) {
  const [existing] = await db
    .select()
    .from(communicationChannelEvents)
    .where(
      and(
        eq(communicationChannelEvents.provider, params.provider),
        eq(communicationChannelEvents.externalEventId, params.externalEventId),
      ),
    )
    .limit(1);

  if (existing) {
    return { event: existing, duplicate: true as const };
  }

  const [row] = await db
    .insert(communicationChannelEvents)
    .values({
      organizationId: params.organizationId ?? null,
      provider: params.provider,
      externalEventId: params.externalEventId,
      processingStatus: "pending",
      payloadJson: params.payload,
      correlationId: params.correlationId ?? null,
    })
    .returning();

  return { event: row, duplicate: false as const };
}

export async function markChannelEventProcessed(
  eventId: string,
  status: "processed" | "failed" | "dead_letter",
  errorMessage?: string | null,
) {
  const [row] = await db
    .update(communicationChannelEvents)
    .set({
      processingStatus: status,
      errorMessage: errorMessage ?? null,
      updatedAt: new Date(),
    })
    .where(eq(communicationChannelEvents.id, eventId))
    .returning();
  return row;
}

export async function updateMessageDeliveryStatus(
  organizationId: string,
  providerMessageId: string,
  deliveryStatus: string,
) {
  const [row] = await db
    .update(communicationMessages)
    .set({ deliveryStatus })
    .where(
      and(
        eq(communicationMessages.organizationId, organizationId),
        eq(communicationMessages.providerMessageId, providerMessageId),
      ),
    )
    .returning();
  return row ?? null;
}

export async function listDeadLetterEvents(organizationId?: string) {
  const conditions = [eq(communicationChannelEvents.processingStatus, "dead_letter")];
  if (organizationId) {
    conditions.push(eq(communicationChannelEvents.organizationId, organizationId));
  }
  return db
    .select()
    .from(communicationChannelEvents)
    .where(and(...conditions));
}

/** Unmatched inbound sender → identity review (nullable tenant). */
export type IdentityReviewItem = {
  channelEventId: string;
  provider: string;
  fromAddress: string | null;
  organizationId: string | null;
  createdAt: Date | null;
  payload: Record<string, unknown> | null;
};

export async function listIdentityReviewQueue(
  organizationId: string,
): Promise<IdentityReviewItem[]> {
  const rows = await db
    .select()
    .from(communicationChannelEvents)
    .where(
      and(
        eq(communicationChannelEvents.organizationId, organizationId),
        eq(communicationChannelEvents.processingStatus, "pending"),
      ),
    );

  return rows
    .filter((r) => {
      const p = (r.payloadJson || {}) as Record<string, unknown>;
      return !p.tenantId && p.needsIdentityReview === true;
    })
    .map((r) => ({
      channelEventId: r.id,
      provider: r.provider,
      fromAddress: ((r.payloadJson as any)?.fromAddress as string) || null,
      organizationId: r.organizationId,
      createdAt: r.createdAt,
      payload: r.payloadJson,
    }));
}
