import { createHash, randomBytes } from "crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  maintenanceQuoteShareTokens,
  maintenanceQuotes,
  workOrderEvents,
  workOrders,
  type MaintenanceQuote,
} from "@shared/schema";
import {
  QUOTE_SHARE_TOKEN_TTL_MS,
  assertQuoteTransition,
  type QuoteTransitionActor,
} from "@shared/maintenanceQuoteConstants";

export function hashShareToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateShareTokenRaw(): string {
  return randomBytes(32).toString("base64url");
}

export async function appendWorkOrderEvent(input: {
  organizationId: string;
  workOrderId: string;
  eventType: string;
  actorUserId?: string | null;
  payload?: Record<string, unknown> | null;
}) {
  await db.insert(workOrderEvents).values({
    organizationId: input.organizationId,
    workOrderId: input.workOrderId,
    eventType: input.eventType,
    actorUserId: input.actorUserId ?? null,
    payloadJson: input.payload ?? null,
  });
}

export function transitionOrThrow(
  from: string,
  to: string,
  actor: QuoteTransitionActor,
) {
  assertQuoteTransition(from, to, actor);
}

/** Customer accept via token — authorise WO and lock cost_estimate. */
export async function onQuoteAccepted(quote: MaintenanceQuote) {
  await db
    .update(workOrders)
    .set({
      authorisationStatus: "authorised",
      approvedQuoteId: quote.id,
      authorisedTotalMinor: quote.totalMinor,
      costEstimate: quote.totalMinor,
      updatedAt: new Date(),
    })
    .where(eq(workOrders.id, quote.workOrderId));

  await appendWorkOrderEvent({
    organizationId: quote.organizationId,
    workOrderId: quote.workOrderId,
    eventType: "quote_accepted",
    payload: {
      quoteId: quote.id,
      totalMinor: quote.totalMinor,
      currency: quote.currency,
    },
  });
}

export async function revokeActiveQuoteTokens(quoteId: string) {
  await db
    .update(maintenanceQuoteShareTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(maintenanceQuoteShareTokens.quoteId, quoteId),
        isNull(maintenanceQuoteShareTokens.revokedAt),
      ),
    );
}

export async function createQuoteShareToken(input: {
  quoteId: string;
  organizationId: string;
  createdByUserId: string;
  ttlMs?: number;
}): Promise<{ rawToken: string; expiresAt: Date }> {
  await revokeActiveQuoteTokens(input.quoteId);
  const rawToken = generateShareTokenRaw();
  const expiresAt = new Date(Date.now() + (input.ttlMs ?? QUOTE_SHARE_TOKEN_TTL_MS));
  await db.insert(maintenanceQuoteShareTokens).values({
    quoteId: input.quoteId,
    organizationId: input.organizationId,
    tokenHash: hashShareToken(rawToken),
    expiresAt,
    createdByUserId: input.createdByUserId,
  });
  return { rawToken, expiresAt };
}

export async function findValidQuoteToken(rawToken: string) {
  const tokenHash = hashShareToken(rawToken);
  const [row] = await db
    .select()
    .from(maintenanceQuoteShareTokens)
    .where(eq(maintenanceQuoteShareTokens.tokenHash, tokenHash))
    .limit(1);
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  return row;
}

export async function allocateDocumentNumber(
  organizationId: string,
  documentType: "quote" | "invoice",
): Promise<{ number: number }> {
  return db.transaction(async (tx) => {
    const year = new Date().getFullYear();
    const existing = await tx.execute(sql`
      SELECT id, next_value
      FROM maintenance_document_sequences
      WHERE organization_id = ${organizationId}
        AND document_type = ${documentType}
        AND year = ${year}
      FOR UPDATE
    `);

    let nextValue: number;
    if (!existing.rows || existing.rows.length === 0) {
      nextValue = 1;
      await tx.execute(sql`
        INSERT INTO maintenance_document_sequences
          (id, organization_id, document_type, year, next_value, updated_at)
        VALUES
          (gen_random_uuid()::text, ${organizationId}, ${documentType}, ${year}, 2, NOW())
      `);
    } else {
      const row = existing.rows[0] as { id: string; next_value: number };
      nextValue = Number(row.next_value) || 1;
      await tx.execute(sql`
        UPDATE maintenance_document_sequences
        SET next_value = ${nextValue + 1}, updated_at = NOW()
        WHERE id = ${row.id}
      `);
    }
    return { number: nextValue };
  });
}

export function publicAppBaseUrl(req?: { protocol?: string; get?: (h: string) => string }): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/$/, "");
  if (req?.get) {
    const host = req.get("host");
    if (host) return `${req.protocol || "https"}://${host}`;
  }
  return "http://localhost:5000";
}
