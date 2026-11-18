import * as hmoStorage from "./storage";

/** Pre-aggregated dashboard metrics suitable for large HMO portfolios. */
export async function preAggregateDashboardMetrics(organizationId: string) {
  const raw = await hmoStorage.listDashboardMetrics(organizationId);
  return {
    asOf: raw.asOf,
    propertyCount: raw.propertyCount,
    byStatus: raw.byStatus,
    critical: raw.critical,
    actionRequired: raw.actionRequired,
    reviewRequired: raw.reviewRequired,
    compliant: raw.compliant,
    nonCompliant: raw.nonCompliant,
    needsAttention: raw.needsAttention,
    renewalsDue: raw.renewalsDue,
    rulesReviewNeeded: raw.rulesReviewNeeded || 0,
    licenceEvidenceMissing: raw.licenceEvidenceMissing || 0,
    occupancyMismatch: raw.occupancyMismatch || 0,
    missingSafetyDoc: raw.missingSafetyDoc || 0,
    overdueHmoMaintenance: raw.overdueHmoMaintenance || 0,
    hmoInspectionDueSoon: raw.hmoInspectionDueSoon || 0,
    hmoInspectionMissed: raw.hmoInspectionMissed || 0,
    counters: {
      totalHmos: raw.propertyCount,
      compliant: raw.compliant,
      nonCompliant: raw.nonCompliant,
      needsAttention: raw.needsAttention,
      renewalsDue: raw.renewalsDue,
      licenceEvidenceMissing: raw.licenceEvidenceMissing || 0,
      occupancyMismatch: raw.occupancyMismatch || 0,
      missingSafetyDoc: raw.missingSafetyDoc || 0,
      overdueHmoMaintenance: raw.overdueHmoMaintenance || 0,
      rulesReviewNeeded: raw.rulesReviewNeeded || 0,
      hmoInspectionDueSoon: raw.hmoInspectionDueSoon || 0,
      hmoInspectionMissed: raw.hmoInspectionMissed || 0,
    },
    buckets: {
      critical: raw.critical,
      actionRequired: raw.actionRequired,
      reviewRequired: raw.reviewRequired,
      compliant: raw.compliant,
    },
    profiles: raw.profiles || [],
  };
}
