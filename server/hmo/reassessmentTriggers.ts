/**
 * Reassessment hooks are disabled — Run assessment has been removed.
 * Call sites may still invoke this; it is a no-op.
 */
export async function triggerPropertyReassessment(_params: {
  organizationId: string;
  propertyId: string;
  userId?: string | null;
  reason: string;
}) {
  return { triggered: false as const, reason: "assessment_removed" };
}
