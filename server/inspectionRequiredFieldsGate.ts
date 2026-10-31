/**
 * Block completing an inspection when template-required fields are blank.
 */
import {
  formatRequiredIncompleteMessage,
  listRequiredIncompleteFields,
  repeatableCountsFromEntries,
} from "@shared/inspectionProgress";
import { repeatableCountsFromPropertyLayout } from "@shared/propertyLayout";
import { isCompanyModuleEnabled } from "@shared/companyModules";
import type { Inspection } from "@shared/schema";

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

export function assertInspectionRequiredFieldsComplete(opts: {
  templateSnapshot: any;
  entries: Array<{
    sectionRef?: string | null;
    fieldKey?: string | null;
    valueJson?: unknown;
    photos?: string[] | null;
  }>;
  propertyRoomCountsSnapshot?: Record<string, number> | null;
  excludeTenantSignatures?: boolean;
}): void {
  const snapshot = opts.templateSnapshot || {};
  const sections = Array.isArray(snapshot.sections) ? snapshot.sections : [];
  if (!sections.length) return;

  const fromEntries = repeatableCountsFromEntries(opts.entries);
  const fromLayout = opts.propertyRoomCountsSnapshot
    ? repeatableCountsFromPropertyLayout(snapshot, opts.propertyRoomCountsSnapshot as any)
    : {};
  const propertyRoomInstances = Array.isArray(snapshot.propertyRoomInstances)
    ? snapshot.propertyRoomInstances
    : [];

  const missing = listRequiredIncompleteFields({
    sections,
    entries: opts.entries,
    repeatableCounts: { ...fromEntries, ...fromLayout },
    propertyRoomInstances,
    templateStructure: snapshot,
    excludeTenantSignatures: !!opts.excludeTenantSignatures,
  });

  if (missing.length > 0) {
    throw httpError(formatRequiredIncompleteMessage(missing), 400);
  }
}

/** Load entries + org tenancy flag, then assert required fields are filled. */
export async function assertInspectionReadyToComplete(
  storageApi: {
    getInspectionEntries: (inspectionId: string) => Promise<any[]>;
    getOrganization: (organizationId: string) => Promise<any>;
  },
  inspection: Inspection,
  organizationId?: string | null,
): Promise<void> {
  const entries = await storageApi.getInspectionEntries(inspection.id);
  let excludeTenantSignatures = true;
  if (organizationId) {
    try {
      const org = await storageApi.getOrganization(organizationId);
      excludeTenantSignatures = !isCompanyModuleEnabled(org as any, "tenancies");
    } catch {
      excludeTenantSignatures = true;
    }
  }

  assertInspectionRequiredFieldsComplete({
    templateSnapshot: inspection.templateSnapshotJson,
    entries,
    propertyRoomCountsSnapshot:
      (inspection as any).propertyRoomCountsSnapshot ?? null,
    excludeTenantSignatures,
  });
}
