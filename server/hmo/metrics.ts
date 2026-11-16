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
    rulesReviewNeeded: raw.rulesReviewNeeded,
    openCaseCount: raw.openCaseCount,
    openTaskCount: raw.openTaskCount,
    counters: {
      totalHmos: raw.propertyCount,
      compliant: raw.compliant,
      nonCompliant: raw.nonCompliant,
      needsAttention: raw.needsAttention,
      renewalsDue: raw.renewalsDue,
      rulesReviewNeeded: raw.rulesReviewNeeded,
    },
    buckets: {
      critical: raw.critical,
      actionRequired: raw.actionRequired,
      reviewRequired: raw.reviewRequired,
      compliant: raw.compliant,
      openCases: raw.openCaseCount,
      openTasks: raw.openTaskCount,
    },
    cases: (raw.cases || []).slice(0, 25),
    profiles: raw.profiles || [],
  };
}
