/** Required compliance document types used for block/property compliance %. */
export const DEFAULT_COMPLIANCE_DOC_TYPES = [
  "Fire Safety Certificate",
  "Building Insurance",
  "Electrical Safety Certificate",
  "Gas Safety Certificate",
  "EPC Certificate",
  "HMO License",
  "Planning Permission",
] as const;

export type ComplianceDocForRate = {
  documentType: string;
  expiryDate?: Date | string | null;
};

/** True if the document has no expiry or has not expired yet (includes "expiring soon"). */
export function isComplianceDocCurrent(
  doc: ComplianceDocForRate,
  now: Date = new Date(),
): boolean {
  if (!doc.expiryDate) return true;
  return new Date(doc.expiryDate) >= now;
}

/**
 * Share of required document types that have at least one non-expired document.
 * Matches the Compliance Documents calendar coverage model (e.g. 2 of 7 → 29%).
 */
export function computeDocumentComplianceRate(
  docs: ComplianceDocForRate[],
  now: Date = new Date(),
): number {
  if (DEFAULT_COMPLIANCE_DOC_TYPES.length === 0) return 0;
  const covered = DEFAULT_COMPLIANCE_DOC_TYPES.filter((docType) =>
    docs.some((d) => d.documentType === docType && isComplianceDocCurrent(d, now)),
  );
  return Math.round((covered.length / DEFAULT_COMPLIANCE_DOC_TYPES.length) * 100);
}
