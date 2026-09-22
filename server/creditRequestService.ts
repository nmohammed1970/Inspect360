import { and, desc, eq, gte, sql } from "drizzle-orm";
import { billingNowUtc } from "@shared/billingClock";
import {
  applyGrant,
  exceedsHourlyLimit,
  isDuplicateSubmission,
  parseCreditRequestCreate,
  resolveRequestIdentity,
  uniqueAdminEmails,
  DUPLICATE_WINDOW_MS,
  type ParsedCreditRequest,
} from "@shared/creditRequests";
import { creditRequests, type CreditRequest } from "@shared/schema";
import { db } from "./db";
import { recordEntitlementEvent } from "./entitlementService";
import { buildCreditRequestEmail } from "./creditRequestEmail";
import { sendEmail } from "./resend";
import { storage } from "./storage";

export class CreditRequestError extends Error {
  status: number;
  field?: string;

  constructor(status: number, message: string, field?: string) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

const PAGE_SIZE = 25;

export type CreditRequestPublic = {
  id: string;
  status: string;
  creditsRequested: number;
  emailNotified: boolean;
  duplicate: boolean;
};

function toPublic(row: CreditRequest, duplicate: boolean): CreditRequestPublic {
  return {
    id: row.id,
    status: row.status,
    creditsRequested: row.creditsRequested,
    emailNotified: row.emailStatus === "sent",
    duplicate,
  };
}

export async function createCreditRequest(userId: string, body: unknown, now = billingNowUtc()): Promise<CreditRequestPublic> {
  const parsed = parseCreditRequestCreate(body);
  if (!parsed.ok) {
    throw new CreditRequestError(400, parsed.message, parsed.field);
  }

  const user = await storage.getUser(userId);
  if (!user) {
    throw new CreditRequestError(401, "Unauthorized");
  }
  if (!user.organizationId) {
    throw new CreditRequestError(400, "Your account is not linked to an organization.");
  }
  const organization = await storage.getOrganization(user.organizationId);
  if (!organization) {
    throw new CreditRequestError(400, "Your account is not linked to an organization.");
  }

  const identity = resolveRequestIdentity({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    organizationId: organization.id,
    organizationName: organization.name,
  });

  if (await exceedsRecentDuplicate(user.id, parsed, now)) {
    const existing = await findRecentDuplicate(user.id, parsed, now);
    if (existing) return toPublic(existing, true);
  }

  const recentCount = await countSince(user.id, new Date(now.getTime() - 60 * 60 * 1000));
  if (exceedsHourlyLimit(recentCount)) {
    throw new CreditRequestError(429, "Please wait before submitting another credit request.");
  }

  const [created] = await db.insert(creditRequests).values({
    organizationId: identity.organizationId,
    requestedByUserId: identity.requestedByUserId,
    requesterName: identity.requesterName,
    requesterEmail: identity.requesterEmail,
    organizationName: identity.organizationName,
    creditsRequested: parsed.creditsRequested,
    message: parsed.message,
    status: identity.status,
    emailStatus: "pending",
    createdAt: now,
    updatedAt: now,
  }).returning();

  const notified = await notifyAdmins(created);
  return toPublic(notified, false);
}

async function exceedsRecentDuplicate(userId: string, parsed: ParsedCreditRequest, now: Date): Promise<boolean> {
  const existing = await findRecentDuplicate(userId, parsed, now);
  return isDuplicateSubmission(existing, parsed, now);
}

async function findRecentDuplicate(userId: string, parsed: ParsedCreditRequest, now: Date): Promise<CreditRequest | null> {
  const since = new Date(now.getTime() - DUPLICATE_WINDOW_MS);
  const [row] = await db
    .select()
    .from(creditRequests)
    .where(and(
      eq(creditRequests.requestedByUserId, userId),
      eq(creditRequests.creditsRequested, parsed.creditsRequested),
      eq(creditRequests.message, parsed.message),
      gte(creditRequests.createdAt, since),
    ))
    .orderBy(desc(creditRequests.createdAt))
    .limit(1);
  return row ?? null;
}

async function countSince(userId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(creditRequests)
    .where(and(
      eq(creditRequests.requestedByUserId, userId),
      gte(creditRequests.createdAt, since),
    ));
  return Number(row?.total ?? 0);
}

async function notifyAdmins(request: CreditRequest): Promise<CreditRequest> {
  const admins = await storage.getAllAdmins();
  const recipients = uniqueAdminEmails(admins);
  const baseUrl = process.env.BASE_URL || "https://portal.inspect360.ai";
  const content = buildCreditRequestEmail({
    organizationName: request.organizationName,
    requesterName: request.requesterName,
    requesterEmail: request.requesterEmail,
    creditsRequested: request.creditsRequested,
    message: request.message,
    requestedAt: request.createdAt ?? new Date(),
    adminUrl: `${baseUrl.replace(/\/$/, "")}/admin/credit-requests`,
  });

  if (recipients.length === 0) {
    return updateEmailResult(request.id, "failed", "No administrators to notify");
  }

  const errors: string[] = [];
  for (const email of recipients) {
    try {
      await sendEmail({ to: email, subject: content.subject, html: content.html, text: content.text });
    } catch (error: any) {
      console.error(`[CreditRequest] Email failed for ${email}:`, error?.message || error);
      errors.push(email);
    }
  }

  if (errors.length > 0) {
    return updateEmailResult(request.id, "failed", `Failed to notify: ${errors.join(", ")}`);
  }
  return updateEmailResult(request.id, "sent", null);
}

async function updateEmailResult(id: string, emailStatus: "sent" | "failed", emailError: string | null): Promise<CreditRequest> {
  const [row] = await db
    .update(creditRequests)
    .set({ emailStatus, emailError, updatedAt: new Date() })
    .where(eq(creditRequests.id, id))
    .returning();
  return row;
}

export async function listCreditRequests(query: { q?: string; status?: string; page?: number }) {
  const page = Number.isInteger(query.page) && query.page && query.page > 0 ? query.page : 1;
  const filters = [];
  if (query.status === "REQUESTED" || query.status === "GRANTED") {
    filters.push(eq(creditRequests.status, query.status));
  }
  const q = (query.q || "").trim().slice(0, 200);
  if (q) {
    const pattern = `%${q.replace(/[%_]/g, "")}%`;
    filters.push(sql`(
      ${creditRequests.organizationName} ILIKE ${pattern}
      OR ${creditRequests.requesterName} ILIKE ${pattern}
      OR ${creditRequests.requesterEmail} ILIKE ${pattern}
    )`);
  }
  const where = filters.length ? and(...filters) : undefined;
  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(creditRequests)
    .where(where);
  const requests = await db
    .select()
    .from(creditRequests)
    .where(where)
    .orderBy(desc(creditRequests.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  return {
    requests,
    page,
    pageSize: PAGE_SIZE,
    total: Number(countRow?.total ?? 0),
  };
}

export async function getCreditRequest(id: string): Promise<CreditRequest> {
  const [row] = await db.select().from(creditRequests).where(eq(creditRequests.id, id));
  if (!row) throw new CreditRequestError(404, "Credit request not found");
  return row;
}

export async function countOpenCreditRequests(): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(creditRequests)
    .where(eq(creditRequests.status, "REQUESTED"));
  return Number(row?.total ?? 0);
}

export async function grantCreditRequest(id: string, adminId: string, now = billingNowUtc()): Promise<CreditRequest> {
  const current = await getCreditRequest(id);
  const decision = applyGrant(current.status, adminId, now);
  if (!decision.ok) {
    throw new CreditRequestError(decision.statusCode, decision.message);
  }
  const [updated] = await db
    .update(creditRequests)
    .set({
      status: decision.status,
      grantedAt: decision.grantedAt,
      grantedBy: decision.grantedBy,
      updatedAt: decision.grantedAt,
    })
    .where(and(eq(creditRequests.id, id), eq(creditRequests.status, "REQUESTED")))
    .returning();
  if (!updated) {
    throw new CreditRequestError(409, "This request is already granted");
  }
  try {
    await recordEntitlementEvent({
      organizationId: updated.organizationId,
      eventType: "CREDIT_REQUEST_GRANTED",
      actorUserId: adminId,
      notes: `request=${updated.id} requester=${updated.requesterEmail} credits=${updated.creditsRequested}`,
    });
  } catch (error) {
    console.error("[CreditRequest] Audit event failed:", error);
  }
  return updated;
}
