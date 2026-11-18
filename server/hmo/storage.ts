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
  inspectionTemplates,
  inspections,
  maintenanceRequests,
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

const DEFAULT_HMO_SLA = {
  renewalWindowsDays: [90, 60, 30, 7],
  renewalExpiredAlert: true,
};

export async function getOrCreateOrgSettings(organizationId: string, userId?: string | null) {
  const existing = await db
    .select()
    .from(hmoOrgSettings)
    .where(eq(hmoOrgSettings.organizationId, organizationId))
    .limit(1);
  if (existing[0]) {
    const sla = (existing[0].slaJson || {}) as Record<string, unknown>;
    if (!Array.isArray(sla.renewalWindowsDays)) {
      const [patched] = await db
        .update(hmoOrgSettings)
        .set({
          slaJson: { ...DEFAULT_HMO_SLA, ...sla },
          updatedAt: new Date(),
        })
        .where(eq(hmoOrgSettings.id, existing[0].id))
        .returning();
      return patched || existing[0];
    }
    return existing[0];
  }
  const [created] = await db
    .insert(hmoOrgSettings)
    .values({
      organizationId,
      slaJson: DEFAULT_HMO_SLA,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    })
    .returning();
  return created!;
}

/** Find an existing version with this content hash on a specific property (not org-wide). */
export async function findLicenceVersionByHash(
  organizationId: string,
  contentHash: string,
  propertyId?: string | null,
) {
  if (!contentHash) return undefined;
  const conditions = [
    eq(hmoLicenceVersions.organizationId, organizationId),
    eq(hmoLicenceVersions.contentHash, contentHash),
  ];
  if (propertyId) {
    conditions.push(eq(hmoLicences.propertyId, propertyId));
  }
  const [row] = await db
    .select({
      version: hmoLicenceVersions,
      propertyId: hmoLicences.propertyId,
      licenceId: hmoLicences.id,
    })
    .from(hmoLicenceVersions)
    .innerJoin(hmoLicences, eq(hmoLicenceVersions.licenceId, hmoLicences.id))
    .where(and(...conditions))
    .limit(1);
  if (!row) return undefined;
  return { ...row.version, propertyId: row.propertyId, licenceId: row.licenceId };
}

/** Refresh extraction on an existing immutable version (same file bytes / content hash). */
export async function refreshLicenceVersionExtraction(input: {
  organizationId: string;
  versionId: string;
  extraction: HmoLicenceExtraction;
  userId?: string | null;
  pageCount?: number | null;
  objectUrl?: string | null;
  fileName?: string | null;
}) {
  const [row] = await db
    .update(hmoLicenceVersions)
    .set({
      extractedJson: input.extraction as any,
      pageCount: input.pageCount ?? undefined,
      originalObjectUrl: input.objectUrl ?? undefined,
      fileName: input.fileName ?? undefined,
      status: "DRAFT",
      confirmedAt: null,
      confirmedBy: null,
      updatedAt: new Date(),
      updatedBy: input.userId ?? null,
    })
    .where(
      and(
        eq(hmoLicenceVersions.id, input.versionId),
        eq(hmoLicenceVersions.organizationId, input.organizationId),
      ),
    )
    .returning();
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

  const lifecycleFromExtraction =
    typeof extraction?.licence_status?.value === "string" &&
    extraction.licence_status.value.trim()
      ? extraction.licence_status.value.trim()
      : null;

  await db
    .update(hmoLicences)
    .set({
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
      lifecycleStatus: lifecycleFromExtraction || "UNDER_REVIEW",
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
    metadata: {
      fieldEdits: Boolean(input.extraction),
    },
  });

  return updated;
}

function extractionField(
  value: string | number | null,
  prev?: { value?: unknown; confidence?: number } | null,
) {
  return {
    ...(typeof prev === "object" && prev ? prev : {}),
    value,
    human_confirmed: true,
    last_updated: new Date().toISOString(),
  };
}

/** Overwrite summary fields shown on the property HMO header (not address). */
export async function upsertPropertySummary(input: {
  organizationId: string;
  propertyId: string;
  userId: string;
  borough?: string | null;
  lifecycleStatus?: string | null;
  expiryDate?: string | null;
  maxPersons?: number | null;
  occupantsNow?: number | null;
}) {
  await ensurePropertyProfile(input.organizationId, input.propertyId, input.userId);

  const licences = await listLicences(input.organizationId, input.propertyId);
  const primary = licences[0] || null;
  const currentVersion = primary?.versions?.find((v) => v.id === primary.currentVersionId)
    || primary?.versions?.[0]
    || null;
  const prevExtraction = (currentVersion?.extractedJson || {}) as Record<string, any>;

  const lifecycleStatus =
    typeof input.lifecycleStatus === "string" && input.lifecycleStatus.trim()
      ? input.lifecycleStatus.trim()
      : primary?.lifecycleStatus || "UNDER_REVIEW";
  const expiryDate =
    input.expiryDate === undefined
      ? (primary?.expiryDate ? String(primary.expiryDate).slice(0, 10) : null)
      : input.expiryDate;
  const maxPersons =
    input.maxPersons === undefined
      ? (typeof primary?.maxPersons === "number" ? primary.maxPersons : null)
      : input.maxPersons;
  const borough =
    input.borough === undefined
      ? (typeof prevExtraction.borough?.value === "string" ? prevExtraction.borough.value : null)
      : input.borough;

  const extraction: HmoLicenceExtraction = {
    document_id: prevExtraction.document_id || `manual_${Date.now()}`,
    document_type: prevExtraction.document_type || "HMO_LICENCE",
    extraction_version: prevExtraction.extraction_version || "manual_v1",
    property_address: prevExtraction.property_address || extractionField(null),
    licence_number: prevExtraction.licence_number || extractionField(primary?.licenceNumber ?? null),
    issuing_authority:
      prevExtraction.issuing_authority || extractionField(primary?.authorityName ?? null),
    issue_date: prevExtraction.issue_date || extractionField(null),
    expiry_date: extractionField(
      expiryDate,
      prevExtraction.expiry_date,
    ) as HmoLicenceExtraction["expiry_date"],
    licence_status: extractionField(
      lifecycleStatus,
      prevExtraction.licence_status,
    ) as HmoLicenceExtraction["licence_status"],
    maximum_individuals: extractionField(
      maxPersons,
      prevExtraction.maximum_individuals,
    ) as HmoLicenceExtraction["maximum_individuals"],
    holder_name: prevExtraction.holder_name || extractionField(primary?.holderName ?? null),
    manager_name: prevExtraction.manager_name || extractionField(primary?.managerName ?? null),
    borough: extractionField(borough, prevExtraction.borough) as HmoLicenceExtraction["borough"],
    start_date: prevExtraction.start_date,
    maximum_households: prevExtraction.maximum_households,
    conditions: Array.isArray(prevExtraction.conditions) ? prevExtraction.conditions : [],
    referenced_missing_attachments: Array.isArray(prevExtraction.referenced_missing_attachments)
      ? prevExtraction.referenced_missing_attachments
      : [],
    warnings: Array.isArray(prevExtraction.warnings) ? prevExtraction.warnings : [],
  };

  let licenceId = primary?.id || null;
  let licenceVersionId = currentVersion?.id || null;

  if (licenceVersionId) {
    const updated = await confirmLicenceVersion({
      organizationId: input.organizationId,
      versionId: licenceVersionId,
      userId: input.userId,
      extraction,
    });
    licenceVersionId = updated?.id || licenceVersionId;
  } else {
    const created = await createLicenceWithVersion({
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      userId: input.userId,
      fileName: "Manual summary",
      extraction,
    });
    const confirmed = await confirmLicenceVersion({
      organizationId: input.organizationId,
      versionId: created.version.id,
      userId: input.userId,
      extraction,
    });
    licenceId = created.licence.id;
    licenceVersionId = confirmed?.id || created.version.id;
  }

  let occupancy = null;
  if (input.occupantsNow !== undefined) {
    occupancy = await createOccupancySnapshot({
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      personCount: input.occupantsNow,
      sourceSystem: "manual_header",
      verifiedBy: input.userId,
      createdBy: input.userId,
      confidence: 1,
    });
  }

  await writeHmoAuditEvent({
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.userId,
    entityType: "hmo_property_profile",
    entityId: input.propertyId,
    action: "summary.updated",
    metadata: {
      borough,
      lifecycleStatus,
      expiryDate,
      maxPersons,
      occupantsNow: input.occupantsNow ?? null,
    },
  });

  return { licenceId, licenceVersionId, occupancy, extraction };
}

export async function getOverview(organizationId: string, propertyId: string) {
  const profile = await ensurePropertyProfile(organizationId, propertyId);
  const licences = await listLicences(organizationId, propertyId);
  const findings = await listFindings(organizationId, propertyId);
  const property = await appStorage.getProperty(propertyId);
  const assessments = await db
    .select()
    .from(hmoAssessments)
    .where(
      and(
        eq(hmoAssessments.organizationId, organizationId),
        eq(hmoAssessments.propertyId, propertyId),
      ),
    )
    .orderBy(desc(hmoAssessments.createdAt))
    .limit(20);

  const [latestOccupancy] = await db
    .select()
    .from(hmoOccupancySnapshots)
    .where(
      and(
        eq(hmoOccupancySnapshots.organizationId, organizationId),
        eq(hmoOccupancySnapshots.propertyId, propertyId),
      ),
    )
    .orderBy(desc(hmoOccupancySnapshots.asOf))
    .limit(1);

  const primaryLicence = licences[0] || null;
  const extraction = (primaryLicence?.versions?.[0]?.extractedJson || null) as HmoLicenceExtraction | null;
  const borough =
    (typeof extraction?.borough?.value === "string" && extraction.borough.value.trim()
      ? extraction.borough.value.trim()
      : null) ||
    (property as any)?.city ||
    null;

  let liveActiveTenants: number | null = null;
  try {
    const getAssignments = (appStorage as any).getTenantAssignmentsByProperty;
    if (typeof getAssignments === "function") {
      const rows = await getAssignments.call(appStorage, propertyId, organizationId);
      if (Array.isArray(rows)) {
        const nowMs = Date.now();
        liveActiveTenants = rows.filter((r: any) => {
          const assignmentActive = r.assignment?.isActive !== false;
          const end = r.assignment?.leaseEndDate || null;
          const notEnded = !end || new Date(end).getTime() > nowMs;
          return assignmentActive && notEnded;
        }).length;
      }
    }
  } catch {
    liveActiveTenants = null;
  }

  const occupantsNow =
    liveActiveTenants != null
      ? liveActiveTenants
      : latestOccupancy?.personCount != null && Number.isFinite(latestOccupancy.personCount)
        ? latestOccupancy.personCount
        : null;
  const occupantsPermitted =
    typeof primaryLicence?.maxPersons === "number"
      ? primaryLicence.maxPersons
      : typeof extraction?.maximum_individuals?.value === "number"
        ? extraction.maximum_individuals.value
        : null;

  const now = Date.now();
  const activeFindings = findings.filter((f) => {
    const meta = (f.actualJson || {}) as Record<string, unknown>;
    if (meta.dismissedAt) return false;
    if (meta.snoozedUntil && new Date(String(meta.snoozedUntil)).getTime() > now) return false;
    return (
      f.status === "EVIDENCE_MISSING" ||
      f.status === "REQUIRES_HUMAN_REVIEW" ||
      f.status === "CONFIRMED_NON_COMPLIANT" ||
      f.status === "POTENTIAL_RISK"
    );
  });

  const renewalJobs = await db
    .select()
    .from(hmoJobs)
    .where(
      and(
        eq(hmoJobs.organizationId, organizationId),
        eq(hmoJobs.propertyId, propertyId),
        eq(hmoJobs.jobType, "RENEWAL_ALERT"),
        eq(hmoJobs.status, "COMPLETED"),
      ),
    )
    .orderBy(desc(hmoJobs.createdAt))
    .limit(10);

  const evidenceItems: Array<{
    id: string;
    label: string;
    status: "Present" | "Missing" | "Expiring" | "Needs review";
    source: string;
    link: string | null;
    detail?: string | null;
  }> = [];

  const soon = now + 30 * 24 * 60 * 60 * 1000;

  try {
    const docs = await appStorage.getComplianceDocuments(organizationId);
    const forProperty = (docs || []).filter(
      (d: any) => !d.propertyId || d.propertyId === propertyId,
    );
    const kinds: Array<{ id: string; match: RegExp; label: string }> = [
      { id: "gas", match: /gas/i, label: "Gas safety certificate" },
      { id: "electrical", match: /electr|eicr|pat/i, label: "Electrical safety certificate" },
      { id: "fire", match: /fire|smoke|alarm/i, label: "Fire safety evidence" },
    ];
    for (const k of kinds) {
      const hit = forProperty.find(
        (d: any) =>
          k.match.test(String(d.documentType || "")) ||
          k.match.test(String(d.name || "")) ||
          k.match.test(String(d.title || "")),
      );
      let status: "Present" | "Missing" | "Expiring" | "Needs review" = "Missing";
      let detail: string | null = null;
      if (hit) {
        const expRaw = hit.expiryDate || hit.expiresAt || null;
        const expMs = expRaw ? new Date(expRaw).getTime() : NaN;
        if (Number.isFinite(expMs) && expMs < now) {
          status = "Needs review";
          detail = "Expired — verify replacement";
        } else if (Number.isFinite(expMs) && expMs <= soon) {
          status = "Expiring";
          detail = `Expires ${new Date(expMs).toISOString().slice(0, 10)}`;
        } else {
          status = "Present";
          detail = Number.isFinite(expMs)
            ? `Expires ${new Date(expMs).toISOString().slice(0, 10)}`
            : null;
        }
      }
      evidenceItems.push({
        id: `compliance_${k.id}`,
        label: k.label,
        status,
        source: "compliance_documents",
        link: `/properties/${propertyId}?tab=compliance`,
        detail,
      });
    }
  } catch {
    /* compliance module may be off */
  }

  const extractionConditions = Array.isArray(extraction?.conditions)
    ? extraction!.conditions
    : [];
  for (let i = 0; i < extractionConditions.length; i++) {
    const c: any = extractionConditions[i];
    const due =
      c?.due_date || c?.action_due_date || c?.deadline || c?.compliance_date || null;
    const dueMs = due ? new Date(String(due)).getTime() : NaN;
    let status: "Present" | "Missing" | "Expiring" | "Needs review" = "Needs review";
    let detail: string | null = c?.condition_text || c?.original_text || null;
    if (Number.isFinite(dueMs)) {
      if (dueMs < now) {
        status = "Needs review";
        detail = `Action due ${new Date(dueMs).toISOString().slice(0, 10)} (passed)`;
      } else if (dueMs <= soon) {
        status = "Expiring";
        detail = `Action due ${new Date(dueMs).toISOString().slice(0, 10)}`;
      } else {
        status = "Present";
        detail = `Action due ${new Date(dueMs).toISOString().slice(0, 10)}`;
      }
    }
    evidenceItems.push({
      id: `condition_${i}`,
      label: String(
        c?.category
          ? `[${c.category}] ${c.condition_text || c.original_text || "Licence condition"}`
          : c?.condition_text || c?.original_text || "Licence condition",
      ).slice(0, 160),
      status,
      source: "licence_conditions",
      link: null,
      detail,
    });
  }

  for (const f of findings.slice(0, 40)) {
    const check = String(f.checkId || "");
    if (!/^(SAF-|AMEN-|MGMT-|LIC-05)/i.test(check)) continue;
    const meta = (f.actualJson || {}) as Record<string, unknown>;
    if (meta.dismissedAt) continue;
    let status: "Present" | "Missing" | "Expiring" | "Needs review" = "Needs review";
    if (f.status === "EVIDENCE_MISSING") status = "Missing";
    else if (f.status === "CONFIRMED_COMPLIANT" || f.status === "POTENTIAL_COMPLIANT") status = "Present";
    evidenceItems.push({
      id: `finding_${f.id}`,
      label: `${check}: ${String(f.explanation || "Finding").slice(0, 100)}`,
      status,
      source: "assessment_finding",
      link: null,
      detail: f.status,
    });
  }

  const licenceEvidenceStatus = (profile as any).licenceEvidenceStatus || "UNKNOWN";
  const hmoClassification = (property as any)?.hmoClassification || null;
  const setupComplete =
    hmoClassification === "NOT_HMO" ||
    licenceEvidenceStatus === "ISSUED" ||
    (licenceEvidenceStatus === "NOT_REQUIRED" &&
      Boolean(String((profile as any).licenceEvidenceNotes || "").trim()));
  const setupIncomplete =
    (hmoClassification === "HMO" || hmoClassification === "UNSURE") && !setupComplete;

  // Linked open maintenance from HMO findings
  let linkedMaintenance: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    findingId?: string | null;
    dueDate?: string | null;
    verificationStatus?: string | null;
  }> = [];
  try {
    const mrs = await appStorage.getMaintenanceRequestsByProperty(propertyId);
    if (Array.isArray(mrs)) {
      linkedMaintenance = mrs
        .filter((m: any) => {
          const aj = m.aiAnalysisJson || {};
          return aj?.source === "hmo_finding" || m.source === "hmo_finding";
        })
        .slice(0, 30)
        .map((m: any) => ({
          id: m.id,
          title: m.title,
          status: m.status,
          priority: m.priority,
          findingId: m.aiAnalysisJson?.hmoFindingId || null,
          dueDate: m.dueDate || null,
          verificationStatus: m.verificationStatus || "none",
        }));
    }
  } catch {
    linkedMaintenance = [];
  }

  const roomProfiles = await listRoomProfiles(organizationId, propertyId);

  let hmoInspections: Array<{
    id: string;
    type?: string | null;
    status: string;
    displayStatus: string;
    scheduledDate?: string | null;
    completedDate?: string | null;
    createdAt?: string | null;
    templateId?: string | null;
    templateName?: string | null;
    notes?: string | null;
  }> = [];
  try {
    const rows = await db
      .select({
        id: inspections.id,
        type: inspections.type,
        status: inspections.status,
        scheduledDate: inspections.scheduledDate,
        completedDate: inspections.completedDate,
        createdAt: inspections.createdAt,
        templateId: inspections.templateId,
        templateName: inspectionTemplates.name,
        notes: inspections.notes,
      })
      .from(inspections)
      .innerJoin(
        inspectionTemplates,
        and(
          eq(inspections.templateId, inspectionTemplates.id),
          eq(inspectionTemplates.organizationId, organizationId),
          eq(inspectionTemplates.isHmoTemplate, true),
        ),
      )
      .where(
        and(
          eq(inspections.organizationId, organizationId),
          eq(inspections.propertyId, propertyId),
        ),
      )
      .orderBy(desc(inspections.scheduledDate))
      .limit(50);

    hmoInspections = rows.map((insp) => {
      const schedMs = insp.scheduledDate ? new Date(insp.scheduledDate).getTime() : NaN;
      const done =
        insp.status === "completed" || insp.status === "reviewed";
      let displayStatus = "Scheduled";
      if (done) displayStatus = "Completed";
      else if (insp.status === "in_progress") displayStatus = "In progress";
      else if (Number.isFinite(schedMs) && schedMs < now) displayStatus = "Missed / Overdue";
      else if (insp.scheduledDate) displayStatus = "Scheduled";
      else displayStatus = "Not scheduled";
      return {
        id: insp.id,
        type: insp.type,
        status: insp.status,
        displayStatus,
        scheduledDate: insp.scheduledDate ? new Date(insp.scheduledDate).toISOString() : null,
        completedDate: insp.completedDate ? new Date(insp.completedDate).toISOString() : null,
        createdAt: insp.createdAt ? new Date(insp.createdAt).toISOString() : null,
        templateId: insp.templateId,
        templateName: insp.templateName,
        notes: insp.notes,
      };
    });
  } catch {
    hmoInspections = [];
  }

  type TimelineEvent = {
    id: string;
    at: string;
    kind: string;
    title: string;
    detail?: string | null;
    link?: string | null;
  };
  const complianceTimeline: TimelineEvent[] = [];

  for (const lic of licences) {
    for (const v of lic.versions || []) {
      complianceTimeline.push({
        id: `licver_${v.id}`,
        at: v.createdAt ? new Date(v.createdAt).toISOString() : new Date().toISOString(),
        kind: "licence_version",
        title: `Licence version ${v.versionNo || ""} uploaded`.trim(),
        detail: v.confirmedAt
          ? `Confirmed ${new Date(v.confirmedAt).toISOString().slice(0, 10)}`
          : v.status || "Draft",
        link: null,
      });
    }
  }
  for (const a of assessments) {
    complianceTimeline.push({
      id: `assess_${a.id}`,
      at: a.completedAt
        ? new Date(a.completedAt).toISOString()
        : a.createdAt
          ? new Date(a.createdAt).toISOString()
          : new Date().toISOString(),
      kind: "assessment",
      title: `Assessment ${a.overallStatus || "run"}`,
      detail: a.runReason || null,
      link: null,
    });
  }
  for (const f of findings.slice(0, 25)) {
    complianceTimeline.push({
      id: `find_${f.id}`,
      at: f.createdAt ? new Date(f.createdAt).toISOString() : new Date().toISOString(),
      kind: "finding",
      title: `${f.checkId}: ${String(f.explanation || f.status).slice(0, 80)}`,
      detail: f.severity,
      link: null,
    });
  }
  for (const m of linkedMaintenance) {
    complianceTimeline.push({
      id: `mr_${m.id}`,
      at: new Date().toISOString(),
      kind: "maintenance",
      title: `MR: ${m.title}`,
      detail:
        m.verificationStatus === "awaiting_verification"
          ? `Status ${m.status} · awaiting verification`
          : `Status ${m.status}`,
      link: `/maintenance/${m.id}`,
    });
  }
  for (const insp of hmoInspections) {
    complianceTimeline.push({
      id: `insp_${insp.id}`,
      at:
        insp.completedDate ||
        insp.scheduledDate ||
        insp.createdAt ||
        new Date().toISOString(),
      kind: "inspection",
      title: insp.templateName || "HMO inspection",
      detail: insp.displayStatus,
      link: `/inspections/${insp.id}`,
    });
  }
  complianceTimeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    profile: {
      ...profile,
      licenceEvidenceStatus,
      licenceEvidenceNotes: (profile as any).licenceEvidenceNotes || null,
    },
    property: property
      ? {
          id: property.id,
          name: property.name,
          address: property.address,
          city: (property as any).city || null,
          organizationId: property.organizationId,
          hmoClassification,
        }
      : null,
    header: {
      address: property?.address || null,
      borough,
      authorityName: primaryLicence?.authorityName || null,
      licenceStatus: primaryLicence?.lifecycleStatus || null,
      licenceEvidenceStatus,
      expiryDate: primaryLicence?.expiryDate || null,
      occupantsNow,
      occupantsPermitted,
      hmoClassification,
      setupIncomplete,
      attentionCount: activeFindings.length + renewalJobs.filter((j) => {
        const age = j.createdAt ? now - new Date(j.createdAt).getTime() : 0;
        return age < 90 * 24 * 60 * 60 * 1000;
      }).length,
    },
    licences,
    recentFindings: findings.slice(0, 50),
    assessments,
    activeTenantCount: liveActiveTenants,
    occupancy: latestOccupancy
      ? { ...latestOccupancy, personCount: occupantsNow }
      : liveActiveTenants != null
        ? { personCount: liveActiveTenants, sourceSystem: "active_tenants" }
        : null,
    renewalAlerts: renewalJobs.map((j) => j.resultJson),
    evidenceItems,
    roomProfiles,
    linkedMaintenance,
    hmoInspections,
    complianceTimeline: complianceTimeline.slice(0, 80),
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

export async function getJobByIdempotencyKey(
  organizationId: string,
  idempotencyKey: string,
): Promise<HmoJob | undefined> {
  const [existing] = await db
    .select()
    .from(hmoJobs)
    .where(
      and(
        eq(hmoJobs.organizationId, organizationId),
        eq(hmoJobs.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  return existing;
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
    const existing = await getJobByIdempotencyKey(
      input.organizationId,
      input.idempotencyKey,
    );
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

export async function getFinding(organizationId: string, findingId: string) {
  const [row] = await db
    .select()
    .from(hmoFindings)
    .where(and(eq(hmoFindings.id, findingId), eq(hmoFindings.organizationId, organizationId)))
    .limit(1);
  return row;
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

/** @deprecated Stage 1 core uses Maintenance/WO — do not call from product paths. */
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

  const byStatus: Record<string, number> = {};
  for (const p of profiles) {
    const key = p.overallStatus || "NOT_ASSESSED";
    byStatus[key] = (byStatus[key] || 0) + 1;
  }

  const critical = profiles.filter((p) => p.overallStatus === "CRITICAL_EXCEPTION").length;
  const actionRequired = profiles.filter((p) => p.overallStatus === "ACTION_REQUIRED").length;
  const reviewRequired = profiles.filter((p) => p.overallStatus === "REVIEW_REQUIRED").length;
  const compliant = profiles.filter((p) => p.overallStatus === "VERIFIED_COMPLIANT").length;
  // Spec vocabulary: Non-compliant ≈ ACTION_REQUIRED + CRITICAL; Needs attention ≈ REVIEW_REQUIRED
  const nonCompliant = actionRequired + critical;
  const needsAttention = reviewRequired;

  const now = new Date();
  const in90 = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const licences = await db
    .select()
    .from(hmoLicences)
    .where(eq(hmoLicences.organizationId, organizationId));
  const renewalsDue = licences.filter((l) => {
    if (!l.expiryDate) return false;
    const exp = new Date(l.expiryDate);
    return exp.getTime() <= in90.getTime();
  }).length;

  // Enrich profile rows for dashboard table
  const licenceByProperty = new Map<string, (typeof licences)[0]>();
  for (const l of licences) {
    if (!licenceByProperty.has(l.propertyId)) licenceByProperty.set(l.propertyId, l);
  }

  const enrichedProfiles = [];
  for (const p of profiles.slice(0, 200)) {
    const lic = licenceByProperty.get(p.propertyId);
    const property = await appStorage.getProperty(p.propertyId);
    const findings = await listFindings(organizationId, p.propertyId);
    const alertFindings = findings.filter((f) => {
      const meta = (f.actualJson || {}) as Record<string, unknown>;
      if (meta.dismissedAt) return false;
      if (meta.snoozedUntil && new Date(String(meta.snoozedUntil)).getTime() > Date.now()) return false;
      return (
        f.status === "EVIDENCE_MISSING" ||
        f.status === "REQUIRES_HUMAN_REVIEW" ||
        f.status === "CONFIRMED_NON_COMPLIANT" ||
        f.status === "POTENTIAL_RISK"
      );
    });
    const [occ] = await db
      .select()
      .from(hmoOccupancySnapshots)
      .where(
        and(
          eq(hmoOccupancySnapshots.organizationId, organizationId),
          eq(hmoOccupancySnapshots.propertyId, p.propertyId),
        ),
      )
      .orderBy(desc(hmoOccupancySnapshots.asOf))
      .limit(1);

    const nextActionFinding = alertFindings[0];
    const licenceEvidenceStatus = (p as any).licenceEvidenceStatus || "UNKNOWN";
    const hmoClassification = (property as any)?.hmoClassification || null;
    const occupancyMismatch =
      lic?.maxPersons != null &&
      occ?.personCount != null &&
      Number(occ.personCount) > Number(lic.maxPersons);
    const licenceEvidenceMissing =
      licenceEvidenceStatus === "REQUIRED_MISSING" ||
      licenceEvidenceStatus === "UNKNOWN" ||
      ((hmoClassification === "HMO" || hmoClassification === "UNSURE") &&
        licenceEvidenceStatus !== "ISSUED" &&
        licenceEvidenceStatus !== "NOT_REQUIRED");
    const missingSafetyDoc = alertFindings.some((f) =>
      /^(SAF-|LIC-05)/i.test(String(f.checkId || "")) && f.status === "EVIDENCE_MISSING",
    );
    const occupancyAlert = alertFindings.some((f) => /^OCC-/i.test(String(f.checkId || "")));
    const topFinding = nextActionFinding;
    const ruleSourceLabel = (() => {
      const check = String(topFinding?.checkId || "");
      const rv = String(topFinding?.ruleVersionId || "");
      if (/^(AMEN-|COND-|LOC-|PLAN-|MGMT-)/i.test(check)) return "Company process (stub)";
      if (/^LIC-/i.test(check) || /condition/i.test(String(topFinding?.explanation || ""))) {
        return "Licence condition";
      }
      if (rv && !/^england/i.test(rv)) return "Council / local overlay";
      return "National baseline";
    })();

    enrichedProfiles.push({
      propertyId: p.propertyId,
      overallStatus: p.overallStatus,
      evidenceCompleteness: p.evidenceCompleteness,
      lastAssessedAt: p.lastAssessedAt,
      address: property?.address || null,
      name: property?.name || null,
      borough: (property as any)?.city || lic?.authorityName || null,
      authorityName: lic?.authorityName || null,
      expiryDate: lic?.expiryDate || null,
      licenceStatus: lic?.lifecycleStatus || null,
      licenceEvidenceStatus,
      hmoClassification,
      maxPersons: lic?.maxPersons ?? null,
      occupantsNow: occ?.personCount ?? null,
      occupancyMismatch: Boolean(occupancyMismatch || occupancyAlert),
      licenceEvidenceMissing,
      missingSafetyDoc,
      alertCount: alertFindings.length,
      alertSeverity: topFinding?.severity || null,
      alertProblem: topFinding?.explanation || null,
      ruleSourceLabel,
      nextAction: nextActionFinding?.suggestedActionCode || nextActionFinding?.explanation || null,
      managerName: lic?.managerName || null,
    });
  }

  let overdueHmoMaintenance = 0;
  try {
    const openMrs = await db
      .select()
      .from(maintenanceRequests)
      .where(
        and(
          eq(maintenanceRequests.organizationId, organizationId),
          or(
            inArray(maintenanceRequests.status, ["open", "in_progress"]),
            eq(maintenanceRequests.verificationStatus, "awaiting_verification"),
          ),
          sql`${maintenanceRequests.source}::text = 'hmo_finding'`,
        ),
      );
    const nowMs = Date.now();
    overdueHmoMaintenance = openMrs.filter((m) => {
      if (m.verificationStatus === "awaiting_verification" && m.dueDate) {
        return new Date(m.dueDate).getTime() < nowMs;
      }
      if (!m.dueDate) return false;
      return new Date(m.dueDate).getTime() < nowMs;
    }).length;
  } catch {
    overdueHmoMaintenance = 0;
  }

  let hmoInspectionDueSoon = 0;
  let hmoInspectionMissed = 0;
  try {
    const hmoInsp = await db
      .select({
        id: inspections.id,
        status: inspections.status,
        scheduledDate: inspections.scheduledDate,
        propertyId: inspections.propertyId,
      })
      .from(inspections)
      .innerJoin(
        inspectionTemplates,
        and(
          eq(inspections.templateId, inspectionTemplates.id),
          eq(inspectionTemplates.organizationId, organizationId),
          eq(inspectionTemplates.isHmoTemplate, true),
        ),
      )
      .where(eq(inspections.organizationId, organizationId));
    const nowMs = Date.now();
    const in7 = nowMs + 7 * 24 * 60 * 60 * 1000;
    for (const insp of hmoInsp) {
      if (insp.status === "completed" || insp.status === "reviewed" || !insp.scheduledDate) continue;
      const t = new Date(insp.scheduledDate).getTime();
      if (t < nowMs) hmoInspectionMissed += 1;
      else if (t <= in7) hmoInspectionDueSoon += 1;
    }
    for (const p of enrichedProfiles) {
      (p as any).hmoInspectionMissed = hmoInsp.some(
        (i) =>
          i.propertyId === p.propertyId &&
          i.scheduledDate &&
          i.status !== "completed" &&
          i.status !== "reviewed" &&
          new Date(i.scheduledDate).getTime() < nowMs,
      );
      (p as any).hmoInspectionDueSoon = hmoInsp.some((i) => {
        if (i.propertyId !== p.propertyId || !i.scheduledDate) return false;
        if (i.status === "completed" || i.status === "reviewed") return false;
        const t = new Date(i.scheduledDate).getTime();
        return t >= nowMs && t <= in7;
      });
    }
  } catch {
    hmoInspectionDueSoon = 0;
    hmoInspectionMissed = 0;
  }

  let rulesReviewNeeded = profiles.filter(
    (p) =>
      p.overallStatus === "REVIEW_REQUIRED" || p.profileStatus === "RULES_REVIEW_NEEDED",
  ).length;
  try {
    const pendingRules = await db
      .select({ id: hmoRuleVersions.id })
      .from(hmoRuleVersions)
      .where(
        and(
          or(
            isNull(hmoRuleVersions.organizationId),
            eq(hmoRuleVersions.organizationId, organizationId),
          ),
          inArray(hmoRuleVersions.status, ["ANALYST_QUEUE", "REVIEW_REQUIRED", "DRAFT"]),
        ),
      );
    const queuedImpact = await db
      .select({ id: hmoRuleImpactRuns.id })
      .from(hmoRuleImpactRuns)
      .where(
        and(
          eq(hmoRuleImpactRuns.organizationId, organizationId),
          inArray(hmoRuleImpactRuns.status, ["QUEUED", "RUNNING"]),
        ),
      );
    rulesReviewNeeded = Math.max(
      rulesReviewNeeded,
      pendingRules.length + queuedImpact.length,
    );
  } catch {
    /* keep profile-based count */
  }

  const licenceEvidenceMissingCount = enrichedProfiles.filter((p) => p.licenceEvidenceMissing).length;
  const occupancyMismatchCount = enrichedProfiles.filter((p) => p.occupancyMismatch).length;
  const missingSafetyDocCount = enrichedProfiles.filter((p) => p.missingSafetyDoc).length;

  return {
    asOf: new Date().toISOString(),
    propertyCount: profiles.length,
    byStatus,
    critical,
    actionRequired,
    reviewRequired,
    compliant,
    nonCompliant,
    needsAttention,
    renewalsDue,
    rulesReviewNeeded,
    licenceEvidenceMissing: licenceEvidenceMissingCount,
    occupancyMismatch: occupancyMismatchCount,
    missingSafetyDoc: missingSafetyDocCount,
    overdueHmoMaintenance,
    hmoInspectionDueSoon,
    hmoInspectionMissed,
    profiles: enrichedProfiles,
  };
}

export async function dismissOrSnoozeFinding(input: {
  organizationId: string;
  findingId: string;
  userId: string;
  action: "dismiss" | "snooze";
  reason: string;
  snoozeDays?: number;
  /** Critical findings require an explicit reviewer decision recorded */
  reviewerDecision?: string | null;
}) {
  const [finding] = await db
    .select()
    .from(hmoFindings)
    .where(
      and(
        eq(hmoFindings.id, input.findingId),
        eq(hmoFindings.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!finding) return null;

  if (finding.severity === "CRITICAL" && !input.reviewerDecision?.trim()) {
    throw Object.assign(new Error("Critical alerts require a recorded reviewer decision"), {
      status: 400,
      code: "REVIEWER_DECISION_REQUIRED",
    });
  }

  const prev = (finding.actualJson || {}) as Record<string, unknown>;
  const next: Record<string, unknown> = {
    ...prev,
    alertAction: input.action,
    alertReason: input.reason,
    alertActorId: input.userId,
    alertAt: new Date().toISOString(),
  };
  if (input.action === "dismiss") {
    next.dismissedAt = new Date().toISOString();
    if (input.reviewerDecision) next.reviewerDecision = input.reviewerDecision;
  } else {
    const days = Math.max(1, Math.min(90, input.snoozeDays || 7));
    next.snoozedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    if (input.reviewerDecision) next.reviewerDecision = input.reviewerDecision;
  }

  const [updated] = await db
    .update(hmoFindings)
    .set({ actualJson: next, updatedAt: new Date() })
    .where(eq(hmoFindings.id, finding.id))
    .returning();

  await writeHmoAuditEvent({
    organizationId: input.organizationId,
    actorType: "user",
    actorId: input.userId,
    action: input.action === "dismiss" ? "hmo.alert.dismiss" : "hmo.alert.snooze",
    entityType: "hmo_finding",
    entityId: finding.id,
    metadata: {
      reason: input.reason,
      reviewerDecision: input.reviewerDecision || null,
      severity: finding.severity,
    },
  });

  return updated;
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

export async function updateLicenceEvidenceStatus(input: {
  organizationId: string;
  propertyId: string;
  userId?: string | null;
  licenceEvidenceStatus?: string | null;
  licenceEvidenceNotes?: string | null;
}) {
  const profile = await ensurePropertyProfile(
    input.organizationId,
    input.propertyId,
    input.userId,
  );
  const [row] = await db
    .update(hmoPropertyProfiles)
    .set({
      licenceEvidenceStatus:
        input.licenceEvidenceStatus === undefined
          ? undefined
          : input.licenceEvidenceStatus || "UNKNOWN",
      licenceEvidenceNotes:
        input.licenceEvidenceNotes === undefined ? undefined : input.licenceEvidenceNotes,
      updatedAt: new Date(),
      updatedBy: input.userId ?? null,
    })
    .where(eq(hmoPropertyProfiles.id, profile.id))
    .returning();
  return row || profile;
}

export async function upsertRoomProfile(input: {
  organizationId: string;
  propertyId: string;
  existingRoomId?: string | null;
  roomName?: string | null;
  roomType?: string | null;
  measuredUsableAreaM2?: number | null;
  ceilingHeightM?: number | null;
  declaredPermittedOccupancy?: number | null;
  sleepingApproved?: boolean | null;
  measurementSource?: string | null;
  humanConfirmed?: boolean | null;
  userId?: string | null;
  id?: string | null;
}) {
  if (input.id) {
    const [row] = await db
      .update(hmoRoomProfiles)
      .set({
        roomName: input.roomName ?? undefined,
        roomType: input.roomType ?? undefined,
        measuredUsableAreaM2: input.measuredUsableAreaM2 ?? undefined,
        ceilingHeightM: input.ceilingHeightM ?? undefined,
        declaredPermittedOccupancy: input.declaredPermittedOccupancy ?? undefined,
        sleepingApproved:
          input.sleepingApproved === undefined || input.sleepingApproved === null
            ? undefined
            : input.sleepingApproved,
        measurementSource: input.measurementSource ?? undefined,
        humanConfirmed:
          input.humanConfirmed === undefined || input.humanConfirmed === null
            ? undefined
            : input.humanConfirmed,
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
      roomName: input.roomName ?? null,
      roomType: input.roomType ?? null,
      measuredUsableAreaM2: input.measuredUsableAreaM2 ?? null,
      ceilingHeightM: input.ceilingHeightM ?? null,
      declaredPermittedOccupancy: input.declaredPermittedOccupancy ?? null,
      sleepingApproved: input.sleepingApproved ?? true,
      measurementSource: input.measurementSource ?? "manual",
      humanConfirmed: input.humanConfirmed ?? true,
      measuredAt: new Date(),
      createdBy: input.userId ?? null,
      updatedBy: input.userId ?? null,
    })
    .returning();
  return row;
}

export async function importPropertyRoomsIntoHmo(input: {
  organizationId: string;
  propertyId: string;
  userId: string;
}) {
  const { listPropertyRooms } = await import("../propertyRoomsService");
  const propertyRooms = await listPropertyRooms(input.organizationId, input.propertyId);
  const existing = await listRoomProfiles(input.organizationId, input.propertyId);
  const byExisting = new Map(
    existing.filter((r) => r.existingRoomId).map((r) => [r.existingRoomId!, r]),
  );
  const created = [];
  for (const pr of propertyRooms || []) {
    let area: number | null = null;
    const widthMm = typeof pr.widthMm === "number" ? pr.widthMm : null;
    const lengthMm = typeof pr.lengthMm === "number" ? pr.lengthMm : null;
    if (widthMm != null && lengthMm != null && widthMm > 0 && lengthMm > 0) {
      area = Math.round(((widthMm / 1000) * (lengthMm / 1000)) * 100) / 100;
    }
    const hit = byExisting.get(pr.id);
    const isAi = String(pr.source || "").toLowerCase() === "ai";
    const row = await upsertRoomProfile({
      organizationId: input.organizationId,
      propertyId: input.propertyId,
      id: hit?.id || null,
      existingRoomId: pr.id,
      roomName: pr.name || null,
      roomType: pr.categoryName || pr.categorySlug || "bedroom",
      measuredUsableAreaM2: Number.isFinite(area as number) ? area : null,
      measurementSource: isAi ? "floor_plan_ai" : "property_rooms",
      humanConfirmed: false,
      sleepingApproved: true,
      userId: input.userId,
    });
    if (row) created.push(row);
  }
  return { imported: created.length, rooms: created };
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
