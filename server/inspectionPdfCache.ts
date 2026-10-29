/**
 * In-memory cache for generated inspection PDFs.
 * Invalidates when inspection/entries fingerprint changes.
 */
import { createHash } from "crypto";

/** Bump when PDF layout/chrome changes so in-memory cache cannot serve stale renders. */
export const INSPECTION_PDF_RENDER_VERSION = "toc-page-numbers-v3";

export type InspectionPdfCacheFingerprint = {
  inspectionId: string;
  audience: "full" | "landlord";
  inspectionUpdatedAt?: string | Date | null;
  completedDate?: string | Date | null;
  templateId?: string | null;
  reportConfig?: unknown;
  brandingUpdatedHint?: string | null;
  entries: Array<{
    id: string;
    updatedAt?: string | Date | null;
    note?: string | null;
    photos?: string[] | null;
    valueJson?: unknown;
    markedForReview?: boolean | null;
  }>;
};

type CacheRecord = {
  key: string;
  buffer: Buffer;
  createdAt: number;
  bytes: number;
};

const MAX_ENTRIES = 24;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024; // ~256MB across cached PDFs
const TTL_MS = 45 * 60 * 1000; // 45 minutes
const cache = new Map<string, CacheRecord>();

function toIso(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function buildInspectionPdfCacheKey(fp: InspectionPdfCacheFingerprint): string {
  const payload = {
    renderVersion: INSPECTION_PDF_RENDER_VERSION,
    inspectionId: fp.inspectionId,
    audience: fp.audience,
    inspectionUpdatedAt: toIso(fp.inspectionUpdatedAt),
    completedDate: toIso(fp.completedDate),
    templateId: fp.templateId || "",
    reportConfig: fp.reportConfig ?? null,
    brandingUpdatedHint: fp.brandingUpdatedHint || "",
    entries: [...fp.entries]
      .map((e) => ({
        id: e.id,
        updatedAt: toIso(e.updatedAt),
        note: e.note || "",
        photos: e.photos || [],
        valueJson: e.valueJson ?? null,
        markedForReview: !!e.markedForReview,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function pruneExpired(now = Date.now()): void {
  for (const [key, record] of cache) {
    if (now - record.createdAt > TTL_MS) cache.delete(key);
  }
}

function totalCacheBytes(): number {
  let total = 0;
  for (const record of cache.values()) total += record.bytes;
  return total;
}

function evictOldestIfNeeded(): void {
  while (cache.size > MAX_ENTRIES || totalCacheBytes() > MAX_TOTAL_BYTES) {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [key, record] of cache) {
      if (record.createdAt < oldestAt) {
        oldestAt = record.createdAt;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;
    cache.delete(oldestKey);
    if (cache.size <= MAX_ENTRIES && totalCacheBytes() <= MAX_TOTAL_BYTES) break;
  }
}

export function getInspectionPdfCache(key: string): Buffer | null {
  pruneExpired();
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.createdAt > TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Refresh LRU order
  cache.delete(key);
  cache.set(key, hit);
  return hit.buffer;
}

export function setInspectionPdfCache(key: string, buffer: Buffer): void {
  pruneExpired();
  // Skip caching oversized single PDFs that would thrash the cache alone.
  if (buffer.length > MAX_TOTAL_BYTES) return;
  cache.set(key, {
    key,
    buffer: Buffer.from(buffer),
    createdAt: Date.now(),
    bytes: buffer.length,
  });
  evictOldestIfNeeded();
}

export function clearInspectionPdfCache(): void {
  cache.clear();
}

export function inspectionPdfCacheStats(): { size: number; totalBytes: number } {
  let totalBytes = 0;
  for (const record of cache.values()) totalBytes += record.bytes;
  return { size: cache.size, totalBytes };
}
