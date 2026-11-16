import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql, count } from "drizzle-orm";
import { db } from "../db";
import {
  feedbackAttachments,
  feedbackAuditEvents,
  feedbackMessages,
  feedbackReferenceCounter,
  feedbackRequests,
  featureAdminMembers,
  FEEDBACK_OPEN_STATUSES,
  type FeedbackAttachment,
  type FeedbackMessage,
  type FeedbackRequest,
  type FeatureAdminMember,
} from "@shared/schema";

export async function nextFeedbackReference(): Promise<string> {
  const result = await db.execute(
    sql`UPDATE feedback_reference_counter SET next_value = next_value + 1 WHERE id = 1 RETURNING next_value - 1 AS n`,
  );
  const rows = (result as any).rows || result;
  const n = Number(rows?.[0]?.n ?? rows?.[0]?.next_value ?? 1);
  return `FB-${String(n).padStart(6, "0")}`;
}

export async function createFeedbackRequest(input: {
  type: string;
  subject: string;
  description: string;
  reporterUserId: string;
  reporterNameSnapshot?: string | null;
  reporterEmailSnapshot?: string | null;
  organizationId?: string | null;
  organizationNameSnapshot?: string | null;
  sourcePage?: string | null;
  clientContext?: Record<string, unknown> | null;
}): Promise<FeedbackRequest> {
  const reference = await nextFeedbackReference();
  const [row] = await db
    .insert(feedbackRequests)
    .values({
      reference,
      type: input.type,
      subject: input.subject.slice(0, 150),
      description: input.description,
      status: "new",
      reporterUserId: input.reporterUserId,
      reporterNameSnapshot: input.reporterNameSnapshot ?? null,
      reporterEmailSnapshot: input.reporterEmailSnapshot ?? null,
      organizationId: input.organizationId ?? null,
      organizationNameSnapshot: input.organizationNameSnapshot ?? null,
      sourcePage: input.sourcePage ?? null,
      clientContext: input.clientContext ?? null,
    })
    .returning();

  await writeAudit({
    feedbackRequestId: row!.id,
    actorUserId: input.reporterUserId,
    eventType: "created",
    afterValue: reference,
  });

  return row!;
}

export async function writeAudit(input: {
  feedbackRequestId: string;
  actorUserId?: string | null;
  eventType: string;
  beforeValue?: string | null;
  afterValue?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  await db.insert(feedbackAuditEvents).values({
    feedbackRequestId: input.feedbackRequestId,
    actorUserId: input.actorUserId ?? null,
    eventType: input.eventType,
    beforeValue: input.beforeValue ?? null,
    afterValue: input.afterValue ?? null,
    metadata: input.metadata ?? null,
  });
}

export async function getFeedbackById(id: string): Promise<FeedbackRequest | undefined> {
  const [row] = await db.select().from(feedbackRequests).where(eq(feedbackRequests.id, id)).limit(1);
  return row;
}

export async function getFeedbackByReference(reference: string): Promise<FeedbackRequest | undefined> {
  const [row] = await db
    .select()
    .from(feedbackRequests)
    .where(eq(feedbackRequests.reference, reference))
    .limit(1);
  return row;
}

export async function listMyFeedback(reporterUserId: string, limit = 50) {
  return db
    .select()
    .from(feedbackRequests)
    .where(eq(feedbackRequests.reporterUserId, reporterUserId))
    .orderBy(desc(feedbackRequests.updatedAt))
    .limit(limit);
}

export async function listAdminFeedback(filters: {
  q?: string;
  type?: string;
  status?: string | string[];
  organizationId?: string;
  assignedToUserId?: string | null;
  from?: Date;
  to?: Date;
  openOnly?: boolean;
  limit?: number;
  offset?: number;
}) {
  const conditions = [];
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim()}%`;
    conditions.push(
      or(
        ilike(feedbackRequests.reference, q),
        ilike(feedbackRequests.subject, q),
        ilike(feedbackRequests.description, q),
        ilike(feedbackRequests.reporterNameSnapshot, q),
        ilike(feedbackRequests.reporterEmailSnapshot, q),
        ilike(feedbackRequests.organizationNameSnapshot, q),
      ),
    );
  }
  if (filters.type && filters.type !== "all") {
    conditions.push(eq(feedbackRequests.type, filters.type));
  }
  if (Array.isArray(filters.status) && filters.status.length) {
    conditions.push(inArray(feedbackRequests.status, filters.status));
  } else if (typeof filters.status === "string" && filters.status !== "all") {
    conditions.push(eq(feedbackRequests.status, filters.status));
  } else if (filters.openOnly) {
    conditions.push(inArray(feedbackRequests.status, [...FEEDBACK_OPEN_STATUSES]));
  }
  if (filters.organizationId && filters.organizationId !== "all") {
    conditions.push(eq(feedbackRequests.organizationId, filters.organizationId));
  }
  if (filters.assignedToUserId === null) {
    conditions.push(sql`${feedbackRequests.assignedToUserId} IS NULL`);
  } else if (filters.assignedToUserId) {
    conditions.push(eq(feedbackRequests.assignedToUserId, filters.assignedToUserId));
  }
  if (filters.from) conditions.push(gte(feedbackRequests.createdAt, filters.from));
  if (filters.to) conditions.push(lte(feedbackRequests.createdAt, filters.to));

  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db
    .select()
    .from(feedbackRequests)
    .where(where)
    .orderBy(desc(feedbackRequests.createdAt))
    .limit(filters.limit ?? 100)
    .offset(filters.offset ?? 0);

  const [{ value: total } = { value: 0 }] = await db
    .select({ value: count() })
    .from(feedbackRequests)
    .where(where);

  return { rows, total: Number(total) || 0 };
}

export async function getInboxCounters() {
  const rows = await db.select({ status: feedbackRequests.status, n: count() }).from(feedbackRequests).groupBy(feedbackRequests.status);
  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = Number(r.n) || 0;

  const [{ value: featureTotal } = { value: 0 }] = await db
    .select({ value: count() })
    .from(feedbackRequests)
    .where(eq(feedbackRequests.type, "feature_request"));

  return {
    new: byStatus.new || 0,
    inReview: byStatus.in_review || 0,
    waitingOnUser: byStatus.waiting_on_user || 0,
    resolvedClosed: (byStatus.resolved || 0) + (byStatus.closed || 0),
    featureRequests: Number(featureTotal) || 0,
    planned: byStatus.planned || 0,
  };
}

export async function updateFeedbackRequest(
  id: string,
  updates: Partial<{
    type: string;
    status: string;
    assignedToUserId: string | null;
    subject: string;
  }>,
  actorUserId?: string | null,
): Promise<FeedbackRequest | undefined> {
  const existing = await getFeedbackById(id);
  if (!existing) return undefined;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.type != null && updates.type !== existing.type) {
    patch.type = updates.type;
    await writeAudit({
      feedbackRequestId: id,
      actorUserId,
      eventType: "type_changed",
      beforeValue: existing.type,
      afterValue: updates.type,
    });
  }
  if (updates.status != null && updates.status !== existing.status) {
    patch.status = updates.status;
    if (updates.status === "resolved") patch.resolvedAt = new Date();
    if (updates.status === "closed") patch.closedAt = new Date();
    await writeAudit({
      feedbackRequestId: id,
      actorUserId,
      eventType: "status_changed",
      beforeValue: existing.status,
      afterValue: updates.status,
    });
  }
  if (updates.assignedToUserId !== undefined && updates.assignedToUserId !== existing.assignedToUserId) {
    patch.assignedToUserId = updates.assignedToUserId;
    await writeAudit({
      feedbackRequestId: id,
      actorUserId,
      eventType: "assigned",
      beforeValue: existing.assignedToUserId,
      afterValue: updates.assignedToUserId,
    });
  }
  if (updates.subject != null) patch.subject = updates.subject.slice(0, 150);

  const [row] = await db
    .update(feedbackRequests)
    .set(patch as any)
    .where(eq(feedbackRequests.id, id))
    .returning();
  return row;
}

export async function addMessage(input: {
  feedbackRequestId: string;
  authorUserId: string;
  authorNameSnapshot?: string | null;
  body: string;
  visibility: "public" | "internal";
}): Promise<FeedbackMessage> {
  const [msg] = await db
    .insert(feedbackMessages)
    .values({
      feedbackRequestId: input.feedbackRequestId,
      authorUserId: input.authorUserId,
      authorNameSnapshot: input.authorNameSnapshot ?? null,
      body: input.body,
      visibility: input.visibility,
    })
    .returning();

  await db
    .update(feedbackRequests)
    .set({ updatedAt: new Date() })
    .where(eq(feedbackRequests.id, input.feedbackRequestId));

  await writeAudit({
    feedbackRequestId: input.feedbackRequestId,
    actorUserId: input.authorUserId,
    eventType: input.visibility === "internal" ? "internal_note" : "reply_sent",
    afterValue: input.body.slice(0, 200),
  });

  return msg!;
}

export async function listMessages(feedbackRequestId: string, opts?: { includeInternal?: boolean }) {
  const rows = await db
    .select()
    .from(feedbackMessages)
    .where(eq(feedbackMessages.feedbackRequestId, feedbackRequestId))
    .orderBy(asc(feedbackMessages.createdAt));
  if (opts?.includeInternal) return rows;
  return rows.filter((m) => m.visibility === "public");
}

export async function createAttachment(input: {
  feedbackRequestId: string;
  messageId?: string | null;
  uploadedByUserId: string;
  originalFilename?: string | null;
  mimeType: string;
  fileSizeBytes: number;
  storageKey: string;
}): Promise<FeedbackAttachment> {
  const [row] = await db
    .insert(feedbackAttachments)
    .values({
      feedbackRequestId: input.feedbackRequestId,
      messageId: input.messageId ?? null,
      uploadedByUserId: input.uploadedByUserId,
      originalFilename: input.originalFilename ?? null,
      mimeType: input.mimeType,
      fileSizeBytes: input.fileSizeBytes,
      storageKey: input.storageKey,
    })
    .returning();
  return row!;
}

export async function listAttachments(feedbackRequestId: string) {
  return db
    .select()
    .from(feedbackAttachments)
    .where(eq(feedbackAttachments.feedbackRequestId, feedbackRequestId))
    .orderBy(asc(feedbackAttachments.createdAt));
}

export async function getAttachment(id: string) {
  const [row] = await db
    .select()
    .from(feedbackAttachments)
    .where(eq(feedbackAttachments.id, id))
    .limit(1);
  return row;
}

export async function listAudit(feedbackRequestId: string) {
  return db
    .select()
    .from(feedbackAuditEvents)
    .where(eq(feedbackAuditEvents.feedbackRequestId, feedbackRequestId))
    .orderBy(desc(feedbackAuditEvents.createdAt));
}

export async function listActiveFeatureAdmins(): Promise<FeatureAdminMember[]> {
  return db
    .select()
    .from(featureAdminMembers)
    .where(
      and(
        eq(featureAdminMembers.membershipStatus, "active"),
        sql`${featureAdminMembers.removedAt} IS NULL`,
      ),
    )
    .orderBy(asc(featureAdminMembers.email));
}

export async function listFeatureAdminMembers(includeRemoved = false) {
  if (includeRemoved) {
    return db.select().from(featureAdminMembers).orderBy(asc(featureAdminMembers.email));
  }
  return db
    .select()
    .from(featureAdminMembers)
    .where(sql`${featureAdminMembers.removedAt} IS NULL`)
    .orderBy(asc(featureAdminMembers.email));
}

export async function findFeatureAdminByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const [row] = await db
    .select()
    .from(featureAdminMembers)
    .where(eq(featureAdminMembers.email, normalized))
    .limit(1);
  return row;
}

export async function isActiveFeatureAdmin(email: string): Promise<boolean> {
  const row = await findFeatureAdminByEmail(email);
  return Boolean(row && row.membershipStatus === "active" && !row.removedAt);
}

export async function canManageFeatureAdminTeam(email: string): Promise<boolean> {
  const row = await findFeatureAdminByEmail(email);
  return Boolean(row && row.membershipStatus === "active" && !row.removedAt && row.canManageTeam);
}

export async function addFeatureAdminMember(input: {
  email: string;
  userId?: string | null;
  canManageTeam?: boolean;
  invitedByUserId?: string | null;
  activate?: boolean;
}) {
  const email = input.email.trim().toLowerCase();
  const existing = await findFeatureAdminByEmail(email);
  if (existing && !existing.removedAt && existing.membershipStatus === "active") {
    return existing;
  }
  if (existing) {
    const [row] = await db
      .update(featureAdminMembers)
      .set({
        membershipStatus: input.activate ? "active" : "pending",
        removedAt: null,
        userId: input.userId ?? existing.userId,
        canManageTeam: input.canManageTeam ?? existing.canManageTeam,
        activatedAt: input.activate ? new Date() : existing.activatedAt,
        invitedByUserId: input.invitedByUserId ?? existing.invitedByUserId,
      })
      .where(eq(featureAdminMembers.id, existing.id))
      .returning();
    return row!;
  }
  const [row] = await db
    .insert(featureAdminMembers)
    .values({
      email,
      userId: input.userId ?? null,
      membershipStatus: input.activate ? "active" : "pending",
      canManageTeam: Boolean(input.canManageTeam),
      invitedByUserId: input.invitedByUserId ?? null,
      activatedAt: input.activate ? new Date() : null,
    })
    .returning();
  return row!;
}

export async function removeFeatureAdminMember(memberId: string) {
  const managers = await db
    .select()
    .from(featureAdminMembers)
    .where(
      and(
        eq(featureAdminMembers.membershipStatus, "active"),
        eq(featureAdminMembers.canManageTeam, true),
        sql`${featureAdminMembers.removedAt} IS NULL`,
      ),
    );
  const target = managers.find((m) => m.id === memberId) ||
    (await db.select().from(featureAdminMembers).where(eq(featureAdminMembers.id, memberId)).limit(1))[0];

  if (target?.canManageTeam && managers.length <= 1 && managers[0]?.id === memberId) {
    throw Object.assign(new Error("Cannot remove the last team manager"), { status: 400 });
  }

  const [row] = await db
    .update(featureAdminMembers)
    .set({
      membershipStatus: "removed",
      removedAt: new Date(),
    })
    .where(eq(featureAdminMembers.id, memberId))
    .returning();
  return row;
}

export async function getFeatureRequestReport(filters?: { from?: Date; to?: Date; organizationId?: string }) {
  const conditions = [eq(feedbackRequests.type, "feature_request")];
  if (filters?.from) conditions.push(gte(feedbackRequests.createdAt, filters.from));
  if (filters?.to) conditions.push(lte(feedbackRequests.createdAt, filters.to));
  if (filters?.organizationId && filters.organizationId !== "all") {
    conditions.push(eq(feedbackRequests.organizationId, filters.organizationId));
  }
  const where = and(...conditions);
  const rows = await db
    .select()
    .from(feedbackRequests)
    .where(where)
    .orderBy(desc(feedbackRequests.createdAt))
    .limit(500);

  const byStatus: Record<string, number> = {};
  const byOrg: Record<string, number> = {};
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  let newThisMonth = 0;
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    const org = r.organizationNameSnapshot || r.organizationId || "Unknown";
    byOrg[org] = (byOrg[org] || 0) + 1;
    if (r.createdAt && new Date(r.createdAt) >= monthStart) newThisMonth += 1;
  }

  return {
    total: rows.length,
    newThisMonth,
    byStatus,
    byOrganization: byOrg,
    rows,
  };
}

/** Ensure reference counter row exists (safe for fresh DBs before SQL migration). */
export async function ensureFeedbackCounter() {
  const [row] = await db.select().from(feedbackReferenceCounter).limit(1);
  if (!row) {
    await db.insert(feedbackReferenceCounter).values({ id: 1, nextValue: 1 });
  }
}
