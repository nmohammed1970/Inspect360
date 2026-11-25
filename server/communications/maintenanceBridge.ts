import { eq, and } from "drizzle-orm";
import { isCompanyModuleEnabled } from "@shared/companyModules";
import { communicationCaseLinks, organizations } from "@shared/schema";
import { db } from "../db";
import { storage } from "../storage";
import { createCase, findLinkByEntity, getCaseById, linkEntity } from "./service";

/**
 * Idempotent: ensure a Maintenance-category case is linked to a maintenance request.
 * Creates the case on first link; subsequent calls return the existing case.
 */
export async function ensureCaseLinkedToMaintenanceRequest(params: {
  organizationId: string;
  maintenanceRequestId: string;
  title: string;
  description?: string | null;
  priority?: string | null;
  propertyId?: string | null;
  blockId?: string | null;
  reportedByUserId?: string | null;
  tenantId?: string | null;
  source?: string | null;
  actorUserId?: string | null;
}) {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, params.organizationId))
    .limit(1);
  if (!org || !isCompanyModuleEnabled(org, "communications")) {
    return null;
  }

  const existingLink = await findLinkByEntity({
    organizationId: params.organizationId,
    entityType: "maintenance_request",
    entityId: params.maintenanceRequestId,
    relationship: "origin",
  });

  if (existingLink) {
    const existingCase = await getCaseById(params.organizationId, existingLink.caseId);
    return existingCase ? { case: existingCase, link: existingLink, created: false } : null;
  }

  const { case: caseRow } = await createCase({
    organizationId: params.organizationId,
    subject: params.title,
    body: params.description || params.title,
    categoryKey: "maintenance",
    priority: params.priority || "medium",
    source: params.source === "tenant_portal" ? "tenant_portal" : "maintenance",
    propertyId: params.propertyId,
    blockId: params.blockId,
    tenantId: params.tenantId,
    createdByUserId: params.actorUserId || params.reportedByUserId,
    actorType: "system",
    runAiSuggest: false,
  });

  const { link } = await linkEntity({
    organizationId: params.organizationId,
    caseId: caseRow.id,
    entityType: "maintenance_request",
    entityId: params.maintenanceRequestId,
    relationship: "origin",
    actorUserId: params.actorUserId || params.reportedByUserId || "system",
  });

  return { case: caseRow, link, created: true };
}

/**
 * Link a work order to a case at most once. Throws status 409 if a second WO
 * would be created from the same case.
 */
export async function linkWorkOrderFromCase(params: {
  organizationId: string;
  caseId: string;
  workOrderId: string;
  actorUserId: string;
}) {
  const existingWo = await findLinkByEntity({
    organizationId: params.organizationId,
    entityType: "work_order",
    entityId: params.workOrderId,
  });
  if (existingWo && existingWo.caseId !== params.caseId) {
    throw Object.assign(new Error("Work order is already linked to another case"), {
      status: 409,
    });
  }

  const existingFromCase = await db
    .select()
    .from(communicationCaseLinks)
    .where(
      and(
        eq(communicationCaseLinks.caseId, params.caseId),
        eq(communicationCaseLinks.entityType, "work_order"),
        eq(communicationCaseLinks.relationship, "created_from_case"),
      ),
    )
    .limit(1);

  if (existingFromCase.length > 0 && existingFromCase[0].entityId !== params.workOrderId) {
    throw Object.assign(
      new Error(
        "This case already has a work order linked. Only one WO may be created from a case.",
      ),
      { status: 409 },
    );
  }

  return linkEntity({
    organizationId: params.organizationId,
    caseId: params.caseId,
    entityType: "work_order",
    entityId: params.workOrderId,
    relationship: "created_from_case",
    actorUserId: params.actorUserId,
  });
}

/** Fire-and-forget bridge after maintenance request create. */
export function scheduleMaintenanceCaseBridge(params: {
  organizationId: string;
  maintenanceRequestId: string;
  title: string;
  description?: string | null;
  priority?: string | null;
  propertyId?: string | null;
  blockId?: string | null;
  reportedByUserId?: string | null;
  source?: string | null;
}) {
  void ensureCaseLinkedToMaintenanceRequest(params).catch((err) => {
    console.error("[communications] maintenance bridge failed", err);
  });
}

export async function getMaintenanceRequestForCase(
  organizationId: string,
  caseId: string,
) {
  const [link] = await db
    .select()
    .from(communicationCaseLinks)
    .where(
      and(
        eq(communicationCaseLinks.organizationId, organizationId),
        eq(communicationCaseLinks.caseId, caseId),
        eq(communicationCaseLinks.entityType, "maintenance_request"),
      ),
    )
    .limit(1);
  if (!link) return null;
  return storage.getMaintenanceRequest(link.entityId);
}
