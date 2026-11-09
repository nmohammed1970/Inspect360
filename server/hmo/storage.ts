import { and, desc, eq, sql, count, isNull, or, inArray } from "drizzle-orm";
import { db } from "../db";
import { storage as appStorage } from "../storage";
import {
  hmoAssessments,
  hmoCaseFindings,
  hmoCases,
  hmoEvidenceRequests,
  hmoEvidenceReviews,
  hmoFindings,
  hmoJobs,
  hmoLicenceConditions,
  hmoLicenceVersions,
  hmoLicences,
  hmoOccupancySnapshots,
  hmoOrgSettings,
  hmoPropertyProfiles,
  hmoRegulatorySources,
  hmoRoomProfiles,
  hmoRuleImpactRuns,
  hmoRuleVersions,
  hmoTasks,
  type HmoAssessment,
  type HmoCase,
  type HmoFinding,
  type HmoJob,
  type HmoLicence,
  type HmoLicenceVersion,
  type HmoPropertyProfile,
  type HmoTask,
} from "@shared/schema";
import { findingFingerprint, type HmoFindingDraft, type HmoLicenceExtraction } from "@shared/hmo";
import { writeHmoAuditEvent } from "./auditWriter";

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function ensurePropertyProfile(
  organizationId: string,
  propertyId: string,
  userId?: string | null,
): Promise<HmoPropertyProfile> {
  const existing = await db
    .select()
    .from(hmoPropertyProfiles)
    .where(
      and(
        eq(hmoPropertyProfiles.organizationId, organizationId),
        eq(hmoPropertyProfiles.propertyId, propertyId),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];

  const [created] = await db
    .insert(hmoPropertyProfiles)
    .values({
      organizationId,
      propertyId,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    })
    .returning();
  return created!;
}

export async function getOrCreateOrgSettings(organizationId: string, userId?: string | null) {
  const existing = await db
    .select()
    .from(hmoOrgSettings)
    .where(eq(hmoOrgSettings.organizationId, organizationId))
    .limit(1);
  if (existing[0]) return existing[0];
  const [created] = await db
    .insert(hmoOrgSettings)
    .values({
      organizationId,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    })
    .returning();
  return created!;
}

export async function findLicenceVersionByHash(organizationId: string, contentHash: string) {
  if (!contentHash) return undefined;
  const [row] = await db
    .select()
    .from(hmoLicenceVersions)
    .where(
      and(
        eq(hmoLicenceVersions.organizationId, organizationId),
        eq(hmoLicenceVersions.contentHash, contentHash),
      ),
    )
    .limit(1);
  return row;
}

export async function createLicenceWithVersion(input: {
  organizationId: string;
  propertyId: string;
  userId?: string | null;
  objectUrl?: string | null;
  fileName?: string | null;
  contentHash?: string | null;
  documentId?: string | null;
  extraction?: HmoLicenceExtraction | null;
  pageCount?: number | null;
}): Promise<{ licence: HmoLicence; version: HmoLicenceVersion }> {
  await ensurePropertyProfile(input.organizationId, input.propertyId, input.userId);

  const extraction = input.extraction || null;
  const [licence] = await db
    .insert(hmoLicences)
    .values({
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      licenceNumber: extraction?.licence_number?.value ?? null,
      authorityName: extraction?.issuing_authority?.value ?? null,
      holderName: extraction?.holder_name?.value ?? null,
      managerName: extraction?.manager_name?.value ?? null,
      issueDate: parseDate(extraction?.issue_date?.value ?? null),
      expiryDate: parseDate(extraction?.expiry_date?.value ?? null),
      maxPersons:
        typeof extraction?.maximum_individuals?.value === "number"
          ? extraction.maximum_individuals.value
          : null,
      lifecycleStatus: "DRAFT",
      createdBy: input.userId ?? null,
      updatedBy: input.userId ?? null,
    })
    .returning();

  const [version] = await db
    .insert(hmoLicenceVersions)
    .values({
      organizationId: input.organizationId,
      licenceId: licence!.id,
      originalDocumentId: input.documentId ?? null,
      originalObjectUrl: input.objectUrl ?? null,
      fileName: input.fileName ?? null,
      contentHash: input.contentHash || null,
      versionNo: 1,
      extractedJson: extraction as any,
      pageCount: input.pageCount ?? null,
      status: "DRAFT",
      createdBy: input.userId ?? null,
      updatedBy: input.userId ?? null,
    })
    .returning();

  await db
    .update(hmoLicences)
    .set({ currentVersionId: version!.id, updatedAt: new Date() })
    .where(eq(hmoLicences.id, licence!.id));

  if (extraction?.conditions?.length) {
    await db.insert(hmoLicenceConditions).values(
      extraction.conditions.map((c, i) => ({
        organizationId: input.organizationId,
        licenceVersionId: version!.id,
        conditionNo: i + 1,
        rawText: c.condition_text,
        sourcePages: c.source_pages ?? null,
        validity: "PENDING_REVIEW",
        createdBy: input.userId ?? null,
        updatedBy: input.userId ?? null,
      })),
    );
  }

  await writeHmoAuditEvent({
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.userId ?? null,
    entityType: "hmo_licence_version",
    entityId: version!.id,
    action: "licence.uploaded",
    metadata: {
      propertyId: input.propertyId,
      licenceId: licence!.id,
      fileName: input.fileName,
    },
  });

  return { licence: { ...licence!, currentVersionId: version!.id }, version: version! };
}

export async function confirmLicenceVersion(input: {
  organizationId: string;
  versionId: string;
  userId: string;
  extraction?: HmoLicenceExtraction | null;
}) {
  const [version] = await db
    .select()
    .from(hmoLicenceVersions)
    .where(
      and(
        eq(hmoLicenceVersions.id, input.versionId),
        eq(hmoLicenceVersions.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!version) return null;

  const extraction =
    input.extraction ||
    ((version.extractedJson as HmoLicenceExtraction | null) ?? null);

  const [updated] = await db
    .update(hmoLicenceVersions)
    .set({
      status: "CONFIRMED",
      reviewerId: input.userId,
      reviewAt: new Date(),
      confirmedAt: new Date(),
      extractedJson: extraction as any,
      updatedAt: new Date(),
      updatedBy: input.userId,
    })
    .where(eq(hmoLicenceVersions.id, version.id))
    .returning();

  await db
    .update(hmoLicences)
    .set({
      licenceNumber: extraction?.licence_number?.value ?? undefined,
      authorityName: extraction?.issuing_authority?.value ?? undefined,
      holderName: extraction?.holder_name?.value ?? undefined,
      managerName: extraction?.manager_name?.value ?? undefined,
      issueDate: parseDate(extraction?.issue_date?.value ?? null) ?? undefined,
      expiryDate: parseDate(extraction?.expiry_date?.value ?? null) ?? undefined,
      maxPersons:
        typeof extraction?.maximum_individuals?.value === "number"
          ? extraction.maximum_individuals.value
          : undefined,
      lifecycleStatus: "UNDER_REVIEW",
      updatedAt: new Date(),
      updatedBy: input.userId,
    })
    .where(eq(hmoLicences.id, version.licenceId));

  await writeHmoAuditEvent({
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.userId,
    entityType: "hmo_licence_version",
    entityId: version.id,
    action: "licence.confirmed",
  });

  return updated;
}

export async function getOverview(organizationId: string, propertyId: string) {
  const profile = await ensurePropertyProfile(organizationId, propertyId);
  const licences = await listLicences(organizationId, propertyId);
  const cases = await db
    .select()
    .from(hmoCases)
    .where(
      and(
        eq(hmoCases.organizationId, organizationId),
        eq(hmoCases.propertyId, propertyId),
      ),
    )
    .orderBy(desc(hmoCases.createdAt))
    .limit(10);
  const findings = await listFindings(organizationId, propertyId);
  const property = await appStorage.getProperty(propertyId);
  return {
    profile,
    property: property
      ? {
          id: property.id,
          name: property.name,
          address: property.address,
          organizationId: property.organizationId,
        }
      : null,
    licences,
    activeCases: cases.filter((c) => c.status !== "VERIFIED_CLOSED" && c.status !== "CANCELLED_AS_DUPLICATE"),
    recentFindings: findings.slice(0, 50),
  };
}

export async function listLicences(organizationId: string, propertyId: string) {
  const licences = await db
    .select()
    .from(hmoLicences)
    .where(
      and(
        eq(hmoLicences.organizationId, organizationId),
        eq(hmoLicences.propertyId, propertyId),
      ),
    )
    .orderBy(desc(hmoLicences.createdAt));

  const result = [];
  for (const licence of licences) {
    const versions = await db
      .select()
      .from(hmoLicenceVersions)
      .where(
        and(
          eq(hmoLicenceVersions.organizationId, organizationId),
          eq(hmoLicenceVersions.licenceId, licence.id),
        ),
      )
      .orderBy(desc(hmoLicenceVersions.versionNo));
    result.push({ ...licence, versions });
  }
  return result;
}

export async function getJob(organizationId: string, jobId: string): Promise<HmoJob | undefined> {
  const [job] = await db
    .select()
    .from(hmoJobs)
    .where(and(eq(hmoJobs.id, jobId), eq(hmoJobs.organizationId, organizationId)))
    .limit(1);
  return job;
}

export async function createJob(input: {
  organizationId: string;
  propertyId?: string | null;
  jobType: string;
  userId?: string | null;
  licenceVersionId?: string | null;
  assessmentId?: string | null;
  idempotencyKey?: string | null;
  status?: string;
  progress?: number;
  resultJson?: Record<string, unknown> | null;
}): Promise<HmoJob> {
  if (input.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(hmoJobs)
      .where(
        and(
          eq(hmoJobs.organizationId, input.organizationId),
          eq(hmoJobs.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);
    if (existing) return existing;
  }

  const [job] = await db
    .insert(hmoJobs)
    .values({
      organizationId: input.organizationId,
      propertyId: input.propertyId ?? null,
      jobType: input.jobType,
      status: input.status ?? "QUEUED",
      progress: input.progress ?? 0,
      licenceVersionId: input.licenceVersionId ?? null,
      assessmentId: input.assessmentId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      resultJson: input.resultJson ?? null,
      createdBy: input.userId ?? null,
    })
    .returning();
  return job!;
}

export async function updateJob(
  organizationId: string,
  jobId: string,
  updates: Partial<{
    status: string;
    progress: number;
    errorMessage: string | null;
    resultJson: Record<string, unknown> | null;
    assessmentId: string | null;
    licenceVersionId: string | null;
  }>,
): Promise<HmoJob | undefined> {
  const [job] = await db
    .update(hmoJobs)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(hmoJobs.id, jobId), eq(hmoJobs.organizationId, organizationId)))
    .returning();
  return job;
}

export async function createAssessmentWithFindings(input: {
  organizationId: string;
  propertyId: string;
  licenceVersionId?: string | null;
  userId?: string | null;
  runReason?: string | null;
  overallStatus: string;
  evidenceCompleteness: number;
  findings: HmoFindingDraft[];
  snapshotHash?: string | null;
}): Promise<{ assessment: HmoAssessment; findings: HmoFinding[] }> {
  const [assessment] = await db
    .insert(hmoAssessments)
    .values({
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      licenceVersionId: input.licenceVersionId ?? null,
      snapshotHash: input.snapshotHash ?? null,
      runReason: input.runReason ?? null,
      status: "COMPLETED",
      overallStatus: input.overallStatus,
      evidenceCompleteness: input.evidenceCompleteness,
      completedAt: new Date(),
      createdBy: input.userId ?? null,
    })
    .returning();

  const findingRows: HmoFinding[] = [];
  for (const f of input.findings) {
    const [row] = await db
      .insert(hmoFindings)
      .values({
        organizationId: input.organizationId,
        assessmentId: assessment!.id,
        propertyId: input.propertyId,
        checkId: f.check_id,
        subjectRef: f.subject_id,
        ruleVersionId: f.rule_version_id,
        status: f.status,
        severity: f.severity,
        actualJson: { value: f.actual_value },
        requiredJson: { value: f.required_value },
        explanation: f.reason,
        fingerprint: findingFingerprint(
          input.propertyId,
          f.check_id,
          f.rule_version_id,
          f.subject_id,
        ),
        confidence: f.confidence,
        humanReviewRequired: f.human_review_required,
        suggestedActionCode: f.suggested_action_code,
      })
      .returning();
    findingRows.push(row!);
  }

  await db
    .update(hmoPropertyProfiles)
    .set({
      overallStatus: input.overallStatus,
      evidenceCompleteness: input.evidenceCompleteness,
      lastAssessmentId: assessment!.id,
      lastAssessedAt: new Date(),
      profileStatus: input.overallStatus,
      updatedAt: new Date(),
      updatedBy: input.userId ?? null,
    })
    .where(
      and(
        eq(hmoPropertyProfiles.organizationId, input.organizationId),
        eq(hmoPropertyProfiles.propertyId, input.propertyId),
      ),
    );

  await writeHmoAuditEvent({
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.userId ?? null,
    entityType: "hmo_assessment",
    entityId: assessment!.id,
    action: "assessment.completed",
    metadata: {
      propertyId: input.propertyId,
      overallStatus: input.overallStatus,
      findingCount: findingRows.length,
    },
  });

  return { assessment: assessment!, findings: findingRows };
}

export async function listFindings(
  organizationId: string,
  propertyId: string,
  filters?: { assessmentId?: string; status?: string; severity?: string },
) {
  const conditions = [
    eq(hmoFindings.organizationId, organizationId),
    eq(hmoFindings.propertyId, propertyId),
  ];
  if (filters?.assessmentId) conditions.push(eq(hmoFindings.assessmentId, filters.assessmentId));
  if (filters?.status) conditions.push(eq(hmoFindings.status, filters.status));
  if (filters?.severity) conditions.push(eq(hmoFindings.severity, filters.severity));

  return db
    .select()
    .from(hmoFindings)
    .where(and(...conditions))
    .orderBy(desc(hmoFindings.createdAt));
}

export async function listCases(
  organizationId: string,
  filters?: { propertyId?: string; status?: string },
) {
  const conditions = [eq(hmoCases.organizationId, organizationId)];
  if (filters?.propertyId) conditions.push(eq(hmoCases.propertyId, filters.propertyId));
  if (filters?.status) conditions.push(eq(hmoCases.status, filters.status));
  return db
    .select()
    .from(hmoCases)
    .where(and(...conditions))
    .orderBy(desc(hmoCases.createdAt));
}

const SEED_TASKS: Array<{
  code: string;
  title: string;
  assignedRole: string;
  daysDue: number;
  priority: string;
}> = [
  {
    code: "HMO-001",
    title: "Verify current licence, replacement or application with dated council evidence",
    assignedRole: "compliance",
    daysDue: 0,
    priority: "CRITICAL",
  },
  {
    code: "HMO-002",
    title: "Obtain full licence conditions, annexes, schedules and variations",
    assignedRole: "clerk",
    daysDue: 1,
    priority: "HIGH",
  },
  {
    code: "HMO-003",
    title: "Verify CRM property / UPRN / current holder and management",
    assignedRole: "clerk",
    daysDue: 1,
    priority: "HIGH",
  },
  {
    code: "HMO-004",
    title: "Verify occupants, households, room allocation, tenancy effective dates",
    assignedRole: "clerk",
    daysDue: 1,
    priority: "HIGH",
  },
  {
    code: "HMO-005",
    title: "Measure sleeping rooms and validate use against applicable conditions",
    assignedRole: "compliance",
    daysDue: 4,
    priority: "HIGH",
  },
  {
    code: "HMO-006",
    title: "Review relevant safety records, defects and outstanding remedial evidence",
    assignedRole: "compliance",
    daysDue: 4,
    priority: "MEDIUM",
  },
  {
    code: "HMO-007",
    title: "Verify local enforceable requirements and property alteration/planning evidence",
    assignedRole: "compliance",
    daysDue: 5,
    priority: "MEDIUM",
  },
  {
    code: "HMO-008",
    title: "Reassess findings; formally approve remediation plan / outstanding-risk treatment",
    assignedRole: "compliance",
    daysDue: 6,
    priority: "HIGH",
  },
];

export async function createCaseWithTasks(input: {
  organizationId: string;
  propertyId: string;
  userId?: string | null;
  severity: string;
  assessmentId?: string | null;
  findingIds?: string[];
  seedParkViewTasks?: boolean;
  caseReference?: string;
}): Promise<{ case: HmoCase; tasks: HmoTask[] }> {
  const ref =
    input.caseReference ||
    `HMO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + 6);

  const [caseRow] = await db
    .insert(hmoCases)
    .values({
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      caseReference: ref,
      severity: input.severity,
      status: "OPEN",
      createdFromAssessmentId: input.assessmentId ?? null,
      dueAt,
      createdBy: input.userId ?? null,
      updatedBy: input.userId ?? null,
    })
    .returning();

  if (input.findingIds?.length) {
    await db.insert(hmoCaseFindings).values(
      input.findingIds.map((findingId) => ({
        organizationId: input.organizationId,
        caseId: caseRow!.id,
        findingId,
      })),
    );
  }

  const tasks: HmoTask[] = [];
  if (input.seedParkViewTasks !== false) {
    const now = new Date();
    for (const seed of SEED_TASKS) {
      const taskDue = new Date(now);
      taskDue.setDate(taskDue.getDate() + seed.daysDue);
      const idempotencyKey = `${caseRow!.id}:${seed.code}`;
      const [task] = await db
        .insert(hmoTasks)
        .values({
          organizationId: input.organizationId,
          caseId: caseRow!.id,
          propertyId: input.propertyId,
          taskCode: seed.code,
          assignedRole: seed.assignedRole,
          title: seed.title,
          description: seed.title,
          status: "OPEN",
          dueAt: taskDue,
          priority: seed.priority,
          idempotencyKey,
          createdBy: input.userId ?? null,
          updatedBy: input.userId ?? null,
        })
        .returning();
      tasks.push(task!);
    }
  }

  await writeHmoAuditEvent({
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.userId ?? null,
    entityType: "hmo_case",
    entityId: caseRow!.id,
    action: "case.opened",
    metadata: { propertyId: input.propertyId, taskCount: tasks.length },
  });

  return { case: caseRow!, tasks };
}

export async function getCase(organizationId: string, caseId: string) {
  const [caseRow] = await db
    .select()
    .from(hmoCases)
    .where(and(eq(hmoCases.id, caseId), eq(hmoCases.organizationId, organizationId)))
    .limit(1);
  if (!caseRow) return null;

  const tasks = await listTasks(organizationId, caseId);
  const linkedFindings = await db
    .select({
      link: hmoCaseFindings,
      finding: hmoFindings,
    })
    .from(hmoCaseFindings)
    .leftJoin(hmoFindings, eq(hmoCaseFindings.findingId, hmoFindings.id))
    .where(
      and(
        eq(hmoCaseFindings.caseId, caseId),
        eq(hmoCaseFindings.organizationId, organizationId),
      ),
    );

  const property = await appStorage.getProperty(caseRow.propertyId);
  const evidenceReviews = await listEvidenceReviewsForCase(organizationId, caseId, tasks.map((t) => t.id));
  return {
    case: caseRow,
    tasks,
    findings: linkedFindings.map((r) => r.finding).filter(Boolean),
    evidenceReviews,
    property: property
      ? { id: property.id, name: property.name, address: property.address }
      : null,
  };
}

export async function listEvidenceReviewsForCase(
  organizationId: string,
  _caseId: string,
  taskIds: string[],
) {
  if (taskIds.length === 0) return [];
  return db
    .select()
    .from(hmoEvidenceReviews)
    .where(
      and(
        eq(hmoEvidenceReviews.organizationId, organizationId),
        inArray(hmoEvidenceReviews.taskId, taskIds),
      ),
    )
    .orderBy(desc(hmoEvidenceReviews.createdAt));
}

export async function getEvidenceReview(organizationId: string, reviewId: string) {
  const [row] = await db
    .select()
    .from(hmoEvidenceReviews)
    .where(
      and(
        eq(hmoEvidenceReviews.id, reviewId),
        eq(hmoEvidenceReviews.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function decideEvidenceReview(input: {
  organizationId: string;
  reviewId: string;
  reviewerUserId: string;
  decision: "ACCEPTED" | "REJECTED";
  rejectionReason?: string | null;
}) {
  const existing = await getEvidenceReview(input.organizationId, input.reviewId);
  if (!existing) return null;

  const [row] = await db
    .update(hmoEvidenceReviews)
    .set({
      reviewerUserId: input.reviewerUserId,
      decision: input.decision,
      decisionAt: new Date(),
      rejectionReason: input.rejectionReason ?? null,
    })
    .where(
      and(
        eq(hmoEvidenceReviews.id, input.reviewId),
        eq(hmoEvidenceReviews.organizationId, input.organizationId),
      ),
    )
    .returning();

  const nextStatus = input.decision === "ACCEPTED" ? "VERIFIED_CLOSED" : "REOPENED";
  await db
    .update(hmoTasks)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(hmoTasks.id, existing.taskId));

  await writeHmoAuditEvent({
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.reviewerUserId,
    entityType: "hmo_evidence_review",
    entityId: input.reviewId,
    action: "evidence.reviewed",
    metadata: { taskId: existing.taskId, decision: input.decision },
  });

  return row!;
}

export async function assignCase(input: {
  organizationId: string;
  caseId: string;
  ownerUserId: string;
  actorUserId: string;
}) {
  const [updated] = await db
    .update(hmoCases)
    .set({
      ownerUserId: input.ownerUserId,
      status: "TRIAGED",
      updatedAt: new Date(),
      updatedBy: input.actorUserId,
    })
    .where(
      and(eq(hmoCases.id, input.caseId), eq(hmoCases.organizationId, input.organizationId)),
    )
    .returning();
  if (!updated) return null;

  await writeHmoAuditEvent({
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.actorUserId,
    entityType: "hmo_case",
    entityId: input.caseId,
    action: "case.assigned",
    metadata: { ownerUserId: input.ownerUserId },
  });
  return updated;
}

export async function signoffCase(input: {
  organizationId: string;
  caseId: string;
  approverId: string;
  closureReason?: string | null;
}) {
  const [updated] = await db
    .update(hmoCases)
    .set({
      status: "VERIFIED_CLOSED",
      approverId: input.approverId,
      approvedAt: new Date(),
      closureReason: input.closureReason ?? null,
      updatedAt: new Date(),
      updatedBy: input.approverId,
    })
    .where(
      and(eq(hmoCases.id, input.caseId), eq(hmoCases.organizationId, input.organizationId)),
    )
    .returning();
  if (!updated) return null;

  await writeHmoAuditEvent({
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.approverId,
    entityType: "hmo_case",
    entityId: input.caseId,
    action: "case.closed",
    metadata: { closureReason: input.closureReason },
  });
  return updated;
}

export async function createEvidenceRequest(input: {
  organizationId: string;
  taskId: string;
  userId?: string | null;
  recipientEmail?: string | null;
  recipientContactId?: string | null;
  requestTemplate?: string | null;
  secureTokenHash: string;
  expiryAt: Date;
}) {
  const [row] = await db
    .insert(hmoEvidenceRequests)
    .values({
      organizationId: input.organizationId,
      taskId: input.taskId,
      recipientEmail: input.recipientEmail ?? null,
      recipientContactId: input.recipientContactId ?? null,
      requestTemplate: input.requestTemplate ?? null,
      secureTokenHash: input.secureTokenHash,
      expiryAt: input.expiryAt,
      sentAt: new Date(),
      status: "REQUESTED",
      createdBy: input.userId ?? null,
    })
    .returning();

  const [task] = await db
    .select()
    .from(hmoTasks)
    .where(
      and(eq(hmoTasks.id, input.taskId), eq(hmoTasks.organizationId, input.organizationId)),
    )
    .limit(1);

  await db
    .update(hmoTasks)
    .set({ status: "EVIDENCE_REQUESTED", updatedAt: new Date() })
    .where(eq(hmoTasks.id, input.taskId));

  // Creating an evidence request is the real triage signal — no separate Assign owner step.
  if (task?.caseId) {
    const [caseRow] = await db
      .select()
      .from(hmoCases)
      .where(
        and(
          eq(hmoCases.id, task.caseId),
          eq(hmoCases.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (caseRow && caseRow.status !== "VERIFIED_CLOSED" && caseRow.status !== "CANCELLED_AS_DUPLICATE") {
      await db
        .update(hmoCases)
        .set({
          status: "AWAITING_EVIDENCE",
          ownerUserId: caseRow.ownerUserId || input.userId || null,
          updatedAt: new Date(),
          updatedBy: input.userId ?? caseRow.updatedBy,
        })
        .where(eq(hmoCases.id, caseRow.id));
    }
  }

  await writeHmoAuditEvent({
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.userId ?? null,
    entityType: "hmo_evidence_request",
    entityId: row!.id,
    action: "evidence.requested",
    metadata: { taskId: input.taskId, caseId: task?.caseId ?? null },
  });

  return row!;
}

export async function getEvidenceRequestByTokenHash(tokenHash: string) {
  const [row] = await db
    .select()
    .from(hmoEvidenceRequests)
    .where(eq(hmoEvidenceRequests.secureTokenHash, tokenHash))
    .limit(1);
  return row;
}

export async function createEvidenceReview(input: {
  organizationId: string;
  taskId: string;
  reviewerUserId?: string | null;
  evidenceObjectUrl?: string | null;
  evidenceId?: string | null;
  decision?: string | null;
  rejectionReason?: string | null;
  aiResult?: Record<string, unknown> | null;
}) {
  const [row] = await db
    .insert(hmoEvidenceReviews)
    .values({
      organizationId: input.organizationId,
      taskId: input.taskId,
      evidenceId: input.evidenceId ?? null,
      evidenceObjectUrl: input.evidenceObjectUrl ?? null,
      aiResult: input.aiResult ?? null,
      reviewerUserId: input.reviewerUserId ?? null,
      decision: input.decision ?? null,
      decisionAt: input.decision ? new Date() : null,
      rejectionReason: input.rejectionReason ?? null,
    })
    .returning();

  const nextStatus =
    input.decision === "ACCEPTED"
      ? "VERIFIED_CLOSED"
      : input.decision === "REJECTED"
        ? "REOPENED"
        : "AWAITING_VERIFICATION";

  await db
    .update(hmoTasks)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(hmoTasks.id, input.taskId));

  // Mark any open evidence requests for this task as received when a file lands.
  if (!input.decision) {
    await db
      .update(hmoEvidenceRequests)
      .set({ status: "RECEIVED" })
      .where(
        and(
          eq(hmoEvidenceRequests.taskId, input.taskId),
          eq(hmoEvidenceRequests.organizationId, input.organizationId),
        ),
      );
  }

  const [task] = await db
    .select()
    .from(hmoTasks)
    .where(
      and(eq(hmoTasks.id, input.taskId), eq(hmoTasks.organizationId, input.organizationId)),
    )
    .limit(1);
  if (task?.caseId) {
    const caseStatus = !input.decision
      ? "AWAITING_REVIEW"
      : input.decision === "REJECTED"
        ? "REOPENED"
        : null;
    if (caseStatus) {
      await db
        .update(hmoCases)
        .set({
          status: caseStatus,
          updatedAt: new Date(),
          updatedBy: input.reviewerUserId ?? undefined,
        })
        .where(
          and(
            eq(hmoCases.id, task.caseId),
            eq(hmoCases.organizationId, input.organizationId),
          ),
        );
    }
  }

  await writeHmoAuditEvent({
    organizationId: input.organizationId,
    actorType: input.reviewerUserId ? "user" : "system",
    actorId: input.reviewerUserId ?? null,
    entityType: "hmo_evidence_review",
    entityId: row!.id,
    action: input.decision ? "evidence.reviewed" : "evidence.received",
    metadata: { taskId: input.taskId, decision: input.decision },
  });

  return row!;
}

export async function listTasks(organizationId: string, caseId?: string) {
  const conditions = [eq(hmoTasks.organizationId, organizationId)];
  if (caseId) conditions.push(eq(hmoTasks.caseId, caseId));
  return db
    .select()
    .from(hmoTasks)
    .where(and(...conditions))
    .orderBy(hmoTasks.dueAt);
}

export async function listDashboardMetrics(organizationId: string) {
  const profiles = await db
    .select()
    .from(hmoPropertyProfiles)
    .where(eq(hmoPropertyProfiles.organizationId, organizationId));

  const cases = await listCases(organizationId);
  const openCases = cases.filter(
    (c) => c.status !== "VERIFIED_CLOSED" && c.status !== "CANCELLED_AS_DUPLICATE",
  );

  const byStatus: Record<string, number> = {};
  for (const p of profiles) {
    const key = p.overallStatus || "NOT_ASSESSED";
    byStatus[key] = (byStatus[key] || 0) + 1;
  }

  const critical = profiles.filter((p) => p.overallStatus === "CRITICAL_EXCEPTION").length;
  const actionRequired = profiles.filter((p) => p.overallStatus === "ACTION_REQUIRED").length;
  const reviewRequired = profiles.filter((p) => p.overallStatus === "REVIEW_REQUIRED").length;
  const compliant = profiles.filter((p) => p.overallStatus === "VERIFIED_COMPLIANT").length;

  const [{ value: taskOpenCount } = { value: 0 }] = await db
    .select({ value: count() })
    .from(hmoTasks)
    .where(
      and(
        eq(hmoTasks.organizationId, organizationId),
        sql`${hmoTasks.status} NOT IN ('VERIFIED_CLOSED', 'CANCELLED')`,
      ),
    );

  return {
    asOf: new Date().toISOString(),
    propertyCount: profiles.length,
    byStatus,
    critical,
    actionRequired,
    reviewRequired,
    compliant,
    openCaseCount: openCases.length,
    openTaskCount: Number(taskOpenCount) || 0,
    cases: openCases.slice(0, 50),
    profiles: profiles.slice(0, 100),
  };
}

export async function getLicenceVersion(organizationId: string, versionId: string) {
  const [version] = await db
    .select()
    .from(hmoLicenceVersions)
    .where(
      and(
        eq(hmoLicenceVersions.id, versionId),
        eq(hmoLicenceVersions.organizationId, organizationId),
      ),
    )
    .limit(1);
  return version;
}

export async function getLicence(organizationId: string, licenceId: string) {
  const [licence] = await db
    .select()
    .from(hmoLicences)
    .where(
      and(eq(hmoLicences.id, licenceId), eq(hmoLicences.organizationId, organizationId)),
    )
    .limit(1);
  return licence;
}

export async function getTask(organizationId: string, taskId: string) {
  const [task] = await db
    .select()
    .from(hmoTasks)
    .where(and(eq(hmoTasks.id, taskId), eq(hmoTasks.organizationId, organizationId)))
    .limit(1);
  return task;
}

export { SEED_TASKS };


export async function createOccupancySnapshot(input: {
  organizationId: string;
  propertyId: string;
  sourceSystem?: string;
  personCount: number | null;
  householdCount?: number | null;
  verifiedBy?: string | null;
  createdBy?: string | null;
  confidence?: number | null;
  asOf?: Date;
}) {
  const [row] = await db
    .insert(hmoOccupancySnapshots)
    .values({
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      asOf: input.asOf || new Date(),
      sourceSystem: input.sourceSystem || "tenant_assignments",
      personCount: input.personCount,
      householdCount: input.householdCount ?? null,
      verifiedBy: input.verifiedBy ?? null,
      createdBy: input.createdBy ?? null,
      confidence: input.confidence ?? null,
      version: 1,
    })
    .returning();
  return row;
}

export async function listOccupancySnapshots(organizationId: string, propertyId: string) {
  return db
    .select()
    .from(hmoOccupancySnapshots)
    .where(
      and(
        eq(hmoOccupancySnapshots.organizationId, organizationId),
        eq(hmoOccupancySnapshots.propertyId, propertyId),
      ),
    )
    .orderBy(desc(hmoOccupancySnapshots.asOf));
}

export async function upsertRoomProfile(input: {
  organizationId: string;
  propertyId: string;
  existingRoomId?: string | null;
  roomType?: string | null;
  measuredUsableAreaM2?: number | null;
  ceilingHeightM?: number | null;
  declaredPermittedOccupancy?: number | null;
  userId?: string | null;
  id?: string | null;
}) {
  if (input.id) {
    const [row] = await db
      .update(hmoRoomProfiles)
      .set({
        roomType: input.roomType ?? undefined,
        measuredUsableAreaM2: input.measuredUsableAreaM2 ?? undefined,
        ceilingHeightM: input.ceilingHeightM ?? undefined,
        declaredPermittedOccupancy: input.declaredPermittedOccupancy ?? undefined,
        measuredAt: new Date(),
        updatedAt: new Date(),
        updatedBy: input.userId ?? null,
      })
      .where(
        and(
          eq(hmoRoomProfiles.id, input.id),
          eq(hmoRoomProfiles.organizationId, input.organizationId),
        ),
      )
      .returning();
    return row;
  }
  const [row] = await db
    .insert(hmoRoomProfiles)
    .values({
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      existingRoomId: input.existingRoomId ?? null,
      roomType: input.roomType ?? null,
      measuredUsableAreaM2: input.measuredUsableAreaM2 ?? null,
      ceilingHeightM: input.ceilingHeightM ?? null,
      declaredPermittedOccupancy: input.declaredPermittedOccupancy ?? null,
      measuredAt: new Date(),
      createdBy: input.userId ?? null,
      updatedBy: input.userId ?? null,
    })
    .returning();
  return row;
}

export async function listRoomProfiles(organizationId: string, propertyId: string) {
  return db
    .select()
    .from(hmoRoomProfiles)
    .where(
      and(
        eq(hmoRoomProfiles.organizationId, organizationId),
        eq(hmoRoomProfiles.propertyId, propertyId),
      ),
    );
}

export async function listRuleVersions(organizationId: string | null) {
  if (organizationId) {
    return db
      .select()
      .from(hmoRuleVersions)
      .where(
        or(
          isNull(hmoRuleVersions.organizationId),
          eq(hmoRuleVersions.organizationId, organizationId),
        ),
      )
      .orderBy(desc(hmoRuleVersions.createdAt));
  }
  return db.select().from(hmoRuleVersions).orderBy(desc(hmoRuleVersions.createdAt));
}

export async function insertRuleVersion(input: {
  organizationId?: string | null;
  ruleCode: string;
  authorityId?: string | null;
  jurisdiction?: string;
  classification?: string | null;
  requirementsJson: Record<string, unknown>;
  status?: string;
  sourceId?: string | null;
  effectiveFrom?: Date | null;
}) {
  const [row] = await db
    .insert(hmoRuleVersions)
    .values({
      organizationId: input.organizationId ?? null,
      ruleCode: input.ruleCode,
      authorityId: input.authorityId ?? null,
      jurisdiction: input.jurisdiction || "England",
      classification: input.classification ?? null,
      requirementsJson: input.requirementsJson,
      status: input.status || "DRAFT",
      sourceId: input.sourceId ?? null,
      effectiveFrom: input.effectiveFrom ?? null,
    })
    .returning();
  return row;
}

export async function approveRuleVersion(input: {
  organizationId: string;
  ruleVersionId: string;
  approverId: string;
}) {
  const [row] = await db
    .update(hmoRuleVersions)
    .set({
      status: "APPROVED",
      approvedBy: input.approverId,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(hmoRuleVersions.id, input.ruleVersionId))
    .returning();
  await writeHmoAuditEvent({
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.approverId,
    action: "hmo.rule.approve",
    entityType: "hmo_rule_version",
    entityId: input.ruleVersionId,
  });
  return row;
}

export async function createRuleImpactRun(input: {
  organizationId: string;
  ruleVersionId: string;
  propertyIds: string[];
  createdBy: string;
}) {
  const [row] = await db
    .insert(hmoRuleImpactRuns)
    .values({
      organizationId: input.organizationId,
      ruleVersionId: input.ruleVersionId,
      status: "QUEUED",
      impactedPropertyCount: input.propertyIds.length,
      completedCount: 0,
      startedAt: new Date(),
      summaryJson: { propertyIds: input.propertyIds, selective: true },
      createdBy: input.createdBy,
    })
    .returning();
  return row;
}

export async function listRegulatorySources(organizationId?: string | null) {
  if (organizationId) {
    return db
      .select()
      .from(hmoRegulatorySources)
      .where(
        or(
          isNull(hmoRegulatorySources.organizationId),
          eq(hmoRegulatorySources.organizationId, organizationId),
        ),
      );
  }
  return db.select().from(hmoRegulatorySources);
}

export async function upsertRegulatorySource(input: {
  organizationId?: string | null;
  authorityName: string;
  sourceUrl?: string | null;
  sourceType?: string | null;
  contentHash?: string | null;
  status?: string;
}) {
  const [row] = await db
    .insert(hmoRegulatorySources)
    .values({
      organizationId: input.organizationId ?? null,
      authorityName: input.authorityName,
      sourceUrl: input.sourceUrl ?? null,
      sourceType: input.sourceType ?? null,
      contentHash: input.contentHash ?? null,
      checkedAt: new Date(),
      status: input.status || "ACTIVE",
    })
    .returning();
  return row;
}
