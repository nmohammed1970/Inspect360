import { and, eq, gt, gte, isNotNull, lte, or, sql } from "drizzle-orm";
import { billingNowUtc } from "@shared/billingClock";
import { MS_PER_DAY } from "@shared/entitlements";
import {
  EXPIRY_NOTICE_CATCHUP_MS,
  MAX_NOTIFICATION_ATTEMPTS,
  evaluateExpiryNotifications,
  type ExpiryNotificationIntent,
} from "@shared/entitlementNotifications";
import { creditBatches, entitlementNotificationLog, organizations } from "@shared/schema";
import { db, pool } from "./db";
import { buildExpiryEmail } from "./entitlementEmailTemplates";
import { getOrganizationAccessStatus } from "./entitlementService";
import { sendEmail } from "./resend";
import { storage } from "./storage";

const ADVISORY_LOCK_KEY = 84236019;
const STALE_PENDING_MS = 15 * 60 * 1000;
const CANDIDATE_LOOKAHEAD_MS = 4 * MS_PER_DAY;

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Email delivery failed";
  return message.slice(0, 500);
}

function hasEmail(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.includes("@") && !trimmed.includes(" ");
}

async function listCandidateOrganizationIds(now: Date): Promise<string[]> {
  const windowStart = new Date(now.getTime() - EXPIRY_NOTICE_CATCHUP_MS);
  const windowEnd = new Date(now.getTime() + CANDIDATE_LOOKAHEAD_MS);

  const trialRows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(
      eq(organizations.trialEnforced, true),
      isNotNull(organizations.trialEndAt),
      gte(organizations.trialEndAt, windowStart),
      lte(organizations.trialEndAt, windowEnd),
    ));

  const creditRows = await db
    .select({ id: creditBatches.organizationId })
    .from(creditBatches)
    .where(and(
      isNotNull(creditBatches.expiresAt),
      gt(creditBatches.remainingQuantity, 0),
      gte(creditBatches.expiresAt, windowStart),
      lte(creditBatches.expiresAt, windowEnd),
    ));

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of [...trialRows, ...creditRows]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    ids.push(row.id);
  }
  return ids;
}

async function claimDelivery(
  organizationId: string,
  intent: ExpiryNotificationIntent,
  recipientEmail: string,
  now: Date,
): Promise<string | null> {
  const inserted = await db
    .insert(entitlementNotificationLog)
    .values({
      organizationId,
      notificationType: intent.type,
      eventKey: intent.eventKey,
      recipientEmail,
      status: "pending",
      attempts: 1,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning({ id: entitlementNotificationLog.id });

  if (inserted[0]?.id) return inserted[0].id;

  const staleBefore = new Date(now.getTime() - STALE_PENDING_MS);
  const claimed = await db
    .update(entitlementNotificationLog)
    .set({
      status: "pending",
      attempts: sql`${entitlementNotificationLog.attempts} + 1`,
      recipientEmail,
      updatedAt: now,
      lastError: null,
    })
    .where(and(
      eq(entitlementNotificationLog.organizationId, organizationId),
      eq(entitlementNotificationLog.notificationType, intent.type),
      eq(entitlementNotificationLog.eventKey, intent.eventKey),
      sql`${entitlementNotificationLog.attempts} < ${MAX_NOTIFICATION_ATTEMPTS}`,
      or(
        eq(entitlementNotificationLog.status, "failed"),
        and(
          eq(entitlementNotificationLog.status, "pending"),
          lte(entitlementNotificationLog.updatedAt, staleBefore),
        ),
      ),
    ))
    .returning({ id: entitlementNotificationLog.id });

  return claimed[0]?.id ?? null;
}

async function skipStaleFailures(
  organizationId: string,
  intents: ExpiryNotificationIntent[],
  now: Date,
): Promise<void> {
  const failed = await db
    .select({
      id: entitlementNotificationLog.id,
      notificationType: entitlementNotificationLog.notificationType,
      eventKey: entitlementNotificationLog.eventKey,
    })
    .from(entitlementNotificationLog)
    .where(and(
      eq(entitlementNotificationLog.organizationId, organizationId),
      eq(entitlementNotificationLog.status, "failed"),
    ));

  for (const row of failed) {
    const stillDue = intents.some(
      (intent) => intent.type === row.notificationType && intent.eventKey === row.eventKey,
    );
    if (stillDue) continue;
    await db
      .update(entitlementNotificationLog)
      .set({ status: "skipped", updatedAt: now })
      .where(eq(entitlementNotificationLog.id, row.id));
    console.log(`[EntitlementNotice] skipped org=${organizationId} type=${row.notificationType} reason=entitlement_changed`);
  }
}

async function deliverIntent(
  organizationId: string,
  intent: ExpiryNotificationIntent,
  email: ExpiryEmailContextInput,
  now: Date,
): Promise<"sent" | "failed" | "skipped"> {
  const claimId = await claimDelivery(organizationId, intent, email.recipientEmail, now);
  if (!claimId) return "skipped";

  const content = buildExpiryEmail({
    productName: email.productName,
    recipientName: email.recipientName,
    organizationName: email.organizationName,
    loginUrl: email.loginUrl,
    logoUrl: email.logoUrl,
    intent,
  });

  try {
    await sendEmail({
      to: email.recipientEmail,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });
    await db
      .update(entitlementNotificationLog)
      .set({ status: "sent", sentAt: new Date(), updatedAt: new Date(), lastError: null })
      .where(eq(entitlementNotificationLog.id, claimId));
    console.log(`[EntitlementNotice] sent org=${organizationId} type=${intent.type}`);
    return "sent";
  } catch (error) {
    await db
      .update(entitlementNotificationLog)
      .set({ status: "failed", lastError: errorMessage(error), updatedAt: new Date() })
      .where(eq(entitlementNotificationLog.id, claimId));
    console.error(`[EntitlementNotice] failed org=${organizationId} type=${intent.type}`);
    return "failed";
  }
}

type ExpiryEmailContextInput = {
  recipientEmail: string;
  recipientName: string;
  organizationName: string;
  productName: string;
  loginUrl: string;
  logoUrl?: string | null;
};

async function processOrganization(organizationId: string, now: Date, loginUrl: string): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  const counts = { sent: 0, failed: 0, skipped: 0 };
  const organization = await storage.getOrganization(organizationId);
  if (!organization || organization.isActive === false) {
    console.log(`[EntitlementNotice] skipped org=${organizationId} reason=inactive`);
    return counts;
  }

  const status = await getOrganizationAccessStatus(organizationId, now);
  if (!status) return counts;

  const intents = evaluateExpiryNotifications(status, now, {
    trialEnforced: organization.trialEnforced === true,
  });
  await skipStaleFailures(organizationId, intents, now);
  if (intents.length === 0) return counts;

  const owner = await storage.getUser(organization.ownerId);
  const recipientEmail = owner?.email?.trim() ?? "";
  if (!hasEmail(recipientEmail)) {
    console.log(`[EntitlementNotice] skipped org=${organizationId} reason=no_recipient`);
    return { ...counts, skipped: intents.length };
  }

  const email: ExpiryEmailContextInput = {
    recipientEmail,
    recipientName: [owner?.firstName, owner?.lastName].filter(Boolean).join(" "),
    organizationName: organization.brandingName?.trim() || organization.name,
    productName: organization.brandingName?.trim() || "Inspect360",
    loginUrl,
    logoUrl: organization.logoUrl,
  };

  for (const intent of intents) {
    const result = await deliverIntent(organizationId, intent, email, now);
    counts[result] += 1;
  }
  return counts;
}

export async function processExpiryNotifications(now: Date = billingNowUtc()): Promise<{
  organizations: number;
  sent: number;
  failed: number;
  skipped: number;
}> {
  const client = await pool.connect();
  try {
    const locked = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock($1) AS locked", [ADVISORY_LOCK_KEY]);
    if (!locked.rows[0]?.locked) {
      console.log("[EntitlementNotice] skipped reason=lock_held");
      return { organizations: 0, sent: 0, failed: 0, skipped: 0 };
    }

    const totals = { organizations: 0, sent: 0, failed: 0, skipped: 0 };
    try {
      const loginUrl = process.env.BASE_URL || "https://portal.inspect360.ai";
      const organizationIds = await listCandidateOrganizationIds(now);
      totals.organizations = organizationIds.length;
      for (const organizationId of organizationIds) {
        try {
          const result = await processOrganization(organizationId, now, loginUrl);
          totals.sent += result.sent;
          totals.failed += result.failed;
          totals.skipped += result.skipped;
        } catch (error) {
          totals.failed += 1;
          console.error(`[EntitlementNotice] failed org=${organizationId} reason=scan`);
          console.error(error instanceof Error ? error.message : "scan failed");
        }
      }
      console.log(`[EntitlementNotice] scan complete orgs=${totals.organizations} sent=${totals.sent} failed=${totals.failed} skipped=${totals.skipped}`);
      return totals;
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}
