import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  lt,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  communicationActions,
  communicationApprovals,
  communicationCaseLinks,
  communicationCases,
  communicationMessages,
  properties,
  users,
  PUBLIC_CASE_STATUS_LABELS,
  type CommunicationCase,
  type CommunicationMessage,
} from "@shared/schema";
import { db } from "../db";
import { writeCommunicationAudit } from "./audit";
import {
  categoryPolicySnapshot,
  getCategoryById,
  getCategoryByKey,
  seedCommunicationCategories,
} from "./categories";
import { allocateCommunicationReference } from "./reference";
import { computeSlaDeadlines, isOverdue, recordSlaEvent } from "./sla";
import {
  notifyApprovalRequested,
  notifyCaseAssigned,
  notifyTenantCaseUpdate,
  notifyTenantReply,
} from "./notifications";
import { generateTriageSuggestion } from "./ai";

const OPEN_STATUSES = [
  "new",
  "triaged",
  "assigned",
  "in_progress",
  "awaiting_tenant",
  "awaiting_approval",
  "awaiting_third_party",
];

export async function ensureCommunicationsReady(organizationId: string) {
  await seedCommunicationCategories(organizationId);
}

export type CreateCaseInput = {
  organizationId: string;
  subject: string;
  body?: string;
  categoryKey?: string;
  categoryId?: string;
  priority?: string;
  source?: string;
  tenantId?: string | null;
  tenancyId?: string | null;
  propertyId?: string | null;
  blockId?: string | null;
  unitLabel?: string | null;
  ownerUserId?: string | null;
  ownerTeamId?: string | null;
  createdByUserId?: string | null;
  actorType?: "user" | "tenant" | "system";
  attachments?: Array<Record<string, unknown>>;
  channel?: string;
  runAiSuggest?: boolean;
};

export async function createCase(input: CreateCaseInput) {
  await ensureCommunicationsReady(input.organizationId);

  let category =
    (input.categoryId
      ? await getCategoryById(input.organizationId, input.categoryId)
      : null) ||
    (input.categoryKey
      ? await getCategoryByKey(input.organizationId, input.categoryKey)
      : null) ||
    (await getCategoryByKey(input.organizationId, "general"));

  if (!category) {
    throw Object.assign(new Error("No communication categories configured"), { status: 500 });
  }

  let aiSuggestion = null as Awaited<ReturnType<typeof generateTriageSuggestion>> | null;
  if (input.runAiSuggest !== false && input.body) {
    aiSuggestion = await generateTriageSuggestion({
      subject: input.subject,
      body: input.body,
      shortcut: input.categoryKey,
    });
    if (aiSuggestion.categoryKey && !input.categoryId && !input.categoryKey) {
      const suggested = await getCategoryByKey(
        input.organizationId,
        aiSuggestion.categoryKey,
      );
      if (suggested) category = suggested;
    }
  }

  const priority =
    input.priority ||
    aiSuggestion?.priority ||
    category.defaultPriority ||
    "medium";

  const { firstResponseDueAt, resolutionDueAt } = computeSlaDeadlines(category);
  const reference = await allocateCommunicationReference(input.organizationId);
  const policySnapshot = categoryPolicySnapshot(category);

  const [caseRow] = await db
    .insert(communicationCases)
    .values({
      organizationId: input.organizationId,
      reference,
      subject: input.subject.trim().slice(0, 300),
      categoryId: category.id,
      status: "new",
      priority,
      source: input.source || "tenant_portal",
      tenantId: input.tenantId ?? null,
      tenancyId: input.tenancyId ?? null,
      propertyId: input.propertyId ?? null,
      blockId: input.blockId ?? null,
      unitLabel: input.unitLabel ?? null,
      ownerUserId: input.ownerUserId ?? null,
      ownerTeamId: input.ownerTeamId ?? category.defaultTeamId ?? null,
      summary: aiSuggestion?.summary || input.body?.slice(0, 500) || null,
      firstResponseDueAt,
      resolutionDueAt,
      policySnapshotJson: policySnapshot,
      aiSuggestionJson: aiSuggestion,
      unreadForStaff: true,
      unreadForTenant: false,
      createdByUserId: input.createdByUserId ?? null,
      version: 1,
    })
    .returning();

  await recordSlaEvent({
    organizationId: input.organizationId,
    caseId: caseRow.id,
    timerType: "first_response",
    deadline: firstResponseDueAt,
  });
  await recordSlaEvent({
    organizationId: input.organizationId,
    caseId: caseRow.id,
    timerType: "resolution",
    deadline: resolutionDueAt,
  });

  if (input.body?.trim()) {
    await db.insert(communicationMessages).values({
      organizationId: input.organizationId,
      caseId: caseRow.id,
      direction: "inbound",
      visibility: "tenant",
      channel: input.channel || input.source || "tenant_portal",
      body: input.body.trim(),
      authorUserId: input.createdByUserId ?? null,
      attachmentsJson: input.attachments ?? null,
      receivedAt: new Date(),
      deliveryStatus: "not_applicable",
    });
  }

  if (
    category.approvalPolicy === "required" &&
    ["rent_payments", "tenancy", "property_alterations"].includes(category.key)
  ) {
    // Soft flag — actual approval row created when operator requests decision.
  }

  await writeCommunicationAudit({
    organizationId: input.organizationId,
    caseId: caseRow.id,
    eventType: "case_created",
    after: { reference, status: "new", categoryId: category.id, priority },
    actor: {
      actorType: input.actorType || "user",
      actorId: input.createdByUserId,
    },
  });

  return { case: caseRow, category, aiSuggestion };
}

export async function getCaseById(organizationId: string, caseId: string) {
  const [row] = await db
    .select()
    .from(communicationCases)
    .where(
      and(
        eq(communicationCases.organizationId, organizationId),
        eq(communicationCases.id, caseId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getCaseDetail(organizationId: string, caseId: string) {
  const caseRow = await getCaseById(organizationId, caseId);
  if (!caseRow) return null;

  const [category, messages, actions, approvals, links] = await Promise.all([
    getCategoryById(organizationId, caseRow.categoryId),
    db
      .select()
      .from(communicationMessages)
      .where(eq(communicationMessages.caseId, caseId))
      .orderBy(asc(communicationMessages.createdAt)),
    db
      .select()
      .from(communicationActions)
      .where(eq(communicationActions.caseId, caseId))
      .orderBy(asc(communicationActions.sortOrder)),
    db
      .select()
      .from(communicationApprovals)
      .where(eq(communicationApprovals.caseId, caseId))
      .orderBy(desc(communicationApprovals.createdAt)),
    db
      .select()
      .from(communicationCaseLinks)
      .where(eq(communicationCaseLinks.caseId, caseId)),
  ]);

  return { case: caseRow, category, messages, actions, approvals, links };
}

export type ListCasesFilters = {
  organizationId: string;
  view?: string;
  status?: string | string[];
  priority?: string;
  categoryId?: string;
  ownerUserId?: string;
  unassigned?: boolean;
  propertyId?: string;
  tenantId?: string;
  tenancyId?: string;
  q?: string;
  cursor?: string;
  limit?: number;
  includeClosed?: boolean;
  overdueOnly?: boolean;
  awaitingApproval?: boolean;
};

export async function listCases(filters: ListCasesFilters) {
  const limit = Math.min(Math.max(filters.limit || 50, 1), 100);
  const conditions: SQL[] = [
    eq(communicationCases.organizationId, filters.organizationId),
  ];

  const view = filters.view || "all";
  if (view === "my_cases" && filters.ownerUserId) {
    conditions.push(eq(communicationCases.ownerUserId, filters.ownerUserId));
  } else if (view === "unassigned") {
    conditions.push(sql`${communicationCases.ownerUserId} IS NULL`);
  } else if (view === "urgent") {
    conditions.push(eq(communicationCases.priority, "urgent"));
  } else if (view === "overdue") {
    conditions.push(
      sql`(
        (${communicationCases.firstResponseAt} IS NULL AND ${communicationCases.firstResponseDueAt} < NOW())
        OR (${communicationCases.resolvedAt} IS NULL AND ${communicationCases.resolutionDueAt} < NOW())
      )`,
    );
    conditions.push(inArray(communicationCases.status, OPEN_STATUSES));
  } else if (view === "awaiting_approval") {
    conditions.push(eq(communicationCases.status, "awaiting_approval"));
  } else if (view === "awaiting_tenant") {
    conditions.push(eq(communicationCases.status, "awaiting_tenant"));
  } else if (view === "closed") {
    conditions.push(
      inArray(communicationCases.status, ["resolved", "closed", "cancelled", "duplicate"]),
    );
  } else if (!filters.includeClosed && !filters.status) {
    conditions.push(inArray(communicationCases.status, OPEN_STATUSES));
  }

  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    conditions.push(inArray(communicationCases.status, statuses));
  }
  if (filters.priority) conditions.push(eq(communicationCases.priority, filters.priority));
  if (filters.categoryId) conditions.push(eq(communicationCases.categoryId, filters.categoryId));
  if (filters.propertyId) conditions.push(eq(communicationCases.propertyId, filters.propertyId));
  if (filters.tenantId) conditions.push(eq(communicationCases.tenantId, filters.tenantId));
  if (filters.tenancyId) conditions.push(eq(communicationCases.tenancyId, filters.tenancyId));
  if (filters.unassigned) conditions.push(sql`${communicationCases.ownerUserId} IS NULL`);
  if (filters.awaitingApproval) {
    conditions.push(eq(communicationCases.status, "awaiting_approval"));
  }
  if (filters.overdueOnly) {
    conditions.push(
      sql`(
        (${communicationCases.firstResponseAt} IS NULL AND ${communicationCases.firstResponseDueAt} < NOW())
        OR (${communicationCases.resolvedAt} IS NULL AND ${communicationCases.resolutionDueAt} < NOW())
      )`,
    );
  }
  if (filters.q?.trim()) {
    const q = `%${filters.q.trim()}%`;
    // Spec §3: search reference, subject, authorised message text, property/tenant names
    conditions.push(
      or(
        ilike(communicationCases.reference, q),
        ilike(communicationCases.subject, q),
        ilike(communicationCases.summary, q),
        ilike(properties.name, q),
        ilike(properties.address, q),
        sql`exists (
          select 1 from communication_messages m
          where m.case_id = ${communicationCases.id}
            and m.visibility = 'tenant'
            and m.body ilike ${q}
        )`,
        sql`exists (
          select 1 from users tu
          where tu.id = ${communicationCases.tenantId}
            and (
              coalesce(tu.first_name,'') || ' ' || coalesce(tu.last_name,'') ilike ${q}
              or tu.email ilike ${q}
            )
        )`,
      )!,
    );
  }
  if (filters.cursor) {
    conditions.push(lt(communicationCases.updatedAt, new Date(filters.cursor)));
  }

  const rows = await db
    .select({
      case: communicationCases,
      propertyName: properties.name,
      propertyAddress: properties.address,
      ownerName: users.firstName,
      ownerLastName: users.lastName,
    })
    .from(communicationCases)
    .leftJoin(properties, eq(communicationCases.propertyId, properties.id))
    .leftJoin(users, eq(communicationCases.ownerUserId, users.id))
    .where(and(...conditions))
    .orderBy(desc(communicationCases.updatedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && page.length
      ? page[page.length - 1].case.updatedAt?.toISOString() ?? null
      : null;

  return {
    items: page.map((r) => ({
      ...r.case,
      propertyName: r.propertyName,
      propertyAddress: r.propertyAddress,
      ownerDisplayName:
        [r.ownerName, r.ownerLastName].filter(Boolean).join(" ") || null,
      isOverdue:
        (OPEN_STATUSES.includes(r.case.status) &&
          ((r.case.firstResponseAt == null && isOverdue(r.case.firstResponseDueAt)) ||
            (r.case.resolvedAt == null && isOverdue(r.case.resolutionDueAt)))) ||
        false,
    })),
    nextCursor,
  };
}

export async function patchCase(params: {
  organizationId: string;
  caseId: string;
  version: number;
  actorUserId: string;
  patch: Partial<{
    subject: string;
    status: string;
    priority: string;
    categoryId: string;
    ownerUserId: string | null;
    ownerTeamId: string | null;
    summary: string | null;
    nextActionAt: Date | null;
    propertyId: string | null;
    tenantId: string | null;
    tenancyId: string | null;
    blockId: string | null;
    unitLabel: string | null;
    unreadForStaff: boolean;
    unreadForTenant: boolean;
    aiSuggestionJson: Record<string, unknown> | null;
  }>;
  reason?: string;
}) {
  const current = await getCaseById(params.organizationId, params.caseId);
  if (!current) return null;
  if (current.version !== params.version) {
    throw Object.assign(new Error("Version conflict — refresh and retry"), { status: 409 });
  }

  const [updated] = await db
    .update(communicationCases)
    .set({
      ...params.patch,
      version: current.version + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(communicationCases.id, params.caseId),
        eq(communicationCases.organizationId, params.organizationId),
        eq(communicationCases.version, params.version),
      ),
    )
    .returning();

  if (!updated) {
    throw Object.assign(new Error("Version conflict — refresh and retry"), { status: 409 });
  }

  await writeCommunicationAudit({
    organizationId: params.organizationId,
    caseId: params.caseId,
    eventType: "case_updated",
    before: {
      status: current.status,
      priority: current.priority,
      ownerUserId: current.ownerUserId,
      version: current.version,
    },
    after: {
      status: updated.status,
      priority: updated.priority,
      ownerUserId: updated.ownerUserId,
      version: updated.version,
    },
    reason: params.reason,
    actor: { actorType: "user", actorId: params.actorUserId },
  });

  return updated;
}

export async function assignCase(params: {
  organizationId: string;
  caseId: string;
  version: number;
  actorUserId: string;
  ownerUserId: string | null;
  ownerTeamId?: string | null;
}) {
  const updated = await patchCase({
    organizationId: params.organizationId,
    caseId: params.caseId,
    version: params.version,
    actorUserId: params.actorUserId,
    patch: {
      ownerUserId: params.ownerUserId,
      ownerTeamId: params.ownerTeamId ?? undefined,
      status: params.ownerUserId ? "assigned" : "new",
    },
    reason: "assign",
  });
  if (updated?.ownerUserId) {
    await notifyCaseAssigned({
      organizationId: params.organizationId,
      caseId: updated.id,
      reference: updated.reference,
      assigneeUserId: updated.ownerUserId,
    });
  }
  return updated;
}

export async function addMessage(params: {
  organizationId: string;
  caseId: string;
  body: string;
  visibility: "tenant" | "internal";
  direction?: "inbound" | "outbound";
  channel?: string;
  authorUserId?: string | null;
  authorNameSnapshot?: string | null;
  attachments?: Array<Record<string, unknown>>;
  deliveryStatus?: string;
  providerMessageId?: string | null;
  actorType?: "user" | "tenant" | "system";
}) {
  const caseRow = await getCaseById(params.organizationId, params.caseId);
  if (!caseRow) return null;

  const [message] = await db
    .insert(communicationMessages)
    .values({
      organizationId: params.organizationId,
      caseId: params.caseId,
      direction: params.direction || (params.visibility === "internal" ? "outbound" : "outbound"),
      visibility: params.visibility,
      channel: params.channel || "app",
      body: params.body.trim(),
      authorUserId: params.authorUserId ?? null,
      authorNameSnapshot: params.authorNameSnapshot ?? null,
      attachmentsJson: params.attachments ?? null,
      deliveryStatus: params.deliveryStatus || "not_applicable",
      providerMessageId: params.providerMessageId ?? null,
      sentAt: new Date(),
    })
    .returning();

  const casePatch: Record<string, unknown> = {
    updatedAt: new Date(),
    version: caseRow.version + 1,
  };

  if (params.visibility === "tenant") {
    if (params.actorType === "tenant" || params.direction === "inbound") {
      casePatch.unreadForStaff = true;
      if (["resolved", "closed"].includes(caseRow.status)) {
        // Spec §6: incoming replies to closed cases alert owner; reopen is explicit.
        casePatch.unreadForStaff = true;
      } else if (caseRow.status === "awaiting_tenant") {
        casePatch.status = "in_progress";
      }
    } else {
      // Staff/operator tenant-visible reply — track first response; do not auto-force awaiting_tenant
      // (waiting states are set explicitly when the operator is waiting on the tenant).
      casePatch.unreadForTenant = true;
      if (!caseRow.firstResponseAt) {
        casePatch.firstResponseAt = new Date();
      }
    }
  }

  const [updatedCase] = await db
    .update(communicationCases)
    .set(casePatch as any)
    .where(eq(communicationCases.id, caseRow.id))
    .returning();

  await writeCommunicationAudit({
    organizationId: params.organizationId,
    caseId: params.caseId,
    eventType: params.visibility === "internal" ? "internal_note_added" : "message_added",
    after: {
      messageId: message.id,
      visibility: params.visibility,
      channel: params.channel,
    },
    actor: {
      actorType: params.actorType || "user",
      actorId: params.authorUserId,
    },
  });

  if (params.visibility === "tenant" && params.actorType === "tenant") {
    if (["resolved", "closed"].includes(caseRow.status)) {
      const { notifyCommunicationEvent, listOrgStaffUserIds } = await import(
        "./notifications"
      );
      const recipients = caseRow.ownerUserId
        ? [caseRow.ownerUserId]
        : await listOrgStaffUserIds(params.organizationId);
      await notifyCommunicationEvent({
        organizationId: params.organizationId,
        userIds: recipients,
        type: "communication_closed_reply",
        title: "Reply on closed case",
        message: `${caseRow.reference} received a tenant reply after closure — review or reopen.`,
        data: { caseId: caseRow.id, reference: caseRow.reference, needsReopenReview: true },
      });
    } else {
      await notifyTenantReply({
        organizationId: params.organizationId,
        caseId: caseRow.id,
        reference: caseRow.reference,
        ownerUserId: caseRow.ownerUserId,
      });
    }
  } else if (
    params.visibility === "tenant" &&
    params.actorType !== "tenant" &&
    caseRow.tenantId
  ) {
    await notifyTenantCaseUpdate({
      organizationId: params.organizationId,
      tenantUserId: caseRow.tenantId,
      caseId: caseRow.id,
      reference: caseRow.reference,
      kind: "reply",
    });
  }

  return { message, case: updatedCase };
}

/** Manual phone/email/WhatsApp log from operator. */
export async function logManualChannelMessage(params: {
  organizationId: string;
  caseId: string;
  channel: "phone" | "email" | "whatsapp";
  summary: string;
  authorUserId: string;
  direction?: "inbound" | "outbound";
}) {
  return addMessage({
    organizationId: params.organizationId,
    caseId: params.caseId,
    body: params.summary,
    visibility: "tenant",
    direction: params.direction || "outbound",
    channel: params.channel,
    authorUserId: params.authorUserId,
    actorType: "user",
    deliveryStatus: "not_applicable",
  });
}

export async function addAction(params: {
  organizationId: string;
  caseId: string;
  title: string;
  description?: string;
  assigneeId?: string | null;
  dueAt?: Date | null;
  required?: boolean;
  actorUserId: string;
}) {
  const [action] = await db
    .insert(communicationActions)
    .values({
      organizationId: params.organizationId,
      caseId: params.caseId,
      title: params.title,
      description: params.description ?? null,
      assigneeId: params.assigneeId ?? null,
      dueAt: params.dueAt ?? null,
      required: params.required ?? false,
      status: "open",
    })
    .returning();

  await writeCommunicationAudit({
    organizationId: params.organizationId,
    caseId: params.caseId,
    eventType: "action_added",
    after: { actionId: action.id, title: action.title },
    actor: { actorType: "user", actorId: params.actorUserId },
  });
  return action;
}

export async function patchAction(params: {
  organizationId: string;
  caseId: string;
  actionId: string;
  actorUserId: string;
  patch: Partial<{
    title: string;
    status: string;
    assigneeId: string | null;
    dueAt: Date | null;
    evidenceRef: string | null;
  }>;
}) {
  const updates: Record<string, unknown> = {
    ...params.patch,
    updatedAt: new Date(),
  };
  if (params.patch.status === "done" || params.patch.status === "completed") {
    updates.status = "completed";
    updates.completedAt = new Date();
    updates.completedBy = params.actorUserId;
  }

  const [row] = await db
    .update(communicationActions)
    .set(updates as any)
    .where(
      and(
        eq(communicationActions.id, params.actionId),
        eq(communicationActions.caseId, params.caseId),
        eq(communicationActions.organizationId, params.organizationId),
      ),
    )
    .returning();

  if (row) {
    await writeCommunicationAudit({
      organizationId: params.organizationId,
      caseId: params.caseId,
      eventType: "action_updated",
      after: { actionId: row.id, status: row.status },
      actor: { actorType: "user", actorId: params.actorUserId },
    });
  }
  return row ?? null;
}

export async function requestApproval(params: {
  organizationId: string;
  caseId: string;
  version: number;
  actorUserId: string;
  type?: string;
  eligibleTeamId?: string | null;
  eligibleUserId?: string | null;
  termsJson?: Record<string, unknown> | null;
}) {
  const caseRow = await getCaseById(params.organizationId, params.caseId);
  if (!caseRow) return null;

  const [approval] = await db
    .insert(communicationApprovals)
    .values({
      organizationId: params.organizationId,
      caseId: params.caseId,
      type: params.type || "manager_decision",
      requestedBy: params.actorUserId,
      eligibleTeamId: params.eligibleTeamId ?? null,
      eligibleUserId: params.eligibleUserId ?? null,
      termsJson: params.termsJson ?? null,
    })
    .returning();

  const updated = await patchCase({
    organizationId: params.organizationId,
    caseId: params.caseId,
    version: params.version,
    actorUserId: params.actorUserId,
    patch: { status: "awaiting_approval" },
    reason: "approval_requested",
  });

  await notifyApprovalRequested({
    organizationId: params.organizationId,
    caseId: params.caseId,
    reference: caseRow.reference,
    eligibleUserId: params.eligibleUserId,
  });

  return { approval, case: updated };
}

export async function decideApproval(params: {
  organizationId: string;
  approvalId: string;
  actorUserId: string;
  decision: "approved" | "rejected";
  reason?: string;
  caseVersion: number;
}) {
  const [approval] = await db
    .select()
    .from(communicationApprovals)
    .where(
      and(
        eq(communicationApprovals.id, params.approvalId),
        eq(communicationApprovals.organizationId, params.organizationId),
      ),
    )
    .limit(1);
  if (!approval) return null;
  if (approval.decidedBy && approval.decision) {
    throw Object.assign(new Error("Approval already decided"), { status: 409 });
  }
  // No self-approval when eligible user is set and differs — managers may decide for others.
  if (
    approval.eligibleUserId &&
    approval.eligibleUserId === params.actorUserId &&
    approval.requestedBy === params.actorUserId
  ) {
    throw Object.assign(new Error("Self-approval is not permitted for this request"), {
      status: 403,
    });
  }

  const [updatedApproval] = await db
    .update(communicationApprovals)
    .set({
      decision: params.decision,
      reason: params.reason ?? null,
      decidedBy: params.actorUserId,
      decidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(communicationApprovals.id, approval.id))
    .returning();

  const updatedCase = await patchCase({
    organizationId: params.organizationId,
    caseId: approval.caseId,
    version: params.caseVersion,
    actorUserId: params.actorUserId,
    patch: {
      status: params.decision === "approved" ? "in_progress" : "awaiting_approval",
    },
    reason: `approval_${params.decision}`,
  });

  await writeCommunicationAudit({
    organizationId: params.organizationId,
    caseId: approval.caseId,
    eventType: `approval_${params.decision}`,
    after: { approvalId: approval.id, decision: params.decision },
    reason: params.reason,
    actor: { actorType: "user", actorId: params.actorUserId },
  });

  return { approval: updatedApproval, case: updatedCase };
}

export async function linkEntity(params: {
  organizationId: string;
  caseId: string;
  entityType: string;
  entityId: string;
  relationship?: string;
  actorUserId: string;
}) {
  const relationship = params.relationship || "related";
  const [existing] = await db
    .select()
    .from(communicationCaseLinks)
    .where(
      and(
        eq(communicationCaseLinks.caseId, params.caseId),
        eq(communicationCaseLinks.entityType, params.entityType),
        eq(communicationCaseLinks.entityId, params.entityId),
        eq(communicationCaseLinks.relationship, relationship),
      ),
    )
    .limit(1);
  if (existing) return { link: existing, created: false };

  try {
    const [link] = await db
      .insert(communicationCaseLinks)
      .values({
        organizationId: params.organizationId,
        caseId: params.caseId,
        entityType: params.entityType,
        entityId: params.entityId,
        relationship,
      })
      .returning();

    await writeCommunicationAudit({
      organizationId: params.organizationId,
      caseId: params.caseId,
      eventType: "link_added",
      after: {
        entityType: params.entityType,
        entityId: params.entityId,
        relationship,
      },
      actor: { actorType: "user", actorId: params.actorUserId },
    });
    return { link, created: true };
  } catch (err: any) {
    if (String(err?.message || "").includes("unique") || err?.code === "23505") {
      const [again] = await db
        .select()
        .from(communicationCaseLinks)
        .where(
          and(
            eq(communicationCaseLinks.caseId, params.caseId),
            eq(communicationCaseLinks.entityType, params.entityType),
            eq(communicationCaseLinks.entityId, params.entityId),
          ),
        )
        .limit(1);
      if (again) return { link: again, created: false };
    }
    throw err;
  }
}

export async function listCasesLinkedToEntity(params: {
  organizationId: string;
  entityType: string;
  entityId: string;
}) {
  const links = await db
    .select({
      link: communicationCaseLinks,
      case: communicationCases,
    })
    .from(communicationCaseLinks)
    .innerJoin(
      communicationCases,
      eq(communicationCaseLinks.caseId, communicationCases.id),
    )
    .where(
      and(
        eq(communicationCaseLinks.organizationId, params.organizationId),
        eq(communicationCaseLinks.entityType, params.entityType),
        eq(communicationCaseLinks.entityId, params.entityId),
      ),
    )
    .orderBy(desc(communicationCases.updatedAt));

  return links.map((row) => ({
    id: row.case.id,
    reference: row.case.reference,
    subject: row.case.subject,
    status: row.case.status,
    priority: row.case.priority,
    relationship: row.link.relationship,
  }));
}

export async function findLinkByEntity(params: {
  organizationId: string;
  entityType: string;
  entityId: string;
  relationship?: string;
}) {
  const conditions = [
    eq(communicationCaseLinks.organizationId, params.organizationId),
    eq(communicationCaseLinks.entityType, params.entityType),
    eq(communicationCaseLinks.entityId, params.entityId),
  ];
  if (params.relationship) {
    conditions.push(eq(communicationCaseLinks.relationship, params.relationship));
  }
  const [row] = await db
    .select()
    .from(communicationCaseLinks)
    .where(and(...conditions))
    .limit(1);
  return row ?? null;
}

export async function resolveCase(params: {
  organizationId: string;
  caseId: string;
  version: number;
  actorUserId: string;
  resolutionSummary?: string;
  close?: boolean;
  /** Manager-only exception when bypassing incomplete required tasks (never safety policy). */
  managerExceptionReason?: string | null;
}) {
  const current = await getCaseById(params.organizationId, params.caseId);
  if (!current) return null;

  const summary = (params.resolutionSummary || current.resolutionSummary || "").trim();
  if (!summary) {
    throw Object.assign(new Error("Resolution summary is required"), { status: 400 });
  }

  const [category, openRequiredActions, pendingApprovals] = await Promise.all([
    getCategoryById(params.organizationId, current.categoryId),
    db
      .select()
      .from(communicationActions)
      .where(
        and(
          eq(communicationActions.caseId, params.caseId),
          eq(communicationActions.required, true),
          sql`${communicationActions.status} <> 'completed'`,
        ),
      ),
    db
      .select()
      .from(communicationApprovals)
      .where(
        and(
          eq(communicationApprovals.caseId, params.caseId),
          sql`${communicationApprovals.decision} IS NULL`,
        ),
      ),
  ]);

  const isSafety = category?.key === "health_safety";
  const approvalRequired = category?.approvalPolicy === "required";

  if (openRequiredActions.length > 0) {
    if (!params.managerExceptionReason || isSafety) {
      throw Object.assign(
        new Error(
          isSafety
            ? "Cannot close safety case while required tasks are incomplete"
            : "Complete required tasks before resolving, or provide a manager exception reason",
        ),
        { status: 400 },
      );
    }
  }

  if (pendingApprovals.length > 0) {
    throw Object.assign(
      new Error("Cannot resolve while approvals are pending"),
      { status: 400 },
    );
  }
  if (approvalRequired) {
    const decided = await db
      .select()
      .from(communicationApprovals)
      .where(eq(communicationApprovals.caseId, params.caseId));
    const approved = decided.some((a) => a.decision === "approved");
    if (!approved) {
      throw Object.assign(
        new Error("Required approval has not been granted for this category"),
        { status: 400 },
      );
    }
  }

  const now = new Date();
  const updated = await patchCase({
    organizationId: params.organizationId,
    caseId: params.caseId,
    version: params.version,
    actorUserId: params.actorUserId,
    patch: {
      status: params.close ? "closed" : "resolved",
    } as any,
    reason: params.managerExceptionReason
      ? `resolved_with_exception:${params.managerExceptionReason}`
      : params.close
        ? "closed"
        : "resolved",
  });

  if (!updated) return null;

  const [finalRow] = await db
    .update(communicationCases)
    .set({
      resolvedAt: now,
      closedAt: params.close ? now : updated.closedAt,
      resolutionSummary: summary,
      updatedAt: now,
    })
    .where(eq(communicationCases.id, updated.id))
    .returning();

  if (finalRow?.tenantId) {
    await notifyTenantCaseUpdate({
      organizationId: params.organizationId,
      tenantUserId: finalRow.tenantId,
      caseId: finalRow.id,
      reference: finalRow.reference,
      kind: "resolved",
    });
  }
  return finalRow;
}

/** Spec §6: duplicate/cancelled require reason; duplicate links canonical case. */
export async function markCaseTerminal(params: {
  organizationId: string;
  caseId: string;
  version: number;
  actorUserId: string;
  status: "cancelled" | "duplicate";
  reason: string;
  canonicalCaseId?: string | null;
}) {
  const reason = params.reason.trim();
  if (!reason) {
    throw Object.assign(new Error("Reason is required"), { status: 400 });
  }
  if (params.status === "duplicate" && !params.canonicalCaseId) {
    throw Object.assign(new Error("canonicalCaseId is required for duplicate"), {
      status: 400,
    });
  }

  const updated = await patchCase({
    organizationId: params.organizationId,
    caseId: params.caseId,
    version: params.version,
    actorUserId: params.actorUserId,
    patch: { status: params.status } as any,
    reason,
  });
  if (!updated) return null;

  if (params.status === "duplicate" && params.canonicalCaseId) {
    await linkEntity({
      organizationId: params.organizationId,
      caseId: params.caseId,
      entityType: "case",
      entityId: params.canonicalCaseId,
      relationship: "duplicate_of",
      actorUserId: params.actorUserId,
    });
  }

  const [finalRow] = await db
    .update(communicationCases)
    .set({
      closedAt: new Date(),
      resolutionSummary: reason,
      updatedAt: new Date(),
    })
    .where(eq(communicationCases.id, updated.id))
    .returning();

  return finalRow;
}

export async function reopenCase(params: {
  organizationId: string;
  caseId: string;
  version: number;
  actorUserId: string;
  reason: string;
}) {
  const current = await getCaseById(params.organizationId, params.caseId);
  if (!current) return null;

  const updated = await patchCase({
    organizationId: params.organizationId,
    caseId: params.caseId,
    version: params.version,
    actorUserId: params.actorUserId,
    patch: { status: "in_progress" },
    reason: params.reason,
  });
  if (!updated) return null;

  const [finalRow] = await db
    .update(communicationCases)
    .set({
      reopenReason: params.reason,
      // Preserve prior closure timestamps for audit; clear only active closedAt for workflow
      closedAt: null,
      resolvedAt: current.resolvedAt, // preserve prior resolution moment
      updatedAt: new Date(),
    })
    .where(eq(communicationCases.id, updated.id))
    .returning();

  await writeCommunicationAudit({
    organizationId: params.organizationId,
    caseId: params.caseId,
    eventType: "case_reopened",
    before: {
      status: current.status,
      resolvedAt: current.resolvedAt,
      closedAt: current.closedAt,
    },
    after: { status: "in_progress", reopenReason: params.reason },
    reason: params.reason,
    actor: { actorType: "user", actorId: params.actorUserId },
  });

  if (finalRow?.tenantId) {
    await notifyTenantCaseUpdate({
      organizationId: params.organizationId,
      tenantUserId: finalRow.tenantId,
      caseId: finalRow.id,
      reference: finalRow.reference,
      kind: "reopened",
    });
  }
  return finalRow;
}

export async function escalateCase(params: {
  organizationId: string;
  caseId: string;
  version: number;
  actorUserId: string;
  reason?: string;
  escalateToUserId?: string | null;
}) {
  const updated = await assignCase({
    organizationId: params.organizationId,
    caseId: params.caseId,
    version: params.version,
    actorUserId: params.actorUserId,
    ownerUserId: params.escalateToUserId ?? null,
  });

  await writeCommunicationAudit({
    organizationId: params.organizationId,
    caseId: params.caseId,
    eventType: "case_escalated",
    after: { escalateToUserId: params.escalateToUserId },
    reason: params.reason,
    actor: { actorType: "user", actorId: params.actorUserId },
  });

  if (updated) {
    await recordSlaEvent({
      organizationId: params.organizationId,
      caseId: params.caseId,
      timerType: "escalation",
      deadline: new Date(),
      escalationLevel: 1,
    });
  }
  return updated;
}

export async function inboxMetrics(organizationId: string, userId?: string) {
  const base = eq(communicationCases.organizationId, organizationId);
  const [totals] = await db
    .select({
      openCount: sql<number>`count(*) filter (where ${communicationCases.status} in ('new','triaged','assigned','in_progress','awaiting_tenant','awaiting_approval','awaiting_third_party'))`,
      unassigned: sql<number>`count(*) filter (where ${communicationCases.ownerUserId} is null and ${communicationCases.status} in ('new','triaged','assigned','in_progress','awaiting_tenant','awaiting_approval','awaiting_third_party'))`,
      urgent: sql<number>`count(*) filter (where ${communicationCases.priority} = 'urgent' and ${communicationCases.status} in ('new','triaged','assigned','in_progress','awaiting_tenant','awaiting_approval','awaiting_third_party'))`,
      overdue: sql<number>`count(*) filter (where ${communicationCases.status} in ('new','triaged','assigned','in_progress','awaiting_tenant','awaiting_approval','awaiting_third_party') and ((${communicationCases.firstResponseAt} is null and ${communicationCases.firstResponseDueAt} < now()) or (${communicationCases.resolvedAt} is null and ${communicationCases.resolutionDueAt} < now())))`,
      awaitingApproval: sql<number>`count(*) filter (where ${communicationCases.status} = 'awaiting_approval')`,
      awaitingTenant: sql<number>`count(*) filter (where ${communicationCases.status} = 'awaiting_tenant')`,
      myCases: userId
        ? sql<number>`count(*) filter (where ${communicationCases.ownerUserId} = ${userId} and ${communicationCases.status} in ('new','triaged','assigned','in_progress','awaiting_tenant','awaiting_approval','awaiting_third_party'))`
        : sql<number>`0`,
    })
    .from(communicationCases)
    .where(base);

  return {
    openCount: Number(totals?.openCount || 0),
    unassigned: Number(totals?.unassigned || 0),
    urgent: Number(totals?.urgent || 0),
    overdue: Number(totals?.overdue || 0),
    awaitingApproval: Number(totals?.awaitingApproval || 0),
    awaitingTenant: Number(totals?.awaitingTenant || 0),
    myCases: Number(totals?.myCases || 0),
  };
}

export async function activityForTenant(organizationId: string, tenantId: string) {
  const cases = await listCases({
    organizationId,
    tenantId,
    includeClosed: true,
    limit: 100,
  });
  return cases.items.map((c) => ({
    type: "case" as const,
    id: c.id,
    reference: c.reference,
    subject: c.subject,
    status: c.status,
    priority: c.priority,
    at: c.updatedAt,
  }));
}

export async function activityForProperty(organizationId: string, propertyId: string) {
  const cases = await listCases({
    organizationId,
    propertyId,
    includeClosed: true,
    limit: 100,
  });
  return cases.items.map((c) => ({
    type: "case" as const,
    id: c.id,
    reference: c.reference,
    subject: c.subject,
    status: c.status,
    priority: c.priority,
    at: c.updatedAt,
  }));
}

export function toPublicCase(
  caseRow: CommunicationCase,
  messages?: CommunicationMessage[],
) {
  return {
    id: caseRow.id,
    reference: caseRow.reference,
    subject: caseRow.subject,
    status: caseRow.status,
    publicStatus: PUBLIC_CASE_STATUS_LABELS[caseRow.status] || "Under review",
    priority: caseRow.priority,
    summary: caseRow.summary,
    propertyId: caseRow.propertyId,
    createdAt: caseRow.createdAt,
    updatedAt: caseRow.updatedAt,
    resolvedAt: caseRow.resolvedAt,
    unreadForTenant: caseRow.unreadForTenant,
    messages: (messages || [])
      .filter((m) => m.visibility === "tenant")
      .map((m) => ({
        id: m.id,
        body: m.body,
        direction: m.direction,
        channel: m.channel,
        createdAt: m.createdAt,
        authorNameSnapshot: m.authorNameSnapshot,
        attachmentsJson: m.attachmentsJson,
      })),
  };
}
