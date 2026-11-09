import { hashContent } from "./documentPipeline";
import { extractLicenceFromText } from "./extraction";
import * as hmoStorage from "./storage";

export type BulkLicenceItem = {
  propertyId: string;
  extractedText: string;
  fileName?: string;
  objectUrl?: string;
  contentHash?: string;
};

/**
 * Idempotent bulk licence import keyed by content_hash within the organisation.
 */
export async function bulkImportLicences(params: {
  organizationId: string;
  userId: string;
  items: BulkLicenceItem[];
}) {
  const results: Array<{
    propertyId: string;
    status: "created" | "duplicate" | "error";
    licenceVersionId?: string;
    contentHash?: string;
    message?: string;
  }> = [];

  for (const item of params.items) {
    try {
      const contentHash = item.contentHash || hashContent(item.extractedText || item.fileName || "");
      const existing = await hmoStorage.findLicenceVersionByHash(params.organizationId, contentHash);
      if (existing) {
        results.push({
          propertyId: item.propertyId,
          status: "duplicate",
          licenceVersionId: existing.id,
          contentHash,
          message: "Identical content_hash already stored — immutable original retained",
        });
        continue;
      }

      const extraction = await extractLicenceFromText(
        item.extractedText || "",
        contentHash.slice(0, 16),
      );
      const created = await hmoStorage.createLicenceWithVersion({
        organizationId: params.organizationId,
        propertyId: item.propertyId,
        userId: params.userId,
        fileName: item.fileName || "bulk-import.txt",
        objectUrl: item.objectUrl || null,
        contentHash,
        extraction,
      });
      results.push({
        propertyId: item.propertyId,
        status: "created",
        licenceVersionId: created.version.id,
        contentHash,
      });
    } catch (error: any) {
      results.push({
        propertyId: item.propertyId,
        status: "error",
        message: error?.message || "bulk import failed",
      });
    }
  }

  return {
    total: params.items.length,
    created: results.filter((r) => r.status === "created").length,
    duplicates: results.filter((r) => r.status === "duplicate").length,
    errors: results.filter((r) => r.status === "error").length,
    results,
  };
}
