import { createHash } from "crypto";

export function summariseSourceDiff(params: {
  previousHash: string | null;
  nextContent: string;
  sourceType?: string | null;
}): {
  contentHash: string;
  changed: boolean;
  informationalOnly: boolean;
  summary: string;
} {
  const contentHash = createHash("sha256").update(params.nextContent, "utf8").digest("hex");
  const changed = !params.previousHash || params.previousHash !== contentHash;
  const informationalOnly =
    /consultation|draft|proposal/i.test(params.sourceType || "") ||
    /consultation|draft for consultation/i.test(params.nextContent);
  return {
    contentHash,
    changed,
    informationalOnly,
    summary: informationalOnly
      ? "Consultation/draft content — informational only; do not auto-publish as effective law (AT-11)"
      : changed
        ? "Source content hash changed — queue for analyst review; no auto-publish"
        : "No content change detected",
  };
}

export function assertSelectiveImpactCohort(propertyIds: string[]): void {
  if (!propertyIds.length) {
    throw new Error("Selective impact requires an explicit property cohort (AT-12)");
  }
}
