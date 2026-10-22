/**
 * Pure helpers for offline gallery merge + idempotent upload URLs.
 * Kept free of React Native imports so unit tests can run in Node.
 */

export type GallerySyncBadge = 'pending' | 'uploading' | 'failed' | 'synced';

export type MergableServerGalleryImage = {
  id: string;
  objectUrl: string;
  fileName?: string | null;
  mimeType?: string | null;
  createdAt?: string | null;
  assignments?: Array<{
    id: string;
    sectionRef: string;
    fieldKey: string;
    label: string;
  }>;
  captureLatitude?: number | null;
  captureLongitude?: number | null;
  addressMatchStatus?: string | null;
  propertyAddress?: string | null;
  inspectorName?: string | null;
};

export type MergableLocalGalleryImage = {
  id: string;
  localPath: string;
  serverUrl: string | null;
  syncStatus: 'pending' | 'synced' | 'failed';
  createdAt: string;
  metaJson: string | null;
};

export type MergedGalleryImage = {
  id: string;
  objectUrl: string;
  fileName: string | null;
  mimeType: string | null;
  byteSize: number | null;
  createdAt: string | null;
  propertyAddress?: string | null;
  inspectorName?: string | null;
  captureLatitude?: number | null;
  captureLongitude?: number | null;
  addressMatchStatus?: string | null;
  assignments: Array<{
    id: string;
    sectionRef: string;
    fieldKey: string;
    label: string;
  }>;
  /** Local-only display / sync state */
  _local?: {
    localPath: string;
    syncBadge: GallerySyncBadge;
    isLocalPending: boolean;
  };
};

function parseMeta(metaJson: string | null): {
  fileName?: string | null;
  mimeType?: string | null;
  captureLatitude?: number | null;
  captureLongitude?: number | null;
  pendingAssign?: { sectionRef: string; fieldKey: string } | null;
  deleted?: boolean;
  serverGalleryImageId?: string | null;
} {
  if (!metaJson) return {};
  try {
    const parsed = JSON.parse(metaJson);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Build upload-direct URL with stable objectId for idempotent retries.
 */
export function buildUploadDirectUrl(apiBase: string, objectId: string): string {
  const base = (apiBase || '').replace(/\/$/, '');
  if (!base || !objectId) {
    throw new Error('apiBase and objectId are required for upload-direct');
  }
  return `${base}/api/objects/upload-direct?objectId=${encodeURIComponent(objectId)}`;
}

/**
 * Merge server gallery images with local pending/failed gallery rows.
 * - Local pending (no serverUrl yet) appear as file:// tiles with Pending/Failed badge.
 * - Local rows already synced (have serverUrl matching a server image) are omitted to avoid dupes.
 * - Tombstoned local rows (meta.deleted) are omitted.
 */
export function mergeGalleryImages(
  serverImages: MergableServerGalleryImage[],
  localImages: MergableLocalGalleryImage[],
): MergedGalleryImage[] {
  const serverByUrl = new Map<string, MergableServerGalleryImage>();
  for (const img of serverImages) {
    if (img.objectUrl) serverByUrl.set(img.objectUrl, img);
  }

  const merged: MergedGalleryImage[] = serverImages.map((img) => ({
    id: img.id,
    objectUrl: img.objectUrl,
    fileName: img.fileName ?? null,
    mimeType: img.mimeType ?? null,
    byteSize: null,
    createdAt: img.createdAt ?? null,
    propertyAddress: img.propertyAddress,
    inspectorName: img.inspectorName,
    captureLatitude: img.captureLatitude,
    captureLongitude: img.captureLongitude,
    addressMatchStatus: img.addressMatchStatus as MergedGalleryImage['addressMatchStatus'],
    assignments: img.assignments || [],
  }));

  for (const local of localImages) {
    const meta = parseMeta(local.metaJson);
    if (meta.deleted) continue;

    // Already represented by server list
    if (local.serverUrl && serverByUrl.has(local.serverUrl)) continue;
    if (local.syncStatus === 'synced' && local.serverUrl) continue;

    const badge: GallerySyncBadge =
      local.syncStatus === 'failed' ? 'failed' : local.syncStatus === 'synced' ? 'synced' : 'pending';

    const assignments =
      meta.pendingAssign?.sectionRef && meta.pendingAssign?.fieldKey
        ? [
            {
              id: `local-assign-${local.id}`,
              sectionRef: meta.pendingAssign.sectionRef,
              fieldKey: meta.pendingAssign.fieldKey,
              label: 'Pending assign',
            },
          ]
        : [];

    merged.unshift({
      id: `local:${local.id}`,
      objectUrl: local.localPath,
      fileName: meta.fileName ?? null,
      mimeType: meta.mimeType ?? 'image/jpeg',
      byteSize: null,
      createdAt: local.createdAt,
      captureLatitude: meta.captureLatitude ?? null,
      captureLongitude: meta.captureLongitude ?? null,
      assignments,
      _local: {
        localPath: local.localPath,
        syncBadge: badge,
        isLocalPending: true,
      },
    });
  }

  return merged;
}

/** True if gallery image id is a local pending placeholder (`local:<uuid>`). */
export function isLocalGalleryImageId(id: string): boolean {
  return typeof id === 'string' && id.startsWith('local:');
}

export function localIdFromGalleryImageId(id: string): string | null {
  if (!isLocalGalleryImageId(id)) return null;
  return id.slice('local:'.length) || null;
}
